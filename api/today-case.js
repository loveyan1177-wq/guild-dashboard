// api/today-case.js
// 返回5个标签各自"今日话题"——案件库（cases:all）按 tag 分组，每个标签找 used_date 等于今天的那条
// 轮播分配（挑下一条、标记 used_date）由 Claude 在日常对话中按需推进，这个接口只负责只读展示

const TAGS = ['❤️情感陪伴', '⚖️婚姻关系', '💔出轨边界', '🧠人生树洞', '😂搞笑整蛊'];

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
  const now = new Date(Date.now() + 8 * 60 * 60 * 1000);
  return now.toISOString().slice(0, 10);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { all } = req.query;

  try {
    const allCases = (await redisGetRaw('cases:all')) || [];
    const list = Array.isArray(allCases) ? allCases : [];

    // 管理用：返回全量列表，方便排库时先读取再合并
    if (all === '1') {
      return res.json({ cases: list });
    }

    const today = beijingDateStr();
    const byTag = {};
    TAGS.forEach(tag => {
      byTag[tag] = list.find(c => c.tag === tag && c.used_date === today) || null;
    });

    res.json({ tags: byTag, date: today });
  } catch (e) {
    res.status(500).json({ error: e.message, tags: {} });
  }
}
