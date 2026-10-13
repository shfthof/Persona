import { usePathname, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Modal,
  TextInput,
  useWindowDimensions,
  Image,
  ActivityIndicator,
  Platform,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Feather } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  User,
} from "firebase/auth";
import {
  ref,
  onValue,
  query,
  orderByChild,
  limitToLast,
} from "firebase/database";
import { saveProgress, syncLeaderboard, cloudError } from "./src/cloud";
import { LEAGUES, Competition, DAY } from "./shared/progression";
import { auth, db, configured } from "./src/firebase";
import {
  fromCloud,
  stats,
  challenges,
  initialProgress,
  Progress,
  Stat,
  Challenge,
  complete,
  dayKey,
  totalXP,
  level,
  streak,
} from "./src/game";
const blue = "#6191FF",
  ink = "#F5F6F8";
const icons: Record<Stat, React.ComponentProps<typeof Feather>["name"]> = {
  Social: "message-circle",
  Guts: "zap",
  Smarts: "book-open",
  Vitality: "sun",
};
const colors: Record<Stat, string> = {
  Social: "#6191FF",
  Guts: "#8EAEFF",
  Smarts: "#B1C7FF",
  Vitality: "#709EFF",
};
const tabs = [
  ["Overview", "grid"],
  ["Challenges", "check-square"],
  ["Ranked", "award"],
  ["My persona", "user"],
] as const;
function Icon({
  name,
  size = 20,
  color = ink,
}: {
  name: React.ComponentProps<typeof Feather>["name"];
  size?: number;
  color?: string;
}) {
  return <Feather name={name} size={size} color={color} />;
}
function Button({
  title,
  onPress,
  secondary = false,
  disabled = false,
}: {
  title: string;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        s.button,
        secondary && s.secondary,
        { opacity: disabled ? 0.5 : pressed ? 0.75 : 1 },
      ]}
    >
      <Text style={[s.buttonText, secondary && { color: ink }]}>{title}</Text>
    </Pressable>
  );
}
export default function App() {
  return (
    <SafeAreaProvider>
      <SafeAreaView
        style={{ flex: 1, backgroundColor: "#111318" }}
        edges={["top", "bottom"]}
      >
        <Persona />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
function Persona() {
  const { width } = useWindowDimensions(),
    wide = width > 1000;
  const pathname = usePathname();
  const router = useRouter();
  const routeMap = {
    Overview: "/",
    Challenges: "/challenges",
    Ranked: "/ranked",
    "My persona": "/persona",
  } as const;
  const tab =
    Object.entries(routeMap).find(([, path]) => path === pathname)?.[0] ||
    "Overview";
  const setTab = (name: string) =>
    router.navigate(routeMap[name as keyof typeof routeMap]);
  const [competition, setCompetition] = useState<Competition | null>(null);
  const [leagueFilter, setLeagueFilter] = useState("Bronze");
  const [cloudWarning, setCloudWarning] = useState("");
  const [serverOffset, setServerOffset] = useState(0);
  const [filter, setFilter] = useState("All"),
    [progress, setProgress] = useState<Progress>(initialProgress),
    [ready, setReady] = useState(false),
    [user, setUser] = useState<User | null>(null),
    [selected, setSelected] = useState<Challenge | null>(null),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [account, setAccount] = useState(false),
    [signup, setSignup] = useState(false),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [name, setName] = useState(""),
    [leaders, setLeaders] = useState<
      { id: string; name: string; xp: number }[]
    >([]),
    [today, setToday] = useState(dayKey());
  useEffect(() => {
    const t = setInterval(
      () => setToday(dayKey(new Date(Date.now() + serverOffset))),
      30000,
    );
    return () => clearInterval(t);
  }, [serverOffset]);
  useEffect(() => {
    let active = true;
    async function load(u: User | null) {
      setReady(false);
      setUser(u);
      try {
        const v = u ? null : await AsyncStorage.getItem("persona-demo-v1");
        if (active) setProgress(v ? JSON.parse(v) : initialProgress);
      } catch {
        if (active) setNotice("Could not restore local progress.");
      } finally {
        if (active) setReady(true);
      }
    }
    if (auth) {
      const unsubscribe = onAuthStateChanged(auth, load);
      return () => {
        active = false;
        unsubscribe();
      };
    }
    load(null);
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!user || !db) {
      setLeaders([]);
      return;
    }
    let active = true;
    const a = onValue(
      ref(db, `users/${user.uid}`),
      (snap) => {
        if (snap.exists()) setProgress(fromCloud(snap.val()));
      },
      (e) => setCloudWarning(cloudError(e)),
    );
    const b = onValue(
      ref(db, "competition"),
      (snap) => setCompetition(snap.val()),
      (e) => setCloudWarning(cloudError(e)),
    );
    const clock = onValue(ref(db, ".info/serverTimeOffset"), (snap) =>
      setServerOffset(snap.val() || 0),
    );
    saveProgress({ type: "ensure" }).catch((e) => {
      if (active) setCloudWarning(cloudError(e));
    });
    return () => {
      active = false;
      a();
      b();
      clock();
    };
  }, [user]);
  useEffect(() => {
    setLeagueFilter(progress.league || "Bronze");
  }, [progress.league]);
  useEffect(() => {
    if (!user || !db) return;
    return onValue(
      query(
        ref(db, `leagueBoards/${leagueFilter}`),
        orderByChild("xp"),
        limitToLast(100),
      ),
      (snap) => {
        const rows: { id: string; name: string; xp: number }[] = [];
        snap.forEach((child) => {
          const r = child.val();
          if (r.weekId === competition?.weekId)
            rows.push({ id: child.key!, name: r.name, xp: r.xp });
        });
        setLeaders(rows.reverse());
      },
      (e) => setCloudWarning(cloudError(e)),
    );
  }, [user, leagueFilter, competition?.weekId]);
  useEffect(() => {
    if (!user || !progress.saved || !competition) return;
    syncLeaderboard(progress.saved, competition).catch(() =>
      setCloudWarning(
        "Your progress is saved. Rankings will refresh when the scheduled league job runs.",
      ),
    );
  }, [user, progress.saved, competition]);
  useEffect(() => {
    if (ready && !user)
      AsyncStorage.setItem("persona-demo-v1", JSON.stringify(progress)).catch(
        () => setNotice("Local saving is unavailable."),
      );
  }, [progress, ready, user]);
  useEffect(() => {
    if (notice) {
      const t = setTimeout(() => setNotice(""), 5500);
      return () => clearTimeout(t);
    }
  }, [notice]);
  const done = progress.completed[today] || [],
    total = totalXP(progress);
  async function action(type: "complete" | "join" | "profile", id?: string) {
    if (busy) return;
    setBusy(true);
    try {
      if (user) {
        const saved = await saveProgress(
          {
            type,
            ...(id ? { id } : {}),
            ...(type === "profile" ? { name } : {}),
          },
          serverOffset,
        );
        setProgress(fromCloud(saved));
        setCloudWarning("");
      } else if (type === "complete") {
        setProgress((p) => complete(p, id!));
      } else if (type === "join") {
        setAccount(true);
        return;
      } else {
        if (name.trim().length < 2 || name.trim().length > 24)
          throw Error("Use a name with 2–24 characters.");
        setProgress((p) => ({ ...p, name: name.trim() }));
      }
      setSelected(null);
      setNotice(
        type === "complete"
          ? "Challenge complete. A little more you."
          : type === "join"
            ? "You’re in. Welcome to ranked."
            : "Profile saved.",
      );
    } catch (e: any) {
      setNotice(cloudError(e));
      if (user) setCloudWarning(cloudError(e));
    } finally {
      setBusy(false);
    }
  }
  async function authenticate() {
    if (!auth) {
      setNotice(
        "Add your Firebase configuration to enable accounts. Demo progress is saved on this device.",
      );
      return;
    }
    setBusy(true);
    try {
      if (signup)
        await createUserWithEmailAndPassword(auth, email.trim(), password);
      else await signInWithEmailAndPassword(auth, email.trim(), password);
      setAccount(false);
      setPassword("");
      setNotice("Welcome to your Persona account.");
    } catch (e: any) {
      setNotice(e.message);
    } finally {
      setBusy(false);
    }
  }
  const navigation = (
    <>
      {tabs.map(([label, icon]) => (
        <Pressable
          accessibilityRole="tab"
          accessibilityLabel={label}
          accessibilityState={{ selected: tab === label }}
          key={label}
          onPress={() => setTab(label)}
          style={[
            s.nav,
            tab === label && s.navActive,
            !wide && {
              flex: 1,
              justifyContent: "center",
              paddingHorizontal: 4,
              flexDirection: "column",
              gap: 5,
              paddingVertical: 9,
            },
          ]}
        >
          <Icon
            name={icon}
            size={19}
            color={tab === label ? blue : "#7B8290"}
          />
          {
            <Text
              style={[
                s.navText,
                !wide && { fontSize: 10 },
                tab === label && { color: blue, fontWeight: "700" },
              ]}
            >
              {label}
            </Text>
          }
        </Pressable>
      ))}
    </>
  );
  const statCards = (
    <View style={[s.statGrid, !wide && { flexWrap: "wrap" }]}>
      {stats.map((stat) => (
        <Pressable
          key={stat}
          onPress={() => {
            setFilter(stat);
            setTab("Challenges");
          }}
          style={[
            s.statCard,
            !wide && { minWidth: width > 600 ? "22%" : "44%" },
          ]}
        >
          <View style={s.between}>
            <View
              style={[s.statIcon, { backgroundColor: colors[stat] + "12" }]}
            >
              <Icon name={icons[stat]} color={colors[stat]} />
            </View>
            <Text style={s.small}>
              LEVEL {progress.levels?.[stat] ?? level(progress.xp[stat])}
            </Text>
          </View>
          <Text style={s.statName}>{stat}</Text>
          <Text style={s.statSubtitle}>
            {
              {
                Social: "Connect with confidence",
                Guts: "Find your brave",
                Smarts: "Stay curious",
                Vitality: "Feel your best",
              }[stat]
            }
          </Text>
          <View style={s.track}>
            <View
              style={[
                s.fill,
                {
                  width: `${(progress.xp[stat] % 200) / 2}%`,
                  backgroundColor: colors[stat],
                },
              ]}
            />
          </View>
          <View style={s.between}>
            <Text style={s.tiny}>{progress.xp[stat] % 200} / 200 XP</Text>
            <Text style={s.tiny}>
              Level {level(progress.xp[stat]) + 1}{" "}
              <Icon name="arrow-up-right" size={11} color="#8991A0" />
            </Text>
          </View>
        </Pressable>
      ))}
    </View>
  );
  const challengeList = (
    <>
      {challenges
        .filter((c) => filter === "All" || c.stat === filter)
        .map((c) => (
          <Pressable
            key={c.id}
            onPress={() => setSelected(c)}
            style={({ pressed }) => [
              s.challenge,
              { opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <View
              style={[
                s.challengeIcon,
                { backgroundColor: colors[c.stat] + "12" },
              ]}
            >
              <Icon
                name={done.includes(c.id) ? "check" : icons[c.stat]}
                color={colors[c.stat]}
                size={22}
              />
            </View>
            <View style={{ flex: 1, gap: 7 }}>
              <Text style={s.challengeTitle}>{c.title}</Text>
              <View style={s.row}>
                <Text style={[s.category, { color: colors[c.stat] }]}>
                  {c.stat}
                </Text>
                <Text style={s.tiny}>·</Text>
                <Text style={s.tiny}>{c.minutes} min</Text>
                {width > 500 && (
                  <>
                    <Text style={s.tiny}>·</Text>
                    <Text style={s.tiny}>{c.difficulty}</Text>
                  </>
                )}
              </View>
            </View>
            <Text style={[s.xp, done.includes(c.id) && { color: "#91B2FF" }]}>
              {done.includes(c.id) ? "Done" : `+${c.xp} XP`}
            </Text>
            <Icon
              name={done.includes(c.id) ? "check-circle" : "arrow-up-right"}
              size={18}
              color={done.includes(c.id) ? "#91B2FF" : "#A0A7B3"}
            />
          </Pressable>
        ))}
    </>
  );
  return (
    <View style={s.app}>
      <StatusBar style="light" />
      {wide && (
        <View style={s.sidebar}>
          <View style={s.brand}>
            <Image
              source={require("./assets/brand/icon.png")}
              style={s.logo}
              accessibilityLabel="Persona logo"
            />
            <Text style={s.brandName}>
              persona<Text style={{ color: blue }}>.</Text>
            </Text>
          </View>
          <Text style={s.eyebrow}>YOUR EVERYDAY EVOLUTION</Text>
          <View style={{ marginTop: 40, gap: 9 }}>{navigation}</View>
          <View style={{ flex: 1 }} />
          <View style={s.sidebarNote}>
            <View style={s.row}>
              <Icon name="star" />
              <Text style={s.noteTitle}>Small steps. Real growth.</Text>
            </View>
            <Text style={s.muted}>
              Your next level starts with what you do today.
            </Text>
          </View>
          <Pressable
            onPress={() => setAccount(true)}
            style={[
              s.row,
              { paddingTop: 25, borderTopWidth: 1, borderColor: "#23262D" },
            ]}
          >
            <View style={s.avatar}>
              <Text style={s.avatarText}>
                {progress.name.slice(0, 1).toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.bold}>{progress.name}</Text>
              <Text style={s.tiny}>
                {user ? "Personal account" : "Local demo account"}
              </Text>
            </View>
            <Icon name="chevrons-right" size={17} />
          </Pressable>
        </View>
      )}
      <View style={{ flex: 1 }}>
        <View style={[s.topbar, !wide && { paddingHorizontal: 22 }]}>
          <View style={s.row}>
            {!wide && (
              <Image
                source={require("./assets/brand/icon.png")}
                style={{ width: 30, height: 30, borderRadius: 8 }}
                accessibilityLabel="Persona masquerade mask"
              />
            )}
            <Text style={s.breadcrumb}>
              {wide ? "Your space" : "persona."}
              {width >= 400 && (
                <>
                  <Text style={{ color: "#C5CAD3" }}> / </Text>
                  <Text style={{ color: ink }}>{tab}</Text>
                </>
              )}
            </Text>
          </View>
          <View style={s.row}>
            <View style={s.streakPill}>
              <Icon name="zap" size={15} color="#91B2FF" />
              <Text
                style={{ fontSize: 12, fontWeight: "600", color: "#B1C7FF" }}
              >
                {streak(progress)} day streak
              </Text>
            </View>
            <Pressable
              onPress={() => setAccount(true)}
              accessibilityLabel="Open account"
            >
              <View style={[s.avatar, { width: 34, height: 34 }]}>
                <Text style={s.avatarText}>
                  {progress.name.slice(0, 1).toUpperCase()}
                </Text>
              </View>
            </Pressable>
          </View>
        </View>
        <ScrollView
          contentContainerStyle={[s.main, { padding: wide ? 36 : 20 }]}
        >
          <View style={{ maxWidth: 1250, width: "100%", alignSelf: "center" }}>
            <View style={[s.between, { marginBottom: 26 }]}>
              <View>
                <Text style={s.overline}>
                  {new Date()
                    .toLocaleDateString("en-US", {
                      weekday: "long",
                      month: "long",
                      day: "numeric",
                    })
                    .toUpperCase()}
                </Text>
                <Text style={[s.heading, !wide && { fontSize: 29 }]}>
                  {tab === "Overview"
                    ? `Hey, ${progress.name.toLowerCase()}.`
                    : tab === "Challenges"
                      ? "A little progress, daily."
                      : tab === "Ranked"
                        ? "Grow together."
                        : "This is your Persona."}
                </Text>
                <Text style={s.muted}>
                  {tab === "Overview"
                    ? "A new day. A new chance to become more you."
                    : tab === "Challenges"
                      ? "Real-world actions. Real personal growth."
                      : tab === "Ranked"
                        ? "Show up, earn XP, and climb the community leaderboard."
                        : "Every small action adds up to something bigger."}
                </Text>
              </View>
              {wide && (
                <View style={s.levelBadge}>
                  <Icon name="hexagon" size={21} color={blue} />
                  <Text style={s.bold}>
                    Level {progress.level ?? level(total)}
                  </Text>
                  <Text style={s.tiny}>The beginning</Text>
                </View>
              )}
            </View>
            {!!cloudWarning && (
              <View
                accessibilityRole="alert"
                style={[s.dailyCard, { marginBottom: 20, gap: 12 }]}
              >
                <Text style={s.muted}>{cloudWarning}</Text>
                <Button
                  title="Retry sync"
                  disabled={busy}
                  secondary
                  onPress={() => {
                    setBusy(true);
                    saveProgress({ type: "ensure" }, serverOffset)
                      .then((p) => {
                        setProgress(fromCloud(p));
                        setCloudWarning("");
                        return syncLeaderboard(p, competition);
                      })
                      .catch((e) => setCloudWarning(cloudError(e)))
                      .finally(() => setBusy(false));
                  }}
                />
              </View>
            )}
            {tab === "Overview" && (
              <>
                <View style={[s.hero, !wide && { height: 340 }]}>
                  <Image
                    source={require("./assets/brand/hero.png")}
                    resizeMode="contain"
                    style={{
                      position: "absolute",
                      height: "100%",
                      width: wide ? 525 : 500,
                      right: wide ? 0 : -150,
                      opacity: wide ? 1 : 0.45,
                    }}
                  />
                  <View style={s.heroContent}>
                    <View style={s.row}>
                      <View style={s.liveDot} />
                      <Text style={s.heroLabel}>THE BEST PROJECT IS YOU</Text>
                    </View>
                    <Text style={[s.heroTitle, !wide && { fontSize: 34 }]}>
                      Become{"\n"}more you.
                    </Text>
                    <Text style={s.heroDescription}>
                      Build confidence. Feed your curiosity.{"\n"}Turn everyday
                      moments into your next level.
                    </Text>
                    <Pressable
                      onPress={() => {
                        setTab("Challenges");
                        setFilter("All");
                      }}
                      style={s.heroButton}
                    >
                      <Text
                        style={{ color: ink, fontWeight: "700", fontSize: 13 }}
                      >
                        Explore today’s challenges
                      </Text>
                      <Icon name="arrow-right" size={17} />
                    </Pressable>
                  </View>
                  <Text style={s.heroCaption}>
                    YOUR POTENTIAL, IN PROGRESS.
                  </Text>
                </View>
                <View style={[s.between, { marginTop: 30, marginBottom: 17 }]}>
                  <Text style={s.sectionTitle}>Your four dimensions</Text>
                  <Pressable onPress={() => setTab("My persona")}>
                    <Text style={s.link}>
                      View your persona{" "}
                      <Icon name="arrow-up-right" size={13} color={blue} />
                    </Text>
                  </Pressable>
                </View>
                {statCards}
              </>
            )}
            {(tab === "Overview" || tab === "Challenges") && (
              <View style={[s.columns, !wide && { flexDirection: "column" }]}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={[s.between, { marginBottom: 17 }]}>
                    <View style={s.row}>
                      <Text style={s.sectionTitle}>Today’s challenges</Text>
                      <View style={s.count}>
                        <Text style={s.tiny}>
                          {done.length}/{challenges.length}
                        </Text>
                      </View>
                    </View>
                    <Text style={s.tiny}>Resets daily · UTC</Text>
                  </View>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={{ marginBottom: 16 }}
                    contentContainerStyle={{ gap: 8 }}
                  >
                    {["All", ...stats].map((f) => (
                      <Pressable
                        key={f}
                        onPress={() => setFilter(f)}
                        style={[s.filter, filter === f && s.filterActive]}
                      >
                        <Text
                          style={{
                            fontSize: 12,
                            color: filter === f ? "white" : "#A5ADBB",
                            fontWeight: "600",
                          }}
                        >
                          {f === "All" ? "All challenges" : f}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                  <View style={s.list}>{challengeList}</View>
                </View>
                <View style={{ width: wide ? 275 : "100%", gap: 18 }}>
                  <View style={s.dailyCard}>
                    <View style={s.between}>
                      <Text style={s.bold}>Your daily momentum</Text>
                      <Icon name="sun" color={blue} />
                    </View>
                    <Text style={s.bigNumber}>
                      {done.length}
                      <Text
                        style={{
                          fontSize: 17,
                          color: "#98A0AF",
                          fontWeight: "400",
                        }}
                      >
                        {" "}
                        / {challenges.length}
                      </Text>
                    </Text>
                    <Text style={s.muted}>challenges completed</Text>
                    <View style={[s.row, { gap: 6, marginTop: 20 }]}>
                      {challenges.map((_, i) => (
                        <View
                          key={i}
                          style={{
                            height: 7,
                            flex: 1,
                            borderRadius: 5,
                            backgroundColor: i < done.length ? blue : "#272C36",
                          }}
                        />
                      ))}
                    </View>
                    <Text style={[s.tiny, { marginTop: 15, lineHeight: 19 }]}>
                      {done.length === 6
                        ? "You showed up for every dimension. See you tomorrow."
                        : "You don’t have to do it all. Just take the next small step."}
                    </Text>
                  </View>
                  <View style={s.rankCard}>
                    <View style={s.rankEmblem}>
                      <Icon name="award" color={blue} size={34} />
                    </View>
                    <Text style={s.sectionTitle}>Better, together.</Text>
                    <Text
                      style={[s.muted, { textAlign: "center", lineHeight: 21 }]}
                    >
                      A little friendly competition.{"\n"}A lot of personal
                      growth.
                    </Text>
                    <Button
                      title={
                        progress.joined
                          ? "View leaderboard  ↗"
                          : "Discover ranked  ↗"
                      }
                      secondary
                      onPress={() => setTab("Ranked")}
                    />
                    <Text style={s.tiny}>YOUR ONLY WAY IS UP</Text>
                  </View>
                </View>
              </View>
            )}
            {tab === "Ranked" && (
              <>
                <View style={s.rankIntro}>
                  <Icon name="award" size={44} color={blue} />
                  <View style={{ flex: 1, gap: 8 }}>
                    <Text style={s.sectionTitle}>{leagueFilter} league</Text>
                    <Text style={s.muted}>
                      Weekly XP · Top 15 advance · Six leagues
                    </Text>
                  </View>
                  <Button
                    title={
                      progress.joined
                        ? "You’re in the league"
                        : user
                          ? "Join ranked"
                          : "Sign in to compete"
                    }
                    disabled={progress.joined || busy}
                    onPress={() => (user ? action("join") : setAccount(true))}
                  />
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 8, paddingBottom: 16 }}
                >
                  {LEAGUES.map((l) => (
                    <Pressable
                      key={l}
                      onPress={() => setLeagueFilter(l)}
                      style={[s.filter, l === leagueFilter && s.filterActive]}
                    >
                      <Text
                        style={{
                          color: l === leagueFilter ? "white" : "#A5ADBB",
                          fontSize: 12,
                        }}
                      >
                        {l}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
                <View style={[s.dailyCard, { marginBottom: 18, gap: 8 }]}>
                  <Text style={s.bold}>
                    Your league: {progress.league || "Bronze"}
                  </Text>
                  <Text style={s.muted}>
                    {competition
                      ? `Week closes ${new Date(competition.weekEndDay * DAY).toLocaleDateString()}. Season resets ${new Date(competition.seasonEnd).toLocaleDateString()}.`
                      : "The first season starts when the GitHub league job is activated."}
                  </Text>
                  <Text style={s.muted}>
                    Top 15 active players advance each week. Champions must
                    finish in the top 15 to stay; everyone else drops to
                    Diamond. Ties use user ID order. Personal levels never
                    reset.
                  </Text>
                  <Text style={s.tiny}>
                    Results update on the next scheduled server run. Showing up
                    to 100 players.
                  </Text>
                </View>
                <View style={s.list}>
                  <View style={[s.challenge, { backgroundColor: "#161A21" }]}>
                    <Text style={[s.small, { width: 40 }]}>RANK</Text>
                    <Text style={[s.small, { flex: 1 }]}>EXPLORER</Text>
                    <Text style={s.small}>WEEKLY XP</Text>
                  </View>
                  {leaders.length ? (
                    leaders.map((p, i) => (
                      <View key={p.id} style={s.challenge}>
                        <Text
                          style={[
                            s.bold,
                            { width: 40, color: i < 3 ? blue : ink },
                          ]}
                        >
                          {String(i + 1).padStart(2, "0")}
                        </Text>
                        <View style={s.avatar}>
                          <Text style={s.avatarText}>{p.name.slice(0, 1)}</Text>
                        </View>
                        <Text style={[s.bold, { flex: 1 }]}>
                          {p.name}
                          {p.id === user?.uid ? " (you)" : ""}
                        </Text>
                        <Text style={s.xp}>{p.xp.toLocaleString()} XP</Text>
                      </View>
                    ))
                  ) : (
                    <View style={s.empty}>
                      <Icon name="users" size={38} color={blue} />
                      <Text style={s.sectionTitle}>
                        {user
                          ? "Be the first to show up."
                          : "Your community is waiting."}
                      </Text>
                      <Text style={[s.muted, { textAlign: "center" }]}>
                        {user
                          ? "Join the league and complete your first challenge."
                          : "Sign in to see real rankings and compete with other explorers."}
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={[s.tiny, { marginTop: 15 }]}>
                  Firebase rules validate XP once per challenge per UTC day.
                  Challenges are self-reported.
                </Text>
              </>
            )}
            {tab === "My persona" && (
              <>
                <View style={s.profileHero}>
                  <View style={[s.avatar, { width: 68, height: 68 }]}>
                    <Text style={[s.avatarText, { fontSize: 28 }]}>
                      {progress.name.slice(0, 1)}
                    </Text>
                  </View>
                  <View style={{ flex: 1, gap: 7 }}>
                    <Text style={s.sectionTitle}>{progress.name}</Text>
                    <Text style={s.muted}>
                      Level {progress.level ?? level(total)} · {total} total XP
                      · {streak(progress)} day streak
                    </Text>
                  </View>
                  <Icon name="hexagon" color={blue} size={48} />
                </View>
                {statCards}
                <View style={[s.dailyCard, { marginTop: 24 }]}>
                  <Text style={s.sectionTitle}>Make it yours</Text>
                  <Text style={[s.muted, { marginVertical: 12 }]}>
                    Choose the name you’ll use in the community.
                  </Text>
                  <TextInput
                    placeholderTextColor="#858F9F"
                    keyboardAppearance="dark"
                    accessibilityLabel="Display name"
                    placeholder={progress.name}
                    value={name}
                    onChangeText={setName}
                    maxLength={24}
                    style={s.input}
                  />
                  <View style={{ alignSelf: "flex-start", marginTop: 14 }}>
                    <Button
                      title="Save persona"
                      disabled={busy}
                      onPress={() => action("profile")}
                    />
                  </View>
                </View>
                <View style={[s.dailyCard, { marginTop: 20, gap: 12 }]}>
                  <Text style={s.sectionTitle}>Your milestones</Text>
                  {[200, 500, 1000].map((x) => (
                    <View key={x} style={s.between}>
                      <View style={s.row}>
                        <Icon
                          name={total >= x ? "check-circle" : "lock"}
                          color={total >= x ? blue : "#A5ADBA"}
                        />
                        <Text style={s.muted}>
                          {x === 200
                            ? "First chapter"
                            : x === 500
                              ? "Finding your rhythm"
                              : "A thousand small steps"}
                        </Text>
                      </View>
                      <Text style={s.tiny}>{x} XP</Text>
                    </View>
                  ))}
                </View>
              </>
            )}
            <View style={s.footer}>
              <Text style={s.tiny}>persona. / Become more you.</Text>
              <Text style={s.tiny}>
                {user
                  ? "Synced with Firebase"
                  : "Demo mode · Saved on this device"}
              </Text>
            </View>
          </View>
        </ScrollView>
        {!wide && <View style={s.bottomNav}>{navigation}</View>}
      </View>
      <Modal
        visible={!!selected || account}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setSelected(null);
          setAccount(false);
        }}
      >
        <View style={s.overlay}>
          <View style={s.modal}>
            <Pressable
              accessibilityLabel="Close dialog"
              onPress={() => {
                setSelected(null);
                setAccount(false);
              }}
              style={{ alignSelf: "flex-end", padding: 5 }}
            >
              <Icon name="x" />
            </Pressable>
            {selected ? (
              <>
                <View
                  style={[
                    s.statIcon,
                    {
                      backgroundColor: colors[selected.stat] + "12",
                      marginBottom: 20,
                    },
                  ]}
                >
                  <Icon
                    name={icons[selected.stat]}
                    color={colors[selected.stat]}
                  />
                </View>
                <Text style={s.overline}>
                  {selected.stat.toUpperCase()} · {selected.minutes} MINUTES
                </Text>
                <Text style={[s.heading, { fontSize: 29, marginVertical: 12 }]}>
                  {selected.title}
                </Text>
                <Text style={[s.muted, { lineHeight: 25, marginBottom: 22 }]}>
                  {selected.description}
                </Text>
                <View style={[s.row, { marginBottom: 26 }]}>
                  <Icon name="zap" color={blue} />
                  <Text style={s.xp}>
                    +{selected.xp} XP toward {selected.stat}
                  </Text>
                </View>
                <Button
                  title={
                    done.includes(selected.id)
                      ? "Completed today"
                      : busy
                        ? "Saving…"
                        : "I did it · Complete challenge"
                  }
                  disabled={busy || done.includes(selected.id)}
                  onPress={() => action("complete", selected.id)}
                />
                <Text style={[s.tiny, { textAlign: "center", marginTop: 15 }]}>
                  Do the challenge in real life, then check it off here.
                </Text>
              </>
            ) : (
              <>
                <Text style={[s.heading, { fontSize: 30 }]}>
                  {user
                    ? "Your account"
                    : signup
                      ? "Your next chapter."
                      : "Welcome to Persona."}
                </Text>
                <Text style={[s.muted, { marginVertical: 18, lineHeight: 22 }]}>
                  {user
                    ? user.email
                    : configured
                      ? "Save your progress across devices and join the league."
                      : "You’re exploring a local demo. Firebase configuration is needed to enable accounts and live rankings."}
                </Text>
                {user ? (
                  <Button
                    title="Sign out"
                    onPress={async () => {
                      try {
                        await signOut(auth!);
                        setAccount(false);
                      } catch {
                        setNotice("Could not sign out. Please try again.");
                      }
                    }}
                  />
                ) : (
                  <>
                    <TextInput
                      placeholderTextColor="#858F9F"
                      keyboardAppearance="dark"
                      accessibilityLabel="Email"
                      style={s.input}
                      placeholder="Email address"
                      autoCapitalize="none"
                      keyboardType="email-address"
                      value={email}
                      onChangeText={setEmail}
                    />
                    <TextInput
                      placeholderTextColor="#858F9F"
                      keyboardAppearance="dark"
                      accessibilityLabel="Password"
                      style={[s.input, { marginTop: 12, marginBottom: 20 }]}
                      placeholder="Password (at least 6 characters)"
                      secureTextEntry
                      value={password}
                      onChangeText={setPassword}
                    />
                    <Button
                      title={
                        busy
                          ? "Please wait…"
                          : signup
                            ? "Create account"
                            : "Sign in"
                      }
                      disabled={busy || !configured}
                      onPress={authenticate}
                    />
                    <Pressable
                      onPress={() => setSignup(!signup)}
                      style={{ padding: 18 }}
                    >
                      <Text style={[s.link, { textAlign: "center" }]}>
                        {signup
                          ? "Already have an account? Sign in"
                          : "New here? Create an account"}
                      </Text>
                    </Pressable>
                  </>
                )}
              </>
            )}
          </View>
        </View>
      </Modal>
      {!!notice && (
        <View accessibilityRole="alert" style={s.toast}>
          <Icon name="info" size={18} color="white" />
          <Text
            style={{ color: "white", flex: 1, fontSize: 13, lineHeight: 19 }}
          >
            {notice}
          </Text>
          <Pressable onPress={() => setNotice("")}>
            <Icon name="x" size={16} color="white" />
          </Pressable>
        </View>
      )}
      {!ready && (
        <View style={s.loading}>
          <ActivityIndicator color={blue} />
        </View>
      )}
    </View>
  );
}
const s = StyleSheet.create({
  app: { flex: 1, backgroundColor: "#08090B", flexDirection: "row" },
  sidebar: {
    width: 238,
    backgroundColor: "#111318",
    borderRightWidth: 1,
    borderColor: "#23262D",
    padding: 25,
    paddingTop: 35,
  },
  brand: { flexDirection: "row", alignItems: "center", gap: 10 },
  logo: {
    width: 35,
    height: 37,
    borderRadius: 11,
    backgroundColor: "#285FE0",
    alignItems: "center",
    justifyContent: "center",
  },
  logoText: {
    fontSize: 35,
    fontWeight: "800",
    color: "white",
    lineHeight: 38,
    marginTop: -5,
  },
  brandName: {
    fontSize: 30,
    fontWeight: "700",
    letterSpacing: -1.5,
    color: "#F5F6F8",
  },
  eyebrow: {
    fontSize: 8.5,
    letterSpacing: 1.45,
    color: "#9AA1AD",
    marginTop: 17,
  },
  nav: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    paddingVertical: 15,
    paddingHorizontal: 16,
    borderRadius: 9,
  },
  navActive: { backgroundColor: "#16223B" },
  navText: { color: "#A5ADBB", fontSize: 13, fontWeight: "500" },
  sidebarNote: { paddingBottom: 28, gap: 12 },
  noteTitle: { fontSize: 11, fontWeight: "600", color: ink },
  topbar: {
    height: 78,
    paddingHorizontal: 36,
    borderBottomWidth: 1,
    borderColor: "#23262D",
    backgroundColor: "#0D0F13",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  breadcrumb: { fontSize: 12, color: "#8D95A2" },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  between: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  avatar: {
    width: 39,
    height: 39,
    borderRadius: 30,
    backgroundColor: "#18243D",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: { color: "#B1C7FF", fontWeight: "700", fontSize: 15 },
  streakPill: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    backgroundColor: "#14213A",
    borderWidth: 1,
    borderColor: "#263B60",
    paddingVertical: 7,
    paddingHorizontal: 11,
    borderRadius: 20,
  },
  main: { paddingBottom: 25 },
  overline: {
    fontSize: 9,
    letterSpacing: 1.5,
    color: "#8B93A1",
    fontWeight: "600",
  },
  heading: {
    fontSize: 34,
    letterSpacing: -1.1,
    fontWeight: "600",
    color: ink,
    marginTop: 10,
    marginBottom: 9,
  },
  muted: { fontSize: 12, color: "#A5ADBB", lineHeight: 20 },
  bold: { fontSize: 13, fontWeight: "600", color: ink },
  tiny: { fontSize: 10, color: "#9199A7" },
  small: {
    fontSize: 8.5,
    letterSpacing: 1,
    color: "#8A94A5",
    fontWeight: "600",
  },
  levelBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    padding: 12,
    borderWidth: 1,
    borderColor: "#272B34",
    borderRadius: 10,
    backgroundColor: "#111318",
  },
  hero: {
    height: 295,
    backgroundColor: "#030817",
    borderRadius: 18,
    overflow: "hidden",
    justifyContent: "center",
  },
  heroContent: { padding: 30 },
  liveDot: { width: 5, height: 5, borderRadius: 5, backgroundColor: "#88A9FF" },
  heroLabel: {
    fontSize: 8,
    letterSpacing: 1.8,
    color: "#A9BCE9",
    fontWeight: "600",
  },
  heroTitle: {
    fontSize: 43,
    lineHeight: 47,
    fontWeight: "600",
    letterSpacing: -1.4,
    color: "white",
    marginTop: 15,
  },
  heroDescription: {
    fontSize: 11,
    color: "#A1AFC7",
    lineHeight: 18,
    marginTop: 10,
  },
  heroButton: {
    flexDirection: "row",
    alignSelf: "flex-start",
    gap: 15,
    alignItems: "center",
    backgroundColor: "#111318",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 7,
    marginTop: 20,
  },
  heroCaption: {
    position: "absolute",
    right: 23,
    bottom: 23,
    fontSize: 7,
    letterSpacing: 1.6,
    color: "#8396BC",
  },
  sectionTitle: {
    fontSize: 17,
    letterSpacing: -0.3,
    fontWeight: "600",
    color: ink,
  },
  link: { fontSize: 11, fontWeight: "600", color: blue },
  statGrid: { flexDirection: "row", gap: 13 },
  statCard: {
    flex: 1,
    padding: 18,
    borderWidth: 1,
    borderColor: "#272B34",
    borderRadius: 12,
    backgroundColor: "#111318",
  },
  statIcon: {
    height: 36,
    width: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  statName: { fontSize: 17, color: ink, fontWeight: "600", marginTop: 17 },
  statSubtitle: { fontSize: 9.5, color: "#9199A7", marginTop: 5 },
  track: {
    height: 4,
    backgroundColor: "#272C36",
    borderRadius: 4,
    overflow: "hidden",
    marginTop: 20,
    marginBottom: 10,
  },
  fill: { height: 4, borderRadius: 4 },
  columns: { flexDirection: "row", gap: 24, marginTop: 32 },
  filter: {
    borderRadius: 7,
    paddingVertical: 9,
    paddingHorizontal: 13,
    backgroundColor: "#20242C",
  },
  filterActive: { backgroundColor: "#285FE0" },
  count: {
    backgroundColor: "#20242C",
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  list: {
    backgroundColor: "#111318",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#272B34",
    overflow: "hidden",
  },
  challenge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 19,
    borderBottomWidth: 1,
    borderColor: "#20242C",
  },
  challengeIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  challengeTitle: { fontSize: 12, fontWeight: "600", color: ink },
  category: { fontSize: 9, fontWeight: "600" },
  xp: { fontSize: 11, fontWeight: "700", color: blue },
  dailyCard: {
    padding: 22,
    backgroundColor: "#111318",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#272B34",
  },
  bigNumber: {
    fontSize: 36,
    fontWeight: "600",
    color: ink,
    marginTop: 20,
    marginBottom: 4,
  },
  rankCard: {
    padding: 23,
    backgroundColor: "#101827",
    borderWidth: 1,
    borderColor: "#25344D",
    borderRadius: 12,
    alignItems: "center",
    gap: 14,
  },
  rankEmblem: {
    width: 64,
    height: 64,
    backgroundColor: "#1C2F53",
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  button: {
    paddingVertical: 13,
    paddingHorizontal: 20,
    backgroundColor: "#285FE0",
    borderRadius: 8,
    alignItems: "center",
  },
  secondary: {
    backgroundColor: "#111318",
    borderWidth: 1,
    borderColor: "#323846",
  },
  buttonText: { color: "white", fontSize: 12, fontWeight: "600" },
  footer: {
    marginTop: 32,
    paddingTop: 20,
    borderTopWidth: 1,
    borderColor: "#23262D",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  bottomNav: {
    flexDirection: "row",
    padding: 12,
    paddingBottom: 12,
    backgroundColor: "#111318",
    borderTopWidth: 1,
    borderColor: "#272B34",
  },
  rankIntro: {
    padding: 25,
    borderRadius: 14,
    backgroundColor: "#111C30",
    flexDirection: "row",
    alignItems: "center",
    gap: 20,
    marginBottom: 25,
    flexWrap: "wrap",
  },
  empty: { padding: 45, alignItems: "center", gap: 18 },
  profileHero: {
    padding: 25,
    borderRadius: 14,
    backgroundColor: "#111C30",
    flexDirection: "row",
    alignItems: "center",
    gap: 20,
    marginBottom: 25,
  },
  input: {
    borderWidth: 1,
    borderColor: "#343B48",
    borderRadius: 8,
    padding: 14,
    fontSize: 14,
    color: ink,
    backgroundColor: "#111318",
  },
  overlay: {
    flex: 1,
    backgroundColor: "#000000BB",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modal: {
    width: "100%",
    maxWidth: 470,
    backgroundColor: "#111318",
    padding: 28,
    borderRadius: 20,
  },
  toast: {
    position: "absolute",
    bottom: 90,
    left: "10%",
    right: "10%",
    maxWidth: 600,
    alignSelf: "center",
    backgroundColor: "#1C2B48",
    borderRadius: 12,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 20,
  },
  loading: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#111318",
    justifyContent: "center",
    alignItems: "center",
  },
});
