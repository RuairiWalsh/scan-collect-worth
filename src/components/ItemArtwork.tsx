import { useState } from "react";
import { ImageOff } from "lucide-react";
import type { Item } from "@/lib/items";

export function ItemArtwork({ item, className = "" }: { item: Item; className?: string }) {
  const src = item.category === "cards" ? item.official_image : item.thumbnail;
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  return src && src !== failedSrc ? (
    <img src={src} alt={item.name} loading="lazy" onError={() => setFailedSrc(src)} className={`bg-muted object-contain ${className}`} />
  ) : (
    <div role="img" aria-label={item.category === "cards" ? "Official image unavailable" : "Image unavailable"} className={`flex items-center justify-center bg-muted text-muted-foreground ${className}`}>
      <ImageOff className="size-6" />
    </div>
  );
}