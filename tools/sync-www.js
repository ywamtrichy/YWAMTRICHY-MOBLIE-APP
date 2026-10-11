// Copies the phone web app from the office server project into this project's www folder.
// Run it after the phone app changes:  npm run sync-www
const fs = require("fs");
const path = require("path");
const from = path.join(__dirname, "..", "..", "ywam-server", "public", "m");
const to = path.join(__dirname, "..", "www");
if (!fs.existsSync(from)) { console.error("Cannot find " + from); process.exit(1); }
fs.rmSync(to, { recursive: true, force: true });
fs.cpSync(from, to, { recursive: true });
console.log("Copied phone app to www/");
