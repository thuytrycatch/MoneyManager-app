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
    'QUAN TRỌNG: input có thể viết KHÔNG DẤU (telex/gõ nhanh). Hãy tự suy ra nghĩa có dấu rồi phân loại. Ví dụ: "an sang"=ăn sáng→Ăn uống, "an trua"=ăn trưa→Ăn uống, "ca phe"=cà phê→Ăn uống, "do xang"/"xang xe"=đổ xăng→Di chuyển, "tien dien"=tiền điện→Hóa đơn, "luong"=lương→Thu nhập, "mua sam"=mua sắm→Mua sắm.\n' +
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

  // VND integer from a number OR a formatted string ("1.234.000", "185,000", "12.000đ").
  // Number("1.234.000") is NaN and Number("185.000") is 185 — both wrong — so strip to digits.
  function toIntAmount(v) {
    if (typeof v === 'number' && isFinite(v)) return Math.round(v);
    const digits = String(v == null ? '' : v).replace(/[^\d]/g, '');
    return digits ? parseInt(digits, 10) : 0;
  }

  // Normalize a model's raw JSON into the app's transaction shape (shared by Claude & Gemini).
  function normalizeParsed(parsed, raw) {
    const amount = toIntAmount(parsed.amount);
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
    const model = 'gemini-2.5-flash';
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
   *  Receipt OCR — extract one transaction from a photo of a receipt.
   *  Reuses the same browser-direct API calls as the text parser, but with an
   *  image content block. Returns the normalized {amount,type,category,note,date}.
   * --------------------------------------------------------------- */
  const OCR_PROMPT =
    'Đây là ảnh hoá đơn / biên lai. Trích ra MỘT giao dịch, trả về JSON:\n' +
    '{"total": number, "tendered": number|null, "change": number|null, "subtotal": number|null, "tax": number|null, ' +
    '"type": "expense"|"income", "category": string, "note": string, "date": string|null}.\n' +
    'Mọi số là SỐ NGUYÊN VND, KHÔNG dấu phân cách (vd 185000, không phải "185.000").\n' +
    '- total: SỐ TIỀN THỰC PHẢI TRẢ (THÀNH TIỀN / TỔNG CỘNG / TỔNG THANH TOÁN / KHÁCH PHẢI TRẢ). Đây là số tiền giao dịch.\n' +
    '- tendered: TỔNG TIỀN KHÁCH ĐƯA/GỬI (TIỀN KHÁCH ĐƯA / TIỀN MẶT / KHÁCH TRẢ); không có thì null.\n' +
    '- change: TIỀN THỐI LẠI (TIỀN THỐI / TRẢ LẠI / THỪA); không có thì null.\n' +
    '- subtotal: TẠM TÍNH; tax: THUẾ/VAT; không có thì null.\n' +
    'QUAN TRỌNG: total là số PHẢI TRẢ, TUYỆT ĐỐI không nhầm với tendered (tiền khách đưa). ' +
    'Nếu không thấy dòng tổng nhưng có tendered và change thì total = tendered − change.\n' +
    '- type: "expense" cho hoá đơn mua hàng/dịch vụ (mặc định); "income" chỉ khi rõ là phiếu thu/nhận tiền.\n' +
    '- category: một trong [Ăn uống, Di chuyển, Mua sắm, Giải trí, Sức khỏe, Hóa đơn, Thu nhập, Khác] — suy từ tên cửa hàng/mặt hàng.\n' +
    '- note: tên cửa hàng hoặc mô tả ngắn (tiếng Việt).\n' +
    '- date: ngày trên hoá đơn dạng "YYYY-MM-DD"; không thấy thì null.\n' +
    'Chỉ trả về JSON, không giải thích.';

  // Gemini structured-output schema → guarantees valid JSON + correct types (faster, no parse retry).
  const OCR_SCHEMA = {
    type: 'OBJECT',
    properties: {
      total: { type: 'INTEGER' },
      tendered: { type: 'INTEGER', nullable: true },
      change: { type: 'INTEGER', nullable: true },
      subtotal: { type: 'INTEGER', nullable: true },
      tax: { type: 'INTEGER', nullable: true },
      type: { type: 'STRING', enum: ['expense', 'income'] },
      category: { type: 'STRING' },
      note: { type: 'STRING' },
      date: { type: 'STRING', nullable: true },
    },
    required: ['total', 'type', 'category', 'note'],
  };

  // Turn the rich receipt JSON into the app shape. Picks the amount actually PAYABLE
  // (total), never the amount tendered; cross-checks against tendered − change.
  function normalizeReceipt(parsed) {
    parsed = parsed || {};
    const total = toIntAmount(parsed.total != null ? parsed.total : parsed.amount); // tolerate older {amount}
    const tendered = parsed.tendered != null ? toIntAmount(parsed.tendered) : 0;
    const change = parsed.change != null ? toIntAmount(parsed.change) : 0;
    const subtotal = parsed.subtotal != null ? toIntAmount(parsed.subtotal) : 0;
    const tax = parsed.tax != null ? toIntAmount(parsed.tax) : 0;
    const derived = (tendered > 0 && change >= 0 && tendered - change > 0) ? tendered - change : 0;
    let amount = total, lowConfidence = false;
    if (amount <= 0 && derived > 0) amount = derived;                 // no total line → derive
    else if (amount > 0 && derived > 0 && Math.abs(derived - amount) > 1000) lowConfidence = true; // mismatch
    const type = parsed.type === 'income' ? 'income' : 'expense';
    let category = String(parsed.category || '').trim();
    if (!CATEGORIES.includes(category)) category = type === 'income' ? 'Thu nhập' : 'Khác';
    const note = String(parsed.note || '').trim();
    const date = normDate(parsed.date);
    return { amount, type, category, note, date,
      candidates: { total, tendered, change, subtotal, tax }, lowConfidence };
  }

  // Read a Blob/File as a bare base64 string (strips the "data:...;base64," prefix).
  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => { const s = String(r.result || ''); resolve(s.slice(s.indexOf(',') + 1)); };
      r.onerror = () => reject(r.error || new Error('Không đọc được ảnh'));
      r.readAsDataURL(blob);
    });
  }

  async function parseImageWithClaude(blob, apiKey) {
    const b64 = await blobToBase64(blob);
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 384,
        system: 'Hôm nay là ' + ymdOf(new Date()) + '.',
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: blob.type || 'image/jpeg', data: b64 } },
          { type: 'text', text: OCR_PROMPT },
        ] }],
      }),
    });
    if (!resp.ok) { const e = await resp.text().catch(() => ''); throw new Error('Claude API ' + resp.status + ': ' + e); }
    const data = await resp.json();
    const textBlock = (data.content || []).find((b) => b.type === 'text');
    return normalizeReceipt(extractJson(textBlock ? textBlock.text : '', 'Claude'));
  }

  async function parseImageWithGemini(blob, apiKey) {
    const b64 = await blobToBase64(blob);
    const model = 'gemini-2.5-flash';
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + encodeURIComponent(apiKey);
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: 'Hôm nay là ' + ymdOf(new Date()) + '.' }] },
        contents: [{ role: 'user', parts: [
          { inline_data: { mime_type: blob.type || 'image/jpeg', data: b64 } },
          { text: OCR_PROMPT },
        ] }],
        generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema: OCR_SCHEMA },
      }),
    });
    if (!resp.ok) { const e = await resp.text().catch(() => ''); throw new Error('Gemini API ' + resp.status + ': ' + e); }
    const data = await resp.json();
    const cand = (data.candidates || [])[0];
    const parts = cand && cand.content && cand.content.parts ? cand.content.parts : [];
    return normalizeReceipt(extractJson(parts.map((p) => p.text || '').join(''), 'Gemini'));
  }

  // True when a vision-capable API key is configured (Gemini or Claude).
  function imageOcrAvailable() {
    const cfg = window.CONFIG || {};
    return !!(cfg.GEMINI_API_KEY || cfg.ANTHROPIC_API_KEY);
  }

  // Extract a transaction draft from a receipt image. Gemini → Claude (no regex
  // fallback — there's no text to fall back on). Throws if no key or all fail.
  async function parseImageReceipt(blob) {
    const cfg = window.CONFIG || {};
    let lastErr = null;
    if (cfg.GEMINI_API_KEY) {
      try { return { ...(await parseImageWithGemini(blob, cfg.GEMINI_API_KEY)), source: 'gemini' }; }
      catch (err) { lastErr = err; console.warn('Gemini OCR lỗi, thử cách khác:', err.message); }
    }
    if (cfg.ANTHROPIC_API_KEY) {
      try { return { ...(await parseImageWithClaude(blob, cfg.ANTHROPIC_API_KEY)), source: 'claude' }; }
      catch (err) { lastErr = err; console.warn('Claude OCR lỗi:', err.message); }
    }
    throw lastErr || new Error('Chưa cấu hình API key để quét hoá đơn');
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

  /* ---------------------------------------------------------------
   *  Multi-entry: split one input into several entries, parse each.
   * --------------------------------------------------------------- */
  // Split on newlines/semicolons always; split on a comma ONLY when it is not
  // inside a number (so "35.000"/"35,000" stays intact but "35k, lương" splits).
  function splitEntries(raw) {
    return String(raw || '')
      .split(/[\n;]+/)
      .reduce((acc, seg) => acc.concat(seg.split(/,\s*(?=\D)/)), [])
      .map((s) => s.trim())
      .filter(Boolean);
  }

  // Parse a (possibly multi-item) input into an array of transaction drafts.
  // Each item carries its own rawInput so the UI can show/confirm it.
  const MAX_ENTRIES = 20; // safety cap: avoid a runaway batch from a huge paste
  async function parseMany(raw) {
    const parts = splitEntries(raw);
    if (parts.length <= 1) {
      const one = await parseTransaction(raw);
      return [{ ...one, rawInput: raw.trim() }];
    }
    const capped = parts.slice(0, MAX_ENTRIES);
    return Promise.all(capped.map(async (p) => {
      try { return { ...(await parseTransaction(p)), rawInput: p }; }
      catch (e) { return { ...parseWithRegex(p), source: 'regex', rawInput: p }; }
    }));
  }

  /* ---------------------------------------------------------------
   *  Monthly close AI review — takes AGGREGATED figures (never raw
   *  transactions), returns {summary, observations[], suggestions[]}.
   *  Grounding rules live in REVIEW_SYSTEM; JSON is guaranteed by the
   *  Gemini responseSchema (Claude falls back to extractJson).
   * --------------------------------------------------------------- */
  const REVIEW_SYSTEM =
    'Bạn là trợ lý tài chính gia đình, nói tiếng Việt, thân thiện và thực tế.\n' +
    'Bạn nhận SỐ LIỆU ĐÃ TỔNG HỢP của một tháng (đơn vị VND). Nhiệm vụ: diễn giải + đề xuất.\n' +
    'TUYỆT ĐỐI KHÔNG tự tính lại hay bịa thêm con số/danh mục nào ngoài dữ liệu được cấp.\n' +
    'KHÔNG phán xét ("lãng phí"). Gọi các khoản có thể giảm là "khoản linh hoạt có thể cân nhắc".\n' +
    'observations: 2–4 nhận xét NGẮN, cụ thể, gắn với số liệu thật (vd "chi Ăn uống +18% so tháng trước").\n' +
    'suggestions: 2–3 hành động KHẢ THI, ưu tiên rõ; estSaving là số nguyên VND ước tính (có thể null nếu không chắc).\n' +
    'Ngắn gọn, không sáo rỗng. Chỉ trả về JSON đúng schema.';

  const REVIEW_SCHEMA = {
    type: 'OBJECT',
    properties: {
      summary: { type: 'STRING' },
      observations: { type: 'ARRAY', items: { type: 'STRING' } },
      suggestions: { type: 'ARRAY', items: {
        type: 'OBJECT',
        properties: {
          action: { type: 'STRING' },
          category: { type: 'STRING', nullable: true },
          estSaving: { type: 'INTEGER', nullable: true },
          priority: { type: 'STRING', enum: ['high', 'medium', 'low'] },
        },
        required: ['action', 'priority'],
      } },
    },
    required: ['summary', 'observations', 'suggestions'],
  };

  function normalizeReview(parsed) {
    parsed = parsed || {};
    const obs = Array.isArray(parsed.observations) ? parsed.observations.map((x) => String(x).trim()).filter(Boolean).slice(0, 4) : [];
    const sug = Array.isArray(parsed.suggestions) ? parsed.suggestions.slice(0, 3).map((s) => ({
      action: String((s && s.action) || '').trim(),
      category: s && s.category ? String(s.category) : null,
      estSaving: s && s.estSaving != null ? toIntAmount(s.estSaving) : null,
      priority: s && ['high', 'medium', 'low'].includes(s.priority) ? s.priority : 'medium',
    })).filter((s) => s.action) : [];
    return { summary: String(parsed.summary || '').trim(), observations: obs, suggestions: sug };
  }

  async function reviewMonthGemini(summary, apiKey) {
    const model = 'gemini-2.5-flash';
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + encodeURIComponent(apiKey);
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: REVIEW_SYSTEM }] },
        contents: [{ role: 'user', parts: [{ text: 'SỐ LIỆU THÁNG (VND):\n' + JSON.stringify(summary) }] }],
        generationConfig: { temperature: 0.2, responseMimeType: 'application/json', responseSchema: REVIEW_SCHEMA },
      }),
    });
    if (!resp.ok) { const e = await resp.text().catch(() => ''); throw new Error('Gemini API ' + resp.status + ': ' + e); }
    const data = await resp.json();
    const cand = (data.candidates || [])[0];
    const parts = cand && cand.content && cand.content.parts ? cand.content.parts : [];
    return normalizeReview(extractJson(parts.map((p) => p.text || '').join(''), 'Gemini'));
  }

  async function reviewMonthClaude(summary, apiKey) {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json', 'x-api-key': apiKey,
        'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5', max_tokens: 700, system: REVIEW_SYSTEM,
        messages: [{ role: 'user', content: 'SỐ LIỆU THÁNG (VND):\n' + JSON.stringify(summary) + '\nChỉ trả về JSON.' }],
      }),
    });
    if (!resp.ok) { const e = await resp.text().catch(() => ''); throw new Error('Claude API ' + resp.status + ': ' + e); }
    const data = await resp.json();
    const tb = (data.content || []).find((b) => b.type === 'text');
    return normalizeReview(extractJson(tb ? tb.text : '', 'Claude'));
  }

  // True when any AI key is configured (Gemini or Claude).
  function aiReviewAvailable() {
    const cfg = window.CONFIG || {};
    return !!(cfg.GEMINI_API_KEY || cfg.ANTHROPIC_API_KEY);
  }

  // Gemini (free) → Claude. Throws if no key or all fail (UI shows a toast).
  async function reviewMonth(summary) {
    const cfg = window.CONFIG || {};
    let lastErr = null;
    if (cfg.GEMINI_API_KEY) {
      try { return await reviewMonthGemini(summary, cfg.GEMINI_API_KEY); }
      catch (err) { lastErr = err; console.warn('Gemini review lỗi, thử cách khác:', err.message); }
    }
    if (cfg.ANTHROPIC_API_KEY) {
      try { return await reviewMonthClaude(summary, cfg.ANTHROPIC_API_KEY); }
      catch (err) { lastErr = err; console.warn('Claude review lỗi:', err.message); }
    }
    throw lastErr || new Error('Chưa cấu hình API key để tạo nhận xét');
  }

  // Export to global
  window.Parser = {
    parseTransaction,
    parseWithRegex,
    parseAmount,
    parseDate,
    splitEntries,
    parseMany,
    parseImageReceipt,
    imageOcrAvailable,
    reviewMonth,
    aiReviewAvailable,
    MAX_ENTRIES,
    CATEGORIES,
  };
})();
