ALTER TABLE public.card_product_images ADD COLUMN review_status text NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending','approved','rejected')), ADD COLUMN reviewed_by uuid, ADD COLUMN reviewed_at timestamptz, ADD COLUMN review_note text, ADD COLUMN submitted_by uuid, ADD COLUMN card_metadata jsonb NOT NULL DEFAULT '{}'::jsonb, ADD COLUMN original_scan text;
UPDATE public.card_product_images c SET submitted_by = i.user_id, card_metadata = jsonb_build_object('name', i.name, 'set_name', i.set_name, 'number', i.number, 'year', i.year, 'line', i.line, 'variant', i.variant), original_scan = i.thumbnail FROM public.items i WHERE i.product_image = c.image AND c.image IS NOT NULL;
DROP POLICY "Read ready scan-derived product images" ON public.card_product_images;
CREATE POLICY "Read approved scan-derived images" ON public.card_product_images FOR SELECT TO anon, authenticated USING (status = 'ready' AND review_status = 'approved');
GRANT SELECT (review_status) ON public.card_product_images TO anon, authenticated;
CREATE OR REPLACE FUNCTION public.admin_image_queue(_status text DEFAULT 'pending') RETURNS TABLE(card_key text, image text, original_scan text, card_metadata jsonb, review_status text, review_note text, reviewed_at timestamptz, updated_at timestamptz) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$ BEGIN
IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Not allowed'; END IF;
IF _status NOT IN ('pending','approved','rejected') THEN RAISE EXCEPTION 'Invalid review status'; END IF;
RETURN QUERY SELECT c.card_key,c.image,c.original_scan,c.card_metadata,c.review_status,c.review_note,c.reviewed_at,c.updated_at FROM public.card_product_images c WHERE c.status = 'ready' AND c.review_status = _status ORDER BY c.updated_at DESC LIMIT 100;
END $$;
CREATE OR REPLACE FUNCTION public.admin_review_image(_key text, _approve boolean, _note text DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ BEGIN
IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Not allowed'; END IF;
IF _approve IS NULL OR length(COALESCE(_note,'')) > 1000 THEN RAISE EXCEPTION 'Invalid review'; END IF;
UPDATE public.card_product_images SET review_status = CASE WHEN _approve THEN 'approved' ELSE 'rejected' END, reviewed_by = auth.uid(), reviewed_at = now(), review_note = NULLIF(trim(_note),'') WHERE card_key = _key AND status = 'ready';
IF NOT FOUND THEN RAISE EXCEPTION 'Image unavailable'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.admin_image_queue(text), public.admin_review_image(text,boolean,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_image_queue(text), public.admin_review_image(text,boolean,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.market_listings()
RETURNS TABLE (listing_id uuid, price numeric, created_at timestamptz, seller_id uuid, store_name text, item_id uuid, name text, category text, subcategory text, line text, catalog_id text, set_name text, number text, variant text, condition text, grader text, grade text, image text, est_value numeric, photos text[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
SELECT l.id,l.price,l.created_at,l.seller_id,
(SELECT a.store_name FROM public.merchant_applications a WHERE a.user_id=l.seller_id AND a.status='approved' ORDER BY a.created_at DESC LIMIT 1),
i.id,i.name,i.category,i.subcategory,i.line,i.catalog_id,i.set_name,i.number,i.variant,i.condition,i.grader,i.grade,
CASE WHEN i.category='cards' THEN (SELECT c.image FROM public.card_product_images c WHERE c.image=i.product_image AND c.status='ready' AND c.review_status='approved' LIMIT 1) ELSE i.thumbnail END,i.est_value,
CASE WHEN i.category='cards' THEN ARRAY[]::text[] ELSE l.photos END
FROM public.listings l JOIN public.items i ON i.id=l.item_id WHERE l.status='active' AND auth.uid() IS NOT NULL ORDER BY l.created_at DESC $$;
COMMENT ON COLUMN public.card_product_images.review_status IS 'Admin approval required before images are shared; collectors retain private scans.';