-- Security posture audit. Every row returned should read PASS.
-- Run after any migration that touches tables, policies, grants or functions:
--   supabase db query --linked --file supabase/checks/security_audit.sql

with expected as (
  select unnest(array[
    'profiles','admin_users','subscriptions','posts','post_legs','post_media',
    'likes','tails','comments','post_views','stripe_events','audit_log','rate_limits'
  ]) as tbl
),

-- 1. RLS must be enabled AND forced on every table we created.
rls as (
  select
    '1. rls enabled+forced: ' || e.tbl as check_name,
    case when c.relrowsecurity and c.relforcerowsecurity
         then 'PASS' else 'FAIL' end as result
  from expected e
  join pg_class c on c.relname = e.tbl
  join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
),

-- 2. The operational tables must have zero policies, making them unreachable
--    to anyone but the secret key.
sealed as (
  select
    '2. sealed (no policies): ' || t as check_name,
    case when (select count(*) from pg_policies p
               where p.schemaname = 'public' and p.tablename = t) = 0
         then 'PASS' else 'FAIL' end as result
  from unnest(array['admin_users','stripe_events','audit_log','rate_limits']) as t
),

-- 3. anon must hold no privilege on anything in public.
anon_grants as (
  select
    '3. anon has no table grants' as check_name,
    case when count(*) = 0 then 'PASS'
         else 'FAIL (' || count(*) || ' grants)' end as result
  from information_schema.role_table_grants
  where grantee = 'anon' and table_schema = 'public'
),

-- 4. authenticated must never hold write privileges on content tables.
authed_writes as (
  select
    '4. authenticated cannot write content' as check_name,
    case when count(*) = 0 then 'PASS'
         else 'FAIL (' || string_agg(distinct table_name || ':' || privilege_type, ', ') || ')' end as result
  from information_schema.role_table_grants
  where grantee = 'authenticated'
    and table_schema = 'public'
    and table_name in ('posts','post_legs','post_media','subscriptions','admin_users',
                       'audit_log','rate_limits','stripe_events')
    and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE')
),

-- 5. Every SECURITY DEFINER function must pin an empty search_path, or it can
--    be hijacked by a caller-controlled schema.
definer_paths as (
  select
    '5. definer fn pins search_path: ' || p.proname as check_name,
    -- Postgres stores an empty search_path as search_path="" (quoted), so
    -- accept either spelling rather than only the unquoted one.
    case when exists (
      select 1 from unnest(coalesce(p.proconfig, '{}')) cfg
      where cfg in ('search_path=""', 'search_path=')
    ) then 'PASS' else 'FAIL' end as result
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where p.prosecdef
    and n.nspname in ('public','dd_private')
),

-- 6. The slips bucket must not be public.
bucket as (
  select
    '6. slips bucket is private' as check_name,
    case when exists (select 1 from storage.buckets where id = 'slips' and public = false)
         then 'PASS' else 'FAIL' end as result
),

-- 7. Every foreign key should have an index backing it, or deletes and joins
--    degrade into sequential scans.
fk_indexes as (
  select
    '7. fk indexed: ' || cl.relname || '.' || att.attname as check_name,
    case when exists (
      select 1 from pg_index i
      where i.indrelid = con.conrelid
        and con.conkey[1] = i.indkey[0]
    ) then 'PASS' else 'FAIL' end as result
  from pg_constraint con
  join pg_class cl on cl.oid = con.conrelid
  join pg_namespace ns on ns.oid = cl.relnamespace and ns.nspname = 'public'
  join pg_attribute att on att.attrelid = con.conrelid and att.attnum = con.conkey[1]
  where con.contype = 'f' and array_length(con.conkey, 1) = 1
)

select * from rls
union all select * from sealed
union all select * from anon_grants
union all select * from authed_writes
union all select * from definer_paths
union all select * from bucket
union all select * from fk_indexes
order by check_name;
