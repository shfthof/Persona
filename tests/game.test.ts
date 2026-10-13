import { test } from "node:test";
import assert from "node:assert/strict";
import {
  complete,
  initialProgress,
  level,
  totalXP,
  dayKey,
  challenges,
} from "../src/game";
test("completion awards XP only to the intended stat without changing input", () => {
  const p = complete(initialProgress, "study", "2026-10-13");
  assert.equal(p.xp.Smarts, 75);
  assert.equal(p.xp.Social, 0);
  assert.equal(initialProgress.xp.Smarts, 0);
  assert.deepEqual(p.completed["2026-10-13"], ["study"]);
});
test("repeat completion cannot award duplicate XP", () => {
  const p = complete(initialProgress, "study", "2026-10-13");
  assert.strictEqual(complete(p, "study", "2026-10-13"), p);
});
test("the same challenge is available on the next UTC day", () => {
  const p = complete(
    complete(initialProgress, "walk", "2026-10-13"),
    "walk",
    "2026-10-14",
  );
  assert.equal(p.xp.Vitality, 100);
});
test("unknown challenge does not change progress", () =>
  assert.strictEqual(complete(initialProgress, "unknown"), initialProgress));
test("levels advance at 200 XP boundaries", () => {
  assert.equal(level(199), 1);
  assert.equal(level(200), 2);
  assert.equal(level(400), 3);
});
test("daily catalog produces exactly its declared total", () => {
  const p = challenges.reduce(
    (p, c) => complete(p, c.id, "2026-10-13"),
    initialProgress,
  );
  assert.equal(totalXP(p), 340);
  assert.equal(p.completed["2026-10-13"].length, 6);
});
test("daily reset uses UTC regardless of local offset", () =>
  assert.equal(dayKey(new Date("2026-10-14T01:30:00+03:00")), "2026-10-13"));
