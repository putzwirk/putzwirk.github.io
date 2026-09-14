
alter table public.issues add column if not exists author_id uuid;
alter table public.issues add column if not exists updated_at timestamptz not null default now();
alter table public.issues add column if not exists deleted_at timestamptz;

alter table public.issues alter column moderation_status set default 'pending';

create index if not exists idx_issues_author_id on public.issues (author_id);
create index if not exists idx_issues_queue on public.issues (moderation_status, created_at desc);

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
      return new;
    end if;
    new.mod_id := old.mod_id;
    new.type := old.type;
    new.status := old.status;
    new.votes := old.votes;
    new.created_at := old.created_at;
    new.closed_at := old.closed_at;
    new.moderation_status := old.moderation_status;
    new.moderated_at := old.moderated_at;
    new.moderation_reason := old.moderation_reason;
    new.author_id := old.author_id;
    return new;
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
create trigger enforce_issue_moderation
  before insert or update on public.issues
  for each row execute function public.enforce_issue_moderation();

drop policy if exists public_read_issues on public.issues;
drop policy if exists authenticated_read_all_issues on public.issues;
drop policy if exists public_insert_issues on public.issues;
drop policy if exists admin_update_issues on public.issues;
drop policy if exists admin_delete_issues on public.issues;
drop policy if exists anonymous_delete_pending_issues on public.issues;

create policy issues_select_approved on public.issues
  for select to anon, authenticated
  using (moderation_status = 'approved' and deleted_at is null);

create policy issues_select_own on public.issues
  for select to authenticated
  using (author_id = auth.uid());

create policy issues_select_staff on public.issues
  for select to authenticated
  using (public.is_staff());

create policy issues_update_own_pending on public.issues
  for update to authenticated
  using (author_id = auth.uid() and moderation_status = 'pending' and deleted_at is null)
  with check (author_id = auth.uid());

create policy issues_update_staff on public.issues
  for update to authenticated
  using (public.is_staff())
  with check (public.is_staff());

create policy issues_delete_staff on public.issues
  for delete to authenticated
  using (public.is_staff());

revoke truncate, references, trigger on public.issues from anon, authenticated;
revoke truncate, references, trigger on public.mods from anon, authenticated;
revoke truncate, references, trigger on public.mod_versions from anon, authenticated;
