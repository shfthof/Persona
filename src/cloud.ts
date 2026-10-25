import { supabase } from "./supabase";
import { SavedProfile, Competition } from "../shared/progression";
export function cloudError(error: unknown): string {
  const e = error as { code?: string; message?: string };
  if (/network|fetch|disconnect|unavailable/i.test(`${e.code} ${e.message}`))
    return "Could not reach Supabase. Check your connection and try again.";
  return e.message || "Could not save. Please try again.";
}
export async function saveProgress(action: {
  type: string;
  id?: string;
  name?: string;
}) {
  if (!supabase) throw Error("Accounts are not configured.");
  const { data, error } = await supabase.rpc("save_progress", {
    action: action.type,
    challenge_id: action.id ?? null,
    display_name: action.name ?? null,
  });
  if (error) throw error;
  return data as SavedProfile;
}
export async function getCompetition() {
  if (!supabase) throw Error("Accounts are not configured.");
  const { data, error } = await supabase
    .from("competition")
    .select("data")
    .eq("id", true)
    .single();
  if (error) throw error;
  return data.data as Competition;
}
export async function getLeaderboard(league: string) {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("get_leaderboard", {
    league_name: league,
  });
  if (error) throw error;
  return data as { id: string; name: string; xp: number }[];
}
