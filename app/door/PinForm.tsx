"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function PinForm() {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/door/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin }),
    });
    if (res.ok) router.refresh();
    else setError("Wrong PIN");
  }

  return (
    <form onSubmit={onSubmit}>
      <h1>Door</h1>
      <input
        type="password"
        inputMode="numeric"
        placeholder="PIN"
        value={pin}
        onChange={(e) => setPin(e.target.value)}
        autoFocus
      />
      {error && <p className="error">{error}</p>}
      <button type="submit">Unlock</button>
    </form>
  );
}
