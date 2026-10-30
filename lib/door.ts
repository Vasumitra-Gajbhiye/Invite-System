import { guests } from "./db";
import { getDoorPayment, syncPayment, type DoorPayment } from "./guests";

export type DoorResult =
  | { result: "unknown" }
  | { result: "admitted"; name: string; token: string; paidVia?: string }
  | { result: "already"; name: string; token: string; checkedInAt: Date }
  | { result: "unpaid"; name: string; token: string; payment?: DoorPayment; paymentFailed?: boolean };

// Checks a guest in if paid. If unpaid and `withPayment` is set, returns a ₹95 payment QR.
export async function admit(token: string, withPayment: boolean): Promise<DoorResult> {
  const col = await guests();
  let guest = await col.findOne({ token });
  if (!guest) return { result: "unknown" };

  if (!guest.paid && (await syncPayment(guest))) guest = (await col.findOne({ token }))!;

  if (!guest.paid) {
    let payment: DoorPayment | undefined;
    if (withPayment) {
      // Never block the door on Razorpay: on failure the volunteer can still take cash or rescan.
      payment = await getDoorPayment(guest).catch((err) => {
        console.error("Door payment create failed", err);
        return undefined;
      });
    }
    return { result: "unpaid", name: guest.name, token, payment, paymentFailed: withPayment && !payment };
  }

  // Atomic, so two scans of the same QR can't both get in.
  const checkedIn = await col.findOneAndUpdate(
    { token, checkedInAt: { $exists: false } },
    { $set: { checkedInAt: new Date() } },
    { returnDocument: "after" },
  );
  if (checkedIn) return { result: "admitted", name: guest.name, token, paidVia: guest.paidVia };

  const latest = (await col.findOne({ token }))!;
  return { result: "already", name: guest.name, token, checkedInAt: latest.checkedInAt! };
}
