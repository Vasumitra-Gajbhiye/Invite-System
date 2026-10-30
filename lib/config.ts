// Placeholder event details — edit these before sharing the signup link.
export const EVENT = {
  name: "Halloween Night 2026",
  tagline: "The veil is thin tonight. Come haunt with us.",
  date: "Saturday, 31 October 2026",
  time: "7:00 PM onwards",
  venue: "Main Auditorium, Campus",
  dressCode: "Costumes mandatory. Spooky, scary or silly.",
};

// Server-only: client components receive the fee as a prop, since PRICE isn't exposed to the browser.
export const FEE_RUPEES = Number(process.env.PRICE) || 95;
export const FEE_PAISE = FEE_RUPEES * 100;
