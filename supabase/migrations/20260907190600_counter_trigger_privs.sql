-- Fix: liking a post failed with "permission denied for table posts".
--
-- A trigger function runs with the privileges of the user who fired it unless
-- it is SECURITY DEFINER. `authenticated` deliberately holds no UPDATE grant on
-- `posts` (only the server may write content), so the counter triggers could
-- not bump like_count / tail_count / comment_count and the whole INSERT rolled
-- back.
--
-- Making them SECURITY DEFINER is safe here because they are reachable only as
-- triggers on rows that RLS has already authorised, they touch nothing but a
-- single integer column, and the post id comes from the trigger row rather than
-- from user input.

create or replace function dd_private.bump_like_count()
returns trigger
language plpgsql
security definer
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
security definer
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
security definer
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

-- These are trigger functions, never called directly.
revoke execute on function dd_private.bump_like_count() from public, anon, authenticated;
revoke execute on function dd_private.bump_tail_count() from public, anon, authenticated;
revoke execute on function dd_private.bump_comment_count() from public, anon, authenticated;
