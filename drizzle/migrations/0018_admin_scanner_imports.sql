ALTER TABLE public.card_product_images ADD COLUMN back_image text;
ALTER TABLE public.card_product_images DROP CONSTRAINT IF EXISTS card_product_images_source_check;
ALTER TABLE public.card_product_images ADD CONSTRAINT card_product_images_source_check CHECK (source IN ('cardsight_cardmagic','admin_scanner'));
CREATE TABLE public.card_image_imports (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL DEFAULT auth.uid(), file_hash text NOT NULL, file_name text NOT NULL, page_count integer NOT NULL CHECK(page_count > 0 AND page_count % 2 = 0), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(user_id,file_hash)
);
GRANT SELECT, INSERT ON public.card_image_imports TO authenticated;
GRANT ALL ON public.card_image_imports TO service_role;
ALTER TABLE public.card_image_imports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read scanner imports" ON public.card_image_imports FOR SELECT TO authenticated USING(public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins create scanner imports" ON public.card_image_imports FOR INSERT TO authenticated WITH CHECK(user_id=auth.uid() AND public.has_role(auth.uid(),'admin'));
CREATE TABLE public.card_image_import_pairs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), import_id uuid NOT NULL REFERENCES public.card_image_imports(id) ON DELETE CASCADE, pair_index integer NOT NULL CHECK(pair_index >= 0), front_path text NOT NULL, back_path text NOT NULL, status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','needs_details','failed','duplicate')), metadata jsonb NOT NULL DEFAULT '{}'::jsonb, error text, card_key text, updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(import_id,pair_index)
);
GRANT SELECT ON public.card_image_import_pairs TO authenticated;
GRANT ALL ON public.card_image_import_pairs TO service_role;
ALTER TABLE public.card_image_import_pairs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read scanner pairs" ON public.card_image_import_pairs FOR SELECT TO authenticated USING(public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins upload scanner files" ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='admin-card-scans' AND (storage.foldername(name))[1]=auth.uid()::text AND public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins read scanner files" ON storage.objects FOR SELECT TO authenticated USING(bucket_id='admin-card-scans' AND public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins replace scanner files" ON storage.objects FOR UPDATE TO authenticated USING(bucket_id='admin-card-scans' AND (storage.foldername(name))[1]=auth.uid()::text AND public.has_role(auth.uid(),'admin')) WITH CHECK(bucket_id='admin-card-scans' AND (storage.foldername(name))[1]=auth.uid()::text AND public.has_role(auth.uid(),'admin'));
