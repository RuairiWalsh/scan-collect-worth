CREATE OR REPLACE FUNCTION public.market_listings()
RETURNS TABLE (listing_id uuid, price numeric, created_at timestamptz, seller_id uuid, store_name text,
  item_id uuid, name text, category text, subcategory text, line text, catalog_id text, set_name text, number text, variant text, condition text,
  grader text, grade text, image text, est_value numeric, photos text[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT l.id, l.price, l.created_at, l.seller_id,
    (SELECT a.store_name FROM public.merchant_applications a WHERE a.user_id = l.seller_id AND a.status = 'approved' ORDER BY a.created_at DESC LIMIT 1),
    i.id, i.name, i.category, i.subcategory, i.line, i.catalog_id, i.set_name, i.number, i.variant, i.condition, i.grader, i.grade,
    CASE WHEN i.category = 'cards' THEN COALESCE(i.product_image, i.thumbnail) ELSE i.thumbnail END, i.est_value, l.photos
  FROM public.listings l JOIN public.items i ON i.id = l.item_id
  WHERE l.status = 'active' AND auth.uid() IS NOT NULL
  ORDER BY l.created_at DESC
$$;
REVOKE EXECUTE ON FUNCTION public.market_listings() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.market_listings() TO authenticated;