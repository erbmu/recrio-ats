// server/lib/supabaseAnalysis.mjs
// Helpers to pull simulation analysis metadata from Supabase using the service role key.

const SUPABASE_REST_BASE =
  (process.env.SUPABASE_URL ||
    process.env.SUPABASE_PROJECT_URL ||
    process.env.SUPABASE_REST_URL ||
    "")
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
  const externalRaw =
    row.external_simulation_id ??
    row.externalSimulationId ??
    row.external_simulationID ??
    null;
  const simulationKey = externalRaw != null ? String(externalRaw) : null;

  const applicationRaw = row.application_id ?? row.applicationId ?? null;
  const applicationId = Number(applicationRaw);

  if (!simulationKey && !Number.isFinite(applicationId)) return null;

  let analysis_report = row.analysis_report ?? row.analysisReport ?? null;
  if (typeof analysis_report === "string") {
    try {
      analysis_report = JSON.parse(analysis_report);
    } catch {
      // leave as string
    }
  }
  const analysis_generated_at = row.analysis_generated_at ?? row.analysisGeneratedAt ?? null;
  const analysis_overall_score = computeOverallFromReport(analysis_report);

  return {
    simulation_key: simulationKey,
    application_id: Number.isFinite(applicationId) ? applicationId : null,
    analysis_report,
    analysis_generated_at,
    analysis_overall_score,
  };
};

const quoteValue = (value) => `"${String(value).replace(/"/g, '\\"')}"`;

const buildEq = (value) => `eq.${encodeURIComponent(String(value))}`;

const buildInStrings = (values) => {
  const quoted = values.map(quoteValue).join(",");
  return `in.(${quoted})`;
};

const buildInNumbers = (values) => `in.(${values.join(",")})`;

const querySupabase = async (filter) => {
  const url = new URL(`${REST_ENDPOINT}/simulations`);
  url.searchParams.set(
    "select",
    "id,application_id,analysis_report,analysis_generated_at,external_simulation_id"
  );
  Object.entries(filter).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  const resp = await fetch(url.toString(), {
    method: "GET",
    headers: baseHeaders,
  });
  if (!resp.ok) throw new Error(`supabase_fetch_failed ${resp.status}`);
  return resp.json();
};

const uniqueNumbers = (values = []) => [
  ...new Set(
    values
      .map((v) => Number(v))
      .filter((v) => Number.isFinite(v))
  ),
];

const uniqueStrings = (values = []) => [
  ...new Set(
    values
      .map((v) => (typeof v === "string" ? v.trim() : ""))
      .filter(Boolean)
  ),
];

export async function fetchSimulationAnalyses({
  simulationIds = [],
  applicationIds = [],
} = {}) {
  if (!hasConfig()) return { bySimulationId: new Map(), byApplicationId: new Map() };

  const simulationKeys = uniqueStrings(simulationIds.map((id) => String(id)));
  const appIds = uniqueNumbers(applicationIds);

  const bySimulationId = new Map();
  const byApplicationId = new Map();

  const ingestRows = (rows) => {
    if (!Array.isArray(rows)) return;
    for (const row of rows) {
      const normalized = normalizeRow(row);
      if (!normalized) continue;
      if (normalized.simulation_key) {
        bySimulationId.set(normalized.simulation_key, normalized);
      }
      if (normalized.application_id != null) {
        byApplicationId.set(normalized.application_id, normalized);
      }
    }
  };

  try {
    if (simulationKeys.length) {
      const filter =
        simulationKeys.length === 1
          ? { external_simulation_id: buildEq(simulationKeys[0]) }
          : { external_simulation_id: buildInStrings(simulationKeys) };
      const rows = await querySupabase(filter);
      ingestRows(rows);
    }

    const remainingAppIds = appIds.filter((id) => !byApplicationId.has(id));
    if (remainingAppIds.length) {
      const filter =
        remainingAppIds.length === 1
          ? { application_id: buildEq(remainingAppIds[0]) }
          : { application_id: buildInNumbers(remainingAppIds) };
      const rows = await querySupabase(filter);
      ingestRows(rows);
    }
  } catch (err) {
    if (!fetchErrorWarned) {
      fetchErrorWarned = true;
      console.warn("[supabase] Error fetching simulations:", err?.message || err);
    }
  }

  return { bySimulationId, byApplicationId };
}

export async function fetchSimulationAnalysis({ simulationId, applicationId } = {}) {
  const { bySimulationId, byApplicationId } = await fetchSimulationAnalyses({
    simulationIds: simulationId != null ? [simulationId] : [],
    applicationIds: applicationId != null ? [applicationId] : [],
  });

  if (simulationId != null) {
    const key = String(simulationId);
    if (bySimulationId.has(key)) {
      return bySimulationId.get(key) || null;
    }
  }

  const key = Number(applicationId);
  if (Number.isFinite(key) && byApplicationId.has(key)) {
    return byApplicationId.get(key) || null;
  }
  return null;
}

export { computeOverallFromReport };
