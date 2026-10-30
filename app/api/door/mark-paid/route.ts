import { admit } from "@/lib/door";
import { doorVolunteer, isDoorAuthed, noVolunteer, unauthorized } from "@/lib/doorAuth";
import { markPaidManually } from "@/lib/guests";

// Cash or UPI to a personal account. `checkIn` is set from the scan screen, not from the guest list.
export async function POST(req: Request) {
  if (!(await isDoorAuthed())) return unauthorized();
  const by = await doorVolunteer();
  if (!by) return noVolunteer();
  const { token, via, checkIn } = await req.json().catch(() => ({}));
  if (typeof token !== "string" || !token) return Response.json({ result: "unknown" });
  if (via !== "cash" && via !== "personal-upi") return Response.json({ error: "Invalid method" }, { status: 400 });

  await markPaidManually(token, via, by);
  if (checkIn) return Response.json(await admit(token, false, by));
  return Response.json({ ok: true });
}
