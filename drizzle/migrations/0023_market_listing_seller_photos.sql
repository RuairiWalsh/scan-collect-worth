CREATE FUNCTION public.market_listings_with_photos()
RETURNS TABLE (listing_id uuid, price numeric, created_at timestamptz, seller_id uuid, store_name text, item_id uuid, name text, category text, subcategory text, line text, catalog_id text, set_name text, number text, variant text, condition text, grader text, grade text, image text, est_value numeric, photos text[], scan_image text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
SELECT m.listing_id,m.price,m.created_at,m.seller_id,m.store_name,m.item_id,m.name,m.category,m.subcategory,m.line,m.catalog_id,m.set_name,m.number,m.variant,m.condition,m.grader,m.grade,m.image,m.est_value,l.photos,i.thumbnail
FROM public.market_listings() m
JOIN public.listings l ON l.id=m.listing_id
JOIN public.items i ON i.id=l.item_id
WHERE l.status='active' AND auth.uid() IS NOT NULL;
$$;
REVOKE ALL ON FUNCTION public.market_listings_with_photos() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.market_listings_with_photos() TO authenticated;
COMMENT ON FUNCTION public.market_listings_with_photos() IS 'Active marketplace listings with seller photos and original scan for Just listed. Preserves shared image selection in existing market_listings.';