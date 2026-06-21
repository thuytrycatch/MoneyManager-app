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
    'Trả về JSON với format: {"amount": number, "type": "expense"|"income", "category": string, "note": string}\n' +
    '- amount: số tiền (số nguyên, đơn vị VND)\n' +
    '- type: "income" nếu là thu nhập, "expense" nếu là chi tiêu\n' +
    '- category: một trong [Ăn uống, Di chuyển, Mua sắm, Giải trí, Sức khỏe, Hóa đơn, Thu nhập, Khác]\n' +
    '- note: mô tả ngắn gọn bằng tiếng Việt\n' +
    'Quy đổi tiền: k/nghìn/ngàn = nghìn, tr/triệu/củ = triệu, "rưỡi" = thêm một nửa đơn vị (vd "2 triệu rưỡi" = 2500000, "1tr2" = 1200000).\n' +
    'Chỉ trả về JSON, không giải thích thêm.';

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

  function parseWithRegex(raw) {
    const type = detectType(raw);
    const amount = parseAmount(raw);
    const category = detectCategory(raw, type);
    const note = cleanNote(raw);
    return { amount, type, category, note };
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
        system: SYSTEM_PROMPT,
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

    // Extract the JSON (in case the model wraps it in ```json)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Không tìm thấy JSON trong phản hồi Claude');
    const parsed = JSON.parse(jsonMatch[0]);

    // Normalize
    const amount = Math.round(Number(parsed.amount) || 0);
    const type = parsed.type === 'income' ? 'income' : 'expense';
    let category = String(parsed.category || '').trim();
    if (!CATEGORIES.includes(category)) {
      category = type === 'income' ? 'Thu nhập' : 'Khác';
    }
    const note = String(parsed.note || raw).trim();
    return { amount, type, category, note };
  }

  /* ---------------------------------------------------------------
   *  Main function: automatically picks Claude or regex
   * --------------------------------------------------------------- */
  async function parseTransaction(raw) {
    const apiKey = (window.CONFIG && window.CONFIG.ANTHROPIC_API_KEY) || '';
    if (apiKey) {
      try {
        const result = await parseWithClaude(raw, apiKey);
        // If Claude returns amount 0, try regex as a rescue
        if (!result.amount) {
          const fb = parseWithRegex(raw);
          if (fb.amount) result.amount = fb.amount;
        }
        return { ...result, source: 'claude' };
      } catch (err) {
        console.warn('Claude API lỗi, dùng regex fallback:', err.message);
        return { ...parseWithRegex(raw), source: 'regex', warning: err.message };
      }
    }
    return { ...parseWithRegex(raw), source: 'regex' };
  }

  // Export to global
  window.Parser = {
    parseTransaction,
    parseWithRegex,
    parseAmount,
    CATEGORIES,
  };
})();
