# WoW AI Companion MVP

Local, Terms-of-Service-conscious coaching companion for World of Warcraft combat logs.

This MVP does not read game memory, inject into the client, or automate gameplay. It watches or analyzes the normal combat log file and summarizes each dungeon pull or boss attempt.

## What It Reports

After every pull or boss attempt, the companion explains:

- Deaths and likely causes.
- Avoidable damage events.
- Missed or successful interrupts.
- Brewmaster Monk rotation actions taken by the player.
- One practical improvement for the next pull.

The watcher treats any combat-log activity involving a `Player-*` or `Pet-*` GUID as a fight, so it can pick up trash pulls, boss attempts, rares, and solo combat. Boss encounters close on `ENCOUNTER_END`; ordinary fights close after combat-log activity goes quiet for about 15 seconds.

## Try It

Analyze the included sample:

```powershell
npm run analyze -- samples/sample-combat-log.txt
```

If `npm` is not on your PATH, run the CLI directly with Node:

```powershell
node src/cli.js analyze samples/sample-combat-log.txt
```

Watch a live combat log:

```powershell
npm run watch
```

If `npm` is not installed globally, use the included PowerShell launcher:

```powershell
powershell -ExecutionPolicy Bypass -File "C:\Users\tc125\Documents\Codex\2026-05-01\i-want-to-develop-an-ai\watch-wow.ps1"
```

This defaults to your local WoW install:

```text
F:\World of Warcraft\_retail_\Logs
```

The watcher automatically picks the newest timestamped file matching:

```text
WoWCombatLog-*.txt
```

You can still pass a different log path if needed:

```powershell
npm run watch -- "F:\World of Warcraft\_retail_\Logs"
```

Or pass one exact combat log file:

```powershell
npm run watch -- "F:\World of Warcraft\_retail_\Logs\WoWCombatLog-050126_140627.txt"
```

If you want the companion to only track one character by name, add `--player`:

```powershell
powershell -ExecutionPolicy Bypass -File "C:\Users\tc125\Documents\Codex\2026-05-01\i-want-to-develop-an-ai\watch-wow.ps1" --player "Yourcharacter"
```

If a fight is not detected, run the debug helper after the fight:

```powershell
powershell -ExecutionPolicy Bypass -File "C:\Users\tc125\Documents\Codex\2026-05-01\i-want-to-develop-an-ai\debug-wow.ps1" --player "Yourcharacter"
```

It prints the newest combat log file, matching event counts, recent damage, recent casts, and how many fights the companion can detect.

For Brewmaster rotation analysis, using `--player` is recommended so the companion evaluates your casts instead of another Monk in the log.

## Brewmaster Rotation Checks

The current rotation analyzer is based on Wowhead's Brewmaster Monk rotation priority. It checks for:

- Opening around `Keg Smash`, `Blackout Kick`, and `Breath of Fire`.
- Core cadence for `Keg Smash` and `Blackout Kick`, which help maintain `Shuffle`.
- Filler use from `Tiger Palm` and `Spinning Crane Kick`.
- Cooldown usage such as `Exploding Keg` and `Invoke Niuzao, the Black Ox`.
- Defensive Brew use, especially `Purifying Brew` when `Heavy Stagger` appears.

Try the included Brewmaster sample:

```powershell
node src/cli.js analyze samples/sample-brewmaster-rotation-log.txt --player Brewzen
```

In WoW, enable advanced combat logging if you want richer data:

```text
/combatlog
```

## Current Scope

The parser handles the common comma-separated combat log shape used by WoW logs, including:

- `ENCOUNTER_START`
- `ENCOUNTER_END`
- `UNIT_DIED`
- `SPELL_DAMAGE`
- `SPELL_PERIODIC_DAMAGE`
- `SWING_DAMAGE`
- `SPELL_INTERRUPT`
- `SPELL_CAST_SUCCESS`

Avoidable damage is heuristic-based for now. Tune `src/rules.js` with dungeon or boss mechanics as you add knowledge.

## Next Build Step

Connect `src/coaching.js` to an AI model so the structured summary can become a more natural companion response while still keeping deterministic event extraction local.
