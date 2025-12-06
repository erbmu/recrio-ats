import { db } from "../db.mjs";
import { resolveColumn } from "./columnResolver.mjs";

const tableRef = (table, column) => db.ref(`${table}.${column}`);
const debugArtifacts = Boolean(process?.env?.DEBUG_SIM_ARTIFACTS);
const debugLog = (...args) => {
  if (debugArtifacts) {
    console.log("[sim.artifacts]", ...args);
  }
};

let simulationRunColumnsCache = null;
async function getSimulationRunColumns() {
  if (simulationRunColumnsCache) return simulationRunColumnsCache;
  simulationRunColumnsCache = {
    external: await resolveColumn("simulation_runs", [
      "external_simulation_id",
      "externalSimulationId",
      "simulation_id",
      "simulationId",
    ]),
    report: await resolveColumn("simulation_runs", ["analysis_report", "analysisReport", "report"]),
    generated: await resolveColumn("simulation_runs", [
      "analysis_generated_at",
      "analysisGeneratedAt",
      "generated_at",
      "generatedAt",
    ]),
    application: await resolveColumn("simulation_runs", ["application_id", "applicationId", "app_id", "appId"]),
    summary: await resolveColumn("simulation_runs", ["summary_text", "summaryText", "summary"]),
    id: await resolveColumn("simulation_runs", ["id", "ID"]),
    simulation: await resolveColumn("simulation_runs", [
      "simulation_id",
      "simulationId",
      "sim_id",
      "simId",
    ]),
  };
  return simulationRunColumnsCache;
}

let responseColumnsCache = null;
async function getResponseColumns() {
  if (responseColumnsCache) return responseColumnsCache;
  responseColumnsCache = {
    external: await resolveColumn("simulation_responses", [
      "external_simulation_id",
      "externalSimulationId",
      "simulation_id",
      "simulationId",
    ]),
    question: await resolveColumn("simulation_responses", ["question_id", "questionId"]),
    response: await resolveColumn("simulation_responses", [
      "response",
      "response_text",
      "content",
      "answer",
      "body",
      "value",
    ]),
    metadata: await resolveColumn("simulation_responses", ["metadata", "meta"]),
    timestamp: await resolveColumn("simulation_responses", ["timestamp", "created_at", "createdAt"]),
    id: await resolveColumn("simulation_responses", ["id", "ID"]),
  };
  return responseColumnsCache;
}

let violationColumnsCache = null;
async function getViolationColumns() {
  if (violationColumnsCache) return violationColumnsCache;
  violationColumnsCache = {
    external: await resolveColumn("simulation_violations", [
      "external_simulation_id",
      "externalSimulationId",
      "simulation_id",
      "simulationId",
    ]),
    type: await resolveColumn("simulation_violations", ["violation_type", "violationType", "type"]),
    metadata: await resolveColumn("simulation_violations", ["metadata", "meta"]),
    created: await resolveColumn("simulation_violations", ["created_at", "createdAt", "timestamp"]),
    id: await resolveColumn("simulation_violations", ["id", "ID"]),
  };
  return violationColumnsCache;
}

let identityColumnsCache = null;
async function getIdentityColumns() {
  if (identityColumnsCache) return identityColumnsCache;
  identityColumnsCache = {
    external: await resolveColumn("simulation_identity_checks", [
      "external_simulation_id",
      "externalSimulationId",
      "simulation_id",
      "simulationId",
    ]),
    selfiePath: await resolveColumn("simulation_identity_checks", ["selfie_path", "selfiePath"]),
    selfieUrl: await resolveColumn("simulation_identity_checks", ["selfie_url", "selfieUrl"]),
    selfieData: await resolveColumn("simulation_identity_checks", [
      "selfie_data",
      "selfieData",
      "selfie_base64",
      "selfieBase64",
    ]),
    idPath: await resolveColumn("simulation_identity_checks", ["id_path", "idPath"]),
    idUrl: await resolveColumn("simulation_identity_checks", ["id_url", "idUrl"]),
    idData: await resolveColumn("simulation_identity_checks", [
      "id_data",
      "idData",
      "id_base64",
      "idBase64",
    ]),
    created: await resolveColumn("simulation_identity_checks", ["created_at", "createdAt", "timestamp"]),
  };
  return identityColumnsCache;
}

function computeOverallFromReport(report) {
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
}

function pickValue(row, column, fallbacks = []) {
  if (column && row && row[column] != null) return row[column];
  for (const fallback of fallbacks) {
    if (row && row[fallback] != null) return row[fallback];
  }
  return null;
}

function normalizeAnalysisRow(row, columns) {
  if (!row || !columns?.external) return null;
  const simulationKeyRaw = pickValue(row, columns.external, ["external_simulation_id", "externalSimulationId"]);
  if (simulationKeyRaw == null) return null;
  const simulationKey = String(simulationKeyRaw);

  let analysisReport = pickValue(row, columns.report, ["analysis_report", "analysisReport", "report"]);
  if (typeof analysisReport === "string") {
    try {
      analysisReport = JSON.parse(analysisReport);
    } catch {
      /* leave as string */
    }
  }
  const analysisGeneratedAt = pickValue(row, columns.generated, [
    "analysis_generated_at",
    "analysisGeneratedAt",
    "generated_at",
    "generatedAt",
  ]);
  const analysisOverallScore = computeOverallFromReport(analysisReport);

  return {
    simulation_key: simulationKey,
    analysis_report: analysisReport,
    analysis_generated_at: analysisGeneratedAt,
    analysis_overall_score: analysisOverallScore,
  };
}

export async function fetchSimulationAnalyses({ simulationIds = [] } = {}) {
  const uniqueKeys = [
    ...new Set(simulationIds.map((id) => (id != null ? String(id).trim() : "")).filter(Boolean)),
  ];

  const bySimulationId = new Map();
  if (!uniqueKeys.length) return { bySimulationId };

  const columns = await getSimulationRunColumns();
  if (!columns.external) return { bySimulationId };

  const rows = await db("simulation_runs")
    .select("*")
    .whereIn(tableRef("simulation_runs", columns.external), uniqueKeys);

  for (const row of rows) {
    const normalized = normalizeAnalysisRow(row, columns);
    if (normalized?.simulation_key) {
      bySimulationId.set(normalized.simulation_key, normalized);
    }
  }
  return { bySimulationId };
}

export async function fetchSimulationAnalysis({ simulationId } = {}) {
  if (simulationId == null) return null;

  const columns = await getSimulationRunColumns();
  if (!columns.external) return null;

  const row = await db("simulation_runs")
    .select("*")
    .where(tableRef("simulation_runs", columns.external), String(simulationId))
    .first();

  return normalizeAnalysisRow(row, columns);
}

export async function fetchSimulationResponsesAndViolations(simulationId) {
  if (simulationId == null) return { responses: [], violations: [] };
  const key = String(simulationId);

  const responseColumns = await getResponseColumns();
  const violationColumns = await getViolationColumns();

  const responses = responseColumns.external
    ? await db("simulation_responses")
        .select("*")
        .where(tableRef("simulation_responses", responseColumns.external), key)
        .orderBy(
          tableRef("simulation_responses", responseColumns.timestamp || responseColumns.id || "timestamp"),
          "asc"
        )
    : [];

  const violations = violationColumns.external
    ? await db("simulation_violations")
        .select("*")
        .where(tableRef("simulation_violations", violationColumns.external), key)
        .orderBy(
          tableRef("simulation_violations", violationColumns.created || violationColumns.id || "created_at"),
          "asc"
        )
    : [];

  return {
    responses: responses.map((row, idx) => ({
      id: pickValue(row, responseColumns.id, ["id"]) ?? idx,
      question_id: pickValue(row, responseColumns.question, ["question_id", "questionId"]),
      created_at: pickValue(row, responseColumns.timestamp, ["timestamp", "created_at", "createdAt"]),
      content: pickValue(row, responseColumns.response, [
        "response",
        "response_text",
        "content",
        "answer",
        "value",
        "body",
      ]),
      meta: pickValue(row, responseColumns.metadata, ["metadata", "meta"]) || null,
      raw: row,
    })),
    violations: violations.map((row, idx) => ({
      id: pickValue(row, violationColumns.id, ["id"]) ?? idx,
      type: pickValue(row, violationColumns.type, ["violation_type", "violationType", "type"]),
      created_at: pickValue(row, violationColumns.created, ["created_at", "createdAt", "timestamp"]),
      meta: pickValue(row, violationColumns.metadata, ["metadata", "meta"]) || null,
      raw: row,
    })),
  };
}

const buildAssetUrl = (path) => {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  const base = process.env.HONOR_LOCK_BASE_URL || "";
  if (!base) return null;
  return `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
};

export async function fetchIdentityCheck(simulationId) {
  if (simulationId == null) return { selfie_url: null, id_url: null };
  const key = String(simulationId);
  const columns = await getIdentityColumns();
  if (!columns.external) return { selfie_url: null, id_url: null };

  const row = await db("simulation_identity_checks")
    .select("*")
    .where(tableRef("simulation_identity_checks", columns.external), key)
    .orderBy(
      tableRef("simulation_identity_checks", columns.created || "created_at"),
      "desc"
    )
    .first();

  if (!row) return { selfie_url: null, id_url: null };
  const selfie =
    pickValue(row, columns.selfieUrl, ["selfie_url"]) ||
    pickValue(row, columns.selfiePath, ["selfie_path"]);
  const idDoc =
    pickValue(row, columns.idUrl, ["id_url"]) ||
    pickValue(row, columns.idPath, ["id_path"]);

  const selfieData = pickValue(row, columns.selfieData, ["selfie_data", "selfieData"]);
  const idData = pickValue(row, columns.idData, ["id_data", "idData"]);

  return {
    selfie_url: buildAssetUrl(selfie),
    id_url: buildAssetUrl(idDoc),
    selfie_data: selfieData || null,
    id_data: idData || null,
  };
}

const toStringOrNull = (value) => (value != null ? String(value) : null);
const buildQueryCandidates = (raw) => {
  const label = toStringOrNull(raw);
  if (!label) return null;
  const trimmed = label.trim();
  if (!trimmed) return null;
  const values = [trimmed];
  if (/^-?\d+$/.test(trimmed)) {
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric)) {
      values.push(numeric);
    }
  }
  return { label: trimmed, values: [...new Set(values)] };
};
const coerceNumeric = (value) => {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "bigint") {
    const asNumber = Number(value);
    return Number.isFinite(asNumber) ? asNumber : null;
  }
  if (typeof value === "string" && /^-?\d+$/.test(value.trim())) {
    const numeric = Number(value.trim());
    return Number.isFinite(numeric) ? numeric : null;
  }
  return null;
};
const applyCandidateWhere = (query, columnReference, candidates) => {
  if (!candidates?.values?.length || !columnReference) return query;
  return query.whereIn(columnReference, candidates.values);
};

export async function fetchSimulationArtifacts({
  externalSimulationId,
  simulationId,
  applicationId,
} = {}) {
  const columns = await getSimulationRunColumns();
  const identityColumns = await getIdentityColumns();

  let resolvedExternalIdRaw = toStringOrNull(externalSimulationId);
  let externalCandidates = buildQueryCandidates(resolvedExternalIdRaw);
  const simulationIdCandidates = buildQueryCandidates(simulationId);
  const applicationIdValue = coerceNumeric(applicationId);
  let analysisReport = null;

  const buildRunQuery = () => {
    const q = db("simulation_runs").select("*");
    if (externalCandidates && columns?.external) {
      applyCandidateWhere(q, tableRef("simulation_runs", columns.external), externalCandidates);
    } else if (simulationIdCandidates && columns?.simulation) {
      applyCandidateWhere(q, tableRef("simulation_runs", columns.simulation), simulationIdCandidates);
    } else if (applicationId != null && columns?.application) {
      if (applicationIdValue != null) {
        q.where(tableRef("simulation_runs", columns.application), applicationIdValue);
      } else {
        applyCandidateWhere(
          q,
          tableRef("simulation_runs", columns.application),
          buildQueryCandidates(applicationId)
        );
      }
    } else if (applicationId != null) {
      if (applicationIdValue != null) {
        q.where("application_id", applicationIdValue);
      } else {
        applyCandidateWhere(q, "application_id", buildQueryCandidates(applicationId));
      }
    }
    return q;
  };

  try {
    const runRow = await buildRunQuery()
      .orderBy(
        tableRef("simulation_runs", columns?.id || columns?.external || "id"),
        "desc"
      )
      .first();

    if (runRow) {
      if (!resolvedExternalIdRaw && columns?.external) {
        const ext = pickValue(runRow, columns.external, ["external_simulation_id", "externalSimulationId"]);
        if (ext != null) {
          resolvedExternalIdRaw = String(ext);
          externalCandidates = buildQueryCandidates(resolvedExternalIdRaw);
        }
      }
      analysisReport = pickValue(runRow, columns?.report, ["analysis_report", "analysisReport", "report"]) || null;
      if (typeof analysisReport === "string") {
        try {
          analysisReport = JSON.parse(analysisReport);
        } catch {
          /* leave as string */
        }
      }
    }
  } catch {
    /* ignore run fetch error */
  }

  debugLog("incoming", {
    externalSimulationId,
    simulationId,
    applicationId,
    resolvedExternalId: resolvedExternalIdRaw,
  });

  async function lookupIdentity(candidate) {
    if (!identityColumns?.external || !candidate?.values?.length) return null;
    try {
      const row = await db("simulation_identity_checks")
        .select("*")
        .whereIn(tableRef("simulation_identity_checks", identityColumns.external), candidate.values)
        .orderBy(
          tableRef("simulation_identity_checks", identityColumns.created || "created_at"),
          "desc"
        )
        .first();
      if (!row) {
        debugLog("identity lookup miss", { key: candidate.label });
        return null;
      }
      const selfie =
        pickValue(row, identityColumns.selfieUrl, ["selfie_url"]) ||
        pickValue(row, identityColumns.selfiePath, ["selfie_path"]);
      const idDoc =
        pickValue(row, identityColumns.idUrl, ["id_url"]) ||
        pickValue(row, identityColumns.idPath, ["id_path"]);
      const payload = {
        selfie_url: buildAssetUrl(selfie),
        id_url: buildAssetUrl(idDoc),
        selfie_data: pickValue(row, identityColumns.selfieData, ["selfie_data", "selfieData"]) || null,
        id_data: pickValue(row, identityColumns.idData, ["id_data", "idData"]) || null,
      };
      debugLog("identity lookup hit", {
        key: candidate.label,
        hasSelfie: !!payload.selfie_url || !!payload.selfie_data,
        hasId: !!payload.id_url || !!payload.id_data,
      });
      return payload;
    } catch (err) {
      debugLog("identity lookup error", { key: candidate?.label, error: err?.message || err });
      return null;
    }
  }
  const identityCandidates = [];
  const seenIdentityLabels = new Set();
  const pushIdentityKey = (raw) => {
    const candidate = buildQueryCandidates(raw);
    if (!candidate || seenIdentityLabels.has(candidate.label)) return;
    seenIdentityLabels.add(candidate.label);
    identityCandidates.push(candidate);
  };

  pushIdentityKey(resolvedExternalIdRaw || externalSimulationId);
  pushIdentityKey(simulationId);

  let identity = { selfie_url: null, id_url: null, selfie_data: null, id_data: null };
  for (const candidate of identityCandidates) {
    const found = await lookupIdentity(candidate);
    if (found) {
      identity = found;
      break;
    }
  }

  let violations = [];
  const primaryViolationKey = identityCandidates[0]?.label || toStringOrNull(simulationId);
  if (primaryViolationKey) {
    try {
      const { violations: list } = await fetchSimulationResponsesAndViolations(primaryViolationKey);
      if (Array.isArray(list)) {
        violations = list;
      }
    } catch (err) {
      debugLog("violations fetch error", { key: primaryViolationKey, error: err?.message || err });
    }
  } else {
    debugLog("violations skip — no key");
  }

  if (
    !identity?.selfie_url &&
    !identity?.selfie_data &&
    !identity?.id_url &&
    !identity?.id_data
  ) {
    debugLog("identity missing", { keys: identityCandidates.map((c) => c.label) });
  }

  return { analysis_report: analysisReport, identity, violations };
}

export { computeOverallFromReport, getSimulationRunColumns };
