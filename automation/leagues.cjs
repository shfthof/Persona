const {
  DAY,
  LEAGUES,
  profile,
  weekXP,
  boardEntry,
} = require("../shared/progression");
function addMonths(time, months) {
  const d = new Date(time);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
  ).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.getTime();
}
function competition(start) {
  const day = Math.floor(start / DAY),
    end = addMonths(start, 5);
  return {
    seasonId: String(day),
    seasonStart: start,
    seasonEnd: end,
    weekId: String(day),
    weekStartDay: day,
    weekEndDay: Math.min(day + 7, end / DAY),
  };
}
function compare(a, b) {
  return b.xp - a.xp || (a.uid < b.uid ? 1 : a.uid > b.uid ? -1 : 0);
}
function settleWeek(users, c) {
  const outcomes = {};
  for (const league of LEAGUES) {
    const rows = Object.entries(users)
      .filter(([, p]) => p.joined && p.league === league)
      .map(([uid, p]) => ({ uid, xp: weekXP(p, c.weekStartDay, c.weekEndDay) }))
      .sort(compare);
    rows.forEach((row, i) => {
      const positive = row.xp > 0;
      const target =
        league === "Champions"
          ? i < 15 && positive
            ? "Champions"
            : "Diamond"
          : i < 15 && positive
            ? LEAGUES[LEAGUES.indexOf(league) + 1]
            : league;
      outcomes[row.uid] = {
        league: target,
        previousLeague: league,
        rank: i + 1,
        xp: row.xp,
        weekId: c.weekId,
      };
    });
  }
  for (const [uid, result] of Object.entries(outcomes))
    users[uid].league = result.league;
  return outcomes;
}
function advance(root, now) {
  const data = root || {};
  const initialized = !!data.competition;
  let c = data.competition || competition(Math.floor(now / DAY) * DAY);
  const users = Object.fromEntries(
    Object.entries(data.users || {}).map(([uid, p]) => [uid, profile(p, now)]),
  );
  if (!initialized) for (const p of Object.values(users)) p.league = "Bronze";
  let results = data.leagueResults || {},
    changed = !initialized;
  while (now >= c.weekEndDay * DAY) {
    if (c.weekEndDay * DAY >= c.seasonEnd) {
      for (const p of Object.values(users)) p.league = "Bronze";
      c = competition(c.seasonEnd);
      results = {};
    } else {
      results = settleWeek(users, c);
      const next = c.weekEndDay;
      c = {
        ...c,
        weekId: String(next),
        weekStartDay: next,
        weekEndDay: Math.min(next + 7, c.seasonEnd / DAY),
      };
    }
    changed = true;
  }
  const boards = {};
  for (const [uid, p] of Object.entries(users))
    if (p.joined) {
      boards[p.league] ||= {};
      boards[p.league][uid] = boardEntry(p, c);
    }
  // A root transaction atomically moves users and rebuilds boards; suitable for a small Spark app.
  return {
    ...data,
    users,
    competition: c,
    leagueBoards: boards,
    leagueResults: results,
    leagueJob: { lastRunAt: now, changed },
  };
}
module.exports = { addMonths, competition, compare, settleWeek, advance };
