export const DEFAULT_AVOIDABLE_KEYWORDS = [
  "frontal",
  "swirl",
  "swirly",
  "volcanic",
  "sanguine",
  "explosive",
  "storming",
  "quaking",
  "spiteful",
  "cleave",
  "ground",
  "pool",
  "void",
  "eruption",
  "blast wave",
  "shockwave",
  "orb",
  "beam",
  "charge"
];

export const DEFAULT_INTERRUPT_KEYWORDS = [
  "heal",
  "mend",
  "mending",
  "bolt",
  "volley",
  "fear",
  "hex",
  "curse",
  "dominate",
  "summon",
  "enrage",
  "shield"
];

export function looksAvoidable(spellName) {
  const normalized = spellName.toLowerCase();
  return DEFAULT_AVOIDABLE_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

export function looksImportantCast(spellName) {
  const normalized = spellName.toLowerCase();
  return DEFAULT_INTERRUPT_KEYWORDS.some((keyword) => normalized.includes(keyword));
}
