import { guests } from "@/lib/db";
import { isDoorAuthed, unauthorized } from "@/lib/doorAuth";

function cell(v: unknown) {
  const s = v instanceof Date ? v.toISOString() : v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Full status sheet for reconciling against UPI apps and the roster.
export async function GET() {
  if (!(await isDoorAuthed())) return unauthorized();
  const list = await (await guests()).find().sort({ program: 1, serial: 1 }).toArray();

  const header = ["program", "serial", "rollNo", "name", "paid", "paidVia", "paidAt", "razorpayPaymentId", "checkedInAt", "log"];
  const rows = list.map((g) => [
    g.program,
    g.serial,
    g.rollNo,
    g.name,
    g.paid ? "yes" : "no",
    g.paidVia,
    g.paidAt,
    g.razorpayPaymentId,
    g.checkedInAt,
    (g.log ?? []).map((l) => `${l.at.toISOString()} ${l.action}${l.via ? ` ${l.via}` : ""} (${l.source})`).join("; "),
  ]);
  const csv = [header, ...rows].map((r) => r.map(cell).join(",")).join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="guests-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
