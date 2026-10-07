# Combat HUD: install guide

A phone and tablet combat sheet that reads your D&D Beyond character PDF.
Once installed it works with no internet, including PDF import.

## 1. Put it online once (free)

Pick one. You only do this one time.

### Option A: Netlify Drop (quickest)
1. Go to https://app.netlify.com/drop and sign in (a free account keeps the site permanently).
2. Drag this whole `combat-hud` folder onto the page.
3. Netlify gives you an address like `https://something.netlify.app`. That's your app.

### Option B: GitHub Pages
1. Make a free GitHub account and create a new public repository.
2. Upload everything inside this folder (index.html, sw.js, manifest.webmanifest, and the icons, lib and fonts folders).
3. In the repository go to Settings, then Pages. Set the source to the main branch, root folder, and save.
4. After a minute your app is at `https://YOURNAME.github.io/REPONAME/`.

## 2. Install it on each device

Open your address once while online, then:

- **Android (Chrome):** tap the menu, then "Install app" (or "Add to Home screen").
- **iPhone or iPad (Safari only):** tap Share, then "Add to Home Screen".

Launch it from the new icon. Give it a few seconds on first open so it can save itself for offline use. After that, no signal is needed.

## 3. Using it

- Tap the three dots (top right) to import your D&D Beyond PDF. Export it from the character menu in D&D Beyond (Manage, then Export to PDF).
- Re-import after each level up. Current HP and used resources are kept.
- Your data is stored on the device you use. The installed app and the same page in a browser tab keep separate data, so import inside the installed app.
- On iPhone and iPad, don't clear Safari website data, or the app's saved character is wiped. Re-importing the PDF restores it.

## 4. Updating

When you get a new version of the files, upload them over the old ones.
Open the app twice while online and the new version appears.
If a change doesn't show up, change `VERSION` at the top of `sw.js` (for example `v2`) and upload again.

## Notes

- The built-in character is Darrow. "Reset to Darrow" in the menu restores him.
- This is an unofficial fan tool and isn't affiliated with Wizards of the Coast or D&D Beyond.
