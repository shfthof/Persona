import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { profile, transition, boardEntry, DAY } from "../shared/progression";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { advance, competition } = require("../automation/leagues.cjs");
let env: RulesTestEnvironment;
const enabled = !!process.env.FIREBASE_DATABASE_EMULATOR_HOST;
before(async () => {
  if (enabled)
    env = await initializeTestEnvironment({
      projectId: "demo-persona",
      database: {
        host: "127.0.0.1",
        port: 9000,
        rules: readFileSync("database.rules.json", "utf8"),
      },
    });
});
after(async () => {
  if (env) await env.cleanup();
});
beforeEach(async () => {
  if (env) await env.clearDatabase();
});
const check = (name: string, fn: () => Promise<void>) =>
  test(name, { skip: !enabled }, fn);
const db = () => env.authenticatedContext("alice").database();
async function seed(path: string, data: any) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await ctx.database().ref(path).set(data);
  });
}
check(
  "owner can create profile, rename, join and complete with persisted levels",
  async () => {
    const ref = db().ref("users/alice");
    let p = profile(null);
    await assertSucceeds(ref.set(p));
    p = transition(p, { type: "profile", name: "Alice" });
    await assertSucceeds(ref.set(p));
    p = transition(p, { type: "join" });
    await assertSucceeds(ref.set(p));
    p = transition(p, { type: "complete", id: "study" });
    await assertSucceeds(ref.set(p));
    assert.equal((await ref.get()).val().totalXp, 75);
    assert.equal((await ref.get()).val().levels.Smarts, 1);
  },
);
check("unranked challenge completion works", async () => {
  const ref = db().ref("users/alice");
  const p = profile(null);
  await ref.set(p);
  await assertSucceeds(
    ref.set(transition(p, { type: "complete", id: "walk" })),
  );
});
check(
  "concurrent distinct task transactions preserve both rewards",
  async () => {
    const ref = db().ref("users/alice");
    await ref.set(profile(null));
    await Promise.all(
      ["study", "walk"].map((id) =>
        ref.transaction((raw) =>
          transition(raw, { type: "complete", id }),
        ),
      ),
    );
    assert.equal((await ref.get()).val().totalXp, 125);
  },
);
check(
  "cannot read another profile, delete own profile, inflate XP, levels or league",
  async () => {
    const p = profile(null);
    await seed("users/alice", p);
    await assertFails(
      env.authenticatedContext("bob").database().ref("users/alice").get(),
    );
    await assertFails(db().ref("users/alice").remove());
    for (const patch of [
      { xp: { ...p.xp, Social: 9999 } },
      { level: 99 },
      { league: "Champions" },
      { baseXp: { ...p.baseXp, Social: 500 } },
    ])
      await assertFails(
        db()
          .ref("users/alice")
          .set({ ...p, ...patch }),
      );
  },
);
check(
  "cannot replay a challenge, backdate receipts or erase counters",
  async () => {
    let p = profile(null);
    await seed("users/alice", p);
    p = transition(p, { type: "complete", id: "study" });
    await db().ref("users/alice").set(p);
    const forged = structuredClone(p);
    forged.receipts.study.count++;
    forged.xp.Smarts += 75;
    forged.totalXp += 75;
    await assertFails(db().ref("users/alice").set(forged));
    await assertFails(db().ref("users/alice/receipts/study").remove());
    await assertFails(db().ref("users/alice/receipts/study/lastDay").set(-1));
  },
);
check("no cross-user writes or unauthenticated reads/writes", async () => {
  await assertFails(
    env
      .unauthenticatedContext()
      .database()
      .ref("users/alice")
      .set(profile(null)),
  );
  await assertFails(
    env
      .authenticatedContext("bob")
      .database()
      .ref("users/alice")
      .set(profile(null)),
  );
  await assertFails(
    env.unauthenticatedContext().database().ref("competition").get(),
  );
});
check(
  "leaderboard accepts only validated projection and indexed bounded queries",
  async () => {
    const now = Date.now();
    const c = competition(Math.floor(now / DAY) * DAY);
    let p = transition(profile(null), { type: "join" });
    p = transition(p, { type: "complete", id: "study" });
    await seed("users/alice", p);
    await seed("competition", c);
    const entry = boardEntry(p, c);
    await assertSucceeds(db().ref("leagueBoards/Bronze/alice").set(entry));
    await assertFails(
      db()
        .ref("leagueBoards/Bronze/alice")
        .set({ ...entry, xp: 999 }),
    );
    await assertFails(db().ref("leagueBoards/Champions/alice").set(entry));
    await assertSucceeds(
      db().ref("leagueBoards/Bronze").orderByChild("xp").limitToLast(100).get(),
    );
    await assertFails(db().ref("leagueBoards/Bronze").get());
  },
);
check(
  "client cannot change seasons, league results or scheduler timestamps",
  async () => {
    for (const path of ["competition", "leagueResults", "leagueJob"])
      await assertFails(db().ref(path).set({ hacked: true }));
  },
);
check("legacy migration retains trusted XP and stores levels", async () => {
  const old = {
    name: "Explorer",
    xp: { Social: 210, Guts: 0, Smarts: 0, Vitality: 0 },
    joined: false,
  };
  await seed("users/alice", old);
  await assertSucceeds(db().ref("users/alice").set(profile(old)));
  assert.equal((await db().ref("users/alice/level").get()).val(), 2);
});
check("earnings cannot be forged independently or backdated", async () => {
  let p = transition(profile(null), { type: "join" });
  await seed("users/alice", p);
  const day = Math.floor(Date.now() / DAY);
  await assertFails(db().ref(`users/alice/earnings/${day}`).set(1000));
  await assertFails(
    db()
      .ref(`users/alice/earnings/${day - 1}`)
      .set(1000),
  );
});
check(
  "after server promotion client can continue saving but cannot demote itself",
  async () => {
    const now = Date.now(),
      start = Math.floor(now / DAY) * DAY - 7 * DAY;
    const p = {
      ...transition(profile(null), { type: "join" }),
      earnings: { [start / DAY]: 50 },
    };
    const root = advance(
      { competition: competition(start), users: { alice: p } },
      now,
    );
    await seed("/", root);
    await assertSucceeds(
      db()
        .ref("users/alice")
        .set(transition(root.users.alice, { type: "complete", id: "study" })),
    );
    await assertFails(db().ref("users/alice/league").set("Bronze"));
  },
);
