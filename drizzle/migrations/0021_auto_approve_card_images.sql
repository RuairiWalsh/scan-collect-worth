UPDATE public.card_product_images SET review_status = 'approved' WHERE review_status = 'pending';
ALTER TABLE public.card_product_images ALTER COLUMN review_status SET DEFAULT 'approved';