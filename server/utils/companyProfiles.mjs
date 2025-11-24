import { db } from "../db.mjs";

const baseSlug = (value = "") =>
  String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-")
    .slice(0, 80) || "company";

export async function makeUniqueCompanySlug(orgId, name, trx = db) {
  const root = baseSlug(name);
  const rows = await trx("company_profiles")
    .where({ org_id: orgId })
    .select("slug");
  const have = new Set(rows.map((r) => r.slug));
  if (!have.has(root)) return root;
  for (let n = 2; n <= 200; n++) {
    const candidate = `${root}-${n}`.slice(0, 100);
    if (!have.has(candidate)) return candidate;
  }
  return `${root}-${Date.now()}`;
}

/** Ensure at least one profile exists; returns {id, name, description, slug} */
export async function ensureDefaultProfile(orgId, trx = db) {
  const profile = await trx("company_profiles")
    .where({ org_id: orgId, is_active: true })
    .orderBy([{ column: "is_default", order: "desc" }, { column: "id", order: "asc" }])
    .first();
  if (profile) return profile;

  const org = await trx("organizations").where({ id: orgId }).first();
  if (!org) throw new Error("org_not_found");

  const slug = await makeUniqueCompanySlug(orgId, org.name || "company", trx);
  const [created] = await trx("company_profiles")
    .insert({
      org_id: orgId,
      name: org.name || "Company",
      description: org.company_description || "",
      slug,
      is_active: true,
      is_default: true,
      created_at: trx.fn.now(),
      updated_at: trx.fn.now(),
    })
    .returning("*");

  return created;
}

export const mapProfile = (p) => ({
  id: p.id,
  org_id: p.org_id,
  name: p.name,
  description: p.description || "",
  slug: p.slug,
  is_active: p.is_active !== false,
  is_default: !!p.is_default,
  created_at: p.created_at,
  updated_at: p.updated_at,
});

