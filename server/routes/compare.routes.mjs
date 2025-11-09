import { Router } from "express";
import { db } from "../db.mjs";
import { requireAuth } from "../middleware/requireAuth.mjs";
import { fetchSimulationAnalysis } from "../lib/supabaseAnalysis.mjs";
import { ensureCareerCardReport } from "../lib/careerCardReportService.mjs";

const GEMINI_API_KEY = (process.env.GEMINI_API_KEY || "").trim();
const GEMINI_MODEL = (process.env.GEMINI_MODEL || "gemini-2.0-flash-exp").trim();

const router = Router();

router.get("/jobs", requireAuth(), async (req, res, next) => {
  try {
    const jobs = await db("jobs")
      .where({ org_id: req.auth.orgId })
      .orderBy("created_at", "desc")
      .select("id", "title", "is_published");
    return res.json(jobs);
  } catch (err) {
    return next(err);
  }
});

router.get("/jobs/:jobId/candidates", requireAuth(), async (req, res, next) => {
  try {
    const jobId = Number(req.params.jobId);
    if (!Number.isInteger(jobId)) return res.status(400).json({ error: "bad_job_id" });

    const job = await db("jobs").where({ id: jobId }).first();
    if (!job || Number(job.org_id) !== Number(req.auth.orgId)) {
      return res.status(404).json({ error: "not_found" });
    }

    const candidates = await db("applications as ap")
      .leftJoin("simulations as sim", "sim.application_id", "ap.id")
      .where("ap.job_id", jobId)
      .select(
        "ap.id",
        "ap.candidate_name",
        "ap.status",
        "sim.id as simulation_id",
        "sim.status as simulation_status"
      )
      .orderBy("ap.created_at", "desc");

    return res.json(candidates.map((c) => ({
      id: String(c.id),
      name: c.candidate_name || `Candidate ${c.id}`,
      status: c.status,
      simulation_ready: Boolean(c.simulation_id && c.simulation_status === "ready"),
    })));
  } catch (err) {
    return next(err);
  }
});

function stringifySafe(payload) {
  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    return JSON.stringify({});
  }
}

async function buildCandidateContext({ candidateId, jobId }) {
  const candidate = await db("applications as ap")
    .leftJoin("jobs as j", "j.id", "ap.job_id")
    .leftJoin("organizations as o", "o.id", "j.org_id")
    .leftJoin("simulations as sim", "sim.application_id", "ap.id")
    .where("ap.id", candidateId)
    .andWhere("ap.job_id", jobId)
    .select(
      "ap.id",
      "ap.candidate_name",
      "ap.candidate_email",
      "ap.job_id",
      "ap.career_card",
      "j.title as job_title",
      "j.description as job_description",
      "o.company_description",
      "sim.id as simulation_id"
    )
    .first();
  if (!candidate) throw new Error("candidate_not_found");

  let simulationReport = null;
  if (candidate.simulation_id) {
    simulationReport = await fetchSimulationAnalysis({ simulationId: candidate.simulation_id });
  }

  const careerCardReport = await ensureCareerCardReport({
    candidateId: String(candidate.id),
  }).then((r) => r?.report).catch(() => null);

  return {
    id: String(candidate.id),
    name: candidate.candidate_name || `Candidate ${candidate.id}`,
    email: candidate.candidate_email || "",
    simulationReport,
    careerCardReport,
  };
}

router.post("/analyze", requireAuth(), async (req, res, next) => {
  try {
    const { jobId, candidateAId, candidateBId } = req.body || {};
    const jobNumeric = Number(jobId);
    if (!Number.isInteger(jobNumeric)) return res.status(400).json({ error: "bad_job_id" });
    const job = await db("jobs as j")
      .leftJoin("organizations as o", "o.id", "j.org_id")
      .where("j.id", jobNumeric)
      .select(
        "j.id",
        "j.title",
        "j.description",
        "o.company_description",
        "o.id as org_id"
      )
      .first();
    if (!job || Number(job.org_id) !== Number(req.auth.orgId)) {
      return res.status(404).json({ error: "job_not_found" });
    }
    if (!candidateAId || !candidateBId || String(candidateAId) === String(candidateBId)) {
      return res.status(400).json({ error: "select_two_candidates" });
    }

    const [candidateA, candidateB] = await Promise.all([
      buildCandidateContext({ candidateId: candidateAId, jobId: jobNumeric }),
      buildCandidateContext({ candidateId: candidateBId, jobId: jobNumeric }),
    ]);

    if (!GEMINI_API_KEY) {
      return res.status(500).json({ error: "gemini_config_missing" });
    }

    const prompt = `
You are an expert technical recruiter and hiring analyst for Recrio, tasked with evaluating candidates using AI-generated simulation reports and career card reports.

You will receive:
- Job Title: ${job.title}
- Job Description: ${job.description || "(not provided)"}
- Company Description: ${job.company_description || "(not provided)"}

Candidate A (${candidateA.name}):
Simulation Report => ${candidateA.simulationReport ? stringifySafe(candidateA.simulationReport.analysis_report ?? candidateA.simulationReport) : "Missing"}
Career Card Report => ${candidateA.careerCardReport ? stringifySafe(candidateA.careerCardReport.raw_report ?? candidateA.careerCardReport) : "Missing"}

Candidate B (${candidateB.name}):
Simulation Report => ${candidateB.simulationReport ? stringifySafe(candidateB.simulationReport.analysis_report ?? candidateB.simulationReport) : "Missing"}
Career Card Report => ${candidateB.careerCardReport ? stringifySafe(candidateB.careerCardReport.raw_report ?? candidateB.careerCardReport) : "Missing"}

${req.body?.customInstructions || ""}

=== Guidelines ===
• If a report is missing, note it explicitly.
• Compare candidates across relevant dimensions: technical execution, communication, problem-solving, domain fit, cultural or startup fit, etc.
• Highlight clear strengths/risks for each candidate.
• End with a verdict that chooses the stronger candidate (or "Insufficient data" if neither has usable data).

=== Output Format ===
- Overview: {summary}
- Strengths & Risks:
  - Candidate A: {bullets}
  - Candidate B: {bullets}
- Comparative Analysis: {brief paragraphs}
- Final Verdict: {clear recommendation sentence}

Finish with “Recommended: Candidate A” or “Recommended: Candidate B” (or “Insufficient data to decide”).
`.trim();

    const body = {
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }],
        },
      ],
    };

    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        GEMINI_MODEL
      )}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );

    if (!resp.ok) {
      const errorText = await resp.text().catch(() => "");
      return res.status(resp.status).json({ error: "gemini_failed", details: errorText });
    }

    const data = await resp.json();
    const reportText =
      data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("\n").trim() ||
      "Comparison unavailable.";

    return res.json({
      report: reportText,
      candidates: {
        a: { id: candidateA.id, name: candidateA.name },
        b: { id: candidateB.id, name: candidateB.name },
      },
      job: { id: job.id, title: job.title },
    });
  } catch (err) {
    return next(err);
  }
});

export default router;
