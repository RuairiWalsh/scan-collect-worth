import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { pdfCardPair } from "@/lib/pdf-card-pairs";

export const beginCardImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ hash: z.string().regex(/^[a-f0-9]{64}$/), name: z.string().min(1).max(255), pages: z.number().int().positive() }))
  .handler(async ({ data, context }) => {
    const { assertImportAdmin } = await import("@/server/admin-import.server");
    await assertImportAdmin(context.supabase, context.userId);
    pdfCardPair(data.pages, 0);
    const { data: existing, error: readError } = await context.supabase.from("card_image_imports").select("*").eq("user_id", context.userId).eq("file_hash", data.hash).maybeSingle();
    if (readError) throw new Error("Could not read saved imports.");
    if (existing) return existing;
    const { data: batch, error } = await context.supabase.from("card_image_imports").insert({ file_hash: data.hash, file_name: data.name, page_count: data.pages, user_id: context.userId }).select("*").single();
    if (error || !batch) throw new Error("Could not create import.");
    return batch;
  });

export const importCardPair = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ importId: z.string().uuid(), index: z.number().int().nonnegative() }))
  .handler(async ({ data, context }) => {
    const { assertImportAdmin, processImportPair } = await import("@/server/admin-import.server");
    await assertImportAdmin(context.supabase, context.userId);
    return processImportPair(data.importId, data.index, context.userId);
  });

export const importCardPairs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ importId: z.string().uuid(), start: z.number().int().nonnegative(), count: z.number().int().min(1).max(8) }))
  .handler(async ({ data, context }) => {
    const { assertImportAdmin, processImportBatch } = await import("@/server/admin-import.server");
    await assertImportAdmin(context.supabase, context.userId);
    return processImportBatch(data.importId, data.start, data.count, context.userId);
  });

export const confirmCardImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ pairId: z.string().uuid(), name: z.string().min(1).max(200), set_name: z.string().min(1).max(200), number: z.string().min(1).max(80), year: z.string().min(1).max(20), line: z.string().min(1).max(100), subcategory: z.enum(["tcg", "sports", "nonsport"]), variant: z.string().max(100), language: z.string().min(1).max(50) }))
  .handler(async ({ data, context }) => {
    const { assertImportAdmin, confirmImportPair } = await import("@/server/admin-import.server");
    await assertImportAdmin(context.supabase, context.userId);
    // The server retains an unchanged reviewed match, or rematches corrected details.
    return confirmImportPair(data.pairId, { ...data, catalog_id: null, category: "cards", is_collectible: true, confidence: 1, grader: null, grade: null }, context.userId);
  });