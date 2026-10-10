CREATE TABLE public.price_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  est_value numeric,
  price_low numeric,
  price_high numeric,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX price_history_item_idx ON public.price_history (item_id, recorded_at);

GRANT SELECT, INSERT, DELETE ON public.price_history TO authenticated;
GRANT ALL ON public.price_history TO service_role;

ALTER TABLE public.price_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own price history select" ON public.price_history FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own price history insert" ON public.price_history FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own price history delete" ON public.price_history FOR DELETE TO authenticated USING (auth.uid() = user_id);