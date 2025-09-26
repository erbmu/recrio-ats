// server/routes/ats/jobs.routes.mjs
import { Router } from "express";
import { z } from "zod";
import crypto from "crypto";
import { db } from "../../db.mjs";
import { requireAuth } from "../../middleware/requireAuth.mjs";

const r = Router();
const DBG = (...args) => console.log("[SRV][JOBS]", ...args);

/* utils */
function cleanStr(v, max = 4000) {
  if (typeof v !== "string") return v;
  let s = v.replace(/\s+/g, " ").trim();
  if (s.length > max) s = s.slice(0, max);
  return s;
}
function baseSlug(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-")
    .slice(0, 80) || "job";
}
async function makeUniqueSlugGlobal(title) {
  const root = baseSlug(title);
  const rows = await db("jobs").select("slug").whereRaw(`slug ILIKE ?`, [`${root}%`]);
  const have = new Set(rows.map((r) => r.slug));
  if (!have.has(root)) return root;
  for (let n = 2; n <= 9999; n++) {
    const s = `${root}-${n}`;
    if (!have.has(s)) return s;
  }
  return `${root}-${Date.now()}`;
}

// 22-char base64url token (≈132 bits)
function newToken() {
  return crypto.randomBytes(16).toString("base64url");
}

function buildApplyUrl(job, orgSlug) {
  const base = process.env.PUBLIC_BASE_URL || "";
  if (!base) return null;
  const origin = base.replace(/\/+$/, "");
  if (job?.public_url_token) {
    // preferred, hard-to-guess link
    return `${origin}/apply/t/${job.public_url_token}`;
  }
  if (orgSlug && job?.slug) {
    return `${origin}/apply/${orgSlug}/${job.slug}`;
  }
  return null;
}

const EMPLOYMENT_TYPES = ["Full-time", "Part-time", "Contract", "Internship", "Other"];
const CreateSchema = z.object({
  title: z.preprocess((v) => cleanStr(v, 120), z.string().min(1, "Title required")),
  description: z.preprocess((v) => cleanStr(v, 4000), z.string().min(1, "Description required")),
  qualifications: z.preprocess((v) => cleanStr(v, 3000), z.string().optional().default("")),
  workType: z.preprocess((v) => cleanStr(v, 32), z.string().optional().default("")),
  employmentType: z.enum(EMPLOYMENT_TYPES, { required_error: "Employment type required" }),
  location: z.preprocess((v) => cleanStr(v, 160), z.string().min(1, "Location required")),
  salary: z.preprocess((v) => cleanStr(v, 160), z.string().optional().default("")),
});

/* --- PROBE: confirm this router is mounted --- */
r.get("/_debug", (req, res) => {
  DBG("HIT /_debug");
  return res.json({ ok: true, router: "ats/jobs", note: "router is mounted" });
});

/* List jobs (recruiter) */
r.get("/", requireAuth(), async (req, res, next) => {
  try {
    DBG("list: auth", req?.auth);
    const orgId = req.auth.orgId;
    if (!orgId) {
      DBG("list: missing orgId → 401");
      return res.status(401).json({ error: "unauthorized" });
    }

    const rows = await db("jobs as j")
      .join("organizations as o", "o.id", "j.org_id")
      .where("j.org_id", orgId)
      .orderBy("j.id", "desc")
      .select(
        "j.id","j.org_id","j.title","j.slug","j.public_url_token","j.description",
        "j.qualifications","j.work_type","j.employment_type","j.location","j.salary",
        "j.applicants","j.created_at","o.slug as org_slug"
      );

    DBG(`list: rows=${rows.length} for orgId=${orgId}`);

    const jobs = rows.map((j) => ({
      id: j.id,
      org_id: j.org_id,
      title: j.title,
      slug: j.slug,
      description: j.description,
      qualifications: j.qualifications || "",
      work_type: j.work_type || "",
      employment_type: j.employment_type || "",
      location: j.location || "",
      salary: j.salary || "",
      applicants: Number(j.applicants || 0),
      created_at: j.created_at,
      apply_url: buildApplyUrl(j, j.org_slug),
    }));

    res.json({ jobs });
  } catch (e) {
    DBG("list: error", e?.message || e);
    next(e);
  }
});

/* Tiny meta (title for header in Applicants page) */
r.get("/:id/meta", requireAuth(), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "bad_id" });
    const row = await db("jobs").where({ id, org_id: req.auth.orgId }).select("id","title","slug").first();
    if (!row) return res.status(404).json({ error: "not_found" });
    res.json({ id: row.id, title: row.title, slug: row.slug });
  } catch (e) { next(e); }
});

/* Create job (generates token link) */
r.post("/", requireAuth(), async (req, res, next) => {
  try {
    DBG("create: body", req.body);
    const parsed = CreateSchema.safeParse(req.body);
    if (!parsed.success) {
      const msg = parsed.error.issues?.[0]?.message || "Invalid payload";
      DBG("create: invalid", msg);
      return res.status(400).json({ error: msg });
    }
    const { title, description, qualifications, workType, employmentType, location, salary } = parsed.data;

    const orgId = req.auth.orgId;
    const org = await db("organizations").where({ id: orgId }).select("slug").first();

    let slug = await makeUniqueSlugGlobal(title);
    let tok = newToken();
    const MAX_RETRIES = 4;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const [inserted] = await db("jobs")
          .insert({
            org_id: orgId,
            title,
            slug,
            public_url_token: tok,
            description,
            qualifications,
            work_type: workType || null,
            employment_type: employmentType,
            location,
            salary: salary || null,
            is_published: true,
            published_at: db.fn.now(),
            applicants: 0,
          })
          .returning([
            "id","org_id","title","slug","public_url_token","description","qualifications",
            "work_type","employment_type","location","salary","created_at"
          ]);

        DBG("create: ok id", inserted.id);

        return res.json({
          job: {
            ...inserted,
            apply_url: buildApplyUrl(inserted, org?.slug),
          },
        });
      } catch (e) {
        const isUnique = e?.code === "23505";
        DBG("create: unique error?", isUnique, e?.message);
        if (!isUnique) throw e;

        if (/jobs_slug_key|jobs_org_id_slug_unique/i.test(e.message || "")) {
          slug = await makeUniqueSlugGlobal(title);
        } else if (/public_url_token/i.test(e.message || "")) {
          tok = newToken();
        } else {
          tok = newToken();
          slug = await makeUniqueSlugGlobal(title);
        }

        if (attempt === MAX_RETRIES) {
          return res.status(409).json({ error: "duplicate_identifiers" });
        }
      }
    }
  } catch (e) { next(e); }
});

/* -------- Public lookups (both forms supported) -------- */

r.get("/public/by-token/:token", async (req, res, next) => {
  try {
    const tok = String(req.params.token || "").trim();
    DBG("public/by-token", tok);
    if (!tok) return res.status(400).json({ error: "bad_token" });

    const row = await db("jobs as j")
      .join("organizations as o", "o.id", "j.org_id")
      .where("j.public_url_token", tok)
      .andWhere("j.is_published", true)
      .select(
        "j.id","j.title","j.slug","j.description","j.qualifications",
        "j.work_type","j.employment_type","j.location","j.salary",
        "o.slug as org_slug"
      )
      .first();

    if (!row) return res.status(404).json({ error: "not_found" });
    res.json({ job: row });
  } catch (e) { next(e); }
});

r.get("/public/:orgSlug/:jobSlug", async (req, res, next) => {
  try {
    const { orgSlug, jobSlug } = req.params;
    DBG("public/org/slug", orgSlug, jobSlug);
    const row = await db("jobs as j")
      .join("organizations as o", "o.id", "j.org_id")
      .where("o.slug", orgSlug)
      .andWhere("j.slug", jobSlug)
      .andWhere("j.is_published", true)
      .select(
        "j.id","j.title","j.slug","j.description","j.qualifications",
        "j.work_type","j.employment_type","j.location","j.salary",
        "o.slug as org_slug"
      )
      .first();

    if (!row) return res.status(404).json({ error: "not_found" });
    res.json({ job: row });
  } catch (e) { next(e); }
});

export default r;
