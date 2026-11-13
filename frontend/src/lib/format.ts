// One place for number/date formatting so every screen shows values the same way.
const dash = "–";

export function money(v: number | null | undefined, currency = "INR", digits = 2): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return dash;
  const locale = currency === "INR" ? "en-IN" : "en-US";
  return new Intl.NumberFormat(locale, { style: "currency", currency, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v);
}
export function compactMoney(v: number | null | undefined, currency = "INR"): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return dash;
  const locale = currency === "INR" ? "en-IN" : "en-US";
  return new Intl.NumberFormat(locale, { style: "currency", currency, notation: "compact", maximumFractionDigits: 2 }).format(v);
}
export function pct(v: number | null | undefined, digits = 2, signed = false): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return dash;
  const s = v.toFixed(digits);
  return `${signed && v > 0 ? "+" : ""}${s}%`;
}
export function ratio(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return dash;
  return v.toFixed(digits);
}
export function qty(v: number): string {
  return Number.isInteger(v) ? v.toLocaleString("en-IN") : v.toLocaleString("en-IN", { maximumFractionDigits: 4 });
}
export function price(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return dash;
  return v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
export function integer(v: number | null | undefined): string {
  return v === null || v === undefined || !Number.isFinite(v) ? dash : v.toLocaleString("en-IN");
}
/** ISO date (YYYY-MM-DD) -> "05 Jan 2024". Pure string handling: no time-zone shifts. */
export function date(iso: string | null | undefined): string {
  if (!iso) return dash;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${m[3]} ${months[Number(m[2]) - 1]} ${m[1]}`;
}
export function dateTime(iso: string | null | undefined): string {
  if (!iso) return dash;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}
export const tone = (v: number | null | undefined): "up" | "down" | "flat" => (v === null || v === undefined || v === 0 ? "flat" : v > 0 ? "up" : "down");
export const toneClass = (v: number | null | undefined) => ({ up: "text-up", down: "text-down", flat: "text-ink" })[tone(v)];
