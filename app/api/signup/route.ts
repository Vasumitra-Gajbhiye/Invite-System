import { MongoServerError } from "mongodb";
import { guests } from "@/lib/db";
import { newToken, normalizePhone } from "@/lib/guests";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? "").trim();
  const email = String(body.email ?? "").trim().toLowerCase();
  const phone = normalizePhone(String(body.phone ?? ""));

  if (!name || name.length > 80) return Response.json({ error: "Enter your name." }, { status: 400 });
  if (!phone) return Response.json({ error: "Enter a valid 10-digit phone number." }, { status: 400 });
  if (!/^\S+@\S+\.\S+$/.test(email)) return Response.json({ error: "Enter a valid email." }, { status: 400 });

  const col = await guests();
  const existing = await col.findOne({ phone });
  if (existing) {
    // Lets someone who lost their link get it back, without handing it to anyone who knows the number.
    if (existing.email === email) return Response.json({ token: existing.token });
    return Response.json(
      { error: "This phone number is already registered. Use the same email you signed up with to get your invite back." },
      { status: 409 },
    );
  }

  const token = newToken();
  try {
    await col.insertOne({ token, name, phone, email, createdAt: new Date(), paid: false });
  } catch (err) {
    if (err instanceof MongoServerError && err.code === 11000) {
      return Response.json({ error: "This phone number is already registered." }, { status: 409 });
    }
    throw err;
  }
  return Response.json({ token });
}
