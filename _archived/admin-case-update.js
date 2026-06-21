// api/admin-case-update.js
// 运营后台用：更新某条案件的状态/效果评级（下架、恢复、打效果分）
// 不改变案件内容文本，只改 status / effect_rating / effect_note

async function redisGetRaw(key) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  const res = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json();
  if (data.result === null || data.result === undefined) return null;
  try {
    let val = data.result;
    if (typeof val === 'string') val = JSON.parse(val);
    if (typeof val === 'string') val = JSON.parse(val);
    return val;
  } catch {
    return null;
  }
}

async function redisSetRaw(key, value) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  await fetch(`${url}/del/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` }
  });
  await fetch(`${url}/set/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(JSON.stringify(value))
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { id, status, effect_rating, effect_note } = req.body || {};
  if (!id) return res.status(400).json({ error: 'id required' });

  try {
    const existing = (await redisGetRaw('cases:all')) || [];
    const list = Array.isArray(existing) ? existing : [];
    const idx = list.findIndex(c => c.id === id);
    if (idx === -1) return res.status(404).json({ error: '没找到这条案件' });

    if (status !== undefined) list[idx].status = status;
    if (effect_rating !== undefined) list[idx].effect_rating = effect_rating;
    if (effect_note !== undefined) list[idx].effect_note = effect_note;

    await redisSetRaw('cases:all', list);
    res.json({ success: true, case: list[idx] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
