# Changelog

All notable changes to Combat HUD are listed here, newest first.

Combat HUD is still in beta, so every version is 0.x until the 1.0 release. Small fixes bump the last number (0.6.1, 0.6.2). New features bump the middle number (0.7, 0.8).

> **A note on the early versions.** Versions 0.1 to 0.5 were numbered after the fact. They group the work in the order it was built, and their dates were not recorded. From 0.6 onwards the numbers are tracked as releases happen.

---

## 0.6 (beta) - 9 October 2026

### Added
- **Element colour schemes.** Choose Classic, Air (Cool Monochrome), Fire (Midnight Jewel), Water (Ocean Gradient), Earth (Autumn Leaves) or Storm (Noir Neon). Each has a light and a dark version, and every character keeps their own choice. Find it under menu, then Appearance.
- **Element suggestion.** If a character sheet mentions exactly one element (for example in the faith or notes field), the menu offers it with one tap.
- **Light, dark or automatic.** One setting shared by all of your characters.
- **I roll my own dice.** Rolling physical dice at the table? Switch the Dice setting (menu, or the small pill at the top of any sheet) and the app asks for your numbers instead of rolling for you.
  - One box per die. Big handfuls of dice (five or more) take a single total.
  - Works for d20s (including advantage and disadvantage), weapon damage, Savage Attacker's two rolls, superiority dice, Sneak Attack, spell damage, healing, Second Wind and hit dice.
  - Modifiers are added, dice are doubled on a critical hit, and a natural 20 you enter counts as a critical hit.
  - Numbers outside a die's range are refused. "Roll it for me" rolls a single roll in the app, and "Cancel" backs out without spending anything.
- **User guide.** A single page with screenshots covering install, import, every tab, rests, the log, themes and troubleshooting.
- **Version number.** Shown at the bottom of the menu. The offline cache is now named after the version, so each release refreshes cleanly.
- **Do-not-index tag** on the app and the guide, so search engines leave them out.

### Changed
- **Brighter status colours.** Damage, Heal, bonus actions, reactions and spell slots now use vivid colours tuned for each element and for light and dark mode. Heal has its own green instead of borrowing the theme colour.
- **Air is now Cool Monochrome**, a silvery slate, with a lighter dark mode, so it is clearly different from Water.
- Counter names such as "Sorcerous Restoration" use the full tile width and no longer break mid-word.
- **Tidier Gear tab.** Separate stacks of the same item are merged (three Rations become "Rations ×3"), rows the PDF repeats with no weight are shown once, and an attuned item is listed only in the Attuned card, which says how many of the three slots are used. The Equipment header counts the items and adds up the weight, which matches the carried weight on the PDF.
- **Tidier Features tab.** Sections have readable names (for example "Fighter · Battle Master" and "Human traits") and can be collapsed, with a count. Empty placeholder features are no longer rows (their names sit in one grey line), creature type, size and speed are a single line, and each feature is one compact row with tags for the action type and a live counter. Descriptions, options and the source are one tap away.

### Fixed
- The close button was hidden behind the roll prompt.
- The text on the Damage button was too faint in dark themes.
- Some items appeared twice in the Gear tab.

---

## 0.5

### Added
- **Spell damage and healing.** Casting a spell now shows its damage or healing, with the dice worked out for you.
  - Dice scale with the slot level you cast at, and cantrips scale with your character level.
  - Magic Missile rolls every dart. Scorching Ray gives each ray its own attack roll and damage roll.
  - Save spells show the half damage for a successful save. Attack spells have a critical hit toggle.
  - Cure Wounds and similar spells have an Apply button for your own hit points, and False Life applies temporary hit points without lowering a bigger pool.
  - Spells outside the built-in table get a box where you type the dice (for example 4d6) and roll them.
- **Damage tracker.** Spell damage is logged, counts toward "Damage dealt" and "Biggest hit", and the Combat tab's turn bar shows a running total.

### Changed
- **Flowchart only.** The old Steps view and the Steps / Flowchart toggle were removed. Every guided screen is now a flowchart.
- **Sleeker design.** A monogram badge in the header, armour class, initiative and speed in one strip, underline-style tabs, slim colour bars on the action groups, rounded sheets with a drag handle, and softer flowchart boxes.

### Fixed
- Buttons in steps you had not reached yet could still be pressed.
- The projectile spell block (Scorching Ray, Magic Missile) could fail to open the first time.

---

## 0.4

### Added
- **Spells tab** (casters only).
  - Each class's save DC and attack bonus. Multiclass characters see both.
  - Spell slots as tap-to-spend circles.
  - Spells grouped by level with search and filters (All, Prepared, Cantrips, each level). A star marks a spell as prepared, a diamond marks always prepared, and tags show concentration and ritual spells. Duplicate 2014 and 2024 versions are merged.
  - **Casting:** pick the slot (upcasting included), cast as a ritual, or free cast where a spell says 1/long rest. Attack rolls and save DCs are shown, including both DCs for a spell known by two classes.
  - **Concentration:** a banner while you concentrate, a Constitution save prompt with the right DC when you take damage (Roll, Held or Lost), and it ends at 0 HP.
  - Prepared bonus action and reaction spells also appear in those groups on the Combat tab, along with a Cast a spell row.
- **More counters.** Sorcery Points, Eldritch Cannon hit points, and counters with an "Other" recharge (such as Infuse Item) are now picked up. "Other" counters are manual and are not refilled by rests.
- **Class helpers.**
  - Font of Magic: convert slots and Sorcery Points, and create slots at the correct cost.
  - Innate Sorcery: an active-effect banner that adds +1 to spell DCs and advantage on spell attacks.
  - Metamagic spends Sorcery Points, and Sorcerous Restoration gives them back.
  - Bardic Inspiration and Mantle of Inspiration.
  - Arcane Firearm adds a d8 to spell attacks.
- **Hit dice and the short rest sheet.** Spend hit dice (your roll plus Constitution) and see what will refill before you finish. A long rest returns half your hit dice.
- **Gear tab:** coins, how much you are carrying against your limit, attuned items and the equipment list.
- **Story tab:** details, personality traits, ideals, bonds, flaws, appearance, allies, backstory and notes.
- **Stats tab additions:** hit dice, senses, defenses and saving throw notes.
- **Adaptive layout.** Tabs and sections appear only when your character has something to put in them. Non-casters never see spell tabs or slots, and the Bonus action group is hidden if you have no bonus actions.

### Changed
- Tabs scroll sideways inside their own strip when there are many.
- Baz's climbing speed now shows as a note instead of breaking the speed tile.

### Fixed
- Seven tabs made the whole page wider than a phone screen, causing sideways scrolling.

---

## 0.3

### Added
- **Flowcharts for combat.** Attacks and bonus action, reaction and special-action features became tappable flowcharts, with the steps ahead greyed out.
  - Attacks: roll to hit, hit or miss or critical, damage, optional extra damage (Sneak Attack), optional maneuver (with the save DC), weapon mastery reminders, then on to your next attack.
  - Features such as Second Wind, Feinting Attack, Riposte, Sentinel, Cunning Action, Steady Aim and Action Surge each got their own short flowchart.
- **Savage Attacker** shows both rolls, marks the higher as used, strikes through the lower one, and is limited to once per turn.
- **Turn counter** on the Combat tab, next to the status of once-per-turn features (Sneak Attack, Savage Attacker).
- **One maneuver per attack.** An attack already started by Feinting Attack or Riposte cannot add a second maneuver, and Undo refunds a superiority die.
- **Combat log.** Records attacks, damage breakdowns, spell casts, feature use, hit points lost and gained, rolls and death saves, grouped by turn.
  - A summary shows turns, attacks, hits, misses, damage dealt, biggest hit, damage taken and healing.
  - End combat saves a fight under Past combats (the last ten are kept), Copy log copies it as text, and Clear wipes the current fight.
  - Resting saves the current fight automatically.

---

## 0.2

### Added
- **PDF import.** Export your character from D&D Beyond and pick the file. It is read on your own device and nothing is uploaded.
- **Clean first screen.** The app starts on an import screen with no built-in character.
- **Several characters.** Add as many as you like. With two or more, the app asks who you are playing each time it opens. Switch or delete from the menu (deleting needs a second tap).
- **Update after a level up.** Import the new PDF and the same character is updated instead of duplicated. A "What changed" list is shown, and current hit points, used counters, the log and starred spells are kept.
- **Installable and offline.** It installs to the home screen on iPhone, iPad, Android and Windows, works without internet once loaded, and bundles its own PDF reader and fonts. Hosted on GitHub Pages.
- **Features read from the sheet.** Counters with limited uses, bonus actions, reactions and standard actions come straight from the PDF. Weapon mastery reminders come from each weapon's notes.
- **Stats and Features tabs,** short and long rests, and a guided attack: roll to hit, hit or miss, damage.
- **Rogue support.** Sneak Attack as extra damage (once per turn, finesse or ranged weapons only), Cunning Action and Steady Aim, plus a New turn button that makes once-per-turn features ready again.
- **Tidier weapon lists.** Identical weapons (such as two daggers) are shown once with a multiplier.

### Fixed
- The file picker was unreliable on some devices. It is now a full-size tap target.

---

## 0.1

### Added
- **First prototype: Darrow's combat sheet.** It began as a full character sheet page, then was cut down to a one-page combat sheet for a single hard-coded character, a level 5 Battle Master fighter.
  - Hit points with Damage and Heal buttons, and armour class, initiative and speed.
  - Counters for Superiority Dice, Second Wind and Action Surge, with short and long rest buttons.
  - Attacks with their to-hit bonuses and damage, plus bonus action and reaction cards written for the character.
  - Saving throws, and a colour-coded split between action, bonus action and reaction.
- Laid out for laptop and tablet.
