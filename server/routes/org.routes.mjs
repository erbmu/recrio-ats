// server/routes/org.routes.mjs
import { Router } from "express";
import { z } from "zod";
import { db } from "../db.mjs";
import { requireAuth } from "../middleware/requireAuth.mjs";
import { ensureDefaultProfile } from "../utils/companyProfiles.mjs";

const r = Router();

/** Get current org profile (id, name, slug, company_description) */
r.get("/api/org/profile", requireAuth(), async (req, res, next) => {
  try {
    const orgId = Number(req.auth.orgId);
    const org = await db("organizations").select("id", "name", "slug", "company_description").where({ id: orgId }).first();

    if (!org) return res.status(404).json({ error: "org_not_found" });

    const profile = await ensureDefaultProfile(orgId);
    const merged = {
      ...org,
      company_profile_id: profile?.id || null,
      company_description: profile?.description ?? org.company_description ?? "",
    };
    return res.json({ org: merged });
  } catch (e) {
    next(e);
  }
});

/** Update company_description (upsert-style update on the org row) */
const Body = z.object({
  company_description: z.string().trim().max(20000).optional().default(""),
});
r.post("/api/org/profile", requireAuth(), async (req, res, next) => {
  try {
    const orgId = Number(req.auth.orgId);
    const body = Body.parse(req.body);

    const updated = await db.transaction(async (trx) => {
      const profile = await ensureDefaultProfile(orgId, trx);

      await trx("company_profiles")
        .where({ id: profile.id })
        .update({ description: body.company_description, updated_at: trx.fn.now() });

      const [org] = await trx("organizations")
        .where({ id: orgId })
        .update(
          { company_description: body.company_description, updated_at: trx.fn.now() },
          ["id", "name", "slug", "company_description"]
        );

      return { org, profileId: profile.id };
    });

    const merged = updated?.org
      ? {
          ...updated.org,
          company_profile_id: updated.profileId,
          company_description: updated.org.company_description,
        }
      : null;

    return res.json({ org: merged, saved: true });
  } catch (e) {
    next(e);
  }
});

export default r;
