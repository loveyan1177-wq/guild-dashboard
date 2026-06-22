// api/today-case.js
// 内容结构：人设(persona,固定) -> 直播模式(live_mode,该人设专属选项) -> 动机(motivation,通用4类) -> 案件
// ?anchor=lila                         -> 返回该主播人设 + 该人设可选的直播模式列表
// ?anchor=lila&live_mode=X&motivation=Y -> 返回该人设+该模式+该动机下的全部案件（不含已下架）
// ?all=1                                -> 管理用，返回全量未过滤列表

const LIVE_MODE_CONFIG = {
  '情感陪伴型': ['情感法官', '神秘知己', '邻家姐姐'],
  '健身自律型': ['严厉教练', '鼓励陪伴', '生活方式'],
  '美食治愈型': ['吃货朋友', '厨房达人', '家乡味道'],
  'Cos娱乐型': ['整蛊搞笑', '二次元互动', '暗黑角色']
};

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
  const { anchor, motivation, live_mode, all } = req.query;

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
    const liveModes = persona ? (LIVE_MODE_CONFIG[persona] || []) : [];

    // 只查人设本身和模式列表，不带 live_mode/motivation 时直接返回
    if (!live_mode && !motivation) {
      return res.json({ persona: persona || null, live_modes: liveModes });
    }

    let matched = list.filter(c => c.status !== '已下架' && c.persona === persona);
    if (live_mode) matched = matched.filter(c => c.live_mode === live_mode);
    if (motivation) matched = matched.filter(c => c.motivation === motivation);

    res.json({ persona: persona || null, live_modes: liveModes, live_mode: live_mode || null, motivation: motivation || null, cases: matched });
  } catch (e) {
    res.status(500).json({ error: e.message, cases: [] });
  }
}
