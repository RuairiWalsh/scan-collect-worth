create table public.catalog_price_history (
  id uuid not null default gen_random_uuid() primary key,
  catalog_id text not null references public.catalog_prices(catalog_id) on delete cascade,
  nm_price numeric,
  recorded_at timestamptz not null default now()
);
create index catalog_price_history_catalog_idx on public.catalog_price_history (catalog_id, recorded_at);
alter table public.catalog_price_history enable row level security;
create policy "authenticated read catalog price history" on public.catalog_price_history for select to authenticated using (true);
grant select on public.catalog_price_history to authenticated;
grant insert on public.catalog_price_history to service_role;