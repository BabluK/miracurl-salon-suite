export const CURRENCY_SYMBOLS = { INR: "₹", USD: "$", GBP: "£", EUR: "€", AED: "AED " };
export const curSym = (tenant) => CURRENCY_SYMBOLS[tenant?.currency || "INR"] || "₹";
export const TIP_PRESETS = [15, 18, 20, 25];
