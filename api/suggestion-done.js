// api/suggestion-done.js
// 主播点击「已处理」时调用，更新飞书执行状态
// PATCH /api/suggestion-done  body: { record_id, anchor }

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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { record_id, anchor } = req.body;
  if (!record_id) return res.status(400).json({ error: 'record_id required' });

  try {
    const token = await getToken();
    const APP_TOKEN = process.env.APP_TOKEN;
    const TABLE_AI = 'tblqkPbAUmhEEhWT';

    const response = await fetch(
      `https://open.feishu.cn/open-apis/bitable/v1/apps/${APP_TOKEN}/tables/${TABLE_AI}/records/${record_id}`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          fields: { '执行状态': '已处理' }
        })
      }
    );
    const data = await response.json();
    if (data.code === 0) {
      res.json({ success: true });
    } else {
      res.status(500).json({ error: data.msg || '更新失败' });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
