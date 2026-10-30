import { EVENT } from "@/lib/config";

// The poster's "7.00 PM SATURDAY | 31ST October | FACULTY LOUNGE, L6" row.
export default function EventDetails() {
  return (
    <div className="when-row">
      <p className="when-side">
        {EVENT.time}
        <br />
        {EVENT.day}
      </p>
      <p className="when-date">
        <span className="when-num">{EVENT.dateNum}</span>
        <span className="when-month">{EVENT.month}</span>
      </p>
      <p className="when-side">{EVENT.venue.replace(" ", "\n")}</p>
    </div>
  );
}
