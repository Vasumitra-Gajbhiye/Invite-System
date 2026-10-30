import { admit } from "@/lib/door";
import { isDoorAuthed, unauthorized } from "@/lib/doorAuth";

// Polled by the door screen while an unpaid guest is paying.
export async function GET(req: Request) {
  if (!(await isDoorAuthed())) return unauthorized();
  const token = new URL(req.url).searchParams.get("token");
  if (!token) return Response.json({ result: "unknown" });
  return Response.json(await admit(token, false));
}
