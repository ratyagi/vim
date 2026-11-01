# Vim

A private weight trend tracker. Activity rings, a noise-filtered trend line, a goal date with a likely window and probabilities, BMI, and a self-check of how accurate its own forecasts have been.
Static site. No server, no accounts, no tracking. Opens as a framed window on desktop and as a full-screen app on phones.

## What it does with your numbers

- **Trend weight**: a Kalman filter treats each reading as true weight plus scale noise and learns your noise level from your own data. Missing days are skipped, not invented.
- **Pace**: kg per week with an uncertainty band, so a shaky pace looks shaky.
- **Goal date**: thousands of simulated futures from the fitted model. You get the most likely date, a 10th to 90th percentile window, and the chance of being there by a date.
- **Self-check**: it replays your history, forecasting 7 days ahead at every point, and compares with what happened. If past forecasts were too confident, ranges are widened.
- **Keep steady mode**: after you reach a goal, track time inside a range instead.
- **Themes**: Violet Dusk (default), Sunset and the original Fitness colours. Pick one in Settings > Appearance. It is saved per device.
- **Rings**: goal progress, last 7 days against your weekly target, and a daily ring that closes when you log today.
- Decimals work in every field (72.4, 72,4, 169.5, 5 ft 6.5 in).

## How your data stays private

- The site (GitHub Pages) holds **code only**. Anyone who finds the URL sees an empty app.
- Your readings live in **this browser** (localStorage).
- Optional: a copy goes into a **separate private repo** so phone and laptop match. The app writes that file for you each time you log.
- `.gitignore` blocks spreadsheets and data files from the public repo.
- The page asks search engines not to index it.

Worth flagging:
- Do not add your Excel file or `data.json` to the public repo.
- The sync token sits in this browser's storage. Use a token limited to the one private repo.

## Updating the live site after changing files

```
git add .
git commit -m "Update Vim"
git push
```

Pages redeploys in about a minute. Hard refresh once (or close and reopen the installed app) to pick up the new version.

## Setup (about 10 minutes)

### 1. Put the app online
- Create a **public** repo named `vim`.
- Upload everything in this folder to it.
- Repo Settings > Pages > Source: `main` branch, `/ (root)`.
- Your app is at `https://YOUR-NAME.github.io/vim/`.

### 2. Make the private data repo
- Create a **private** repo named `vim-data`.
- Tick "Add a README" so it has a branch.

### 3. Make a limited token
- GitHub > Settings > Developer settings > Personal access tokens > Fine-grained tokens.
- Repository access: **Only select repositories** > `vim-data`.
- Permissions > Repository > **Contents: Read and write**. Nothing else.
- Set an expiry (1 year is fine). Copy the token.

### 4. Connect the app
- Open the app > **Settings** tab.
- Import your Excel sheet (first sheet, a Date column and a Weight column).
- Fill in height, goal weight, target date. Settings save as you type; there is no Save button.
- Imports show the date order and unit they detected. Check both before you confirm. Sync only connects to a private repo.
- Private sync: username, `vim-data`, file `data.json`, paste token > **Connect and sync**.
- Repeat the connect step on your other devices. They pull the same data.

### 5. Put it on your phone
- iPhone: Safari > Share > Add to Home Screen.
- Android: Chrome menu > Install app.

## Daily use

- Tap the green **+** and type today's weight. Takes 5 seconds.
- Past days: change the date in the same sheet.
- Missed days are filled in with a straight line and shown as hollow dots.
- Want to keep using Excel? Re-import the sheet any time. It merges by date.
- **Export to Excel** gives you a fresh `.xlsx` from the app.

## What the numbers mean

- **Trend weight**: Kalman filter estimate of true weight. Daily readings swing 1 to 2 kg from water.
- **Pace**: the filter's own estimate of kg per week, with an 80% band. It slows down over time (damped), as real loss usually does.
- **Forecast**: the green dashed line is the model's expectation, the shaded area the likely range for a single reading. "Same pace" (cyan) is a plain straight line, shown for comparison.
- **Goal date**: 2,000 simulated futures. The window is the 10th to 90th percentile of when the trend first reaches your goal.
- **How far to trust this**: back-test of 7 day forecasts on your own history against a "no change" guess.
- **Weekday effect**: each reading minus its trend, grouped by weekday. Shown only when it is larger than noise.
- **Flat stretch**: trend moved less than 0.15 kg in 10 days.
- **BMI**: WHO cut-offs, or Asia-Pacific cut-offs in Settings. It is a screen, not a diagnosis.
- The app warns if pace is above 1% of body weight per week.

## Try it with fake data

Open the app with `#demo` on the end of the URL. Nothing is saved in that mode.

## Files

- `index.html`, `style.css`: shell and look
- `model.js`: Kalman filter, forecast, simulation, back-test (runs in Node too)
- `stats.js`: turns readings into everything the screens show (runs in Node too)
- `charts.js`: charts and rings
- `app.js`: storage, import/export, sync, screens
- `lib/xlsx.full.min.js`: SheetJS 0.18.5, bundled so no third-party script loads
- `sw.js`, `manifest.webmanifest`, `icons/`: offline and home screen install
