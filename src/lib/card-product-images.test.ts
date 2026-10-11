import { describe, expect, it } from "vitest";
import { canReuseCardImage, cardImageIdentity, cardImageReviewStatus, cardProductImage } from "./card-product-images";

describe("scan-derived card images", () => {
  it("requires approval for CardSight sports-card images", () => {
    expect(cardImageReviewStatus({ name: "Aaron Judge", subcategory: "sports" })).toBe("pending");
  });
  it("keeps TCG and other image flows unchanged", () => {
    expect(cardImageReviewStatus({ name: "Pikachu", subcategory: "tcg" })).toBe("approved");
    expect(cardImageReviewStatus({ name: "Film card", subcategory: "non_sport" })).toBe("approved");
  });
  it("does not share pending images with other collectors", () => {
    expect(canReuseCardImage("pending", "owner", "other")).toBe(false);
    expect(canReuseCardImage("pending", "owner", "owner")).toBe(true);
    expect(canReuseCardImage("pending", null, "owner")).toBe(false);
  });
  it("shares approved images and never reuses rejected images", () => {
    expect(canReuseCardImage("approved", "owner", "other")).toBe(true);
    expect(canReuseCardImage("rejected", "owner", "owner")).toBe(false);
    expect(canReuseCardImage("rejected", "owner", "other")).toBe(false);
  });
  it("never uses provider artwork", () => {
    const item = { category: "cards", official_image: "https://provider/image.jpg", thumbnail: "data:image/jpeg;base64,scan" };
    expect(cardProductImage(item)).toBe(item.thumbnail);
    expect(cardProductImage({ category: "cards" })).toBeNull();
  });
  it("prefers a cleaned source photograph", () => {
    expect(cardProductImage({ category: "cards", product_image: "processed", thumbnail: "scan" })).toBe("processed");
  });
  it("keeps printing and language identities separate", () => {
    const card = { name: "Pikachu", catalog_id: "card-123", variant: "Holo", language: "English" };
    expect(cardImageIdentity(card)).not.toBe(cardImageIdentity({ ...card, language: "Japanese" }));
    expect(cardImageIdentity(card)).not.toBe(cardImageIdentity({ ...card, variant: "Reverse Holo" }));
  });
  it("does not share ambiguous sports-card identities", () => {
    expect(cardImageIdentity({ name: "Aaron Judge", set_name: "Topps", number: "1" })).toBeNull();
    const card = { name: "Aaron Judge", set_name: "Topps", number: "1", year: "2024", line: "Baseball" };
    expect(cardImageIdentity(card)).toBe(cardImageIdentity({ ...card, name: " AARON  JUDGE " }));
    expect(cardImageIdentity(card)).not.toBe(cardImageIdentity({ ...card, year: "2023" }));
  });
});