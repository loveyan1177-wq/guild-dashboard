// api/onboarding-submit.js
// 接收主播入职问卷提交，写入飞书「主播入职信息」表
// 调用方式：POST /api/onboarding-submit
// Body: 问卷字段（见 onboard.html 的 submitForm payload）

const TABLE_ONBOARDING = 'tbln4EIjjBuTaIKN';

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

// 多选/数组字段飞书多行文本不支持数组，统一转成逗号分隔字符串存
function joinIfArray(val) {
  if (Array.isArray(val)) return val.join('、');
  return val || '';
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    const body = req.body;

    const fields = {
      '主播昵称': body.主播昵称 || '',
      '年龄段': body.年龄段 || '',
      '原直播经验': body.原直播经验 || '',
      '英语口语水平': body.英语口语水平 || '',
      '外形标签': joinIfArray(body.外形标签),
      '性格标签': joinIfArray(body.性格标签),
      '能力标签': joinIfArray(body.能力标签),
      '持续聊天话题': joinIfArray(body.持续聊天话题),
      '核心竞争力': body.核心竞争力 || '',
      '内容底线': joinIfArray(body.内容底线),
      '底线补充说明': body.底线补充说明 || '',
      '主赛道': joinIfArray(body.主赛道),
      '填写时间': body.填写时间 || new Date().toISOString(),
      '处理状态': '待处理'
    };

    const token = await getToken();
    const APP_TOKEN = process.env.APP_TOKEN;

    const response = await fetch(
      `https://open.feishu.cn/open-apis/bitable/v1/apps/${APP_TOKEN}/tables/${TABLE_ONBOARDING}/records`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ fields })
      }
    );
    const data = await response.json();

    if (data.code !== 0) {
      return res.status(500).json({ error: data.msg || '写入飞书失败', detail: data });
    }

    res.json({ success: true, record_id: data.data?.record?.record_id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
