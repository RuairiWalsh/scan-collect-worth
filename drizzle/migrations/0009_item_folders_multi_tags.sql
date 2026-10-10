CREATE TABLE public.item_folders (
  item_id uuid NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  folder_id uuid NOT NULL REFERENCES public.folders(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (item_id, folder_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.item_folders TO authenticated;
GRANT ALL ON public.item_folders TO service_role;
ALTER TABLE public.item_folders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own item folders select" ON public.item_folders FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own item folders insert" ON public.item_folders FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own item folders update" ON public.item_folders FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own item folders delete" ON public.item_folders FOR DELETE TO authenticated USING (auth.uid() = user_id);
INSERT INTO public.item_folders (item_id, folder_id, user_id)
SELECT id, folder_id, user_id FROM public.items WHERE folder_id IS NOT NULL;
COMMENT ON COLUMN public.items.folder_id IS 'DEPRECATED: replaced by item_folders join table (multi-folder tags)';