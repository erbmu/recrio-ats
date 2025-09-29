// server/routes/ats/applications.routes.mjs
import { Router } from "express";
import { z } from "zod";
import { db } from "../../db.mjs";
import { upload } from "../../middleware/upload.mjs";
import { requireAuth } from "../../middleware/requireAuth.mjs";

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
/* POST /api/applications/public/:jobId  (career card & resume optional)      */
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
/* GET /api/applications/job/:jobId (recruiter list, ranked when scores)     */
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

    const apps = await db("applications")
      .where({ job_id: jobId })
      .orderBy("id", "desc")
      .select(
        "id",
        "job_id",
        "candidate_name",
        "candidate_email",
        "status",
        "ai_summary",
        "ai_scores",
        "created_at"
      );

    const parseOverall = (a) => {
      const v = a?.ai_scores?.overall ?? a?.ai_scores?.score ?? null;
      const n = typeof v === "number" ? v : Number(v);
      return Number.isFinite(n) ? n : null;
    };

    apps.sort((a, b) => {
      const sa = parseOverall(a);
      const sb = parseOverall(b);
      if (sa == null && sb == null) return new Date(b.created_at) - new Date(a.created_at);
      if (sa == null) return 1;
      if (sb == null) return -1;
      return sb - sa;
    });

    return res.json(
      apps.map((a) => ({
        id: a.id,
        job_id: a.job_id,
        candidate_name: a.candidate_name,
        candidate_email: a.candidate_email,
        status: a.status,
        ai_summary: a.ai_summary,
        ai_scores: a.ai_scores,
        created_at: a.created_at,
      }))
    );
  } catch (e) {
    return next(e);
  }
});

/* ------------------------------------------------------------------------- */
/* GET /api/applications/:id (recruiter view — details + files + events)      */
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
      .where("ap.id", id)
      .select(
        "ap.*",
        "j.title as job_title",
        "j.slug as job_slug",
        "o.slug as org_slug",
        "j.org_id as job_org_id"
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

export default r;
