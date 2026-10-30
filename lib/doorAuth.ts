import { cookies } from "next/headers";
import { hmacHex, safeEqual } from "./razorpay";

export const DOOR_COOKIE = "door";

// Cookie value is derived from the PIN plus a server secret, so it can't be forged
// and changing DOOR_PIN logs every device out.
export function doorCookieValue() {
  return hmacHex(`${process.env.RAZORPAY_KEY_SECRET}:${process.env.DOOR_PIN}`, "door-access");
}

export async function isDoorAuthed() {
  // Read cookies first so pages using this are always rendered per request.
  const value = (await cookies()).get(DOOR_COOKIE)?.value;
  return !!process.env.DOOR_PIN && !!value && safeEqual(value, doorCookieValue());
}

export function unauthorized() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

export const DOOR_NAME_COOKIE = "door-name";

// Name of the volunteer using this device, recorded on everything they do at the door.
export async function doorVolunteer() {
  const name = (await cookies()).get(DOOR_NAME_COOKIE)?.value?.trim().slice(0, 40);
  return name || undefined;
}

export function noVolunteer() {
  return Response.json({ error: "Enter your name first" }, { status: 400 });
}
