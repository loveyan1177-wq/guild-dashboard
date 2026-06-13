// api/anchors.js
// 加入 Redis 缓存，anchors 数据变化少，缓存 10 分钟

async function redisGet(key) {
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
    return Array.isArray(val) ? val : null;
  } catch { return null; }
}

async function redisSetEx(key, value, ttl) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  // Upstash REST: POST /set/key/value?ex=ttl
  const encoded = encodeURIComponent(key);
  const body = JSON.stringify(value);
  const res = await fetch(`${url}/set/${encoded}?ex=${ttl}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return res.json();
}

async function getToken() {
  const res = await fetch(
    'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app_id: process.env.FEISHU_APP_ID,
        app_secret: process.env.FEISHU_APP_SECRET
      })
    }
  );
  const data = await res.json();
  return data.tenant_access_token;
}

function extractText(val) {
  if (!val) return '';
  if (typeof val === 'string') return val;
  if (typeof val === 'object') {
    if (val.text) return val.text;
    if (val.value) return val.value;
    if (Array.isArray(val) && val[0]) return extractText(val[0]);
  }
  return String(val);
}

async function fetchFromFeishu() {
  const token = await getToken();
  const APP_TOKEN = process.env.APP_TOKEN;
  const TABLE_ANCHORS = 'tbl7bMJLN66tBB7M';

  const response = await fetch(
    `https://open.feishu.cn/open-apis/bitable/v1/apps/${APP_TOKEN}/tables/${TABLE_ANCHORS}/records?page_size=50`,
    { headers: { 'Authorization': `Bearer ${token}` } }
  );
  const data = await response.json();
  const items = data.data?.items || [];

  return items
    .map(item => {
      const f = item.fields;
      const statusText = extractText(f['账号状态']);
      const levelRaw = f['风格标签'];
      const levelText = Array.isArray(levelRaw)
        ? levelRaw.map(extractText).join(' · ')
        : extractText(levelRaw);
      return {
        id: item.record_id,
        name: extractText(f['主播艺名']),
        status: statusText,
        target: f['当月流水目标'] || 0,
        actual: f['当月实际总流水'] || 0,
        level: levelText
      };
    })
    .filter(a => a.name && !a.status.includes('停播') && !a.status.includes('离职'));
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    const cached = await redisGet('anchors');
    if (cached) {
      return res.json({ anchors: cached, source: 'cache' });
    }
    const anchors = await fetchFromFeishu();
    redisSetEx('anchors', anchors, 600).catch(() => {});
    res.json({ anchors, source: 'feishu' });
  } catch(e) {
    res.status(500).json({ error: e.message, anchors: [] });
  }
}
