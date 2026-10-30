import { MongoClient, type Collection } from "mongodb";

export type PaidVia = "online" | "door-upi" | "door-link" | "cash" | "personal-upi";

// Payments recorded by hand rather than confirmed by Razorpay; only these can be undone at the door.
export const MANUAL_PAID_VIA: PaidVia[] = ["cash", "personal-upi"];

export type LogEntry = { at: Date; action: "paid" | "undo-paid" | "undo-checkin"; via?: PaidVia; source: string };

export type Guest = {
  token: string;
  rollNo: string;
  name: string;
  program: string;
  serial?: number;
  createdAt: Date;
  paid: boolean;
  paidAt?: Date;
  paidVia?: PaidVia;
  razorpayOrderIds?: string[];
  razorpayPaymentId?: string;
  // Door payment: either a Razorpay UPI QR or, if the QR API is unavailable, a payment link.
  doorQrId?: string;
  doorQrImage?: string;
  doorLinkId?: string;
  doorLinkUrl?: string;
  doorPaymentExpiresAt?: Date;
  checkedInAt?: Date;
  // Audit trail of manual marks and undos.
  log?: LogEntry[];
};

// Reuse one client across hot reloads and warm serverless invocations.
const globalForMongo = globalThis as unknown as {
  mongoClient?: Promise<MongoClient>;
  guestsCollection?: Promise<Collection<Guest>>;
};

function client() {
  if (!globalForMongo.mongoClient) {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error("MONGODB_URI is not set");
    globalForMongo.mongoClient = new MongoClient(uri).connect();
  }
  return globalForMongo.mongoClient;
}

export function guests() {
  if (!globalForMongo.guestsCollection) {
    globalForMongo.guestsCollection = (async () => {
      // client.db() with no name uses the database in the URI (iimb-invite).
      const col = (await client()).db().collection<Guest>("guests");
      // Keep in sync with scripts/import-roster.mjs.
      await Promise.all([
        col.createIndex({ token: 1 }, { unique: true }),
        col.createIndex({ rollNo: 1 }, { unique: true, sparse: true }),
      ]);
      return col;
    })();
  }
  return globalForMongo.guestsCollection;
}
