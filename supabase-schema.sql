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

-- Roles & permissions:
--   owner  : full control — rename/delete household, manage members & roles, all config, all transactions.
--   admin  : co-manager — shared config (budgets, wallets, goals, recurring) + edit any transaction.
--   member : record their OWN transactions; read everything else.
alter table public.household_members drop constraint if exists household_members_role_check;
alter table public.household_members add constraint household_members_role_check
  check (role in ('owner', 'admin', 'member'));
-- Backfill: the household creator is its owner (older rows may still say 'member').
update public.household_members m
   set role = 'owner'
  from public.households h
 where m.household_id = h.id and m.user_id = h.created_by and m.role is distinct from 'owner';

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

-- accounts (wallets): each "place where money lives" — cash, bank, e-wallet… — tied to a household
create table if not exists public.accounts (
  id              uuid primary key default gen_random_uuid(),
  household_id    uuid not null references public.households(id) on delete cascade,
  name            text not null,
  type            text not null default 'cash',     -- cash | bank | ewallet | other
  opening_balance bigint not null default 0,
  archived        boolean not null default false,
  sort_order      int not null default 0,
  created_at      timestamptz not null default now()
);

-- Link each transaction to a wallet (null = not yet assigned). on delete set null keeps the transaction.
alter table public.transactions add column if not exists account_id uuid references public.accounts(id) on delete set null;

-- Transfers between wallets: type='transfer', account_id = source, to_account_id = destination.
alter table public.transactions add column if not exists to_account_id uuid references public.accounts(id) on delete set null;
alter table public.transactions drop constraint if exists transactions_type_check;
alter table public.transactions add constraint transactions_type_check check (type in ('income','expense','transfer'));

-- "Chi cho ai": người thụ hưởng của giao dịch. NULL = chi chung cho cả nhà.
-- Non-null = user_id của một thành viên hộ. on delete set null: xoá user → về "chung".
alter table public.transactions add column if not exists beneficiary_id uuid references auth.users(id) on delete set null;
create index if not exists transactions_beneficiary_idx on public.transactions(household_id, beneficiary_id);

-- Wealth/asset reporting: classify each account as an asset or a liability, plus
-- optional credit-card / loan cycle metadata. Safe to re-run.
alter table public.accounts add column if not exists class text not null default 'asset';
alter table public.accounts drop constraint if exists accounts_class_check;
alter table public.accounts add constraint accounts_class_check check (class in ('asset','liability'));
alter table public.accounts add column if not exists credit_limit    bigint;       -- card limit / loan principal
alter table public.accounts add column if not exists statement_day   int;          -- cycle close day (1–31)
alter table public.accounts add column if not exists due_day         int;          -- payment due day (1–31)
alter table public.accounts add column if not exists min_payment_pct numeric(5,2); -- % of statement balance

-- Default wallet: the one pre-selected in the entry form. At most one per household.
-- Safe to re-run.
alter table public.accounts add column if not exists is_default boolean not null default false;
-- Enforce "at most one default per household" at the DB level (partial unique index).
create unique index if not exists idx_accounts_one_default
  on public.accounts (household_id) where is_default;

create index if not exists idx_tx_household_date on public.transactions (household_id, date desc);
create index if not exists idx_members_user on public.household_members (user_id);
create index if not exists idx_accounts_hh on public.accounts (household_id);
-- Faster per-wallet balance/cash-flow scans for the reporting module.
create index if not exists idx_tx_account_date on public.transactions (account_id, date);

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
-- Role helpers — used by the policies below to gate writes.
-- SECURITY DEFINER so they bypass RLS on household_members (no recursion).
-- ---------------------------------------------------------------------
-- true if the current user is the OWNER of this household.
create or replace function public.is_household_owner(hid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.household_members
     where household_id = hid and user_id = auth.uid() and role = 'owner'
  )
$$;

-- true if the current user is an owner OR admin of this household (a "manager").
create or replace function public.is_household_admin(hid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.household_members
     where household_id = hid and user_id = auth.uid() and role in ('owner', 'admin')
  )
$$;

-- ---------------------------------------------------------------------
-- Enable RLS
-- ---------------------------------------------------------------------
alter table public.households        enable row level security;
alter table public.household_members enable row level security;
alter table public.transactions      enable row level security;
alter table public.budgets           enable row level security;
alter table public.accounts          enable row level security;

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

-- Only the owner can rename the household.
drop policy if exists households_update on public.households;
create policy households_update on public.households for update
  using (public.is_household_owner(id))
  with check (public.is_household_owner(id));

-- Only the owner can delete the household.
drop policy if exists households_delete on public.households;
create policy households_delete on public.households for delete
  using (public.is_household_owner(id));

-- household_members ----------------------------------------------------
drop policy if exists members_select on public.household_members;
create policy members_select on public.household_members for select
  using (user_id = auth.uid() or household_id in (select public.user_households()));

-- Each person can only add THEMSELVES to a household (used for joining via a household code).
drop policy if exists members_insert on public.household_members;
create policy members_insert on public.household_members for insert
  with check (user_id = auth.uid());

-- Update one's own row (to fill in the display email), OR the owner updates any
-- member (to change roles). Role changes are further restricted by the trigger below,
-- so a member updating their own row can never escalate themselves to owner/admin.
drop policy if exists members_update on public.household_members;
create policy members_update on public.household_members for update
  using (user_id = auth.uid() or public.is_household_owner(household_id))
  with check (user_id = auth.uid() or public.is_household_owner(household_id));

-- Delete a member: leave the household yourself, OR the owner removes another member.
drop policy if exists members_delete on public.household_members;
create policy members_delete on public.household_members for delete
  using (user_id = auth.uid() or public.is_household_owner(household_id));

-- Guard: prevent privilege escalation on household_members.
--  * UPDATE: only the household owner may change a member's role (blocks a member from
--    self-promoting via the self-allowed email update above). Transfer of ownership still
--    works because the acting user is still 'owner' at the moment of each update.
--  * INSERT: a user joining via the invite code may only insert THEMSELVES as 'member'.
--    An elevated role on insert is allowed only for an existing owner, or for the
--    household creator bootstrapping their own owner row right after creating the household.
create or replace function public.guard_member_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'UPDATE'
      and new.role is distinct from old.role
      and not public.is_household_owner(old.household_id)) then
    raise exception 'Only the household owner can change member roles';
  end if;
  if (tg_op = 'INSERT'
      and new.role <> 'member'
      and not public.is_household_owner(new.household_id)
      and new.user_id is distinct from (select created_by from public.households where id = new.household_id)) then
    raise exception 'Cannot self-assign an elevated role';
  end if;
  return new;
end
$$;
drop trigger if exists trg_guard_member_role on public.household_members;
create trigger trg_guard_member_role
  before insert or update on public.household_members
  for each row execute function public.guard_member_role();

-- transactions ---------------------------------------------------------
-- Stamp the actor server-side on every insert. This guarantees user_id is always
-- the real signed-in user — even if the client sends null (e.g. it couldn't resolve
-- the session in time) — so the per-owner UPDATE/DELETE checks below stay reliable.
create or replace function public.set_tx_actor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.user_id := auth.uid();
  return new;
end
$$;
drop trigger if exists trg_set_tx_actor on public.transactions;
create trigger trg_set_tx_actor before insert on public.transactions
  for each row execute function public.set_tx_actor();

-- Everyone in the household can READ all transactions.
-- INSERT: any household member may add a transaction. We do NOT gate insert on user_id —
--   the actor is stamped by trg_set_tx_actor above, and gating insert on a client-supplied
--   user_id broke transfers/adds whenever the client couldn't resolve its own user id.
-- UPDATE/DELETE: a member may only change their OWN rows; owners & admins change any.
drop policy if exists tx_all on public.transactions;            -- legacy combined policy
drop policy if exists tx_select on public.transactions;
create policy tx_select on public.transactions for select
  using (household_id in (select public.user_households()));
drop policy if exists tx_insert on public.transactions;
create policy tx_insert on public.transactions for insert
  with check (household_id in (select public.user_households()));
drop policy if exists tx_update on public.transactions;
create policy tx_update on public.transactions for update
  using (
    household_id in (select public.user_households())
    and (user_id = auth.uid() or public.is_household_admin(household_id))
  )
  with check (
    household_id in (select public.user_households())
    and (user_id = auth.uid() or public.is_household_admin(household_id))
  );
drop policy if exists tx_delete on public.transactions;
create policy tx_delete on public.transactions for delete
  using (
    household_id in (select public.user_households())
    and (user_id = auth.uid() or public.is_household_admin(household_id))
  );

-- budgets --------------------------------------------------------------
-- Everyone reads; only owners & admins change the household's budgets.
drop policy if exists budgets_all on public.budgets;
drop policy if exists budgets_select on public.budgets;
create policy budgets_select on public.budgets for select
  using (household_id in (select public.user_households()));
drop policy if exists budgets_write on public.budgets;
create policy budgets_write on public.budgets for all
  using (public.is_household_admin(household_id))
  with check (public.is_household_admin(household_id));

-- accounts -------------------------------------------------------------
-- Everyone reads; only owners & admins add/edit/delete wallets.
drop policy if exists accounts_all on public.accounts;
drop policy if exists accounts_select on public.accounts;
create policy accounts_select on public.accounts for select
  using (household_id in (select public.user_households()));
drop policy if exists accounts_write on public.accounts;
create policy accounts_write on public.accounts for all
  using (public.is_household_admin(household_id))
  with check (public.is_household_admin(household_id));

-- ---------------------------------------------------------------------
-- Realtime: allow the app to receive instant changes (synced across members).
-- Safe to re-run (skips if the table is already in the publication).
-- ---------------------------------------------------------------------
do $$
begin
  begin alter publication supabase_realtime add table public.transactions; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.budgets;      exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.accounts;     exception when duplicate_object then null; end;
end $$;

-- =====================================================================
--  Savings goals — a target amount (optionally linked to a savings wallet
--  and a deadline). Progress is computed from the linked wallet's balance.
--  Safe to re-run.
-- =====================================================================
create table if not exists public.goals (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households(id) on delete cascade,
  name          text not null,
  target_amount bigint not null default 0,
  account_id    uuid references public.accounts(id) on delete set null,
  due_date      date,
  created_at    timestamptz not null default now()
);
create index if not exists idx_goals_hh on public.goals (household_id);
alter table public.goals enable row level security;
-- Everyone reads; only owners & admins manage savings goals.
drop policy if exists goals_all on public.goals;
drop policy if exists goals_select on public.goals;
create policy goals_select on public.goals for select
  using (household_id in (select public.user_households()));
drop policy if exists goals_write on public.goals;
create policy goals_write on public.goals for all
  using (public.is_household_admin(household_id))
  with check (public.is_household_admin(household_id));
do $$
begin
  begin alter publication supabase_realtime add table public.goals; exception when duplicate_object then null; end;
end $$;

-- =====================================================================
--  Recurring entries — fixed monthly items (rent, internet, subscriptions).
--  The app auto-creates a transaction on each due day (client-side, on open),
--  tagging it with recurring_id so it is never created twice. Safe to re-run.
-- =====================================================================
create table if not exists public.recurring (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name         text not null,
  amount       bigint not null default 0,
  type         text not null default 'expense' check (type in ('income','expense')),
  category     text not null,
  account_id   uuid references public.accounts(id) on delete set null,
  freq         text not null default 'monthly' check (freq in ('monthly','weekly')),
  day          int  not null default 1,        -- day of month (1–31)
  next_run     date not null,
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);
create index if not exists idx_recurring_hh on public.recurring (household_id);
-- Tag transactions generated from a recurring item (prevents duplicates).
alter table public.transactions add column if not exists recurring_id uuid references public.recurring(id) on delete set null;
alter table public.recurring enable row level security;
-- Everyone reads; only owners & admins manage recurring entries (they auto-create
-- transactions for the whole household, so writes are restricted).
drop policy if exists recurring_all on public.recurring;
drop policy if exists recurring_select on public.recurring;
create policy recurring_select on public.recurring for select
  using (household_id in (select public.user_households()));
drop policy if exists recurring_write on public.recurring;
create policy recurring_write on public.recurring for all
  using (public.is_household_admin(household_id))
  with check (public.is_household_admin(household_id));
do $$
begin
  begin alter publication supabase_realtime add table public.recurring; exception when duplicate_object then null; end;
end $$;

-- =====================================================================
--  Monthly close — một snapshot "chốt sổ" cho mỗi (hộ, tháng).
--  metrics: số liệu do app tính (nguồn sự thật để render lại báo cáo đã chốt).
--  ai_review: nhận xét & đề xuất từ AI (có thể null).
--  Soft close: KHÔNG khóa giao dịch; "chốt lại" = upsert ghi đè theo (household_id, period).
--  Mọi thành viên đọc; chỉ owner/admin chốt/chốt lại. An toàn chạy lại.
-- =====================================================================
create table if not exists public.monthly_reports (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households(id) on delete cascade,
  period        text not null,                 -- 'YYYY-MM'
  metrics       jsonb not null default '{}'::jsonb,
  ai_review     jsonb,
  closed_by     uuid references auth.users(id) on delete set null,
  closed_at     timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  unique (household_id, period)
);
create index if not exists idx_monthly_reports_hh on public.monthly_reports (household_id, period desc);
-- Email báo cáo tháng: stamp chống gửi trùng (Edge Function monthly-email ghi
-- bằng service role — không cần đổi RLS/policy).
alter table public.monthly_reports add column if not exists email_sent_at timestamptz;
alter table public.monthly_reports enable row level security;
drop policy if exists monthly_reports_select on public.monthly_reports;
create policy monthly_reports_select on public.monthly_reports for select
  using (household_id in (select public.user_households()));
drop policy if exists monthly_reports_write on public.monthly_reports;
create policy monthly_reports_write on public.monthly_reports for all
  using (public.is_household_admin(household_id))
  with check (public.is_household_admin(household_id));
do $$
begin
  begin alter publication supabase_realtime add table public.monthly_reports; exception when duplicate_object then null; end;
end $$;

-- =====================================================================
--  Activity log — an immutable audit trail of every add/edit/delete a member
--  performs across the household's data. Written ONLY by the log_activity()
--  trigger (SECURITY DEFINER), so clients can never forge, change, or delete
--  entries — they can only read it. Visible to owners & admins (oversight).
--  Safe to re-run.
-- =====================================================================
create table if not exists public.activity_log (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  user_id      uuid references auth.users(id) on delete set null,  -- who did it
  user_email   text,                                               -- snapshot of their email at the time
  action       text not null check (action in ('insert', 'update', 'delete')),
  entity       text not null,   -- source table: transactions | budgets | accounts | goals | recurring | household_members | households
  entity_id    uuid,            -- the affected row's id (null for budgets, which have a composite key)
  summary      jsonb,           -- { data: <row after>, prev: <row before, on update> } for display
  created_at   timestamptz not null default now()
);
create index if not exists idx_activity_hh on public.activity_log (household_id, created_at desc);

-- Generic logger attached to every data table. SECURITY DEFINER so its INSERT
-- bypasses the (deliberately absent) write policies on activity_log.
create or replace function public.log_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  -- Snapshot the rows as jsonb up front. This function is attached to several tables,
  -- so we must NEVER reference NEW.<field>/OLD.<field> directly — PL/pgSQL eagerly
  -- extracts such fields even when a tg_table_name guard is false, which errors on
  -- tables that lack the column (e.g. NEW.role on `transactions`). jsonb access is safe.
  v_new   jsonb := case when tg_op = 'DELETE' then null else to_jsonb(NEW) end;
  v_old   jsonb := case when tg_op = 'INSERT' then null else to_jsonb(OLD) end;
  v_row   jsonb := coalesce(v_new, v_old);
  v_hid   uuid;
  v_eid   uuid;
  v_email text;
begin
  -- Ignore no-op updates (e.g. idempotent budget upserts that change nothing).
  if tg_op = 'UPDATE' and v_new = v_old then
    return NEW;
  end if;
  -- For members, only membership/role changes matter — skip the email backfill noise.
  if tg_table_name = 'household_members' and tg_op = 'UPDATE'
     and (v_new->>'role') is not distinct from (v_old->>'role') then
    return NEW;
  end if;

  if tg_table_name = 'households' then
    v_hid := (v_row->>'id')::uuid;
  else
    v_hid := (v_row->>'household_id')::uuid;
  end if;

  if v_row ? 'id' then
    v_eid := (v_row->>'id')::uuid;
  elsif v_row ? 'user_id' then
    v_eid := (v_row->>'user_id')::uuid;
  end if;

  select email into v_email
    from public.household_members
   where user_id = auth.uid() and household_id = v_hid
   limit 1;

  -- Logging must never break the real operation.
  begin
    insert into public.activity_log (household_id, user_id, user_email, action, entity, entity_id, summary)
    values (
      v_hid, auth.uid(), v_email, lower(tg_op), tg_table_name, v_eid,
      jsonb_build_object('data', v_row, 'prev', case when tg_op = 'UPDATE' then v_old else null end)
    );
  exception when others then
    null;
  end;
  return coalesce(NEW, OLD);
end
$$;

-- Attach the logger to each table (AFTER, row-level). Drop first so re-running is safe.
drop trigger if exists trg_log_transactions on public.transactions;
create trigger trg_log_transactions after insert or update or delete on public.transactions
  for each row execute function public.log_activity();
drop trigger if exists trg_log_budgets on public.budgets;
create trigger trg_log_budgets after insert or update or delete on public.budgets
  for each row execute function public.log_activity();
drop trigger if exists trg_log_accounts on public.accounts;
create trigger trg_log_accounts after insert or update or delete on public.accounts
  for each row execute function public.log_activity();
drop trigger if exists trg_log_goals on public.goals;
create trigger trg_log_goals after insert or update or delete on public.goals
  for each row execute function public.log_activity();
drop trigger if exists trg_log_recurring on public.recurring;
create trigger trg_log_recurring after insert or update or delete on public.recurring
  for each row execute function public.log_activity();
drop trigger if exists trg_log_members on public.household_members;
create trigger trg_log_members after insert or update or delete on public.household_members
  for each row execute function public.log_activity();
drop trigger if exists trg_log_households on public.households;
create trigger trg_log_households after insert or update or delete on public.households
  for each row execute function public.log_activity();

-- RLS: owners & admins read the log; nobody writes it directly (only the trigger).
alter table public.activity_log enable row level security;
drop policy if exists activity_select on public.activity_log;
create policy activity_select on public.activity_log for select
  using (public.is_household_admin(household_id));

-- =====================================================================
--  Transaction attachments — photo evidence (receipts, invoices) for a
--  transaction. The image FILES live in Supabase Storage (private bucket
--  'receipts'); this table only stores a pointer (storage_path) + metadata.
--  Path convention: '<household_id>/<transaction_id>/<uuid>.<ext>' so the
--  Storage RLS below can read the household & transaction straight from the
--  folder names. Who can attach/remove mirrors who can edit the transaction
--  (its owner, or an owner/admin). Everyone in the household can view.
--  Safe to re-run.
-- =====================================================================

-- The private bucket. (You can also create it in Dashboard → Storage:
-- name 'receipts', Public OFF.) Re-running keeps it private + refreshes limits.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 5242880,
        array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public             = false,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.transaction_attachments (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references public.households(id)   on delete cascade,
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  storage_path   text not null,           -- '<household_id>/<transaction_id>/<uuid>.<ext>' in bucket 'receipts'
  mime           text,
  size_bytes     bigint,
  width          int,
  height         int,
  uploaded_by    uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now()
);
create index if not exists idx_attach_tx on public.transaction_attachments (transaction_id);
create index if not exists idx_attach_hh on public.transaction_attachments (household_id, created_at desc);

-- Stamp the uploader server-side (like set_tx_actor) so uploaded_by is always real.
create or replace function public.set_attachment_actor()
returns trigger language plpgsql security definer set search_path = public as $$
begin new.uploaded_by := auth.uid(); return new; end $$;
drop trigger if exists trg_set_attachment_actor on public.transaction_attachments;
create trigger trg_set_attachment_actor before insert on public.transaction_attachments
  for each row execute function public.set_attachment_actor();

alter table public.transaction_attachments enable row level security;

-- READ: anyone in the household.
drop policy if exists attach_select on public.transaction_attachments;
create policy attach_select on public.transaction_attachments for select
  using (household_id in (select public.user_households()));

-- INSERT: only attach to a transaction you may edit (its owner, or an owner/admin).
drop policy if exists attach_insert on public.transaction_attachments;
create policy attach_insert on public.transaction_attachments for insert
  with check (
    household_id in (select public.user_households())
    and exists (
      select 1 from public.transactions t
       where t.id = transaction_id
         and t.household_id = transaction_attachments.household_id
         and (t.user_id = auth.uid() or public.is_household_admin(t.household_id))
    )
  );

-- DELETE: same condition as insert.
drop policy if exists attach_delete on public.transaction_attachments;
create policy attach_delete on public.transaction_attachments for delete
  using (
    household_id in (select public.user_households())
    and exists (
      select 1 from public.transactions t
       where t.id = transaction_id
         and (t.user_id = auth.uid() or public.is_household_admin(t.household_id))
    )
  );

-- Realtime (sync new evidence across members) + activity log (audit trail).
do $$ begin
  begin alter publication supabase_realtime add table public.transaction_attachments;
  exception when duplicate_object then null; end;
end $$;
drop trigger if exists trg_log_attachments on public.transaction_attachments;
create trigger trg_log_attachments after insert or update or delete on public.transaction_attachments
  for each row execute function public.log_activity();

-- ---------------------------------------------------------------------
-- Storage RLS for the 'receipts' bucket. Path = '<household_id>/<transaction_id>/<file>',
-- so (storage.foldername(name))[1] = household_id and [2] = transaction_id.
-- ---------------------------------------------------------------------
-- READ: anyone in the household (used by createSignedUrl).
drop policy if exists receipts_read on storage.objects;
create policy receipts_read on storage.objects for select to authenticated
using (
  bucket_id = 'receipts'
  and (storage.foldername(name))[1]::uuid in (select public.user_households())
);

-- UPLOAD: only onto a transaction you may edit (its owner, or an owner/admin).
drop policy if exists receipts_insert on storage.objects;
create policy receipts_insert on storage.objects for insert to authenticated
with check (
  bucket_id = 'receipts'
  and (storage.foldername(name))[1]::uuid in (select public.user_households())
  and exists (
    select 1 from public.transactions t
     where t.id = (storage.foldername(name))[2]::uuid
       and t.household_id = (storage.foldername(name))[1]::uuid
       and (t.user_id = auth.uid() or public.is_household_admin(t.household_id))
  )
);

-- DELETE: same condition as upload (cleanup when a transaction/attachment is removed).
drop policy if exists receipts_delete on storage.objects;
create policy receipts_delete on storage.objects for delete to authenticated
using (
  bucket_id = 'receipts'
  and (storage.foldername(name))[1]::uuid in (select public.user_households())
  and exists (
    select 1 from public.transactions t
     where t.id = (storage.foldername(name))[2]::uuid
       and (t.user_id = auth.uid() or public.is_household_admin(t.household_id))
  )
);

-- =====================================================================
--  GOLD wallets — a wallet of type='gold' is an independently valued asset:
--  value (VND) = gold_weight_chi × market buy price per chỉ × gold_factor.
--  It receives NO transactions; opening_balance is unused. The market price
--  lives in the shared gold_prices cache below. Safe to re-run.
-- =====================================================================
alter table public.accounts add column if not exists gold_weight_chi  numeric(12,3); -- weight in CHỈ (1 lượng = 10 chỉ)
alter table public.accounts add column if not exists gold_kind        text;          -- sjc | ring9999 | jewelry | custom
alter table public.accounts add column if not exists gold_factor      numeric(6,4) not null default 1; -- % of reference price (0.98 = 98%)
alter table public.accounts add column if not exists gold_custom_buy  bigint;        -- (kind='custom') manual buy price / chỉ
-- Cost basis for unrealized P&L: what was actually paid per chỉ (includes the
-- shop's buy/sell spread), so P&L = current value − weight × this price.
alter table public.accounts add column if not exists gold_buy_per_chi bigint;        -- average price actually paid / chỉ
alter table public.accounts add column if not exists gold_buy_date    date;          -- (optional) purchase date

-- Shared VN gold price cache: readable by every signed-in user, written ONLY
-- by the gold-price Edge Function (service role) or manual seed — there is no
-- client write policy on purpose. buy_per_chi = dealer BUY-BACK price / chỉ
-- (what you'd actually receive when selling), used for asset valuation.
create table if not exists public.gold_prices (
  kind         text primary key,          -- sjc | ring9999 | jewelry
  buy_per_chi  bigint not null,           -- dealer buys from you (VND / chỉ)
  sell_per_chi bigint,                    -- dealer sells to you (reference)
  source       text,                      -- e.g. 'sjc.com.vn', 'seed'
  fetched_at   timestamptz not null default now()
);
alter table public.gold_prices enable row level security;
drop policy if exists gold_prices_select on public.gold_prices;
create policy gold_prices_select on public.gold_prices for select
  using (auth.role() = 'authenticated');
do $$
begin
  begin alter publication supabase_realtime add table public.gold_prices; exception when duplicate_object then null; end;
end $$;

-- Seed so Phase 1 works immediately (Edge Function or manual updates overwrite these).
insert into public.gold_prices (kind, buy_per_chi, sell_per_chi, source) values
  ('sjc',      11500000, 11700000, 'seed'),
  ('ring9999', 11000000, 11200000, 'seed'),
  ('jewelry',  10500000, 10800000, 'seed')
on conflict (kind) do nothing;

-- =====================================================================
--  Household settings — cấu hình dùng chung cả hộ (một hàng / hộ).
--  settings jsonb: tên key trùng window.CONFIG (GEMINI_API_KEY,
--  ANTHROPIC_API_KEY, …) để client merge 1:1. Supabase URL/anon key
--  KHÔNG lưu ở đây (app cần chúng để kết nối DB — con gà quả trứng),
--  chúng ở lại localStorage của từng thiết bị.
--  Quyền: mọi thành viên đọc (parser cần key AI); chỉ owner/admin ghi.
--  Cố ý KHÔNG gắn trigger log_activity: log chụp snapshot hàng, tức là
--  sao chép API key sang activity_log — không rò secret ra bảng thứ hai.
--  An toàn chạy lại.
-- =====================================================================
create table if not exists public.household_settings (
  household_id uuid primary key references public.households(id) on delete cascade,
  settings     jsonb not null default '{}'::jsonb,
  updated_by   uuid references auth.users(id) on delete set null,
  updated_at   timestamptz not null default now()
);
alter table public.household_settings enable row level security;
drop policy if exists hh_settings_select on public.household_settings;
create policy hh_settings_select on public.household_settings for select
  using (household_id in (select public.user_households()));
drop policy if exists hh_settings_write on public.household_settings;
create policy hh_settings_write on public.household_settings for all
  using (public.is_household_admin(household_id))
  with check (public.is_household_admin(household_id));
do $$
begin
  begin alter publication supabase_realtime add table public.household_settings; exception when duplicate_object then null; end;
end $$;

-- =====================================================================
--  Categories — danh bạ danh mục theo hộ. TÊN (text) vẫn là khóa định danh
--  trong transactions/budgets/recurring; bảng này chỉ quản lý danh sách:
--  thêm/đổi tên/ẩn/icon/sort. Hộ chưa có hàng nào → app dùng bộ 8 mặc định
--  (không bắt buộc migration). An toàn chạy lại.
-- =====================================================================
create table if not exists public.categories (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name         text not null,
  type         text not null default 'expense' check (type in ('expense','income')),
  emoji        text,                            -- icon cho danh mục tự tạo (null = SVG mặc định)
  sort_order   int not null default 0,
  archived     boolean not null default false,
  is_system    boolean not null default false,  -- 'Thu nhập': không đổi tên/ẩn/xóa
  created_at   timestamptz not null default now(),
  unique (household_id, name)
);
create index if not exists idx_categories_hh on public.categories (household_id, sort_order);
alter table public.categories enable row level security;
drop policy if exists categories_select on public.categories;
create policy categories_select on public.categories for select
  using (household_id in (select public.user_households()));
drop policy if exists categories_write on public.categories;
create policy categories_write on public.categories for all
  using (public.is_household_admin(household_id))
  with check (public.is_household_admin(household_id));
do $$
begin
  begin alter publication supabase_realtime add table public.categories; exception when duplicate_object then null; end;
end $$;
drop trigger if exists trg_log_categories on public.categories;
create trigger trg_log_categories after insert or update or delete on public.categories
  for each row execute function public.log_activity();

-- Đổi tên danh mục: cascade text qua transactions/budgets/recurring trong MỘT
-- transaction. KHÔNG sửa monthly_reports (snapshot đã chốt là lịch sử).
create or replace function public.rename_category(hid uuid, old_name text, new_name text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_household_admin(hid) then raise exception 'forbidden'; end if;
  if old_name = new_name or coalesce(trim(new_name), '') = '' then raise exception 'invalid'; end if;
  if exists (select 1 from public.categories where household_id = hid and name = new_name) then
    raise exception 'duplicate';
  end if;
  if exists (select 1 from public.categories where household_id = hid and name = old_name and is_system) then
    raise exception 'system';
  end if;
  update public.categories   set name = new_name where household_id = hid and name = old_name;
  update public.transactions set category = new_name where household_id = hid and category = old_name;
  update public.recurring    set category = new_name where household_id = hid and category = old_name;
  -- budgets có khóa chính (household_id, category) → chuyển sang tên mới rồi xóa hàng cũ
  insert into public.budgets (household_id, category, amount)
    select household_id, new_name, amount from public.budgets
     where household_id = hid and category = old_name
  on conflict (household_id, category) do update set amount = excluded.amount;
  delete from public.budgets where household_id = hid and category = old_name;
end $$;

-- Xóa cứng: chỉ khi không còn giao dịch/khoản định kỳ nào tham chiếu.
create or replace function public.delete_category(hid uuid, cat_name text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_household_admin(hid) then raise exception 'forbidden'; end if;
  if exists (select 1 from public.transactions where household_id = hid and category = cat_name)
     or exists (select 1 from public.recurring where household_id = hid and category = cat_name) then
    raise exception 'in_use';
  end if;
  delete from public.budgets    where household_id = hid and category = cat_name;
  delete from public.categories where household_id = hid and name = cat_name and not is_system;
end $$;

-- =====================================================================
--  Storage usage — RPC cho app đọc dung lượng đang dùng (toàn project):
--  kích thước database + tổng dung lượng bucket receipts (ảnh hóa đơn).
--  SECURITY DEFINER để đếm storage.objects mà không vướng RLS; chỉ trả
--  con số tổng — không lộ dữ liệu. Hạn mức gói (Free: 500MB DB / 1GB
--  Storage) SQL không thấy được, app tự trừ. An toàn chạy lại.
-- =====================================================================
create or replace function public.get_storage_usage()
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'db_bytes', pg_database_size(current_database()),
    'receipts_bytes', coalesce((select sum((metadata->>'size')::bigint)
                                from storage.objects where bucket_id = 'receipts'), 0),
    'receipts_files', coalesce((select count(*)
                                from storage.objects where bucket_id = 'receipts'), 0)
  );
$$;
revoke all on function public.get_storage_usage() from public;
grant execute on function public.get_storage_usage() to authenticated;

-- ---------------------------------------------------------------------
-- LAST: make PostgREST (Supabase's API layer) reload its schema cache so
-- the columns/tables added above are usable IMMEDIATELY. Without this,
-- saving can fail with "Could not find the '…' column in the schema cache"
-- for several minutes after running this file.
-- ---------------------------------------------------------------------
notify pgrst, 'reload schema';
