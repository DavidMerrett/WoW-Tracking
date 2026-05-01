import assert from "node:assert/strict";
import fs from "node:fs";
import { analyzePull } from "../src/analyzer.js";
import { resolveCombatLogPath } from "../src/cli.js";
import { groupPulls } from "../src/encounters.js";
import { parseCombatLogLine, splitCsv } from "../src/parser.js";

assert.deepEqual(splitCsv('SPELL_DAMAGE,"Source, Name",0x0'), [
  "SPELL_DAMAGE",
  "Source, Name",
  "0x0"
]);

const damage = parseCombatLogLine(
  '5/1 20:10:09.000  SPELL_DAMAGE,Creature-0,"Stone Guard",0x10a48,0x0,Player-1,"Cato",0x511,0x0,400003,"Ground Eruption",0x1,232000'
);

assert.equal(damage.event, "SPELL_DAMAGE");
assert.equal(damage.sourceName, "Stone Guard");
assert.equal(damage.destName, "Cato");
assert.equal(damage.spellName, "Ground Eruption");
assert.equal(damage.amount, 232000);

const advancedSwing = parseCombatLogLine(
  '5/1/2026 14:15:01.6649  SWING_DAMAGE_LANDED,Player-3725-0C5EB7F6,"Vinnetty-Frostmourne-US",0x511,0x80000000,Creature-0-3748-2933-43476-246348-0005F42FC6,"Shadowspawn",0x10a48,0x80000000,Creature-0-3748-2933-43476-246348-0005F42FC6,0000000000000000,129344,142234,0,0,1470,0,0,0,1,0,0,0,8768.43,-4428.83,2577,0.3741,90,2029,2760,-1,1,0,0,0,nil,nil,nil'
);

assert.equal(advancedSwing.event, "SWING_DAMAGE_LANDED");
assert.equal(advancedSwing.sourceName, "Vinnetty-Frostmourne-US");
assert.equal(advancedSwing.spellName, "Melee swing");
assert.equal(advancedSwing.amount, 2029);

const sample = fs.readFileSync("samples/sample-combat-log.txt", "utf8");
const pulls = groupPulls(sample.split(/\r?\n/));
assert.equal(pulls.length, 1);
assert.equal(pulls[0].name, "Example Dungeon Boss");

const analysis = analyzePull(pulls[0]);
assert.equal(analysis.deaths.length, 1);
assert.equal(analysis.deaths[0].target, "Cato");
assert.equal(analysis.avoidableDamage[0].target, "Cato");
assert.equal(analysis.likelyMissedInterrupts.length, 1);
assert.equal(analysis.successfulInterrupts.length, 1);
assert.match(analysis.improvement, /Cato/);

const trashSample = fs.readFileSync("samples/sample-trash-pull-log.txt", "utf8");
const trashPulls = groupPulls(trashSample.split(/\r?\n/));
assert.equal(trashPulls.length, 1);
assert.equal(trashPulls[0].name, "Dungeon pull");

const trashAnalysis = analyzePull(trashPulls[0]);
assert.equal(trashAnalysis.avoidableDamage.length, 1);
assert.equal(trashAnalysis.avoidableDamage[0].topSpell, "Frontal Smash");
assert.equal(trashAnalysis.likelyMissedInterrupts.length, 1);
assert.equal(trashAnalysis.likelyMissedInterrupts[0].spellName, "Fear");

const brewSample = fs.readFileSync("samples/sample-brewmaster-rotation-log.txt", "utf8");
const brewPulls = groupPulls(brewSample.split(/\r?\n/), { playerName: "Brewzen" });
assert.equal(brewPulls.length, 1);

const brewAnalysis = analyzePull(brewPulls[0], { playerName: "Brewzen" });
assert.equal(brewAnalysis.rotation.tracked, true);
assert.equal(brewAnalysis.rotation.counts["Keg Smash"], 1);
assert.equal(brewAnalysis.rotation.counts["Blackout Kick"], 2);
assert.match(brewAnalysis.rotation.improvement, /Tiger Palm|Heavy Stagger|Purifying Brew/);

const latestCombatLog = resolveCombatLogPath("tests/fixtures/logs");
assert.match(latestCombatLog, /WoWCombatLog-050126_150000\.txt$/);

console.log("All tests passed.");
