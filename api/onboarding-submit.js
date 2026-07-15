// api/onboarding-submit.js
// POST：接收主播入职问卷提交，写入飞书「主播入职信息」表；写入成功后自动在《主播档案表》
//       建一条"试播"状态的档案（若同名主播已存在则跳过，不重复建档）。
// GET：只读列出「主播入职信息」表的历史提交（完整问卷内容），用于运营查看。
// 调用方式：POST /api/onboarding-submit  Body: 问卷字段（见 onboard.html 的 submitForm payload）
//          GET  /api/onboarding-submit

const TABLE_ONBOARDING = 'tbln4EIjjBuTaIKN';
const TABLE_ANCHORS = 'tbl7bMJLN66tBB7M';

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

// 读取时飞书字段可能是纯字符串，也可能包起来了（富文本/单选对象），统一兜底提取成字符串
function extractText(val) {
  if (val === null || val === undefined) return '';
  if (typeof val === 'string') return val;
  if (typeof val === 'number') return val;
  if (Array.isArray(val)) return val.map(extractText).join('');
  if (typeof val === 'object') return val.text || val.value || val.name || '';
  return String(val);
}

// 按"主播艺名"精确查一遍主播档案表，避免重复建档
async function findExistingAnchor(token, appToken, displayName) {
  const response = await fetch(
    `https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables/${TABLE_ANCHORS}/records/search`,
    {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filter: {
          conjunction: 'and',
          conditions: [{ field_name: '主播艺名', operator: 'is', value: [displayName] }]
        },
        page_size: 1
      })
    }
  );
  const data = await response.json();
  const items = data.data?.items || [];
  return items[0]?.record_id || null;
}

// 自动建档：只填最基础的字段，状态固定"试播"，风格标签固定['待定']，
// 具体风格/流水目标留给运营人工审核问卷内容后再补充，避免往飞书多选字段里
// 写入不在预设选项里的自由文本导致失败。
async function createAnchorProfile(token, appToken, displayName) {
  const anchorKey = displayName.trim().toLowerCase();
  const fields = {
    '主播艺名': displayName,
    '主播ID': anchorKey,
    '账号状态': '试播',
    '风格标签': ['待定'],
    '当月流水目标': 0
  };
  const response = await fetch(
    `https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables/${TABLE_ANCHORS}/records`,
    {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields })
    }
  );
  const data = await response.json();
  if (data.code !== 0) {
    return { status: 'error', error: data.msg || '建档失败', detail: data };
  }
  return { status: 'created', record_id: data.data?.record?.record_id };
}

async function handleGet(req, res) {
  const token = await getToken();
  const APP_TOKEN = process.env.APP_TOKEN;

  const response = await fetch(
    `https://open.feishu.cn/open-apis/bitable/v1/apps/${APP_TOKEN}/tables/${TABLE_ONBOARDING}/records?page_size=100`,
    { headers: { 'Authorization': `Bearer ${token}` } }
  );
  const data = await response.json();
  if (data.code !== 0) {
    return res.status(500).json({ error: data.msg || '读取飞书失败', detail: data, items: [] });
  }

  const items = (data.data?.items || []).map(item => {
    const f = item.fields;
    return {
      record_id: item.record_id,
      主播昵称: extractText(f['主播昵称']),
      年龄段: extractText(f['年龄段']),
      原直播经验: extractText(f['原直播经验']),
      英语口语水平: extractText(f['英语口语水平']),
      外形标签: extractText(f['外形标签']),
      性格标签: extractText(f['性格标签']),
      能力标签: extractText(f['能力标签']),
      持续聊天话题: extractText(f['持续聊天话题']),
      核心竞争力: extractText(f['核心竞争力']),
      内容底线: extractText(f['内容底线']),
      底线补充说明: extractText(f['底线补充说明']),
      主赛道: extractText(f['主赛道']),
      填写时间: extractText(f['填写时间']),
      处理状态: extractText(f['处理状态'])
    };
  }).sort((a, b) => String(b.填写时间).localeCompare(String(a.填写时间)));

  res.json({ count: items.length, items });
}

async function handlePost(req, res) {
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

  // 问卷本身写入成功后再尝试自动建档；建档失败/跳过都不影响问卷提交结果，
  // 只在返回值里带一个 anchor_profile 状态，方便前端/日志排查。
  let anchorProfile = { status: 'skipped', reason: 'missing display name' };
  const displayName = (body.主播昵称 || '').trim();
  if (displayName) {
    try {
      const existingId = await findExistingAnchor(token, APP_TOKEN, displayName);
      if (existingId) {
        anchorProfile = { status: 'already_exists', record_id: existingId };
      } else {
        anchorProfile = await createAnchorProfile(token, APP_TOKEN, displayName);
      }
    } catch (e) {
      anchorProfile = { status: 'error', error: e.message };
    }
  }

  res.json({ success: true, record_id: data.data?.record?.record_id, anchor_profile: anchorProfile });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  try {
    if (req.method === 'GET') return await handleGet(req, res);
    if (req.method === 'POST') return await handlePost(req, res);
    return res.status(405).json({ error: 'GET or POST only' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
