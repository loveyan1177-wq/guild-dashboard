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

async function redisGet(key) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  const res = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json();
  if (!data.result) return null;
  try {
    let val = data.result;
    if (typeof val === 'string') val = JSON.parse(val);
    if (typeof val === 'string') val = JSON.parse(val);
    return Array.isArray(val) ? val : null;
  } catch { return null; }
}

// fans增量upsert：只更新本场出现的粉丝，其余保持不变
async function upsertFans(anchor, newFans) {
  const existing = await redisGet(`fans:${anchor}`) || [];
  const map = {};
  existing.forEach(f => { map[f.username] = f; });
  newFans.forEach(f => { map[f.username] = { ...map[f.username], ...f }; });
  const merged = Object.values(map).sort((a, b) => (b.total_coins || 0) - (a.total_coins || 0));
  await redisSet(`fans:${anchor}`, merged);
  return merged.length;
}

async function redisDel(key) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  await fetch(`${url}/del/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` }
  });
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
      const total = await upsertFans(anchor, fans);
      results.fans = `upserted, total ${total}`;
    }
    if (suggestions !== undefined) {
      await redisSet(`suggestions:${anchor}`, suggestions, 300);
      results.suggestions = 'ok';
    }
    // 清除 anchors 缓存，让下次自动刷新
    await redisDel('anchors');
    res.json({ success: true, anchor, updated: results });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
