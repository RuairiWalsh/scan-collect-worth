ALTER TABLE public.items ADD COLUMN back_image text;
COMMENT ON COLUMN public.items.back_image IS 'Back-of-card scan (data URL) saved when the collector scans the reverse side.';