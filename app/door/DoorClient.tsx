"use client";

import { Scanner } from "@yudiel/react-qr-scanner";
import { useCallback, useEffect, useRef, useState } from "react";
import type { DoorResult } from "@/lib/door";
import type { HistoryEntry, LogAction, PaidVia } from "@/lib/db";

type GuestRow = {
  token: string;
  rollNo: string;
  name: string;
  program: string;
  paid: boolean;
  paidVia?: PaidVia;
  checkedInAt?: string;
};
type Stats = { program: string; total: number; paid: number; checkedIn: number };
type Who = { token: string; name: string; rollNo: string };
type Ask = { title: string; detail?: string; confirmLabel: string; run: () => Promise<void> };
// `who` is set for one guest's history, unset for the whole door.
type History = { who?: Who; entries: HistoryEntry[] | null };

const COLORS = { admitted: "#1a7f37", already: "#d97706", unpaid: "#c00", unknown: "#555" };
// Mirrors MANUAL_PAID_VIA; lib/db can't be imported as a value here since it pulls in the Mongo client.
const MANUAL: (PaidVia | undefined)[] = ["cash", "personal-upi"];
const VIA_LABEL: Record<"cash" | "personal-upi", string> = { cash: "cash", "personal-upi": "personal UPI" };
const PAY_CHIP: Record<PaidVia, { label: string; color: string }> = {
  online: { label: "Online", color: "#1a7f37" },
  "door-upi": { label: "Door UPI", color: "#1a7f37" },
  "door-link": { label: "Door link", color: "#1a7f37" },
  cash: { label: "Cash", color: "#9a5b00" },
  "personal-upi": { label: "Personal UPI", color: "#1d4ed8" },
};
const ACTION_LABEL: Record<LogAction, string> = {
  paid: "Paid",
  unpaid: "Marked unpaid",
  "undo-paid": "Undo payment",
  "check-in": "Checked in",
  "undo-checkin": "Undo check-in",
  "payment-qr": "Payment QR shown",
};
const FULL = { width: "100%", display: "block" } as const;
const OVERLAY = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.6)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 16,
  zIndex: 10,
} as const;

// "Paid · Door UPI (webhook)", "Marked unpaid (was Online) · by Asha"
function describe(e: HistoryEntry) {
  const via = e.via ? PAY_CHIP[e.via].label : null;
  let s = ACTION_LABEL[e.action];
  if (e.action === "paid" && via) s += ` · ${via}`;
  if (e.action === "unpaid" && via) s += ` (was ${via})`;
  if (e.source !== "door") s += ` (${e.source})`;
  if (e.by) s += ` · by ${e.by}`;
  return s;
}

type Filter = "all" | "notIn" | "in" | "unpaid";
const FILTERS: { key: Filter; label: string; match: (g: GuestRow) => boolean }[] = [
  { key: "all", label: "All", match: () => true },
  { key: "notIn", label: "Not in", match: (g) => !g.checkedInAt },
  { key: "in", label: "In", match: (g) => !!g.checkedInAt },
  { key: "unpaid", label: "Unpaid", match: (g) => !g.paid },
];

function Chip({ label, color, outline }: { label: string; color: string; outline?: boolean }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 999,
        fontSize: 13,
        whiteSpace: "nowrap",
        border: `1px solid ${color}`,
        background: outline ? "transparent" : color,
        color: outline ? color : "white",
      }}
    >
      {label}
    </span>
  );
}

async function postJson(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.status === 401) location.reload();
  const data = await res.json();
  if (!res.ok && data.error) alert(data.error);
  return data;
}

// "BSc Honours - Data Science" -> "Data Science"
function shortProgram(p: string) {
  return p.replace(/^BSc Honours - /, "");
}

// Asked once per device so every action in History says who did it.
function NameForm({ current, onCancel }: { current?: string; onCancel?: () => void }) {
  const [name, setName] = useState(current ?? "");
  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const data = await postJson("/api/door/name", { name });
    if (data.ok) location.reload();
  }
  return (
    <form onSubmit={onSubmit}>
      <h1>Door</h1>
      <p>Your name, so History shows who did what on this phone.</p>
      <input placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} autoFocus />
      <button type="submit">Continue</button>
      {onCancel && (
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      )}
    </form>
  );
}

export default function DoorClient({ fee, volunteer }: { fee: number; volunteer?: string }) {
  const [renaming, setRenaming] = useState(false);
  if (!volunteer || renaming) return <NameForm current={volunteer} onCancel={volunteer ? () => setRenaming(false) : undefined} />;
  return <Door fee={fee} volunteer={volunteer} onRename={() => setRenaming(true)} />;
}

function Door({ fee, volunteer, onRename }: { fee: number; volunteer: string; onRename: () => void }) {
  const [result, setResult] = useState<DoorResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState<Ask | null>(null);
  const [query, setQuery] = useState("");
  const [list, setList] = useState<GuestRow[]>([]);
  const [stats, setStats] = useState<Stats[]>([]);
  const [refresh, setRefresh] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [history, setHistory] = useState<History | null>(null);
  const busyRef = useRef(false);

  const scan = useCallback(async (raw: string) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    // Accept a bare token or a URL ending in the token.
    const token = raw.trim().split("/").pop() ?? "";
    try {
      setResult(await postJson("/api/door/scan", { token }));
    } catch {
      setResult({ result: "unknown" });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, []);

  const search = useCallback(async (q: string) => {
    const res = await fetch(`/api/door/search?q=${encodeURIComponent(q)}`);
    if (res.status === 401) return location.reload();
    const data = await res.json();
    setList(data.guests);
    setStats(data.stats);
  }, []);

  // Refresh list + counts whenever the result screen changes or something is marked.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    search(query);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, refresh, search]);

  // While someone is paying at the door, poll until Razorpay confirms.
  const pendingToken = result?.result === "unpaid" ? result.token : null;
  useEffect(() => {
    if (!pendingToken) return;
    const id = setInterval(async () => {
      const res = await fetch(`/api/door/status?token=${encodeURIComponent(pendingToken)}`);
      const data: DoorResult = await res.json();
      if (data.result !== "unpaid") setResult(data);
    }, 2500);
    return () => clearInterval(id);
  }, [pendingToken]);

  // From the scan screen this also checks them in; from the list it only records the payment.
  function askMarkPaid(g: Who, via: "cash" | "personal-upi", checkIn: boolean) {
    setAsk({
      title: `Mark ${g.name} (${g.rollNo}) as PAID ₹${fee} via ${VIA_LABEL[via]}?`,
      detail: `Only confirm once you've seen the money arrive${checkIn ? ". This also lets them in." : "."}`,
      confirmLabel: "Yes, mark paid",
      run: async () => {
        const data = await postJson("/api/door/mark-paid", { token: g.token, via, checkIn });
        if (checkIn) setResult(data);
        else setRefresh((n) => n + 1);
      },
    });
  }

  function askMarkUnpaid(g: Who, via?: PaidVia) {
    const manual = !via || MANUAL.includes(via);
    setAsk({
      title: `Mark ${g.name} (${g.rollNo}) as UNPAID?`,
      detail: manual
        ? "They'll show as unpaid and their check-in is cleared too."
        : `They paid ₹${fee} through Razorpay. This does NOT refund it: refund from the Razorpay dashboard if needed. Their check-in is cleared and they'll be asked to pay again.`,
      confirmLabel: "Yes, mark unpaid",
      run: async () => {
        await postJson("/api/door/undo", { token: g.token, what: "payment" });
        setResult(null);
        setRefresh((n) => n + 1);
      },
    });
  }

  function askUndoCheckIn(g: Who) {
    setAsk({
      title: `Undo check-in for ${g.name} (${g.rollNo})?`,
      detail: "Use this if the wrong person was let in on their QR. Their pass works again.",
      confirmLabel: "Yes, undo check-in",
      run: async () => {
        await postJson("/api/door/undo", { token: g.token, what: "checkin" });
        setResult(null);
        setRefresh((n) => n + 1);
      },
    });
  }

  // Whole-door feed, or one guest's when `g` is given.
  async function showHistory(g?: Who) {
    setHistory({ who: g, entries: null });
    const res = await fetch(`/api/door/history${g ? `?token=${encodeURIComponent(g.token)}` : ""}`);
    if (res.status === 401) return location.reload();
    const { entries } = await res.json();
    setHistory({ who: g, entries });
  }

  async function confirmAsk() {
    if (!ask) return;
    setBusy(true);
    try {
      await ask.run();
    } finally {
      setAsk(null);
      setBusy(false);
    }
  }

  // Opens the result card for a guest picked from the list.
  function openFromList(token: string) {
    setOpen(null);
    window.scrollTo({ top: 0 });
    scan(token);
  }

  const totalIn = stats.reduce((n, s) => n + s.checkedIn, 0);
  const total = stats.reduce((n, s) => n + s.total, 0);
  const shown = list.filter(FILTERS.find((f) => f.key === filter)!.match);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <h1 style={{ margin: "0 0 4px" }}>Door</h1>
        <button onClick={() => showHistory()} style={{ width: "auto", margin: 0 }}>
          History
        </button>
      </div>
      <p style={{ margin: "0 0 4px", fontSize: 13, color: "var(--bone-dim)" }}>
        You: <b>{volunteer}</b> ·{" "}
        <button
          onClick={onRename}
          style={{ width: "auto", margin: 0, padding: 0, border: "none", background: "none", color: "inherit", textDecoration: "underline", fontSize: 13 }}
        >
          change
        </button>
      </p>
      <p style={{ margin: "0 0 8px", fontSize: 13, color: "var(--bone-dim)" }}>
        <b>All {totalIn}/{total} in</b>
        {stats.map((s) => (
          <span key={s.program}>
            {" | "}
            {shortProgram(s.program)} {s.checkedIn}/{s.total} in · {s.paid} paid
          </span>
        ))}
      </p>

      {history && (
        <div role="dialog" style={OVERLAY}>
          <div
            style={{ background: "var(--panel)", color: "var(--bone)", padding: 16, maxWidth: 520, width: "100%", maxHeight: "100%", overflowY: "auto" }}
          >
            <h2 style={{ marginTop: 0 }}>
              {history.who ? `History: ${history.who.name} (${history.who.rollNo})` : "History"}
            </h2>
            {!history.entries ? (
              <p>Loading…</p>
            ) : history.entries.length === 0 ? (
              <p>Nothing yet.</p>
            ) : (
              <ul style={{ paddingLeft: 0, margin: 0, listStyle: "none", fontSize: 14 }}>
                {history.entries.map((e, i) => (
                  <li key={i} style={{ padding: "6px 0", borderBottom: "1px solid var(--line)" }}>
                    <span style={{ color: "var(--bone-dim)" }}>{new Date(e.at).toLocaleTimeString()}</span>
                    {!history.who && (
                      <>
                        {" "}
                        <b>{e.name}</b> ({e.rollNo})
                      </>
                    )}
                    <br />
                    {describe(e)}
                  </li>
                ))}
              </ul>
            )}
            <button
              onClick={() => showHistory(history.who)}
              disabled={!history.entries}
              style={FULL}
            >
              Refresh
            </button>
            <button onClick={() => setHistory(null)} style={{ ...FULL, fontWeight: "bold" }}>
              Close
            </button>
          </div>
        </div>
      )}

      {ask && (
        <div role="dialog" style={OVERLAY}>
          <div style={{ background: "var(--panel)", color: "var(--bone)", padding: 16, maxWidth: 420, width: "100%" }}>
            <h2 style={{ marginTop: 0 }}>{ask.title}</h2>
            {ask.detail && <p>{ask.detail}</p>}
            <button onClick={confirmAsk} disabled={busy} style={{ width: "100%", fontWeight: "bold" }}>
              {busy ? "Saving…" : ask.confirmLabel}
            </button>
            <button onClick={() => setAsk(null)} disabled={busy} style={{ width: "100%" }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {!result && (
        <div style={{ width: "100%" }}>
          <Scanner
            onScan={(codes) => codes[0] && scan(codes[0].rawValue)}
            onError={(e) => console.error(e)}
            formats={["qr_code"]}
            paused={busy || !!ask}
            constraints={{ facingMode: "environment" }}
          />
          {busy && <p>Checking…</p>}
        </div>
      )}

      {result && (
        <div style={{ background: COLORS[result.result], color: "white", padding: 16, margin: "12px 0" }}>
          {result.result === "unknown" ? (
            <h2>❓ Not a valid invite</h2>
          ) : (
            <>
              <h2 style={{ margin: 0 }}>
                {result.result === "admitted" && "✅ LET IN"}
                {result.result === "already" && "⚠️ ALREADY CHECKED IN"}
                {result.result === "unpaid" && "🔴 NOT PAID"}
              </h2>
              <p style={{ fontSize: 28, fontWeight: "bold", margin: "8px 0 0" }}>{result.name}</p>
              <p style={{ margin: "0 0 8px" }}>
                {result.rollNo} · {shortProgram(result.program)}
                {result.result !== "unpaid" && result.paidVia ? ` · paid via ${result.paidVia}` : ""}
              </p>
            </>
          )}
          {result.result === "already" && <p>Checked in at {new Date(result.checkedInAt).toLocaleTimeString()}</p>}
          {(result.result === "admitted" || result.result === "already") && (
            <>
              <button onClick={() => askUndoCheckIn(result)} style={FULL}>
                Wrong person? Undo check-in
              </button>
              <button onClick={() => askMarkUnpaid(result, result.paidVia)} style={FULL}>
                Mark unpaid
              </button>
            </>
          )}
          {result.result === "unpaid" && (
            <div>
              <p>Ask them to scan and pay ₹{fee}. This screen turns green when payment lands.</p>
              {result.payment && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={result.payment.image} alt="Payment QR" style={{ width: "100%", background: "white" }} />
              )}
              {result.paymentFailed && (
                <p>Couldn&apos;t create a payment QR. Tap Next guest and rescan, or take UPI/cash below.</p>
              )}
              <p>Paid some other way?</p>
              <button onClick={() => askMarkPaid(result, "personal-upi", true)} style={FULL}>
                Paid via personal UPI
              </button>
              <button onClick={() => askMarkPaid(result, "cash", true)} style={FULL}>
                Paid cash
              </button>
            </div>
          )}
        </div>
      )}
      {result && (
        <button onClick={() => setResult(null)} style={{ ...FULL, fontWeight: "bold" }}>
          Next guest
        </button>
      )}

      <div style={{ position: "sticky", top: 0, background: "var(--page)", zIndex: 5, padding: "8px 0 4px" }}>
        <input
          placeholder="Find guest: name or roll number"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            search(e.target.value);
          }}
        />
        <div style={{ display: "flex", gap: 6, overflowX: "auto" }}>
          {FILTERS.map((f) => {
            const on = f.key === filter;
            return (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                style={{
                  flex: "1 0 auto",
                  borderRadius: 999,
                  border: "1px solid var(--bone)",
                  padding: "4px 10px",
                  fontSize: 14,
                  background: on ? "var(--bone)" : "transparent",
                  color: on ? "var(--ink)" : "var(--bone)",
                }}
              >
                {f.label} {list.filter(f.match).length}
              </button>
            );
          })}
        </div>
      </div>

      <ul style={{ paddingLeft: 0, margin: 0, listStyle: "none" }}>
        {shown.map((g) => {
          const isOpen = open === g.token;
          const pay = g.paid && g.paidVia ? PAY_CHIP[g.paidVia] : null;
          return (
            <li key={g.token} style={{ borderBottom: "1px solid var(--line)" }}>
              <button
                onClick={() => setOpen(isOpen ? null : g.token)}
                aria-expanded={isOpen}
                style={{
                  ...FULL,
                  margin: 0,
                  padding: "10px 0",
                  minHeight: 48,
                  border: "none",
                  background: "none",
                  color: "inherit",
                  textAlign: "left",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                }}
              >
                <b style={{ overflowWrap: "anywhere" }}>{g.name}</b>
                <span style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                  {pay ? (
                    <Chip label={pay.label} color={pay.color} />
                  ) : g.paid ? (
                    <Chip label="Paid" color="#1a7f37" />
                  ) : (
                    <Chip label="Unpaid" color={COLORS.unpaid} />
                  )}
                  {g.checkedInAt ? (
                    <Chip label="✓ In" color={COLORS.admitted} />
                  ) : (
                    <Chip label="Not in" color="#777" outline />
                  )}
                </span>
              </button>
              {isOpen && (
                <div style={{ paddingBottom: 8 }}>
                  {g.checkedInAt && (
                    <p style={{ margin: "0 0 4px", fontSize: 14 }}>
                      Checked in at {new Date(g.checkedInAt).toLocaleTimeString()}
                    </p>
                  )}
                  {g.paid && !g.checkedInAt && (
                    <button onClick={() => openFromList(g.token)} style={{ ...FULL, fontWeight: "bold" }}>
                      Check in
                    </button>
                  )}
                  {g.checkedInAt && (
                    <button onClick={() => askUndoCheckIn(g)} style={FULL}>
                      Undo check-in
                    </button>
                  )}
                  {g.paid && (
                    <button onClick={() => askMarkUnpaid(g, g.paidVia)} style={FULL}>
                      Mark unpaid
                    </button>
                  )}
                  {!g.paid && (
                    <>
                      <button onClick={() => openFromList(g.token)} style={{ ...FULL, fontWeight: "bold" }}>
                        Take payment (show QR)
                      </button>
                      <button onClick={() => askMarkPaid(g, "personal-upi", false)} style={FULL}>
                        Mark paid: personal UPI
                      </button>
                      <button onClick={() => askMarkPaid(g, "cash", false)} style={FULL}>
                        Mark paid: cash
                      </button>
                    </>
                  )}
                  <button onClick={() => showHistory(g)} style={FULL}>
                    History
                  </button>
                </div>
              )}
            </li>
          );
        })}
        {shown.length === 0 && <li style={{ padding: "12px 0", color: "var(--bone-dim)" }}>No guests match.</li>}
      </ul>

      <p>
        <a href="/api/door/export">Download status CSV</a>
      </p>
    </div>
  );
}
