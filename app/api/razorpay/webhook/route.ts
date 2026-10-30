import { FEE_PAISE } from "@/lib/config";
import { markPaid } from "@/lib/guests";
import { verifyWebhookSignature } from "@/lib/razorpay";

type Entity = { id: string; amount?: number; order_id?: string; notes?: Record<string, string> | [] };

function noteToken(e?: Entity) {
  return e?.notes && !Array.isArray(e.notes) ? e.notes.token : undefined;
}

// Configure in Razorpay Dashboard → Webhooks with events:
// payment.captured, qr_code.credited, payment_link.paid
export async function POST(req: Request) {
  const raw = await req.text();
  const signature = req.headers.get("x-razorpay-signature") ?? "";
  if (!process.env.RAZORPAY_WEBHOOK_SECRET || !verifyWebhookSignature(raw, signature)) {
    return Response.json({ error: "Invalid signature" }, { status: 400 });
  }

  const event = JSON.parse(raw);
  const payment: Entity | undefined = event.payload?.payment?.entity;

  switch (event.event) {
    case "payment.captured": {
      if (!payment || (payment.amount ?? 0) < FEE_PAISE) break;
      if (payment.order_id) {
        await markPaid({ razorpayOrderIds: payment.order_id }, "online", payment.id, "webhook");
      }
      break;
    }
    case "qr_code.credited": {
      const qr: Entity | undefined = event.payload?.qr_code?.entity;
      if (!qr || !payment) break;
      const token = noteToken(qr);
      await markPaid(token ? { token } : { doorQrId: qr.id }, "door-upi", payment.id, "webhook");
      break;
    }
    case "payment_link.paid": {
      const link: Entity | undefined = event.payload?.payment_link?.entity;
      if (!link) break;
      const token = noteToken(link);
      await markPaid(token ? { token } : { doorLinkId: link.id }, "door-link", payment?.id, "webhook");
      break;
    }
  }

  return Response.json({ ok: true });
}
