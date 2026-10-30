import { markPaid } from "@/lib/guests";
import { verifyPaymentSignature } from "@/lib/razorpay";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { token, razorpay_order_id, razorpay_payment_id, razorpay_signature } = body;
  if (
    typeof token !== "string" ||
    typeof razorpay_order_id !== "string" ||
    typeof razorpay_payment_id !== "string" ||
    typeof razorpay_signature !== "string" ||
    !verifyPaymentSignature(razorpay_order_id, razorpay_payment_id, razorpay_signature)
  ) {
    return Response.json({ error: "Invalid payment signature" }, { status: 400 });
  }

  // Order must be one we created for this guest, so a payment can't be replayed onto another invite.
  await markPaid({ token, razorpayOrderIds: razorpay_order_id }, "online", razorpay_payment_id, "checkout");
  return Response.json({ ok: true });
}
