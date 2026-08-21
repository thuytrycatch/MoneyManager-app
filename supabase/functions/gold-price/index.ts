// =====================================================================
//  gold-price — Supabase Edge Function (Deno)
// ---------------------------------------------------------------------
//  Fetches VN gold prices server-side (no CORS here), normalizes them to
//  VND per CHỈ, sanity-checks them, and upserts into public.gold_prices
//  (service role — clients only ever read that table).
//
//  Anti-spam: if the cached prices are fresher than TTL_MIN minutes the
//  function returns them without hitting any upstream source, so a whole
//  household opening the app at once costs a single real fetch.
//
//  Bad-data guard: a parsed price is accepted only when it is within
//  ±25% of the currently stored price, or (when nothing is stored yet)
//  within the absolute [MIN_PER_CHI, MAX_PER_CHI] bounds. On any parse
//  or validation failure the old price is KEPT — never overwritten with
//  0/null — and the response carries the old fetched_at.
//
//  Deploy:   supabase functions deploy gold-price
//  Test:     curl -X POST https://<ref>.supabase.co/functions/v1/gold-price \
//              -H "Authorization: Bearer <anon key>"
//  Schedule: see README.md next to this file (pg_cron + pg_net snippet).
// =====================================================================

import { createClient } from "npm:@supabase/supabase-js@2";

const TTL_MIN = 15;                    // serve cache when fresher than this
const MIN_PER_CHI = 5_000_000;         // absolute sanity bounds (VND / chỉ)
const MAX_PER_CHI = 30_000_000;        // adjust via env when gold moves far
const BAND = 0.25;                     // ±25% vs stored price

const minPerChi = Number(Deno.env.get("GOLD_MIN_PER_CHI")) || MIN_PER_CHI;
const maxPerChi = Number(Deno.env.get("GOLD_MAX_PER_CHI")) || MAX_PER_CHI;

// changeBuy: move since the previous close, in the SAME raw unit as `buy`
// (only vang.today reports it; null everywhere else).
type Quote = { buy: number; sell: number | null; changeBuy?: number | null };
type Parsed = Partial<Record<"sjc" | "ring9999", Quote>>;

// ---------------------------------------------------------------------
// Unit normalization. VN sources disagree on units (VND/lượng, nghìn
// đồng/lượng, VND/chỉ…), so we generate the plausible interpretations of
// a raw number and pick the one that lands in the expected per-chỉ range
// — preferring the candidate closest to the price we already store.
// ---------------------------------------------------------------------
function normalizePerChi(raw: number, stored: number | null): number | null {
  if (!isFinite(raw) || raw <= 0) return null;
  const candidates = [raw, raw / 10, raw * 1000, raw * 100]; // VND/chỉ, VND/lượng, nghìn/chỉ, …
  if (stored && stored > 0) {
    let best: number | null = null;
    for (const c of candidates) {
      const dev = Math.abs(c - stored) / stored;
      if (dev <= BAND && (best === null || dev < Math.abs(best - stored) / stored)) best = c;
    }
    if (best !== null) return Math.round(best);
  }
  for (const c of candidates) {
    if (c >= minPerChi && c <= maxPerChi) return Math.round(c);
  }
  return null;
}

// ---------------------------------------------------------------------
// Source 1 (primary): vang.today JSON. One call returns every instrument,
// priced per LƯỢNG in VND — normalizePerChi divides by 10. We read the two
// kinds this app tracks and ignore the rest:
//   SJL1L10 "SJC 9999"  → sjc        SJ9999 "SJC Ring" → ring9999
// `change_buy` is the move since the previous close; it lets us backfill
// yesterday's history row on a cold start so the daily chart is not empty.
// ---------------------------------------------------------------------
type VtRow = { name?: string; buy?: number; sell?: number; change_buy?: number; currency?: string };
async function fetchVangToday(): Promise<Parsed> {
  const resp = await fetch("https://www.vang.today/api/prices", {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; BudgetManager/1.0)" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!resp.ok) throw new Error("vang.today http " + resp.status);
  const json = await resp.json();
  const rows: Record<string, VtRow> = json?.prices || {};
  const out: Parsed = {};
  const take = (code: string, kind: "sjc" | "ring9999") => {
    const r = rows[code];
    if (!r || !isFinite(Number(r.buy)) || Number(r.buy) <= 0) return;
    if (r.currency && r.currency !== "VND") return;          // skip XAUUSD & friends
    out[kind] = {
      buy: Number(r.buy),
      sell: isFinite(Number(r.sell)) && Number(r.sell) > 0 ? Number(r.sell) : null,
      changeBuy: isFinite(Number(r.change_buy)) ? Number(r.change_buy) : null,
    };
  };
  take("SJL1L10", "sjc");
  take("SJ9999", "ring9999");
  if (!out.sjc && !out.ring9999) throw new Error("vang.today: no rows matched");
  return out;
}

// ---------------------------------------------------------------------
// Source 2: SJC public XML feed. Rows look like
//   <item buy="..." sell="..." type="Vàng SJC ..."/>  (per LƯỢNG pricing)
// The exact scale has changed over the years — normalizePerChi absorbs it.
// ---------------------------------------------------------------------
async function fetchSjc(): Promise<Parsed> {
  const resp = await fetch("https://sjc.com.vn/xml/tygiavang.xml", {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; BudgetManager/1.0)" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!resp.ok) throw new Error("sjc http " + resp.status);
  const xml = await resp.text();
  const out: Parsed = {};
  const items = xml.matchAll(/<item\s+([^>]*)\/>/g);
  for (const m of items) {
    const attrs = m[1];
    const get = (k: string) => (attrs.match(new RegExp(k + '="([^"]*)"')) || [])[1] || "";
    const type = get("type").toLowerCase();
    const buy = parseFloat(get("buy").replace(/[.,](?=\d{3}\b)/g, "").replace(",", "."));
    const sell = parseFloat(get("sell").replace(/[.,](?=\d{3}\b)/g, "").replace(",", "."));
    if (!type || !isFinite(buy)) continue;
    if (!out.sjc && type.includes("sjc") && (type.includes("1l") || type.includes("miếng") || type.includes("mieng"))) {
      out.sjc = { buy, sell: isFinite(sell) ? sell : null };
    }
    if (!out.ring9999 && (type.includes("nhẫn") || type.includes("nhan")) && type.includes("99")) {
      out.ring9999 = { buy, sell: isFinite(sell) ? sell : null };
    }
  }
  if (!out.sjc && !out.ring9999) throw new Error("sjc: no rows matched");
  return out;
}

// ---------------------------------------------------------------------
// Source 3 (last resort): BTMC JSON API. Rows carry @n_i (name), @pb_i (buy),
// @ps_i (sell) attribute-style keys, one index per row.
// ---------------------------------------------------------------------
async function fetchBtmc(): Promise<Parsed> {
  const key = Deno.env.get("BTMC_API_KEY") || "3kd8ub1llcg9t45hnoh8hmn7t5kc2v"; // public demo key
  const resp = await fetch("https://api.btmc.vn/api/BTMCAPI/getpricebtmc?key=" + key, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; BudgetManager/1.0)" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!resp.ok) throw new Error("btmc http " + resp.status);
  const json = await resp.json();
  const rows: Record<string, string>[] = json?.DataList?.Data || [];
  const out: Parsed = {};
  for (const row of rows) {
    const idx = row["@row"];
    const name = (row["@n_" + idx] || "").toLowerCase();
    const buy = parseFloat(row["@pb_" + idx] || "");
    const sell = parseFloat(row["@ps_" + idx] || "");
    if (!name || !isFinite(buy)) continue;
    if (!out.sjc && name.includes("sjc")) out.sjc = { buy, sell: isFinite(sell) ? sell : null };
    if (!out.ring9999 && (name.includes("nhẫn") || name.includes("nhan")) && name.includes("99")) {
      out.ring9999 = { buy, sell: isFinite(sell) ? sell : null };
    }
  }
  if (!out.sjc && !out.ring9999) throw new Error("btmc: no rows matched");
  return out;
}

Deno.serve(async (_req) => {
  const supa = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const headers = { "Content-Type": "application/json" };

  // Current cache — also the reference point for validation.
  const { data: cached } = await supa.from("gold_prices").select("*");
  const stored: Record<string, { buy_per_chi: number; fetched_at: string }> = {};
  (cached || []).forEach((r) => { stored[r.kind] = r; });

  // Fresh enough? Serve the cache without touching upstream sources.
  const newest = Math.max(0, ...(cached || []).map((r) => new Date(r.fetched_at).getTime()));
  if (newest && Date.now() - newest < TTL_MIN * 60_000) {
    return new Response(JSON.stringify({ ok: true, cached: true, prices: cached }), { headers });
  }

  // Try sources in order; first one that parses wins.
  let parsed: Parsed | null = null;
  let source = "";
  const errors: string[] = [];
  for (const [name, fn] of [["vang.today", fetchVangToday], ["sjc.com.vn", fetchSjc], ["btmc.vn", fetchBtmc]] as const) {
    try { parsed = await fn(); source = name; break; }
    catch (e) { errors.push(name + ": " + (e as Error).message); }
  }
  if (!parsed) {
    // Total failure → keep old prices, tell the client they're stale.
    return new Response(
      JSON.stringify({ ok: false, cached: true, prices: cached, errors }),
      { status: 502, headers },
    );
  }

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const yesterday = new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10);

  const updates: Record<string, unknown>[] = [];
  const history: Record<string, unknown>[] = [];
  const rejected: string[] = [];
  for (const kind of ["sjc", "ring9999"] as const) {
    const q = parsed[kind];
    if (!q) continue;
    const prev = stored[kind] ? Number(stored[kind].buy_per_chi) : null;
    const buy = normalizePerChi(q.buy, prev);
    const sell = q.sell != null ? normalizePerChi(q.sell, prev) : null;
    if (buy == null || (sell != null && buy > sell)) {
      rejected.push(kind + " raw=" + q.buy);
      continue; // keep the stored price for this kind
    }
    updates.push({ kind, buy_per_chi: buy, sell_per_chi: sell, source, fetched_at: now.toISOString() });
    // One row per kind per day; running again the same day overwrites it, so a
    // day ends up holding that day's last quote (its close).
    history.push({ kind, day: today, buy_per_chi: buy, sell_per_chi: sell, source });
    // Cold start: the source tells us how much the price moved since the
    // previous close, so yesterday can be derived and the daily chart has
    // something to draw on day one. Never overwrites a real row (see below).
    if (q.changeBuy != null && q.changeBuy !== 0) {
      const prevClose = normalizePerChi(q.buy - q.changeBuy, buy);
      if (prevClose != null) {
        history.push({ kind, day: yesterday, buy_per_chi: prevClose, sell_per_chi: null, source: source + " (derived)" });
      }
    }
  }
  // NOTE: 'jewelry' (18k…) has no reliable public feed — it keeps its seed /
  // manual value; per-wallet `gold_factor` handles purity discounts anyway.

  if (updates.length) {
    const { error } = await supa.from("gold_prices").upsert(updates, { onConflict: "kind" });
    if (error) {
      return new Response(JSON.stringify({ ok: false, error: error.message, prices: cached }), { status: 500, headers });
    }
  }
  // Daily history is best-effort: the table may not exist yet on installs that
  // haven't re-run supabase-schema.sql, and a missing chart must never break
  // the price update itself.
  let historyError: string | null = null;
  if (history.length) {
    const todayRows = history.filter((h) => h.day === today);
    const derived = history.filter((h) => h.day === yesterday);
    const { error } = await supa.from("gold_price_history").upsert(todayRows, { onConflict: "kind,day" });
    if (error) historyError = error.message;
    // ignoreDuplicates so a derived guess never replaces a day we really recorded.
    if (!error && derived.length) {
      await supa.from("gold_price_history").upsert(derived, { onConflict: "kind,day", ignoreDuplicates: true });
    }
  }
  const { data: fresh } = await supa.from("gold_prices").select("*");
  return new Response(
    JSON.stringify({ ok: updates.length > 0, source, updated: updates.length, rejected, errors, historyError, prices: fresh }),
    { headers },
  );
});
