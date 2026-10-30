import crypto from "crypto";
import QRCode from "qrcode";
import type { Filter } from "mongodb";
import { FEE_PAISE, EVENT } from "./config";
import { guests, type Guest, type PaidVia } from "./db";
import { razorpay } from "./razorpay";

export function newToken() {
  return crypto.randomBytes(18).toString("base64url"); // 24 chars
}

// Keeps the last 10 digits so "+91 98765 43210" and "9876543210" match.
export function normalizePhone(raw: string) {
  const digits = raw.replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : null;
}

// Idempotent: only the first successful payment is recorded.
export async function markPaid(filter: Filter<Guest>, via: PaidVia, paymentId?: string) {
  const col = await guests();
  await col.updateOne(
    { ...filter, paid: { $ne: true } },
    { $set: { paid: true, paidAt: new Date(), paidVia: via, razorpayPaymentId: paymentId } },
  );
}

// Asks Razorpay directly whether any of this guest's payments went through,
// in case the webhook is late or misconfigured. Returns true if now paid.
export async function syncPayment(guest: Guest) {
  if (guest.paid) return true;
  const rp = razorpay();

  try {
    if (guest.doorQrId) {
      const { items } = await rp.qrCode.fetchAllPayments(guest.doorQrId);
      const p = items.find((i) => i.status === "captured" && Number(i.amount) >= FEE_PAISE);
      if (p) {
        await markPaid({ token: guest.token }, "door-upi", p.id);
        return true;
      }
    }
    if (guest.doorLinkId) {
      const link = await rp.paymentLink.fetch(guest.doorLinkId);
      if (link.status === "paid") {
        const payments = link.payments as unknown as { payment_id: string }[] | null;
        await markPaid({ token: guest.token }, "door-link", payments?.[0]?.payment_id);
        return true;
      }
    }
    // Most recent orders first; a guest rarely opens checkout more than a couple of times.
    for (const orderId of (guest.razorpayOrderIds ?? []).slice(-3).reverse()) {
      const { items } = await rp.orders.fetchPayments(orderId);
      const p = items.find((i) => i.status === "captured");
      if (p) {
        await markPaid({ token: guest.token }, "online", p.id);
        return true;
      }
    }
  } catch (err) {
    console.error("syncPayment failed", err);
  }
  return false;
}

export type DoorPayment = { kind: "upi-qr" | "link"; image: string; expiresAt: Date };

// Creates (or reuses) a ₹95 payment for the door. Prefers a Razorpay UPI QR;
// falls back to a payment link rendered as a QR if the QR Codes API isn't enabled.
export async function getDoorPayment(guest: Guest): Promise<DoorPayment> {
  const col = await guests();
  const stillValid =
    guest.doorPaymentExpiresAt && guest.doorPaymentExpiresAt.getTime() - Date.now() > 2 * 60_000;
  if (stillValid && guest.doorQrImage) {
    return { kind: "upi-qr", image: guest.doorQrImage, expiresAt: guest.doorPaymentExpiresAt! };
  }
  if (stillValid && guest.doorLinkUrl) {
    return { kind: "link", image: await QRCode.toDataURL(guest.doorLinkUrl), expiresAt: guest.doorPaymentExpiresAt! };
  }

  const rp = razorpay();
  const expiresAt = new Date(Date.now() + 30 * 60_000);
  const closeBy = Math.floor(expiresAt.getTime() / 1000);
  const notes = { token: guest.token, name: guest.name };

  try {
    const qr = await rp.qrCode.create({
      type: "upi_qr",
      name: EVENT.name.slice(0, 40),
      usage: "single_use",
      fixed_amount: true,
      payment_amount: FEE_PAISE,
      description: `Entry: ${guest.name}`.slice(0, 100),
      close_by: closeBy,
      notes,
    });
    await col.updateOne(
      { token: guest.token },
      { $set: { doorQrId: qr.id, doorQrImage: qr.image_url, doorPaymentExpiresAt: expiresAt } },
    );
    return { kind: "upi-qr", image: qr.image_url, expiresAt };
  } catch (err) {
    console.error("QR code create failed, falling back to payment link", err);
  }

  const link = await rp.paymentLink.create({
    amount: FEE_PAISE,
    currency: "INR",
    description: `${EVENT.name} entry`,
    reference_id: `${guest.token}-${Date.now()}`,
    expire_by: closeBy,
    customer: { name: guest.name, email: guest.email, contact: guest.phone },
    notify: { sms: false, email: false },
    notes,
  });
  await col.updateOne(
    { token: guest.token },
    { $set: { doorLinkId: link.id, doorLinkUrl: link.short_url, doorPaymentExpiresAt: expiresAt } },
  );
  return { kind: "link", image: await QRCode.toDataURL(link.short_url), expiresAt };
}
