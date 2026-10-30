import { cookies } from "next/headers";
import { DOOR_NAME_COOKIE, isDoorAuthed, unauthorized } from "@/lib/doorAuth";

export async function POST(req: Request) {
  if (!(await isDoorAuthed())) return unauthorized();
  const { name } = await req.json().catch(() => ({}));
  const clean = typeof name === "string" ? name.trim().slice(0, 40) : "";
  if (!clean) return Response.json({ error: "Enter your name" }, { status: 400 });
  (await cookies()).set(DOOR_NAME_COOKIE, clean, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30, // outlives PIN re-logins
    path: "/",
  });
  return Response.json({ ok: true });
}
