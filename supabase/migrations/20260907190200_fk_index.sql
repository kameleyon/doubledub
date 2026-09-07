-- admin_users.granted_by had no backing index, so deleting an admin who had
-- granted other admins would sequentially scan the table.
create index if not exists admin_users_granted_by_idx on public.admin_users (granted_by);
