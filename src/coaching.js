export function renderCoachingSummary(analysis) {
  const result =
    analysis.success === null ? "Pull ended" : analysis.success ? "Boss defeated" : "Attempt failed";

  const lines = [
    `# ${analysis.name} - ${result}`,
    `Duration: ${formatDuration(analysis.durationMs)}`
  ];

  lines.push("");
  lines.push("Deaths:");
  if (analysis.deaths.length === 0) {
    lines.push("- No player deaths detected.");
  } else {
    for (const death of analysis.deaths) {
      const finalHit = death.recentDamage.at(-1);
      if (finalHit) {
        lines.push(
          `- ${death.target} died after ${finalHit.spellName} from ${finalHit.source} (${finalHit.amount.toLocaleString()} damage).`
        );
      } else {
        lines.push(`- ${death.target} died; no recent damage context was available.`);
      }
    }
  }

  lines.push("");
  lines.push("Avoidable damage:");
  if (analysis.avoidableDamage.length === 0) {
    lines.push("- No avoidable-damage patterns detected by the current rules.");
  } else {
    for (const item of analysis.avoidableDamage.sort((a, b) => b.total - a.total)) {
      lines.push(
        `- ${item.target}: ${item.total.toLocaleString()} damage across ${item.hits} hit(s), mostly ${item.topSpell}.`
      );
    }
  }

  lines.push("");
  lines.push("Interrupts:");
  if (analysis.successfulInterrupts.length === 0 && analysis.likelyMissedInterrupts.length === 0) {
    lines.push("- No important casts or interrupts detected.");
  } else {
    for (const interrupt of analysis.successfulInterrupts) {
      lines.push(`- ${interrupt.player} interrupted ${interrupt.target}'s ${interrupt.interruptedSpell}.`);
    }
    for (const cast of analysis.likelyMissedInterrupts) {
      lines.push(`- Possible missed interrupt: ${cast.caster} completed ${cast.spellName}.`);
    }
  }

  lines.push("");
  lines.push(`One improvement: ${analysis.improvement}`);

  if (analysis.rotation) {
    lines.push("");
    lines.push("Brewmaster rotation:");
    if (!analysis.rotation.tracked) {
      lines.push(`- ${analysis.rotation.summary}`);
    } else {
      lines.push(`- Fight type: ${formatFightType(analysis.rotation.fightType)}.`);
      lines.push(`- Tracked ${analysis.rotation.casts} Brewmaster cast(s).`);
      lines.push(`- Keg Smash: ${analysis.rotation.counts["Keg Smash"] ?? 0}, Blackout Kick: ${analysis.rotation.counts["Blackout Kick"] ?? 0}, Breath of Fire: ${analysis.rotation.counts["Breath of Fire"] ?? 0}.`);
      if (analysis.rotation.observations.length === 0) {
        lines.push("- No major Brewmaster priority issues detected by the current rules.");
      } else {
        for (const observation of analysis.rotation.observations.slice(0, 3)) {
          lines.push(`- ${observation.message}`);
        }
      }
      lines.push(`- Rotation improvement: ${analysis.rotation.improvement}`);
    }
  }

  return lines.join("\n");
}

function formatFightType(fightType) {
  if (fightType === "boss") return "boss fight";
  if (fightType === "extended_pack") return "extended mob pack";
  if (fightType === "elite_or_large_pack") return "elite or large pack";
  return "mob pack";
}

function formatDuration(durationMs) {
  const seconds = Math.round(durationMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  if (minutes === 0) return `${remainder}s`;
  return `${minutes}m ${String(remainder).padStart(2, "0")}s`;
}
