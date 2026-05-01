const BREWMASTER_ABILITIES = new Set([
  "Blackout Kick",
  "Breath of Fire",
  "Celestial Brew",
  "Celestial Infusion",
  "Exploding Keg",
  "Fortifying Brew",
  "Invoke Niuzao, the Black Ox",
  "Keg Smash",
  "Purifying Brew",
  "Rushing Jade Wind",
  "Spinning Crane Kick",
  "Tiger Palm",
  "Touch of Death"
]);

const OPENER = [
  "Keg Smash",
  "Blackout Kick",
  "Breath of Fire",
  "Tiger Palm",
  "Exploding Keg",
  "Keg Smash",
  "Blackout Kick",
  "Invoke Niuzao, the Black Ox"
];

export function analyzeBrewmasterRotation(pull, options = {}) {
  const fightType = classifyFight(pull);
  const playerName = options.playerName?.toLowerCase();
  const playerCasts = pull.events
    .filter((event) => event.event === "SPELL_CAST_SUCCESS")
    .filter((event) => isPlayerCast(event, playerName))
    .filter((event) => BREWMASTER_ABILITIES.has(event.spellName))
    .map((event) => ({
      timestamp: event.timestamp,
      spellName: event.spellName
    }));

  if (playerCasts.length === 0) {
    return {
      spec: "Brewmaster Monk",
      tracked: false,
      summary: "No Brewmaster rotation casts were detected for the player.",
      observations: [],
      improvement: null
    };
  }

  const counts = countCasts(playerCasts);
  const observations = [
    ...checkOpener(playerCasts, fightType),
    ...checkCoreCadence(playerCasts, fightType),
    ...checkCooldownUsage(playerCasts, pull.durationMs, fightType),
    ...checkBrewUsage(playerCasts, pull)
  ];

  return {
    spec: "Brewmaster Monk",
    tracked: true,
    fightType,
    casts: playerCasts.length,
    counts,
    observations,
    improvement: chooseRotationImprovement(observations, counts, fightType)
  };
}

function isPlayerCast(event, playerName) {
  if (playerName) return nameMatches(event.sourceName, playerName);
  return /^Player-/i.test(event.sourceGuid);
}

function nameMatches(actualName, wantedName) {
  const actual = actualName.toLowerCase();
  return actual === wantedName || actual.split("-")[0] === wantedName;
}

function countCasts(casts) {
  return casts.reduce((counts, cast) => {
    counts[cast.spellName] = (counts[cast.spellName] ?? 0) + 1;
    return counts;
  }, {});
}

function classifyFight(pull) {
  if (pull.success !== null) return "boss";
  if (pull.durationMs >= 180000) return "extended_pack";
  if (pull.durationMs >= 60000) return "elite_or_large_pack";
  return "mob_pack";
}

function checkOpener(casts, fightType) {
  const first = casts.slice(0, OPENER.length).map((cast) => cast.spellName);
  const observations = [];

  if (first[0] && first[0] !== "Keg Smash") {
    const severity = fightType === "mob_pack" && first[0] === "Spinning Crane Kick" ? "low" : "medium";
    observations.push({
      severity,
      message:
        fightType === "mob_pack" && first[0] === "Spinning Crane Kick"
          ? "Opener started with Spinning Crane Kick; acceptable while gathering mobs, but swap into Keg Smash quickly once the pack is stacked."
          : `Opener started with ${first[0]}; Brewmaster usually wants Keg Smash first to establish Shuffle and begin the priority.`
    });
  }

  if (!first.includes("Blackout Kick")) {
    observations.push({
      severity: "high",
      message: "Blackout Kick was missing from the early sequence, which weakens Shuffle uptime and Blackout Combo setup."
    });
  }

  if (!first.includes("Breath of Fire")) {
    observations.push({
      severity: "medium",
      message: "Breath of Fire was missing from the early sequence; use it early after Keg Smash/Blackout Kick when it fits the pull."
    });
  }

  return observations;
}

function checkCoreCadence(casts, fightType) {
  const observations = [];
  const kegSmashGaps = gapsFor(casts, "Keg Smash");
  const blackoutKickGaps = gapsFor(casts, "Blackout Kick");
  const kegGapLimit = fightType === "mob_pack" ? 14000 : 11000;
  const blackoutGapLimit = fightType === "mob_pack" ? 9000 : 7000;

  if ((countSpell(casts, "Keg Smash") ?? 0) === 0) {
    observations.push({
      severity: "high",
      message: "No Keg Smash casts detected; this is a core Brewmaster priority and key Shuffle source."
    });
  } else if (kegSmashGaps.some((gap) => gap > kegGapLimit)) {
    observations.push({
      severity: "medium",
      message: "Keg Smash had a long gap; try to spend Energy so it is available close to cooldown."
    });
  }

  if ((countSpell(casts, "Blackout Kick") ?? 0) === 0) {
    observations.push({
      severity: "high",
      message: "No Blackout Kick casts detected; plan other abilities around it to maintain Shuffle."
    });
  } else if (blackoutKickGaps.some((gap) => gap > blackoutGapLimit)) {
    observations.push({
      severity: "medium",
      message: "Blackout Kick had a long gap; it should anchor the rotation because its cooldown is predictable."
    });
  }

  const tigerPalmCount = countSpell(casts, "Tiger Palm");
  const spinningCraneKickCount = countSpell(casts, "Spinning Crane Kick");
  if (tigerPalmCount + spinningCraneKickCount === casts.length) {
    observations.push({
      severity: "high",
      message: "Only filler Energy spenders were detected; prioritize Keg Smash and Blackout Kick before Tiger Palm or Spinning Crane Kick."
    });
  }

  return observations;
}

function checkCooldownUsage(casts, durationMs, fightType) {
  const observations = [];
  if (fightType === "mob_pack") return observations;

  if (durationMs >= 90000 && countSpell(casts, "Exploding Keg") === 0) {
    observations.push({
      severity: "medium",
      message: "Exploding Keg was not used in a longer fight; use it on meaningful packs or bosses, ideally after Rushing Jade Wind if talented."
    });
  }

  if ((fightType === "boss" || fightType === "extended_pack") && countSpell(casts, "Invoke Niuzao, the Black Ox") === 0) {
    observations.push({
      severity: "medium",
      message: "Invoke Niuzao was not used in a boss or extended fight; plan a usage instead of saving it indefinitely."
    });
  }

  return observations;
}

function checkBrewUsage(casts, pull) {
  const observations = [];
  const heavyStagger = pull.events.some((event) => {
    return (
      event.event === "SPELL_AURA_APPLIED" &&
      event.destGuid?.startsWith("Player-") &&
      event.spellName === "Heavy Stagger"
    );
  });

  if (heavyStagger && countSpell(casts, "Purifying Brew") === 0) {
    observations.push({
      severity: "high",
      message: "Heavy Stagger appeared but Purifying Brew was not detected; use Purifying Brew to clear dangerous Stagger."
    });
  }

  return observations;
}

function chooseRotationImprovement(observations, counts, fightType) {
  const high = observations.find((item) => item.severity === "high");
  if (high) return high.message;

  const medium = observations.find((item) => item.severity === "medium");
  if (medium) return medium.message;

  const low = observations.find((item) => item.severity === "low");
  if (low && fightType !== "mob_pack") return low.message;

  if ((counts["Keg Smash"] ?? 0) > 0 && (counts["Blackout Kick"] ?? 0) > 0) {
    if (fightType === "mob_pack") {
      return "For mob packs, the core cadence looked fine; prioritize quick Keg Smash/Blackout Kick setup and save major cooldowns for dangerous packs.";
    }
    return "Core Brewmaster cadence looked reasonable; next refinement is using cooldowns deliberately in boss-length fights.";
  }

  return "Start by anchoring each pull around Keg Smash and Blackout Kick.";
}

function gapsFor(casts, spellName) {
  const times = casts
    .filter((cast) => cast.spellName === spellName)
    .map((cast) => parseWowTimestamp(cast.timestamp));

  return times.slice(1).map((time, index) => time - times[index]);
}

function countSpell(casts, spellName) {
  return casts.filter((cast) => cast.spellName === spellName).length;
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
