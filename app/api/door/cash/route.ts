import { admit } from "@/lib/door";
import { isDoorAuthed, unauthorized } from "@/lib/doorAuth";
import { markPaid } from "@/lib/guests";

export async function POST(req: Request) {
  if (!(await isDoorAuthed())) return unauthorized();
  const { token } = await req.json().catch(() => ({}));
  if (typeof token !== "string" || !token) return Response.json({ result: "unknown" });
  await markPaid({ token }, "cash");
  return Response.json(await admit(token, false));
}
