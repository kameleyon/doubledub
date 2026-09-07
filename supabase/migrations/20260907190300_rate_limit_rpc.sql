-- The rate limiter has to be reachable from the app, and PostgREST only exposes
-- the `public` schema — a function in `dd_private` cannot be called over the
-- API at all. So it moves to `public`, where EXECUTE is granted to
-- `service_role` and to nobody else: members still cannot inspect or advance
-- their own counters, but server code holding the secret key can.

drop function if exists dd_private.check_rate_limit(text, text, integer, integer);

create or replace function public.check_rate_limit(
  p_bucket text,
  p_subject text,
  p_max_hits integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window timestamptz := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );
  v_hits integer;
begin
  if p_window_seconds <= 0 or p_max_hits <= 0 then
    raise exception 'invalid rate limit parameters';
  end if;

  insert into public.rate_limits (bucket, subject, window_start, hits)
  values (p_bucket, p_subject, v_window, 1)
  on conflict (bucket, subject, window_start)
    do update set hits = public.rate_limits.hits + 1
  returning hits into v_hits;

  return v_hits <= p_max_hits;
end;
$$;

revoke execute on function public.check_rate_limit(text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.check_rate_limit(text, text, integer, integer)
  to service_role;

-- Housekeeping: old fixed windows are dead weight after they expire.
create or replace function public.prune_rate_limits()
returns integer
language sql
security definer
set search_path = ''
as $$
  with deleted as (
    delete from public.rate_limits
    where window_start < now() - interval '1 day'
    returning 1
  )
  select count(*)::integer from deleted;
$$;

revoke execute on function public.prune_rate_limits() from public, anon, authenticated;
grant execute on function public.prune_rate_limits() to service_role;
