import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { profile, transition, DAY, boardEntry } from "../shared/progression";
const require = createRequire(import.meta.url);
const {
  advance,
  competition,
  addMonths,
} = require("../automation/leagues.cjs");
const start = Date.UTC(2026, 0, 1),
  day = start / DAY;
function player(xp: number, league = "Bronze") {
  return {
    ...profile(null, start),
    joined: true,
    league,
    earnings: { [day]: xp },
  };
}
test("saves explicit stat levels and total level", () => {
  let p = profile(null, start);
  for (let i = 0; i < 3; i++)
    p = transition(p, { type: "complete", id: "study" }, start + i * DAY);
  assert.equal(p.xp.Smarts, 225);
  assert.equal(p.levels.Smarts, 2);
  assert.equal(p.totalXp, 225);
  assert.equal(p.level, 2);
});
test("duplicate daily challenge rejected; subsequent day allowed", () => {
  const p = transition(
    profile(null, start),
    { type: "complete", id: "walk" },
    start,
  );
  assert.throws(() => transition(p, { type: "complete", id: "walk" }, start));
  assert.equal(
    transition(p, { type: "complete", id: "walk" }, start + DAY).xp.Vitality,
    100,
  );
});
test("non-ranked XP is not banked for later competition", () => {
  let p = transition(
    profile(null, start),
    { type: "complete", id: "study" },
    start,
  );
  p = transition(p, { type: "join" }, start);
  p = transition(p, { type: "complete", id: "walk" }, start);
  assert.equal(p.totalXp, 125);
  assert.equal(p.earnings[day], 50);
});
test("top 15 active players advance exactly one league", () => {
  const users = Object.fromEntries(
    Array.from({ length: 20 }, (_, i) => [`u${i}`, player(100 - i)]),
  );
  const c = competition(start);
  const r = advance({ competition: c, users }, start + 7 * DAY);
  assert.equal(
    Object.values(r.users).filter((p: any) => p.league === "Silver").length,
    15,
  );
  assert.equal(
    Object.values(r.users).filter((p: any) => p.league === "Gold").length,
    0,
  );
  assert.equal(r.users.u19.league, "Bronze");
});
test("Champions retain top 15; remainder demoted to Diamond", () => {
  const users = Object.fromEntries(
    Array.from({ length: 18 }, (_, i) => [
      `u${i}`,
      player(100 - i, "Champions"),
    ]),
  );
  const r = advance(
    { competition: competition(start), users },
    start + 7 * DAY,
  );
  assert.equal(r.users.u0.league, "Champions");
  assert.equal(r.users.u17.league, "Diamond");
});
test("zero XP does not earn promotion or retain Champions", () => {
  const r = advance(
    {
      competition: competition(start),
      users: { a: player(0), b: player(0, "Champions") },
    },
    start + 7 * DAY,
  );
  assert.equal(r.users.a.league, "Bronze");
  assert.equal(r.users.b.league, "Diamond");
});
test("rerunning at same time is idempotent and delayed run uses each correct week", () => {
  const users = {
    a: { ...player(100), earnings: { [day]: 100, [day + 8]: 50 } },
  };
  const one = advance(
    { competition: competition(start), users },
    start + 15 * DAY,
  );
  const two = advance(one, start + 15 * DAY);
  assert.equal(one.users.a.league, "Gold");
  assert.deepEqual(two.users, one.users);
  assert.equal(two.competition.weekStartDay, day + 14);
});
test("season reset after five calendar months preserves personal XP and levels", () => {
  const p = transition(
    player(80, "Champions"),
    { type: "complete", id: "study" },
    start,
  );
  const r = advance(
    { competition: competition(start), users: { a: p } },
    addMonths(start, 5),
  );
  assert.equal(r.users.a.league, "Bronze");
  assert.equal(r.users.a.xp.Smarts, 75);
  assert.equal(r.users.a.level, 1);
  assert.equal(r.competition.seasonStart, Date.UTC(2026, 5, 1));
  assert.equal(r.leagueBoards.Bronze.a.xp, 0);
});
test("month arithmetic clamps month-end", () =>
  assert.equal(addMonths(Date.UTC(2026, 8, 30), 5), Date.UTC(2027, 1, 28)));
test("tie order is stable descending user ID", () => {
  const users = Object.fromEntries(
    Array.from({ length: 16 }, (_, i) => [
      `u${String(i).padStart(2, "0")}`,
      player(40),
    ]),
  );
  const r = advance(
    { competition: competition(start), users },
    start + 7 * DAY,
  );
  assert.equal(r.users.u00.league, "Bronze");
  assert.equal(r.users.u15.league, "Silver");
});
test("legacy profile migration preserves XP", () => {
  const p = profile(
    { name: "Old", xp: { Social: 420, Smarts: 0, Guts: 0, Vitality: 0 } },
    start,
  );
  assert.equal(p.level, 3);
  assert.equal(p.levels.Social, 3);
  assert.equal(p.receipts.compliment.lastDay, day);
});
test("partial last week never counts earnings from next season", () => {
  const c = { ...competition(start), weekStartDay: day, weekEndDay: day + 2 };
  const p = { ...player(40), earnings: { [day]: 40, [day + 2]: 500 } };
  assert.equal(boardEntry(p, c).xp, 40);
});
