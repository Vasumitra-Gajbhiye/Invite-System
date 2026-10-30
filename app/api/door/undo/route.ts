import { isDoorAuthed, unauthorized } from "@/lib/doorAuth";
import { undoCheckIn, undoManualPaid } from "@/lib/guests";

export async function POST(req: Request) {
  if (!(await isDoorAuthed())) return unauthorized();
  const { token, what } = await req.json().catch(() => ({}));
  if (typeof token !== "string" || !token) return Response.json({ error: "Missing token" }, { status: 400 });

  const ok = what === "payment" ? await undoManualPaid(token) : what === "checkin" ? await undoCheckIn(token) : null;
  if (ok === null) return Response.json({ error: "Invalid undo" }, { status: 400 });
  if (!ok) return Response.json({ error: "Nothing to undo. Razorpay payments can't be undone here." }, { status: 409 });
  return Response.json({ ok: true });
}
