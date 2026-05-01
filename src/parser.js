const EVENT_WITH_SPELL = new Set([
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
  "SPELL_DAMAGE",
  "SPELL_DISPEL",
  "SPELL_DRAIN",
  "SPELL_ENERGIZE",
  "SPELL_HEAL",
  "SPELL_INSTAKILL",
  "SPELL_PERIODIC_DAMAGE",
  "SPELL_PERIODIC_DRAIN",
  "SPELL_PERIODIC_ENERGIZE",
  "SPELL_PERIODIC_HEAL",
  "SPELL_PERIODIC_MISSED",
  "SPELL_INTERRUPT",
  "SPELL_MISSED",
  "SPELL_RESURRECT",
  "SPELL_CAST_SUCCESS"
]);

const DAMAGE_EVENTS = new Set([
  "DAMAGE_SHIELD",
  "DAMAGE_SPLIT",
  "RANGE_DAMAGE",
  "SWING_DAMAGE_LANDED",
  "SPELL_DAMAGE",
  "SPELL_PERIODIC_DAMAGE",
  "SWING_DAMAGE"
]);

export function parseCombatLogLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return null;

  const match = trimmed.match(/^(\d+\/\d+(?:\/\d+)?\s+\d+:\d+:\d+\.\d+)\s+(.+)$/);
  if (!match) return null;

  const [, timestamp, payload] = match;
  const fields = splitCsv(payload);
  const event = fields[0];

  if (!event) return null;

  const base = {
    timestamp,
    event,
    sourceGuid: fields[1] ?? "",
    sourceName: cleanName(fields[2] ?? ""),
    destGuid: fields[5] ?? "",
    destName: cleanName(fields[6] ?? ""),
    raw: line
  };

  if (event === "ENCOUNTER_START") {
    return {
      timestamp,
      event,
      encounterId: fields[1] ?? "",
      encounterName: cleanName(fields[2] ?? "Unknown encounter"),
      difficultyId: fields[3] ?? "",
      groupSize: Number(fields[4] ?? 0),
      raw: line
    };
  }

  if (event === "ENCOUNTER_END") {
    return {
      timestamp,
      event,
      encounterId: fields[1] ?? "",
      encounterName: cleanName(fields[2] ?? "Unknown encounter"),
      difficultyId: fields[3] ?? "",
      groupSize: Number(fields[4] ?? 0),
      success: fields[5] === "1",
      raw: line
    };
  }

  if (event === "UNIT_DIED") {
    return base;
  }

  if (EVENT_WITH_SPELL.has(event) || hasSpellPayload(event, fields)) {
    return {
      ...base,
      spellId: fields[9] ?? "",
      spellName: cleanName(fields[10] ?? "Unknown spell"),
      spellSchool: fields[11] ?? "",
      amount: DAMAGE_EVENTS.has(event) ? parseSpellDamageAmount(fields) : 0,
      extraSpellId: event === "SPELL_INTERRUPT" ? fields[12] ?? "" : "",
      extraSpellName: event === "SPELL_INTERRUPT" ? cleanName(fields[13] ?? "Unknown spell") : ""
    };
  }

  if (event === "SWING_DAMAGE" || event === "SWING_DAMAGE_LANDED") {
    return {
      ...base,
      spellId: "swing",
      spellName: "Melee swing",
      spellSchool: "",
      amount: parseSwingDamageAmount(fields)
    };
  }

  return base;
}

function hasSpellPayload(event, fields) {
  return /^(SPELL|RANGE|DAMAGE)_/.test(event) && fields.length > 11;
}

export function splitCsv(value) {
  const fields = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    const next = value[index + 1];

    if (char === '"' && next === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      quoted = !quoted;
      continue;
    }

    if (char === "," && !quoted) {
      fields.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  fields.push(current);
  return fields;
}

function cleanName(value) {
  return value.replace(/^"|"$/g, "");
}

function parseNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseSwingDamageAmount(fields) {
  if (looksLikeGuid(fields[9] ?? "")) return parseNumber(fields[28]);
  return parseNumber(fields[9]);
}

function parseSpellDamageAmount(fields) {
  if (looksLikeGuid(fields[12] ?? "")) return parseNumber(fields[31]);
  return parseNumber(fields[12]);
}

function looksLikeGuid(value) {
  return /^(Player|Creature|Pet|Vehicle|GameObject|Item)-|^0{16}$/i.test(value);
}
