-- The feed is organised by TYPE OF BET across all sports, not by sport.
--
-- `league` is removed entirely: it drove the filter row, the card badge and part
-- of the search vector, none of which reflect how members actually browse.
-- `bet_type` replaces it.

-- search_tsv is a generated column referencing league, so it has to go first.
drop index if exists public.posts_search_idx;
alter table public.posts drop column if exists search_tsv;

drop index if exists public.posts_league_feed_idx;
alter table public.posts drop column if exists league;

create type public.bet_type as enum (
  'single', 'parlay', 'prop', 'total', 'futures', 'live'
);

alter table public.posts
  add column bet_type public.bet_type not null default 'single';

-- Rebuild the search vector without league.
alter table public.posts
  add column search_tsv tsvector generated always as (
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(caption, ''))
  ) stored;

create index posts_search_idx on public.posts using gin (search_tsv);

-- The feed filters on bet_type within published posts, newest first.
create index posts_bet_type_feed_idx on public.posts (bet_type, published_at desc)
  where status = 'published';
