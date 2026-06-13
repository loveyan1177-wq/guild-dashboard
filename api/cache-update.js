// api/cache-update.js
// 收播后调用此接口，将数据写入 Redis 缓存
// 调用方式：POST /api/cache-update
// Body: { anchor, lives, fans }

async function redisSet(key, value) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  const res = await fetch(`${url}/set/${key}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(value)
  });
  return res.json();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { anchor, lives, fans } = req.body;
  if (!anchor) return res.status(400).json({ error: 'anchor required' });

  try {
    const results = {};
    if (lives !== undefined) {
      await redisSet(`lives:${anchor}`, lives);
      results.lives = 'ok';
    }
    if (fans !== undefined) {
      await redisSet(`fans:${anchor}`, fans);
      results.fans = 'ok';
    }
    res.json({ success: true, anchor, updated: results });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
