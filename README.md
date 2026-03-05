# 🤼 Wrestling Coach Assistant

A searchable wrestling technique library for coaches. Search YouTube videos by move type, position, difficulty, and coaching ratings.

Perfect for K-12 folkstyle wrestling coaches who want a curated library of instruction videos.

---

## Features

- **Search by move**: Single leg, double leg, half nelson, cradle, spladle, etc.
- **Filter by position**: Neutral, top (offense), bottom (defense)
- **Filter by difficulty**: Beginner, intermediate, advanced
- **Coaching ratings**: Upvote/downvote videos to rank them by quality
- **Smart categorization**: Auto-tagged by complete folkstyle taxonomy
- **Mobile-friendly**: Works on phones/tablets at the mat

---

## Quick Start (Deployed Version)

1. Go to your deployed URL (e.g., `https://wrestling-coach.onrender.com`)
2. Click a category pill: **Pins**, **Escapes**, **Takedowns**, etc.
3. Click a video to watch it
4. 👍/👎 rate it to help rank quality for other coaches

---

## Development Setup

### Prerequisites

- **Node.js 18+** — [Download here](https://nodejs.org/)
- **yt-dlp** — YouTube video searcher (install separately, see below)
- **SQLite3** — Usually pre-installed on Mac/Linux; Windows users may need to install
- **Build tools** — Required for `better-sqlite3` (see below)

---

### Step 1: Clone and Install Dependencies

```bash
# Clone the repo
git clone https://github.com/tmmmemcee/wrestling-coach.git
cd wrestling-coach

# Install Node dependencies (including better-sqlite3)
npm install
```

> **Note:** `better-sqlite3` requires a C++ compiler.
> - **Mac:** Run `xcode-select --install`
> - **Linux:** Run `sudo apt-get install build-essential`
> - **Windows:** Install [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)

---

### Step 2: Install yt-dlp

**Linux:**

```bash
curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o yt-dlp
chmod +x yt-dlp
sudo mv yt-dlp /usr/local/bin/
```

**Mac:**

```bash
brew install yt-dlp
```

**Windows:**

Download from https://github.com/yt-dlp/yt-dlp/releases and add to your PATH.

---

### Step 3: Verify yt-dlp Works

```bash
yt-dlp --version
# Should output something like: 2026.03.03
```

---

### Step 4: Start the Server (Creates Database)

```bash
# Start the server (this creates wrestling.db if it doesn't exist)
npm start

# You should see:
# 🤼 Wrestling Coach running at http://localhost:3737
```

Open http://localhost:3737 in your browser. You should see the app with seed videos loaded.

---

### Step 5: Run the Crawler (Add More Videos)

**Open a new terminal** (keep the server running in the first one):

```bash
# Run crawler (adds videos using taxonomy auto-tagging)
node crawler-v2.js --max=5

# Dry run first to preview without saving
node crawler-v2.js --max=3 --dry-run
```

Expected output:

```
🤼 Wrestling Crawler Starting
   Mode: LIVE
   Max per query: 5

🔍 folkstyle wrestling single leg takedown
  ✅ Youth Wrestling: Takedown Fundamentals
  ✅ How to SHOOT the PERFECT Single Leg for Beginners!
...

✅ Done! Added: 15 | Skipped: 3 | Exists: 2
```

---

### Step 6: View New Videos

Refresh your browser at http://localhost:3737. New videos should appear.

---

## Troubleshooting

### `Error: Cannot find module 'better-sqlite3'`

```bash
npm install better-sqlite3
```

If that fails, you may need build tools:

- **Mac:** `xcode-select --install`
- **Linux:** `sudo apt-get install build-essential`
- **Windows:** Install [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)

---

### `yt-dlp: command not found`

yt-dlp isn't installed or isn't in your PATH. Follow Step 2 above.

---

### `Error: SQLITE_CANTOPEN: unable to open database file`

The `wrestling.db` file needs to be created. Run `npm start` first — the server creates the database automatically.

---

### `ECONNREFUSED 127.0.0.1:3737`

The server isn't running. Start it first:

```bash
npm start
```

Then run the crawler in a separate terminal.

---

### `permission denied` errors on Linux/Mac

Make sure yt-dlp is executable:

```bash
chmod +x /usr/local/bin/yt-dlp
```

---

## Quick Reference

```bash
# Start server
npm start

# Run crawler (new terminal)
node crawler-v2.js --max=5

# View app
open http://localhost:3737
```

---

## Taxonomy

### Categories

| Category | Description | Examples |
|----------|-------------|----------|
| **Pins** | Shoulder-mounting holds | Half nelson, power half, double chicken wing, arm bar, cradle, spladle |
| **Tilts** | Turning moves | Wrist tilt, 2-on-1 tilt, leg tilt, deep half |
| **Takedowns** | Neutral position attacks | Single leg, double leg, ankle pick, fireman's carry, duck under |
| **Escapes** | Bottom position exits | Stand up, switch, sit out, granby roll |
| **Reversals** | Move from bottom to top | Switch reversal, sit out turn in, whip over |
| **Defense** | Stopping opponent attacks | Sprawl, whizzer, underhook, down block |
| **Riding** | Top control techniques | Leg ride, boot scoot, breakdown, cowboy |
| **Fundamentals** | Basics and drills | Stance, level change, penetration step, hand fighting |

---

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/search` | Search videos by query, position, difficulty, category |
| `GET /api/categories` | Get all categories |
| `GET /api/moves/:category` | Get all moves in a category |
| `POST /api/vote/:id` | Rate a video (`vote: 'up'` or `'down'`) |
| `GET /api/stats` | Get overall stats and top-rated videos |

---

## Deployment (Render)

1. Go to render.com → Sign up (free)
2. New Web Service → Connect GitHub
3. Select `wrestling-coach` repo
4. Settings:
   - **Name:** wrestling-coach
   - **Environment:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Plan:** Free
5. Deploy!

**Note:** The deployed version loads seed data automatically. To add more videos:
1. Run the crawler locally to update `wrestling.db`
2. Export to `seed_videos.json`: `sqlite3 wrestling.db "SELECT * FROM videos" > seed_videos.json`
3. Push to GitHub
4. Deploy again (full rebuild)

---

## License

MIT — Free for coaching use.

---

## Credits

Built for youth wrestling coaches. Videos sourced from YouTube (FloWrestling, RUDIS, CKLWrestling, and more). All rights belong to original creators.