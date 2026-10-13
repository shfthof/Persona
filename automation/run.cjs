const { initializeApp, cert } = require("firebase-admin/app");
const { getDatabase } = require("firebase-admin/database");
const { advance } = require("./leagues.cjs");
async function main() {
  const credentials = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!credentials)
    throw Error(
      "Add the FIREBASE_SERVICE_ACCOUNT GitHub Actions secret first.",
    );
  const account = JSON.parse(credentials);
  if (account.project_id !== "persona-a6e00")
    throw Error("The service account must belong to persona-a6e00.");
  initializeApp({
    credential: cert(account),
    databaseURL:
      "https://persona-a6e00-default-rtdb.europe-west1.firebasedatabase.app",
  });
  const now = Date.now();
  await getDatabase()
    .ref()
    .transaction((root) => advance(root, now));
  console.log("League rollover and leaderboard reconciliation completed.");
}
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
