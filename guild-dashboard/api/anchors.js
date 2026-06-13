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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    const token = await getToken();
    const APP_TOKEN = process.env.APP_TOKEN;
    const TABLE_ANCHORS = 'tbl7bMJLN66tBB7M';

    const response = await fetch(
      `https://open.feishu.cn/open-apis/bitable/v1/apps/${APP_TOKEN}/tables/${TABLE_ANCHORS}/records?page_size=50`,
      { headers: { 'Authorization': `Bearer ${token}` } }
    );
    const data = await response.json();
    const items = data.data?.items || [];

    const anchors = items
      .map(item => {
        const f = item.fields;
        const statusRaw = f['账号状态'];
        const statusText = extractText(statusRaw);
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

    res.json({ anchors, debug: items.length + ' records found' });
  } catch(e) {
    res.status(500).json({ error: e.message, anchors: [] });
  }
}
