-- doubledub — foundation schema, entitlements and row level security.
--
-- Security model, in short:
--   * Every table is RLS-enabled AND forced. No policy means no access.
--   * `anon` is granted nothing. Signed-out visitors can read nothing at all.
--   * `authenticated` is granted SELECT only on content, plus narrow DML on the
--     rows a member owns (their own like / tail / comment). Members can never
--     write a post, a subscription row, an audit entry or an admin grant.
--   * Admin writes happen server-side under the Supabase secret key, which
--     bypasses RLS. That key never reaches the browser. Every such write is
--     expected to go through `public.audit_log`.
--   * Admin identity lives in its own table with no grants to `authenticated`,
--     so it cannot be escalated into by any UPDATE policy.

set local check_function_bodies = off;

-- ---------------------------------------------------------------------------
-- 0. private schema for helper functions
-- ---------------------------------------------------------------------------

create schema if not exists dd_private;
revoke all on schema dd_private from public, anon, authenticated;
grant usage on schema dd_private to postgres, service_role;

-- ---------------------------------------------------------------------------
-- 1. enums
-- ---------------------------------------------------------------------------

create type public.post_kind as enum ('slip', 'text');
create type public.post_status as enum ('draft', 'scheduled', 'published', 'archived');

-- Mirrors Stripe's subscription statuses so the webhook can store them verbatim
-- rather than mapping (and mis-mapping) them.
create type public.subscription_status as enum (
  'trialing', 'active', 'past_due', 'canceled',
  'incomplete', 'incomplete_expired', 'unpaid', 'paused'
);

-- ---------------------------------------------------------------------------
-- 2. profiles — one row per auth user, created by trigger
-- ---------------------------------------------------------------------------

create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  handle        text not null,
  display_name  text not null default '',
  avatar_color  text not null default '#2A2436',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint profiles_handle_format check (handle ~ '^[a-z0-9_]{3,24}$'),
  constraint profiles_display_name_len check (char_length(display_name) <= 60),
  constraint profiles_avatar_color_hex check (avatar_color ~* '^#[0-9a-f]{6}$')
);

create unique index profiles_handle_lower_key on public.profiles (lower(handle));

-- ---------------------------------------------------------------------------
-- 3. admin_users — deliberately its own table, granted to nobody
-- ---------------------------------------------------------------------------

create table public.admin_users (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  granted_by uuid references auth.users (id) on delete set null,
  granted_at timestamptz not null default now(),
  note       text
);

-- ---------------------------------------------------------------------------
-- 4. subscriptions — the entitlement record, written only by the Stripe webhook
-- ---------------------------------------------------------------------------

create table public.subscriptions (
  user_id                uuid primary key references auth.users (id) on delete cascade,
  stripe_customer_id     text not null,
  stripe_subscription_id text,
  status                 public.subscription_status not null,
  price_id               text,
  plan_code              text,
  -- Term length in days. Doubles as the entitlement rank: a post marked
  -- min_term_days = 30 is visible only to members on a 30-day-or-longer plan.
  term_days              integer not null default 0,
  current_period_end     timestamptz,
  cancel_at_period_end   boolean not null default false,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint subscriptions_term_days_nonneg check (term_days >= 0)
);

create unique index subscriptions_stripe_customer_key on public.subscriptions (stripe_customer_id);
create unique index subscriptions_stripe_subscription_key on public.subscriptions (stripe_subscription_id)
  where stripe_subscription_id is not null;
-- Supports the entitlement lookup that runs on every single content read.
create index subscriptions_active_idx on public.subscriptions (user_id, current_period_end)
  where status in ('active', 'trialing');

-- ---------------------------------------------------------------------------
-- 5. posts and their parts
-- ---------------------------------------------------------------------------

create table public.posts (
  id             uuid primary key default gen_random_uuid(),
  kind           public.post_kind not null,
  status         public.post_status not null default 'draft',
  league         text not null default '',
  title          text not null default '',
  caption        text not null default '',
  -- 0 = every paying member. Higher values gate the post to longer plans.
  min_term_days  integer not null default 0,
  published_at   timestamptz,
  pinned_until   timestamptz,
  created_by     uuid references auth.users (id) on delete set null,
  view_count     integer not null default 0,
  like_count     integer not null default 0,
  tail_count     integer not null default 0,
  comment_count  integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  search_tsv     tsvector generated always as (
                   to_tsvector('english',
                     coalesce(title, '') || ' ' ||
                     coalesce(caption, '') || ' ' ||
                     coalesce(league, ''))
                 ) stored,
  constraint posts_min_term_days_nonneg check (min_term_days >= 0),
  constraint posts_counts_nonneg check (
    view_count >= 0 and like_count >= 0 and tail_count >= 0 and comment_count >= 0
  ),
  -- A published post must have a publication time; drafts must not pretend to.
  constraint posts_published_has_time check (
    (status = 'published' and published_at is not null) or status <> 'published'
  )
);

-- The feed query: published, in time order. Partial so drafts stay out of it.
create index posts_feed_idx on public.posts (published_at desc)
  where status = 'published';
create index posts_league_feed_idx on public.posts (league, published_at desc)
  where status = 'published';
create index posts_search_idx on public.posts using gin (search_tsv);
create index posts_created_by_idx on public.posts (created_by);

-- Individual selections inside a text pick.
create table public.post_legs (
  id        uuid primary key default gen_random_uuid(),
  post_id   uuid not null references public.posts (id) on delete cascade,
  position  smallint not null default 0,
  selection text not null default '',
  market    text not null default '',
  odds      text not null default '',
  units     numeric(5, 2),
  constraint post_legs_units_range check (units is null or (units >= 0 and units <= 100))
);

create index post_legs_post_id_idx on public.post_legs (post_id, position);

-- Uploaded slip screenshots. `storage_path` points into a PRIVATE bucket; the
-- object is never publicly readable and is only ever served through a
-- short-lived signed URL minted server-side for an entitled member.
create table public.post_media (
  id           uuid primary key default gen_random_uuid(),
  post_id      uuid not null references public.posts (id) on delete cascade,
  storage_path text not null unique,
  mime_type    text not null,
  byte_size    integer not null,
  width        integer,
  height       integer,
  created_at   timestamptz not null default now(),
  constraint post_media_mime_allowed check (mime_type in ('image/png', 'image/jpeg', 'image/webp')),
  constraint post_media_size_limit check (byte_size > 0 and byte_size <= 10485760)
);

create index post_media_post_id_idx on public.post_media (post_id);

-- ---------------------------------------------------------------------------
-- 6. engagement
-- ---------------------------------------------------------------------------

create table public.likes (
  post_id    uuid not null references public.posts (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create index likes_user_id_idx on public.likes (user_id);

create table public.tails (
  post_id    uuid not null references public.posts (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

-- Powers the "My Tails" screen: this member's tails, newest first.
create index tails_user_recent_idx on public.tails (user_id, created_at desc);

create table public.comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.posts (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  body       text not null,
  hidden_at  timestamptz,
  hidden_by  uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint comments_body_len check (char_length(body) between 1 and 2000)
);

create index comments_post_idx on public.comments (post_id, created_at desc);
create index comments_user_id_idx on public.comments (user_id);
create index comments_hidden_by_idx on public.comments (hidden_by);

-- One row per member per post per day, so `view_count` counts unique daily
-- readers rather than refreshes.
create table public.post_views (
  post_id   uuid not null references public.posts (id) on delete cascade,
  user_id   uuid not null references auth.users (id) on delete cascade,
  viewed_on date not null default current_date,
  primary key (post_id, user_id, viewed_on)
);

create index post_views_user_id_idx on public.post_views (user_id);

-- ---------------------------------------------------------------------------
-- 7. operational tables — no member access whatsoever
-- ---------------------------------------------------------------------------

-- Every Stripe event id we have already processed. The webhook inserts here
-- first; a duplicate delivery hits the primary key and is skipped, which is
-- what makes the handler idempotent.
create table public.stripe_events (
  id            text primary key,
  type          text not null,
  processed_at  timestamptz not null default now(),
  payload       jsonb
);

create table public.audit_log (
  id          bigint generated always as identity primary key,
  actor_id    uuid references auth.users (id) on delete set null,
  action      text not null,
  entity      text,
  entity_id   text,
  metadata    jsonb not null default '{}'::jsonb,
  ip          inet,
  created_at  timestamptz not null default now()
);

create index audit_log_actor_idx on public.audit_log (actor_id, created_at desc);
create index audit_log_action_idx on public.audit_log (action, created_at desc);

-- Fixed-window rate limiting. Lives in Postgres deliberately: serverless
-- instances do not share memory, so an in-process counter would not actually
-- limit anything.
create table public.rate_limits (
  bucket       text not null,
  subject      text not null,
  window_start timestamptz not null,
  hits         integer not null default 0,
  primary key (bucket, subject, window_start)
);

create index rate_limits_window_idx on public.rate_limits (window_start);

-- ---------------------------------------------------------------------------
-- 8. helper functions
--
-- All are SECURITY DEFINER with an empty search_path and answer only about the
-- *calling* user, so they cannot be turned into a lookup oracle for other
-- people's data. EXECUTE is revoked from anon.
-- ---------------------------------------------------------------------------

create or replace function dd_private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.admin_users a
    where a.user_id = (select auth.uid())
  );
$$;

-- -1 means "no entitlement". Otherwise the term length of the member's active
-- plan, which is compared against posts.min_term_days.
create or replace function dd_private.entitled_term_days()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select max(s.term_days)
      from public.subscriptions s
      where s.user_id = (select auth.uid())
        and s.status in ('active', 'trialing')
        and (s.current_period_end is null or s.current_period_end > now())
    ),
    -1
  );
$$;

create or replace function dd_private.is_entitled()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select dd_private.entitled_term_days() >= 0;
$$;

-- True when the calling user may read this post. Used by the policies on
-- comments and media so the rule lives in exactly one place.
create or replace function dd_private.can_read_post(p_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.posts p
    where p.id = p_post_id
      and (
        dd_private.is_admin()
        or (
          p.status = 'published'
          and p.published_at <= now()
          and dd_private.entitled_term_days() >= p.min_term_days
        )
      )
  );
$$;

revoke execute on function
  dd_private.is_admin(),
  dd_private.entitled_term_days(),
  dd_private.is_entitled(),
  dd_private.can_read_post(uuid)
from public, anon;

grant execute on function
  dd_private.is_admin(),
  dd_private.entitled_term_days(),
  dd_private.is_entitled(),
  dd_private.can_read_post(uuid)
to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 9. triggers
-- ---------------------------------------------------------------------------

create or replace function dd_private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch before update on public.profiles
  for each row execute function dd_private.touch_updated_at();
create trigger subscriptions_touch before update on public.subscriptions
  for each row execute function dd_private.touch_updated_at();
create trigger posts_touch before update on public.posts
  for each row execute function dd_private.touch_updated_at();
create trigger comments_touch before update on public.comments
  for each row execute function dd_private.touch_updated_at();

-- Give every new auth user a profile with a unique, URL-safe handle.
create or replace function dd_private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  base_handle text;
  candidate   text;
  suffix      integer := 0;
begin
  base_handle := regexp_replace(lower(split_part(coalesce(new.email, 'member'), '@', 1)), '[^a-z0-9_]', '', 'g');
  if char_length(base_handle) < 3 then
    base_handle := 'member';
  end if;
  base_handle := left(base_handle, 20);

  candidate := base_handle;
  while exists (select 1 from public.profiles p where lower(p.handle) = candidate) loop
    suffix := suffix + 1;
    candidate := left(base_handle, 20) || suffix::text;
  end loop;

  insert into public.profiles (id, handle, display_name)
  values (new.id, candidate, '');

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function dd_private.handle_new_user();

-- Denormalized counters. These run as the table owner and bypass RLS, which is
-- correct: the count must reflect every row, not just rows the reader can see.
create or replace function dd_private.bump_like_count()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.posts set like_count = like_count + 1 where id = new.post_id;
  elsif tg_op = 'DELETE' then
    update public.posts set like_count = greatest(like_count - 1, 0) where id = old.post_id;
  end if;
  return null;
end;
$$;

create or replace function dd_private.bump_tail_count()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.posts set tail_count = tail_count + 1 where id = new.post_id;
  elsif tg_op = 'DELETE' then
    update public.posts set tail_count = greatest(tail_count - 1, 0) where id = old.post_id;
  end if;
  return null;
end;
$$;

create or replace function dd_private.bump_comment_count()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and new.hidden_at is null then
    update public.posts set comment_count = comment_count + 1 where id = new.post_id;
  elsif tg_op = 'DELETE' and old.hidden_at is null then
    update public.posts set comment_count = greatest(comment_count - 1, 0) where id = old.post_id;
  elsif tg_op = 'UPDATE' then
    if old.hidden_at is null and new.hidden_at is not null then
      update public.posts set comment_count = greatest(comment_count - 1, 0) where id = new.post_id;
    elsif old.hidden_at is not null and new.hidden_at is null then
      update public.posts set comment_count = comment_count + 1 where id = new.post_id;
    end if;
  end if;
  return null;
end;
$$;

create trigger likes_count_trg after insert or delete on public.likes
  for each row execute function dd_private.bump_like_count();
create trigger tails_count_trg after insert or delete on public.tails
  for each row execute function dd_private.bump_tail_count();
create trigger comments_count_trg after insert or delete or update of hidden_at on public.comments
  for each row execute function dd_private.bump_comment_count();

-- ---------------------------------------------------------------------------
-- 10. RPCs the member client is allowed to call
-- ---------------------------------------------------------------------------

-- Records one unique view per member per post per day and returns the running
-- total. Entitlement is re-checked inside so this cannot be used to inflate
-- (or enumerate) posts the caller may not read.
create or replace function public.record_post_view(p_post_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_total integer;
begin
  if v_user is null or not dd_private.can_read_post(p_post_id) then
    return null;
  end if;

  insert into public.post_views (post_id, user_id, viewed_on)
  values (p_post_id, v_user, current_date)
  on conflict do nothing;

  if found then
    update public.posts
      set view_count = view_count + 1
      where id = p_post_id
      returning view_count into v_total;
  else
    select view_count into v_total from public.posts where id = p_post_id;
  end if;

  return v_total;
end;
$$;

revoke execute on function public.record_post_view(uuid) from public, anon;
grant execute on function public.record_post_view(uuid) to authenticated;

-- Fixed-window rate limiter. Returns true when the call is allowed. Server-side
-- only: members must not be able to inspect or advance their own counters.
create or replace function dd_private.check_rate_limit(
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
  insert into public.rate_limits (bucket, subject, window_start, hits)
  values (p_bucket, p_subject, v_window, 1)
  on conflict (bucket, subject, window_start)
    do update set hits = public.rate_limits.hits + 1
  returning hits into v_hits;

  return v_hits <= p_max_hits;
end;
$$;

revoke execute on function dd_private.check_rate_limit(text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function dd_private.check_rate_limit(text, text, integer, integer)
  to service_role;

-- ---------------------------------------------------------------------------
-- 11. row level security — enabled and FORCED on every table
-- ---------------------------------------------------------------------------

alter table public.profiles        enable row level security;
alter table public.admin_users     enable row level security;
alter table public.subscriptions   enable row level security;
alter table public.posts           enable row level security;
alter table public.post_legs       enable row level security;
alter table public.post_media      enable row level security;
alter table public.likes           enable row level security;
alter table public.tails           enable row level security;
alter table public.comments        enable row level security;
alter table public.post_views      enable row level security;
alter table public.stripe_events   enable row level security;
alter table public.audit_log       enable row level security;
alter table public.rate_limits     enable row level security;

alter table public.profiles        force row level security;
alter table public.admin_users     force row level security;
alter table public.subscriptions   force row level security;
alter table public.posts           force row level security;
alter table public.post_legs       force row level security;
alter table public.post_media      force row level security;
alter table public.likes           force row level security;
alter table public.tails           force row level security;
alter table public.comments        force row level security;
alter table public.post_views      force row level security;
alter table public.stripe_events   force row level security;
alter table public.audit_log       force row level security;
alter table public.rate_limits     force row level security;

-- profiles: everyone signed in can read display names (needed to render
-- comment authors); you may only edit your own row.
create policy profiles_select_authenticated on public.profiles
  for select to authenticated
  using (true);

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- subscriptions: read your own entitlement, never anyone else's, never write.
create policy subscriptions_select_own on public.subscriptions
  for select to authenticated
  using (user_id = (select auth.uid()));

-- posts: the paywall itself.
create policy posts_select_entitled on public.posts
  for select to authenticated
  using (
    status = 'published'
    and published_at <= now()
    and (select dd_private.entitled_term_days()) >= min_term_days
  );

create policy posts_select_admin on public.posts
  for select to authenticated
  using ((select dd_private.is_admin()));

-- legs and media inherit the parent post's visibility.
create policy post_legs_select_readable on public.post_legs
  for select to authenticated
  using ((select dd_private.can_read_post(post_id)));

create policy post_media_select_readable on public.post_media
  for select to authenticated
  using ((select dd_private.can_read_post(post_id)));

-- likes: see your own, add and remove your own, only on posts you may read.
create policy likes_select_own on public.likes
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy likes_insert_own on public.likes
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (select dd_private.can_read_post(post_id))
  );

create policy likes_delete_own on public.likes
  for delete to authenticated
  using (user_id = (select auth.uid()));

create policy tails_select_own on public.tails
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy tails_insert_own on public.tails
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (select dd_private.can_read_post(post_id))
  );

create policy tails_delete_own on public.tails
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- comments: readable by anyone who can read the post; writable only as yourself.
create policy comments_select_readable on public.comments
  for select to authenticated
  using (
    hidden_at is null
    and (select dd_private.can_read_post(post_id))
  );

create policy comments_insert_own on public.comments
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (select dd_private.can_read_post(post_id))
  );

create policy comments_update_own on public.comments
  for update to authenticated
  using (user_id = (select auth.uid()) and hidden_at is null)
  with check (user_id = (select auth.uid()));

create policy comments_delete_own on public.comments
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- post_views: a member may read back their own view rows. Writes go through
-- record_post_view() only.
create policy post_views_select_own on public.post_views
  for select to authenticated
  using (user_id = (select auth.uid()));

-- admin_users, stripe_events, audit_log and rate_limits get NO policies at all.
-- RLS is on and forced, so they are unreachable except via the secret key.

-- ---------------------------------------------------------------------------
-- 12. grants — least privilege, applied per table
-- ---------------------------------------------------------------------------

-- Signed-out visitors get nothing. There is no free tier.
revoke all on all tables in schema public from anon;
revoke all on all functions in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke usage on schema public from anon;

revoke all on all tables in schema public from authenticated;
grant usage on schema public to authenticated;

grant select                       on public.profiles      to authenticated;
grant update (display_name, avatar_color) on public.profiles to authenticated;
grant select                       on public.subscriptions to authenticated;
grant select                       on public.posts         to authenticated;
grant select                       on public.post_legs     to authenticated;
grant select                       on public.post_media    to authenticated;
grant select, insert, delete       on public.likes         to authenticated;
grant select, insert, delete       on public.tails         to authenticated;
grant select, insert, update, delete on public.comments    to authenticated;
grant select                       on public.post_views    to authenticated;

-- Nothing is granted to `authenticated` on admin_users, stripe_events,
-- audit_log or rate_limits. Left deliberately absent.

-- New tables added later must not silently become readable.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
