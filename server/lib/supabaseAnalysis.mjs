// server/lib/supabaseAnalysis.mjs
// Helpers to read simulation analysis data from Supabase REST using the service role key.

const SUPABASE_REST_BASE =
  (process.env.SUPABASE_URL || process.env.SUPABASE_PROJECT_URL || process.env.SUPABASE_REST_URL || "")
    .trim()
    .replace(/\/+$/, "");

const SERVICE_KEY =
  (process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE ||
    "").trim();

const REST_ENDPOINT = SUPABASE_REST_BASE ? `${SUPABASE_REST_BASE}/rest/v1` : "";

let missingConfigWarned = false;
let fetchErrorWarned = false;

const hasConfig = () => {
  const ok = Boolean(REST_ENDPOINT && SERVICE_KEY);
  if (!ok && !missingConfigWarned) {
    console.warn("[supabase] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY – skipping analysis fetches.");
    missingConfigWarned = true;
  }
  return ok;
};

const baseHeaders = SERVICE_KEY
  ? {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      Accept: "application/json",
    }
  : {};

const computeOverallFromReport = (report) => {
  if (!report || typeof report !== "object") return null;
  const candidates = [
    report.overallStartupReadinessIndex,
    report.overallScore,
    report.overall,
    report.score,
    report?.scores?.overall,
    report?.scores?.overallScore,
  ];
  for (const candidate of candidates) {
    const n = typeof candidate === "number" ? candidate : Number(candidate);
    if (Number.isFinite(n)) return n;
  }
  return null;
};

const normalizeRow = (row) => {
  if (!row || typeof row !== "object") return null;
  const applicationId = Number(row.application_id ?? row.applicationId);
  if (!Number.isFinite(applicationId)) return null;
  let analysis_report = row.analysis_report ?? row.analysisReport ?? null;
  if (typeof analysis_report === "string") {
    try {
      analysis_report = JSON.parse(analysis_report);
    } catch {
      // keep as raw string
    }
  }
  const analysis_generated_at = row.analysis_generated_at ?? row.analysisGeneratedAt ?? null;
  const analysis_overall_score = computeOverallFromReport(analysis_report);
  return {
    application_id: applicationId,
    analysis_report,
    analysis_generated_at,
    analysis_overall_score,
  };
};

export async function fetchSimulationAnalyses(applicationIds = []) {
  if (!hasConfig()) return new Map();
  const ids = Array.from(
    new Set(
      applicationIds
        .map((id) => Number(id))
        .filter((id) => Number.isFinite(id))
    )
  );
  if (!ids.length) return new Map();

  const url = new URL(`${REST_ENDPOINT}/simulations`);
  url.searchParams.set("select", "application_id,analysis_report,analysis_generated_at");
  if (ids.length === 1) {
    url.searchParams.set("application_id", `eq.${ids[0]}`);
  } else {
    url.searchParams.set("application_id", `in.(${ids.join(",")})`);
  }

  try {
    const resp = await fetch(url.toString(), {
      method: "GET",
      headers: baseHeaders,
    });
    if (!resp.ok) {
      if (!fetchErrorWarned) {
        fetchErrorWarned = true;
        console.warn(`[supabase] Failed to fetch simulations (${resp.status})`);
      }
      return new Map();
    }
    const rows = await resp.json();
    const map = new Map();
    if (Array.isArray(rows)) {
      for (const row of rows) {
        const normalized = normalizeRow(row);
        if (normalized) {
          map.set(normalized.application_id, normalized);
        }
      }
    }
    return map;
  } catch (err) {
    if (!fetchErrorWarned) {
      fetchErrorWarned = true;
      console.warn("[supabase] Error fetching simulations:", err?.message || err);
    }
    return new Map();
  }
}

export async function fetchSimulationAnalysis(applicationId) {
  const results = await fetchSimulationAnalyses([applicationId]);
  const key = Number(applicationId);
  return results.get(key) || null;
}

export { computeOverallFromReport };
