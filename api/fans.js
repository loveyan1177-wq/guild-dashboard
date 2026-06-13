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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { anchor } = req.query;
  if (!anchor) return res.status(400).json({ error: 'anchor required' });

  try {
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

    const fans = items.map(item => {
      const f = item.fields;
      const lastActive = f['最后活跃日期'];
      let lastActiveStr = '';
      if (typeof lastActive === 'number') {
        lastActiveStr = new Date(lastActive).toISOString().split('T')[0];
      }
      const tier = f['档位'];
      const tierText = extractText(tier);
      return {
        username: extractText(f['用户名']),
        total_coins: f['累计金币'] || 0,
        max_single: f['最高单场'] || 0,
        sessions: f['出现场次'] || 0,
        tier: tierText,
        last_active: lastActiveStr
      };
    });

    res.json({ fans });
  } catch(e) {
    res.status(500).json({ error: e.message, fans: [] });
  }
}
