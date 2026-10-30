"use client";

import { Scanner } from "@yudiel/react-qr-scanner";
import { useCallback, useEffect, useRef, useState } from "react";
import type { DoorResult } from "@/lib/door";

type GuestRow = { token: string; name: string; phone: string; paid: boolean; checkedInAt?: string };
type Stats = { total: number; paid: number; checkedIn: number };

const COLORS = { admitted: "#1a7f37", already: "#d97706", unpaid: "#c00", unknown: "#555" };

async function postJson(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.status === 401) location.reload();
  return res.json();
}

export default function DoorClient({ fee }: { fee: number }) {
  const [result, setResult] = useState<DoorResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [list, setList] = useState<GuestRow[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
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

  // Refresh list + counts whenever the result screen changes.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    search(query);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, search]);

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

  async function markCash(token: string) {
    if (!confirm(`Collected ₹${fee} cash?`)) return;
    setResult(await postJson("/api/door/cash", { token }));
  }

  return (
    <div>
      <h1>Door</h1>
      {stats && (
        <p>
          Checked in {stats.checkedIn} · Paid {stats.paid} · Signed up {stats.total}
        </p>
      )}

      {!result && (
        <div style={{ maxWidth: 360 }}>
          <Scanner
            onScan={(codes) => codes[0] && scan(codes[0].rawValue)}
            onError={(e) => console.error(e)}
            formats={["qr_code"]}
            paused={busy}
            constraints={{ facingMode: "environment" }}
          />
          {busy && <p>Checking…</p>}
        </div>
      )}

      {result && (
        <div style={{ background: COLORS[result.result], color: "white", padding: 16, margin: "12px 0" }}>
          {result.result === "admitted" && (
            <h2>
              ✅ LET IN: {result.name}
              {result.paidVia ? ` (${result.paidVia})` : ""}
            </h2>
          )}
          {result.result === "already" && (
            <h2>
              ⚠️ ALREADY CHECKED IN: {result.name} at {new Date(result.checkedInAt).toLocaleTimeString()}
            </h2>
          )}
          {result.result === "unknown" && <h2>❓ Not a valid invite</h2>}
          {result.result === "unpaid" && (
            <div>
              <h2>
                🔴 NOT PAID: {result.name}
              </h2>
              <p>Ask them to scan and pay ₹{fee}. This screen turns green when payment lands.</p>
              {result.payment && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={result.payment.image} alt="Payment QR" style={{ width: "100%", background: "white" }} />
              )}
              {result.paymentFailed && <p>Couldn&apos;t create a payment QR. Tap Next guest and rescan, or take cash.</p>}
              <button onClick={() => markCash(result.token)}>Paid cash instead</button>
            </div>
          )}
        </div>
      )}
      {result && <button onClick={() => setResult(null)}>Next guest</button>}

      <h2>Find guest</h2>
      <input
        placeholder="Name or phone"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          search(e.target.value);
        }}
      />
      <ul>
        {list.map((g) => (
          <li key={g.token}>
            <button onClick={() => scan(g.token)}>
              {g.name} · {g.phone} · {g.checkedInAt ? "in" : g.paid ? "paid" : "unpaid"}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
