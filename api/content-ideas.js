// api/content-ideas.js
// 读取某个主播当前赛道匹配的内容点子
// 数据来源：Redis 里的 ideas:all（全量点子列表）+ anchor_tracks（主播->赛道映射）
// 这两份数据由 api/cache-update.js 写入（不经过飞书）

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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { anchor, all } = req.query;

  try {
    const allIdeas = (await redisGetRaw('ideas:all')) || [];

    // 管理用：返回全量未过滤列表（包含待审核/已放弃的），方便追加新点子时先读取合并，不需要 anchor 参数
    if (all === '1') {
      return res.json({ ideas: Array.isArray(allIdeas) ? allIdeas : [] });
    }

    if (!anchor) return res.status(400).json({ error: 'anchor required' });

    const anchorTracks = (await redisGetRaw('anchor_tracks')) || {};
    const anchorLower = anchor.toLowerCase();
    const trackKey = Object.keys(anchorTracks).find(k => k.toLowerCase() === anchorLower);
    const track = trackKey ? anchorTracks[trackKey] : null;

    const matched = (Array.isArray(allIdeas) ? allIdeas : []).filter(idea => {
      const status = idea.status || '';
      // 只展示审核通过的点子，待审核/已放弃不会出现在主播页面
      if (status !== '已确认' && status !== '已上线') return false;

      // 广播点子：不区分赛道/主播，所有人都能看到
      if (idea.broadcast === true) return true;

      const ideaAnchors = (idea.anchors || []).map(a => String(a).toLowerCase());
      if (ideaAnchors.includes(anchorLower)) return true;

      if (track && Array.isArray(idea.tracks) && idea.tracks.includes(track)) return true;

      return false;
    });

    matched.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    res.json({ ideas: matched, track: track || null });
  } catch (e) {
    res.status(500).json({ error: e.message, ideas: [] });
  }
}
