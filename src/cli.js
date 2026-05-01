import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { analyzePull } from "./analyzer.js";
import { renderCoachingSummary } from "./coaching.js";
import { groupPulls } from "./encounters.js";
import { parseCombatLogLine } from "./parser.js";

const DEFAULT_LOG_PATH = "F:\\World of Warcraft\\_retail_\\Logs";
let currentOptions = {};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [, , command, ...args] = process.argv;
  const { filePath, playerName } = parseArgs(args);

  if (!command || !["analyze", "watch", "debug"].includes(command) || (command === "analyze" && !filePath)) {
    console.error("Usage:");
    console.error("  npm run analyze -- <path-to-WoWCombatLog-file>");
    console.error("  npm run watch -- [path-to-Logs-folder-or-WoWCombatLog-file]");
    console.error("  npm run debug -- [path-to-Logs-folder-or-WoWCombatLog-file] [--player Name]");
    process.exit(1);
  }

  const resolvedFilePath = filePath ?? DEFAULT_LOG_PATH;
  currentOptions = { playerName };

  if (command === "analyze") {
    const text = fs.readFileSync(resolvedFilePath, "utf8");
    const pulls = groupPulls(text.split(/\r?\n/), { playerName });
    printPulls(pulls);
  }

  if (command === "watch") {
    watchCombatLog(resolvedFilePath, { playerName });
  }

  if (command === "debug") {
    debugCombatLog(resolvedFilePath, { playerName });
  }
}

function parseArgs(args) {
  let filePath = null;
  let playerName = null;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--player") {
      playerName = args[index + 1] ?? null;
      index += 1;
      continue;
    }

    if (!filePath) filePath = arg;
  }

  return { filePath, playerName };
}

function printPulls(pulls) {
  if (pulls.length === 0) {
    console.log("No completed pulls or boss attempts found.");
    return;
  }

  for (const pull of pulls) {
    console.log(renderCoachingSummary(analyzePull(pull, currentOptions)));
    console.log("\n---\n");
  }
}

function debugCombatLog(path, options = {}) {
  const combatLogPath = resolveCombatLogPath(path);
  if (!combatLogPath) {
    console.log(`No timestamped WoWCombatLog-*.txt file found at ${path}`);
    return;
  }

  const text = fs.readFileSync(combatLogPath, "utf8");
  const lines = text.split(/\r?\n/).filter(Boolean);
  const parsed = lines.map(parseCombatLogLine).filter(Boolean);
  const matching = parsed.filter((entry) => {
    if (!options.playerName) {
      return /^(Player|Pet)-/i.test(entry.sourceGuid) || /^(Player|Pet)-/i.test(entry.destGuid);
    }

    const wanted = options.playerName.toLowerCase();
    return nameMatches(entry.sourceName, wanted) || nameMatches(entry.destName, wanted);
  });

  const eventCounts = countBy(matching, (entry) => entry.event);
  const damageEvents = matching.filter((entry) => /DAMAGE/.test(entry.event) || entry.event === "SWING_DAMAGE");
  const castEvents = matching.filter((entry) => entry.event === "SPELL_CAST_SUCCESS");
  const pulls = groupPulls(lines, { playerName: options.playerName });

  console.log(`Combat log: ${combatLogPath}`);
  console.log(`Lines: ${lines.length}`);
  console.log(`Parsed events: ${parsed.length}`);
  console.log(`Player/pet matching events: ${matching.length}`);
  console.log(`Detected fights: ${pulls.length}`);
  console.log("");
  console.log("Top matching event types:");
  for (const [event, count] of Object.entries(eventCounts).sort((a, b) => b[1] - a[1]).slice(0, 12)) {
    console.log(`- ${event}: ${count}`);
  }

  console.log("");
  console.log("Recent matching damage:");
  for (const event of damageEvents.slice(-8)) {
    console.log(`- ${event.timestamp} ${event.sourceName || event.sourceGuid} -> ${event.destName || event.destGuid}: ${event.spellName ?? event.event} ${event.amount ?? ""}`.trim());
  }

  console.log("");
  console.log("Recent matching casts:");
  for (const event of castEvents.slice(-8)) {
    console.log(`- ${event.timestamp} ${event.sourceName || event.sourceGuid}: ${event.spellName}`);
  }
}

function watchCombatLog(path, options = {}) {
  currentOptions = options;
  let activePath = resolveCombatLogPath(path);
  let position = activePath && fs.existsSync(activePath) ? fs.statSync(activePath).size : 0;
  let buffer = [];
  let lastActivityAt = Date.now();
  const idleGapMs = 15000;

  console.log(`Watching ${path}`);
  if (activePath) console.log(`Active combat log: ${activePath}`);
  if (!activePath) console.log("Waiting for a WoWCombatLog-* file to appear...");
  if (options.playerName) console.log(`Filtering fights to player: ${options.playerName}`);

  setInterval(() => {
    const latestPath = resolveCombatLogPath(path);
    if (!latestPath) return;

    if (latestPath !== activePath) {
      activePath = latestPath;
      position = 0;
      buffer = [];
      console.log(`Active combat log: ${activePath}`);
      return;
    }

    if (!fs.existsSync(activePath)) return;

    const stats = fs.statSync(activePath);
    if (stats.size < position) position = 0;
    if (stats.size > position) {
      const fd = fs.openSync(activePath, "r");
      const chunk = Buffer.alloc(stats.size - position);
      fs.readSync(fd, chunk, 0, chunk.length, position);
      fs.closeSync(fd);

      position = stats.size;
      const lines = chunk.toString("utf8").split(/\r?\n/).filter(Boolean);
      if (lines.length > 0) {
        buffer.push(...lines);
        lastActivityAt = Date.now();
      }

      const pulls = groupPulls(buffer, { idleGapMs, playerName: options.playerName });
      const completedByEncounterEnd = pulls.filter((pull) =>
        pull.events.some((event) => event.event === "ENCOUNTER_END")
      );

      if (completedByEncounterEnd.length > 0) {
        printPulls(completedByEncounterEnd);
        buffer = [];
      }
    }

    if (buffer.length > 0 && Date.now() - lastActivityAt > idleGapMs) {
      printPulls(groupPulls(buffer, { idleGapMs, playerName: options.playerName }));
      buffer = [];
    }
  }, 1000);
}

function resolveCombatLogPath(path) {
  if (!fs.existsSync(path)) return null;

  const stats = fs.statSync(path);
  if (stats.isFile()) return path;
  if (!stats.isDirectory()) return null;

  const combatLogs = fs
    .readdirSync(path, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^WoWCombatLog-\d+_\d+\.txt$/i.test(entry.name))
    .map((entry) => {
      const fullPath = `${path.replace(/[\\/]$/, "")}\\${entry.name}`;
      return {
        fullPath,
        modifiedMs: fs.statSync(fullPath).mtimeMs
      };
    })
    .sort((a, b) => b.modifiedMs - a.modifiedMs || b.fullPath.localeCompare(a.fullPath));

  return combatLogs[0]?.fullPath ?? null;
}

export { resolveCombatLogPath };

function countBy(items, keyFn) {
  return items.reduce((counts, item) => {
    const key = keyFn(item);
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

function nameMatches(actualName, wantedName) {
  const actual = actualName.toLowerCase();
  return actual === wantedName || actual.split("-")[0] === wantedName;
}
