// api/cache-update.js
// 收播后调用此接口，将数据写入 Redis 缓存
// 调用方式：POST /api/cache-update
// Body: { anchor, lives, fans, suggestions }

async function redisSet(key, value, ttl) {
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
  if (ttl) {
    await fetch(`${url}/expire/${encodeURIComponent(key)}/${ttl}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    });
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { anchor, lives, fans, suggestions } = req.body;
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
    if (suggestions !== undefined) {
      await redisSet(`suggestions:${anchor}`, suggestions, 300);
      results.suggestions = 'ok';
    }
    // anchors 缓存清除，让下次自动刷新
    await fetch(`${url}/del/${encodeURIComponent('anchors')}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` }
    }).catch(() => {});
    res.json({ success: true, anchor, updated: results });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
