alter table public.mod_versions add column if not exists checksum_sha256 text;
alter table public.mod_versions add column if not exists channel text not null default 'stable';
alter table public.mod_versions add column if not exists published boolean not null default true;

alter table public.mods add column if not exists tags text[] not null default '{}';
alter table public.mods add column if not exists banner_path text;
alter table public.mods add column if not exists screenshots jsonb not null default '[]'::jsonb;
alter table public.mods add column if not exists published boolean not null default true;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'mod_versions_channel_check') then
    alter table public.mod_versions add constraint mod_versions_channel_check check (channel in ('stable', 'beta'));
  end if;
end $$;

create unique index if not exists mod_versions_mod_id_version_key on public.mod_versions (mod_id, version);
create index if not exists idx_mods_tags on public.mods using gin (tags);
create index if not exists idx_mod_versions_published on public.mod_versions (mod_id, release_date desc) where published;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'mod-assets',
  'mod-assets',
  true,
  5242880,
  array['image/png','image/jpeg','image/webp','image/gif','image/avif']
)
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists public_read_mod_assets on storage.objects;
create policy public_read_mod_assets on storage.objects
  for select to anon, authenticated using (bucket_id = 'mod-assets');

drop policy if exists staff_insert_mod_assets on storage.objects;
create policy staff_insert_mod_assets on storage.objects
  for insert to authenticated with check (bucket_id = 'mod-assets' and public.is_staff());

drop policy if exists staff_update_mod_assets on storage.objects;
create policy staff_update_mod_assets on storage.objects
  for update to authenticated using (bucket_id = 'mod-assets' and public.is_staff())
  with check (bucket_id = 'mod-assets' and public.is_staff());

drop policy if exists staff_delete_mod_assets on storage.objects;
create policy staff_delete_mod_assets on storage.objects
  for delete to authenticated using (bucket_id = 'mod-assets' and public.is_staff());

grant execute on function public.is_staff() to anon, authenticated, service_role;
