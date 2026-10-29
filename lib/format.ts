export function stars(r: number | null | undefined) {
  if (!r) return "";
  return "★".repeat(Math.floor(r)) + (r % 1 ? "½" : "");
}

export function ago(t: string | number | null | undefined) {
  if (!t) return "";
  const ms = typeof t === "number" ? t : Date.parse(t);
  const m = (Date.now() - ms) / 6e4;
  if (m < 1) return "just now";
  if (m < 60) return `${Math.floor(m)}m ago`;
  if (m < 1440) return `${Math.floor(m / 60)}h ago`;
  if (m < 10080) return `${Math.floor(m / 1440)}d ago`;
  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function fmtDate(d: string | null | undefined) {
  if (!d) return "";
  const date = new Date(d + "T12:00:00");
  return isNaN(+date) ? d : date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function today() {
  const d = new Date();
  return new Date(+d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
}

export function duration(ms?: number | null) {
  if (!ms) return "";
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function hash(s: string) {
  let h = 2166136261;
  for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** Rounds to the nearest half star, never below half a star when something was rated. */
export const halfStar = (v: number) => Math.max(0.5, Math.round(v * 2) / 2);

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
