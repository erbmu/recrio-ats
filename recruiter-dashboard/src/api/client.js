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

let redirecting = false;
let logoutPromptVisible = false;

const navigateToLogin = () => {
  if (redirecting) return;
  redirecting = true;
  try {
    window.location.replace("/login");
  } catch {
    window.location.assign("/login");
  }
};

const showLogoutPrompt = (message, onConfirm) => {
  if (typeof document === "undefined") {
    onConfirm();
    return;
  }
  if (logoutPromptVisible) return;
  logoutPromptVisible = true;

  const overlay = document.createElement("div");
  overlay.className =
    "fixed inset-0 z-[2000] flex items-center justify-center bg-black/40 px-4 py-8 backdrop-blur-[2px]";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");

  overlay.innerHTML = `
    <div class="relative w-full max-w-md rounded-2xl border border-red-200 bg-white shadow-2xl">
      <button type="button" data-close class="absolute right-3 top-3 text-gray-400 hover:text-gray-600" aria-label="Dismiss">
        ×
      </button>
      <div class="px-6 pt-6 pb-5 space-y-4">
        <div class="flex items-center gap-3">
          <span class="inline-flex h-10 w-10 items-center justify-center rounded-full bg-red-100 text-red-600 text-xl">
            !
          </span>
          <div>
            <p class="text-sm font-semibold text-gray-900">Connection lost</p>
            <p class="text-xs text-gray-500" data-message></p>
          </div>
        </div>
        <p class="text-sm text-gray-600 leading-relaxed">
          You'll need to sign back in to keep working securely.
        </p>
        <button type="button" data-primary class="w-full inline-flex justify-center rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-gray-900 transition">
          Sign in again
        </button>
      </div>
    </div>
  `;

  const messageNode = overlay.querySelector("[data-message]");
  if (messageNode) messageNode.textContent = message;

  const cleanup = () => {
    if (!logoutPromptVisible) return;
    logoutPromptVisible = false;
    try {
      document.body.removeChild(overlay);
    } catch {}
    window.removeEventListener("keydown", handleKey);
    if (autoRedirectTimer) window.clearTimeout(autoRedirectTimer);
  };

  const confirmAndNavigate = () => {
    if (redirecting) {
      cleanup();
      return;
    }
    cleanup();
    onConfirm();
  };

  const handleKey = (event) => {
    if (event.key === "Enter" || event.key === "Escape") {
      event.preventDefault();
      confirmAndNavigate();
    }
  };

  const autoRedirectTimer = window.setTimeout(confirmAndNavigate, 8000);

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) confirmAndNavigate();
  });

  const closeBtn = overlay.querySelector("[data-close]");
  if (closeBtn) closeBtn.addEventListener("click", confirmAndNavigate);

  const primaryBtn = overlay.querySelector("[data-primary]");
  if (primaryBtn) primaryBtn.addEventListener("click", confirmAndNavigate);

  window.addEventListener("keydown", handleKey);
  document.body.appendChild(overlay);
};

const forceLogout = (message = "Your session has ended. Please sign in again.") => {
  if (typeof window === "undefined") return;
  if (redirecting) return;
  try {
    tokenStore.clear();
  } catch {}
  showLogoutPrompt(message, navigateToLogin);
};

export async function api(path, { method = "GET", body, headers } = {}) {
  const token = tokenStore.get();
  const isForm = typeof FormData !== "undefined" && body instanceof FormData;
  const url = buildUrl(path);

  if (typeof window !== "undefined") {
    window.__API_LAST__ = { method, path, url, hasToken: !!token, time: Date.now() };
  }
  console.log(`[CLI][API] ${method} ${url} token=${token ? "present" : "missing"}`);

  let res;
  try {
    res = await fetch(url, {
      method,
      headers: {
        ...(isForm ? {} : { "Content-Type": "application/json" }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(headers || {}),
      },
      body: isForm ? body : body ? JSON.stringify(body) : undefined,
      credentials: "omit",
    });
  } catch (networkErr) {
    console.error("[CLI][API] network error", networkErr);
    forceLogout("Connection lost. Please sign in again.");
    throw new Error("Network error");
  }

  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch {}

  console.log(`[CLI][API] <- ${res.status} ${method} ${url}`, data || text);

  if (!res.ok) {
    const status = res.status;
    if (status === 401 || status === 403) {
      forceLogout("Your session has expired. Please sign in again.");
    } else if (status >= 500) {
      forceLogout("We hit a server issue. Please sign in again.");
    }
    const msg = (data && (data.error || data.message)) || text || `HTTP ${status}`;
    const err = new Error(status >= 500 ? "Server error" : msg);
    // attach more debug
    err.__debug = { status, url, body: data || text };
    throw err;
  }
  return data;
}
