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

/** Missing numbers for a set we already have, found by its catalog name. */
export const missingScannedSetCards = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ setName: z.string().min(1).max(200), year: z.string().max(20).optional() }))
  .handler(async ({ data, context }) => {
    const { assertImportAdmin } = await import("@/server/admin-import.server");
    await assertImportAdmin(context.supabase, context.userId);
    const { cardsightConfigured, cardsightSearchSets } = await import("@/server/cardsight.server");
    if (!cardsightConfigured()) throw new Error("The sports-card service is not configured.");
    const { cardsightSameSet } = await import("@/lib/cardsight");
    const candidates = await cardsightSearchSets(data.setName, data.year || null);
    const match = candidates.find((s) => cardsightSameSet([s.releaseName, s.name !== "Base Set" ? s.name : ""].filter(Boolean).join(" "), data.setName) || cardsightSameSet(s.releaseName, data.setName));
    if (!match) throw new Error(`Could not find "${data.setName}" in the sports-card service.`);
    return { set: match, ...(await missingForSet(context.supabase, match.id)) };
  });
