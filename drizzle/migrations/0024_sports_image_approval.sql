CREATE OR REPLACE FUNCTION public.require_sports_image_review() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.source = 'cardsight_cardmagic' AND NEW.card_metadata->>'subcategory' = 'sports' AND (TG_OP = 'INSERT' OR NEW.claim_id IS DISTINCT FROM OLD.claim_id) THEN
    NEW.review_status := 'pending';
    NEW.reviewed_by := NULL;
    NEW.reviewed_at := NULL;
    NEW.review_note := NULL;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER sports_image_review BEFORE INSERT OR UPDATE ON public.card_product_images FOR EACH ROW EXECUTE FUNCTION public.require_sports_image_review();
CREATE OR REPLACE FUNCTION public.admin_image_queue(_status text DEFAULT 'pending') RETURNS TABLE(card_key text, image text, original_scan text, card_metadata jsonb, review_status text, review_note text, reviewed_at timestamptz, updated_at timestamptz) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF _status NOT IN ('pending','approved','rejected') THEN RAISE EXCEPTION 'Invalid review status'; END IF;
  RETURN QUERY SELECT c.card_key,c.image,c.original_scan,c.card_metadata,c.review_status,c.review_note,c.reviewed_at,c.updated_at FROM public.card_product_images c WHERE c.status = 'ready' AND c.review_status = _status AND c.source = 'cardsight_cardmagic' AND (c.card_metadata->>'subcategory' = 'sports' OR EXISTS (SELECT 1 FROM public.items i WHERE i.product_image = c.image AND i.subcategory = 'sports')) ORDER BY c.updated_at DESC LIMIT 100;
END $$;
REVOKE ALL ON FUNCTION public.admin_image_queue(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_image_queue(text) TO authenticated;
COMMENT ON FUNCTION public.require_sports_image_review() IS 'New CardSight sports images require approval; confirmed admin PDF imports are unaffected.';