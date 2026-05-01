import { looksAvoidable, looksImportantCast } from "./rules.js";
import { analyzeBrewmasterRotation } from "./rotation/brewmaster.js";

const DAMAGE_EVENTS = new Set([
  "DAMAGE_SHIELD",
  "DAMAGE_SPLIT",
  "RANGE_DAMAGE",
  "SPELL_DAMAGE",
  "SPELL_PERIODIC_DAMAGE",
  "SWING_DAMAGE",
  "SWING_DAMAGE_LANDED"
]);

export function analyzePull(pull, options = {}) {
  const deaths = [];
  const avoidableDamage = new Map();
  const successfulInterrupts = [];
  const importantCasts = [];
  const recentDamageByTarget = new Map();

  for (const event of pull.events) {
    if (DAMAGE_EVENTS.has(event.event)) {
      const damage = {
        timestamp: event.timestamp,
        target: event.destName || "Unknown target",
        source: event.sourceName || "Unknown source",
        spellName: event.spellName || "Unknown damage",
        amount: event.amount || 0,
        avoidable: looksAvoidable(event.spellName || "")
      };

      rememberRecentDamage(recentDamageByTarget, damage);

      if (damage.avoidable) {
        const current = avoidableDamage.get(damage.target) ?? {
          target: damage.target,
          total: 0,
          hits: 0,
          spells: new Map()
        };
        current.total += damage.amount;
        current.hits += 1;
        current.spells.set(damage.spellName, (current.spells.get(damage.spellName) ?? 0) + damage.amount);
        avoidableDamage.set(damage.target, current);
      }
    }

    if (event.event === "UNIT_DIED") {
      const target = event.destName || "Unknown player";
      deaths.push({
        timestamp: event.timestamp,
        target,
        recentDamage: recentDamageByTarget.get(target) ?? []
      });
    }

    if (event.event === "SPELL_INTERRUPT") {
      successfulInterrupts.push({
        timestamp: event.timestamp,
        player: event.sourceName || "Unknown player",
        target: event.destName || "Unknown target",
        interruptedSpell: event.extraSpellName || "Unknown spell"
      });
    }

    if (event.event === "SPELL_CAST_SUCCESS" && looksImportantCast(event.spellName || "")) {
      importantCasts.push({
        timestamp: event.timestamp,
        caster: event.sourceName || "Unknown caster",
        spellName: event.spellName || "Unknown spell"
      });
    }
  }

  const likelyMissedInterrupts = importantCasts.filter((cast) => {
    return !successfulInterrupts.some((interrupt) => {
      return interrupt.target === cast.caster && interrupt.timestamp === cast.timestamp;
    });
  });

  return {
    name: pull.name,
    startTimestamp: pull.startTimestamp,
    endTimestamp: pull.endTimestamp,
    durationMs: pull.durationMs,
    success: pull.success,
    deaths,
    avoidableDamage: [...avoidableDamage.values()].map(formatAvoidableDamage),
    successfulInterrupts,
    likelyMissedInterrupts,
    rotation: analyzeBrewmasterRotation(pull, options),
    improvement: chooseImprovement({
      deaths,
      avoidableDamage: [...avoidableDamage.values()],
      likelyMissedInterrupts,
      successfulInterrupts
    })
  };
}

function rememberRecentDamage(recentDamageByTarget, damage) {
  const current = recentDamageByTarget.get(damage.target) ?? [];
  current.push(damage);
  recentDamageByTarget.set(damage.target, current.slice(-5));
}

function formatAvoidableDamage(item) {
  const topSpell = [...item.spells.entries()].sort((a, b) => b[1] - a[1])[0];
  return {
    target: item.target,
    total: item.total,
    hits: item.hits,
    topSpell: topSpell ? topSpell[0] : "Unknown mechanic"
  };
}

function chooseImprovement({ deaths, avoidableDamage, likelyMissedInterrupts, successfulInterrupts }) {
  if (deaths.length > 0) {
    const death = deaths[0];
    const cause = death.recentDamage.at(-1);
    if (cause) {
      return `Before the next pull, call out ${death.target}'s danger point earlier; their final damage was ${cause.spellName} from ${cause.source}.`;
    }
    return `Before the next pull, review why ${death.target} died and assign a defensive or external cooldown earlier.`;
  }

  if (avoidableDamage.length > 0) {
    const worst = [...avoidableDamage].sort((a, b) => b.total - a.total)[0];
    return `Focus on movement next pull: ${worst.target} took the most avoidable damage, especially from ${[...worst.spells.entries()].sort((a, b) => b[1] - a[1])[0][0]}.`;
  }

  if (likelyMissedInterrupts.length > 0) {
    const cast = likelyMissedInterrupts[0];
    return `Assign a kick order before the next pull; ${cast.caster}'s ${cast.spellName} appears to have gone through.`;
  }

  if (successfulInterrupts.length === 0) {
    return "Add an interrupt target marker or voice call for the next pull so dangerous casts are covered.";
  }

  return "Keep the same plan, but spend the first global checking positioning before committing cooldowns.";
}
