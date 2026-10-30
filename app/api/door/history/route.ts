import { guests, type HistoryEntry } from "@/lib/db";
import { isDoorAuthed, unauthorized } from "@/lib/doorAuth";

// Newest-first feed of every guest's log, or one guest's with ?token=.
export async function GET(req: Request) {
  if (!(await isDoorAuthed())) return unauthorized();
  const token = new URL(req.url).searchParams.get("token");

  const entries = await (await guests())
    .aggregate<HistoryEntry>([
      { $match: { ...(token ? { token } : {}), "log.0": { $exists: true } } },
      { $unwind: "$log" },
      { $sort: { "log.at": -1 } },
      { $limit: 300 },
      { $replaceWith: { $mergeObjects: [{ token: "$token", name: "$name", rollNo: "$rollNo" }, "$log"] } },
    ])
    .toArray();
  return Response.json({ entries });
}
