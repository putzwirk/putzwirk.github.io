alter table public.issues add column if not exists state text not null default 'open';
alter table public.issues add column if not exists fixed_in_version_id uuid references public.mod_versions(id) on delete set null;

update public.issues set state = case when status = 'closed' then 'closed' else 'open' end where state is null or state = 'open';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'issues_state_check') then
    alter table public.issues add constraint issues_state_check check (state in ('open', 'needs_info', 'confirmed', 'in_progress', 'fixed', 'duplicate', 'wontfix', 'closed'));
  end if;
end $$;

create index if not exists idx_issues_state on public.issues (state);

create or replace function public.issue_status_from_state(p_state text)
returns text
language sql
immutable
as $$
  select case when p_state in ('open', 'needs_info', 'confirmed', 'in_progress') then 'open' else 'closed' end
$$;

create or replace function public.enforce_issue_moderation()
returns trigger
language plpgsql
set search_path = 'public'
as $$
declare
  combined_text text;
  trusted boolean;
begin
  trusted := public.is_staff() or current_user not in ('anon', 'authenticated');

  if tg_op = 'UPDATE' then
    new.updated_at := now();
    if trusted then
      if new.state is distinct from old.state then
        if public.issue_status_from_state(new.state) = 'closed' then
          new.closed_at := coalesce(new.closed_at, now());
        else
          new.closed_at := null;
        end if;
      end if;
      new.status := public.issue_status_from_state(new.state);
      return new;
    end if;
    new.mod_id := old.mod_id;
    new.type := old.type;
    new.state := old.state;
    new.votes := old.votes;
    new.created_at := old.created_at;
    new.closed_at := old.closed_at;
    new.moderation_status := old.moderation_status;
    new.moderated_at := old.moderated_at;
    new.moderation_reason := old.moderation_reason;
    new.author_id := old.author_id;
    new.fixed_in_version_id := old.fixed_in_version_id;
    new.status := public.issue_status_from_state(new.state);
    return new;
  end if;

  if new.state is null then
    new.state := 'open';
  end if;
  new.status := public.issue_status_from_state(new.state);

  if trusted then
    if new.moderation_status is null then
      new.moderation_status := 'pending';
    end if;
    if new.moderation_status = 'approved' and new.moderated_at is null then
      new.moderated_at := now();
    end if;
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

create table if not exists public.labels (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(name) between 1 and 40),
  color text not null default '#808080',
  scope text not null default 'global' check (scope in ('global', 'mod')),
  created_at timestamptz default now()
);

create table if not exists public.issue_labels (
  issue_id uuid not null references public.issues(id) on delete cascade,
  label_id uuid not null references public.labels(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (issue_id, label_id)
);

create index if not exists idx_issue_labels_issue on public.issue_labels (issue_id);
create index if not exists idx_issue_labels_label on public.issue_labels (label_id);

create table if not exists public.issue_events (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references public.issues(id) on delete cascade,
  actor_id uuid,
  actor_name text,
  event text not null,
  from_state text,
  to_state text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_issue_events_issue on public.issue_events (issue_id, created_at);

alter table public.labels enable row level security;
alter table public.issue_labels enable row level security;
alter table public.issue_events enable row level security;

drop policy if exists labels_select on public.labels;
create policy labels_select on public.labels for select to anon, authenticated using (true);
drop policy if exists labels_write_staff on public.labels;
create policy labels_write_staff on public.labels for all to authenticated using (public.is_staff()) with check (public.is_staff());

drop policy if exists issue_labels_select on public.issue_labels;
create policy issue_labels_select on public.issue_labels for select to anon, authenticated using (true);
drop policy if exists issue_labels_write_staff on public.issue_labels;
create policy issue_labels_write_staff on public.issue_labels for all to authenticated using (public.is_staff()) with check (public.is_staff());

drop policy if exists issue_events_select on public.issue_events;
create policy issue_events_select on public.issue_events
  for select to anon, authenticated
  using (public.can_read_issue(issue_id) or public.is_staff());

revoke all on table public.labels from anon, authenticated;
grant select on table public.labels to anon, authenticated;
grant insert, update, delete on table public.labels to authenticated;
grant all on table public.labels to service_role;

revoke all on table public.issue_labels from anon, authenticated;
grant select on table public.issue_labels to anon, authenticated;
grant insert, update, delete on table public.issue_labels to authenticated;
grant all on table public.issue_labels to service_role;

revoke all on table public.issue_events from anon, authenticated;
grant select on table public.issue_events to anon, authenticated;
grant all on table public.issue_events to service_role;

revoke truncate, references, trigger on public.labels from anon, authenticated;
revoke truncate, references, trigger on public.issue_labels from anon, authenticated;
revoke truncate, references, trigger on public.issue_events from anon, authenticated;

create or replace function public.log_issue_event()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_actor uuid;
  v_name text;
begin
  v_actor := auth.uid();
  v_name := (public.jwt_claims() ->> 'email');

  if new.state is distinct from old.state then
    insert into public.issue_events (issue_id, actor_id, actor_name, event, from_state, to_state)
    values (new.id, v_actor, v_name, 'state_change', old.state, new.state);
  end if;

  if new.moderation_status is distinct from old.moderation_status then
    insert into public.issue_events (issue_id, actor_id, actor_name, event, metadata)
    values (new.id, v_actor, v_name, 'moderation', jsonb_build_object('from', old.moderation_status, 'to', new.moderation_status));
  end if;

  if new.fixed_in_version_id is distinct from old.fixed_in_version_id then
    insert into public.issue_events (issue_id, actor_id, actor_name, event, metadata)
    values (new.id, v_actor, v_name, 'fixed_in', jsonb_build_object('version_id', new.fixed_in_version_id));
  end if;

  return null;
end;
$$;

drop trigger if exists log_issue_event on public.issues;
create trigger log_issue_event
  after update on public.issues
  for each row execute function public.log_issue_event();

grant execute on function public.issue_status_from_state(text) to anon, authenticated, service_role;
grant execute on function public.log_issue_event() to anon, authenticated, service_role;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.issues;
    exception when duplicate_object then null;
    end;
    begin
      alter publication supabase_realtime add table public.issue_comments;
    exception when duplicate_object then null;
    end;
    begin
      alter publication supabase_realtime add table public.notifications;
    exception when undefined_table then null;
    when duplicate_object then null;
    end;
  end if;
end $$;
