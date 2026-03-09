const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');
const * as nostrTools from 'nostr-tools';

const app = express();
const PORT = process.env.PORT || 3737;

const db = new Database(path.join(__dirname, 'wrestling.db'));

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
  style TEXT DEFAULT 'folkstyle'
  , styles TEXT,
  is_pro_wrestling INTEGER DEFAULT 0,
  content_type TEXT DEFAULT 'technique',
  category TEXT,
  tags TEXT,
  upvotes INTEGER DEFAULT 0,
  downvotes INTEGER DEFAULT 0,
  rating INTEGER DEFAULT 0,
  source_type TEXT DEFAULT 'youtube',
  indexed_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

function addColumn(db, table, col, sqlType) {
  try { db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${sqlType}`); } catch (e) {}
}

addColumn(db, 'videos', 'coach_name', 'TEXT');
addColumn(db, 'videos', 'content_type', "TEXT DEFAULT 'technique'");

db.exec(`CREATE TABLE IF NOT EXISTS lesson_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  difficulty TEXT DEFAULT 'beginner',
  category TEXT,
  age_group TEXT DEFAULT 'elementary (6-10)',
  style TEXT DEFAULT 'folkstyle',
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

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'static')));
// Serve auth.js for all pages
app.use((req, res, next) => {
  next();
});

app.get('/api/search', (req, res) => {
  const { q = '', move_type = '', position = '', difficulty = '', category = '', content_type = '', coach = '', style = '', limit = '100' } = req.query;
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
  
  // Filter by content type (technique, documentary, interview, match, etc.)
  if (content_type) { 
    conditions.push(`content_type = ?`); 
    params.push(content_type); 
  }
  
  if (coach) { conditions.push(`coach_name LIKE ?`); params.push(`%${coach}%`); }
  
  // New: Filter by style
  if (style && style !== 'all') {
    conditions.push(`styles LIKE ?`);
    params.push(`%${style}%`);
  }
  
  // Exclude pro wrestling by default (unless specifically requested)
  conditions.push(`is_pro_wrestling = 0`);

  const sql = `SELECT * FROM videos WHERE ${conditions.join(' AND ')} ORDER BY rating DESC, upvotes DESC, indexed_at DESC LIMIT ${parseInt(limit)}`;
  const videos = db.prepare(sql).all(...params);
  res.json(videos.map(formatVideo));
});

app.get('/api/categories', (req, res) => {
  const cats = db.prepare('SELECT DISTINCT category FROM videos WHERE category IS NOT NULL ORDER BY category').all();
  res.json(cats.map(c => c.category));
});

app.get('/api/content_types', (req, res) => {
  const types = db.prepare('SELECT DISTINCT content_type FROM videos WHERE content_type IS NOT NULL ORDER BY content_type').all();
  res.json(types.map(t => t.content_type));
});

// New: Get all documentaries
app.get('/api/documentaries', (req, res) => {
  const documentaries = db.prepare(`
    SELECT * FROM videos 
    WHERE content_type = 'documentary' 
    AND is_pro_wrestling = 0
    ORDER BY rating DESC, upvotes DESC
  `).all();
  res.json(documentaries.map(formatVideo));
});

app.get('/api/coaches', (req, res) => {
  const coaches = db.prepare(`
    SELECT coach_name, COUNT(*) as count 
    FROM videos 
    WHERE coach_name IS NOT NULL AND coach_name != ''
    GROUP BY coach_name 
    ORDER BY count DESC
  `).all();
  res.json(coaches.map(c => ({ name: c.coach_name, count: c.count })));
});

app.get('/api/lesson-plans', (req, res) => {
  const isTemplate = req.query.is_template === 'true';
  const plans = db.prepare(`SELECT * FROM lesson_plans WHERE is_template = ? ORDER BY created_at DESC`).all(isTemplate ? 1 : 0);
  
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
  const { name, description, difficulty, category, age_group, notes, videos, is_template, style } = req.body;
  
  const dbPlan = db.prepare(`
    INSERT INTO lesson_plans (name, description, difficulty, category, age_group, notes, is_template, style)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(name, description, difficulty, category, age_group, notes, is_template ? 1 : 0, style || 'folkstyle');
  
  const planId = dbPlan.lastInsertRowid;
  
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
  const videos = db.prepare('SELECT * FROM plan_videos WHERE lesson_plan_id = ? ORDER BY order_num').all(req.params.planId);
  
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
  const { vote, action } = req.body; // action: 'increment' or 'toggle'
  const videoId = req.params.id;
  
  if (vote === 'up' && action === 'toggle') {
    // Toggle logic: just return current state, client handles storage
    const video = db.prepare('SELECT * FROM videos WHERE id = ?').get(videoId);
    res.json(formatVideo(video));
    return;
  }
  
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
    topCoaches: topCoaches.map(c => ({ name: c.coach_name, count: c.count })),
    lessonPlanCount
  });
});

// Nostr Auth Routes
// Generate authentication challenge
app.get('/api/nostr/challenge', (req, res) => {
  const challengeId = Date.now().toString(36) + Math.random().toString(36).substr(2);
  const challengeText = `Sign this to authenticate with Wrestling Coach: ${challengeId}`;
  
  // Store challenge (simplified - in production use Redis/database)
  req.app.locals.challenges = req.app.locals.challenges || new Map();
  req.app.locals.challenges.set(challengeId, {
    text: challengeText,
    created: Date.now(),
    expires: Date.now() + 5 * 60 * 1000 // 5 minutes
  });
  
  res.json({
    challengeId,
    message: challengeText,
    expires: Date.now() + 5 * 60 * 1000
  });
});

// Verify authentication and create/login user
app.post('/api/nostr/auth', (req, res) => {
  const { event } = req.body;
  
  if (!event || !event.pubkey || !event.sig) {
    return res.status(400).json({ error: 'Invalid event' });
  }
  
  // Verify the signature
  if (!nostrTools.verifyEvent(event)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }
  
  // Extract challenge from event tags
  const challengeTag = event.tags.find(tag => tag[0] === 'challenge');
  if (!challengeTag) {
    return res.status(400).json({ error: 'No challenge in event' });
  }
  
  const challengeId = challengeTag[1];
  const challenges = req.app.locals.challenges || new Map();
  const challenge = challenges.get(challengeId);
  
  if (!challenge) {
    return res.status(400).json({ error: 'Challenge not found' });
  }
  
  if (Date.now() > challenge.expires) {
    challenges.delete(challengeId);
    return res.status(400).json({ error: 'Challenge expired' });
  }
  
  challenges.delete(challengeId);
  
  // Create or get user
  const npub = nostrTools.npubEncode(Buffer.from(event.pubkey, 'hex'));
  
  const existingUser = db.prepare('SELECT * FROM users WHERE npub = ?').get(npub);
  
  if (existingUser) {
    // Update last login
    db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE npub = ?').run(npub);
    res.json({
      success: true,
      user: {
        npub,
        display_name: existingUser.display_name,
        logged_in_at: existingUser.last_login
      }
    });
  } else {
    // Create new user
    const displayName = `User ${npub.slice(0, 8)}...`;
    db.prepare('INSERT INTO users (npub, display_name) VALUES (?, ?)').run(npub, displayName);
    
    res.json({
      success: true,
      user: {
        npub,
        display_name: displayName,
        created_at: Date.now()
      }
    });
  }
});

// Check if user is logged in
app.get('/api/nostr/authenticated', (req, res) => {
  const npub = req.headers['x-npub'];
  
  if (!npub) {
    return res.json({ authenticated: false });
  }
  
  const user = db.prepare('SELECT npub, display_name, last_login FROM users WHERE npub = ?').get(npub);
  res.json({
    authenticated: !!user,
    user: user || null
  });
});

// Add like for user
app.post('/api/like/:videoId', (req, res) => {
  const npub = req.headers['x-npub'];
  const videoId = req.params.videoId;
  
  if (!npub) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  
  try {
    // Check if already liked
    const existing = db.prepare('SELECT id FROM user_likes WHERE npub = ? AND video_id = ?').get(npub, videoId);
    
    if (existing) {
      // Remove like (toggle off)
      db.prepare('DELETE FROM user_likes WHERE npub = ? AND video_id = ?').run(npub, videoId);
      res.json({ liked: false });
    } else {
      // Add like
      db.prepare('INSERT INTO user_likes (npub, video_id) VALUES (?, ?)').run(npub, videoId);
      // Also increment global upvote count
      db.prepare('UPDATE videos SET upvotes = upvotes + 1, rating = upvotes - downvotes WHERE id = ?').run(videoId);
      res.json({ liked: true });
    }
  } catch (error) {
    console.error('Like error:', error);
    res.status(500).json({ error: 'Failed to toggle like' });
  }
});

// Get user's liked videos
app.get('/api/user/likes', (req, res) => {
  const npub = req.headers['x-npub'];
  
  if (!npub) {
    return res.json({ likes: [] });
  }
  
  const likes = db.prepare(`
    SELECT v.*, ul.liked_at
    FROM user_likes ul
    JOIN videos v ON ul.video_id = v.id
    WHERE ul.npub = ?
    ORDER BY ul.liked_at DESC
  `).all(npub);
  
  res.json({ likes: likes.map(formatVideo) });
});

// Add bookmark for user
app.post('/api/bookmark/:videoId', (req, res) => {
  const npub = req.headers['x-npub'];
  const videoId = req.params.videoId;
  
  if (!npub) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  
  try {
    const existing = db.prepare('SELECT id FROM user_bookmarks WHERE npub = ? AND video_id = ?').get(npub, videoId);
    
    if (existing) {
      db.prepare('DELETE FROM user_bookmarks WHERE npub = ? AND video_id = ?').run(npub, videoId);
      res.json({ bookmarked: false });
    } else {
      db.prepare('INSERT INTO user_bookmarks (npub, video_id) VALUES (?, ?)').run(npub, videoId);
      res.json({ bookmarked: true });
    }
  } catch (error) {
    console.error('Bookmark error:', error);
    res.status(500).json({ error: 'Failed to toggle bookmark' });
  }
});

// Get user's bookmarks
app.get('/api/user/bookmarks', (req, res) => {
  const npub = req.headers['x-npub'];
  
  if (!npub) {
    return res.json({ bookmarks: [] });
  }
  
  const bookmarks = db.prepare(`
    SELECT v.*, ub.bookmarked_at
    FROM user_bookmarks ub
    JOIN videos v ON ub.video_id = v.id
    WHERE ub.npub = ?
    ORDER BY ub.bookmarked_at DESC
  `).all(npub);
  
  res.json({ bookmarks: bookmarks.map(formatVideo) });
});

// Manual video addition API
app.post('/api/videos/add', async (req, res) => {
  const { youtube_url, age_group, style } = req.body;
  
  if (!youtube_url) {
    return res.status(400).json({ success: false, error: 'YouTube URL required' });
  }
  
  try {
    const { addVideo } = require('./add-video');
    const result = await addVideo(youtube_url, { age_group, style });
    
    if (result.success) {
      const video = db.prepare('SELECT * FROM videos WHERE id = ?').get(result.videoId);
      res.json({ success: true, video: formatVideo(video) });
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('Video add error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

function formatVideo(v) {
  const mins = v.duration ? Math.floor(v.duration / 60) : null;
  const secs = v.duration ? String(v.duration % 60).padStart(2, '0') : null;
  return { ...v, duration_formatted: mins !== null ? `${mins}:${secs}` : null, embed_url: `https://www.youtube.com/embed/${v.youtube_id}` };
}

app.listen(PORT, () => {
  console.log(`🤼 Wrestling Coach running at http://localhost:${PORT}`);
  
  // Seed lesson plans if empty
  const lessonCount = db.prepare('SELECT COUNT(*) as count FROM lesson_plans').get().count;
  if (lessonCount === 0) {
    try {
      const seedPath = path.join(__dirname, 'seed_lesson_plans.json');
      if (require('fs').existsSync(seedPath)) {
        const lessonPlans = JSON.parse(require('fs').readFileSync(seedPath, 'utf8'));
        for (const plan of lessonPlans) {
          const result = db.prepare(`
            INSERT INTO lesson_plans (name, description, difficulty, category, age_group, notes, is_template)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `).run(plan.name, plan.description, plan.difficulty, plan.category, plan.age_group || 'elementary (6-10)', plan.notes, plan.is_template);
          
          const planId = result.lastInsertRowid;
          for (const [idx, video] of plan.videos.entries()) {
            db.prepare(`
              INSERT INTO plan_videos (lesson_plan_id, video_id, order_num, notes)
              VALUES (?, ?, ?, ?)
            `).run(planId, video.video_id, idx, video.notes);
          }
        }
        console.log(`📚 Seeded ${lessonPlans.length} lesson plans`);
      }
    } catch (e) {
      console.log('Note: Could not seed lesson plans:', e.message);
    }
  }
});

module.exports = { db };
