alter table public.issues add column if not exists comment_count integer not null default 0;

create or replace function public.text_is_blocked(p_text text)
returns boolean
language sql
immutable
as $$
  select lower(coalesce(p_text, '')) ~ '(^|[^a-z])(porn|pornography|nudes?|nsfw|xxx|fuck|shit|bitch|cunt|nigg|penis|vagina)([^a-z]|$)'
$$;

create or replace function public.can_read_issue(p_issue_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.issues i
    where i.id = p_issue_id
      and i.deleted_at is null
      and (
        i.moderation_status = 'approved'
        or i.author_id = auth.uid()
        or public.is_staff()
      )
  );
$$;

create table if not exists public.issue_comments (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references public.issues(id) on delete cascade,
  author_id uuid,
  parent_id uuid references public.issue_comments(id) on delete cascade,
  author_name text not null default 'Anonymous' check (char_length(author_name) between 1 and 40),
  body text not null default '' check (char_length(body) <= 2000),
  moderation_status text not null default 'pending' check (moderation_status in ('pending', 'approved', 'rejected')),
  moderation_reason text,
  moderated_at timestamptz,
  state text not null default 'visible' check (state in ('visible', 'hidden', 'deleted')),
  created_at timestamptz default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists idx_issue_comments_issue on public.issue_comments (issue_id, created_at);
create index if not exists idx_issue_comments_queue on public.issue_comments (moderation_status, created_at desc);
create index if not exists idx_issue_comments_author on public.issue_comments (author_id);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'attachments_comment_id_fkey') then
    alter table public.attachments add constraint attachments_comment_id_fkey foreign key (comment_id) references public.issue_comments(id) on delete cascade;
  end if;
end $$;

create or replace function public.comment_parent_is_valid(p_parent_id uuid, p_issue_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_parent_id is null or exists (
    select 1 from public.issue_comments c
    where c.id = p_parent_id and c.issue_id = p_issue_id and c.parent_id is null
  );
$$;

create or replace function public.enforce_comment_moderation()
returns trigger
language plpgsql
set search_path = 'public'
as $$
declare
  trusted boolean;
begin
  trusted := public.is_staff() or current_user not in ('anon', 'authenticated');

  if tg_op = 'UPDATE' then
    new.updated_at := now();
    if trusted then
      return new;
    end if;
    new.issue_id := old.issue_id;
    new.author_id := old.author_id;
    new.parent_id := old.parent_id;
    new.created_at := old.created_at;
    new.moderation_status := old.moderation_status;
    new.moderation_reason := old.moderation_reason;
    new.moderated_at := old.moderated_at;
    new.state := old.state;
    return new;
  end if;

  if not public.comment_parent_is_valid(new.parent_id, new.issue_id) then
    raise exception 'parent comment must be a top-level comment on the same issue' using errcode = '22023';
  end if;

  if trusted then
    if new.moderation_status is null then
      new.moderation_status := 'pending';
    end if;
    if new.moderation_status = 'approved' and new.moderated_at is null then
      new.moderated_at := now();
    end if;
    return new;
  end if;

  new.moderation_status := case when public.text_is_blocked(new.body || ' ' || new.author_name) then 'rejected' else 'pending' end;
  new.moderation_reason := case when new.moderation_status = 'rejected' then 'Blocked by automatic content moderation' else null end;
  new.moderated_at := case when new.moderation_status = 'rejected' then now() else null end;
  return new;
end;
$$;

drop trigger if exists enforce_comment_moderation on public.issue_comments;
create trigger enforce_comment_moderation
  before insert or update on public.issue_comments
  for each row execute function public.enforce_comment_moderation();

create or replace function public.sync_issue_comment_count()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_issue uuid;
begin
  v_issue := coalesce(new.issue_id, old.issue_id);
  update public.issues
    set comment_count = (
      select count(*) from public.issue_comments
      where issue_id = v_issue and state = 'visible' and moderation_status = 'approved' and deleted_at is null
    )
    where id = v_issue;
  return null;
end;
$$;

drop trigger if exists sync_issue_comment_count on public.issue_comments;
create trigger sync_issue_comment_count
  after insert or update or delete on public.issue_comments
  for each row execute function public.sync_issue_comment_count();

alter table public.issue_comments enable row level security;

drop policy if exists comments_select on public.issue_comments;
create policy comments_select on public.issue_comments
  for select to anon, authenticated
  using (
    deleted_at is null
    and state = 'visible'
    and public.can_read_issue(issue_id)
    and (moderation_status = 'approved' or author_id = auth.uid() or public.is_staff())
  );


drop policy if exists comments_update_own on public.issue_comments;
create policy comments_update_own on public.issue_comments
  for update to authenticated
  using (author_id = auth.uid() and moderation_status = 'pending' and deleted_at is null)
  with check (author_id = auth.uid());

drop policy if exists comments_update_staff on public.issue_comments;
create policy comments_update_staff on public.issue_comments
  for update to authenticated
  using (public.is_staff())
  with check (public.is_staff());

drop policy if exists comments_delete_staff on public.issue_comments;
create policy comments_delete_staff on public.issue_comments
  for delete to authenticated
  using (public.is_staff());

revoke all on table public.issue_comments from anon, authenticated;
grant select on table public.issue_comments to anon, authenticated;
grant update, delete on table public.issue_comments to authenticated;
grant all on table public.issue_comments to service_role;
revoke truncate, references, trigger on public.issue_comments from anon, authenticated;

grant execute on function public.text_is_blocked(text) to anon, authenticated, service_role;
grant execute on function public.can_read_issue(uuid) to anon, authenticated, service_role;
