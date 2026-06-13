// api/fans.js
// 先读 Redis 缓存，没有再读飞书

async function redisGet(key) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  const res = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json();
  if (data.result === null || data.result === undefined) return null;
  try {
    // Upstash 存了两层 JSON.stringify，需要 parse 两次
    let val = data.result;
    if (typeof val === 'string') val = JSON.parse(val);
    if (typeof val === 'string') val = JSON.parse(val);
    return Array.isArray(val) ? val : null;
  } catch {
    return null;
  }
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
  if (typeof val === 'object') {
    if (val.text) return val.text;
    if (val.value) return val.value;
    if (val.name) return val.name;
  }
  return String(val);
}

async function fetchFromFeishu(anchor) {
  const token = await getToken();
  const APP_TOKEN = process.env.APP_TOKEN;
  const TABLE_FANS = 'tblSpn2p5LW9TCjX';

  const body = {
    filter: {
      conjunction: 'and',
      conditions: [{
        field_name: '所属主播',
        operator: 'is',
        value: [anchor]
      }]
    },
    sort: [{ field_name: '累计金币', desc: true }],
    page_size: 100
  };

  const response = await fetch(
    `https://open.feishu.cn/open-apis/bitable/v1/apps/${APP_TOKEN}/tables/${TABLE_FANS}/records/search`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    }
  );
  const data = await response.json();
  const items = data.data?.items || [];

  return items.map(item => {
    const f = item.fields;
    const lastActive = f['最后活跃日期'];
    let lastActiveStr = '';
    if (typeof lastActive === 'number') {
      lastActiveStr = new Date(lastActive).toISOString().split('T')[0];
    }
    return {
      username: extractText(f['用户名']),
      total_coins: f['累计金币'] || 0,
      max_single: f['最高单场'] || 0,
      sessions: f['出现场次'] || 0,
      tier: extractText(f['档位']),
      last_active: lastActiveStr,
      script: extractText(f['跟踪话术']) || ''
    };
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { anchor } = req.query;
  if (!anchor) return res.status(400).json({ error: 'anchor required' });

  try {
    const cached = await redisGet(`fans:${anchor}`);
    if (cached) {
      return res.json({ fans: cached, source: 'cache' });
    }
    const fans = await fetchFromFeishu(anchor);
    res.json({ fans, source: 'feishu' });
  } catch (e) {
    res.status(500).json({ error: e.message, fans: [] });
  }
}
