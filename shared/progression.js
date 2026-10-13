const DAY = 86400000;
const STATS = ["Social", "Guts", "Smarts", "Vitality"];
const CATALOG = {
  compliment: ["Social", 40],
  speak: ["Guts", 60],
  study: ["Smarts", 75],
  walk: ["Vitality", 50],
  listen: ["Social", 50],
  build: ["Smarts", 65],
};
const LEAGUES = [
  "Bronze",
  "Silver",
  "Gold",
  "Platinum",
  "Diamond",
  "Champions",
];
const dayNumber = (time) => Math.floor(time / DAY);
const levelFor = (xp) => Math.floor(xp / 200) + 1;
function profile(raw, now = Date.now()) {
  const current = raw?.schemaVersion === 2;
  const baseXp = Object.fromEntries(
    STATS.map((s) => [s, current ? raw.baseXp?.[s] || 0 : raw?.xp?.[s] || 0]),
  );
  const receipts = Object.fromEntries(
    Object.keys(CATALOG).map((id) => [
      id,
      current
        ? { ...(raw.receipts?.[id] || { count: 0, lastDay: -1 }) }
        : { count: 0, lastDay: raw ? dayNumber(now) : -1 },
    ]),
  );
  const p = {
    schemaVersion: 2,
    name: raw?.name || "Explorer",
    joined: raw?.joined || false,
    league: raw?.league || "Bronze",
    baseXp,
    receipts,
    earnings: current ? { ...raw.earnings } : {},
    activityDays: current ? { ...raw.activityDays } : {},
    xp: { ...baseXp },
    levels: {},
    totalXp: 0,
    level: 1,
  };
  for (const [id, [stat, reward]] of Object.entries(CATALOG))
    p.xp[stat] += receipts[id].count * reward;
  for (const stat of STATS) {
    p.levels[stat] = levelFor(p.xp[stat]);
    p.totalXp += p.xp[stat];
  }
  p.level = levelFor(p.totalXp);
  return p;
}
function transition(raw, action, now = Date.now()) {
  const p = profile(raw, now);
  if (action.type === "profile") {
    const name = action.name?.trim();
    if (!name || name.length < 2 || name.length > 24)
      throw Error("Use a name with 2–24 characters.");
    p.name = name;
  } else if (action.type === "join") p.joined = true;
  else if (action.type === "complete") {
    if (!Object.hasOwn(CATALOG, action.id)) throw Error("Unknown challenge.");
    const day = dayNumber(now),
      receipt = p.receipts[action.id];
    if (receipt.lastDay >= day)
      throw Error("This challenge has already been completed today.");
    receipt.count++;
    receipt.lastDay = day;
    p.activityDays[day] = true;
    if (p.joined)
      p.earnings[day] = (p.earnings[day] || 0) + CATALOG[action.id][1];
  } else if (action.type !== "ensure") throw Error("Unknown action.");
  return profile(p, now);
}
function weekXP(p, startDay, endDay) {
  let total = 0;
  for (let d = startDay; d < endDay; d++) total += p.earnings?.[d] || 0;
  return total;
}
function boardEntry(p, competition) {
  return {
    name: p.name,
    xp: weekXP(p, competition.weekStartDay, competition.weekEndDay),
    level: p.level,
    weekId: competition.weekId,
  };
}
module.exports = {
  DAY,
  STATS,
  CATALOG,
  LEAGUES,
  dayNumber,
  levelFor,
  profile,
  transition,
  weekXP,
  boardEntry,
};
