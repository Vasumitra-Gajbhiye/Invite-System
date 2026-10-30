// Event details, taken from the poster.
export const EVENT = {
  name: "Halloween Night",
  tagline: "Dancing, drama and danger",
  blurb: "Come for the drama, dance in the shadows, and let the night awaken your inner vampire.",
  lure: ["Enter if you dare, for a night of crimson drinks and eternal fun.", "The darkness calls, will you answer?"],
  time: "7.00 PM",
  day: "Saturday",
  dateNum: "31st",
  month: "October",
  venue: "Faculty Lounge, L6",
  dressCode: "Costumes",
};

// Server-only: client components receive the fee as a prop, since PRICE isn't exposed to the browser.
export const FEE_RUPEES = Number(process.env.PRICE) || 95;
export const FEE_PAISE = FEE_RUPEES * 100;
