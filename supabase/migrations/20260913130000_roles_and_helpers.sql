
create or replace function public.jwt_claims()
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
$$;

create or replace function public.jwt_is_anonymous()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((public.jwt_claims() ->> 'is_anonymous')::boolean, false)
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(public.jwt_claims() -> 'app_metadata' ->> 'role', '') in ('moderator', 'admin')
$$;

grant execute on function public.jwt_claims() to anon, authenticated, service_role;
grant execute on function public.jwt_is_anonymous() to anon, authenticated, service_role;
grant execute on function public.is_staff() to anon, authenticated, service_role;
