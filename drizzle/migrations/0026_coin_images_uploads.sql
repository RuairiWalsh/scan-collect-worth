create table public.coin_images (
  type_id integer not null,
  year text not null,
  side text not null default 'obverse' check (side in ('obverse','reverse')),
  storage_path text not null,
  uploaded_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (type_id, year, side)
);
grant select, insert, update, delete on public.coin_images to authenticated;
grant all on public.coin_images to service_role;
alter table public.coin_images enable row level security;
create policy "Admins manage coin images" on public.coin_images for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

create policy "Admins upload coin images" on storage.objects for insert to authenticated
  with check (bucket_id = 'coin-images' and public.has_role(auth.uid(), 'admin'));
create policy "Admins update coin images" on storage.objects for update to authenticated
  using (bucket_id = 'coin-images' and public.has_role(auth.uid(), 'admin'));
create policy "Admins read coin images" on storage.objects for select to authenticated
  using (bucket_id = 'coin-images' and public.has_role(auth.uid(), 'admin'));
create policy "Admins delete coin images" on storage.objects for delete to authenticated
  using (bucket_id = 'coin-images' and public.has_role(auth.uid(), 'admin'));

-- Point matching coins at the uploaded image once it exists.
create or replace function public.apply_coin_image() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.side = 'obverse' then
    update public.items set product_image = '/api/public/coin-images/' || new.type_id || '?side=obverse&year=' || new.year || '&src=lymitz'
    where category = 'coins' and year = new.year
      and (catalog_id = 'numista:' || new.type_id or catalog_id like 'numista:' || new.type_id || ':%');
  end if;
  return new;
end $$;
create trigger coin_images_apply after insert or update on public.coin_images for each row execute function public.apply_coin_image();

create or replace function public.admin_coin_image_queue()
returns table(type_id integer, year text, name text, country text, scan text, item_count bigint, has_obverse boolean, has_reverse boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_role(auth.uid(), 'admin') then raise exception 'Admins only'; end if;
  return query
  select t.tid, t.year, max(t.name), max(t.set_name), (array_agg(t.thumbnail))[1], count(*),
    exists(select 1 from public.coin_images c where c.type_id = t.tid and c.year = t.year and c.side = 'obverse'),
    exists(select 1 from public.coin_images c where c.type_id = t.tid and c.year = t.year and c.side = 'reverse')
  from (select split_part(i.catalog_id, ':', 2)::int as tid, coalesce(i.year, '') as year, i.name, i.set_name, i.thumbnail
        from public.items i where i.category = 'coins' and i.catalog_id ~ '^numista:\d+') t
  where t.year <> ''
  group by t.tid, t.year order by count(*) desc;
end $$;
revoke execute on function public.admin_coin_image_queue() from anon, public;
grant execute on function public.admin_coin_image_queue() to authenticated;