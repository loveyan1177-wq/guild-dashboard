// api/admin-update.js
// 合并版运营后台写入接口（案件库管理 + 主播提交审核共用一个文件，避免超过Vercel Hobby套餐12个函数上限）
// POST body 加 type 字段区分操作对象：
//   type: "case"       -> 更新 cases:all 里某条案件的 status / effect_rating / effect_note
//   type: "submission" -> 更新 topic_submissions 里某条提交的 status

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

    if (type === 'submission') {
      if (!status) return res.status(400).json({ error: 'submission 类型需要 status' });
      const existing = (await redisGetRaw('topic_submissions')) || [];
      const list = Array.isArray(existing) ? existing : [];
      const idx = list.findIndex(s => s.id === id);
      if (idx === -1) return res.status(404).json({ error: '没找到这条提交' });
      list[idx].status = status;
      await redisSetRaw('topic_submissions', list);
      return res.json({ success: true, submission: list[idx] });
    }

    res.status(400).json({ error: 'type 必须是 case 或 submission' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
