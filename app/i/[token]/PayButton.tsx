"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { EVENT } from "@/lib/config";

type RazorpayHandlerResponse = {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
};

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

function loadCheckout() {
  return new Promise<void>((resolve, reject) => {
    if (window.Razorpay) return resolve();
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Could not load Razorpay"));
    document.body.appendChild(s);
  });
}

export default function PayButton(props: { token: string; name: string; email: string; phone: string; fee: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function pay() {
    setBusy(true);
    setError("");
    try {
      await loadCheckout();
      const res = await fetch("/api/pay/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: props.token }),
      });
      const order = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(order.error ?? "Could not start payment");
      if (order.alreadyPaid) return router.refresh();

      const rzp = new window.Razorpay!({
        key: order.keyId,
        order_id: order.orderId,
        amount: order.amount,
        currency: "INR",
        name: EVENT.name,
        description: "Entry fee",
        prefill: { name: props.name, email: props.email, contact: props.phone },
        notes: { token: props.token },
        handler: async (r: RazorpayHandlerResponse) => {
          await fetch("/api/pay/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: props.token, ...r }),
          });
          router.refresh();
        },
        modal: { ondismiss: () => setBusy(false) },
      });
      rzp.open();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Payment failed");
      setBusy(false);
    }
  }

  return (
    <div>
      <button onClick={pay} disabled={busy}>
        {busy ? "Opening payment…" : `Pay ₹${props.fee}`}
      </button>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
