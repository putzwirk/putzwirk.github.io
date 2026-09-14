
create table if not exists public.mods (
  id text primary key,
  name text not null,
  tagline text not null default '',
  issue_label text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz default now(),
  description text not null default '',
  author text not null default 'Putzwirk',
  required_mods text[] not null default '{}'
);

create table if not exists public.mod_versions (
  id uuid primary key default gen_random_uuid(),
  mod_id text not null references public.mods(id) on delete cascade,
  version text not null,
  game_version text not null,
  release_date date not null,
  changelog text[] not null default '{}',
  pck_filename text not null,
  storage_path text not null,
  created_at timestamptz default now(),
  download_count integer not null default 0
);

create table if not exists public.issues (
  id uuid primary key default gen_random_uuid(),
  mod_id text references public.mods(id) on delete cascade,
  type text not null default 'bug' check (type in ('bug', 'idea')),
  title text not null check (char_length(title) between 1 and 120),
  description text not null default '',
  author_name text not null default 'Anonymous' check (char_length(author_name) between 1 and 40),
  status text not null default 'open' check (status in ('open', 'closed')),
  votes integer not null default 0,
  created_at timestamptz default now(),
  attachment_urls text[] not null default '{}',
  closed_at timestamptz,
  moderation_status text not null default 'approved' check (moderation_status in ('pending', 'approved', 'rejected')),
  moderation_reason text,
  moderated_at timestamptz
);

alter table public.mods add column if not exists tagline text not null default '';
alter table public.mods add column if not exists issue_label text not null default '';
alter table public.mods add column if not exists sort_order integer not null default 0;
alter table public.mods add column if not exists created_at timestamptz default now();
alter table public.mods add column if not exists description text not null default '';
alter table public.mods add column if not exists author text not null default 'Putzwirk';
alter table public.mods add column if not exists required_mods text[] not null default '{}';

alter table public.mod_versions add column if not exists mod_id text;
alter table public.mod_versions add column if not exists version text;
alter table public.mod_versions add column if not exists game_version text;
alter table public.mod_versions add column if not exists release_date date;
alter table public.mod_versions add column if not exists changelog text[] not null default '{}';
alter table public.mod_versions add column if not exists pck_filename text;
alter table public.mod_versions add column if not exists storage_path text;
alter table public.mod_versions add column if not exists created_at timestamptz default now();
alter table public.mod_versions add column if not exists download_count integer not null default 0;

alter table public.issues add column if not exists mod_id text;
alter table public.issues add column if not exists type text not null default 'bug';
alter table public.issues add column if not exists title text not null default '';
alter table public.issues add column if not exists description text not null default '';
alter table public.issues add column if not exists author_name text not null default 'Anonymous';
alter table public.issues add column if not exists status text not null default 'open';
alter table public.issues add column if not exists votes integer not null default 0;
alter table public.issues add column if not exists created_at timestamptz default now();
alter table public.issues add column if not exists attachment_urls text[] not null default '{}';
alter table public.issues add column if not exists closed_at timestamptz;
alter table public.issues add column if not exists moderation_status text not null default 'approved';
alter table public.issues add column if not exists moderation_reason text;
alter table public.issues add column if not exists moderated_at timestamptz;

create index if not exists idx_mod_versions_mod_id on public.mod_versions (mod_id);
create index if not exists idx_issues_mod_id on public.issues (mod_id);
create index if not exists idx_issues_type on public.issues (type);
create index if not exists idx_issues_created_at on public.issues (created_at desc);

alter table public.mods enable row level security;
alter table public.mod_versions enable row level security;
alter table public.issues enable row level security;

drop policy if exists public_read_mods on public.mods;
create policy public_read_mods on public.mods for select to anon, authenticated using (true);
drop policy if exists admin_insert_mods on public.mods;
create policy admin_insert_mods on public.mods for insert to authenticated with check (true);
drop policy if exists admin_update_mods on public.mods;
create policy admin_update_mods on public.mods for update to authenticated using (true) with check (true);
drop policy if exists admin_delete_mods on public.mods;
create policy admin_delete_mods on public.mods for delete to authenticated using (true);

drop policy if exists public_read_mod_versions on public.mod_versions;
create policy public_read_mod_versions on public.mod_versions for select to anon, authenticated using (true);
drop policy if exists admin_insert_mod_versions on public.mod_versions;
create policy admin_insert_mod_versions on public.mod_versions for insert to authenticated with check (true);
drop policy if exists admin_update_mod_versions on public.mod_versions;
create policy admin_update_mod_versions on public.mod_versions for update to authenticated using (true) with check (true);
drop policy if exists admin_delete_mod_versions on public.mod_versions;
create policy admin_delete_mod_versions on public.mod_versions for delete to authenticated using (true);

drop policy if exists public_read_issues on public.issues;
create policy public_read_issues on public.issues for select to anon, authenticated using (true);
drop policy if exists authenticated_read_all_issues on public.issues;
create policy authenticated_read_all_issues on public.issues for select to authenticated using (true);
drop policy if exists public_insert_issues on public.issues;
create policy public_insert_issues on public.issues for insert to anon, authenticated with check (true);
drop policy if exists admin_update_issues on public.issues;
create policy admin_update_issues on public.issues for update to authenticated using (true) with check (true);
drop policy if exists admin_delete_issues on public.issues;
create policy admin_delete_issues on public.issues for delete to authenticated using (true);
drop policy if exists anonymous_delete_pending_issues on public.issues;
create policy anonymous_delete_pending_issues on public.issues for delete to anon using (moderation_status = 'pending');

create or replace function public.enforce_issue_moderation()
returns trigger
language plpgsql
as $$
declare
  combined_text text;
begin
  if auth.uid() is not null then
    new.moderation_status := 'approved';
    new.moderated_at := now();
    new.moderation_reason := null;
    return new;
  end if;

  new.moderation_status := 'pending';
  new.moderated_at := null;
  new.moderation_reason := null;
  combined_text := lower(coalesce(new.title, '') || ' ' || coalesce(new.description, '') || ' ' || coalesce(new.author_name, ''));
  if combined_text ~ '(^|[^a-z])(porn|pornography|nudes?|nsfw|xxx|fuck|shit|bitch|cunt|nigg|penis|vagina)([^a-z]|$)' then
    new.moderation_status := 'rejected';
    new.moderation_reason := 'Blocked by automatic content moderation';
    new.moderated_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_issue_moderation on public.issues;
create trigger enforce_issue_moderation before insert on public.issues
  for each row execute function public.enforce_issue_moderation();

create or replace function public.increment_issue_votes(p_issue_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  update issues set votes = votes + 1 where id = p_issue_id and type = 'idea';
end;
$$;

create or replace function public.increment_version_downloads(version_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  update mod_versions set download_count = download_count + 1 where id = version_id;
end;
$$;

create or replace function public.remove_expired_issue_attachments()
returns void
language plpgsql
security definer
set search_path to 'public', 'storage'
as $$
begin
  delete from storage.objects
  where bucket_id = 'issue-attachments'
    and name in (
      select split_part(url, '/object/public/issue-attachments/', 2)
      from public.issues cross join unnest(attachment_urls) as url
      where status = 'closed'
        and closed_at is not null
        and closed_at < now() - interval '24 hours'
    );

  update public.issues
  set attachment_urls = '{}'
  where status = 'closed'
    and closed_at is not null
    and closed_at < now() - interval '24 hours'
    and coalesce(cardinality(attachment_urls), 0) > 0;
end;
$$;

create or replace function public.set_mod_dependencies(mod_slug text, deps_csv text)
returns void
language plpgsql
as $$
begin
  update mods
  set required_mods = case
    when deps_csv is null or btrim(deps_csv) = '' then '{}'::text[]
    else (select coalesce(array_agg(btrim(slug)), '{}') from unnest(string_to_array(deps_csv, ',')) as slug where btrim(slug) <> '')
  end
  where id = mod_slug;
end;
$$;

grant all on table public.mods to anon, authenticated, service_role;
grant all on table public.mod_versions to anon, authenticated, service_role;
grant all on table public.issues to anon, authenticated, service_role;

grant execute on function public.enforce_issue_moderation() to anon, authenticated, service_role;
grant execute on function public.increment_issue_votes(uuid) to anon, authenticated, service_role;
grant execute on function public.increment_version_downloads(uuid) to anon, authenticated, service_role;
grant execute on function public.remove_expired_issue_attachments() to anon, authenticated, service_role;
grant execute on function public.set_mod_dependencies(text, text) to anon, authenticated, service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('mod-files', 'mod-files', true, null, null)
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'issue-attachments',
  'issue-attachments',
  true,
  2097152,
  array['image/png','image/jpeg','image/gif','image/webp','image/bmp','image/svg+xml','image/avif','image/apng','video/mp4','video/webm','video/ogg','video/quicktime','video/x-msvideo','video/x-matroska','image/*','video/*']
)
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists public_read_mod_files on storage.objects;
create policy public_read_mod_files on storage.objects for select to anon, authenticated using (bucket_id = 'mod-files');
drop policy if exists admin_upload_mod_files on storage.objects;
create policy admin_upload_mod_files on storage.objects for insert to authenticated with check (bucket_id = 'mod-files');
drop policy if exists admin_update_mod_files on storage.objects;
create policy admin_update_mod_files on storage.objects for update to authenticated using (bucket_id = 'mod-files') with check (bucket_id = 'mod-files');
drop policy if exists admin_delete_mod_files on storage.objects;
create policy admin_delete_mod_files on storage.objects for delete to authenticated using (bucket_id = 'mod-files');
drop policy if exists public_read_issue_attachments on storage.objects;
create policy public_read_issue_attachments on storage.objects for select to anon, authenticated using (bucket_id = 'issue-attachments');
drop policy if exists public_upload_issue_attachments on storage.objects;
create policy public_upload_issue_attachments on storage.objects for insert to anon, authenticated with check (bucket_id = 'issue-attachments');

select cron.schedule(
  'remove-expired-issue-attachments',
  '15 * * * *',
  'select public.remove_expired_issue_attachments()'
);
