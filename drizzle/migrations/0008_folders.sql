CREATE TABLE public.folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.folders TO authenticated;
GRANT ALL ON public.folders TO service_role;
ALTER TABLE public.folders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own folders select" ON public.folders FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own folders insert" ON public.folders FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own folders update" ON public.folders FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own folders delete" ON public.folders FOR DELETE TO authenticated USING (auth.uid() = user_id);
ALTER TABLE public.items ADD COLUMN folder_id uuid REFERENCES public.folders(id) ON DELETE SET NULL;
CREATE INDEX items_folder_id_idx ON public.items(folder_id);