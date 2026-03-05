const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3737;

// DB setup
const db = new Database(path.join(__dirname, 'wrestling.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS videos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    youtube_id TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    channel TEXT,
    duration INTEGER,
    thumbnail_url TEXT,
    move_type TEXT,
    position TEXT,
    difficulty TEXT,
    age_group TEXT,
    style TEXT DEFAULT 'folkstyle',
    tags TEXT,
    source_type TEXT DEFAULT 'youtube',
    indexed_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── Search endpoint ───────────────────────────────────────────────────────
app.get('/api/search', (req, res) => {
  const { q = '', move_type = '', position = '', difficulty = '', age_group = '' } = req.query;

  let conditions = [];
  let params = [];

  if (q) {
    conditions.push(`(title LIKE ? OR description LIKE ? OR tags LIKE ? OR move_type LIKE ? OR channel LIKE ?)`);
    const wild = `%${q}%`;
    params.push(wild, wild, wild, wild, wild);
  }
  if (move_type) { conditions.push(`move_type = ?`); params.push(move_type); }
  if (position)  { conditions.push(`position = ?`);  params.push(position);  }
  if (difficulty){ conditions.push(`difficulty = ?`); params.push(difficulty); }
  if (age_group) { conditions.push(`age_group = ?`); params.push(age_group); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const sql = `SELECT * FROM videos ${where} ORDER BY indexed_at DESC LIMIT 60`;

  try {
    const videos = db.prepare(sql).all(...params);
    res.json(videos.map(formatVideo));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Stats endpoint ────────────────────────────────────────────────────────
app.get('/api/stats', (req, res) => {
  const total = db.prepare('SELECT COUNT(*) as count FROM videos').get().count;
  const byMove = db.prepare('SELECT move_type, COUNT(*) as count FROM videos GROUP BY move_type').all();
  const byPos  = db.prepare('SELECT position, COUNT(*) as count FROM videos GROUP BY position').all();
  const byDiff = db.prepare('SELECT difficulty, COUNT(*) as count FROM videos GROUP BY difficulty').all();
  res.json({ total, byMove, byPos, byDiff });
});

// ─── Add video endpoint (for crawler) ────────────────────────────────────
app.post('/api/videos', (req, res) => {
  const v = req.body;
  try {
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO videos
        (youtube_id, title, description, channel, duration, thumbnail_url,
         move_type, position, difficulty, age_group, style, tags, source_type)
      VALUES
        (@youtube_id, @title, @description, @channel, @duration, @thumbnail_url,
         @move_type, @position, @difficulty, @age_group, @style, @tags, @source_type)
    `);
    const result = stmt.run(v);
    res.json({ inserted: result.changes > 0, id: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function formatVideo(v) {
  const mins = v.duration ? Math.floor(v.duration / 60) : null;
  const secs = v.duration ? String(v.duration % 60).padStart(2, '0') : null;
  return {
    ...v,
    duration_formatted: mins !== null ? `${mins}:${secs}` : null,
    embed_url: `https://www.youtube.com/embed/${v.youtube_id}`,
    watch_url: `https://www.youtube.com/watch?v=${v.youtube_id}`
  };
}

// ─── Auto-seed on startup if DB is empty ─────────────────────────────────
function seedIfEmpty() {
  const count = db.prepare('SELECT COUNT(*) as count FROM videos').get().count;
  if (count > 0) {
    console.log(`📦 DB has ${count} videos, skipping seed.`);
    return;
  }
  const seedPath = path.join(__dirname, 'seed_videos.json');
  if (!fs.existsSync(seedPath)) {
    console.log('⚠️  No seed file found, starting with empty DB.');
    return;
  }
  const videos = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO videos
      (youtube_id, title, description, channel, duration, thumbnail_url,
       move_type, position, difficulty, age_group, style, tags, source_type)
    VALUES
      (@youtube_id, @title, @description, @channel, @duration, @thumbnail_url,
       @move_type, @position, @difficulty, @age_group, @style, @tags, @source_type)
  `);
  const insert = db.transaction((vids) => {
    for (const v of vids) stmt.run(v);
  });
  insert(videos);
  console.log(`🌱 Seeded ${videos.length} videos from seed_videos.json`);
}

app.listen(PORT, () => {
  console.log(`🤼 Wrestling Coach running at http://localhost:${PORT}`);
  seedIfEmpty();
});

module.exports = { db };
