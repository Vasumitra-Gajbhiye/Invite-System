import { FEE_PAISE } from "@/lib/config";
import { guests } from "@/lib/db";
import { razorpay } from "@/lib/razorpay";

export async function POST(req: Request) {
  const { token } = await req.json().catch(() => ({}));
  const col = await guests();
  const guest = typeof token === "string" ? await col.findOne({ token }) : null;
  if (!guest) return Response.json({ error: "Invite not found" }, { status: 404 });
  if (guest.paid) return Response.json({ alreadyPaid: true });

  const order = await razorpay().orders.create({
    amount: FEE_PAISE,
    currency: "INR",
    receipt: token.slice(0, 40),
    notes: { token, name: guest.name },
  });
  await col.updateOne({ token }, { $push: { razorpayOrderIds: order.id } });

  return Response.json({ orderId: order.id, amount: FEE_PAISE, keyId: process.env.RAZORPAY_KEY_ID });
}
