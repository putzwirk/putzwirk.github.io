create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null,
  kind text not null,
  issue_id uuid references public.issues(id) on delete cascade,
  comment_id uuid references public.issue_comments(id) on delete cascade,
  payload jsonb not null default '{}',
  read_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists public.notification_preferences (
  user_id uuid primary key,
  email_replies boolean not null default true,
  email_status boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_notifications_recipient on public.notifications (recipient_id, created_at desc);
create index if not exists idx_notifications_unread on public.notifications (recipient_id) where read_at is null;

alter table public.notifications enable row level security;
alter table public.notification_preferences enable row level security;

drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications
  for select to anon, authenticated
  using (recipient_id = auth.uid());

drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications
  for update to authenticated
  using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());

drop policy if exists notification_preferences_select_own on public.notification_preferences;
create policy notification_preferences_select_own on public.notification_preferences
  for select to anon, authenticated
  using (user_id = auth.uid());

drop policy if exists notification_preferences_insert_own on public.notification_preferences;
create policy notification_preferences_insert_own on public.notification_preferences
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists notification_preferences_update_own on public.notification_preferences;
create policy notification_preferences_update_own on public.notification_preferences
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

revoke all on table public.notifications from anon, authenticated;
grant select on table public.notifications to anon, authenticated;
grant update on table public.notifications to authenticated;
grant all on table public.notifications to service_role;
revoke truncate, references, trigger on public.notifications from anon, authenticated;

revoke all on table public.notification_preferences from anon, authenticated;
grant select on table public.notification_preferences to anon, authenticated;
grant insert, update on table public.notification_preferences to authenticated;
grant all on table public.notification_preferences to service_role;
revoke truncate, references, trigger on public.notification_preferences from anon, authenticated;

create or replace function public.notify_issue_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_issue_author uuid;
  v_parent_author uuid;
  v_preview text;
begin
  v_actor := auth.uid();
  v_preview := left(coalesce(new.body, ''), 140);

  select i.author_id into v_issue_author
  from public.issues i
  where i.id = new.issue_id;

  if v_issue_author is not null and (v_actor is null or v_issue_author <> v_actor) then
    insert into public.notifications (recipient_id, kind, issue_id, comment_id, payload)
    values (v_issue_author, 'comment', new.issue_id, new.id, jsonb_build_object('preview', v_preview));
  end if;

  if new.parent_id is not null then
    select c.author_id into v_parent_author
    from public.issue_comments c
    where c.id = new.parent_id;

    if v_parent_author is not null and (v_actor is null or v_parent_author <> v_actor) then
      insert into public.notifications (recipient_id, kind, issue_id, comment_id, payload)
      values (v_parent_author, 'reply', new.issue_id, new.id, jsonb_build_object('preview', v_preview));
    end if;
  end if;

  return null;
end;
$$;

drop trigger if exists notify_issue_activity on public.issue_comments;
create trigger notify_issue_activity
  after insert on public.issue_comments
  for each row execute function public.notify_issue_activity();

create or replace function public.notify_issue_moderation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
begin
  v_actor := auth.uid();

  if new.moderation_status is distinct from old.moderation_status
     and new.author_id is not null
     and (v_actor is null or new.author_id <> v_actor) then
    insert into public.notifications (recipient_id, kind, issue_id, payload)
    values (
      new.author_id,
      'moderation',
      new.id,
      jsonb_build_object('status', new.moderation_status, 'preview', left(coalesce(new.title, ''), 140))
    );
  end if;

  return null;
end;
$$;

drop trigger if exists notify_issue_moderation on public.issues;
create trigger notify_issue_moderation
  after update on public.issues
  for each row execute function public.notify_issue_moderation();
