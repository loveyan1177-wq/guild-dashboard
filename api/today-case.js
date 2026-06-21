// api/today-case.js
// 返回"今日案件"——案件库（cases:all）里 used_date 等于今天的那一条
// 案件的轮播分配（挑选下一条、标记 used_date）由 Claude 在日常对话中按顺序写入，
// 这个接口只负责只读展示，不做状态变更，避免并发写入问题

async function redisGetRaw(key) {
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
    return val;
  } catch {
    return null;
  }
}

function beijingDateStr() {
  // UTC + 8 小时，取 YYYY-MM-DD
  const now = new Date(Date.now() + 8 * 60 * 60 * 1000);
  return now.toISOString().slice(0, 10);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { all } = req.query;

  try {
    const allCases = (await redisGetRaw('cases:all')) || [];
    const list = Array.isArray(allCases) ? allCases : [];

    // 管理用：返回全量列表（包含待用/已用），方便排库、加新案件时先读取再合并
    if (all === '1') {
      return res.json({ cases: list });
    }

    const today = beijingDateStr();
    const todayCase = list.find(c => c.used_date === today) || null;

    res.json({ case: todayCase, date: today });
  } catch (e) {
    res.status(500).json({ error: e.message, case: null });
  }
}
