import crypto from "crypto";
import Razorpay from "razorpay";

let instance: Razorpay | undefined;

export function razorpay() {
  if (!instance) {
    instance = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID!,
      key_secret: process.env.RAZORPAY_KEY_SECRET!,
    });
  }
  return instance;
}

export function hmacHex(secret: string, message: string) {
  return crypto.createHmac("sha256", secret).update(message).digest("hex");
}

export function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

// Signature returned by Checkout after a successful payment.
export function verifyPaymentSignature(orderId: string, paymentId: string, signature: string) {
  const expected = hmacHex(process.env.RAZORPAY_KEY_SECRET!, `${orderId}|${paymentId}`);
  return safeEqual(expected, signature);
}

export function verifyWebhookSignature(rawBody: string, signature: string) {
  const expected = hmacHex(process.env.RAZORPAY_WEBHOOK_SECRET!, rawBody);
  return safeEqual(expected, signature);
}
