export const COUNTRY_CODES = [
  { iso: "IN", code: "+91", flag: "🇮🇳", name: "India" },
  { iso: "US", code: "+1", flag: "🇺🇸", name: "USA" },
  { iso: "CA", code: "+1", flag: "🇨🇦", name: "Canada" },
  { iso: "GB", code: "+44", flag: "🇬🇧", name: "UK" },
  { iso: "AE", code: "+971", flag: "🇦🇪", name: "UAE" },
  { iso: "SA", code: "+966", flag: "🇸🇦", name: "Saudi Arabia" },
  { iso: "QA", code: "+974", flag: "🇶🇦", name: "Qatar" },
  { iso: "KW", code: "+965", flag: "🇰🇼", name: "Kuwait" },
  { iso: "BH", code: "+973", flag: "🇧🇭", name: "Bahrain" },
  { iso: "OM", code: "+968", flag: "🇴🇲", name: "Oman" },
  { iso: "SG", code: "+65", flag: "🇸🇬", name: "Singapore" },
  { iso: "MY", code: "+60", flag: "🇲🇾", name: "Malaysia" },
  { iso: "AU", code: "+61", flag: "🇦🇺", name: "Australia" },
  { iso: "NZ", code: "+64", flag: "🇳🇿", name: "New Zealand" },
  { iso: "NP", code: "+977", flag: "🇳🇵", name: "Nepal" },
  { iso: "LK", code: "+94", flag: "🇱🇰", name: "Sri Lanka" },
  { iso: "BD", code: "+880", flag: "🇧🇩", name: "Bangladesh" },
  { iso: "ZA", code: "+27", flag: "🇿🇦", name: "South Africa" },
  { iso: "DE", code: "+49", flag: "🇩🇪", name: "Germany" },
  { iso: "FR", code: "+33", flag: "🇫🇷", name: "France" },
];

export const DEFAULT_CC = "IN";

export function countryByIso(iso) {
  return COUNTRY_CODES.find(c => c.iso === (iso || DEFAULT_CC)) || COUNTRY_CODES[0];
}

/** "+91" -> {iso:"IN",...}; unknown -> India */
export function countryByCode(code) {
  return COUNTRY_CODES.find(c => c.code === code) || COUNTRY_CODES[0];
}

/** Display parts for a stored customer — strips any country code baked into the stored phone */
export function phoneDisplay(customer) {
  const c = countryByCode(customer?.country_code || "+91");
  let digits = (customer?.phone || "").replace(/\D/g, "");
  const codeDigits = c.code.replace("+", "");
  if (digits.length > 10 && digits.startsWith(codeDigits)) digits = digits.slice(codeDigits.length);
  return { code: c.code, iso: c.iso, flag: c.flag, number: digits };
}
