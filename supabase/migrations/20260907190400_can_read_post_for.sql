-- dd_private.can_read_post() answers about auth.uid(), which is NULL when the
-- caller is the service role. Server code minting a signed media URL needs to
-- ask the same question about a specific member, so this variant takes the user
-- id explicitly.
--
-- That makes it an authorization oracle, so EXECUTE is granted to service_role
-- and to nobody else. A member must never be able to probe which posts another
-- account can see.

create or replace function public.can_read_post_for(p_post_id uuid, p_user_id uuid)
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
        exists (select 1 from public.admin_users a where a.user_id = p_user_id)
        or (
          p.status = 'published'
          and p.published_at <= now()
          and coalesce((
            select max(s.term_days)
            from public.subscriptions s
            where s.user_id = p_user_id
              and s.status in ('active', 'trialing')
              and (s.current_period_end is null or s.current_period_end > now())
          ), -1) >= p.min_term_days
        )
      )
  );
$$;

revoke execute on function public.can_read_post_for(uuid, uuid) from public, anon, authenticated;
grant execute on function public.can_read_post_for(uuid, uuid) to service_role;
