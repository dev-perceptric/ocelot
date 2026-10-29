// Listing packages and prices (US dollars). Safe to use on any screen.

export type PaidPackage = "standard" | "featured";
export const PACKAGES: Record<PaidPackage, { name: string; cents: number; line: string }> = {
  standard: { name: "Standard listing", cents: 4900, line: "Live for 30 days" },
  featured: { name: "Featured listing", cents: 9900, line: "Live for 30 days, shown first for 7 days and in the weekly digest" },
};
export const PACKAGE_LABEL: Record<string, string> = { standard: "Standard", featured: "Featured", founding: "Founding" };
export const isPaidPackage = (p: string): p is PaidPackage => p === "standard" || p === "featured";
export const dollars = (cents: number, currency = "USD") => `${currency === "USD" ? "$" : `${currency} `}${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;
