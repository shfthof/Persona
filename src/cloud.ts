import { get, ref, runTransaction, set } from "firebase/database";
import { auth, db } from "./firebase";
import {
  profile,
  transition,
  boardEntry,
  Competition,
  SavedProfile,
} from "../shared/progression";
export function cloudError(error: unknown): string {
  const e = error as { code?: string; message?: string };
  if (/permission.denied/i.test(`${e.code} ${e.message}`))
    return "Firebase rejected the save. Publish the updated database.rules.json in Realtime Database → Rules. This version does not use paid Cloud Functions.";
  if (/network|disconnect|unavailable/i.test(`${e.code} ${e.message}`))
    return "Could not reach Firebase. Check your connection and try again.";
  return e.message || "Could not save. Please try again.";
}
export async function saveProgress(
  action: { type: string; id?: string; name?: string },
  serverOffset = 0,
) {
  if (!auth?.currentUser || !db) throw Error("Sign in to save your progress.");
  const uid = auth.currentUser.uid;
  const target = ref(db, `users/${uid}`);
  // Read before transaction: RTDB may initially invoke a transaction with an empty local cache.
  const existing = await get(target);
  if (action.type !== "ensure" && existing.val()?.schemaVersion !== 2) {
    await runTransaction(
      target,
      (raw) => profile(raw, Date.now() + serverOffset),
      { applyLocally: false },
    );
  }
  let transitionError: Error | undefined;
  const result = await runTransaction(
    target,
    (raw) => {
      transitionError = undefined;
      try {
        return transition(raw, action, Date.now() + serverOffset);
      } catch (e) {
        transitionError = e as Error;
        return;
      }
    },
    { applyLocally: false },
  );
  if (transitionError) throw transitionError;
  if (!result.committed)
    throw Error("The save was interrupted. Please try again.");
  return profile(result.snapshot.val());
}
export async function syncLeaderboard(p: SavedProfile, c: Competition | null) {
  if (!p.joined || !c || !auth?.currentUser || !db) return;
  await set(
    ref(db, `leagueBoards/${p.league}/${auth.currentUser.uid}`),
    boardEntry(p, c),
  );
}
