ALTER TABLE public.items ADD COLUMN product_image text;
COMMENT ON COLUMN public.items.official_image IS 'DEPRECATED: provider artwork must not be displayed; use scan-derived product_image or thumbnail.';
CREATE TABLE public.card_product_images (
  card_key text PRIMARY KEY,
  catalog_id text,
  image text,
  status text NOT NULL DEFAULT 'processing' CHECK (status IN ('processing','ready','failed')),
  claim_id uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'cardsight_cardmagic' CHECK (source = 'cardsight_cardmagic')
);
GRANT SELECT (card_key, catalog_id, image, status, source) ON public.card_product_images TO anon, authenticated;
GRANT ALL ON public.card_product_images TO service_role;
ALTER TABLE public.card_product_images ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read ready scan-derived product images" ON public.card_product_images FOR SELECT TO anon, authenticated USING (status = 'ready');
CREATE INDEX card_product_images_catalog_idx ON public.card_product_images(catalog_id) WHERE status = 'ready';