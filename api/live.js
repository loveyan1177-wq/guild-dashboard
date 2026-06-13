// api/live.js
// 先读 Redis 缓存，没有再读飞书

async function redisGet(key) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  const res = await fetch(`${url}/get/${key}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json();
  return data.result ?? null;
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

async function fetchFromFeishu(anchor) {
  const token = await getToken();
  const APP_TOKEN = process.env.APP_TOKEN;
  const TABLE_LIVE = 'tbl4VQMLt9PH4QNy';

  const body = {
    filter: {
      conjunction: 'and',
      conditions: [{
        field_name: '单场识别码',
        operator: 'contains',
        value: [anchor + '-']
      }]
    },
    sort: [{ field_name: '日期', desc: true }],
    page_size: 50
  };

  const response = await fetch(
    `https://open.feishu.cn/open-apis/bitable/v1/apps/${APP_TOKEN}/tables/${TABLE_LIVE}/records/search`,
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
      diamonds: f['本场总钻石'] || 0,
      gifters: f['Gifters 送礼人数'] || 0,
      new_fans: f['新增粉丝'] || 0,
      views: f['Views/观看人数'] || 0,
      duration: f['直播时长'] || '',
      session: f['场次'] || ''
    };
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { anchor } = req.query;
  if (!anchor) return res.status(400).json({ error: 'anchor required' });

  try {
    // 先尝试读缓存
    const cached = await redisGet(`lives:${anchor}`);
    if (cached) {
      return res.json({ lives: cached, source: 'cache' });
    }
    // 缓存没有，读飞书
    const lives = await fetchFromFeishu(anchor);
    res.json({ lives, source: 'feishu' });
  } catch (e) {
    res.status(500).json({ error: e.message, lives: [] });
  }
}
