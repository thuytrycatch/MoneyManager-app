-- =====================================================================
--  supabase-schema.sql — Lược đồ CSDL cho "Sổ Thu Chi" (nhiều hộ gia đình)
-- ---------------------------------------------------------------------
--  CÁCH DÙNG:
--    1. Vào Supabase → dự án của bạn → SQL Editor → New query.
--    2. Dán TOÀN BỘ nội dung file này vào, bấm RUN.
--    3. Chạy 1 lần là đủ. (Các lệnh đều an toàn khi chạy lại.)
--
--  MÔ HÌNH:
--    households          : mỗi hộ gia đình
--    household_members   : ai thuộc hộ nào (1 user có thể ở nhiều hộ)
--    transactions        : giao dịch, gắn household_id
--    budgets             : ngân sách theo danh mục, gắn household_id
--
--  BẢO MẬT (RLS): mỗi người chỉ đọc/ghi được dữ liệu của hộ mình tham gia.
-- =====================================================================

-- pgcrypto cho gen_random_uuid() (Supabase thường bật sẵn)
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Bảng
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
  joined_at    timestamptz not null default now(),
  primary key (household_id, user_id)
);

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
-- Hàm trợ giúp: danh sách hộ mà người dùng hiện tại tham gia.
-- SECURITY DEFINER để không bị đệ quy khi viết policy cho household_members.
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
-- Bật RLS
-- ---------------------------------------------------------------------
alter table public.households        enable row level security;
alter table public.household_members enable row level security;
alter table public.transactions      enable row level security;
alter table public.budgets           enable row level security;

-- ---------------------------------------------------------------------
-- Policies (drop trước để chạy lại không lỗi)
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

-- Mỗi người chỉ tự thêm CHÍNH MÌNH vào hộ (dùng để tham gia bằng mã hộ).
drop policy if exists members_insert on public.household_members;
create policy members_insert on public.household_members for insert
  with check (user_id = auth.uid());

drop policy if exists members_delete on public.household_members;
create policy members_delete on public.household_members for delete
  using (user_id = auth.uid());

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
-- Realtime: cho phép app nhận thay đổi tức thời (đồng bộ giữa các thành viên).
-- An toàn khi chạy lại (bỏ qua nếu bảng đã có trong publication).
-- ---------------------------------------------------------------------
do $$
begin
  begin alter publication supabase_realtime add table public.transactions; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.budgets;      exception when duplicate_object then null; end;
end $$;
