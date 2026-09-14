create or replace function public.is_trusted_contributor(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id is not null and (
    (
      select count(*) from public.issue_comments c
      where c.author_id = p_user_id
        and c.moderation_status = 'approved'
        and c.state = 'visible'
        and c.deleted_at is null
    ) >= 2
    or
    (
      select count(*) from public.issues i
      where i.author_id = p_user_id
        and i.moderation_status = 'approved'
        and i.deleted_at is null
    ) >= 1
  )
$$;

grant execute on function public.is_trusted_contributor(uuid) to anon, authenticated, service_role;

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

  if public.text_is_blocked(new.body || ' ' || new.author_name) then
    new.moderation_status := 'rejected';
    new.moderation_reason := 'Blocked by automatic content moderation';
    new.moderated_at := now();
  elsif public.is_trusted_contributor(new.author_id) then
    new.moderation_status := 'approved';
    new.moderation_reason := null;
    new.moderated_at := now();
  else
    new.moderation_status := 'pending';
    new.moderation_reason := null;
    new.moderated_at := null;
  end if;
  return new;
end;
$$;
