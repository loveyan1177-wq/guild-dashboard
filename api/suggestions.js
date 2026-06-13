// api/suggestions.js
// 读取 AI 建议表，加入 Redis 缓存（5分钟），需要实时性时可手动刷新

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

async function redisSet(key, value, ttl = 300) {
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
  await fetch(`${url}/expire/${encodeURIComponent(key)}/${ttl}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` }
  });
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
  if (Array.isArray(val)) return val.map(extractText).join('');
  if (typeof val === 'object') return val.text || val.value || val.name || '';
  return String(val);
}

async function fetchFromFeishu(anchor) {
  const token = await getToken();
  const APP_TOKEN = process.env.APP_TOKEN;
  const TABLE_AI = 'tblqkPbAUmhEEhWT';

  const body = {
    filter: {
      conjunction: 'and',
      conditions: [{ field_name: '所属主播', operator: 'is', value: [anchor] }]
    },
    sort: [{ field_name: '日期', desc: true }],
    page_size: 100
  };

  const response = await fetch(
    `https://open.feishu.cn/open-apis/bitable/v1/apps/${APP_TOKEN}/tables/${TABLE_AI}/records/search`,
    {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }
  );
  const data = await response.json();
  const items = data.data?.items || [];

  return items.map(item => {
    const f = item.fields;
    const dateVal = f['日期'];
    let dateStr = '';
    if (typeof dateVal === 'number') {
      dateStr = new Date(dateVal).toISOString().split('T')[0];
    } else if (typeof dateVal === 'string') {
      dateStr = dateVal.replace(/\//g, '-');
    }
    return {
      id: item.record_id,
      date: dateStr,
      level: extractText(f['建议等级']) || '',
      reason: extractText(f['触发原因']) || '',
      action: extractText(f['建议行动']) || '',
      status: extractText(f['执行状态']) || '待执行'
    };
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { anchor } = req.query;
  if (!anchor) return res.status(400).json({ error: 'anchor required' });

  try {
    const cacheKey = `suggestions:${anchor}`;
    const cached = await redisGet(cacheKey);
    if (cached) {
      return res.json({ suggestions: cached, source: 'cache' });
    }
    const suggestions = await fetchFromFeishu(anchor);
    // 缓存 5 分钟
    redisSet(cacheKey, suggestions, 300).catch(() => {});
    res.json({ suggestions, source: 'feishu' });
  } catch (e) {
    res.status(500).json({ error: e.message, suggestions: [] });
  }
}
