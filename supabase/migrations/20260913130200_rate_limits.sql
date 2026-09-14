
create table if not exists public.rate_limits (
  subject text not null,
  bucket text not null,
  window_start timestamptz not null,
  count integer not null default 0,
  primary key (subject, bucket, window_start)
);

alter table public.rate_limits enable row level security;

create or replace function public.consume_rate_limit(
  p_subject text,
  p_bucket text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window timestamptz;
  v_count integer;
begin
  if p_subject is null or p_subject = '' or p_limit <= 0 or p_window_seconds <= 0 then
    raise exception 'invalid rate limit arguments';
  end if;
  v_window := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  insert into public.rate_limits (subject, bucket, window_start, count)
  values (p_subject, p_bucket, v_window, 1)
  on conflict (subject, bucket, window_start)
  do update set count = public.rate_limits.count + 1
  returning count into v_count;
  return v_count <= p_limit;
end;
$$;

revoke all on function public.consume_rate_limit(text, text, integer, integer) from public;
grant execute on function public.consume_rate_limit(text, text, integer, integer) to service_role;
grant select, insert, update, delete on public.rate_limits to service_role;

select cron.schedule(
  'prune-rate-limits',
  '7 * * * *',
  $$delete from public.rate_limits where window_start < now() - interval '24 hours'$$
);
