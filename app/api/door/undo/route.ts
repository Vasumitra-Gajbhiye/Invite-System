import { doorVolunteer, isDoorAuthed, noVolunteer, unauthorized } from "@/lib/doorAuth";
import { markUnpaid, undoCheckIn } from "@/lib/guests";

export async function POST(req: Request) {
  if (!(await isDoorAuthed())) return unauthorized();
  const by = await doorVolunteer();
  if (!by) return noVolunteer();
  const { token, what } = await req.json().catch(() => ({}));
  if (typeof token !== "string" || !token) return Response.json({ error: "Missing token" }, { status: 400 });

  const ok = what === "payment" ? await markUnpaid(token, by) : what === "checkin" ? await undoCheckIn(token, by) : null;
  if (ok === null) return Response.json({ error: "Invalid undo" }, { status: 400 });
  if (!ok) return Response.json({ error: "Nothing to undo." }, { status: 409 });
  return Response.json({ ok: true });
}
