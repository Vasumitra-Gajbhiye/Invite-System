// Resets the guests collection to exactly what the roster CSV says, wiping test marks.
//
//   node --env-file=.env scripts/reset-to-roster.mjs [csv] [--apply]
//
// Dry run by default. --apply backs up to backups/ first, then for every guest:
// - payment comes from the sheet ("Paid" = personal-upi, blank = unpaid), including Razorpay and door payments
// - check-ins, the audit log and pending Razorpay orders/QRs are cleared
// - name/program/serial come from the sheet
// Invite tokens are kept, so links already sent still work. Students missing from the
// DB are added; guests not in the sheet are deleted.

import crypto from "crypto";
import fs from "fs";
import path from "path";
import { MongoClient } from "mongodb";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const csvPath = args.find((a) => !a.startsWith("--")) ?? "data/roster.csv";

const RAZORPAY_VIA = ["online", "door-upi", "door-link"];

// Same format as scripts/import-roster.mjs.
function parseRoster(file) {
  const rows = [];
  const seen = new Set();
  for (const [i, line] of fs.readFileSync(file, "utf8").split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    const [program, serial, rollNo, name, paid] = line.split(",").map((c) => c.trim());
    if (!/^\d{7}$/.test(rollNo ?? "")) {
      console.warn(`Skipping line ${i + 1}: ${line}`);
      continue;
    }
    if (seen.has(rollNo)) throw new Error(`Duplicate roll number ${rollNo} on line ${i + 1}`);
    seen.add(rollNo);
    rows.push({ program, serial: Number(serial), rollNo, name, paid: /^paid$/i.test(paid ?? "") });
  }
  return rows;
}

const roster = parseRoster(csvPath);
const rosterByRoll = new Map(roster.map((r) => [r.rollNo, r]));
console.log(`Roster: ${roster.length} students, ${roster.filter((r) => r.paid).length} marked Paid (${csvPath})`);

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error("MONGODB_URI is not set");
const client = await new MongoClient(uri).connect();
const col = client.db().collection("guests");
console.log(`Database: ${client.db().databaseName}${apply ? "" : " (dry run, nothing will be written)"}\n`);

function differs(g, r) {
  const reasons = [];
  if (!!g.paid !== r.paid) reasons.push(r.paid ? "unpaid → paid" : `paid (${g.paidVia}) → unpaid`);
  else if (r.paid && g.paidVia !== "personal-upi") reasons.push(`paid via ${g.paidVia} → personal-upi`);
  if (g.checkedInAt) reasons.push("clear check-in");
  if (g.name !== r.name) reasons.push(`name "${g.name}" → "${r.name}"`);
  if (g.program !== r.program || g.serial !== r.serial) reasons.push("program/serial");
  return reasons;
}

try {
  const existing = await col.find().toArray();
  const byRoll = new Map(existing.filter((g) => g.rollNo).map((g) => [g.rollNo, g]));

  const toDelete = existing.filter((g) => !g.rollNo || !rosterByRoll.has(g.rollNo));
  const toInsert = roster.filter((r) => !byRoll.has(r.rollNo));
  const changes = roster
    .filter((r) => byRoll.has(r.rollNo))
    .map((r) => ({ r, reasons: differs(byRoll.get(r.rollNo), r) }))
    .filter((c) => c.reasons.length);
  const razorpayLost = existing.filter(
    (g) => g.paid && RAZORPAY_VIA.includes(g.paidVia) && !rosterByRoll.get(g.rollNo)?.paid,
  );

  console.log(`Changes to existing guests: ${changes.length}`);
  for (const { r, reasons } of changes) console.log(`  ${r.rollNo} ${r.name}: ${reasons.join(", ")}`);
  console.log(`Missing, will be added: ${toInsert.length}`);
  for (const r of toInsert) console.log(`  ${r.rollNo} ${r.name}`);
  console.log(`Not in sheet, will be deleted: ${toDelete.length}`);
  for (const g of toDelete) console.log(`  ${g.rollNo ?? "(no roll)"} ${g.name}`);
  if (razorpayLost.length) {
    console.log(`\n⚠️  ${razorpayLost.length} Razorpay payment(s) will be wiped. Refund them or add "Paid" to the sheet:`);
    for (const g of razorpayLost) console.log(`  ${g.rollNo ?? ""} ${g.name} · ${g.paidVia} · ${g.razorpayPaymentId ?? "no payment id"}`);
  }

  if (!apply) {
    console.log("\nDry run. Rerun with --apply to write.");
  } else {
    fs.mkdirSync("backups", { recursive: true });
    const backup = path.join("backups", `guests-before-reset-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    fs.writeFileSync(backup, JSON.stringify(existing, null, 2));
    console.log(`\nBacked up ${existing.length} guests to ${backup}`);

    if (toDelete.length) {
      const { deletedCount } = await col.deleteMany({ _id: { $in: toDelete.map((g) => g._id) } });
      console.log(`Deleted ${deletedCount}`);
    }

    const now = new Date();
    await col.bulkWrite(
      roster.map((r) => ({
        updateOne: {
          filter: { rollNo: r.rollNo },
          update: {
            $set: {
              name: r.name,
              program: r.program,
              serial: r.serial,
              paid: r.paid,
              ...(r.paid && { paidAt: now, paidVia: "personal-upi" }),
              log: r.paid ? [{ at: now, action: "paid", via: "personal-upi", source: "roster-reset" }] : [],
            },
            $unset: {
              ...(!r.paid && { paidAt: "", paidVia: "" }),
              checkedInAt: "",
              razorpayOrderIds: "",
              razorpayPaymentId: "",
              doorQrId: "",
              doorQrImage: "",
              doorLinkId: "",
              doorLinkUrl: "",
              doorPaymentExpiresAt: "",
            },
            $setOnInsert: { token: crypto.randomBytes(18).toString("base64url"), createdAt: now },
          },
          upsert: true,
        },
      })),
    );

    const [total, paid, checkedIn] = await Promise.all([
      col.countDocuments(),
      col.countDocuments({ paid: true }),
      col.countDocuments({ checkedInAt: { $exists: true } }),
    ]);
    console.log(`Done. ${total} guests, ${paid} paid, ${checkedIn} checked in.`);
  }
} finally {
  await client.close();
}
