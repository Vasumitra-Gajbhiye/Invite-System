import Image from "next/image";
import { EVENT, FEE_RUPEES } from "@/lib/config";
import EventDetails from "./EventDetails";
import LookupForm from "./LookupForm";
import skull from "@/public/skull.png";

export default function Home() {
  return (
    <main className="poster">
      <svg className="arch" viewBox="0 0 320 76" role="img" aria-label="You're invited to">
        <path id="arch-path" d="M 10 72 Q 160 -8 310 72" fill="none" />
        <text>
          <textPath href="#arch-path" startOffset="50%" textAnchor="middle">
            You&rsquo;re invited to
          </textPath>
        </text>
      </svg>
      <Image src={skull} alt="" className="skull" priority sizes="(max-width: 560px) 90vw, 480px" />
      <h1 className="title">{EVENT.name}</h1>
      <p className="script tagline">{EVENT.tagline}</p>
      <p className="blurb">{EVENT.blurb}</p>

      <EventDetails />

      <section className="panel">
        <h2 className="panel-title">Claim your invite</h2>
        <LookupForm />
      </section>

      <p className="lure">
        {EVENT.lure[0]}
        <br />
        {EVENT.lure[1]}
      </p>
      <p className="dress">
        Dress code: {EVENT.dressCode} · Entry ₹{FEE_RUPEES}
      </p>
    </main>
  );
}
