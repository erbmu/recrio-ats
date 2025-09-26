// Allow spaces while typing – just clamp length.
export function clampLength(s, max = 2000) {
  return (s ?? "").toString().slice(0, max);
}

export function safeEnum(val, allowed) {
  return allowed.includes(val) ? val : "";
}

export function normalizeSalaryRange(s) {
  const t = clampLength(s, 120);
  if (!t) return "";
  // keep digits, separators, spaces, and common currency symbols
  const cleaned = t.replace(/[^\d\-–—\s.,$€£₹]/g, "");
  return cleaned.replace(/\s+/g, " ");
}

export function nonEmpty(s) {
  return !!(s && s.trim().length > 0);
}

export function genId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "job-" + Math.random().toString(36).slice(2, 10);
}
