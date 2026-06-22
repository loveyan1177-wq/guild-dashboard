// api/today-case.js
// 新结构：内容按"人设"分库(persona，固定，存在 anchor_tracks 里)，
// 库内再按"动机"分类(motivation: 冲突/缺失/渴望/娱乐)，主播自己选动机查看对应内容
// ?anchor=lila              -> 只返回该主播的人设(persona)
// ?anchor=lila&motivation=冲突 -> 返回该人设下、该动机分类的全部案件（不含已下架）
// ?all=1                    -> 管理用，返回全量未过滤列表

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
  const { anchor, motivation, all } = req.query;

  try {
    const allCases = (await redisGetRaw('cases:all')) || [];
    const list = Array.isArray(allCases) ? allCases : [];

    if (all === '1') {
      return res.json({ cases: list });
    }

    if (!anchor) return res.status(400).json({ error: 'anchor required' });

    const anchorTracks = (await redisGetRaw('anchor_tracks')) || {};
    const anchorLower = anchor.toLowerCase();
    const personaKey = Object.keys(anchorTracks).find(k => k.toLowerCase() === anchorLower);
    const persona = personaKey ? anchorTracks[personaKey] : null;

    let matched = list.filter(c => c.status !== '已下架' && c.persona === persona);
    if (motivation) {
      matched = matched.filter(c => c.motivation === motivation);
    }

    res.json({ persona: persona || null, motivation: motivation || null, cases: matched });
  } catch (e) {
    res.status(500).json({ error: e.message, cases: [] });
  }
}
