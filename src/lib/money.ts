/** Currency helpers — pure, safe on client and server. Amounts are in minor units (kobo, pesewas, cents). */

export const CURRENCIES = ["NGN", "GHS", "KES", "ZAR", "USD"] as const;
export type Currency = (typeof CURRENCIES)[number];

/** Smallest price a creator can set, in major units (keeps fees sensible and above Paystack minimums). */
export const MIN_PRICE: Record<Currency, number> = { NGN: 100, GHS: 5, KES: 50, ZAR: 10, USD: 2 };
export const MAX_PRICE: Record<Currency, number> = { NGN: 5_000_000, GHS: 50_000, KES: 500_000, ZAR: 100_000, USD: 10_000 };

export function isCurrency(v: unknown): v is Currency {
  return typeof v === "string" && (CURRENCIES as readonly string[]).includes(v);
}

export function toMinor(major: number) {
  return Math.round(major * 100);
}

export function fromMinor(minor: number) {
  return minor / 100;
}

export function formatMoney(minor: number, currency: string) {
  try {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
      minimumFractionDigits: minor % 100 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(minor / 100);
  } catch {
    return `${currency} ${(minor / 100).toFixed(2)}`;
  }
}

export function priceLabel(minor: number, currency: string) {
  return minor > 0 ? formatMoney(minor, currency) : "Free";
}
