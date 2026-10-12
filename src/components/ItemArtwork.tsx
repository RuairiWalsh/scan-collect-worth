import { useState } from "react";
import { ImageOff } from "lucide-react";
import type { Item } from "@/lib/items";

export function ItemArtwork({ item, className = "" }: { item: Item; className?: string }) {
  const primary = item.product_image && ["cards", "coins", "stamps"].includes(item.category) ? item.product_image : item.thumbnail;
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const src = primary && primary !== failedSrc ? primary : item.thumbnail;
  return src && src !== failedSrc ? (
    <img src={src} alt={item.name} loading="lazy" onError={() => setFailedSrc(src)} className={`bg-muted object-contain ${className}`} />
  ) : (
    <div role="img" aria-label="Image unavailable" className={`flex items-center justify-center bg-muted text-muted-foreground ${className}`}>
      <ImageOff className="size-6" />
    </div>
  );
}