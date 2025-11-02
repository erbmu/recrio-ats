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

const normalizeAnalysisRow = (row) => {
  if (!row || typeof row !== "object") return null;
  const externalRaw =
    row.external_simulation_id ??
    row.externalSimulationId ??
    row.external_simulationID ??
    null;
  const simulationKey = externalRaw != null ? String(externalRaw) : null;

  if (!simulationKey) return null;

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
    analysis_report,
    analysis_generated_at,
    analysis_overall_score,
  };
};

const buildEq = (value) => `eq.${String(value)}`;

const buildInValues = (values) => `in.(${values.map((v) => String(v)).join(",")})`;

const querySupabaseTable = async (table, { select = "*", filter = {}, order } = {}) => {
  const url = new URL(`${REST_ENDPOINT}/${table}`);
  url.searchParams.set("select", select);
  Object.entries(filter).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });
  if (order) url.searchParams.set("order", order);

  const resp = await fetch(url.toString(), {
    method: "GET",
    headers: baseHeaders,
  });
  if (!resp.ok) {
    let body = "";
    try {
      body = await resp.text();
    } catch (e) {
      body = e?.message || "";
    }
    const err = new Error(`supabase_fetch_failed ${resp.status}`);
    err.status = resp.status;
    err.body = body;
    err.url = url.toString();
    err.table = table;
    throw err;
  }
  return resp.json();
};

const uniqueStrings = (values = []) => [
  ...new Set(
    values
      .map((v) => (typeof v === "string" ? v.trim() : ""))
      .filter(Boolean)
  ),
];

export async function fetchSimulationAnalyses({ simulationIds = [] } = {}) {
  if (!hasConfig()) return { bySimulationId: new Map() };

  const simulationKeys = uniqueStrings(simulationIds.map((id) => String(id)));

  const bySimulationId = new Map();

  const ingestRows = (rows) => {
    if (!Array.isArray(rows)) return;
    for (const row of rows) {
      const normalized = normalizeAnalysisRow(row);
      if (!normalized) continue;
      if (normalized.simulation_key) {
        bySimulationId.set(normalized.simulation_key, normalized);
      }
    }
  };

  try {
    if (simulationKeys.length) {
      const filter =
        simulationKeys.length === 1
          ? { external_simulation_id: buildEq(simulationKeys[0]) }
          : { external_simulation_id: buildInValues(simulationKeys) };
      const rows = await querySupabaseTable("simulations", {
        select: "id,analysis_report,analysis_generated_at,external_simulation_id",
        filter,
      });
      ingestRows(rows);
    }

  } catch (err) {
    if (!fetchErrorWarned) {
      fetchErrorWarned = true;
      console.warn(
        "[supabase] Error fetching simulations:",
        err?.message || err,
        err?.status ? `(status ${err.status})` : "",
        err?.body ? `body: ${err.body}` : "",
        err?.url ? `url: ${err.url}` : ""
      );
    }
  }

  return { bySimulationId };
}

export async function fetchSimulationAnalysis({ simulationId } = {}) {
  const { bySimulationId } = await fetchSimulationAnalyses({
    simulationIds: simulationId != null ? [simulationId] : [],
  });

  if (simulationId != null) {
    const key = String(simulationId);
    if (bySimulationId.has(key)) {
      return bySimulationId.get(key) || null;
    }
  }
  return null;
}

const normalizeResponseRow = (row) => ({
  id: row?.id ?? null,
  question_id: row?.question_id ?? row?.questionId ?? null,
  created_at: row?.created_at ?? row?.createdAt ?? null,
  content:
    (typeof row?.response_text === "string" && row.response_text) ||
    (typeof row?.response === "string" && row.response) ||
    (typeof row?.answer === "string" && row.answer) ||
    "",
  meta: row?.metadata ?? row?.meta ?? null,
});

const normalizeViolationRow = (row) => ({
  id: row?.id ?? null,
  type: row?.type ?? row?.violation_type ?? row?.violationType ?? "",
  detail:
    (typeof row?.details === "string" && row.details) ||
    (typeof row?.detail === "string" && row.detail) ||
    (typeof row?.message === "string" && row.message) ||
    "",
  created_at: row?.created_at ?? row?.createdAt ?? null,
});

export async function fetchSimulationResponsesAndViolations(simulationId) {
  if (!hasConfig()) return { responses: [], violations: [] };
  if (simulationId == null) return { responses: [], violations: [] };
  const key = String(simulationId);

  const responses = [];
  const violations = [];

  try {
    const respRows = await querySupabaseTable("simulation_responses", {
      select: "id,question_id,response_text,created_at,metadata",
      filter: { external_simulation_id: buildEq(key) },
      order: "created_at.asc",
    });
    if (Array.isArray(respRows)) {
      for (const row of respRows) {
        responses.push(normalizeResponseRow(row));
      }
    }
  } catch (err) {
    if (!fetchErrorWarned) {
      fetchErrorWarned = true;
      console.warn(
        "[supabase] Error fetching simulation_responses:",
        err?.message || err,
        err?.status ? `(status ${err.status})` : "",
        err?.body ? `body: ${err.body}` : "",
        err?.url ? `url: ${err.url}` : ""
      );
    }
  }

  try {
    const vioRows = await querySupabaseTable("simulation_violations", {
      select: "id,type,details,created_at",
      filter: { external_simulation_id: buildEq(key) },
      order: "created_at.asc",
    });
    if (Array.isArray(vioRows)) {
      for (const row of vioRows) {
        violations.push(normalizeViolationRow(row));
      }
    }
  } catch (err) {
    if (!fetchErrorWarned) {
      fetchErrorWarned = true;
      console.warn(
        "[supabase] Error fetching simulation_violations:",
        err?.message || err,
        err?.status ? `(status ${err.status})` : "",
        err?.body ? `body: ${err.body}` : "",
        err?.url ? `url: ${err.url}` : ""
      );
    }
  }

  return { responses, violations };
}

export { computeOverallFromReport };
