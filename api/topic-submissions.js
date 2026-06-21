// api/topic-submissions.js
// 主播提交话题想法：POST 写入"待审核"队列；GET 给运营/驾驶舱后台查看
// 不会自动进入案件库轮播，必须运营审核确认后才会被采纳进 cases:all

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

  if (req.method === 'GET') {
    const list = (await redisGetRaw('topic_submissions')) || [];
    return res.json({ submissions: Array.isArray(list) ? list : [] });
  }

  if (req.method === 'POST') {
    const { anchor, tag, content } = req.body || {};
    if (!anchor || !tag || !content) {
      return res.status(400).json({ error: 'anchor, tag, content 都是必填' });
    }
    const existing = (await redisGetRaw('topic_submissions')) || [];
    const arr = Array.isArray(existing) ? existing : [];
    const entry = {
      id: 'sub_' + Date.now(),
      anchor,
      tag,
      content,
      status: '待审核',
      submitted_at: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19)
    };
    arr.push(entry);
    await redisSetRaw('topic_submissions', arr);
    return res.json({ success: true, entry });
  }

  res.status(405).json({ error: 'GET or POST only' });
}
