-- =====================================================================
--  supabase-schema.sql — Database schema for "Sổ Thu Chi" (multiple households)
-- ---------------------------------------------------------------------
--  HOW TO USE:
--    1. Go to Supabase → your project → SQL Editor → New query.
--    2. Paste the ENTIRE contents of this file in, then click RUN.
--    3. Running it once is enough. (All statements are safe to re-run.)
--
--  MODEL:
--    households          : each household
--    household_members   : who belongs to which household (1 user can be in multiple households)
--    transactions        : transactions, tied to household_id
--    budgets             : budgets by category, tied to household_id
--
--  SECURITY (RLS): each person can only read/write data for households they belong to.
-- =====================================================================

-- pgcrypto for gen_random_uuid() (Supabase usually has it enabled by default)
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------
create table if not exists public.households (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

create table if not exists public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  role         text not null default 'member',
  email        text,
  joined_at    timestamptz not null default now(),
  primary key (household_id, user_id)
);

-- (if the table was created previously, add the email column)
alter table public.household_members add column if not exists email text;

create table if not exists public.transactions (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  user_id      uuid references auth.users(id) on delete set null,
  date         date not null,
  time         text,
  amount       bigint not null,
  type         text not null check (type in ('income','expense')),
  category     text not null,
  note         text,
  raw_input    text,
  created_at   timestamptz not null default now()
);

create table if not exists public.budgets (
  household_id uuid not null references public.households(id) on delete cascade,
  category     text not null,
  amount       bigint not null default 0,
  primary key (household_id, category)
);

create index if not exists idx_tx_household_date on public.transactions (household_id, date desc);
create index if not exists idx_members_user on public.household_members (user_id);

-- ---------------------------------------------------------------------
-- Helper function: list of households the current user belongs to.
-- SECURITY DEFINER to avoid recursion when writing the policy for household_members.
-- ---------------------------------------------------------------------
create or replace function public.user_households()
returns setof uuid
language sql
security definer
set search_path = public
stable
as $$
  select household_id from public.household_members where user_id = auth.uid()
$$;

-- ---------------------------------------------------------------------
-- Enable RLS
-- ---------------------------------------------------------------------
alter table public.households        enable row level security;
alter table public.household_members enable row level security;
alter table public.transactions      enable row level security;
alter table public.budgets           enable row level security;

-- ---------------------------------------------------------------------
-- Policies (drop first so re-running doesn't error)
-- ---------------------------------------------------------------------

-- households -----------------------------------------------------------
drop policy if exists households_select on public.households;
create policy households_select on public.households for select
  using (created_by = auth.uid() or id in (select public.user_households()));

drop policy if exists households_insert on public.households;
create policy households_insert on public.households for insert
  with check (created_by = auth.uid());

drop policy if exists households_update on public.households;
create policy households_update on public.households for update
  using (id in (select public.user_households()))
  with check (id in (select public.user_households()));

drop policy if exists households_delete on public.households;
create policy households_delete on public.households for delete
  using (created_by = auth.uid());

-- household_members ----------------------------------------------------
drop policy if exists members_select on public.household_members;
create policy members_select on public.household_members for select
  using (user_id = auth.uid() or household_id in (select public.user_households()));

-- Each person can only add THEMSELVES to a household (used for joining via a household code).
drop policy if exists members_insert on public.household_members;
create policy members_insert on public.household_members for insert
  with check (user_id = auth.uid());

-- Update one's own row (to fill in the display email).
drop policy if exists members_update on public.household_members;
create policy members_update on public.household_members for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Delete a member: leave the household yourself, OR the household owner (created_by) removes another member.
drop policy if exists members_delete on public.household_members;
create policy members_delete on public.household_members for delete
  using (
    user_id = auth.uid()
    or household_id in (select id from public.households where created_by = auth.uid())
  );

-- transactions ---------------------------------------------------------
drop policy if exists tx_all on public.transactions;
create policy tx_all on public.transactions for all
  using (household_id in (select public.user_households()))
  with check (household_id in (select public.user_households()));

-- budgets --------------------------------------------------------------
drop policy if exists budgets_all on public.budgets;
create policy budgets_all on public.budgets for all
  using (household_id in (select public.user_households()))
  with check (household_id in (select public.user_households()));

-- ---------------------------------------------------------------------
-- Realtime: allow the app to receive instant changes (synced across members).
-- Safe to re-run (skips if the table is already in the publication).
-- ---------------------------------------------------------------------
do $$
begin
  begin alter publication supabase_realtime add table public.transactions; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.budgets;      exception when duplicate_object then null; end;
end $$;
