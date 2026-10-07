/** ISO 4217 minor units, SIX List One published 2026-09-17.
 * https://www.six-group.com/dam/download/financial-information/data-center/iso-currrency/lists/list-one.xml
 * Intl locale defaults can use cash conventions (e.g. HUF/MGA) rather than ISO units.
 */
const zero = new Set([
  "BIF",
  "CLP",
  "DJF",
  "GNF",
  "ISK",
  "JPY",
  "KMF",
  "KRW",
  "PYG",
  "RWF",
  "UGX",
  "UYI",
  "VND",
  "VUV",
  "XAF",
  "XOF",
  "XPF",
]);
const three = new Set(["BHD", "IQD", "JOD", "KWD", "LYD", "OMR", "TND"]);
const four = new Set(["CLF", "UYW"]);
const noMinorUnit = new Set([
  "XAG",
  "XAU",
  "XBA",
  "XBB",
  "XBC",
  "XBD",
  "XDR",
  "XPD",
  "XPT",
  "XSU",
  "XTS",
  "XUA",
  "XXX",
]);
const supported = new Set(Intl.supportedValuesOf("currency"));
export function billingMinorDigits(currency: string) {
  const code = currency.toUpperCase();
  if (!supported.has(code) || noMinorUnit.has(code))
    throw new RangeError("Unsupported monetary currency");
  return zero.has(code) ? 0 : three.has(code) ? 3 : four.has(code) ? 4 : 2;
}
export function formatBillingAmount(amountMinor: number, currency: string) {
  const digits = billingMinorDigits(currency);
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(amountMinor / 10 ** digits);
}
