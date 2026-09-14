create or replace function public.log_issue_event()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_actor uuid;
  v_claims jsonb;
  v_meta jsonb;
  v_name text;
begin
  v_actor := auth.uid();
  v_claims := public.jwt_claims();
  v_meta := coalesce(v_claims -> 'user_metadata', '{}'::jsonb);

  if v_actor is not null and to_regclass('auth.users') is not null then
    select coalesce(u.raw_user_meta_data, '{}'::jsonb) into v_meta from auth.users u where u.id = v_actor;
  end if;

  v_name := coalesce(
    nullif(btrim(v_meta ->> 'global_name'), ''),
    nullif(btrim(v_meta ->> 'name'), ''),
    nullif(btrim(v_meta ->> 'full_name'), ''),
    nullif(btrim(v_meta ->> 'user_name'), ''),
    nullif(btrim(v_meta -> 'custom_claims' ->> 'global_name'), ''),
    'Moderator'
  );

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

update public.issue_events
  set actor_name = 'Moderator'
  where position('@' in coalesce(actor_name, '')) > 0;
