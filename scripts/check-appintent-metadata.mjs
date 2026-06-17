import { validateAppIntentMetadata } from "./lib/appintent-metadata.mjs";

const repoRoot = process.cwd();
const result = validateAppIntentMetadata(repoRoot);

console.log("AI Usage Widget AppIntent metadata check\n");

const width = Math.max(...result.rows.map((row) => row.name.length), 1);
for (const row of result.rows) {
  console.log(`${row.status.padEnd(4)} ${row.name.padEnd(width)}  ${row.detail}`);
}

console.log(`\n${result.passed} passed, ${result.failures} failures`);

if (!result.ok) {
  console.log("\nRun npm run device:build:unsigned to refresh the unsigned iPhone build before checking AppIntent metadata.");
  process.exitCode = 1;
}
