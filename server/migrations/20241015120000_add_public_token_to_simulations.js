// server/migrations/20241015120000_add_public_token_to_simulations.js

/**
 * Adds public token tracking to simulations for single-use public links.
 *
 * Columns:
 *  - public_token: stores the token segment of a simulation URL (unique)
 *  - first_accessed_at / last_accessed_at: track timing of public link access
 *  - access_count: number of times the public link has been resolved
 *
 * Existing rows are backfilled by taking the trailing segment of `url`.
 */

export async function up(knex) {
  await knex.schema.alterTable("simulations", (table) => {
    table.text("public_token").unique();
    table.timestamp("first_accessed_at", { useTz: true }).nullable();
    table.timestamp("last_accessed_at", { useTz: true }).nullable();
    table.integer("access_count").notNullable().defaultTo(0);
  });

  // Backfill token from existing URLs (handles /s/<token> and /sim/<token> forms)
  await knex.raw(`
    UPDATE simulations
    SET public_token = NULLIF(
      regexp_replace(
        regexp_replace(url, '/+$', ''),
        '^.*/',
        ''
      ),
      ''
    )
    WHERE (public_token IS NULL OR public_token = '')
      AND url IS NOT NULL
  `);
}

export async function down(knex) {
  await knex.schema.alterTable("simulations", (table) => {
    table.dropColumn("public_token");
    table.dropColumn("first_accessed_at");
    table.dropColumn("last_accessed_at");
    table.dropColumn("access_count");
  });
}
