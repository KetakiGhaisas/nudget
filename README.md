# nudget

A calm, detailed GTD task manager with habit tracking, events, AI capture, and custom themes.

---

## Folder structure

```
nudget/
├── index.html              ← entry point
├── .gitignore
├── README.md
│
├── css/
│   ├── themes.css          ← all colour theme variables
│   ├── base.css            ← reset, layout, topbar, nav, FAB
│   ├── components.css      ← reusable UI: cards, tags, forms, buttons
│   ├── screens.css         ← per-screen styles
│   └── overlays.css        ← sheet / modal styles
│
├── js/
│   ├── config.js           ← API key (DO NOT COMMIT — in .gitignore)
│   ├── store.js            ← all data, localStorage persistence
│   ├── ai.js               ← Groq API integration + local fallback
│   ├── render.js           ← all DOM rendering
│   └── app.js              ← navigation, event wiring, app controller
│
└── assets/
    ├── icons/
    │   ├── icon-32.png          ← browser tab favicon (32×32)
    │   ├── fab-icon.png         ← FAB button icon (28×28, white on transparent)
    │   ├── nudge-icon.png       ← nudge bar icon (20×20)
    │   ├── empty-state.png      ← empty state illustration (48×48)
    │   │
    │   ├── nav-today.png        ← nav bar icons (20×20, white/light)
    │   ├── nav-inbox.png
    │   ├── nav-habits.png
    │   ├── nav-projects.png
    │   ├── nav-calendar.png
    │   ├── nav-scratch.png
    │   ├── nav-dash.png
    │   │
    │   ├── events/
    │   │   ├── birthday.png     ← event type icons (22×22)
    │   │   ├── anniversary.png
    │   │   ├── deadline.png
    │   │   ├── reminder.png
    │   │   └── other.png
    │   │
    │   └── habits/
    │       ├── water.png        ← habit icons (18×18 or 20×20)
    │       ├── reading.png      ← name these whatever you like,
    │       ├── run.png          ← then enter the filename when
    │       ├── supplements.png  ← adding a habit in the app
    │       ├── meditation.png
    │       └── ...              ← add as many as you need
    │
    └── kawaii/
        ├── theme-preview.png    ← small preview swatch in theme picker (40×28)
        └── card-pattern.png     ← repeating tile for morning card bg (64×64)
```

---

## Free AI setup (Groq — no credit card)

1. Go to **https://console.groq.com** and sign up (free).
2. Click **API Keys** → **Create API Key** → copy it.
3. Open `js/config.js` and paste your key:
   ```js
   const CONFIG = {
     GROQ_API_KEY: 'gsk_your_key_here',
     USER_NAME: 'Ketaki',   // shows in morning greeting
   };
   ```
4. Save. The app will now use `llama-3.1-8b-instant` (fast, free).

**If you skip this step**, the app still works — it uses a built-in rule-based parser
that handles common natural language patterns without any API call.

---

## Deploying (free)

### Option A — Vercel (easiest, recommended)
```bash
npm install -g vercel
cd nudget
vercel
```
Done. Vercel gives you a free HTTPS URL.

### Option B — Netlify drag-and-drop
1. Go to https://app.netlify.com
2. Drag the entire `nudget/` folder into the deploy zone.
3. Done. Free HTTPS URL instantly.

### Option C — GitHub Pages
1. Push to a public GitHub repo.
2. Settings → Pages → Source: main branch, / (root).
3. Available at `https://yourusername.github.io/nudget`.

**Note on config.js:** Because `js/config.js` is in `.gitignore`, it won't be pushed.
For Vercel/Netlify, either:
- Upload the file manually after deploy, or
- Use their environment variable feature and load the key from `window.ENV` instead of a file.

---

## Asset specs for Procreate

All assets should be exported from Procreate as **PNG with transparent background**.
Export at 2× and name the 2× version (the app will use it directly).

| Asset | Size | Notes |
|---|---|---|
| icon-32.png | 32×32 | Favicon. Simple, readable at tiny size. |
| fab-icon.png | 28×28 | White on transparent. Will show on coloured FAB button. |
| nudge-icon.png | 20×20 | Small icon next to nudge text. |
| empty-state.png | 48×48 | Shown when a list is empty. Can be anything calm. |
| nav-*.png (×7) | 20×20 | Nav bar icons. **Draw in white** — the CSS filter tints them to the theme colour automatically. |
| events/birthday.png | 22×22 | Event type icons. Draw on transparent bg. |
| events/anniversary.png | 22×22 | |
| events/deadline.png | 22×22 | |
| events/reminder.png | 22×22 | |
| events/other.png | 22×22 | |
| habits/*.png | 18×20 | One per habit type. Name them freely — enter the filename in the app when adding a habit. |
| kawaii/theme-preview.png | 40×28 | Shown in the theme picker tile. A cute preview swatch. |
| kawaii/card-pattern.png | 64×64 | **Seamlessly tiling** pixel pattern. Used as morning card background in kawaii theme. |

**Nav icon tip:** Draw all 7 nav icons in white (#FFFFFF) on a transparent canvas.
The CSS `filter` property converts them to the correct theme colour automatically —
so one set of white icons works across all 8 themes.

---

## How data works

Everything is saved to `localStorage` under the key `nudget_v1`.
No server, no account, no sync (yet). Data stays on the device/browser.

To reset everything: open browser DevTools → Application → Local Storage →
delete `nudget_v1`.

---

## Kawaii theme

The kawaii theme colours are pre-configured. To fully activate it:
1. Draw and export `assets/kawaii/card-pattern.png` (64×64 seamless tile).
2. Draw and export `assets/kawaii/theme-preview.png` (40×28 preview).
3. Select the Kawaii tile in the theme picker — it will apply.

You can also tweak the kawaii colour palette in `css/themes.css`
under `[data-theme="kawaii"]`.