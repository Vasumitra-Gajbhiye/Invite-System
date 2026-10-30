import { guests } from "@/lib/db";
import { isDoorAuthed, unauthorized } from "@/lib/doorAuth";

// Empty query lists everyone (fine for ~60 guests).
export async function GET(req: Request) {
  if (!(await isDoorAuthed())) return unauthorized();
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const filter = q
    ? { $or: [{ name: { $regex: escaped, $options: "i" } }, { phone: { $regex: escaped } }] }
    : {};

  const col = await guests();
  const [list, total, paid, checkedIn] = await Promise.all([
    col
      .find(filter, { projection: { _id: 0, token: 1, name: 1, phone: 1, paid: 1, checkedInAt: 1 } })
      .sort({ name: 1 })
      .limit(100)
      .toArray(),
    col.countDocuments(),
    col.countDocuments({ paid: true }),
    col.countDocuments({ checkedInAt: { $exists: true } }),
  ]);
  return Response.json({ guests: list, stats: { total, paid, checkedIn } });
}
