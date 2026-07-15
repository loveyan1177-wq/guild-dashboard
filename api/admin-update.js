// api/admin-update.js
// 运营后台案件库写入接口
// POST body 加 type 字段：
//   type: "case" -> 更新 cases:all 里某条案件的 status / effect_rating / effect_note
// （主播提交话题功能已下线，原 'submission' 分支已移除）

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

  const { type, id, status, effect_rating, effect_note } = req.body || {};
  if (!type || !id) return res.status(400).json({ error: 'type, id 都是必填' });

  try {
    if (type === 'case') {
      const existing = (await redisGetRaw('cases:all')) || [];
      const list = Array.isArray(existing) ? existing : [];
      const idx = list.findIndex(c => c.id === id);
      if (idx === -1) return res.status(404).json({ error: '没找到这条案件' });
      if (status !== undefined) list[idx].status = status;
      if (effect_rating !== undefined) list[idx].effect_rating = effect_rating;
      if (effect_note !== undefined) list[idx].effect_note = effect_note;
      await redisSetRaw('cases:all', list);
      return res.json({ success: true, case: list[idx] });
    }

    res.status(400).json({ error: 'type 必须是 case' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
