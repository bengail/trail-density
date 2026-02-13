#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
const coursesDir = path.join(repoRoot, "data", "courses");
const manifestPath = path.join(repoRoot, "data", "courses_index.json");

function main() {
  if (!fs.existsSync(coursesDir)) {
    throw new Error(`Missing courses directory: ${coursesDir}`);
  }

  const files = fs
    .readdirSync(coursesDir, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith(".json"))
    .map(entry => entry.name)
    .sort((a, b) => a.localeCompare(b));

  const courses = files.map(fileName => ({
    race_id: path.basename(fileName, ".json"),
    path: `data/courses/${fileName}`
  }));

  fs.writeFileSync(
    manifestPath,
    `${JSON.stringify({ courses }, null, 2)}\n`,
    "utf8"
  );

  console.log(`Wrote ${courses.length} courses to ${path.relative(repoRoot, manifestPath)}`);
}

main();
