import { EVENT, FEE_RUPEES } from "@/lib/config";
import LookupForm from "./LookupForm";

export default function Home() {
  return (
    <main>
      <h1>{EVENT.name}</h1>
      <p>{EVENT.tagline}</p>
      <p>
        {EVENT.date}, {EVENT.time}
        <br />
        {EVENT.venue}
        <br />
        Entry: ₹{FEE_RUPEES}
      </p>
      <h2>Get your invite</h2>
      <LookupForm />
    </main>
  );
}
