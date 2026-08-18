# Study Scanner

A small installable web app for scanning handwritten class notes and turning
them into AI study guides or practice quizzes, per class, filtered by date
range.

- **No server, no build step.** It's static HTML/CSS/JS. Your scanned images
  and transcribed text live in your browser's IndexedDB, on your device only.
- **No account, no cost.** AI calls go straight from your phone/browser to
  Google's Gemini API using a free API key you create yourself.
- **Installable.** Once hosted over HTTPS, Chrome on Android (and desktop
  Chrome/Edge) will offer "Add to Home screen" / "Install app", so it behaves
  like a normal app icon.

## 1. Get a free Gemini API key

1. Go to **aistudio.google.com/apikey** and sign in with any Google account.
2. Click **Create API key**. No credit card required for the free tier.
3. Copy the key — you'll paste it into the app's Settings screen once it's
   running (not into any file here).

The free tier has rate limits (a limited number of requests per minute and
per day). That's plenty for scanning notes after class and generating a
study guide before an exam, but if you hammer it with dozens of scans back
to back you may see a rate-limit error — just wait a minute and retry.

## 2. Deploy it (pick one, all free)

### Option A — Netlify (drag and drop, easiest)
1. Go to **app.netlify.com/drop**.
2. Drag the whole `study-scanner` folder onto the page.
3. You'll get a live `https://something.netlify.app` URL immediately —
   that's your app.

### Option B — Vercel
1. Go to **vercel.com**, sign up free.
2. `npm i -g vercel` (needs Node installed), then from inside the
   `study-scanner` folder run `vercel --prod`.
3. Accept the defaults (it's a static site, no build command needed).

### Option C — GitHub Pages (free, good if you want version history)
1. Create a new GitHub repo and push this folder's contents to it.
2. In the repo, go to **Settings → Pages**, set source to your main branch
   (root).
3. GitHub gives you a `https://yourname.github.io/reponame/` URL.

Any of these works — pick whichever you're most comfortable with. HTTPS is
required for the camera and install-prompt to work, and all three give you
HTTPS automatically.

## 3. Install it on your phone

1. Open your deployed URL in Chrome on Android.
2. Tap the **⋮** menu → **Add to Home screen** / **Install app**.
3. Open it from your home screen — it now runs full-screen like a normal app.

## 4. First run

1. Tap the **⚙ settings** icon (top right), paste your Gemini API key, and
   tap **Test key** to confirm it works. Tap **Save settings**.
2. Back on the home screen, tap **+** to add a class (give it a name and a
   color tab).
3. Open the class → **📷 Scan a note** → photograph a page → **Transcribe
   with AI** → review/edit the text → **Save to class**.
4. Once you've scanned a few notes, tap **✨ Study guide** from the class
   screen, pick a date range, choose *Study guide* or *Practice quiz*, and
   generate.

## Notes on how it works

- **Scanning** sends a compressed photo of the page to Gemini's vision model,
  which transcribes it to text. You can edit the transcription before
  saving — handwriting recognition isn't perfect, especially on messy
  writing, so it's worth a quick proofread the first few times.
- **Study guides / quizzes** are generated from the *transcribed text* of the
  notes in your chosen date range, not the images — so accurate
  transcriptions make for better study guides.
- Both the **original photo** and the **transcribed text** are kept for every
  note (visible as the thumbnail + excerpt in the class's note list), so
  nothing is thrown away.
- Everything is stored **locally in the browser** (IndexedDB). There's no
  account system and no sync — if you switch phones or clear site data,
  your notes don't come with you. If you want a backup, the easiest path is
  periodically using **Copy text** on generated guides, or extending the app
  yourself to export/import a JSON backup (the data model is simple: see
  `js/db.js`).

## If AI calls stop working

Google renames and retires free-tier model ids every few months. If you
start seeing a "model not found" error:

1. Check **ai.google.dev/gemini-api/docs/models** for the current free
   Flash-tier model id.
2. Open the app's **Settings** screen and paste the new id into **Model id**.

No code changes needed — the model id is just a saved setting.

## Project structure

```
study-scanner/
├── index.html          # single-page app shell (all views)
├── manifest.webmanifest
├── service-worker.js    # caches the app shell for offline browsing
├── css/style.css
├── js/
│   ├── db.js            # IndexedDB storage (classes + notes)
│   ├── gemini.js         # calls to the Gemini API (OCR + generation)
│   ├── markdown.js       # tiny markdown -> HTML renderer for guides
│   └── app.js            # UI logic / view routing
└── icons/
```

No npm install, no bundler — edit the files directly and redeploy.
