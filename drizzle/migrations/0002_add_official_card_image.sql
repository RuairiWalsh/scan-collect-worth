ALTER TABLE public.items ADD COLUMN official_image text;
COMMENT ON COLUMN public.items.official_image IS 'Official catalog artwork for the exact matched printing; thumbnail retains the user scan.';