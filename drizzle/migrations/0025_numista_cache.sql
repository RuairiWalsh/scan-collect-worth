CREATE TABLE public.numista_types (
  type_id integer PRIMARY KEY,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  fetched_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.numista_types TO service_role;
ALTER TABLE public.numista_types ENABLE ROW LEVEL SECURITY;