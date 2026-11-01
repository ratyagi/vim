# Vim

A private weight trend tracker. Rings, trend line, BMI, forecast, weekday patterns, energy estimate.
Static site. No server, no accounts, no tracking.

## How your data stays private

- The site (GitHub Pages) holds **code only**. Anyone who finds the URL sees an empty app.
- Your readings live in **this browser** (localStorage).
- Optional: a copy goes into a **separate private repo** so phone and laptop match.
- The app writes that file for you each time you log. You never commit by hand.
- `.gitignore` blocks spreadsheets and data files from the public repo.
- The page asks search engines not to index it.

Worth flagging:
- GitHub Pages on a free plan needs a public repo. That is fine because the repo has no data.
- Do not add your Excel file or `data.json` to the public repo. Ever.
- The sync token sits in this browser's storage. Use a token limited to the one private repo.
- If you want the site itself locked, host it on Cloudflare Pages behind Cloudflare Access instead (free for small use).

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
- Open the app > **Data** tab.
- Import your Excel sheet (first sheet, a Date column and a Weight column).
- Fill in height, age, goal weight, target date.
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

- **Trend weight**: smoothed weight (exponential average). Daily readings swing 1 to 2 kg from water.
- **Pace**: straight-line fit to your readings from the last 4 weeks.
- **Forecast**: "Same pace" continues that line. "If it slows" fades the pace out by about 1.5% per day.
- **Shaded band**: 80% range for the trend line.
- **Goal date window**: from the uncertainty in your pace.
- **Weekday effect**: each reading minus its centered 7 day average, grouped by weekday.
- **Flat stretch**: trend moved less than 0.15 kg in 10 days.
- **Energy**: Mifflin-St Jeor resting rate x activity, and about 7,700 kcal per kg of change. Rough.
- **BMI**: WHO cut-offs, or Asia-Pacific cut-offs in Data. It is a screen, not a diagnosis.
- The app warns if pace is above 1% of body weight per week.

## Try it with fake data

Open the app with `#demo` on the end of the URL. Nothing is saved in that mode.

## Files

- `index.html`, `style.css`: shell and look
- `stats.js`: all the math (runs in Node too)
- `charts.js`: charts and rings
- `app.js`: storage, import/export, sync, screens
- `lib/xlsx.full.min.js`: SheetJS 0.18.5, bundled so no third-party script loads
- `sw.js`, `manifest.webmanifest`, `icons/`: offline and home screen install
