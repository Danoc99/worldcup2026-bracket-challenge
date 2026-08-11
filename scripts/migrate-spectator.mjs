// One-off migration script for the "spectator mode" transition.
//
// What this does against production KV:
//   1) Strips the `pin` field from every `entry:<slug>` record.
//   2) Renames the entry with slug "imboutakam" to slug "kam" with name "Kam".
//   3) Same rename for `knockout:imboutakam` -> `knockout:kam` if present.
//
// Predictions, knockout picks, updatedAt, and every other field are preserved.
//
// Usage (from the wc2026 project directory):
//   node scripts/migrate-spectator.mjs            # dry run: prints what would change
//   node scripts/migrate-spectator.mjs --apply    # actually writes to KV
//
// Requires: authenticated wrangler CLI (`npx wrangler login`).

import { execSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";

const NAMESPACE_ID = "01f9be5d023445ceac7c46d7afd007a7"; // from wrangler.toml
const RENAME_FROM_SLUG = "imboutakam";
const RENAME_TO_SLUG = "kam";
const RENAME_TO_NAME = "Kam";

const APPLY = process.argv.includes("--apply");

// --remote is required on wrangler v4+ to hit production KV; without it the
// CLI targets the local emulator, which returns [] for everything.
function wrangler(args) {
  const cmd = `npx wrangler kv ${args} --namespace-id=${NAMESPACE_ID} --remote`;
  return execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
}

function listKeys(prefix) {
  const out = wrangler(`key list --prefix=${prefix}`);
  const parsed = JSON.parse(out);
  return parsed.map((k) => k.name);
}

function getValue(key) {
  const out = wrangler(`key get "${key}"`);
  try { return JSON.parse(out); } catch { return null; }
}

function putValue(key, value) {
  if (!APPLY) return;
  const json = JSON.stringify(value);
  const tmp = `.migrate-${Date.now()}.json`;
  writeFileSync(tmp, json);
  try {
    execSync(`npx wrangler kv key put "${key}" --path=${tmp} --namespace-id=${NAMESPACE_ID} --remote`, { stdio: "inherit" });
  } finally {
    unlinkSync(tmp);
  }
}

function deleteKey(key) {
  if (!APPLY) return;
  execSync(`npx wrangler kv key delete "${key}" --namespace-id=${NAMESPACE_ID} --remote`, { stdio: "inherit" });
}

console.log(`Mode: ${APPLY ? "APPLY" : "DRY RUN"}`);
console.log(`KV namespace: ${NAMESPACE_ID}`);
console.log("");

console.log("Step 1: scrub PINs from entry:* records");
const entryKeys = listKeys("entry:");
console.log(`  Found ${entryKeys.length} entries.`);
for (const key of entryKeys) {
  const value = getValue(key);
  if (!value) { console.log(`  ${key}: could not read, skipping`); continue; }
  if (!("pin" in value)) { console.log(`  ${key}: no pin field, skipping`); continue; }
  const { pin, ...rest } = value;
  console.log(`  ${key}: stripping pin`);
  putValue(key, rest);
}

console.log("\nStep 2: rename imboutakam -> kam");
const oldEntryKey = `entry:${RENAME_FROM_SLUG}`;
const newEntryKey = `entry:${RENAME_TO_SLUG}`;
if (entryKeys.includes(oldEntryKey)) {
  const oldEntry = getValue(oldEntryKey);
  const { pin, ...rest } = oldEntry || {};
  const renamed = { ...rest, name: RENAME_TO_NAME };
  console.log(`  Writing ${newEntryKey} with name="${RENAME_TO_NAME}"`);
  putValue(newEntryKey, renamed);
  console.log(`  Deleting ${oldEntryKey}`);
  deleteKey(oldEntryKey);
} else {
  console.log(`  ${oldEntryKey} not found — skipping rename.`);
}

console.log("\nStep 3: rename knockout picks");
const oldKoKey = `knockout:${RENAME_FROM_SLUG}`;
const newKoKey = `knockout:${RENAME_TO_SLUG}`;
const koKeys = listKeys("knockout:");
if (koKeys.includes(oldKoKey)) {
  const koValue = getValue(oldKoKey);
  console.log(`  Writing ${newKoKey}`);
  putValue(newKoKey, koValue);
  console.log(`  Deleting ${oldKoKey}`);
  deleteKey(oldKoKey);
} else {
  console.log(`  ${oldKoKey} not found — skipping.`);
}

console.log(`\nDone. ${APPLY ? "Changes applied." : "Dry run — pass --apply to write to production."}`);
