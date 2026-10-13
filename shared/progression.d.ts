export const DAY: number;
export const STATS: ("Social" | "Guts" | "Smarts" | "Vitality")[];
export const CATALOG: Record<string, [string, number]>;
export const LEAGUES: string[];
export type Competition = {
  seasonId: string;
  seasonStart: number;
  seasonEnd: number;
  weekId: string;
  weekStartDay: number;
  weekEndDay: number;
};
export type SavedProfile = {
  schemaVersion: 2;
  name: string;
  joined: boolean;
  league: string;
  baseXp: Record<string, number>;
  receipts: Record<string, { count: number; lastDay: number }>;
  earnings: Record<string, number>;
  activityDays: Record<string, boolean>;
  xp: Record<string, number>;
  levels: Record<string, number>;
  totalXp: number;
  level: number;
};
export function dayNumber(time: number): number;
export function levelFor(xp: number): number;
export function profile(raw: unknown, now?: number): SavedProfile;
export function transition(
  raw: unknown,
  action: { type: string; name?: string; id?: string },
  now?: number,
): SavedProfile;
export function weekXP(
  p: SavedProfile,
  startDay: number,
  endDay: number,
): number;
export function boardEntry(
  p: SavedProfile,
  c: Competition,
): { name: string; xp: number; level: number; weekId: string };
