
drop function if exists public.increment_issue_votes(uuid);
drop function if exists public.increment_version_downloads(uuid);
drop function if exists public.set_mod_dependencies(text, text);

create table if not exists public.issue_votes (
  issue_id uuid not null references public.issues(id) on delete cascade,
  voter_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (issue_id, voter_id)
);

alter table public.issue_votes enable row level security;

drop policy if exists votes_select_own on public.issue_votes;
create policy votes_select_own on public.issue_votes
  for select to authenticated using (voter_id = auth.uid());
drop policy if exists votes_select_staff on public.issue_votes;
create policy votes_select_staff on public.issue_votes
  for select to authenticated using (public.is_staff());

revoke truncate, references, trigger on public.issue_votes from anon, authenticated;
revoke all on table public.issue_votes from anon, authenticated;
grant select on table public.issue_votes to authenticated;
grant all on table public.issue_votes to service_role;

create or replace function public.sync_issue_vote_count()
returns trigger
language plpgsql
set search_path = 'public'
as $$
declare
  v_issue uuid;
begin
  v_issue := coalesce(new.issue_id, old.issue_id);
  update public.issues
    set votes = (select count(*) from public.issue_votes where issue_id = v_issue)
    where id = v_issue;
  return null;
end;
$$;

drop trigger if exists sync_issue_vote_count on public.issue_votes;
create trigger sync_issue_vote_count
  after insert or delete on public.issue_votes
  for each row execute function public.sync_issue_vote_count();

create or replace function public.toggle_vote(p_issue_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_count integer;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'A session is required to vote' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.issues
    where id = p_issue_id and type = 'idea' and deleted_at is null and moderation_status = 'approved'
  ) then
    raise exception 'Only published ideas can be voted on' using errcode = '22023';
  end if;
  if exists (select 1 from public.issue_votes where issue_id = p_issue_id and voter_id = v_uid) then
    delete from public.issue_votes where issue_id = p_issue_id and voter_id = v_uid;
  else
    insert into public.issue_votes (issue_id, voter_id) values (p_issue_id, v_uid);
  end if;
  select count(*) into v_count from public.issue_votes where issue_id = p_issue_id;
  return v_count;
end;
$$;

revoke all on function public.toggle_vote(uuid) from public;
grant execute on function public.toggle_vote(uuid) to authenticated, service_role;

create table if not exists public.download_events (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.mod_versions(id) on delete cascade,
  ip_hash text not null,
  created_at timestamptz not null default now(),
  unique (version_id, ip_hash)
);

alter table public.download_events enable row level security;

drop policy if exists downloads_select_staff on public.download_events;
create policy downloads_select_staff on public.download_events
  for select to authenticated using (public.is_staff());

revoke truncate, references, trigger on public.download_events from anon, authenticated;
revoke all on table public.download_events from anon, authenticated;
grant select on table public.download_events to authenticated;
grant all on table public.download_events to service_role;

create or replace function public.register_download(p_version_id uuid, p_ip_hash text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inserted boolean;
begin
  if p_ip_hash is null or p_ip_hash = '' then
    raise exception 'invalid download identity' using errcode = '22023';
  end if;
  insert into public.download_events (version_id, ip_hash)
  values (p_version_id, p_ip_hash)
  on conflict (version_id, ip_hash) do nothing
  returning true into v_inserted;
  if v_inserted is null then
    return false;
  end if;
  update public.mod_versions set download_count = download_count + 1 where id = p_version_id;
  return true;
end;
$$;

revoke all on function public.register_download(uuid, text) from public;
grant execute on function public.register_download(uuid, text) to service_role;
