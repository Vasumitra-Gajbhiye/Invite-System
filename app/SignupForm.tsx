"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function SignupForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(e.currentTarget);
    const res = await fetch("/api/signup", {
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
        Name
        <input name="name" required maxLength={80} autoComplete="name" />
      </label>
      <label>
        Phone
        <input name="phone" type="tel" required autoComplete="tel" />
      </label>
      <label>
        Email
        <input name="email" type="email" required autoComplete="email" />
      </label>
      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={busy}>
        {busy ? "Summoning…" : "Get my invite"}
      </button>
    </form>
  );
}
