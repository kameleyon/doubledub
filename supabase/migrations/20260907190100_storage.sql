-- Private storage for betting slip screenshots.
--
-- The bucket is NOT public and carries no policies for `authenticated`, so a
-- member's own token can neither list nor fetch an object. Images reach the
-- browser exclusively through short-lived signed URLs minted server-side, after
-- the server has confirmed the viewer's entitlement. That is what makes "posts
-- cannot be shared" enforceable rather than merely a missing button: a copied
-- image URL stops working within the minute.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'slips',
  'slips',
  false,
  10485760,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Defence in depth: even if a future migration accidentally adds a permissive
-- policy to storage.objects, these two deny nothing to the secret key while
-- keeping anon out of the bucket entirely.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'slips_no_anon_access'
  ) then
    create policy slips_no_anon_access on storage.objects
      for select to anon
      using (false);
  end if;
end;
$$;
