import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type Item = Tables<"items">;

export const itemsQuery = (status: "batch" | "collection") =>
  queryOptions({
    queryKey: ["items", status],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("items")
        .select("*")
        .eq("status", status)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

export const priceHistoryQuery = (itemId: string) =>
  queryOptions({
    queryKey: ["price_history", itemId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("price_history")
        .select("est_value, price_low, price_high, recorded_at")
        .eq("item_id", itemId)
        .order("recorded_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

export const collectionHistoryQuery = () =>
  queryOptions({
    queryKey: ["collection_history"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("price_history")
        .select("item_id, est_value, recorded_at")
        .order("recorded_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

export const catalogHistoryForQuery = (ids: string[]) =>
  queryOptions({
    queryKey: ["catalog_history_for", [...ids].sort()],
    queryFn: async () => {
      const rows = await Promise.all(
        ids.map(async (id) => {
          const { data, error } = await supabase
            .from("catalog_price_history")
            .select("catalog_id, nm_price, recorded_at")
            .eq("catalog_id", id)
            .order("recorded_at", { ascending: true })
            .limit(1000);
          if (error) throw error;
          return data;
        }),
      );
      return rows.flat();
    },
    enabled: ids.length > 0,
  });

export const itemQuery = (id: string) =>
  queryOptions({
    queryKey: ["item", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("items").select("*").eq("id", id).single();
      if (error) throw error;
      return data;
    },
  });
