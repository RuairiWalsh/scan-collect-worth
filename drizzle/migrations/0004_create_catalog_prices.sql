CREATE TABLE public.catalog_prices (
  catalog_id text PRIMARY KEY,
  game text,
  name text NOT NULL,
  set_name text,
  number text,
  rarity text,
  image text,
  variants jsonb NOT NULL DEFAULT '[]'::jsonb,
  nm_price numeric,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.catalog_prices TO authenticated;
GRANT ALL ON public.catalog_prices TO service_role;

ALTER TABLE public.catalog_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read catalog prices"
  ON public.catalog_prices FOR SELECT TO authenticated USING (true);

CREATE INDEX catalog_prices_name_idx ON public.catalog_prices (lower(name));