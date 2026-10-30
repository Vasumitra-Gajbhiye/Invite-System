import { guests, type Guest, type PaidVia } from "./db";
import { getDoorPayment, syncPayment, type DoorPayment } from "./guests";

// Shown big on every result so the volunteer can check the face matches.
type Who = { token: string; name: string; rollNo: string; program: string };

export type DoorResult =
  | { result: "unknown" }
  | (Who & { result: "admitted"; paidVia?: PaidVia })
  | (Who & { result: "already"; paidVia?: PaidVia; checkedInAt: Date })
  | (Who & { result: "unpaid"; payment?: DoorPayment; paymentFailed?: boolean });

function who(g: Guest): Who {
  return { token: g.token, name: g.name, rollNo: g.rollNo, program: g.program };
}

// Checks a guest in if paid. If unpaid and `withPayment` is set, returns a ₹95 payment QR.
export async function admit(token: string, withPayment: boolean): Promise<DoorResult> {
  const col = await guests();
  let guest = await col.findOne({ token });
  if (!guest) return { result: "unknown" };

  if (!guest.paid && (await syncPayment(guest))) guest = (await col.findOne({ token }))!;

  if (!guest.paid) {
    let payment: DoorPayment | undefined;
    if (withPayment) {
      // Never block the door on Razorpay: on failure the volunteer can still mark it paid or rescan.
      payment = await getDoorPayment(guest).catch((err) => {
        console.error("Door payment create failed", err);
        return undefined;
      });
    }
    return { result: "unpaid", ...who(guest), payment, paymentFailed: withPayment && !payment };
  }

  // Atomic, so two scans of the same QR can't both get in.
  const checkedIn = await col.findOneAndUpdate(
    { token, checkedInAt: { $exists: false } },
    { $set: { checkedInAt: new Date() } },
    { returnDocument: "after" },
  );
  if (checkedIn) return { result: "admitted", ...who(guest), paidVia: guest.paidVia };

  const latest = (await col.findOne({ token }))!;
  return { result: "already", ...who(latest), paidVia: latest.paidVia, checkedInAt: latest.checkedInAt! };
}
