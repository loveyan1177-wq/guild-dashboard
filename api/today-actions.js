// api/today-actions.js
// 今日行动清单 v1：只读 fans:{anchor} 快照，按规则生成最多5条建议
// 不查询飞书 AI建议表，不做升档/回归判断（v1 范围之外，后续版本再加）
// 依赖字段：fans:{anchor} 里每条记录需带 today_total / today_max_single / today_session_count
// （由每日收播流程生成快照时写入，本文件不做任何历史推断，缺字段按 0 处理）

async function redisGet(key) {
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
    return Array.isArray(val) ? val : null;
  } catch {
    return null;
  }
}

function todayStr() {
  // 与现有 fans/lives 缓存里的日期格式保持一致：YYYY-MM-DD
  return new Date().toISOString().split('T')[0];
}

function safeUsername(username) {
  return String(username || '').replace(/[^a-zA-Z0-9_-]/g, '_');
}

function buildSuggestion(fan, rule, reason, level, today) {
  const safeName = safeUsername(fan.username);
  return {
    id: `rule-${safeName}-${rule}-${today}`,
    date: today,
    level,
    reason,
    action: reason,
    status: '待执行',
    linked_fan: fan.username,
    source: 'rules'
  };
}

// 按优先级从具体到笼统依次判断，命中第一条即返回，不重复挂多条理由
function evaluateFan(fan, today) {
  const todayTotal = fan.today_total || 0;
  const todayMax = fan.today_max_single || 0;
  const todaySessions = fan.today_session_count || 0;
  const isVip = fan.tier === 'VIP' || fan.tier === '超级VIP';
  const activeToday = fan.last_active === today;

  if (todayMax >= 3000) {
    return { rule: 1, weight: todayMax, level: '高',
      reason: `${fan.username} 单场送礼 ${todayMax} coins，建议大额答谢` };
  }
  if (todaySessions >= 2 && todayTotal >= 1000) {
    return { rule: 2, weight: todayTotal, level: '高',
      reason: `${fan.username} 今日多场出现，合计 ${todayTotal} coins，建议跟进` };
  }
  if (todayTotal >= 1000) {
    return { rule: 3, weight: todayTotal, level: '中',
      reason: `${fan.username} 今日合计送礼 ${todayTotal} coins，建议答谢` };
  }
  if (isVip && activeToday) {
    return { rule: 4, weight: fan.total_coins || 0, level: '低',
      reason: `${fan.username}（${fan.tier}）今日活跃，建议维护` };
  }
  return null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { anchor } = req.query;
  if (!anchor) return res.status(400).json({ error: 'anchor required' });

  const today = todayStr();

  try {
    const fans = (await redisGet(`fans:${anchor}`)) || [];

    const candidates = [];
    fans.forEach(fan => {
      const hit = evaluateFan(fan, today);
      if (hit) candidates.push({ fan, ...hit });
    });

    // 规则优先级升序；同规则内按权重（金额）降序
    candidates.sort((a, b) => (a.rule !== b.rule ? a.rule - b.rule : b.weight - a.weight));

    const suggestions = candidates
      .slice(0, 5)
      .map(c => buildSuggestion(c.fan, c.rule, c.reason, c.level, today));

    res.json({ suggestions, source: 'rules', date: today });
  } catch (e) {
    res.status(500).json({ error: e.message, suggestions: [], source: 'rules', date: today });
  }
}
