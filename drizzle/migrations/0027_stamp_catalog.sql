create table public.stamp_catalog (
  id uuid primary key default gen_random_uuid(),
  match_key text not null unique,
  country text not null,
  year text,
  name text not null,
  denomination text,
  catalog_system text,
  catalog_number text,
  image_path text,
  source text not null default 'scan' check (source in ('scan','admin')),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index stamp_catalog_number_idx on public.stamp_catalog (lower(country), lower(catalog_system), lower(catalog_number)) where catalog_number is not null;
grant select, insert, update, delete on public.stamp_catalog to authenticated;
grant all on public.stamp_catalog to service_role;
alter table public.stamp_catalog enable row level security;
create policy "Signed-in read stamp catalog" on public.stamp_catalog for select to authenticated using (true);
create policy "Admins add stamps" on public.stamp_catalog for insert to authenticated with check (public.has_role(auth.uid(), 'admin'));
create policy "Admins edit stamps" on public.stamp_catalog for update to authenticated using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));
create policy "Admins delete stamps" on public.stamp_catalog for delete to authenticated using (public.has_role(auth.uid(), 'admin'));
create trigger stamp_catalog_touch before update on public.stamp_catalog for each row execute function public.touch_updated_at();

create policy "Admins upload stamp images" on storage.objects for insert to authenticated with check (bucket_id = 'stamp-images' and public.has_role(auth.uid(), 'admin'));
create policy "Admins update stamp images" on storage.objects for update to authenticated using (bucket_id = 'stamp-images' and public.has_role(auth.uid(), 'admin'));
create policy "Admins read stamp images" on storage.objects for select to authenticated using (bucket_id = 'stamp-images' and public.has_role(auth.uid(), 'admin'));
create policy "Admins delete stamp images" on storage.objects for delete to authenticated using (bucket_id = 'stamp-images' and public.has_role(auth.uid(), 'admin'));

-- When an official image is added, every matching stamp shows it.
create or replace function public.apply_stamp_image() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.image_path is distinct from old.image_path then
    update public.items set product_image = case when new.image_path is null then null else '/api/public/stamp-images/' || new.id end
    where category = 'stamps' and catalog_id = 'stamp:' || new.id;
  end if;
  return new;
end $$;
create trigger stamp_catalog_apply after update on public.stamp_catalog for each row execute function public.apply_stamp_image();

create or replace function public.admin_stamp_catalog()
returns table(id uuid, country text, year text, name text, denomination text, catalog_system text, catalog_number text, image_path text, source text, scan text, item_count bigint, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_role(auth.uid(), 'admin') then raise exception 'Admins only'; end if;
  return query
  select s.id, s.country, s.year, s.name, s.denomination, s.catalog_system, s.catalog_number, s.image_path, s.source,
    (select i.thumbnail from public.items i where i.catalog_id = 'stamp:' || s.id and i.thumbnail is not null limit 1),
    (select count(*) from public.items i where i.catalog_id = 'stamp:' || s.id),
    s.created_at
  from public.stamp_catalog s order by (s.image_path is null) desc, s.created_at desc limit 500;
end $$;
revoke execute on function public.admin_stamp_catalog() from anon, public;
grant execute on function public.admin_stamp_catalog() to authenticated;