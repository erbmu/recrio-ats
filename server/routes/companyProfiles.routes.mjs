// server/routes/companyProfiles.routes.mjs
import { Router } from "express";
import { z } from "zod";
import { db } from "../db.mjs";
import { requireAuth } from "../middleware/requireAuth.mjs";
import { ensureDefaultProfile, makeUniqueCompanySlug, mapProfile } from "../utils/companyProfiles.mjs";

const r = Router();

const CreateSchema = z.object({
  name: z.string().trim().min(2, "Company name is required").max(160),
  description: z.string().trim().max(20000).optional().default(""),
  makeDefault: z.boolean().optional().default(false),
});

const UpdateSchema = z.object({
  name: z.string().trim().min(2).max(160).optional(),
  description: z.string().trim().max(20000).optional(),
  is_default: z.boolean().optional(),
  is_active: z.boolean().optional(),
});

/** List profiles for the signed-in org */
r.get("/api/company-profiles", requireAuth(), async (req, res, next) => {
  try {
    const orgId = req.auth.orgId;
    await ensureDefaultProfile(orgId); // guarantee at least one row

    const rows = await db("company_profiles")
      .where({ org_id: orgId })
      .orderBy([{ column: "is_default", order: "desc" }, { column: "id", order: "asc" }]);

    return res.json({ profiles: rows.map(mapProfile) });
  } catch (e) {
    next(e);
  }
});

/** Create new profile */
r.post("/api/company-profiles", requireAuth(), async (req, res, next) => {
  try {
    const body = CreateSchema.parse(req.body || {});
    const orgId = req.auth.orgId;

    const profile = await db.transaction(async (trx) => {
      const org = await trx("organizations").where({ id: orgId }).first();
      if (!org) throw Object.assign(new Error("org_not_found"), { status: 404 });

      const slug = await makeUniqueCompanySlug(orgId, body.name, trx);
      const [created] = await trx("company_profiles")
        .insert({
          org_id: orgId,
          name: body.name.trim(),
          description: body.description || "",
          slug,
          is_active: true,
          is_default: body.makeDefault,
          created_at: trx.fn.now(),
          updated_at: trx.fn.now(),
        })
        .returning("*");

      if (body.makeDefault) {
        await trx("company_profiles").where({ org_id: orgId }).andWhereNot({ id: created.id }).update({ is_default: false });
      } else {
        // keep first profile default
        const count = await trx("company_profiles").where({ org_id: orgId }).andWhere({ is_default: true }).first();
        if (!count) {
          await trx("company_profiles").where({ id: created.id }).update({ is_default: true });
        }
      }

      return created;
    });

    return res.status(201).json({ profile: mapProfile(profile) });
  } catch (e) {
    next(e);
  }
});

/** Update profile (name/description/default/active) */
r.patch("/api/company-profiles/:id", requireAuth(), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "bad_id" });

    const body = UpdateSchema.parse(req.body || {});
    const orgId = req.auth.orgId;

    const updated = await db.transaction(async (trx) => {
      const profile = await trx("company_profiles").where({ id, org_id: orgId }).first().forUpdate();
      if (!profile) return "not_found";

      const patch = {};
      if (body.name) patch.name = body.name.trim();
      if (body.description != null) patch.description = body.description;
      if (body.is_active != null) patch.is_active = body.is_active;
      if (Object.keys(patch).length === 0) patch.updated_at = trx.fn.now();

      if (body.name) {
        patch.slug = await makeUniqueCompanySlug(orgId, body.name, trx);
      }

      const [row] = await trx("company_profiles")
        .where({ id })
        .update({ ...patch, updated_at: trx.fn.now() }, "*");

      if (body.is_default === true) {
        await trx("company_profiles").where({ org_id: orgId }).andWhereNot({ id }).update({ is_default: false });
        await trx("company_profiles").where({ id }).update({ is_default: true });
      } else if (body.is_default === false) {
        // keep at least one default
        const defaults = await trx("company_profiles").where({ org_id: orgId, is_default: true }).select("id");
        if (defaults.length <= 1 && defaults[0]?.id === id) {
          await trx("company_profiles").where({ id }).update({ is_default: true });
        }
      }

      return row;
    });

    if (updated === "not_found") return res.status(404).json({ error: "not_found" });
    return res.json({ profile: mapProfile(updated) });
  } catch (e) {
    next(e);
  }
});

export default r;
