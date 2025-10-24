// server/routes/sim.public.routes.mjs
import { Router } from "express";
import crypto from "crypto";
import { db } from "../db.mjs";

const r = Router();
const SIM_TOKEN_SECRET = process.env.SIM_TOKEN_SECRET || "dev-secret-change-me";

function sign(payload) {
  return crypto.createHmac("sha256", SIM_TOKEN_SECRET).update(payload).digest("base64url");
}

// GET /api/sim/public/verify/:payload
// payload looks like: "<applicationId>.<sig>"
r.get("/api/sim/public/verify/:payload", async (req, res, next) => {
  try {
    const raw = String(req.params.payload || "");
    const [idStr, sig] = raw.split(".");
    const applicationId = Number(idStr);
    if (!applicationId || !sig) return res.status(400).json({ error: "bad_token" });

    const expected = sign(String(applicationId));
    if (sig !== expected) return res.status(401).json({ error: "invalid_token" });

    // Return only what the sim needs (no private recruiter-only fields)
    const row = await db("applications as ap")
      .join("jobs as j", "j.id", "ap.job_id")
      .join("organizations as o", "o.id", "j.org_id")
      .where("ap.id", applicationId)
      .select(
        "ap.id as application_id",
        "ap.candidate_name",
        "ap.candidate_email",
        "j.id as job_id",
        "j.title as job_title",
        "j.description as job_description",
        "j.qualifications",
        "o.company_description"
      )
      .first();

    if (!row) return res.status(404).json({ error: "not_found" });

    res.json({
      application: {
        id: row.application_id,
        candidate_name: row.candidate_name,
        candidate_email: row.candidate_email,
      },
      job: {
        id: row.job_id,
        title: row.job_title,
        description: row.job_description,
        qualifications: row.qualifications,
      },
      org: {
        company_description: row.company_description,
      },
    });
  } catch (e) {
    next(e);
  }
});

export default r;
