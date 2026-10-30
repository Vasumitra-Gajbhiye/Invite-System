"use client";

import { Scanner } from "@yudiel/react-qr-scanner";
import { useCallback, useEffect, useRef, useState } from "react";
import type { DoorResult } from "@/lib/door";
import type { PaidVia } from "@/lib/db";

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

const COLORS = { admitted: "#1a7f37", already: "#d97706", unpaid: "#c00", unknown: "#555" };
const MANUAL: (PaidVia | undefined)[] = ["cash", "personal-upi"];
const VIA_LABEL: Record<"cash" | "personal-upi", string> = { cash: "cash", "personal-upi": "personal UPI" };

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

export default function DoorClient({ fee }: { fee: number }) {
  const [result, setResult] = useState<DoorResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState<Ask | null>(null);
  const [query, setQuery] = useState("");
  const [list, setList] = useState<GuestRow[]>([]);
  const [stats, setStats] = useState<Stats[]>([]);
  const [refresh, setRefresh] = useState(0);
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

  function askUndoPaid(g: Who) {
    setAsk({
      title: `Undo payment for ${g.name} (${g.rollNo})?`,
      detail: "They'll show as unpaid and their check-in is cleared too.",
      confirmLabel: "Yes, undo payment",
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
      },
    });
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

  return (
    <div>
      <h1>Door</h1>
      {stats.map((s) => (
        <p key={s.program} style={{ margin: "2px 0" }}>
          <b>{shortProgram(s.program)}</b>: in {s.checkedIn} · paid {s.paid} / {s.total}
        </p>
      ))}

      {ask && (
        <div
          role="dialog"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            zIndex: 10,
          }}
        >
          <div style={{ background: "white", color: "black", padding: 16, maxWidth: 420, width: "100%" }}>
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
        <div style={{ maxWidth: 360 }}>
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
              <button onClick={() => askUndoCheckIn(result)}>Wrong person? Undo check-in</button>{" "}
              {MANUAL.includes(result.paidVia) && <button onClick={() => askUndoPaid(result)}>Undo payment</button>}
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
              <button onClick={() => askMarkPaid(result, "personal-upi", true)}>Paid via personal UPI</button>{" "}
              <button onClick={() => askMarkPaid(result, "cash", true)}>Paid cash</button>
            </div>
          )}
        </div>
      )}
      {result && <button onClick={() => setResult(null)}>Next guest</button>}

      <h2>Find guest</h2>
      <input
        placeholder="Name or roll number"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          search(e.target.value);
        }}
      />
      <ul style={{ paddingLeft: 0, listStyle: "none" }}>
        {list.map((g) => (
          <li key={g.token} style={{ borderBottom: "1px solid #ddd", padding: "4px 0" }}>
            <button onClick={() => scan(g.token)} style={{ textAlign: "left" }}>
              {g.name} · {g.rollNo} · {shortProgram(g.program)} ·{" "}
              {g.checkedInAt ? "in" : g.paid ? `paid (${g.paidVia})` : "unpaid"}
            </button>
            {!g.paid && (
              <>
                {" "}
                <button onClick={() => askMarkPaid(g, "personal-upi", false)}>UPI paid</button>{" "}
                <button onClick={() => askMarkPaid(g, "cash", false)}>Cash paid</button>
              </>
            )}
            {g.paid && MANUAL.includes(g.paidVia) && (
              <>
                {" "}
                <button onClick={() => askUndoPaid(g)}>Undo paid</button>
              </>
            )}
          </li>
        ))}
      </ul>

      <p>
        <a href="/api/door/export">Download status CSV</a>
      </p>
    </div>
  );
}
