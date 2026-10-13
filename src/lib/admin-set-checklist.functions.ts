import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const searchCardSets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ name: z.string().min(1).max(200), year: z.string().max(20).optional() }))
  .handler(async ({ data, context }) => {
    const { assertImportAdmin } = await import("@/server/admin-import.server");
    await assertImportAdmin(context.supabase, context.userId);
    const { cardsightConfigured, cardsightSearchSets } = await import("@/server/cardsight.server");
    if (!cardsightConfigured()) throw new Error("The sports-card service is not configured.");
    return cardsightSearchSets(data.name, data.year || null);
  });

async function missingForSet(supabase: import("@supabase/supabase-js").SupabaseClient<import("@/integrations/supabase/types").Database>, setId: string) {
  const { cardsightSetCards } = await import("@/server/cardsight.server");
  const cards = await cardsightSetCards(setId);
  if (!cards.length) throw new Error("Couldn't load this set's card list from the sports-card service. Please try again in a moment.");
  const have = new Set<string>();
  for (let i = 0; i < cards.length; i += 200) {
    const ids = cards.slice(i, i + 200).map((c) => c.id);
    const { data: rows, error } = await supabase.from("catalog_prices").select("provider_card_id").in("provider_card_id", ids);
    if (error) throw new Error("Could not read the catalog.");
    for (const r of rows ?? []) if (r.provider_card_id) have.add(r.provider_card_id);
  }
  const missing = cards.filter((c) => !have.has(c.id));
  const num = (c: (typeof cards)[number]) => (c.number ?? "").trim();
  missing.sort((a, b) => num(a).localeCompare(num(b), undefined, { numeric: true }));
  return {
    total: cards.length,
    have: cards.length - missing.length,
    missing: missing.map((c) => ({ number: num(c) || "—", name: c.name ?? "" })),
  };
}

/** Which cards of a set are not yet in our catalog — numbers only, for the admin panel. */
export const missingSetCards = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ setId: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const { assertImportAdmin } = await import("@/server/admin-import.server");
    await assertImportAdmin(context.supabase, context.userId);
    const { cardsightConfigured } = await import("@/server/cardsight.server");
    if (!cardsightConfigured()) throw new Error("The sports-card service is not configured.");
    return missingForSet(context.supabase, data.setId);
  });

/** Sets already present in our catalog (from scans/imports), with how many cards we have. */
export const scannedSets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertImportAdmin } = await import("@/server/admin-import.server");
    await assertImportAdmin(context.supabase, context.userId);
    const { data, error } = await context.supabase.from("catalog_prices").select("set_name, card_metadata").eq("price_provider", "cardsight").not("provider_card_id", "is", null);
    if (error) throw new Error("Could not read the catalog.");
    const sets = new Map<string, { setName: string; year: string; count: number }>();
    for (const row of data ?? []) {
      const setName = (row.set_name ?? "").trim();
      if (!setName) continue;
      const meta = row.card_metadata && typeof row.card_metadata === "object" && !Array.isArray(row.card_metadata) ? row.card_metadata as Record<string, unknown> : {};
      const year = typeof meta["year"] === "string" ? meta["year"] : "";
      const key = `${setName}|${year}`;
      const entry = sets.get(key) ?? { setName, year, count: 0 };
      entry.count++;
      sets.set(key, entry);
    }
    return [...sets.values()].sort((a, b) => b.count - a.count);
  });

/** The cards we already have for a set, read purely from our own catalog — no external calls. */
export const scannedSetCards = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ setName: z.string().min(1).max(200), year: z.string().max(20).optional() }))
  .handler(async ({ data, context }) => {
    const { assertImportAdmin } = await import("@/server/admin-import.server");
    await assertImportAdmin(context.supabase, context.userId);
    const { data: rows, error } = await context.supabase
      .from("catalog_prices")
      .select("number, name, card_metadata")
      .eq("price_provider", "cardsight")
      .ilike("set_name", data.setName.trim());
    if (error) throw new Error("Could not read the catalog.");
    const yearFilter = (data.year ?? "").trim();
    const have = new Map<string, string>();
    for (const row of rows ?? []) {
      if (yearFilter) {
        const meta = row.card_metadata && typeof row.card_metadata === "object" && !Array.isArray(row.card_metadata) ? row.card_metadata as Record<string, unknown> : {};
        if ((typeof meta["year"] === "string" ? meta["year"] : "") !== yearFilter) continue;
      }
      const num = (row.number ?? "").trim() || "—";
      if (!have.has(num)) have.set(num, row.name ?? "");
    }
    const cards = [...have.entries()]
      .map(([number, name]) => ({ number, name }))
      .sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }));
    if (!cards.length) throw new Error(`No cards from "${data.setName}" in the catalog yet.`);
    return { have: cards.length, cards };
  });
