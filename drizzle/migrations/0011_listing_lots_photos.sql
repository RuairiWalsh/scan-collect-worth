CREATE TABLE public.listing_lots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL DEFAULT auth.uid(),
  title text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.listing_lots TO authenticated;
GRANT ALL ON public.listing_lots TO service_role;
ALTER TABLE public.listing_lots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own lots select" ON public.listing_lots FOR SELECT TO authenticated USING (auth.uid() = seller_id);
CREATE POLICY "merchant lots insert" ON public.listing_lots FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = seller_id AND public.has_role(auth.uid(), 'merchant'));
CREATE POLICY "own lots update" ON public.listing_lots FOR UPDATE TO authenticated USING (auth.uid() = seller_id) WITH CHECK (auth.uid() = seller_id);
CREATE POLICY "own lots delete" ON public.listing_lots FOR DELETE TO authenticated USING (auth.uid() = seller_id);

ALTER TABLE public.listings ADD COLUMN lot_id uuid REFERENCES public.listing_lots(id) ON DELETE SET NULL;
ALTER TABLE public.listings ADD COLUMN photos text[] NOT NULL DEFAULT '{}';

DROP FUNCTION public.market_listings();
CREATE FUNCTION public.market_listings()
RETURNS TABLE (listing_id uuid, price numeric, created_at timestamptz, seller_id uuid, store_name text,
  item_id uuid, name text, category text, set_name text, number text, variant text, condition text,
  grader text, grade text, image text, est_value numeric, photos text[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT l.id, l.price, l.created_at, l.seller_id,
    (SELECT a.store_name FROM public.merchant_applications a WHERE a.user_id = l.seller_id AND a.status = 'approved' ORDER BY a.created_at DESC LIMIT 1),
    i.id, i.name, i.category, i.set_name, i.number, i.variant, i.condition, i.grader, i.grade,
    COALESCE(i.official_image, i.thumbnail), i.est_value, l.photos
  FROM public.listings l JOIN public.items i ON i.id = l.item_id
  WHERE l.status = 'active' AND auth.uid() IS NOT NULL
  ORDER BY l.created_at DESC
$$;
REVOKE EXECUTE ON FUNCTION public.market_listings() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.market_listings() TO authenticated;

CREATE POLICY "signed in read listing photos" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'listing-photos');
CREATE POLICY "merchants upload own listing photos" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'listing-photos' AND (storage.foldername(name))[1] = auth.uid()::text AND public.has_role(auth.uid(), 'merchant'));
CREATE POLICY "merchants delete own listing photos" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'listing-photos' AND (storage.foldername(name))[1] = auth.uid()::text);