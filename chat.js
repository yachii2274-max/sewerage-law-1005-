// Vercel 伺服器端函式：接收前端組好的提示詞，轉送給語言模型，金鑰只存在 Vercel 環境變數。
// 環境變數：
//   LLM_PROVIDER = anthropic | openai   （openai 代表任何 OpenAI 相容介面：OpenAI、Gemini 相容端點、機關自建 vLLM / Ollama 等）
//   LLM_API_KEY  = 金鑰
//   LLM_MODEL    = 模型名稱，例如 claude-sonnet-4-5、gpt-4o-mini
//   LLM_BASE_URL = （僅 openai 類需要）例如 https://api.openai.com/v1 或 https://你的內部主機/v1

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const prompt = req.body && req.body.prompt;
  if (typeof prompt !== 'string' || !prompt || prompt.length > 30000) return res.status(400).json({ error: 'Bad prompt' });

  const provider = (process.env.LLM_PROVIDER || 'anthropic').toLowerCase();
  const key = process.env.LLM_API_KEY;
  const model = process.env.LLM_MODEL;
  if (!key || !model) return res.status(500).json({ error: 'LLM not configured' });

  try {
    let text = '';
    if (provider === 'anthropic') {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model, max_tokens: 2000, messages: [{ role: 'user', content: prompt }] }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(JSON.stringify(j));
      text = (j.content || []).map((c) => c.text || '').join('');
    } else {
      const base = (process.env.LLM_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
      const r = await fetch(base + '/chat/completions', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + key, 'content-type': 'application/json' },
        body: JSON.stringify({ model, max_tokens: 2000, messages: [{ role: 'user', content: prompt }] }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(JSON.stringify(j));
      text = j.choices?.[0]?.message?.content || '';
    }
    return res.status(200).json({ text });
  } catch (e) {
    console.error(e);
    return res.status(502).json({ error: 'LLM request failed' });
  }
}
