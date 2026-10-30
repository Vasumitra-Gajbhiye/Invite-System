import { guests } from "@/lib/db";
import { normalizeRoll } from "@/lib/guests";

// Invites are pre-created from the class roster, so this only looks one up.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const rollNo = normalizeRoll(String(body.rollNo ?? ""));
  if (!rollNo) return Response.json({ error: "Enter your 7-digit roll number." }, { status: 400 });

  const guest = await (await guests()).findOne({ rollNo });
  if (!guest) {
    return Response.json(
      { error: "That roll number isn't on the guest list. Check it, or ask the organisers." },
      { status: 404 },
    );
  }
  return Response.json({ token: guest.token });
}
