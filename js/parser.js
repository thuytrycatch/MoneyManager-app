/* =====================================================================
 *  parser.js — Parse Vietnamese input sentences into transactions
 * ---------------------------------------------------------------------
 *  - Prefers the Claude API (model claude-haiku-4-5) when an API key is set.
 *  - If there is no key or the call fails → fall back to plain regex.
 *  The result always has the shape:
 *    { amount: number, type: 'expense'|'income', category: string, note: string }
 * ===================================================================== */

(function () {
  'use strict';

  const CATEGORIES = [
    'Ăn uống', 'Di chuyển', 'Mua sắm', 'Giải trí',
    'Sức khỏe', 'Hóa đơn', 'Thu nhập', 'Khác',
  ];

  // Hint keywords for the regex fallback
  const KEYWORDS = {
    'Ăn uống': ['ăn', 'uống', 'cơm', 'phở', 'cafe', 'cà phê', 'trà', 'bún', 'bánh', 'nhậu', 'beer', 'bia', 'lẩu', 'gà', 'pizza', 'trà sữa'],
    'Di chuyển': ['xăng', 'xe', 'grab', 'taxi', 'bus', 'xe ôm', 'parking', 'đỗ xe', 'gửi xe', 'vé', 'tàu', 'máy bay'],
    'Mua sắm': ['mua', 'shop', 'quần áo', 'giày', 'túi', 'điện thoại', 'laptop', 'đồ', 'shopee', 'lazada', 'tiki'],
    'Giải trí': ['phim', 'game', 'du lịch', 'karaoke', 'gym', 'spa', 'massage', 'chơi', 'concert', 'vé xem'],
    'Sức khỏe': ['thuốc', 'bệnh viện', 'khám', 'bác sĩ', 'pharmacy', 'nhà thuốc', 'viện'],
    'Hóa đơn': ['điện', 'nước', 'internet', 'wifi', 'tiền nhà', 'thuê', 'hóa đơn', 'cước', 'điện thoại tháng'],
    'Thu nhập': ['lương', 'thưởng', 'thu', 'nhận', 'chuyển khoản vào', 'bán', 'lãi', 'hoàn tiền'],
  };

  const INCOME_HINTS = ['lương', 'thưởng', 'thu nhập', 'nhận', 'được', 'bán', 'lãi', 'hoàn tiền', 'chuyển khoản vào'];

  const SYSTEM_PROMPT =
    'Bạn là assistant parse chi tiêu tài chính từ văn bản tiếng Việt.\n' +
    'Trả về JSON với format: {"amount": number, "type": "expense"|"income", "category": string, "note": string, "date": string|null}\n' +
    '- amount: số tiền (số nguyên, đơn vị VND)\n' +
    '- type: "income" nếu là thu nhập, "expense" nếu là chi tiêu\n' +
    '- category: một trong [Ăn uống, Di chuyển, Mua sắm, Giải trí, Sức khỏe, Hóa đơn, Thu nhập, Khác]\n' +
    '- note: mô tả ngắn gọn bằng tiếng Việt (không chứa cụm chỉ ngày)\n' +
    '- date: ngày giao dịch dạng "YYYY-MM-DD" nếu câu có nhắc ngày ("hôm qua", "hôm kia", "20/6"…); nếu không nhắc ngày thì để null\n' +
    'Quy đổi tiền: k/nghìn/ngàn = nghìn, tr/triệu/củ = triệu, "rưỡi" = thêm một nửa đơn vị (vd "2 triệu rưỡi" = 2500000, "1tr2" = 1200000).\n' +
    'Chỉ trả về JSON, không giải thích thêm.';

  // Validate a "YYYY-MM-DD" string; return it normalized or null.
  function normDate(v) {
    if (!v || typeof v !== 'string') return null;
    const m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (!m) return null;
    const mon = parseInt(m[2], 10), day = parseInt(m[3], 10);
    if (mon < 1 || mon > 12 || day < 1 || day > 31) return null;
    return m[1] + '-' + String(mon).padStart(2, '0') + '-' + String(day).padStart(2, '0');
  }

  /* ---------------------------------------------------------------
   *  Amount parser (used for the fallback)
   * --------------------------------------------------------------- */
  function parseAmount(raw) {
    let text = ' ' + raw.toLowerCase() + ' ';

    // "X triệu rưỡi" / "X tr rưỡi" (X and a half million) → X.5 million
    text = text.replace(/(\d+(?:[.,]\d+)?)\s*(tr(?:iệu)?|củ)\s*rưỡi/g, (_, n) => {
      return (parseFloat(n.replace(',', '.')) + 0.5) + 'tr';
    });
    // "X nghìn rưỡi" → X.5 thousand (rare) — skipped, uncommon

    // "XtrY" or "X triệu Y" (Y is the hundred-thousands digit): 1tr2 = 1.2tr, 1 triệu 5 = 1.5tr
    text = text.replace(/(\d+)\s*(tr(?:iệu)?|củ)\s*(\d)\b/g, (_, a, _u, b) => {
      return (parseFloat(a) + parseFloat(b) / 10) + 'tr';
    });

    // million (triệu/tr/củ)
    let m = text.match(/(\d+(?:[.,]\d+)?)\s*(tr(?:iệu)?|củ)\b/);
    if (m) return Math.round(parseFloat(m[1].replace(',', '.')) * 1000000);

    // thousand (nghìn/ngàn/k)
    m = text.match(/(\d+(?:[.,]\d+)?)\s*(nghìn|ngàn|k)\b/);
    if (m) return Math.round(parseFloat(m[1].replace(',', '.')) * 1000);

    // number with thousands separators: 35.000 / 35,000 / 1.200.000
    m = text.match(/(\d{1,3}(?:[.,]\d{3})+)/);
    if (m) return parseInt(m[1].replace(/[.,]/g, ''), 10);

    // bare number (e.g. "50000")
    m = text.match(/(\d+)/);
    if (m) return parseInt(m[1], 10);

    return 0;
  }

  // Keyword matching: multi-word phrase → substring match; single word → whole-word match
  // (avoids "ăn" leaking into "xăng", or "thu" leaking into "thuốc"/"thuê").
  function tokenize(text) {
    return text.toLowerCase().split(/[\s,.;:!?()/-]+/).filter(Boolean);
  }
  function hasKeyword(text, tokens, kw) {
    return kw.includes(' ') ? text.includes(kw) : tokens.includes(kw);
  }

  function detectCategory(text, type) {
    if (type === 'income') return 'Thu nhập';
    const t = text.toLowerCase();
    const tokens = tokenize(t);
    for (const cat of Object.keys(KEYWORDS)) {
      if (cat === 'Thu nhập') continue;
      if (KEYWORDS[cat].some((kw) => hasKeyword(t, tokens, kw))) return cat;
    }
    return 'Khác';
  }

  function detectType(text) {
    const t = text.toLowerCase();
    const tokens = tokenize(t);
    return INCOME_HINTS.some((kw) => hasKeyword(t, tokens, kw)) ? 'income' : 'expense';
  }

  function cleanNote(raw) {
    // Strip the amount and unit to get a concise note
    let note = raw
      .replace(/(\d+(?:[.,]\d+)?)\s*(tr(?:iệu)?|củ|nghìn|ngàn|k)\s*(\d)?\s*(rưỡi)?/gi, '')
      .replace(/\d{1,3}([.,]\d{3})+/g, '')
      .replace(/\d+/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    return note || raw.trim();
  }

  /* ---------------------------------------------------------------
   *  Date parser — detect a transaction date inside the sentence
   *  ("hôm qua", "hôm kia", "20/6", "20/6/2025"). Returns the date as
   *  YYYY-MM-DD (or null) plus the sentence with the date phrase removed.
   *  Only "/" and "-" are treated as date separators so amounts written
   *  in Vietnamese style ("35.000", "1.200.000") are never mistaken for dates.
   * --------------------------------------------------------------- */
  function ymdOf(d) {
    const p = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }
  function parseDate(raw) {
    const now = new Date();
    const lower = ' ' + raw.toLowerCase() + ' ';
    let date = null;
    let cleaned = raw;

    if (/\bhôm nay\b/.test(lower)) {
      date = ymdOf(now);
      cleaned = raw.replace(/hôm nay/gi, '');
    } else if (/\bhôm qua\b/.test(lower)) {
      const d = new Date(now); d.setDate(d.getDate() - 1);
      date = ymdOf(d); cleaned = raw.replace(/hôm qua/gi, '');
    } else if (/\bhôm kia\b/.test(lower)) {
      const d = new Date(now); d.setDate(d.getDate() - 2);
      date = ymdOf(d); cleaned = raw.replace(/hôm kia/gi, '');
    } else {
      // "ngày 20", "20/6", "20/6/2025", "20-6" (slash/dash only — avoids money like 35.000)
      const m = raw.match(/(?:ngày\s+)?\b(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{2,4}))?\b/i);
      if (m) {
        const day = parseInt(m[1], 10);
        const mon = parseInt(m[2], 10) - 1;
        let yr = m[3] ? parseInt(m[3], 10) : now.getFullYear();
        if (yr < 100) yr += 2000;
        if (day >= 1 && day <= 31 && mon >= 0 && mon <= 11) {
          date = ymdOf(new Date(yr, mon, day));
          cleaned = raw.replace(m[0], '');
        }
      }
    }
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    return { date, cleaned };
  }

  function parseWithRegex(raw) {
    const { date, cleaned } = parseDate(raw);
    const base = cleaned || raw;
    const type = detectType(base);
    const amount = parseAmount(base);
    const category = detectCategory(base, type);
    const note = cleanNote(base);
    return { amount, type, category, note, date };
  }

  // Normalize a model's raw JSON into the app's transaction shape (shared by Claude & Gemini).
  function normalizeParsed(parsed, raw) {
    const amount = Math.round(Number(parsed.amount) || 0);
    const type = parsed.type === 'income' ? 'income' : 'expense';
    let category = String(parsed.category || '').trim();
    if (!CATEGORIES.includes(category)) category = type === 'income' ? 'Thu nhập' : 'Khác';
    const note = String(parsed.note || raw).trim();
    const date = normDate(parsed.date);
    return { amount, type, category, note, date };
  }

  // Pull the first JSON object out of a model's text reply (handles ```json fences etc.).
  function extractJson(text, who) {
    const m = (text || '').match(/\{[\s\S]*\}/);
    if (!m) throw new Error('Không tìm thấy JSON trong phản hồi ' + who);
    return JSON.parse(m[0]);
  }

  /* ---------------------------------------------------------------
   *  Call the Claude API (runs directly from the browser)
   * --------------------------------------------------------------- */
  async function parseWithClaude(raw, apiKey) {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        // Required when calling the API directly from the browser (bypasses the CORS block)
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 256,
        system: SYSTEM_PROMPT + '\nHôm nay là ' + ymdOf(new Date()) + '.',
        messages: [{ role: 'user', content: raw }],
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      throw new Error('Claude API ' + resp.status + ': ' + errText);
    }

    const data = await resp.json();
    const textBlock = (data.content || []).find((b) => b.type === 'text');
    const text = textBlock ? textBlock.text : '';
    return normalizeParsed(extractJson(text, 'Claude'), raw);
  }

  /* ---------------------------------------------------------------
   *  Call the Google Gemini API (free tier; runs directly from the browser).
   *  Get a key at https://aistudio.google.com/app/apikey
   * --------------------------------------------------------------- */
  async function parseWithGemini(raw, apiKey) {
    const model = 'gemini-2.0-flash';
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + encodeURIComponent(apiKey);
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_PROMPT + '\nHôm nay là ' + ymdOf(new Date()) + '.' }] },
        contents: [{ role: 'user', parts: [{ text: raw }] }],
        // Force temperature 0 + JSON output so categorization is deterministic and easy to parse.
        generationConfig: { temperature: 0, responseMimeType: 'application/json' },
      }),
    });
    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      throw new Error('Gemini API ' + resp.status + ': ' + errText);
    }
    const data = await resp.json();
    const cand = (data.candidates || [])[0];
    const parts = cand && cand.content && cand.content.parts ? cand.content.parts : [];
    const text = parts.map((p) => p.text || '').join('');
    return normalizeParsed(extractJson(text, 'Gemini'), raw);
  }

  /* ---------------------------------------------------------------
   *  Main function: automatically picks Claude or regex
   * --------------------------------------------------------------- */
  async function parseTransaction(raw) {
    const cfg = window.CONFIG || {};
    // Rescue the amount with the offline regex if the model misses it.
    const withRescue = (result, source) => {
      if (!result.amount) { const fb = parseWithRegex(raw); if (fb.amount) result.amount = fb.amount; }
      return { ...result, source: source };
    };
    // Priority: Gemini (free tier) → Claude → offline regex. Each falls through on error.
    if (cfg.GEMINI_API_KEY) {
      try { return withRescue(await parseWithGemini(raw, cfg.GEMINI_API_KEY), 'gemini'); }
      catch (err) { console.warn('Gemini lỗi, thử cách khác:', err.message); }
    }
    if (cfg.ANTHROPIC_API_KEY) {
      try { return withRescue(await parseWithClaude(raw, cfg.ANTHROPIC_API_KEY), 'claude'); }
      catch (err) { console.warn('Claude lỗi, dùng regex:', err.message); }
    }
    return { ...parseWithRegex(raw), source: 'regex' };
  }

  // Export to global
  window.Parser = {
    parseTransaction,
    parseWithRegex,
    parseAmount,
    parseDate,
    CATEGORIES,
  };
})();
