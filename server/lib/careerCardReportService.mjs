import crypto from "crypto";
import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { v5 as uuidv5, validate as uuidValidate } from "uuid";
import { db } from "../db.mjs";

const GEMINI_API_KEY = (process.env.GEMINI_API_KEY || "").trim();
const GEMINI_MODEL = (process.env.GEMINI_MODEL || "gemini-1.5-flash-latest").trim();

const SUPABASE_URL =
  (process.env.SUPABASE_URL ||
    process.env.SUPABASE_PROJECT_URL ||
    process.env.SUPABASE_REST_URL ||
    "")
    .trim()
    .replace(/\/+$/, "");
const SUPABASE_SERVICE_ROLE_KEY =
  (process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE ||
    "").trim();
const SUPABASE_REST_BASE = SUPABASE_URL ? `${SUPABASE_URL}/rest/v1` : "";
const SUPABASE_TABLE = "career_card_reports";

const DEFAULT_NAMESPACE = "4d9158ab-4720-4f53-9ce0-b4c6b0c8f0b2";
const CANDIDATE_NAMESPACE =
  (process.env.CANDIDATE_NAMESPACE_UUID || DEFAULT_NAMESPACE).trim();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_ROOT = path.resolve(__dirname, "..");

let hasCandidatesTableCache = null;
let hasApplicationsCandidateColumn = null;

const REQUIRED_CATEGORY_KEYS = [
  "technicalSkills",
  "experience",
  "culturalFit",
  "projectAlignment",
];

const MAX_PDF_TEXT_CHARS = 20000;
const MAX_INLINE_PDF_BYTES = 5 * 1024 * 1024;

const ServiceError = (message, status = 500, details) => {
  const err = new Error(message);
  err.status = status;
  if (details) err.details = details;
  return err;
};

const ensureSupabaseConfig = () => {
  if (!SUPABASE_REST_BASE || !SUPABASE_SERVICE_ROLE_KEY) {
    throw ServiceError("supabase_config_missing", 500, {
      missing_url: !SUPABASE_REST_BASE,
      missing_key: !SUPABASE_SERVICE_ROLE_KEY,
    });
  }
};

const ensureGeminiConfig = () => {
  if (!GEMINI_API_KEY) {
    throw ServiceError("gemini_config_missing", 500);
  }
};

const isUuid = (value) => {
  try {
    return uuidValidate(String(value));
  } catch {
    return false;
  }
};

const normalizeCandidateIdentifier = (raw) => {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) throw ServiceError("candidate_id_required", 400);

  if (isUuid(trimmed)) {
    return {
      candidateId: trimmed,
      supabaseId: trimmed,
      applicationId: null,
      raw: trimmed,
    };
  }

  const numeric = Number(trimmed);
  if (!Number.isInteger(numeric) || numeric <= 0) {
    throw ServiceError("invalid_candidate_id", 400);
  }

  if (!isUuid(CANDIDATE_NAMESPACE)) {
    throw ServiceError("invalid_candidate_namespace", 500);
  }

  const supabaseId = uuidv5(`application:${numeric}`, CANDIDATE_NAMESPACE);

  return {
    candidateId: trimmed,
    supabaseId,
    applicationId: numeric,
    raw: trimmed,
  };
};

const stableStringify = (value) => {
  if (value === null) return "null";
  const type = typeof value;
  if (type === "bigint") return JSON.stringify(value.toString());
  if (type === "number" || type === "boolean") return JSON.stringify(value);
  if (type === "string") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  if (type === "object") {
    const keys = Object.keys(value).sort();
    return `{${keys
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
};

const hashCareerCardInputs = ({ careerCardData, companyDescription, roleDescription }) => {
  const payload = {
    careerCardData,
    companyDescription: companyDescription || "",
    roleDescription: roleDescription || "",
  };
  return crypto.createHash("sha256").update(stableStringify(payload)).digest("hex");
};

async function resolveFilePath(storagePath = "") {
  if (!storagePath) return null;
  const attempts = [];
  if (path.isAbsolute(storagePath)) attempts.push(storagePath);
  attempts.push(path.resolve(process.cwd(), storagePath));
  attempts.push(path.resolve(SERVER_ROOT, storagePath));

  const basename = path.basename(storagePath);
  attempts.push(path.resolve(SERVER_ROOT, "uploads", basename));
  attempts.push(path.resolve(process.cwd(), "server", "uploads", basename));

  for (const attempt of attempts) {
    try {
      await fsp.access(attempt, fs.constants.R_OK);
      const stat = await fsp.stat(attempt);
      if (stat.isFile()) {
        return attempt;
      }
    } catch {
      /* try next */
    }
  }
  console.warn("[careerCard] Unable to resolve storage path", {
    storagePath,
    attempts,
  });
  return null;
}

const pdfEscapeMap = {
  n: "\n",
  r: "\r",
  t: "\t",
  b: "\b",
  f: "\f",
  "\\": "\\",
  "(": "(",
  ")": ")",
};

const decodePdfEscape = (char) => pdfEscapeMap[char] ?? char ?? "";

const extractStringsFromPdfBlock = (block = "") => {
  const results = [];
  let depth = 0;
  let current = "";
  let escape = false;

  for (let i = 0; i < block.length; i += 1) {
    const ch = block[i];

    if (depth > 0) {
      if (escape) {
        current += decodePdfEscape(ch);
        escape = false;
        continue;
      }
      if (ch === "\\") {
        escape = true;
        continue;
      }
      if (ch === "(") {
        depth += 1;
        current += ch;
        continue;
      }
      if (ch === ")") {
        depth -= 1;
        if (depth === 0) {
          results.push(current);
          current = "";
          continue;
        }
        if (depth < 0) {
          depth = 0;
          continue;
        }
        current += ch;
        continue;
      }
      current += ch;
      continue;
    }

    if (ch === "(") {
      depth = 1;
      current = "";
    }
  }

  return results;
};

const normalizeExtractedText = (text = "") =>
  text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\u0000/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const extractTextFromPdfBuffer = (buffer) => {
  if (!buffer || !buffer.length) return "";
  const raw = buffer.toString("latin1");
  const regex = /BT([\s\S]*?)ET/g;
  const fragments = [];
  let match;
  while ((match = regex.exec(raw))) {
    const block = match[1];
    const strings = extractStringsFromPdfBlock(block);
    if (strings.length) {
      fragments.push(strings.join(" ").trim());
    }
  }
  if (!fragments.length) return "";
  const combined = normalizeExtractedText(fragments.join("\n"));
  return combined.slice(0, MAX_PDF_TEXT_CHARS);
};

async function hasTable(tableName) {
  if (tableName === "candidates" && hasCandidatesTableCache != null) {
    return hasCandidatesTableCache;
  }
  let exists = false;
  try {
    exists = await db.schema.hasTable(tableName);
  } catch {
    exists = false;
  }
  if (tableName === "candidates") {
    hasCandidatesTableCache = exists;
  }
  return exists;
}

async function applicationsHasColumn(columnName) {
  if (hasApplicationsCandidateColumn != null && columnName === "candidate_uuid") {
    return hasApplicationsCandidateColumn;
  }
  try {
    const row = await db("information_schema.columns")
      .where({ table_name: "applications", table_schema: "public", column_name: columnName })
      .count("* as count")
      .first();
    const exists = Number(row?.count || 0) > 0;
    if (columnName === "candidate_uuid") {
      hasApplicationsCandidateColumn = exists;
    }
    return exists;
  } catch {
    if (columnName === "candidate_uuid") hasApplicationsCandidateColumn = false;
    return false;
  }
}

const baseApplicationQuery = () =>
  db("applications as ap")
    .leftJoin("jobs as j", "j.id", "ap.job_id")
    .leftJoin("organizations as o", "o.id", "j.org_id")
    .select(
      "ap.id as application_id",
      "ap.career_card",
      "ap.candidate_email",
      "ap.candidate_name",
      "ap.updated_at as application_updated_at",
      "j.id as job_id",
      "j.description as role_description",
      "j.title as job_title",
      "o.id as org_id",
      "o.name as company_name",
      "o.company_description",
      db.raw("o.company_description as org_description")
    );

async function fetchApplicationForCandidate({ applicationId, supabaseId }) {
  if (applicationId != null) {
    return baseApplicationQuery().where("ap.id", applicationId).first();
  }

  const hasCandidateUuidColumn = await applicationsHasColumn("candidate_uuid");
  if (hasCandidateUuidColumn) {
    const row = await baseApplicationQuery().where("ap.candidate_uuid", supabaseId).first();
    if (row) return row;
  }

  if (await hasTable("candidates")) {
    const row = await db("candidates as c")
      .join("applications as ap", "ap.id", "c.application_id")
      .leftJoin("jobs as j", "j.id", "ap.job_id")
      .leftJoin("organizations as o", "o.id", "j.org_id")
      .where("c.id", supabaseId)
      .select(
        "ap.id as application_id",
        "ap.career_card",
        "ap.candidate_email",
        "ap.candidate_name",
        "ap.updated_at as application_updated_at",
        "j.id as job_id",
        "j.description as role_description",
        "j.title as job_title",
        "o.id as org_id",
        "o.name as company_name",
        "o.company_description",
        db.raw("o.company_description as org_description")
      )
      .first();
    if (row) return row;
  }
  return null;
}

const parseJsonSafe = (value) => {
  if (!value) return null;
  if (typeof value === "object") return value;
  if (typeof value !== "string") return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

async function getCareerCardData(application) {
  if (!application) return null;
  if (application.career_card) {
    return typeof application.career_card === "object"
      ? application.career_card
      : parseJsonSafe(application.career_card);
  }

  if (!application.application_id) return null;

  const fileRow = await db("application_files")
    .where({ application_id: application.application_id, kind: "career_card" })
    .orderBy("id", "desc")
    .first();

  if (!fileRow) return null;

  const resolved = await resolveFilePath(fileRow.storage_path);
  if (!resolved) {
    console.warn("[careerCard] Storage path not found", {
      applicationId: application.application_id,
      storage_path: fileRow.storage_path,
    });
    return null;
  }

  if (fileRow.mime === "application/json") {
    try {
      const raw = await fsp.readFile(resolved, "utf8");
      return JSON.parse(raw);
    } catch (err) {
      console.warn("[careerCard] Failed to parse stored JSON file", {
        path: resolved,
        error: err?.message || err,
      });
      return null;
    }
  }

  if (fileRow.mime === "application/pdf") {
    try {
      const buffer = await fsp.readFile(resolved);
      let text = extractTextFromPdfBuffer(buffer);
      if (!text) {
        const fallback = normalizeExtractedText(buffer.toString("utf8"));
        if (fallback) {
          text = fallback.slice(0, MAX_PDF_TEXT_CHARS);
        }
      }
      const inlineAllowed = buffer.length <= MAX_INLINE_PDF_BYTES;
      const inlineDataBase64 = inlineAllowed ? buffer.toString("base64") : null;

      return {
        format: text ? "pdf_extracted_text" : "pdf_attachment",
        filename: fileRow.original_name,
        mime: fileRow.mime,
        text: text || "PDF text extraction failed automatically; refer to inline_data if available.",
        approx_characters: text ? text.length : null,
        extracted_at: new Date().toISOString(),
        source_path: fileRow.storage_path,
        size_bytes: Number(fileRow.size_bytes || buffer.length),
        inline_data_base64: inlineDataBase64,
        inline_data_truncated: !inlineAllowed,
      };
    } catch (err) {
      console.warn("[careerCard] Failed to extract PDF text", {
        path: resolved,
        error: err?.message || err,
      });
      try {
        const buffer = await fsp.readFile(resolved);
        return {
          format: "pdf_attachment",
          filename: fileRow.original_name,
          mime: fileRow.mime,
          text: "PDF text extraction threw an error; raw bytes attached.",
          approx_characters: null,
          extracted_at: new Date().toISOString(),
          source_path: fileRow.storage_path,
          size_bytes: Number(fileRow.size_bytes || buffer.length),
          inline_data_base64: buffer.length <= MAX_INLINE_PDF_BYTES ? buffer.toString("base64") : null,
          inline_data_truncated: buffer.length > MAX_INLINE_PDF_BYTES,
          extraction_error: err?.message || String(err),
        };
      } catch (fallbackErr) {
        console.warn("[careerCard] Secondary PDF read failed", fallbackErr?.message || fallbackErr);
        return null;
      }
    }
  }

  return null;
}

const cleanText = (value) => {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim();
};

async function buildCandidateContext(identifiers) {
  const application = await fetchApplicationForCandidate(identifiers);
  if (!application) throw ServiceError("candidate_not_found", 404);

  const careerCardData = await getCareerCardData(application);
  if (!careerCardData) {
    console.warn("[careerCard] Missing structured data after file scan", {
      applicationId: application.application_id,
    });
    throw ServiceError("career_card_missing", 409);
  }

  const companyDescription =
    cleanText(application.company_description) ||
    cleanText(application.org_description) ||
    "";
  const roleParts = [cleanText(application.role_description)];
  if (application.job_title) roleParts.push(cleanText(application.job_title));
  const roleDescription = roleParts.filter(Boolean).join("\n") || "";

  const hashCard = careerCardData?.inline_data_base64
    ? { ...careerCardData, inline_data_base64: "__inline_pdf__" }
    : careerCardData;

  const cardHash = hashCareerCardInputs({
    careerCardData: hashCard,
    companyDescription,
    roleDescription,
  });

  return {
    applicationId: application.application_id,
    candidateName: application.candidate_name,
    candidateEmail: application.candidate_email,
    careerCardData,
    companyDescription,
    roleDescription,
    jobTitle: application.job_title || "",
    companyName: application.company_name || "",
    cardHash,
    jobId: application.job_id,
    orgId: application.org_id,
    applicationUpdatedAt: application.application_updated_at,
  };
}

const supabaseHeaders = () => ({
  apikey: SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
  "Content-Type": "application/json",
  Accept: "application/json",
  Prefer: "return=representation",
});

async function fetchSupabaseReportRow(candidateSupabaseId) {
  ensureSupabaseConfig();
  const url = new URL(`${SUPABASE_REST_BASE}/${SUPABASE_TABLE}`);
  url.searchParams.set("select", "*");
  url.searchParams.set("candidate_id", `eq.${candidateSupabaseId}`);
  url.searchParams.set("limit", "1");

  const resp = await fetch(url.toString(), {
    method: "GET",
    headers: supabaseHeaders(),
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw ServiceError("supabase_fetch_failed", resp.status, { body });
  }
  const rows = await resp.json();
  if (!Array.isArray(rows) || !rows.length) return null;
  return normalizeSupabaseRow(rows[0]);
}

const normalizeSupabaseRow = (row) => {
  if (!row) return null;
  const parsedCategory =
    typeof row.category_scores === "string" ? parseJsonSafe(row.category_scores) : row.category_scores;
  let rawReport = row.raw_report;
  if (typeof rawReport === "string") rawReport = parseJsonSafe(rawReport);
  const strengths = Array.isArray(row.strengths)
    ? row.strengths
    : parseJsonSafe(row.strengths) || [];
  const improvements = Array.isArray(row.improvements)
    ? row.improvements
    : parseJsonSafe(row.improvements) || [];

  return {
    id: row.id,
    candidate_id: row.candidate_id,
    overall_score: coerceScore(row.overall_score),
    category_scores: parsedCategory || {},
    strengths,
    improvements,
    overall_feedback: row.overall_feedback || "",
    raw_report: rawReport || null,
    generated_at: row.generated_at || row.created_at || null,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
    metadata_hash: rawReport?.metadata?.card_hash || null,
  };
};

const coerceScore = (value) => {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return null;
  if (num < 0) return 0;
  if (num > 100) return 100;
  return Number(num.toFixed(2));
};

const normalizeCategoryScores = (raw = {}) => {
  const result = {};
  for (const key of REQUIRED_CATEGORY_KEYS) {
    const source = raw[key] || {};
    result[key] = {
      score: coerceScore(source.score),
      feedback: cleanText(source.feedback || ""),
    };
  }
  return result;
};

const toStringArray = (value) => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? cleanText(item) : ""))
    .filter(Boolean);
};

const callGemini = async ({ careerCardData, companyDescription, roleDescription }) => {
  ensureGeminiConfig();
  const url = new URL(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      GEMINI_MODEL
    )}:generateContent`
  );
  url.searchParams.set("key", GEMINI_API_KEY);

  const systemPrompt = `You are an expert career advisor and recruiter. Analyze how well a candidate's career card aligns with a specific company and role.

Your analysis should be thorough, fair, and constructive. Consider:
- Technical skills match
- Experience relevance
- Cultural fit based on work styles and values
- Project alignment with company needs
- Overall qualifications

Be specific and provide actionable feedback.`;

  const sanitizedCard =
    careerCardData && typeof careerCardData === "object"
      ? (() => {
          const clone = { ...careerCardData };
          if (clone.inline_data_base64) {
            clone.inline_data_attached = true;
            delete clone.inline_data_base64;
          }
          return clone;
        })()
      : careerCardData;

  const userPrompt = `Analyze this career card for alignment with the company and role:

COMPANY DESCRIPTION:
${companyDescription || "(not provided)"}

ROLE DESCRIPTION:
${roleDescription || "(not provided)"}

CAREER CARD:
${JSON.stringify(sanitizedCard, (_key, value) =>
    typeof value === "bigint" ? value.toString() : value,
  2)}

Provide a comprehensive scoring and feedback.`;

  const inlineDataBase64 =
    typeof careerCardData?.inline_data_base64 === "string"
      ? careerCardData.inline_data_base64
      : null;
  const inlineMime = careerCardData?.mime || "application/pdf";

  const body = {
    system_instruction: {
      parts: [{ text: systemPrompt }],
    },
    contents: [
      {
        role: "user",
        parts: inlineDataBase64
          ? [
              { text: userPrompt },
              {
                inline_data: {
                  mime_type: inlineMime,
                  data: inlineDataBase64,
                },
              },
            ]
          : [{ text: userPrompt }],
      },
    ],
    tools: [
      {
        function_declarations: [
          {
            name: "score_career_card",
            description: "Provide a detailed score and feedback for career card alignment",
            parameters: {
              type: "object",
              properties: {
                overallScore: {
                  type: "number",
                  description: "Overall alignment score from 0-100",
                },
                categoryScores: {
                  type: "object",
                  properties: {
                    technicalSkills: {
                      type: "object",
                      properties: {
                        score: { type: "number" },
                        feedback: { type: "string" },
                      },
                      required: ["score", "feedback"],
                    },
                    experience: {
                      type: "object",
                      properties: {
                        score: { type: "number" },
                        feedback: { type: "string" },
                      },
                      required: ["score", "feedback"],
                    },
                    culturalFit: {
                      type: "object",
                      properties: {
                        score: { type: "number" },
                        feedback: { type: "string" },
                      },
                      required: ["score", "feedback"],
                    },
                    projectAlignment: {
                      type: "object",
                      properties: {
                        score: { type: "number" },
                        feedback: { type: "string" },
                      },
                      required: ["score", "feedback"],
                    },
                  },
                  required: ["technicalSkills", "experience", "culturalFit", "projectAlignment"],
                },
                strengths: {
                  type: "array",
                  items: { type: "string" },
                  description: "Key strengths for this role",
                },
                improvements: {
                  type: "array",
                  items: { type: "string" },
                  description: "Areas for improvement or gaps",
                },
                overallFeedback: {
                  type: "string",
                  description: "Comprehensive summary feedback",
                },
              },
              required: ["overallScore", "categoryScores", "strengths", "improvements", "overallFeedback"],
              additionalProperties: false,
            },
          },
        ],
      },
    ],
    tool_config: { function_call: { name: "score_career_card" } },
  };

  const resp = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errorBody = await resp.text().catch(() => "");
    throw ServiceError("gemini_request_failed", resp.status, { body: errorBody });
  }
  const data = await resp.json();
  const candidates = data?.candidates || [];
  const parts = candidates[0]?.content?.parts || [];
  const functionPart = parts.find((part) => part?.functionCall);
  const args = functionPart?.functionCall?.args;
  const parsed = typeof args === "string" ? parseJsonSafe(args) : args;
  if (!parsed) {
    throw ServiceError("gemini_missing_tool_call", 502);
  }
  return { response: data, scoring: parsed };
};

async function storeSupabaseReport({
  supabaseId,
  cardHash,
  scoring,
  context,
  geminiResponse,
}) {
  ensureSupabaseConfig();
  const payload = {
    candidate_id: supabaseId,
    overall_score: coerceScore(scoring.overallScore),
    category_scores: normalizeCategoryScores(scoring.categoryScores),
    strengths: toStringArray(scoring.strengths),
    improvements: toStringArray(scoring.improvements),
    overall_feedback: cleanText(scoring.overallFeedback),
    raw_report: {
      source: "gemini",
      gemini_model: GEMINI_MODEL,
      scoring,
      metadata: {
        card_hash: cardHash,
        generated_at: new Date().toISOString(),
        candidate_identifier: context.applicationId,
        application_id: context.applicationId,
        job_id: context.jobId,
        org_id: context.orgId,
        company_name: context.companyName,
        job_title: context.jobTitle,
      },
      gemini_response: geminiResponse,
    },
    generated_at: new Date().toISOString(),
  };

  const resp = await fetch(`${SUPABASE_REST_BASE}/${SUPABASE_TABLE}`, {
    method: "POST",
    headers: {
      ...supabaseHeaders(),
      Prefer: "return=representation,resolution=merge-duplicates",
    },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw ServiceError("supabase_upsert_failed", resp.status, { body });
  }
  const rows = await resp.json();
  if (Array.isArray(rows) && rows[0]) {
    return normalizeSupabaseRow(rows[0]);
  }

  return fetchSupabaseReportRow(supabaseId);
}

export async function ensureCareerCardReport({ candidateId, forceRefresh = false } = {}) {
  const identifiers = normalizeCandidateIdentifier(candidateId);
  const context = await buildCandidateContext(identifiers);
  const existing = await fetchSupabaseReportRow(identifiers.supabaseId);

  if (
    existing &&
    !forceRefresh &&
    existing.metadata_hash &&
    existing.metadata_hash === context.cardHash
  ) {
    return { status: "cached", report: existing };
  }

  const { response, scoring } = await callGemini({
    careerCardData: context.careerCardData,
    companyDescription: context.companyDescription,
    roleDescription: context.roleDescription,
  });

  const stored = await storeSupabaseReport({
    supabaseId: identifiers.supabaseId,
    cardHash: context.cardHash,
    scoring,
    context,
    geminiResponse: response,
  });

  return { status: existing ? "refreshed" : "created", report: stored };
}

export async function fetchCareerCardReport(candidateId) {
  const identifiers = normalizeCandidateIdentifier(candidateId);
  const report = await fetchSupabaseReportRow(identifiers.supabaseId);
  return report;
}

export const __testables = {
  stableStringify,
  hashCareerCardInputs,
  normalizeCategoryScores,
  toStringArray,
  normalizeCandidateIdentifier,
  extractTextFromPdfBuffer,
  extractStringsFromPdfBlock,
  decodePdfEscape,
};
