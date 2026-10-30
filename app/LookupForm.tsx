"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LookupForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(e.currentTarget);
    const res = await fetch("/api/lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(form)),
    });
    const data = await res.json().catch(() => ({ error: "Something went wrong." }));
    if (!res.ok) {
      setError(data.error);
      setBusy(false);
      return;
    }
    router.push(`/i/${data.token}`);
  }

  return (
    <form onSubmit={onSubmit}>
      <label>
        Roll number
        <input name="rollNo" required inputMode="numeric" placeholder="e.g. 2602024" autoComplete="off" />
      </label>
      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={busy}>
        {busy ? "Summoning…" : "Get my invite"}
      </button>
    </form>
  );
}
