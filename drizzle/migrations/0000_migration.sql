CREATE TABLE public.items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  status text NOT NULL DEFAULT 'batch',
  category text NOT NULL DEFAULT 'cards',
  subcategory text,
  line text,
  name text NOT NULL,
  set_name text,
  number text,
  year text,
  variant text,
  condition text NOT NULL DEFAULT 'raw_nm',
  grader text,
  grade text,
  quantity integer NOT NULL DEFAULT 1,
  notes text,
  thumbnail text,
  ai_confidence numeric,
  est_value numeric,
  price_low numeric,
  price_high numeric,
  price_sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  price_updated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.items TO authenticated;
GRANT ALL ON public.items TO service_role;
ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own items select" ON public.items FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own items insert" ON public.items FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own items update" ON public.items FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own items delete" ON public.items FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX items_user_status_idx ON public.items(user_id, status);
CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER items_touch BEFORE UPDATE ON public.items FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();