// Vercel 伺服器端函式：接收前端組好的提示詞，轉送給語言模型，金鑰只存在 Vercel 環境變數。
// 環境變數：LLM_PROVIDER (openai|anthropic)、LLM_API_KEY、LLM_MODEL、LLM_BASE_URL（openai 類）
// 檢查連線：瀏覽器開啟 /api/chat?test=1

async function callLLM(prompt) {
  const provider = (process.env.LLM_PROVIDER || 'openai').toLowerCase().trim();
  const key = (process.env.LLM_API_KEY || '').trim();
  const model = (process.env.LLM_MODEL || '').trim();
  if (!key) throw new Error('未設定 LLM_API_KEY');
  if (!model) throw new Error('未設定 LLM_MODEL');

  if (provider === 'anthropic') {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model, max_tokens: 4000, messages: [{ role: 'user', content: prompt }] }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error('Anthropic ' + r.status + '：' + (j.error?.message || JSON.stringify(j)));
    return (j.content || []).map((c) => c.text || '').join('');
  }

  const base = (process.env.LLM_BASE_URL || 'https://api.openai.com/v1').trim().replace(/\/+$/, '');
  const r = await fetch(base + '/chat/completions', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + key, 'content-type': 'application/json' },
    body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }] }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('OpenAI ' + r.status + '：' + (j.error?.message || JSON.stringify(j)));
  const text = j.choices?.[0]?.message?.content || '';
  if (!text) throw new Error('模型回傳空白內容：' + JSON.stringify(j).slice(0, 300));
  return text;
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const info = {
      provider: process.env.LLM_PROVIDER || '(未設定，預設 openai)',
      model: process.env.LLM_MODEL || '(未設定)',
      baseUrl: process.env.LLM_BASE_URL || '(未設定，預設 https://api.openai.com/v1)',
      hasKey: !!process.env.LLM_API_KEY,
    };
    if (req.query && req.query.test) {
      try { info.reply = await callLLM('請只回覆「連線成功」四個字。'); info.ok = true; }
      catch (e) { info.ok = false; info.error = String(e.message || e); }
    }
    return res.status(200).json(info);
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  const prompt = body && body.prompt;
  if (typeof prompt !== 'string' || !prompt || prompt.length > 40000) return res.status(400).json({ error: '提示詞格式錯誤' });

  try {
    const text = await callLLM(prompt);
    return res.status(200).json({ text });
  } catch (e) {
    console.error(e);
    return res.status(502).json({ error: String(e.message || e) });
  }
}
