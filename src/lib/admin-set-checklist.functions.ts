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

/** Which cards of a set are not yet in our catalog — numbers only, for the admin panel. */
export const missingSetCards = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ setId: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const { assertImportAdmin } = await import("@/server/admin-import.server");
    await assertImportAdmin(context.supabase, context.userId);
    const { cardsightConfigured, cardsightSetCards } = await import("@/server/cardsight.server");
    if (!cardsightConfigured()) throw new Error("The sports-card service is not configured.");
    const cards = await cardsightSetCards(data.setId);
    const have = new Set<string>();
    for (let i = 0; i < cards.length; i += 200) {
      const ids = cards.slice(i, i + 200).map((c) => c.id);
      const { data: rows, error } = await context.supabase.from("catalog_prices").select("provider_card_id").in("provider_card_id", ids);
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
  });
