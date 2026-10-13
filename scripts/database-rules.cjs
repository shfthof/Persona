// Generate explicit, auditable validation for the six fixed challenge rewards.
const fs = require("node:fs");
const { STATS, CATALOG } = require("../shared/progression");
const n = (p) => `newData.child('${p}').val()`;
const old = (p) => `data.child('${p}').val()`;
const oldNumber = (p) => `(data.child('${p}').exists() ? ${old(p)} : 0)`;
const same = (p) => `${n(p)} === ${old(p)}`;
const today = "((now - now % 86400000) / 86400000)";
const current = `${old("schemaVersion")} === 2`;
const total = STATS.map((s) => n("xp/" + s)).join(" + ");
const requirements = [
  "schemaVersion",
  "name",
  "joined",
  "league",
  "baseXp",
  "receipts",
  "xp",
  "levels",
  "totalXp",
  "level",
];
const user = {
  ".read": "auth != null && auth.uid === $uid",
  ".write": "auth != null && auth.uid === $uid && newData.exists()",
  ".validate": `newData.hasChildren(${JSON.stringify(requirements)}) && ${n("schemaVersion")} === 2 && ${n("totalXp")} === (${total}) && ${n("level")} === 1 + (${n("totalXp")} - ${n("totalXp")} % 200) / 200`,
  schemaVersion: { ".validate": "newData.val() === 2" },
  name: {
    ".validate":
      "newData.isString() && newData.val().length >= 2 && newData.val().length <= 24",
  },
  joined: {
    ".validate":
      "newData.isBoolean() && (data.val() !== true || newData.val() === true)",
  },
  league: {
    ".validate": "newData.val() === (data.exists() ? data.val() : 'Bronze')",
  },
  totalXp: { ".validate": "newData.isNumber() && newData.val() >= 0" },
  level: { ".validate": "newData.isNumber()" },
  baseXp: {
    ".validate": `newData.hasChildren(${JSON.stringify(STATS)})`,
    $other: { ".validate": false },
  },
  xp: {
    ".validate": `newData.hasChildren(${JSON.stringify(STATS)})`,
    $other: { ".validate": false },
  },
  levels: {
    ".validate": `newData.hasChildren(${JSON.stringify(STATS)})`,
    $other: { ".validate": false },
  },
  receipts: {
    ".validate": `newData.hasChildren(${JSON.stringify(Object.keys(CATALOG))})`,
    $other: { ".validate": false },
  },
  activityDays: {
    $day: {
      ".validate":
        "newData.val() === true && (data.val() === true || ($day === ((now - now % 86400000) / 86400000) + '' && newData.parent().parent().child('totalXp').val() > root.child('users').child($uid).child('totalXp').val()))",
    },
  },
  earnings: {
    $day: {
      ".validate": `newData.isNumber() && (newData.val() === data.val() || ($day === ${today} + '' && newData.parent().parent().child('joined').val() === true && newData.val() === (data.exists() ? data.val() : 0) + newData.parent().parent().child('totalXp').val() - (root.child('users').child($uid).child('totalXp').exists() ? root.child('users').child($uid).child('totalXp').val() : 0)))`,
    },
  },
  $other: { ".validate": false },
};
for (const stat of STATS) {
  const sum = Object.entries(CATALOG)
    .filter(([, c]) => c[0] === stat)
    .map(([id, c]) => `${n("receipts/" + id + "/count")} * ${c[1]}`)
    .join(" + ");
  user[".validate"] +=
    ` && ${n("baseXp/" + stat)} === (${current} ? ${old("baseXp/" + stat)} : ${oldNumber("xp/" + stat)}) && ${n("xp/" + stat)} === ${n("baseXp/" + stat)} + ${sum} && ${n("levels/" + stat)} === 1 + (${n("xp/" + stat)} - ${n("xp/" + stat)} % 200) / 200`;
  user.baseXp[stat] = {
    ".validate": "newData.isNumber() && newData.val() >= 0",
  };
  user.xp[stat] = { ".validate": "newData.isNumber() && newData.val() >= 0" };
  user.levels[stat] = { ".validate": "newData.isNumber()" };
}
for (const id of Object.keys(CATALOG)) {
  const c = "receipts/" + id + "/count",
    d = "receipts/" + id + "/lastDay";
  user[".validate"] +=
    ` && (${current} ? ((${same(c)} && ${same(d)}) || (${n(c)} === ${old(c)} + 1 && ${n(d)} === ${today} && ${old(d)} < ${today})) : (${n(c)} === 0 && ${n(d)} === (data.exists() ? ${today} : -1)))`;
  user.receipts[id] = {
    ".validate": "newData.hasChildren(['count','lastDay'])",
    count: { ".validate": "newData.isNumber()" },
    lastDay: { ".validate": "newData.isNumber()" },
    $other: { ".validate": false },
  };
}
// Prevent banking XP before opting into ranked, and require all earned XP to be recorded.
const earn = `'earnings/' + ${today}`;
user[".validate"] +=
  ` && (${current} && ${old("joined")} === true && ${n("totalXp")} > ${old("totalXp")} ? newData.child(${earn}).val() === (data.child(${earn}).exists() ? data.child(${earn}).val() : 0) + ${n("totalXp")} - ${old("totalXp")} : (newData.child(${earn}).val() === data.child(${earn}).val()))`;
const u = "root.child('users').child($uid)";
const c = "root.child('competition')";
const score = Array.from(
  { length: 7 },
  (_, i) =>
    `(${c}.child('weekStartDay').val() + ${i} < ${c}.child('weekEndDay').val() && ${u}.child('earnings').child(('' + (${c}.child('weekStartDay').val() + ${i}))).exists() ? ${u}.child('earnings').child(('' + (${c}.child('weekStartDay').val() + ${i}))).val() : 0)`,
).join(" + ");
const rules = {
  rules: {
    ".read": false,
    ".write": false,
    users: { $uid: user },
    competition: { ".read": "auth != null" },
    leagueResults: { $uid: { ".read": "auth != null && auth.uid === $uid" } },
    leagueBoards: {
      $league: {
        ".read":
          "auth != null && query.orderByChild === 'xp' && query.limitToLast != null && query.limitToLast <= 100",
        ".indexOn": ["xp"],
        $uid: {
          ".read": "auth != null && auth.uid === $uid",
          ".write": `auth != null && auth.uid === $uid && ${u}.child('joined').val() === true && ${u}.child('league').val() === $league && ${c}.exists() && newData.exists()`,
          ".validate": `newData.hasChildren(['name','xp','level','weekId']) && ${n("name")} === ${u}.child('name').val() && ${n("level")} === ${u}.child('level').val() && ${n("weekId")} === ${c}.child('weekId').val() && ${n("xp")} === (${score})`,
          name: { ".validate": "newData.isString()" },
          xp: { ".validate": "newData.isNumber()" },
          level: { ".validate": "newData.isNumber()" },
          weekId: { ".validate": "newData.isString()" },
          $other: { ".validate": false },
        },
      },
    },
  },
};
fs.writeFileSync("database.rules.json", JSON.stringify(rules, null, 2) + "\n");
