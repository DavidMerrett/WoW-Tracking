import { parseCombatLogLine } from "./parser.js";

const NON_FIGHT_EVENTS = new Set([
  "COMBATANT_INFO",
  "ENCOUNTER_END",
  "ENCOUNTER_START",
  "MAP_CHANGE",
  "PARTY_KILL",
  "ZONE_CHANGE"
]);

const KNOWN_FIGHT_EVENTS = new Set([
  "DAMAGE_SHIELD",
  "DAMAGE_SHIELD_MISSED",
  "DAMAGE_SPLIT",
  "RANGE_DAMAGE",
  "RANGE_MISSED",
  "SPELL_AURA_APPLIED",
  "SPELL_AURA_APPLIED_DOSE",
  "SPELL_AURA_BROKEN",
  "SPELL_AURA_BROKEN_SPELL",
  "SPELL_AURA_REFRESH",
  "SPELL_AURA_REMOVED",
  "SPELL_AURA_REMOVED_DOSE",
  "SPELL_CAST_FAILED",
  "SPELL_CAST_START",
  "SPELL_CAST_SUCCESS",
  "SPELL_DAMAGE",
  "SPELL_DISPEL",
  "SPELL_DRAIN",
  "SPELL_ENERGIZE",
  "SPELL_HEAL",
  "SPELL_INSTAKILL",
  "SPELL_INTERRUPT",
  "SPELL_MISSED",
  "SPELL_PERIODIC_DAMAGE",
  "SPELL_PERIODIC_DRAIN",
  "SPELL_PERIODIC_ENERGIZE",
  "SPELL_PERIODIC_HEAL",
  "SPELL_PERIODIC_MISSED",
  "SPELL_RESURRECT",
  "SWING_DAMAGE",
  "SWING_DAMAGE_LANDED",
  "SWING_MISSED",
  "UNIT_DIED"
]);

export function groupPulls(lines, options = {}) {
  const idleGapMs = options.idleGapMs ?? 15000;
  const pulls = [];
  let active = null;

  for (const line of lines) {
    const entry = parseCombatLogLine(line);
    if (!entry) continue;

    if (entry.event === "ENCOUNTER_START") {
      if (active) pulls.push(closePull(active, entry.timestamp));
      active = createPull(entry);
      continue;
    }

    if (entry.event === "ENCOUNTER_END") {
      if (!active) active = createPull(entry);
      active.events.push(entry);
      active.name = entry.encounterName || active.name;
      active.success = entry.success;
      pulls.push(closePull(active, entry.timestamp));
      active = null;
      continue;
    }

    if (!active) {
      if (!canStartFight(entry, options)) continue;
      active = createPull({
        timestamp: entry.timestamp,
        encounterName: "Dungeon pull"
      });
    } else if (!isFightActivity(entry, options)) {
      continue;
    }

    const previousTime = parseWowTimestamp(active.lastTimestamp);
    const currentTime = parseWowTimestamp(entry.timestamp);
    if (previousTime && currentTime && currentTime - previousTime > idleGapMs) {
      pulls.push(closePull(active, active.lastTimestamp));
      active = createPull({
        timestamp: entry.timestamp,
        encounterName: "Dungeon pull"
      });
    }

    active.events.push(entry);
    active.lastTimestamp = entry.timestamp;
  }

  if (active && active.events.length > 0) {
    pulls.push(closePull(active, active.lastTimestamp));
  }

  return pulls;
}

function createPull(entry) {
  return {
    name: entry.encounterName || "Dungeon pull",
    startTimestamp: entry.timestamp,
    lastTimestamp: entry.timestamp,
    endTimestamp: entry.timestamp,
    success: null,
    events: []
  };
}

function isFightActivity(entry, options) {
  if (NON_FIGHT_EVENTS.has(entry.event)) return false;

  const playerName = options.playerName?.toLowerCase();
  if (playerName) {
    return (
      nameMatches(entry.sourceName, playerName) ||
      nameMatches(entry.destName, playerName)
    );
  }

  if (isPlayerOrPetGuid(entry.sourceGuid) || isPlayerOrPetGuid(entry.destGuid)) return true;
  return KNOWN_FIGHT_EVENTS.has(entry.event) && hasAnyUnit(entry);
}

function canStartFight(entry, options) {
  if (!isFightActivity(entry, options)) return false;
  if (isAuraEvent(entry.event) || isHealingEvent(entry.event)) return false;
  return true;
}

function isAuraEvent(event) {
  return event.startsWith("SPELL_AURA_");
}

function isHealingEvent(event) {
  return event === "SPELL_HEAL" || event === "SPELL_PERIODIC_HEAL";
}

function isPlayerOrPetGuid(guid) {
  return /^(Player|Pet)-/i.test(guid);
}

function hasAnyUnit(entry) {
  return Boolean(entry.sourceGuid || entry.destGuid || entry.sourceName || entry.destName);
}

function nameMatches(actualName, wantedName) {
  const actual = actualName.toLowerCase();
  return actual === wantedName || actual.split("-")[0] === wantedName;
}

function closePull(pull, endTimestamp) {
  return {
    ...pull,
    endTimestamp,
    durationMs: durationBetween(pull.startTimestamp, endTimestamp)
  };
}

function durationBetween(start, end) {
  const startMs = parseWowTimestamp(start);
  const endMs = parseWowTimestamp(end);
  if (!startMs || !endMs || endMs < startMs) return 0;
  return endMs - startMs;
}

function parseWowTimestamp(timestamp) {
  const match = timestamp.match(/^(\d+)\/(\d+)(?:\/(\d+))?\s+(\d+):(\d+):(\d+)\.(\d+)/);
  if (!match) return 0;

  const [, month, day, year = "2026", hour, minute, second, fraction] = match;
  return Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
    Number(fraction.padEnd(3, "0").slice(0, 3))
  );
}
