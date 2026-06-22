# Analytics & Reporting Module — Technical Specification

> Architect's note. This spec extends your **existing** Supabase/PostgreSQL schema
> (`households`, `household_members`, `transactions`, `budgets`, `accounts`) rather than
> replacing it. Everything is scoped by `household_id` so it stays inside your current RLS
> model. Amounts are `bigint` VND (integer minor unit = đồng), matching your codebase.
> Queries are PostgreSQL; JSON payloads are shaped for the Chart.js helpers in
> [js/charts.js](../js/charts.js) (`donut`, `bars`, `line`, `sparkline`).
>
> Benchmarked against the reporting feature sets of Money Lover, Money Manager (Realm),
> and MISA MoneyKeeper. The novel design choices versus your current schema are flagged
> **[NEW]**; they are additive migrations, safe to run on top of `supabase-schema.sql`.

---

## 0. Schema foundation (cross-cutting changes)

Your current model stores `category` as free text on `transactions` and on `budgets`. That
is fine for entry but expensive and fragile for reporting (typos fragment aggregates, no
hierarchy, no income/expense kind, no icon/color metadata). The single highest-leverage
change is to **normalize categories** and add three small tables: `categories`, `events`,
and credit-card metadata on `accounts`.

### 0.1 Categories (normalize) **[NEW]**

```sql
create table if not exists public.categories (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households(id) on delete cascade,
  name          text not null,                              -- "Ăn uống"
  kind          text not null check (kind in ('expense','income')),
  parent_id     uuid references public.categories(id) on delete set null, -- hierarchy
  icon          text,
  color         text,                                       -- hex, drives chart slice color
  sort_order    int  not null default 0,
  archived      boolean not null default false,
  created_at    timestamptz not null default now(),
  unique (household_id, name, kind)
);

-- Transactions keep the text column for backward-compat, gain a FK.
alter table public.transactions
  add column if not exists category_id uuid references public.categories(id) on delete set null;
```

Migration path (non-breaking): backfill `categories` from the distinct
`(household_id, category, type)` tuples already in `transactions`, then set
`transactions.category_id`. The text `category` column can stay as a denormalized cache
(your parser/UI still write it), but **reports read `category_id`**.

```sql
-- Backfill distinct categories
insert into public.categories (household_id, name, kind)
select distinct household_id, category,
       case when type = 'income' then 'income' else 'expense' end
from public.transactions
where type in ('income','expense')
on conflict (household_id, name, kind) do nothing;

-- Link transactions
update public.transactions t
set category_id = c.id
from public.categories c
where c.household_id = t.household_id
  and c.name = t.category
  and c.kind = (case when t.type = 'income' then 'income' else 'expense' end)
  and t.category_id is null;
```

`budgets` should also move to `category_id` (your PK is currently `(household_id, category)`):

```sql
alter table public.budgets
  add column if not exists category_id uuid references public.categories(id) on delete cascade,
  add column if not exists period      text not null default 'monthly'
       check (period in ('weekly','monthly','yearly','custom')),
  add column if not exists starts_on   date,            -- for custom/rolling budgets
  add column if not exists rollover    boolean not null default false; -- carry unused to next period
```

### 0.2 Account class — Assets vs Liabilities **[NEW]**

Your `accounts.type` is `cash | bank | ewallet | other`. For net-worth and double-entry
reporting you need to know whether an account is an **asset** or a **liability**. Add a
derived class plus credit-card cycle metadata.

```sql
alter table public.accounts
  add column if not exists class text not null default 'asset'
      check (class in ('asset','liability'));

-- Credit-card / loan cycle fields (null for normal wallets)
alter table public.accounts
  add column if not exists credit_limit     bigint,   -- card limit / loan principal
  add column if not exists statement_day    int check (statement_day between 1 and 31),  -- cycle close day
  add column if not exists due_day          int check (due_day between 1 and 31),        -- payment due day
  add column if not exists min_payment_pct  numeric(5,2) default 5.0,                     -- % of statement balance
  add column if not exists apr              numeric(6,3);                                 -- annual % rate

-- Expand the type vocabulary
alter table public.accounts drop constraint if exists accounts_type_check;
-- (type was unconstrained text; add the liability kinds your UI offers)
-- Recommended type values: cash | bank | ewallet | savings | credit_card | loan | other
```

For a `credit_card`/`loan` account set `class = 'liability'`. A liability account's
"balance" is what you **owe** (a positive number that you subtract from net worth).

### 0.3 Events / Trips **[NEW]**

```sql
create table if not exists public.events (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households(id) on delete cascade,
  name          text not null,                 -- "Đà Lạt trip 6/2026"
  budget        bigint,                         -- optional event budget
  starts_on     date,
  ends_on       date,
  closed        boolean not null default false,
  created_at    timestamptz not null default now()
);

alter table public.transactions
  add column if not exists event_id uuid references public.events(id) on delete set null;
```

This is the cleanest "trip tag" model — many transactions → one event, with an optional
event budget. (Money Lover calls these *Events*; MISA calls them *Chuyến đi/Sự kiện*.)

### 0.4 Indexing strategy for large transaction datasets

Your schema already has `idx_tx_household_date (household_id, date desc)`. For an analytics
workload over millions of rows, add **covering** and **partial** indexes so reporting
aggregations are index-only scans and never touch the heap:

```sql
-- Expense breakdown / budget reports: filter by household+date+kind, group by category.
create index if not exists idx_tx_report_expense
  on public.transactions (household_id, date, category_id)
  include (amount)
  where type = 'expense';

create index if not exists idx_tx_report_income
  on public.transactions (household_id, date, category_id)
  include (amount)
  where type = 'income';

-- Per-wallet balance/cash-flow scans.
create index if not exists idx_tx_account_date
  on public.transactions (account_id, date)
  include (amount, type);

create index if not exists idx_tx_to_account_date
  on public.transactions (to_account_id, date)
  include (amount)
  where type = 'transfer';

-- Event aggregation.
create index if not exists idx_tx_event
  on public.transactions (event_id)
  include (amount, type)
  where event_id is not null;

-- For very large append-only history, a BRIN index on date is tiny and fast for range scans.
create index if not exists brin_tx_date
  on public.transactions using brin (date) with (pages_per_range = 32);
```

Rules of thumb:
- Put the **equality** columns first (`household_id`), then the **range** column (`date`),
  then the **group-by** column (`category_id`), with `amount` in `INCLUDE` for index-only scans.
- Use **partial indexes** keyed on `type` — expense reports never read income rows, so an
  index that only contains expense rows is smaller and hotter in cache.
- `BRIN` is ideal because transactions are inserted roughly in date order (append-only);
  it's ~1000× smaller than a B-tree for the same range-scan benefit.

### 0.5 Pre-aggregation for scale (optional but recommended)

For households with hundreds of thousands of transactions, dashboards should read a
**daily rollup** rather than re-scanning raw rows on every page load. A materialized view
refreshed concurrently keeps charts instant:

```sql
create materialized view if not exists public.mv_daily_category as
select household_id,
       date,
       type,
       category_id,
       account_id,
       sum(amount)::bigint as total,
       count(*)            as txn_count
from public.transactions
where type in ('income','expense')
group by household_id, date, type, category_id, account_id;

create unique index if not exists mv_daily_category_pk
  on public.mv_daily_category (household_id, date, type, category_id, account_id);

-- Refresh (cron / Supabase scheduled function, e.g. every 5 min or on-demand after writes)
refresh materialized view concurrently public.mv_daily_category;
```

Every query below is written against the **raw `transactions` table** so it is correct
without the MV; swapping `transactions` → `mv_daily_category` (and dropping the
`type/date` filters into the grouped columns) is a drop-in optimization once data volume
justifies it.

---

# 1. Expense & Spending Analytics — *Báo cáo Mức chi tiêu*

## 1.1 Expense breakdown by category (% and total)

**Query.** One pass, returns total + percentage-of-total via a window function:

```sql
-- params: :hid (uuid), :from (date), :to (date)
select
  c.id                                   as category_id,
  c.name                                 as category,
  c.color,
  c.icon,
  sum(t.amount)::bigint                  as total,
  count(*)                               as txn_count,
  round(100.0 * sum(t.amount)
        / nullif(sum(sum(t.amount)) over (), 0), 1) as pct
from public.transactions t
join public.categories c on c.id = t.category_id
where t.household_id = :hid
  and t.type = 'expense'
  and t.date >= :from and t.date <= :to
group by c.id, c.name, c.color, c.icon
order by total desc;
```

`sum(sum(t.amount)) over ()` is the grand total computed in the same scan — no second query,
no app-side reduce. `nullif(..., 0)` guards the empty-period divide-by-zero.

**JSON payload** (shaped for `Charts.donut(canvasId, legendId, byCat, …)` — note your
helper takes a `{category: amount}` map, but returning the richer array below lets you
drive color/percentage directly and is friendlier for Recharts/ApexCharts too):

```json
{
  "period": { "from": "2026-06-01", "to": "2026-06-30", "label": "Tháng 6, 2026" },
  "currency": "VND",
  "total": 8450000,
  "breakdown": [
    { "categoryId": "a1…", "category": "Ăn uống",   "total": 3200000, "pct": 37.9, "color": "#6366f1", "txnCount": 64 },
    { "categoryId": "b2…", "category": "Di chuyển",  "total": 1850000, "pct": 21.9, "color": "#10b981", "txnCount": 22 },
    { "categoryId": "c3…", "category": "Mua sắm",    "total": 1500000, "pct": 17.8, "color": "#ef4444", "txnCount": 9 },
    { "categoryId": "d4…", "category": "Hóa đơn",    "total": 1200000, "pct": 14.2, "color": "#f59e0b", "txnCount": 5 },
    { "categoryId": "e5…", "category": "Khác",       "total": 700000,  "pct": 8.3,  "color": "#64748b", "txnCount": 11 }
  ]
}
```

> Adapter for your current `donut()` helper:
> `const byCat = Object.fromEntries(payload.breakdown.map(b => [b.category, b.total]))`.

## 1.2 Budget vs. Actual + threshold alerting

Your `budgets` table holds `amount` per category. The report joins the **budget** (for the
period) to **actual** expense (in the period) and derives a status from the ratio.

**Threshold logic** (production-grade, mirrors Money Lover/MISA):

| Ratio (actual ÷ budget) | Status     | UI                          |
|-------------------------|------------|-----------------------------|
| `< 0.80`                | `ok`       | green progress bar          |
| `0.80 ≤ r < 1.00`       | `warning`  | amber bar + soft alert @80% |
| `r ≥ 1.00`              | `critical` | red bar + hard alert @100%  |

```sql
-- params: :hid, :from, :to  (period must match the budget's period)
with actual as (
  select category_id, sum(amount)::bigint as spent
  from public.transactions
  where household_id = :hid and type = 'expense'
    and date >= :from and date <= :to
  group by category_id
)
select
  c.id   as category_id,
  c.name as category,
  c.color,
  b.amount                               as budget,
  coalesce(a.spent, 0)                   as spent,
  greatest(b.amount - coalesce(a.spent,0), 0)        as remaining,
  round(100.0 * coalesce(a.spent,0) / nullif(b.amount,0), 1) as pct_used,
  case
    when b.amount = 0                              then 'no_budget'
    when coalesce(a.spent,0) >= b.amount           then 'critical'
    when coalesce(a.spent,0) >= b.amount * 0.80    then 'warning'
    else 'ok'
  end as status
from public.budgets b
join public.categories c on c.id = b.category_id
left join actual a on a.category_id = b.category_id
where b.household_id = :hid
order by pct_used desc nulls last;
```

**Projected-overspend enhancement** (the feature that makes the report feel "smart"):
pace-adjust the alert. If you're 60% through the month but have spent 75% of budget, you're
**on track to overspend** even though you're under 100%. Add a day-fraction multiplier:

```sql
-- elapsed fraction of the period
, params as (
  select (current_date - :from + 1)::numeric
       / nullif((:to - :from + 1), 0) as elapsed_frac
)
-- projected = spent / elapsed_frac;  flag when projected >= budget
```

**JSON payload:**

```json
{
  "period": { "from": "2026-06-01", "to": "2026-06-30", "elapsedFrac": 0.73 },
  "totals": { "budget": 9000000, "spent": 7300000, "pctUsed": 81.1, "status": "warning" },
  "categories": [
    { "category": "Ăn uống",  "budget": 3000000, "spent": 3150000, "remaining": 0,       "pctUsed": 105.0, "status": "critical", "projected": 4315000, "color": "#6366f1" },
    { "category": "Di chuyển","budget": 1000000, "spent": 820000,  "remaining": 180000,  "pctUsed": 82.0,  "status": "warning",  "projected": 1123000, "color": "#10b981" },
    { "category": "Hóa đơn",  "budget": 2000000, "spent": 900000,  "remaining": 1100000, "pctUsed": 45.0,  "status": "ok",       "projected": 1233000, "color": "#f59e0b" }
  ],
  "alerts": [
    { "category": "Ăn uống",  "level": "critical", "message": "Vượt ngân sách 5%" },
    { "category": "Di chuyển","level": "warning",  "message": "Đã dùng 82% ngân sách" }
  ]
}
```

Render each row as a stacked progress bar (`spent` over `budget`), color = status. The
`alerts[]` array drives toast/badge notifications — generate it server-side so the same
logic feeds both the web UI and any push-notification worker.

## 1.3 Event / Trip-based aggregation

With `transactions.event_id` (§0.3), an event report is a filtered breakdown plus a
budget-burn line.

```sql
-- Summary per event
select
  e.id, e.name, e.budget, e.starts_on, e.ends_on, e.closed,
  sum(t.amount) filter (where t.type = 'expense')::bigint as spent,
  sum(t.amount) filter (where t.type = 'income')::bigint  as reimbursed,
  count(*) filter (where t.type = 'expense')              as txn_count
from public.events e
left join public.transactions t on t.event_id = e.id
where e.household_id = :hid
group by e.id
order by e.starts_on desc nulls last;

-- Category split *within* one event
select c.name as category, c.color, sum(t.amount)::bigint as total
from public.transactions t
join public.categories c on c.id = t.category_id
where t.event_id = :event_id and t.type = 'expense'
group by c.name, c.color
order by total desc;
```

**JSON payload:**

```json
{
  "event": { "id": "ev1…", "name": "Đà Lạt 6/2026", "budget": 5000000,
             "startsOn": "2026-06-10", "endsOn": "2026-06-13", "closed": false },
  "summary": { "spent": 4280000, "reimbursed": 600000, "net": 3680000,
               "budgetUsedPct": 85.6, "status": "warning", "txnCount": 27 },
  "byCategory": [
    { "category": "Ăn uống",  "total": 1850000, "color": "#6366f1" },
    { "category": "Di chuyển","total": 1600000, "color": "#10b981" },
    { "category": "Giải trí", "total": 830000,  "color": "#8b5cf6" }
  ],
  "timeline": [
    { "date": "2026-06-10", "total": 1200000 },
    { "date": "2026-06-11", "total": 1450000 },
    { "date": "2026-06-12", "total": 980000 },
    { "date": "2026-06-13", "total": 650000 }
  ]
}
```

---

# 2. Cash Flow & Financial Trends — *Báo cáo Dòng tiền & Xu hướng*

## 2.1 Net income by Weekly / Monthly / Yearly

The single trick that makes all three views one query: **parameterize `date_trunc`'s
granularity**, and use `generate_series` to emit **zero-filled** buckets (so a month with
no expenses still shows up as `0`, not a gap — critical for correct charts).

```sql
-- params: :hid, :from, :to, :grain ('week' | 'month' | 'year')
with buckets as (
  select generate_series(
           date_trunc(:grain, :from::timestamp),
           date_trunc(:grain, :to::timestamp),
           ('1 ' || :grain)::interval
         ) as bucket
),
agg as (
  select date_trunc(:grain, date) as bucket,
         sum(amount) filter (where type = 'income')::bigint  as income,
         sum(amount) filter (where type = 'expense')::bigint as expense
  from public.transactions
  where household_id = :hid
    and type in ('income','expense')
    and date >= :from and date <= :to
  group by 1
)
select
  b.bucket::date                                   as period,
  coalesce(a.income, 0)                            as income,
  coalesce(a.expense, 0)                           as expense,
  coalesce(a.income, 0) - coalesce(a.expense, 0)   as net
from buckets b
left join agg a on a.bucket = b.bucket
order by b.bucket;
```

> `transfer` transactions are deliberately excluded — a transfer between your own wallets
> is **not** income or expense and would double-count cash flow. Keep that filter
> (`type in ('income','expense')`) in every cash-flow query.

`FILTER (WHERE …)` is the PostgreSQL idiom for conditional aggregation — one scan produces
both income and expense columns, far cheaper than two subqueries or `CASE`-sum.

## 2.2 Double-bar chart (Income vs Expense over time)

Same aggregation as §2.1; the payload is shaped directly for your `Charts.bars(canvasId,
labels, datasets)` helper (which expects `labels[]` + `datasets[{label,data,color}]`):

```json
{
  "grain": "month",
  "labels": ["T1", "T2", "T3", "T4", "T5", "T6"],
  "datasets": [
    { "label": "Thu nhập", "color": "#10b981",
      "data": [18000000, 18000000, 22000000, 18000000, 18000000, 25000000] },
    { "label": "Chi tiêu", "color": "#ef4444",
      "data": [12400000, 15800000, 11200000, 16900000, 13500000, 18450000] }
  ],
  "net": [5600000, 2200000, 10800000, 1100000, 4500000, 6550000],
  "summary": { "totalIncome": 119000000, "totalExpense": 88250000, "netTotal": 30750000,
               "avgMonthlyNet": 5125000, "savingsRate": 25.8 }
}
```

`savingsRate = netTotal / totalIncome × 100` — a headline KPI both Money Lover and MISA
surface prominently. Render `net[]` as an optional overlaid line on the bar chart (Chart.js
mixed chart) for an at-a-glance surplus/deficit read.

## 2.3 Trend analysis — spikes, seasonality, predictive indicators

This is a line-chart processing pipeline. Three layers, all computable in SQL with window
functions so the frontend just plots arrays.

### (a) Smoothed trend + spike detection

A **3-month centered moving average** smooths noise; a point is a **spike** when it exceeds
the trailing mean by more than *k* standard deviations (z-score ≥ 2 is a robust default).

```sql
-- params: :hid, :from, :to   (monthly grain shown)
with monthly as (
  select date_trunc('month', date)::date as m,
         sum(amount) filter (where type = 'expense')::bigint as expense
  from public.transactions
  where household_id = :hid and type in ('income','expense')
    and date >= :from and date <= :to
  group by 1
),
stats as (
  select m, expense,
    avg(expense)  over w as moving_avg,    -- 3-mo centered MA
    avg(expense)  over t as trailing_avg,  -- trailing 6-mo mean
    stddev_pop(expense) over t as trailing_sd
  from monthly
  window
    w as (order by m rows between 1 preceding and 1 following),
    t as (order by m rows between 6 preceding and 1 preceding)
)
select m as period, expense,
       round(moving_avg)::bigint as trend,
       case when trailing_sd > 0
            then round((expense - trailing_avg) / trailing_sd, 2)
            else 0 end as zscore,
       (trailing_sd > 0 and expense > trailing_avg + 2 * trailing_sd) as is_spike
from stats
order by m;
```

### (b) Seasonality (month-of-year fingerprint)

Average spend per calendar month across all years reveals recurring patterns (Tết spike in
Jan/Feb, etc.). This is the seasonal index Money apps use for "you usually spend more in
this month" hints.

```sql
select extract(month from date)::int as month_no,
       avg(monthly_total)::bigint     as avg_spend
from (
  select date_trunc('month', date) as m, sum(amount) as monthly_total
  from public.transactions
  where household_id = :hid and type = 'expense'
  group by 1
) s
group by extract(month from date_trunc('month', s.m))  -- group by calendar month
order by month_no;
```

### (c) Predictive cash-flow indicator

A lightweight, explainable forecast beats a black-box model for a personal-finance app.
**Linear regression via `regr_slope`/`regr_intercept`** projects next period; combine with
the seasonal index for a seasonally-adjusted forecast.

```sql
-- Trend projection for the next month (ordinal x = months since first bucket)
with monthly as (
  select row_number() over (order by m) as x, expense as y
  from (
    select date_trunc('month', date) as m,
           sum(amount) filter (where type='expense') as expense
    from public.transactions
    where household_id = :hid and type in ('income','expense')
    group by 1
  ) q
)
select
  regr_slope(y, x)     as slope,        -- VND change per month
  regr_intercept(y, x) as intercept,
  regr_slope(y, x) * (max(x) + 1) + regr_intercept(y, x) as forecast_next
from monthly;
```

> Forecast caveat to surface in the UI: label it "ước tính" (estimate) and require ≥4–6
> months of history before showing it. Below that, the regression is noise. Document this
> minimum-data gate — don't silently emit a misleading number.

**JSON payload** (for `Charts.line(canvasId, labels, data, color)` plus annotations):

```json
{
  "grain": "month",
  "labels": ["T1","T2","T3","T4","T5","T6","T7 (dự báo)"],
  "actual":   [12400000, 15800000, 11200000, 16900000, 13500000, 18450000, null],
  "trend":    [13100000, 13100000, 14600000, 13800000, 16300000, 15100000, null],
  "forecast": [null, null, null, null, null, 18450000, 17900000],
  "spikes": [
    { "period": "2026-06", "value": 18450000, "zscore": 2.3, "reason": "Chi tiêu cao bất thường" }
  ],
  "seasonality": [
    { "monthNo": 1, "avgSpend": 22000000, "label": "Tết — thường cao" },
    { "monthNo": 2, "avgSpend": 19500000 }
  ],
  "forecastMeta": { "method": "linear_regression", "monthsOfData": 6, "confidence": "low" }
}
```

The `null`-padding aligns actual and forecast series on a shared x-axis: actual stops at the
present, forecast bridges the last real point into the projected one (dashed line in Chart.js
via `borderDash` on a second dataset).

---

# 3. Wealth & Asset Management — *Báo cáo Quản lý tiền & Tài sản*

## 3.1 Opening vs Closing balance per wallet

The core identity, per account, for a time frame `[from, to]`:

```
opening_balance(from) = account.opening_balance
                      + Σ(net cash movement strictly BEFORE :from)
closing_balance(to)   = opening_balance(from)
                      + Σ(net cash movement WITHIN [:from, :to])
```

"Net cash movement" for an account must account for **transfers in both directions**:
income `+`, expense `−`, transfer-out (`account_id = self`) `−`, transfer-in
(`to_account_id = self`) `+`.

```sql
-- params: :hid, :from, :to
with movements as (
  -- money leaving/entering each account as its "source" side
  select account_id as acc,
         sum(case when type = 'income'   then amount
                  when type = 'expense'  then -amount
                  when type = 'transfer' then -amount end)::bigint as delta,
         date
  from public.transactions
  where household_id = :hid and account_id is not null
  group by account_id, date
  union all
  -- transfer destination side (money arriving)
  select to_account_id as acc, sum(amount)::bigint as delta, date
  from public.transactions
  where household_id = :hid and type = 'transfer' and to_account_id is not null
  group by to_account_id, date
),
rolled as (
  select a.id, a.name, a.type, a.class, a.opening_balance,
         coalesce(sum(m.delta) filter (where m.date <  :from), 0) as before_from,
         coalesce(sum(m.delta) filter (where m.date >= :from
                                         and m.date <= :to), 0)  as within
  from public.accounts a
  left join movements m on m.acc = a.id
  where a.household_id = :hid and a.archived = false
  group by a.id
)
select id, name, type, class,
       opening_balance + before_from                  as opening,
       opening_balance + before_from + within         as closing,
       within                                         as net_change
from rolled
order by name;
```

This is O(transactions) with a single scan thanks to the `FILTER` split into before/within.
For dashboards on huge datasets, snapshot end-of-day balances into the `mv_daily_category`
MV (§0.5) and read the last row ≤ date.

**JSON payload:**

```json
{
  "period": { "from": "2026-06-01", "to": "2026-06-30" },
  "wallets": [
    { "id": "w1…", "name": "Tiền mặt",   "type": "cash",        "class": "asset",
      "opening": 2000000,  "closing": 1450000,  "netChange": -550000 },
    { "id": "w2…", "name": "Vietcombank","type": "bank",        "class": "asset",
      "opening": 35000000, "closing": 41200000, "netChange": 6200000 },
    { "id": "w3…", "name": "Visa VCB",   "type": "credit_card", "class": "liability",
      "opening": -4500000, "closing": -6800000, "netChange": -2300000 }
  ],
  "totals": { "openingNetWorth": 32500000, "closingNetWorth": 35850000, "change": 3350000 }
}
```

## 3.2 Double-entry concepts: Assets vs Liabilities

A personal-finance app doesn't need full ledger double-entry, but the **asset/liability
classification** and the **transfer-as-two-legs** idea are exactly the useful parts:

- **Assets** (`class = 'asset'`): Cash, Bank, E-wallet, Savings. Balance = positive money
  you hold. Increases with income/transfer-in, decreases with expense/transfer-out.
- **Liabilities** (`class = 'liability'`): Credit cards, Personal loans. The stored balance
  represents **what you owe**. A credit-card *purchase* (expense paid by the card)
  *increases* the liability; a *payment* (transfer from a bank account to the card)
  *decreases* it.

The elegant modeling consequence: **paying a credit card is a transfer**, not an expense.

```
Buy groceries on card:   expense,  account_id = card     → card owed +300k, no net-worth change
                                                            (asset unchanged, liability up,
                                                             but the *grocery expense* already
                                                             hit your P&L at purchase time)
Pay the card from bank:  transfer, account_id = bank,
                                    to_account_id = card  → bank −2M, card owed −2M
                                                            (net worth unchanged; you converted
                                                             cash into debt-reduction)
```

To make a liability's "balance" read intuitively (owed = positive), compute the signed
amount at report time rather than storing a sign:

```sql
select
  a.id, a.name, a.class,
  case when a.class = 'liability'
       then -(a.opening_balance + coalesce(bal.delta, 0))   -- amount owed, shown positive
       else  (a.opening_balance + coalesce(bal.delta, 0))   -- amount held
  end as balance
from public.accounts a
left join lateral (
  select sum(case when type='income' then amount
                  when type in ('expense','transfer') then -amount end)
       + coalesce((select sum(amount) from public.transactions
                   where to_account_id = a.id and type='transfer'), 0) as delta
  from public.transactions where account_id = a.id
) bal on true
where a.household_id = :hid;
```

## 3.3 Net worth + credit-card statement cycle

### Net worth

```sql
-- Net worth as of :as_of (defaults current_date)
with bal as (
  select a.id, a.class,
         a.opening_balance
       + coalesce(sum(case when t.type='income' then t.amount
                           when t.type in ('expense','transfer') then -t.amount end)
                  filter (where t.date <= :as_of), 0)
       + coalesce(sum(tin.amount) filter (where tin.date <= :as_of), 0) as balance
  from public.accounts a
  left join public.transactions t   on t.account_id = a.id
  left join public.transactions tin on tin.to_account_id = a.id and tin.type = 'transfer'
  where a.household_id = :hid and a.archived = false
  group by a.id, a.class, a.opening_balance
)
select
  sum(balance) filter (where class = 'asset')::bigint        as total_assets,
  -sum(balance) filter (where class = 'liability')::bigint   as total_liabilities,
  sum(balance)::bigint                                       as net_worth
from bal;
```

(`net_worth = total_assets − total_liabilities`; since liability balances are stored
negative in the asset-frame above, a plain `sum(balance)` yields the correct net worth, and
the `filter`ed lines break out the two halves for display.)

### Credit-card statement cycle

The cycle has three dates driven by `accounts.statement_day` and `accounts.due_day`:

- **Statement (closing) date** — `statement_day` of each month; transactions up to this
  date form the statement balance.
- **Grace period** — from statement date to **due date**; no interest if paid in full.
- **Due date** — `due_day`; minimum payment = `max(statement_balance × min_payment_pct,
  floor)`.

```sql
-- Current open-statement balance & due info for one card
-- params: :card_id, :today (date)
with cycle as (
  select
    make_date(extract(year  from :today)::int,
              extract(month from :today)::int,
              least(a.statement_day, 28)) as stmt_this_month,
    a.statement_day, a.due_day, a.min_payment_pct, a.credit_limit, a.opening_balance
  from public.accounts a where a.id = :card_id
),
bounds as (
  select
    case when :today > stmt_this_month
         then stmt_this_month
         else (stmt_this_month - interval '1 month')::date end as cycle_start,
    statement_day, due_day, min_payment_pct, credit_limit, opening_balance
  from cycle
)
select
  -- statement balance = charges up to the cycle close
  -(b.opening_balance + coalesce(sum(
       case when t.type='expense' then -t.amount         -- charges increase debt
            when t.type='transfer' and t.to_account_id = :card_id then t.amount end), 0))
    as statement_balance,
  greatest(ceil(
    -(b.opening_balance + coalesce(sum(
       case when t.type='expense' then -t.amount
            when t.type='transfer' and t.to_account_id = :card_id then t.amount end),0))
    * b.min_payment_pct / 100.0), 0)::bigint                as min_payment,
  (b.cycle_start + (b.due_day - b.statement_day
     + case when b.due_day < b.statement_day then 30 else 0 end) * interval '1 day')::date as due_date,
  b.credit_limit
from bounds b
left join public.transactions t
  on (t.account_id = :card_id or t.to_account_id = :card_id)
 and t.date <= b.cycle_start
group by b.opening_balance, b.min_payment_pct, b.credit_limit, b.cycle_start, b.due_day, b.statement_day;
```

> Calendar edge cases to handle in code, not SQL gymnastics: `statement_day = 31` in
> February, leap years, and `due_day < statement_day` (due date rolls into the next month).
> The `least(statement_day, 28)` guard above is a pragmatic floor; for exact handling,
> compute candidate dates in the app layer and clamp to each month's last day.

**JSON payload (net worth + cards):**

```json
{
  "asOf": "2026-06-22",
  "netWorth": 35850000,
  "totals": { "assets": 42650000, "liabilities": 6800000 },
  "assets": [
    { "name": "Tiền mặt",    "type": "cash",    "balance": 1450000 },
    { "name": "Vietcombank", "type": "bank",    "balance": 41200000 }
  ],
  "liabilities": [
    { "name": "Visa VCB", "type": "credit_card", "balance": 6800000,
      "creditLimit": 50000000, "utilizationPct": 13.6,
      "statement": { "balance": 4500000, "minPayment": 225000,
                     "dueDate": "2026-07-05", "gracePeriodDays": 13, "status": "due_soon" } }
  ],
  "trend": [
    { "period": "2026-01", "netWorth": 22500000 },
    { "period": "2026-06", "netWorth": 35850000 }
  ]
}
```

`utilizationPct = statement_balance / creditLimit × 100` (credit-utilization, a metric
MISA surfaces). The `trend[]` array — net worth snapshotted monthly — is the single most
motivating chart in a wealth report; back it with a `net_worth_snapshots` table written by a
daily/monthly cron if you don't want to recompute the full history each load.

---

## 4. Implementation summary & rollout order

| Phase | Work | Unlocks |
|-------|------|---------|
| 1 | Normalize `categories`, backfill `category_id`, add report indexes (§0.1, §0.4) | Reports 1.1, 1.2 |
| 2 | `events` table + `event_id` (§0.3) | Report 1.3 |
| 3 | Zero-filled time-series queries (§2.1–2.2) | Cash-flow bars, net income |
| 4 | Window-function trend/forecast (§2.3) | Spike/seasonality/forecast line |
| 5 | `accounts.class` + credit fields (§0.2), balance roll-forward (§3.1) | Opening/closing, net worth |
| 6 | Credit-card cycle logic (§3.3) + `net_worth_snapshots` cron | Liability & wealth reports |
| 7 | `mv_daily_category` MV + concurrent refresh (§0.5) | Scale to >100k txns |

**Performance checklist**
- Every report query filters `household_id` first (RLS-aligned, index-leading column).
- Partial + covering indexes keep expense/income/transfer scans index-only.
- `FILTER (WHERE …)` over `CASE`-sum: one scan, multiple conditional aggregates.
- `generate_series` zero-fills buckets so charts never show false gaps.
- Exclude `type='transfer'` from all cash-flow/income/expense aggregates (avoid double count).
- Promote hot dashboards to the materialized view once a household crosses ~100k rows.
- Forecasts require ≥4–6 months of data; gate and label them as estimates.
```

