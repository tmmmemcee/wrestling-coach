/**
 * Database module for Wrestling Coach
 * Handles connection, schema, and queries
 */

const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'wrestling.db'));

// Initialize schema
function initSchema() {
  // Videos table
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
    styles TEXT,
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

  // Lesson plans table
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

  // Plan videos (many-to-many relationship)
  db.exec(`CREATE TABLE IF NOT EXISTS plan_videos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lesson_plan_id INTEGER NOT NULL,
    video_id INTEGER NOT NULL,
    order_num INTEGER NOT NULL,
    notes TEXT,
    FOREIGN KEY (lesson_plan_id) REFERENCES lesson_plans(id) ON DELETE CASCADE,
    FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
  )`);

  // Users table (Nostr auth)
  db.exec(`CREATE TABLE IF NOT EXISTS users (
    npub TEXT PRIMARY KEY,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login DATETIME DEFAULT CURRENT_TIMESTAMP,
    display_name TEXT
  )`);

  // User likes
  db.exec(`CREATE TABLE IF NOT EXISTS user_likes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    npub TEXT NOT NULL,
    video_id INTEGER NOT NULL,
    liked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (npub) REFERENCES users(npub) ON DELETE CASCADE,
    FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE,
    UNIQUE(npub, video_id)
  )`);

  // User bookmarks
  db.exec(`CREATE TABLE IF NOT EXISTS user_bookmarks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    npub TEXT NOT NULL,
    video_id INTEGER NOT NULL,
    bookmarked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (npub) REFERENCES users(npub) ON DELETE CASCADE,
    FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE,
    UNIQUE(npub, video_id)
  )`);

  // Add missing columns (safe migration)
  const addColumn = (table, col, sqlType) => {
    try { db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${sqlType}`); } catch (e) { /* column exists */ }
  };
  
  addColumn('videos', 'coach_name', 'TEXT');
  addColumn('videos', 'content_type', "TEXT DEFAULT 'technique'");
}

// Video queries
const videoQueries = {
  search: db.prepare(`
    SELECT * FROM videos 
    WHERE 1=1
    AND is_pro_wrestling = 0
    ORDER BY rating DESC, upvotes DESC, indexed_at DESC
    LIMIT ?
  `),
  
  searchFiltered: (conditions, params, limit) => {
    const sql = `SELECT * FROM videos WHERE ${conditions.join(' AND ')} ORDER BY rating DESC, upvotes DESC, indexed_at DESC LIMIT ${limit}`;
    return db.prepare(sql).all(...params);
  },
  
  getById: db.prepare('SELECT * FROM videos WHERE id = ?'),
  
  vote: db.prepare(`
    UPDATE videos 
    SET upvotes = upvotes + ?, rating = upvotes - downvotes 
    WHERE id = ?
  `),
  
  getCategories: db.prepare('SELECT DISTINCT category FROM videos WHERE category IS NOT NULL ORDER BY category'),
  getContentTypes: db.prepare('SELECT DISTINCT content_type FROM videos WHERE content_type IS NOT NULL ORDER BY content_type'),
  getCoaches: db.prepare(`
    SELECT coach_name, COUNT(*) as count 
    FROM videos 
    WHERE coach_name IS NOT NULL AND coach_name != ''
    GROUP BY coach_name 
    ORDER BY count DESC
  `),
  getStats: db.prepare('SELECT COUNT(*) as count FROM videos')
};

// Lesson plan queries
const planQueries = {
  getAll: db.prepare('SELECT * FROM lesson_plans ORDER BY created_at DESC'),
  getTemplates: db.prepare('SELECT * FROM lesson_plans WHERE is_template = 1 ORDER BY created_at DESC'),
  getById: db.prepare('SELECT * FROM lesson_plans WHERE id = ?'),
  
  getVideos: db.prepare(`
    SELECT p.*, v.title, v.youtube_id, v.thumbnail_url, v.duration
    FROM plan_videos p
    JOIN videos v ON p.video_id = v.id
    WHERE p.lesson_plan_id = ?
    ORDER BY p.order_num
  `),
  
  create: db.prepare(`
    INSERT INTO lesson_plans (name, description, difficulty, category, age_group, notes, is_template, style)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `),
  
  update: db.prepare(`
    UPDATE lesson_plans 
    SET name = ?, description = ?, difficulty = ?, category = ?, age_group = ?, notes = ?, is_template = ?
    WHERE id = ?
  `),
  
  delete: db.prepare('DELETE FROM lesson_plans WHERE id = ?'),
  
  addVideo: db.prepare(`
    INSERT INTO plan_videos (lesson_plan_id, video_id, order_num, notes)
    VALUES (?, ?, ?, ?)
  `),
  
  getMaxOrder: db.prepare('SELECT MAX(order_num) as max FROM plan_videos WHERE lesson_plan_id = ?'),
  
  count: db.prepare('SELECT COUNT(*) as count FROM lesson_plans')
};

// User queries
const userQueries = {
  getByNpub: db.prepare('SELECT * FROM users WHERE npub = ?'),
  create: db.prepare('INSERT INTO users (npub, display_name) VALUES (?, ?)'),
  updateLogin: db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE npub = ?'),
  
  // Likes
  getLike: db.prepare('SELECT id FROM user_likes WHERE npub = ? AND video_id = ?'),
  addLike: db.prepare('INSERT INTO user_likes (npub, video_id) VALUES (?, ?)'),
  removeLike: db.prepare('DELETE FROM user_likes WHERE npub = ? AND video_id = ?'),
  getLikes: db.prepare(`
    SELECT v.*, ul.liked_at
    FROM user_likes ul
    JOIN videos v ON ul.video_id = v.id
    WHERE ul.npub = ?
    ORDER BY ul.liked_at DESC
  `),
  
  // Bookmarks
  getBookmark: db.prepare('SELECT id FROM user_bookmarks WHERE npub = ? AND video_id = ?'),
  addBookmark: db.prepare('INSERT INTO user_bookmarks (npub, video_id) VALUES (?, ?)'),
  removeBookmark: db.prepare('DELETE FROM user_bookmarks WHERE npub = ? AND video_id = ?'),
  getBookmarks: db.prepare(`
    SELECT v.*, ub.bookmarked_at
    FROM user_bookmarks ub
    JOIN videos v ON ub.video_id = v.id
    WHERE ub.npub = ?
    ORDER BY ub.bookmarked_at DESC
  `)
};

// Initialize schema on load
initSchema();

module.exports = { db, videoQueries, planQueries, userQueries };
