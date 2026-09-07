-- Maps a doubledub account to its Stripe customer.
--
-- Kept separate from `subscriptions` because the two have different lifetimes:
-- a customer exists from the first checkout attempt onward, whereas a
-- subscription row represents a live entitlement and may come and go. Folding
-- them together would mean inventing a fake "incomplete" entitlement just to
-- have somewhere to put the customer id.
--
-- RLS is forced with no policies: only the secret key touches this.

create table public.billing_customers (
  user_id            uuid primary key references auth.users (id) on delete cascade,
  stripe_customer_id text not null unique,
  created_at         timestamptz not null default now()
);

alter table public.billing_customers enable row level security;
alter table public.billing_customers force row level security;

revoke all on public.billing_customers from anon, authenticated;
