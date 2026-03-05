const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3737;

const db = new Database(path.join(__dirname, 'wrestling.db'));

// Update schema with new capabilities
db.exec(`
  CREATE TABLE IF NOT EXISTS videos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    youtube_id TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    channel TEXT,
    coach_name TEXT,
    duration INTEGER,
    thumbnail_url TEXT,
    move_type TEXT,
    move_id TEXT,
    position TEXT,
    difficulty TEXT,
    age_group TEXT DEFAULT 'elementary (6-10)',
    style TEXT DEFAULT 'folkstyle',
    category TEXT,
    content_type TEXT DEFAULT 'technique',
    tags TEXT,
    upvotes INTEGER DEFAULT 0,
    downvotes INTEGER DEFAULT 0,
    rating INTEGER DEFAULT 0,
    source_type TEXT DEFAULT 'youtube',
    indexed_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Auto-migration for new fields
const migrations = [
  `ALTER TABLE videos ADD COLUMN coach_name TEXT`,
  `ALTER TABLE videos ADD COLUMN content_type TEXT DEFAULT 'technique'`,
  `ALTER TABLE videos ADD COLUMN move_id TEXT`,
  `ALTER TABLE videos ADD COLUMN category TEXT`,
  `ALTER TABLE videos ADD COLUMN upvotes INTEGER DEFAULT 0`,
  `ALTER TABLE videos ADD COLUMN downvotes INTEGER DEFAULT 0`,
  `ALTER TABLE videos ADD COLUMN rating INTEGER DEFAULT 0`
];
for (const sql of migrations) {
  try { 
    db.exec(sql); 
  } catch (e) {
    /* ignore if column already exists */
  }
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/search', (req, res) => {
  const { 
    q = '', 
    move_type = '', 
    position = '', 
    difficulty = '', 
    category = '',
    content_type = '',
    coach = '' 
  } = req.query;
  
  let conditions = ['1=1'];
  let params = [];

  if (q) {
    conditions.push(`(title LIKE ? OR description LIKE ? OR tags LIKE ? OR move_type LIKE ? OR channel LIKE ? OR coach_name LIKE ? OR category LIKE ?)`);
    const wild = `%${q}%`;
    params.push(wild, wild, wild, wild, wild, wild, wild);
  }
  if (move_type) { conditions.push(`move_type = ?`); params.push(move_type); }
  if (position) { conditions.push(`position = ?`); params.push(position); }
  if (difficulty) { conditions.push(`difficulty = ?`); params.push(difficulty); }
  if (category) { conditions.push(`category = ?`); params.push(category); }
  if (content_type) { conditions.push(`content_type = ?`); params.push(content_type); }
  if (coach) { conditions.push(`coach_name LIKE ?`); params.push(`%${coach}%`); }

  const sql = `SELECT * FROM videos WHERE ${conditions.join(' AND ')} ORDER BY rating DESC, upvotes DESC, indexed_at DESC LIMIT 60`;
  const videos = db.prepare(sql).all(...params);
  res.json(videos.map(formatVideo));
});

app.get('/api/categories', (req, res) => {
  const cats = db.prepare('SELECT DISTINCT category FROM videos WHERE category IS NOT NULL ORDER BY category').all();
  res.json(cats.map(c => c.category));
});

app.get('/api/content_types', (req, res) => {
  const types = db.prepare('SELECT DISTINCT content_type FROM videos WHERE content_type IS NOT NULL').all();
  res.json(types.map(t => t.content_type));
});

app.get('/api/coaches', (req, res) => {
  const coaches = db.prepare(`
    SELECT coach_name, COUNT(*) as count 
    FROM videos 
    WHERE coach_name IS NOT NULL AND coach_name != ''
    GROUP BY coach_name 
    ORDER BY count DESC
  `).all();
  res.json(coaches.map(c => ({
    name: c.coach_name,
    count: c.count
  })));
});

app.post('/api/vote/:id', (req, res) => {
  const { vote } = req.body;
  const videoId = req.params.id;
  
  const col = vote === 'up' ? 'upvotes' : 'downvotes';
  db.prepare(`UPDATE videos SET ${col} = ${col} + 1, rating = upvotes - downvotes WHERE id = ?`).run(videoId);
  
  const video = db.prepare('SELECT * FROM videos WHERE id = ?').get(videoId);
  res.json(formatVideo(video));
});

app.get('/api/stats', (req, res) => {
  const total = db.prepare('SELECT COUNT(*) as count FROM videos').get().count;
  const byCat = db.prepare('SELECT category, COUNT(*) as count FROM videos WHERE category IS NOT NULL GROUP BY category').all();
  const topRated = db.prepare('SELECT * FROM videos ORDER BY rating DESC LIMIT 5').all();
  
  const topCoaches = db.prepare(`
    SELECT coach_name, COUNT(*) as count 
    FROM videos 
    WHERE coach_name IS NOT NULL AND coach_name != ''
    GROUP BY coach_name 
    ORDER BY count DESC 
    LIMIT 10
  `).all();
  
  res.json({ 
    total, 
    byCat, 
    topRated: topRated.map(formatVideo),
    topCoaches: topCoaches.map(c => ({
      name: c.coach_name,
      count: c.count
    }))
  });
});

function formatVideo(v) {
  const mins = v.duration ? Math.floor(v.duration / 60) : null;
  const secs = v.duration ? String(v.duration % 60).padStart(2, '0') : null;
  return {
    ...v,
    duration_formatted: mins !== null ? `${mins}:${secs}` : null,
    embed_url: `https://www.youtube.com/embed/${v.youtube_id}`
  };
}

app.listen(PORT, () => {
  console.log(`🤼 Wrestling Coach running at http://localhost:${PORT}`);
});

module.exports = { db };
