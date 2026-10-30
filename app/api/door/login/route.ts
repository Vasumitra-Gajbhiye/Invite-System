import { cookies } from "next/headers";
import { DOOR_COOKIE, doorCookieValue } from "@/lib/doorAuth";
import { safeEqual } from "@/lib/razorpay";

export async function POST(req: Request) {
  const { pin } = await req.json().catch(() => ({}));
  const expected = process.env.DOOR_PIN;
  if (!expected || typeof pin !== "string" || !safeEqual(pin, expected)) {
    await new Promise((r) => setTimeout(r, 1000)); // slow down guessing
    return Response.json({ error: "Wrong PIN" }, { status: 401 });
  }
  (await cookies()).set(DOOR_COOKIE, doorCookieValue(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 3,
    path: "/",
  });
  return Response.json({ ok: true });
}
