import { guests } from "@/lib/db";
import { isDoorAuthed, unauthorized } from "@/lib/doorAuth";

// Empty query lists everyone (fine for ~80 guests).
export async function GET(req: Request) {
  if (!(await isDoorAuthed())) return unauthorized();
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const filter = q
    ? { $or: [{ name: { $regex: escaped, $options: "i" } }, { rollNo: { $regex: escaped } }] }
    : {};

  const col = await guests();
  const [list, byProgram] = await Promise.all([
    col
      .find(filter, {
        projection: { _id: 0, token: 1, rollNo: 1, name: 1, program: 1, paid: 1, paidVia: 1, checkedInAt: 1 },
      })
      .sort({ name: 1 })
      .limit(100)
      .toArray(),
    col
      .aggregate<{ _id: string; total: number; paid: number; checkedIn: number }>([
        {
          $group: {
            _id: "$program",
            total: { $sum: 1 },
            paid: { $sum: { $cond: ["$paid", 1, 0] } },
            checkedIn: { $sum: { $cond: [{ $ifNull: ["$checkedInAt", false] }, 1, 0] } },
          },
        },
        { $sort: { _id: 1 } },
      ])
      .toArray(),
  ]);
  const stats = byProgram.map(({ _id, ...s }) => ({ program: _id, ...s }));
  return Response.json({ guests: list, stats });
}
