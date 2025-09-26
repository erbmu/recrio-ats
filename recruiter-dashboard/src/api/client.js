// client/src/api/client.js

// Accept http://localhost:4000 OR http://localhost:4000/api
const RAW_BASE = process.env.REACT_APP_API_URL || "http://localhost:4000";

// Normalize to origin WITHOUT trailing /api or slash
export const API_ORIGIN = RAW_BASE.replace(/\/+$/, "").replace(/\/api$/i, "");

// expose for debug use
if (typeof window !== "undefined") {
  window.__API_ORIGIN__ = API_ORIGIN;
  window.__API_RAW_BASE__ = RAW_BASE;
}

export const tokenStore = {
  get() {
    return localStorage.getItem("jwt") || "";
  },
  set(t) {
    if (t) localStorage.setItem("jwt", t);
  },
  clear() {
    localStorage.removeItem("jwt");
  },
};

function buildUrl(path) {
  if (/^https?:\/\//i.test(path)) return path; // absolute
  const p = String(path || "");
  if (p.startsWith("/api/") || p === "/api") return `${API_ORIGIN}${p}`;
  if (p.startsWith("/")) return `${API_ORIGIN}/api${p}`;
  return `${API_ORIGIN}/api/${p}`;
}

export async function api(path, { method = "GET", body, headers } = {}) {
  const token = tokenStore.get();
  const isForm = typeof FormData !== "undefined" && body instanceof FormData;
  const url = buildUrl(path);

  if (typeof window !== "undefined") {
    window.__API_LAST__ = { method, path, url, hasToken: !!token, time: Date.now() };
  }
  console.log(`[CLI][API] ${method} ${url} token=${token ? "present" : "missing"}`);

  const res = await fetch(url, {
    method,
    headers: {
      ...(isForm ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(headers || {}),
    },
    body: isForm ? body : body ? JSON.stringify(body) : undefined,
    credentials: "omit",
  });

  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch {}

  console.log(`[CLI][API] <- ${res.status} ${method} ${url}`, data || text);

  if (!res.ok) {
    const msg = (data && (data.error || data.message)) || text || `HTTP ${res.status}`;
    const err = new Error(msg);
    // attach more debug
    err.__debug = { status: res.status, url, body: data || text };
    throw err;
  }
  return data;
}
