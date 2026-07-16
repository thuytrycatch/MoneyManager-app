// =====================================================================
//  monthly-email — Supabase Edge Function (Deno)
// ---------------------------------------------------------------------
//  Emails the household's CLOSED monthly report (monthly_reports.metrics
//  + ai_review — numbers are computed by the app at close time; this
//  function NEVER recomputes them and NEVER calls an AI).
//
//  Two entry paths:
//   - cron (daily): header x-cron-secret == CRON_SECRET. For every
//     household with settings.EMAIL_REPORT.enabled, once today >= sendDay:
//       · previous month closed & not yet emailed → send the report to
//         every member, then stamp monthly_reports.email_sent_at
//         (idempotent — re-runs skip).
//       · not closed & today == sendDay → remind owners/admins to close
//         (exactly-once: the cron fires once a day).
//   - test (from the app): user JWT + {test:true, householdId}. Caller
//     must be owner/admin of that household; sends the LATEST snapshot
//     to the caller's own email only, no stamp.
//
//  Mail provider: Resend (RESEND_API_KEY secret). MAIL_FROM defaults to
//  Resend's onboarding sender — verify a domain for production.
//
//  Deploy:  supabase functions deploy monthly-email
//  Secrets: supabase secrets set RESEND_API_KEY=... CRON_SECRET=... \
//             MAIL_FROM="BudgetManager <...>" APP_URL=https://...
//  Schedule: see README.md next to this file (pg_cron + pg_net, daily).
// =====================================================================

import { createClient } from "npm:@supabase/supabase-js@2";

const TZ = "Asia/Ho_Chi_Minh";
const DEFAULT_SEND_DAY = 3;

type Suggestion = { action: string; category?: string | null; estSaving?: number | null; priority?: string };
type AiReview = { summary?: string; observations?: string[]; suggestions?: Suggestion[] } | null;
type Metrics = {
  period: string; income: number; expense: number; net: number; savingsRate: number;
  prev?: { income: number; expense: number; net: number };
  avg3m?: number | null;
  categories?: { category: string; amount: number; pct: number; prevAmount: number; deltaPct: number | null }[];
  incomeCategories?: { category: string; amount: number; pct: number; prevAmount: number; deltaPct: number | null }[];
  movers?: { category: string; deltaAbs: number; deltaPct: number | null }[];
  budget?: { category: string; budget: number; spent: number; pctUsed: number; status: string }[];
};

// ---------------------------------------------------------------------
// Time in VN. The server runs UTC — doing month math there sends mail a
// day (or, on the 1st, a whole month) off.
// ---------------------------------------------------------------------
function vnToday(): { y: number; m: number; d: number } {
  const s = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date()); // YYYY-MM-DD
  const [y, m, d] = s.split("-").map(Number);
  return { y, m, d };
}
function prevPeriod(y: number, m: number): string {
  const pm = m === 1 ? 12 : m - 1;
  const py = m === 1 ? y - 1 : y;
  return py + "-" + String(pm).padStart(2, "0");
}

// ---------------------------------------------------------------------
// Rendering helpers (self-contained inline-CSS HTML + plain text).
// ---------------------------------------------------------------------
function esc(s: unknown): string {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}
function vnd(n: number): string {
  return new Intl.NumberFormat("vi-VN").format(Math.round(n || 0)) + " ₫";
}
function pctDelta(cur: number, prev: number | undefined | null): string {
  if (!prev) return "";
  const d = Math.round(((cur - prev) / prev) * 100);
  if (!isFinite(d) || d === 0) return "";
  const up = d > 0;
  // Color follows the sign of the change (green = increase, red = decrease).
  const color = up ? "#10b981" : "#ef4444";
  return ` <span style="color:${color};font-size:12px">${up ? "▲" : "▼"} ${Math.abs(d)}%</span>`;
}

function reportHtml(hhName: string, metrics: Metrics, ai: AiReview, appUrl: string): string {
  const m = metrics;
  const prev = m.prev || { income: 0, expense: 0, net: 0 };
  const cell = (label: string, value: string, delta = "") =>
    `<td style="padding:10px 8px;border-radius:10px;background:#f4f5fb">
       <div style="font-size:12px;color:#6b7280">${label}</div>
       <div style="font-size:16px;font-weight:700;color:#111827">${value}${delta}</div></td>`;
  const catRows = (m.categories || []).slice(0, 5).map((c) =>
    `<tr><td style="padding:6px 0;color:#111827">${esc(c.category)}</td>
         <td style="padding:6px 0;text-align:right;color:#111827;font-weight:600">${vnd(c.amount)}</td>
         <td style="padding:6px 0 6px 10px;text-align:right;color:#6b7280;font-size:12px">${c.pct}%${c.deltaPct != null ? " · " + (c.deltaPct > 0 ? "+" : "") + c.deltaPct + "%" : ""}</td></tr>`).join("");
  const incRows = (m.incomeCategories || []).slice(0, 5).map((c) =>
    `<tr><td style="padding:6px 0;color:#111827">${esc(c.category)}</td>
         <td style="padding:6px 0;text-align:right;color:#059669;font-weight:600">${vnd(c.amount)}</td>
         <td style="padding:6px 0 6px 10px;text-align:right;color:#6b7280;font-size:12px">${c.pct}%${c.deltaPct != null ? " · " + (c.deltaPct > 0 ? "+" : "") + c.deltaPct + "%" : ""}</td></tr>`).join("");
  const overBudget = (m.budget || []).filter((b) => b.status !== "ok");
  const budgetRows = overBudget.map((b) =>
    `<tr><td style="padding:6px 0;color:#111827">${esc(b.category)}</td>
         <td style="padding:6px 0;text-align:right;color:${b.status === "critical" ? "#ef4444" : "#d97706"};font-weight:600">
           ${vnd(b.spent)} / ${vnd(b.budget)} · ${b.pctUsed}%</td></tr>`).join("");
  const moverRows = (m.movers || []).map((x) =>
    `<li style="margin:4px 0;color:#111827">${esc(x.category)}: <b>${x.deltaAbs > 0 ? "+" : "−"}${vnd(Math.abs(x.deltaAbs))}</b>${x.deltaPct != null ? ` <span style="color:#6b7280">(${x.deltaPct > 0 ? "+" : ""}${x.deltaPct}%)</span>` : ""}</li>`).join("");
  const aiBlock = ai && ai.summary
    ? `<h3 style="font-size:14px;color:#111827;margin:22px 0 6px">🤖 Nhận xét từ AI (lúc chốt sổ)</h3>
       <p style="margin:0 0 8px;color:#111827">${esc(ai.summary)}</p>` +
      ((ai.suggestions || []).slice(0, 3).map((s) =>
        `<div style="margin:4px 0;color:#111827">• ${esc(s.action)}${s.estSaving ? ` <span style="color:#10b981">(~${vnd(s.estSaving)})</span>` : ""}</div>`).join(""))
    : "";
  return `
  <div style="max-width:560px;margin:0 auto;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:#ffffff;color:#111827;padding:20px">
    <h2 style="font-size:18px;margin:0 0 2px">📊 Báo cáo tháng ${esc(m.period)}</h2>
    <div style="color:#6b7280;font-size:13px;margin-bottom:16px">Hộ ${esc(hhName)} · đã chốt sổ trong BudgetManager</div>
    <table role="presentation" width="100%" cellspacing="6" cellpadding="0"><tr>
      ${cell("Thu vào", vnd(m.income), pctDelta(m.income, prev.income))}
      ${cell("Chi ra", vnd(m.expense), pctDelta(m.expense, prev.expense))}
    </tr><tr>
      ${cell("Chênh lệch", vnd(m.net))}
      ${cell("Tỷ lệ tiết kiệm", (m.savingsRate || 0) + "%")}
    </tr></table>
    ${m.avg3m ? `<div style="color:#6b7280;font-size:13px;margin:8px 0 0">Trung bình chi 3 tháng trước: <b style="color:#111827">${vnd(m.avg3m)}</b></div>` : ""}
    ${catRows ? `<h3 style="font-size:14px;margin:22px 0 6px">Chi theo danh mục (top 5)</h3><table role="presentation" width="100%" cellspacing="0" cellpadding="0">${catRows}</table>` : ""}
    ${incRows ? `<h3 style="font-size:14px;margin:22px 0 6px">Thu theo danh mục</h3><table role="presentation" width="100%" cellspacing="0" cellpadding="0">${incRows}</table>` : ""}
    ${budgetRows ? `<h3 style="font-size:14px;margin:22px 0 6px">⚠️ Ngân sách cần chú ý</h3><table role="presentation" width="100%" cellspacing="0" cellpadding="0">${budgetRows}</table>` : ""}
    ${moverRows ? `<h3 style="font-size:14px;margin:22px 0 6px">Biến động lớn nhất so tháng trước</h3><ul style="margin:0;padding-left:18px">${moverRows}</ul>` : ""}
    ${aiBlock}
    <div style="margin-top:26px;padding-top:14px;border-top:1px solid #e5e7eb;color:#6b7280;font-size:12px">
      ${appUrl ? `<a href="${esc(appUrl)}" style="color:#6366f1">Mở BudgetManager</a> · ` : ""}Bạn nhận email này vì hộ ${esc(hhName)} bật "Báo cáo email hàng tháng" — owner/admin có thể tắt trong Cài đặt.
    </div>
  </div>`;
}

function reportText(hhName: string, m: Metrics): string {
  const lines = [
    `Bao cao thang ${m.period} — Ho ${hhName}`,
    `Thu vao: ${vnd(m.income)} | Chi ra: ${vnd(m.expense)} | Chenh lech: ${vnd(m.net)} | Tiet kiem: ${m.savingsRate || 0}%`,
  ];
  (m.categories || []).slice(0, 5).forEach((c) => lines.push(`- ${c.category}: ${vnd(c.amount)} (${c.pct}%)`));
  (m.incomeCategories || []).slice(0, 5).forEach((c) => lines.push(`+ ${c.category}: ${vnd(c.amount)} (${c.pct}%)`));
  return lines.join("\n");
}

function reminderHtml(hhName: string, period: string, appUrl: string): string {
  return `
  <div style="max-width:560px;margin:0 auto;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#111827;padding:20px">
    <h2 style="font-size:18px;margin:0 0 10px">🔔 Tháng ${esc(period)} chưa được chốt sổ</h2>
    <p style="margin:0 0 12px">Hộ <b>${esc(hhName)}</b> đã bật báo cáo email hàng tháng, nhưng tháng ${esc(period)} chưa được chốt sổ nên chưa có gì để gửi.</p>
    <p style="margin:0 0 12px">Mở BudgetManager → <b>Báo cáo</b> → <b>Chốt sổ tháng</b>. Báo cáo sẽ tự gửi cho cả hộ sau khi chốt.</p>
    ${appUrl ? `<a href="${esc(appUrl)}" style="color:#6366f1">Mở BudgetManager</a>` : ""}
  </div>`;
}

// ---------------------------------------------------------------------
// Resend
// ---------------------------------------------------------------------
async function sendEmail(to: string[], subject: string, html: string, text: string) {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) throw new Error("RESEND_API_KEY not set");
  const from = Deno.env.get("MAIL_FROM") || "BudgetManager <onboarding@resend.dev>";
  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer " + key },
    body: JSON.stringify({ from, to, subject, html, text }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!resp.ok) throw new Error("Resend " + resp.status + ": " + await resp.text());
}

// ---------------------------------------------------------------------
// Data access (service role)
// ---------------------------------------------------------------------
function serviceClient() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

async function memberEmails(supa: ReturnType<typeof serviceClient>, householdId: string, roles?: string[]) {
  const { data: members, error } = await supa.from("household_members")
    .select("user_id, role").eq("household_id", householdId);
  if (error) throw new Error(error.message);
  const wanted = (members || []).filter((m) => !roles || roles.includes(m.role));
  const emails: string[] = [];
  for (const m of wanted) {
    const { data } = await supa.auth.admin.getUserById(m.user_id);
    const email = data?.user?.email;
    if (email) emails.push(email);
  }
  return emails;
}

Deno.serve(async (req) => {
  const headers = { "Content-Type": "application/json" };
  const appUrl = Deno.env.get("APP_URL") || "";
  const supa = serviceClient();

  // ---- auth: cron secret, else user JWT (test send) ----
  const cronSecret = Deno.env.get("CRON_SECRET") || "";
  const isCron = !!cronSecret && req.headers.get("x-cron-secret") === cronSecret;

  if (!isCron) {
    // Test send: verify the caller and their role, mail only the caller.
    let body: { test?: boolean; householdId?: string } = {};
    try { body = await req.json(); } catch (_e) { /* empty body */ }
    if (!body.test || !body.householdId) {
      return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), { status: 401, headers });
    }
    const authed = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization") || "" } } },
    );
    const { data: userData } = await authed.auth.getUser();
    const user = userData?.user;
    if (!user || !user.email) {
      return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), { status: 401, headers });
    }
    const { data: mem } = await supa.from("household_members")
      .select("role").eq("household_id", body.householdId).eq("user_id", user.id).limit(1);
    const role = mem && mem[0] ? mem[0].role : null;
    if (role !== "owner" && role !== "admin") {
      return new Response(JSON.stringify({ ok: false, error: "forbidden" }), { status: 403, headers });
    }
    const { data: rows } = await supa.from("monthly_reports")
      .select("period, metrics, ai_review").eq("household_id", body.householdId)
      .order("period", { ascending: false }).limit(1);
    if (!rows || !rows.length) {
      return new Response(JSON.stringify({ ok: false, error: "no_snapshot" }), { status: 404, headers });
    }
    const { data: hh } = await supa.from("households").select("name").eq("id", body.householdId).single();
    const hhName = hh?.name || "BudgetManager";
    const r = rows[0];
    try {
      await sendEmail(
        [user.email],
        `📊 BudgetManager — Báo cáo tháng ${r.period} · ${hhName} (gửi thử)`,
        reportHtml(hhName, r.metrics as Metrics, r.ai_review as AiReview, appUrl),
        reportText(hhName, r.metrics as Metrics),
      );
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), { status: 502, headers });
    }
    return new Response(JSON.stringify({ ok: true, sentTo: [user.email], period: r.period }), { headers });
  }

  // ---- cron mode: daily sweep over opted-in households ----
  const { y, m, d } = vnToday();
  const period = prevPeriod(y, m);
  const { data: allSettings, error: setErr } = await supa.from("household_settings").select("household_id, settings");
  if (setErr) {
    return new Response(JSON.stringify({ ok: false, error: setErr.message }), { status: 500, headers });
  }
  const enabled = (allSettings || []).filter((r) => r.settings?.EMAIL_REPORT?.enabled === true);

  let sent = 0, reminded = 0, skipped = 0;
  const errors: string[] = [];
  for (const row of enabled) {
    const hid = row.household_id as string;
    try {
      let sendDay = Math.round(Number(row.settings?.EMAIL_REPORT?.sendDay)) || DEFAULT_SEND_DAY;
      sendDay = Math.min(28, Math.max(1, sendDay));
      if (d < sendDay) { skipped++; continue; }

      const { data: reps } = await supa.from("monthly_reports")
        .select("id, period, metrics, ai_review, email_sent_at")
        .eq("household_id", hid).eq("period", period).limit(1);
      const rep = reps && reps[0];

      if (rep && !rep.email_sent_at) {
        const { data: hh } = await supa.from("households").select("name").eq("id", hid).single();
        const hhName = hh?.name || "BudgetManager";
        const to = await memberEmails(supa, hid);
        if (!to.length) { skipped++; continue; }
        await sendEmail(
          to,
          `📊 BudgetManager — Báo cáo tháng ${period} · ${hhName}`,
          reportHtml(hhName, rep.metrics as Metrics, rep.ai_review as AiReview, appUrl),
          reportText(hhName, rep.metrics as Metrics),
        );
        // Stamp only after Resend accepted — a re-run after a failure retries.
        await supa.from("monthly_reports").update({ email_sent_at: new Date().toISOString() }).eq("id", rep.id);
        sent++;
      } else if (!rep && d === sendDay) {
        const { data: hh } = await supa.from("households").select("name").eq("id", hid).single();
        const hhName = hh?.name || "BudgetManager";
        const to = await memberEmails(supa, hid, ["owner", "admin"]);
        if (!to.length) { skipped++; continue; }
        await sendEmail(
          to,
          `🔔 BudgetManager — Tháng ${period} chưa chốt sổ · ${hhName}`,
          reminderHtml(hhName, period, appUrl),
          `Thang ${period} chua duoc chot so. Mo BudgetManager de chot — bao cao se tu gui sau khi chot.`,
        );
        reminded++;
      } else {
        skipped++;
      }
    } catch (e) {
      errors.push(hid + ": " + (e as Error).message);
    }
  }
  return new Response(JSON.stringify({ ok: true, period, sent, reminded, skipped, errors }), { headers });
});
