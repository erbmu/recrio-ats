import { db } from "../db.mjs";

const cache = new Map();

export async function resolveColumn(table, candidates = []) {
  const key = `${table}:${candidates.join("|")}`;
  if (cache.has(key)) return cache.get(key);

  try {
    const rows = await db("information_schema.columns")
      .select("column_name")
      .whereRaw("lower(table_name) = lower(?)", [table])
      .andWhere({ table_schema: "public" });
    const available = rows.map((row) => String(row.column_name));
    for (const candidate of candidates) {
      if (available.includes(candidate)) {
        cache.set(key, candidate);
        return candidate;
      }
    }
  } catch (err) {
    console.warn("[columnResolver] failed to inspect columns", { table, error: err?.message || err });
  }

  cache.set(key, null);
  return null;
}
