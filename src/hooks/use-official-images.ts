import { useEffect, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { syncOfficialImages } from "@/lib/artwork.functions";
import type { Item } from "@/lib/items";

export function useOfficialImages(items: Item[]) {
  const attempted = useRef(new Set<string>());
  const sync = useServerFn(syncOfficialImages);
  const qc = useQueryClient();
  useEffect(() => {
    const missing = items.filter((item) => item.category === "cards" && !item.product_image && item.thumbnail && !attempted.current.has(`${item.id}:${item.catalog_id}`)).slice(0, 50);
    if (!missing.length) return;
    missing.forEach((item) => attempted.current.add(`${item.id}:${item.catalog_id}`));
    sync({ data: { ids: missing.map((item) => item.id) } }).then(() => {
      qc.invalidateQueries({ queryKey: ["items"] });
      missing.forEach((item) => qc.invalidateQueries({ queryKey: ["item", item.id] }));
    }).catch(() => {});
  }, [items, sync, qc]);
}