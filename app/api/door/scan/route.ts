import { admit } from "@/lib/door";
import { isDoorAuthed, unauthorized } from "@/lib/doorAuth";

export async function POST(req: Request) {
  if (!(await isDoorAuthed())) return unauthorized();
  const { token } = await req.json().catch(() => ({}));
  if (typeof token !== "string" || !token) return Response.json({ result: "unknown" });
  return Response.json(await admit(token.trim(), true));
}
