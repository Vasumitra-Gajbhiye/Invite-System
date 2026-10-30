// Syncs the class roster CSV into the guests collection.
//
//   node --env-file=.env scripts/import-roster.mjs [csv] [--apply] [--wipe]
//
// Dry run by default: prints what would change. --apply writes (after backing up to backups/).
// --wipe also deletes guests that aren't from the roster (old phone/email signups).
// CSV columns, no header needed: program, serial, rollNo, name, paid ("Paid" or blank).
// Never marks anyone unpaid, so rerunning after Razorpay/door payments is safe.

import crypto from "crypto";
import fs from "fs";
import path from "path";
import { MongoClient } from "mongodb";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const wipe = args.includes("--wipe");
const csvPath = args.find((a) => !a.startsWith("--")) ?? "data/roster.csv";

const RAZORPAY_VIA = ["online", "door-upi", "door-link"];

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
console.log(`Roster: ${roster.length} students, ${roster.filter((r) => r.paid).length} marked Paid (${csvPath})`);

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error("MONGODB_URI is not set");
const client = await new MongoClient(uri).connect();
const col = client.db().collection("guests");
console.log(`Database: ${client.db().databaseName}${apply ? "" : " (dry run, nothing will be written)"}\n`);

try {
  const existing = await col.find().toArray();
  const byRoll = new Map(existing.filter((g) => g.rollNo).map((g) => [g.rollNo, g]));
  const legacy = existing.filter((g) => !g.rollNo);

  if (legacy.length) {
    console.log(`${legacy.length} old signups without a roll number:`);
    for (const g of legacy) console.log(`  ${g.name} · ${g.phone ?? ""} · ${g.paid ? `PAID ${g.paidVia}` : "unpaid"}`);
    const razorpayPaid = legacy.filter((g) => g.paid && RAZORPAY_VIA.includes(g.paidVia));
    if (razorpayPaid.length) {
      console.log(`\n⚠️  ${razorpayPaid.length} of them paid through Razorpay. Re-mark these after the wipe:`);
      for (const g of razorpayPaid) console.log(`  ${g.name} · ${g.paidVia} · ${g.razorpayPaymentId ?? "no payment id"}`);
    }
    if (!wipe) {
      console.log("\nRerun with --wipe to delete them. Stopping so they don't sit alongside the roster.");
      process.exitCode = 1;
      throw new Error("old signups present");
    }
    console.log();
  }

  const toInsert = roster.filter((r) => !byRoll.has(r.rollNo));
  const toRename = roster.filter((r) => {
    const g = byRoll.get(r.rollNo);
    return g && (g.name !== r.name || g.program !== r.program || g.serial !== r.serial);
  });
  const toMarkPaid = roster.filter((r) => r.paid && !byRoll.get(r.rollNo)?.paid);
  const paidButBlank = roster.filter((r) => !r.paid && byRoll.get(r.rollNo)?.paid);
  const notInRoster = [...byRoll.values()].filter((g) => !roster.some((r) => r.rollNo === g.rollNo));

  console.log(`New guests:            ${toInsert.length}`);
  console.log(`Name/program updates:  ${toRename.length}`);
  for (const r of toRename) console.log(`  ${r.rollNo}: ${byRoll.get(r.rollNo).name} → ${r.name}`);
  console.log(`Newly marked paid:     ${toMarkPaid.length}`);
  console.log(`Paid in DB, blank in sheet (left as paid): ${paidButBlank.length}`);
  for (const r of paidButBlank) console.log(`  ${r.rollNo} ${r.name} · ${byRoll.get(r.rollNo).paidVia}`);
  if (notInRoster.length) {
    console.log(`In DB but not in sheet (left alone): ${notInRoster.length}`);
    for (const g of notInRoster) console.log(`  ${g.rollNo} ${g.name}`);
  }

  if (!apply) {
    console.log("\nDry run. Rerun with --apply to write.");
  } else {
    fs.mkdirSync("backups", { recursive: true });
    const backup = path.join("backups", `guests-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    fs.writeFileSync(backup, JSON.stringify(existing, null, 2));
    console.log(`\nBacked up ${existing.length} guests to ${backup}`);

    if (wipe && legacy.length) {
      const { deletedCount } = await col.deleteMany({ rollNo: { $exists: false } });
      console.log(`Deleted ${deletedCount} old signups`);
    }

    // The old schema had a unique phone index; roster guests have no phone, so it must go.
    // Throws if the collection doesn't exist yet (fresh database).
    const indexes = await col.indexes().catch(() => []);
    if (indexes.some((i) => i.name === "phone_1")) {
      await col.dropIndex("phone_1");
      console.log("Dropped phone_1 index");
    }
    // Keep in sync with lib/db.ts.
    await col.createIndex({ token: 1 }, { unique: true });
    await col.createIndex({ rollNo: 1 }, { unique: true, sparse: true });

    const now = new Date();
    await col.bulkWrite(
      roster.map((r) => ({
        updateOne: {
          filter: { rollNo: r.rollNo },
          update: {
            $set: { name: r.name, program: r.program, serial: r.serial },
            $setOnInsert: { token: crypto.randomBytes(18).toString("base64url"), createdAt: now, paid: false },
          },
          upsert: true,
        },
      })),
    );
    if (toMarkPaid.length) {
      await col.bulkWrite(
        toMarkPaid.map((r) => ({
          updateOne: {
            filter: { rollNo: r.rollNo, paid: { $ne: true } },
            update: {
              $set: { paid: true, paidAt: now, paidVia: "personal-upi" },
              $push: { log: { at: now, action: "paid", via: "personal-upi", source: "roster" } },
            },
          },
        })),
      );
    }
    const [total, paid] = await Promise.all([col.countDocuments(), col.countDocuments({ paid: true })]);
    console.log(`Done. ${total} guests, ${paid} paid.`);
  }
} catch (err) {
  if (err.message !== "old signups present") throw err;
} finally {
  await client.close();
}
