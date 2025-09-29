// server/routes/ats/applications.routes.mjs
import { Router } from "express";
import { z } from "zod";
import { db } from "../../db.mjs";
import { upload } from "../../middleware/upload.mjs";
import { requireAuth } from "../../middleware/requireAuth.mjs";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const r = Router();

/* ------------------------------------------------------------------------- */
/* best-effort rate-limit import with safe fallback                           */
/* ------------------------------------------------------------------------- */
let publicLimiter = (_req, _res, next) => next(); // no-op fallback
let _warnedLimiter = false;
try {
  const mod = await import("../../middleware/rateLimit.mjs");
  const maybe =
    (mod && mod.publicLimiter) ||
    (mod && mod.default && mod.default.publicLimiter);
  if (typeof maybe === "function") {
    publicLimiter = maybe;
  } else if (!_warnedLimiter) {
    _warnedLimiter = true;
    console.warn(
      "[applications.routes] publicLimiter not found on ../../middleware/rateLimit.mjs — continuing without rate limiting."
    );
  }
} catch (e) {
  if (!_warnedLimiter) {
    _warnedLimiter = true;
    console.warn(
      "[applications.routes] failed to load ../../middleware/rateLimit.mjs — continuing without rate limiting.",
      e?.message || e
    );
  }
}

/* ------------------------------------------------------------------------- */
/* helpers                                                                   */
/* ------------------------------------------------------------------------- */

function cleanStr(v, max = 160) {
  if (typeof v !== "string") return v;
  let s = v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
  s = s.replace(/\s+/g, " ").trim();
  if (s.length > max) s = s.slice(0, max);
  return s;
}
const emptyToUndef = (v) => (v === "" ? undefined : v);

const WorkAuthEnum = ["Authorized (no sponsorship)", "Requires sponsorship"];
const WorkPrefEnum = ["Remote", "Hybrid", "Onsite"];

const httpUrlSchema = z
  .preprocess((v) => (typeof v === "string" ? cleanStr(v, 255) : v),
    z.union([z.string().max(255), z.literal(""), z.undefined()]))
  .transform((v) => (v ? v : null))
  .refine((v) => !v || /^https?:\/\//i.test(v), { message: "Invalid URL (http/https only)" })
  .refine((v) => !v || (() => { try { new URL(v); return true; } catch { return false; } })(), { message: "Invalid URL" });

const ApplicationSchema = z.object({
  candidate_name: z.preprocess((v) => (typeof v === "string" ? cleanStr(v, 160) : v),
    z.string().min(1, "Name required").max(160)),
  candidate_email: z.preprocess((v) => (typeof v === "string" ? cleanStr(v, 160) : v),
    z.string().email("Invalid email").max(160)),
  phone: z.preprocess((v) => (typeof v === "string" ? cleanStr(v, 24) : v),
    z.union([z.string().regex(/^[0-9+()\-\s]{7,24}$/, "Invalid phone"), z.literal(""), z.undefined()]))
    .transform((v) => (v ? v : null)),
  city: z.preprocess((v) => (typeof v === "string" ? cleanStr(v, 80) : v),
    z.union([z.string(), z.literal(""), z.undefined()])).transform((v) => (v ? v : null)),
  country: z.preprocess((v) => (typeof v === "string" ? cleanStr(v, 80) : v),
    z.union([z.string(), z.literal(""), z.undefined()])).transform((v) => (v ? v : null)),
  linkedin_url: httpUrlSchema,
  portfolio_url: httpUrlSchema,
  years_experience: z.preprocess((v) => (v === "" || v === undefined ? undefined : Number(v)),
    z.number().min(0).max(60).optional()),
  current_title: z.preprocess((v) => (typeof v === "string" ? cleanStr(v, 120) : v),
    z.union([z.string(), z.literal(""), z.undefined()])).transform((v) => (v ? v : null)),
  salary_expectation: z.preprocess((v) => (typeof v === "string" ? cleanStr(v, 60) : v),
    z.union([z.string(), z.literal(""), z.undefined()])).transform((v) => (v ? v : null)),

  // ✅ REQUIRED on server; also coerce "" → undefined so we get the custom required error
  work_auth: z.preprocess(
    emptyToUndef,
    z.enum(WorkAuthEnum, { required_error: "Work authorization is required." })
  ),

  // ✅ OPTIONAL; coerce "" → undefined, then store as NULL
  work_pref: z.preprocess(
    emptyToUndef,
    z.union([z.enum(WorkPrefEnum), z.undefined()])
  ).transform((v) => v ?? null),

  dob: z.preprocess((v) => (typeof v === "string" ? v.trim() : v),
    z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid DOB format"), z.literal(""), z.undefined()]))
    .transform((v) => (v ? v : null))
    .refine((v) => !v || (() => {
      const d = new Date(v);
      if (Number.isNaN(d.getTime())) return false;
      const cutoff = new Date(); cutoff.setFullYear(cutoff.getFullYear() - 16);
      return d <= cutoff;
    })(), { message: "Must be at least 16" }),

  relocate: z.union([z.literal("on"), z.literal("true"), z.literal("1"), z.undefined()]).transform((v) => !!v),

  website: z.string().optional().transform((v) => (v ?? "").trim()), // honeypot
});

/* ------------------------------------------------------------------------- */
/* POST /api/applications/public/:jobId                                      */
/* ------------------------------------------------------------------------- */

r.post(
  "/public/:jobId",
  publicLimiter,
  upload.fields([
    { name: "careerCard", maxCount: 1 },
    { name: "resume", maxCount: 1 },
  ]),
  async (req, res, next) => {
    try {
      const jobId = Number(req.params.jobId);
      if (!Number.isInteger(jobId) || jobId <= 0) {
        return res.status(400).json({ error: "bad_job_id" });
      }

      const job = await db("jobs").where({ id: jobId, is_published: true }).first();
      if (!job) return res.status(404).json({ error: "not_found_job" });

      const parsed = ApplicationSchema.safeParse(req.body);
      if (!parsed.success) {
        const issue = parsed.error.issues?.[0];
        const field = issue?.path?.[0] || "form";
        const message = issue?.message || "Invalid form submission";
        return res.status(400).json({ field, error: message });
      }
      const data = parsed.data;

      if (data.website) return res.status(400).json({ field: "website", error: "Rejected" });

      const cc = req.files?.careerCard?.[0] || null;
      const cv = req.files?.resume?.[0] || null;

      const email = data.candidate_email.toLowerCase();
      const ua = req.get("user-agent") || "";
      const ip = req.ip;

      const applicationId = await db.transaction(async (trx) => {
        const [app] = await trx("applications")
          .insert({
            job_id: jobId,
            candidate_name: data.candidate_name,
            candidate_email: email,
            phone: data.phone,
            city: data.city,
            country: data.country,
            linkedin_url: data.linkedin_url,
            portfolio_url: data.portfolio_url,
            years_experience: data.years_experience ?? null,
            current_title: data.current_title,
            salary_expectation: data.salary_expectation,
            work_auth: data.work_auth,           // required
            work_pref: data.work_pref,           // may be NULL
            dob: data.dob,
            relocate: data.relocate ?? false,
            status: "applied",
            source: "public_apply",
            ai_scores: null,
            ai_summary: "AI report will appear here after parsing (mock).",
            career_card: null,
          })
          .returning(["id"]);
        const appId = app.id;

        const storagePath = (file) => `uploads/${file.filename}`;
        const rows = [];
        if (cc) {
          rows.push({
            application_id: appId,
            kind: "career_card",
            original_name: cc.originalname,
            mime: cc.mimetype,
            size_bytes: cc.size,
            storage_provider: "local",
            storage_path: storagePath(cc),
          });
        }
        if (cv) {
          rows.push({
            application_id: appId,
            kind: "resume",
            original_name: cv.originalname,
            mime: cv.mimetype,
            size_bytes: cv.size,
            storage_provider: "local",
            storage_path: storagePath(cv),
          });
        }
        if (rows.length) await trx("application_files").insert(rows);

        await trx("application_events").insert({
          application_id: appId,
          event_type: "status_change",
          data: { from: null, to: "applied", source: "public_apply", ip, ua },
        });

        return appId;
      });

      return res.json({ ok: true, application_id: applicationId });
    } catch (e) {
      if (e && e.code === "23505") {
        return res.status(409).json({ field: "candidate_email", error: "duplicate_application" });
      }
      return next(e);
    }
  }
);

/* ------------------------------------------------------------------------- */
/* GET /api/applications/job/:jobId (recruiter list, ranked by AI)           */
/* ------------------------------------------------------------------------- */

r.get("/job/:jobId", requireAuth(), async (req, res, next) => {
  try {
    const jobId = Number(req.params.jobId);
    if (!Number.isInteger(jobId) || jobId <= 0) {
      return res.status(400).json({ error: "bad_job_id" });
    }

    const job = await db("jobs").where({ id: jobId }).first();
    if (!job || Number(job.org_id) !== Number(req.auth.orgId)) {
      return res.status(404).json({ error: "not_found" });
    }

    // Join simulation_feedbacks to obtain final_score when present
    const rows = await db("applications as a")
      .leftJoin("simulation_feedbacks as sf", "sf.application_id", "a.id")
      .where("a.job_id", jobId)
      .orderBy("a.id", "desc")
      .select(
        "a.id",
        "a.job_id",
        "a.candidate_name",
        "a.candidate_email",
        "a.status",
        "a.ai_summary",
        "a.ai_scores",
        "a.created_at",
        "sf.final_score as final_score"
      );

    // Normalize a single comparable numeric score (0..100).
    const toScore = (row) => {
      if (row?.final_score != null && Number.isFinite(Number(row.final_score))) {
        return Number(row.final_score);
      }
      const v = row?.ai_scores?.overall ?? row?.ai_scores?.score ?? null;
      const n = typeof v === "number" ? v : Number(v);
      if (!Number.isFinite(n)) return null;
      return n <= 1 ? Math.round(n * 100) : Math.round(n);
    };

    // Sort: scored first (desc), then the rest by most recent
    rows.sort((a, b) => {
      const sa = toScore(a);
      const sb = toScore(b);
      if (sa == null && sb == null) return new Date(b.created_at) - new Date(a.created_at);
      if (sa == null) return 1;
      if (sb == null) return -1;
      return sb - sa;
    });

    return res.json(
      rows.map((r) => ({
        id: r.id,
        job_id: r.job_id,
        candidate_name: r.candidate_name,
        candidate_email: r.candidate_email,
        status: r.status,
        ai_summary: r.ai_summary,
        ai_scores: r.ai_scores,        // keep legacy payload
        final_score: r.final_score,    // NEW (0..100 when available)
        ai_score: toScore(r),          // NEW normalized numeric 0..100 (or null)
        created_at: r.created_at,
      }))
    );
  } catch (e) {
    return next(e);
  }
});

/* ------------------------------------------------------------------------- */
/* GET /api/applications/:id (recruiter details)                              */
/* ------------------------------------------------------------------------- */

r.get("/:id", requireAuth(), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "bad_id" });
    }

    const a = await db("applications as ap")
      .join("jobs as j", "j.id", "ap.job_id")
      .join("organizations as o", "o.id", "j.org_id")
      .leftJoin("simulation_feedbacks as sf", "sf.application_id", "ap.id")
      .where("ap.id", id)
      .select(
        "ap.*",
        "j.title as job_title",
        "j.slug as job_slug",
        "o.slug as org_slug",
        "j.org_id as job_org_id",
        "sf.final_score as final_score"
      )
      .first();

    if (!a || Number(a.job_org_id) !== Number(req.auth.orgId)) {
      return res.status(404).json({ error: "not_found" });
    }

    const files = await db("application_files")
      .where({ application_id: id })
      .select("kind", "original_name", "mime", "size_bytes");

    const careerCard = files.find((f) => f.kind === "career_card") || null;
    const resume = files.find((f) => f.kind === "resume") || null;

    const events = await db("application_events")
      .where({ application_id: id })
      .orderBy("id", "desc")
      .limit(20)
      .select("event_type", "data", "created_at");

    return res.json({
      id: a.id,
      job_id: a.job_id,
      job_title: a.job_title,
      job_slug: a.job_slug,
      org_slug: a.org_slug,
      candidate_name: a.candidate_name,
      candidate_email: a.candidate_email,
      phone: a.phone,
      city: a.city,
      country: a.country,
      linkedin_url: a.linkedin_url,
      portfolio_url: a.portfolio_url,
      years_experience: a.years_experience,
      current_title: a.current_title,
      salary_expectation: a.salary_expectation,
      work_auth: a.work_auth,
      work_pref: a.work_pref,
      dob: a.dob,
      relocate: a.relocate,
      status: a.status,
      ai_summary: a.ai_summary,
      ai_scores: a.ai_scores,
      final_score: a.final_score ?? null,
      created_at: a.created_at,
      files: {
        career_card: careerCard
          ? { name: careerCard.original_name, mime: careerCard.mime, size: Number(careerCard.size_bytes) }
          : null,
        resume: resume
          ? { name: resume.original_name, mime: resume.mime, size: Number(resume.size_bytes) }
          : null,
      },
      events,
    });
  } catch (e) {
    return next(e);
  }
});

/* ------------------------------------------------------------------------- */
/* PATCH /api/applications/:id/status                                         */
/* ------------------------------------------------------------------------- */

r.patch("/:id/status", requireAuth(), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const statusRaw = typeof req.body?.status === "string" ? req.body.status : "";
    const status = cleanStr(statusRaw, 16);
    const allowed = ["applied", "shortlisted", "interview", "rejected", "hired"];
    if (!allowed.includes(status)) {
      return res.status(400).json({ error: "bad_status" });
    }

    const updated = await db.transaction(async (trx) => {
      const app = await trx("applications").where({ id }).first().forUpdate();
      if (!app) return null;

      const job = await trx("jobs").where({ id: app.job_id }).first();
      if (!job || Number(job.org_id) !== Number(req.auth.orgId)) {
        return "forbidden";
      }

      if (app.status !== status) {
        await trx("applications").where({ id }).update({ status, updated_at: trx.fn.now() });
        await trx("application_events").insert({
          application_id: id,
          event_type: "status_change",
          data: { from: app.status, to: status, actor_user_id: req.auth.userId },
        });
      }
      return true;
    });

    if (updated === "forbidden") return res.status(403).json({ error: "forbidden" });
    if (!updated) return res.status(404).json({ error: "not_found" });
    return res.json({ updated: true });
  } catch (e) {
    return next(e);
  }
});

/* ------------------------------------------------------------------------- */
/* GET /api/applications/metrics/overview  (org-wide AI metrics)             */
/* ------------------------------------------------------------------------- */

r.get("/metrics/overview", requireAuth(), async (req, res, next) => {
  try {
    const orgId = Number(req.auth.orgId);

    // Overall averages (all time) for this org
    const overall = await db("applications as a")
      .join("jobs as j", "j.id", "a.job_id")
      .leftJoin("simulation_feedbacks as sf", "sf.application_id", "a.id")
      .where("j.org_id", orgId)
      .whereNotNull("sf.final_score")
      .select(db.raw("AVG(sf.final_score)::float as avg_score"), db.raw("COUNT(sf.final_score)::int as completed"))
      .first();

    // Top jobs over last 30 days by avg final_score
    const top = await db("applications as a")
      .join("jobs as j", "j.id", "a.job_id")
      .leftJoin("simulation_feedbacks as sf", "sf.application_id", "a.id")
      .where("j.org_id", orgId)
      .whereNotNull("sf.final_score")
      .andWhere(function () {
        // prefer sf.created_at if exists; otherwise use application created_at
        this.whereRaw(`COALESCE(sf.created_at, a.created_at) >= NOW() - INTERVAL '30 days'`);
      })
      .groupBy("j.id", "j.title")
      .select(
        "j.id as job_id",
        "j.title as job_title",
        db.raw("AVG(sf.final_score)::float as avg_score"),
        db.raw("COUNT(sf.final_score)::int as completed")
      )
      .orderBy("avg_score", "desc")
      .limit(5);

    res.json({
      avg_final_score: overall?.avg_score ?? null,      // float 0..100 or null
      completed_count: overall?.completed ?? 0,         // integer
      top_jobs_30d: top,                                // [{job_id, job_title, avg_score, completed}]
    });
  } catch (e) {
    next(e);
  }
});

/* ------------------------------------------------------------------------- */
/* GET /api/applications/:id/file/:kind  (secure preview/download)           */
/* ------------------------------------------------------------------------- */
r.get("/:id/file/:kind", requireAuth(), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const kind = String(req.params.kind || "").toLowerCase();

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "bad_id" });
    }
    if (!["resume", "career_card"].includes(kind)) {
      return res.status(400).json({ error: "bad_kind" });
    }

    // Auth: application must belong to caller's org
    const app = await db("applications as ap")
      .join("jobs as j", "j.id", "ap.job_id")
      .select("ap.id", "j.org_id")
      .where("ap.id", id)
      .first();

    if (!app || Number(app.org_id) !== Number(req.auth.orgId)) {
      return res.status(404).json({ error: "not_found" });
    }

    const file = await db("application_files")
      .where({ application_id: id, kind })
      .first();
    if (!file) return res.status(404).json({ error: "no_file" });

    const spRaw = String(file.storage_path || "");
    const sp = spRaw.replace(/^\/+/, ""); // normalize (strip leading /)

    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const candidates = [];

    if (path.isAbsolute(spRaw)) candidates.push(spRaw);
    candidates.push(path.resolve(process.cwd(), sp));
    candidates.push(path.resolve(process.cwd(), "server", sp));
    candidates.push(path.resolve(__dirname, "..", "..", sp));
    if (sp.startsWith("uploads/")) {
      candidates.push(path.resolve(process.cwd(), "server", "uploads", path.basename(sp)));
      candidates.push(path.resolve(__dirname, "..", "..", "uploads", path.basename(sp)));
    }

    let abs = null;
    for (const p of candidates) { try { if (fs.existsSync(p)) { abs = p; break; } } catch {} }
    if (!abs) {
      console.warn("[fileserve] file_missing", { id, kind, spRaw, tried: candidates });
      return res.status(404).json({ error: "file_missing" });
    }

    const forceDownload = String(req.query.download || "") === "1";
    const dispo = `${forceDownload ? "attachment" : "inline"}; filename="${encodeURIComponent(
      file.original_name || path.basename(abs)
    )}"`;

    res.setHeader("Content-Type", file.mime || "application/octet-stream");
    res.setHeader("Content-Disposition", dispo);

    fs.createReadStream(abs).on("error", next).pipe(res);
  } catch (e) {
    next(e);
  }
});

export default r;
