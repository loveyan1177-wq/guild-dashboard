// api/admin-submission-update.js
// 运营后台用：审核主播提交的话题（采纳/拒绝），不会自动写入案件库
// 采纳后仍需运营把内容告知 Claude，由 Claude 整理成标准案件格式后正式排入对应标签队列

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

  const { id, status } = req.body || {};
  if (!id || !status) return res.status(400).json({ error: 'id, status 都是必填' });

  try {
    const existing = (await redisGetRaw('topic_submissions')) || [];
    const list = Array.isArray(existing) ? existing : [];
    const idx = list.findIndex(s => s.id === id);
    if (idx === -1) return res.status(404).json({ error: '没找到这条提交' });

    list[idx].status = status;
    await redisSetRaw('topic_submissions', list);
    res.json({ success: true, submission: list[idx] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
