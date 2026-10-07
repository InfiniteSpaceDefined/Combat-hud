# Combat HUD: install guide

A phone and tablet combat sheet that reads your D&D Beyond character PDF.
Once installed it works with no internet, including PDF import.

## 2. Install it on each device

Open your address once while online, then:

- **Android (Chrome):** tap the menu, then "Install app" (or "Add to Home screen").
- **iPhone or iPad (Safari only):** tap Share, then "Add to Home Screen".

Launch it from the new icon. Give it a few seconds on first open so it can save itself for offline use. After that, no signal is needed.

## 3. Using it

- Import your D&D Beyond PDF from the first screen, or from the three dots (top right) to add another character. Export it in D&D Beyond (Manage, then Export to PDF).
- Re-import the same character after a level up and it updates them. Current HP and used resources are kept, and a summary lists what changed.
- The three dots menu also switches and deletes characters.
- Your data is stored on the device you use. The installed app and the same page in a browser tab keep separate data, so import inside the installed app.
- On iPhone and iPad, don't clear Safari website data, or the app's saved character is wiped. Re-importing the PDF restores it.

## 4. Updating

When you get a new version of the files, upload them over the old ones.
Open the app twice while online and the new version appears.
If a change doesn't show up, change `VERSION` at the top of `sw.js` (for example `v2`) and upload again.

## Notes

- It starts empty. The first screen is an import. Add as many characters as you like from the menu and switch between them.
- This is an unofficial fan tool and isn't affiliated with Wizards of the Coast or D&D Beyond.
