import { readFile } from "node:fs/promises";

const path = process.argv[2] || "../published/manager-view.json";
const value = JSON.parse(await readFile(path, "utf8"));
if (value?.schemaVersion !== 1 || !value.publicationId || !value.publishedAt || !value.year?.label || !Array.isArray(value.goals) || !value.reports || !Array.isArray(value.assets)) {
  throw new Error("Published manager-view data is missing required schema version 1 fields.");
}
const serialized = JSON.stringify(value);
if (/file:\/\//i.test(serialized) || /(?:^|[\s("'=])\/(?:Users|home|private|var)\//i.test(serialized) || /goal-evidence-tracker\.db|sqlite:/i.test(serialized)) {
  throw new Error("Published manager-view data contains a forbidden local path.");
}
process.stdout.write(`Validated ${value.goals.length} published goals for ${value.year.label}.\n`);
