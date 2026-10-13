import { profile, DAY, SavedProfile } from "../shared/progression";
export type Stat = "Social" | "Guts" | "Smarts" | "Vitality";
export type Challenge = {
  id: string;
  stat: Stat;
  title: string;
  description: string;
  xp: number;
  minutes: number;
  difficulty: string;
};
export const stats: Stat[] = ["Social", "Guts", "Smarts", "Vitality"];
export const challenges: Challenge[] = [
  {
    id: "compliment",
    stat: "Social",
    title: "Make someone’s day",
    description:
      "Give someone a genuine compliment. Notice something thoughtful they did, and let them know you appreciate it.",
    xp: 40,
    minutes: 5,
    difficulty: "Easy",
  },
  {
    id: "speak",
    stat: "Guts",
    title: "Take the first step",
    description:
      "Start a conversation with someone new in a comfortable public setting. Ask an open-ended question and listen. Respect their space if they are busy.",
    xp: 60,
    minutes: 10,
    difficulty: "Brave",
  },
  {
    id: "study",
    stat: "Smarts",
    title: "A little wiser, every day",
    description:
      "Study JavaScript closures for 30 minutes. Write a small function that remembers a value, then explain how it works in your own words.",
    xp: 75,
    minutes: 30,
    difficulty: "Focused",
  },
  {
    id: "walk",
    stat: "Vitality",
    title: "Step into a clearer mind",
    description:
      "Take a 20-minute walk at a pace that works for you. Put your phone away and notice your surroundings. An accessible movement break counts too.",
    xp: 50,
    minutes: 20,
    difficulty: "Easy",
  },
  {
    id: "listen",
    stat: "Social",
    title: "Be a better listener",
    description:
      "Check in with a friend. Ask how they really are, and give them ten minutes of your undivided attention.",
    xp: 50,
    minutes: 10,
    difficulty: "Easy",
  },
  {
    id: "build",
    stat: "Smarts",
    title: "Turn knowledge into something",
    description:
      "Build a tiny programming project: a counter, a calculator, or a command-line greeting. Spend 25 focused minutes experimenting.",
    xp: 65,
    minutes: 25,
    difficulty: "Focused",
  },
];
export type Progress = {
  level?: number;
  levels?: Record<Stat, number>;
  league?: string;
  saved?: SavedProfile;
  activityDays?: Record<string, boolean>;
  xp: Record<Stat, number>;
  completed: Record<string, string[]>;
  joined: boolean;
  name: string;
};
export const initialProgress: Progress = {
  xp: { Social: 0, Guts: 0, Smarts: 0, Vitality: 0 },
  completed: {},
  joined: false,
  name: "Explorer",
};
export const dayKey = (date = new Date()) => date.toISOString().slice(0, 10);
export const totalXP = (p: Progress) => stats.reduce((n, s) => n + p.xp[s], 0);
export const level = (xp: number) => Math.floor(xp / 200) + 1;
export function complete(p: Progress, id: string, day = dayKey()): Progress {
  const c = challenges.find((c) => c.id === id);
  if (!c || p.completed[day]?.includes(id)) return p;
  return {
    ...p,
    xp: { ...p.xp, [c.stat]: p.xp[c.stat] + c.xp },
    completed: { ...p.completed, [day]: [...(p.completed[day] || []), id] },
  };
}
export function streak(p: Progress) {
  let n = 0;
  const date = new Date();
  const active = (date: Date) =>
    p.activityDays?.[Math.floor(date.getTime() / DAY)] ||
    p.completed[dayKey(date)]?.length;
  if (!active(date)) date.setUTCDate(date.getUTCDate() - 1);
  while (active(date)) {
    n++;
    date.setUTCDate(date.getUTCDate() - 1);
  }
  return n;
}

export function fromCloud(value: unknown): Progress {
  const p = profile(value);
  const completed: Record<string, string[]> = {};
  for (const [id, r] of Object.entries(p.receipts)) {
    if (r.lastDay < 0) continue;
    const day = dayKey(new Date(r.lastDay * DAY));
    completed[day] = [...(completed[day] || []), id];
  }
  return {
    name: p.name,
    joined: p.joined,
    league: p.league,
    xp: p.xp as Record<Stat, number>,
    levels: p.levels as Record<Stat, number>,
    level: p.level,
    completed,
    activityDays: p.activityDays,
    saved: p,
  };
}
