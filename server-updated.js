const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3737;

const db = new Database(path.join(__dirname, 'wrestling.db'));

// Main schema with all features
db.exec(`CREATE TABLE IF NOT EXISTS videos (
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
)`);

// Migration helper
function addColumn(db, table, col, sqlType) {
  try {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${sqlType}`);
  } catch (e) {
    // Column already exists
  }
}

// Add new columns if missing
addColumn(db, 'videos', 'coach_name', 'TEXT');
addColumn(db, 'videos', 'content_type', "TEXT DEFAULT 'technique'");

// Lesson Plans Schema
db.exec(`CREATE TABLE IF NOT EXISTS lesson_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  difficulty TEXT DEFAULT 'beginner',
  category TEXT,
  age_group TEXT DEFAULT 'elementary (6-10)',
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  is_template INTEGER DEFAULT 0
)`);

db.exec(`CREATE TABLE IF NOT EXISTS plan_videos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lesson_plan_id INTEGER NOT NULL,
  video_id INTEGER NOT NULL,
  order_num INTEGER NOT NULL,
  notes TEXT,
  FOREIGN KEY (lesson_plan_id) REFERENCES lesson_plans(id) ON DELETE CASCADE,
  FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
)`);

// Add missing lesson plan columns
addColumn(db, 'lesson_plans', 'is_template', 'INTEGER DEFAULT 0');

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

// Lesson Plan API
app.get('/api/lesson-plans', (req, res) => {
  const isTemplate = req.query.is_template === 'true';
  const plans = db.prepare(`
    SELECT * FROM lesson_plans 
    WHERE is_template = ?
    ORDER BY created_at DESC
  `).all(isTemplate ? 1 : 0);
  
  res.json(plans.map(plan => {
    const videos = db.prepare(`
      SELECT p.*, v.title, v.youtube_id, v.thumbnail_url, v.duration_formatted
      FROM plan_videos p
      JOIN videos v ON p.video_id = v.id
      WHERE p.lesson_plan_id = ?
      ORDER BY p.order_num
    `).all(plan.id);
    
    return { ...plan, videos };
  }));
});

app.get('/api/lesson-plans/:id', (req, res) => {
  const plan = db.prepare('SELECT * FROM lesson_plans WHERE id = ?').get(req.params.id);
  if (!plan) return res.status(404).json({ error: 'Plan not found' });
  
  const videos = db.prepare(`
    SELECT p.*, v.title, v.youtube_id, v.thumbnail_url, v.duration_formatted
    FROM plan_videos p
    JOIN videos v ON p.video_id = v.id
    WHERE p.lesson_plan_id = ?
    ORDER BY p.order_num
  `).all(req.params.id);
  
  res.json({ ...plan, videos });
});

app.post('/api/lesson-plans', (req, res) => {
  const { name, description, difficulty, category, age_group, notes, videos, is_template } = req.body;
  
  const dbPlan = db.prepare(`
    INSERT INTO lesson_plans (name, description, difficulty, category, age_group, notes, is_template)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(name, description, difficulty, category, age_group, notes, is_template ? 1 : 0);
  
  const planId = dbPlan.lastInsertRowid;
  
  // Add videos in order
  for (const [index, video] of videos.entries()) {
    db.prepare(`
      INSERT INTO plan_videos (lesson_plan_id, video_id, order_num, notes)
      VALUES (?, ?, ?, ?)
    `).run(planId, video.id, index, video.notes);
  }
  
  res.json({ success: true, planId, name });
});

app.post('/api/lesson-plans/:id', (req, res) => {
  const { name, description, difficulty, category, age_group, notes, is_template } = req.body;
  
  db.prepare(`
    UPDATE lesson_plans 
    SET name = ?, description = ?, difficulty = ?, category = ?, age_group = ?, notes = ?, is_template = ?
    WHERE id = ?
  `).run(name, description, difficulty, category, age_group, notes, is_template ? 1 : 0, req.params.id);
  
  res.json({ success: true });
});

app.delete('/api/lesson-plans/:id', (req, res) => {
  db.prepare('DELETE FROM lesson_plans WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

app.post('/api/plan-videos/:planId/add', (req, res) => {
  const { videoId, notes } = req.body;
  
  // Get max order_num
  const maxOrder = db.prepare('SELECT MAX(order_num) as max FROM plan_videos WHERE lesson_plan_id = ?').get(req.params.planId);
  const newOrder = (maxOrder.max || -1) + 1;
  
  db.prepare(`
    INSERT INTO plan_videos (lesson_plan_id, video_id, order_num, notes)
    VALUES (?, ?, ?, ?)
  `).run(req.params.planId, videoId, newOrder, notes);
  
  res.json({ success: true, newOrder });
});

app.post('/api/plan-videos/:planId/reorder', (req, res) => {
  const { videoId, newOrder } = req.body;
  
  // Get all videos in plan
  const videos = db.prepare('SELECT * FROM plan_videos WHERE lesson_plan_id = ? ORDER BY order_num').all(req.params.planId);
  
  // Update order_num for all videos
  for (const video of videos) {
    if (video.id === videoId) {
      db.prepare('UPDATE plan_videos SET order_num = ? WHERE id = ?').run(newOrder, video.id);
    } else if (video.order_num === newOrder) {
      db.prepare('UPDATE plan_videos SET order_num = ? WHERE id = ?').run(video.order_num, video.id);
    }
  }
  
  res.json({ success: true });
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
  const byContentType = db.prepare('SELECT content_type, COUNT(*) as count FROM videos WHERE content_type IS NOT NULL GROUP BY content_type').all();
  const topRated = db.prepare('SELECT * FROM videos ORDER BY rating DESC LIMIT 5').all();
  const lessonPlanCount = db.prepare('SELECT COUNT(*) as count FROM lesson_plans').get().count;
  
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
    byContentType,
    topRated: topRated.map(formatVideo),
    topCoaches: topCoaches.map(c => ({
      name: c.coach_name,
      count: c.count
    })),
    lessonPlanCount
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
