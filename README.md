# nudget v2 — cloud + offline setup guide

---

## Folder structure

```
nudget/
├── index.html                          ← entry point (updated for auth + Supabase)
├── manifest.json                       ← PWA manifest (add to home screen on iOS/Android)
├── .gitignore
├── README.md
│
├── css/                                ← unchanged from v1
│   ├── themes.css
│   ├── base.css
│   ├── components.css
│   ├── screens.css
│   └── overlays.css
│
├── js/
│   ├── config.js      ← Supabase + Groq credentials (DO NOT COMMIT)
│   ├── db.js          ← all Supabase operations (NEW)
│   ├── sync.js        ← offline queue + realtime sync (NEW)
│   ├── store.js       ← in-memory state, reads from IndexedDB cache (UPDATED)
│   ├── ai.js          ← Groq AI + local fallback (unchanged)
│   ├── auth.js        ← login/signup screen (NEW)
│   ├── render.js      ← DOM rendering (copy from v1, update field names)
│   └── app.js         ← navigation + boot sequence (UPDATED)
│
├── supabase/
│   ├── migrations/
│   │   ├── 001_initial_schema.sql     ← run this first in Supabase SQL Editor
│   │   └── 002_helpers.sql            ← run this second
│   └── functions/
│       ├── nudge-checker/index.ts     ← daily cron: checks freq tasks, creates nudges
│       └── scratch-collapse/index.ts  ← midnight cron: collapses scratch pad
│
└── assets/                            ← same as v1
    ├── icons/
    │   ├── icon-32.png
    │   ├── icon-192.png               ← NEW: needed for PWA / home screen icon
    │   ├── icon-512.png               ← NEW: needed for PWA splash
    │   ├── nav-*.png (×7)
    │   ├── events/
    │   └── habits/
    └── kawaii/
```

---

## Step 1 — Supabase setup (15 min, free)

1. Go to **supabase.com** → New project (free tier, no card)
2. Choose a region close to you, set a strong DB password
3. Wait for project to provision (~2 min)
4. Go to **SQL Editor** → paste + run `supabase/migrations/001_initial_schema.sql`
5. Go to **SQL Editor** → paste + run `supabase/migrations/002_helpers.sql`
6. Go to **Settings → API** → copy:
   - `Project URL`  →  paste into `CONFIG.SUPABASE_URL` in `js/config.js`
   - `anon public` key  →  paste into `CONFIG.SUPABASE_ANON_KEY` in `js/config.js`
7. Go to **Authentication → Providers** → enable **Google** if you want Google sign-in
   (requires a Google OAuth client ID — optional)

### Enable Google OAuth (optional)
1. Go to console.cloud.google.com → New project
2. APIs & Services → Credentials → Create OAuth 2.0 Client ID
3. Authorized redirect URIs: `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`
4. Paste the Client ID and Secret into Supabase → Auth → Providers → Google

---

## Step 2 — Groq AI setup (2 min, free)

1. Go to **console.groq.com** → sign up free (no card)
2. API Keys → Create new key → copy
3. Paste into `CONFIG.GROQ_API_KEY` in `js/config.js`

If you skip this, the app still works with the built-in rule-based parser.

---

## Step 3 — Edge functions (cron jobs)

These run on Supabase's servers daily. They handle nudge escalation and scratch pad EOD collapse.

### Deploy functions

```bash
# Install Supabase CLI
npm install -g supabase

# Login
supabase login

# Link to your project
supabase link --project-ref YOUR_PROJECT_REF

# Deploy both functions
supabase functions deploy nudge-checker
supabase functions deploy scratch-collapse
```

### Set up cron jobs in Supabase Dashboard

Go to **Database → Cron Jobs → New cron job**:

| Name | Schedule | Function |
|---|---|---|
| `nudge-checker` | `0 8 * * *` | `nudge-checker` |
| `scratch-collapse` | `0 0 * * *` | `scratch-collapse` |

---

## Step 4 — Deploy the web app (free)

### Option A — Vercel (recommended)
```bash
npm install -g vercel
cd nudget
vercel
```
Done. Free HTTPS URL. Every `git push` auto-deploys.

### Option B — Netlify drag-and-drop
1. Go to app.netlify.com
2. Drag the `nudget/` folder into the deploy zone
3. Done instantly

### Option C — GitHub Pages
1. Push to GitHub (make sure `js/config.js` is in `.gitignore`)
2. Settings → Pages → Branch: main, folder: / (root)
3. Add config.js as a Netlify environment variable or inline it in your build step

**Important:** `js/config.js` is in `.gitignore`. On Vercel/Netlify, either:
- Upload it manually after deploy (via their file manager), or
- Use environment variables: set `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `GROQ_API_KEY`
  as env vars in your hosting dashboard, then add a build step that generates config.js:
  ```bash
  echo "const CONFIG = { SUPABASE_URL: '$SUPABASE_URL', SUPABASE_ANON_KEY: '$SUPABASE_ANON_KEY', GROQ_API_KEY: '$GROQ_API_KEY', APP_NAME: 'nudget', USER_NAME: '' };" > js/config.js
  ```

---

## Step 5 — Install on phone (PWA)

### Android (Chrome)
1. Open your deployed URL in Chrome
2. Tap the three-dot menu → "Add to Home screen"
3. App installs like a native app, offline mode included

### iOS (Safari)
1. Open your deployed URL in Safari
2. Tap the Share button → "Add to Home Screen"
3. App icon appears on your home screen

The manifest.json and icon files handle the splash screen and icon automatically.
You need `icon-192.png` and `icon-512.png` in `assets/icons/` for this to look right.

---

## What works offline

| Feature | Offline | Notes |
|---|---|---|
| View all tasks | Yes | Loaded from IndexedDB cache |
| Add tasks | Yes | Queued, syncs on reconnect |
| Edit tasks / change GTD state | Yes | Queued |
| Habit check-offs | Yes | Queued |
| Scratch pad | Yes | Queued |
| View habits / events / calendar | Yes | From cache |
| AI task parsing | No | Groq API needs internet |
| Sync to other devices | No | Needs connection |
| Login / signup | No | Needs connection |

When offline, a yellow banner appears at the top showing how many changes are queued.
When you reconnect, the queue flushes automatically and the banner shows "SYNCING..." briefly.

---

## Asset specs (Procreate)

Same as v1, plus two new sizes for PWA:

| File | Size | Notes |
|---|---|---|
| `icon-32.png` | 32×32 | Browser favicon |
| `icon-192.png` | 192×192 | PWA home screen icon (Android) |
| `icon-512.png` | 512×512 | PWA splash / install prompt |
| All nav icons | 20×20 | White on transparent — CSS tints to theme color |
| All others | Same as v1 README | |

The 192 and 512 icons should be square, colorful, and readable at both sizes.
A simple pixel-art "n" or the nudget star glyph works well.

---

## Database field name note

The Supabase schema uses `snake_case` (e.g. `gtd_state`, `due_date`, `progress_type`).
The v1 frontend used `camelCase` (e.g. `gtdState`, `dueDate`, `progressType`).

In `render.js`, update all field references to match the DB:
- `task.gtdState`     → `task.gtd_state`
- `task.dueDate`      → `task.due_date`
- `task.freqDays`     → `task.freq_days`
- `task.progressType` → `task.progress_type`
- `task.progressVal`  → `task.progress_val`
- `task.progressTarget` → `task.progress_target`
- `task.progressUnit` → `task.progress_unit`
- `habit.progressTarget` → `habit.progress_target`
- `habit.progressUnit`   → `habit.progress_unit`
- `event.eventDate`   → `event.event_date`
- `event.type`        → same