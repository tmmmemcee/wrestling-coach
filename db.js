/**
 * Database module for Wrestling Coach
 * Supports both SQLite (local) and PostgreSQL (Render)
 */

const path = require('path');

// Detect which database to use
const DATABASE_URL = process.env.DATABASE_URL;
const usePostgres = !!DATABASE_URL;

let db;
let queryFn;

if (usePostgres) {
  // PostgreSQL (Render)
  const { Pool } = require('pg');
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false } // Required for Render
  });
  
  queryFn = async (sql, params = []) => {
    const result = await pool.query(sql, params);
    return result.rows;
  };
  
  // Sync query for simple cases (wraps async)
  db = {
    exec: async (sql) => { await pool.query(sql); },
    prepare: (sql) => ({
      all: async (...params) => (await pool.query(sql, params)).rows,
      get: async (...params) => (await pool.query(sql, params)).rows[0],
      run: async (...params) => {
        const result = await pool.query(sql, params);
        return { lastInsertRowid: result.rows[0]?.id };
      }
    })
  };
  
  console.log('🐘 Using PostgreSQL');
} else {
  // SQLite (local)
  const Database = require('better-sqlite3');
  db = new Database(path.join(__dirname, 'wrestling.db'));
  
  queryFn = (sql, params = []) => {
    return db.prepare(sql).all(...params);
  };
  
  console.log('📦 Using SQLite');
}

// Schema initialization
async function initSchema() {
  const schema = `
    CREATE TABLE IF NOT EXISTS videos (
      id SERIAL PRIMARY KEY,
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
      indexed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS lesson_plans (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      difficulty TEXT DEFAULT 'beginner',
      category TEXT,
      age_group TEXT DEFAULT 'elementary (6-10)',
      style TEXT DEFAULT 'folkstyle',
      notes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      is_template INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS plan_videos (
      id SERIAL PRIMARY KEY,
      lesson_plan_id INTEGER NOT NULL,
      video_id INTEGER NOT NULL,
      order_num INTEGER NOT NULL,
      notes TEXT,
      FOREIGN KEY (lesson_plan_id) REFERENCES lesson_plans(id) ON DELETE CASCADE,
      FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS users (
      npub TEXT PRIMARY KEY,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      last_login TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      display_name TEXT
    );

    CREATE TABLE IF NOT EXISTS user_likes (
      id SERIAL PRIMARY KEY,
      npub TEXT NOT NULL,
      video_id INTEGER NOT NULL,
      liked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (npub) REFERENCES users(npub) ON DELETE CASCADE,
      FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE,
      UNIQUE(npub, video_id)
    );

    CREATE TABLE IF NOT EXISTS user_bookmarks (
      id SERIAL PRIMARY KEY,
      npub TEXT NOT NULL,
      video_id INTEGER NOT NULL,
      bookmarked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (npub) REFERENCES users(npub) ON DELETE CASCADE,
      FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE,
      UNIQUE(npub, video_id)
    );
  `;

  if (usePostgres) {
    // Run each statement separately for Postgres
    const statements = schema.split(';').filter(s => s.trim());
    for (const stmt of statements) {
      try {
        await db.exec(stmt);
      } catch (e) {
        // Ignore "already exists" errors
        if (!e.message.includes('already exists')) {
          console.error('Schema error:', e.message);
        }
      }
    }
  } else {
    // SQLite
    db.exec(schema);
  }
}

// Query helpers
const queries = {
  // Videos
  searchVideos: async (conditions, params, limit) => {
    const sql = `SELECT * FROM videos WHERE ${conditions.join(' AND ')} ORDER BY rating DESC, upvotes DESC, indexed_at DESC LIMIT ${limit}`;
    if (usePostgres) {
      return (await db.prepare(sql).all(...params)) || [];
    }
    return db.prepare(sql).all(...params);
  },
  
  getVideoById: async (id) => {
    const sql = 'SELECT * FROM videos WHERE id = $1';
    if (usePostgres) {
      return (await db.prepare(sql).get(id));
    }
    return db.prepare('SELECT * FROM videos WHERE id = ?').get(id);
  },
  
  voteVideo: async (videoId, increment) => {
    if (usePostgres) {
      await db.prepare('UPDATE videos SET upvotes = upvotes + $1, rating = upvotes - downvotes WHERE id = $2').run(increment > 0 ? 1 : 0, videoId);
    } else {
      db.prepare('UPDATE videos SET upvotes = upvotes + ?, rating = upvotes - downvotes WHERE id = ?').run(increment > 0 ? 1 : 0, videoId);
    }
  },
  
  downvoteVideo: async (videoId) => {
    if (usePostgres) {
      await db.prepare('UPDATE videos SET downvotes = downvotes + 1, rating = upvotes - downvotes WHERE id = $1').run(videoId);
    } else {
      db.prepare('UPDATE videos SET downvotes = downvotes + 1, rating = upvotes - downvotes WHERE id = ?').run(videoId);
    }
  },
  
  getCategories: async () => {
    const sql = "SELECT DISTINCT category FROM videos WHERE category IS NOT NULL ORDER BY category";
    if (usePostgres) {
      return (await db.prepare(sql).all()) || [];
    }
    return db.prepare(sql).all();
  },
  
  getContentTypes: async () => {
    const sql = "SELECT DISTINCT content_type FROM videos WHERE content_type IS NOT NULL ORDER BY content_type";
    if (usePostgres) {
      return (await db.prepare(sql).all()) || [];
    }
    return db.prepare(sql).all();
  },
  
  getCoaches: async () => {
    const sql = `SELECT coach_name, COUNT(*) as count FROM videos WHERE coach_name IS NOT NULL AND coach_name != '' GROUP BY coach_name ORDER BY count DESC`;
    if (usePostgres) {
      return (await db.prepare(sql).all()) || [];
    }
    return db.prepare(sql).all();
  },
  
  getStats: async () => {
    if (usePostgres) {
      const count = (await db.prepare('SELECT COUNT(*) as count FROM videos').get()).count;
      return { count };
    }
    return db.prepare('SELECT COUNT(*) as count FROM videos').get();
  },
  
  // Lesson plans
  getAllPlans: async (isTemplate = false) => {
    const sql = `SELECT * FROM lesson_plans WHERE is_template = $1 ORDER BY created_at DESC`;
    if (usePostgres) {
      return (await db.prepare(sql).all(isTemplate ? 1 : 0)) || [];
    }
    return db.prepare(`SELECT * FROM lesson_plans WHERE is_template = ? ORDER BY created_at DESC`).all(isTemplate ? 1 : 0);
  },
  
  getPlanById: async (id) => {
    if (usePostgres) {
      return (await db.prepare('SELECT * FROM lesson_plans WHERE id = $1').get(id));
    }
    return db.prepare('SELECT * FROM lesson_plans WHERE id = ?').get(id);
  },
  
  getPlanVideos: async (planId) => {
    const sql = `
      SELECT p.*, v.title, v.youtube_id, v.thumbnail_url, v.duration
      FROM plan_videos p
      JOIN videos v ON p.video_id = v.id
      WHERE p.lesson_plan_id = $1
      ORDER BY p.order_num
    `;
    if (usePostgres) {
      return (await db.prepare(sql).all(planId)) || [];
    }
    return db.prepare(sql.replace(/\$1/g, '?')).all(planId);
  },
  
  createPlan: async (data) => {
    const sql = `INSERT INTO lesson_plans (name, description, difficulty, category, age_group, notes, is_template, style) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`;
    if (usePostgres) {
      const result = await db.prepare(sql).run(
        data.name, data.description, data.difficulty, data.category,
        data.age_group, data.notes, data.is_template ? 1 : 0, data.style
      );
      return { lastInsertRowid: result.lastInsertRowid };
    }
    return db.prepare(`INSERT INTO lesson_plans (name, description, difficulty, category, age_group, notes, is_template, style) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
      data.name, data.description, data.difficulty, data.category,
      data.age_group, data.notes, data.is_template ? 1 : 0, data.style
    );
  },
  
  updatePlan: async (id, data) => {
    const sql = `UPDATE lesson_plans SET name = $1, description = $2, difficulty = $3, category = $4, age_group = $5, notes = $6, is_template = $7 WHERE id = $8`;
    if (usePostgres) {
      await db.prepare(sql).run(data.name, data.description, data.difficulty, data.category, data.age_group, data.notes, data.is_template ? 1 : 0, id);
    } else {
      db.prepare(sql.replace(/\$\d/g, '?')).run(data.name, data.description, data.difficulty, data.category, data.age_group, data.notes, data.is_template ? 1 : 0, id);
    }
  },
  
  deletePlan: async (id) => {
    if (usePostgres) {
      await db.prepare('DELETE FROM lesson_plans WHERE id = $1').run(id);
    } else {
      db.prepare('DELETE FROM lesson_plans WHERE id = ?').run(id);
    }
  },
  
  addVideoToPlan: async (planId, videoId, orderNum, notes) => {
    if (usePostgres) {
      await db.prepare(`INSERT INTO plan_videos (lesson_plan_id, video_id, order_num, notes) VALUES ($1, $2, $3, $4)`).run(planId, videoId, orderNum, notes);
    } else {
      db.prepare(`INSERT INTO plan_videos (lesson_plan_id, video_id, order_num, notes) VALUES (?, ?, ?, ?)`).run(planId, videoId, orderNum, notes);
    }
  },
  
  getMaxOrder: async (planId) => {
    if (usePostgres) {
      return (await db.prepare('SELECT MAX(order_num) as max FROM plan_videos WHERE lesson_plan_id = $1').get(planId));
    }
    return db.prepare('SELECT MAX(order_num) as max FROM plan_videos WHERE lesson_plan_id = ?').get(planId);
  },
  
  countPlans: async () => {
    if (usePostgres) {
      return (await db.prepare('SELECT COUNT(*) as count FROM lesson_plans').get());
    }
    return db.prepare('SELECT COUNT(*) as count FROM lesson_plans').get();
  },
  
  // Users
  getUserByNpub: async (npub) => {
    if (usePostgres) {
      return (await db.prepare('SELECT * FROM users WHERE npub = $1').get(npub));
    }
    return db.prepare('SELECT * FROM users WHERE npub = ?').get(npub);
  },
  
  createUser: async (npub, displayName) => {
    if (usePostgres) {
      await db.prepare(`INSERT INTO users (npub, display_name) VALUES ($1, $2)`).run(npub, displayName);
    } else {
      db.prepare(`INSERT INTO users (npub, display_name) VALUES (?, ?)`).run(npub, displayName);
    }
  },
  
  updateLogin: async (npub) => {
    if (usePostgres) {
      await db.prepare(`UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE npub = $1`).run(npub);
    } else {
      db.prepare(`UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE npub = ?`).run(npub);
    }
  },
  
  // Likes
  getLike: async (npub, videoId) => {
    if (usePostgres) {
      return (await db.prepare('SELECT id FROM user_likes WHERE npub = $1 AND video_id = $2').get(npub, videoId));
    }
    return db.prepare('SELECT id FROM user_likes WHERE npub = ? AND video_id = ?').get(npub, videoId);
  },
  
  addLike: async (npub, videoId) => {
    if (usePostgres) {
      await db.prepare(`INSERT INTO user_likes (npub, video_id) VALUES ($1, $2)`).run(npub, videoId);
    } else {
      db.prepare(`INSERT INTO user_likes (npub, video_id) VALUES (?, ?)`).run(npub, videoId);
    }
  },
  
  removeLike: async (npub, videoId) => {
    if (usePostgres) {
      await db.prepare(`DELETE FROM user_likes WHERE npub = $1 AND video_id = $2`).run(npub, videoId);
    } else {
      db.prepare(`DELETE FROM user_likes WHERE npub = ? AND video_id = ?`).run(npub, videoId);
    }
  },
  
  getLikes: async (npub) => {
    const sql = `SELECT v.*, ul.liked_at FROM user_likes ul JOIN videos v ON ul.video_id = v.id WHERE ul.npub = $1 ORDER BY ul.liked_at DESC`;
    if (usePostgres) {
      return (await db.prepare(sql).all(npub)) || [];
    }
    return db.prepare(sql.replace('$1', '?')).all(npub);
  },
  
  // Bookmarks
  getBookmark: async (npub, videoId) => {
    if (usePostgres) {
      return (await db.prepare('SELECT id FROM user_bookmarks WHERE npub = $1 AND video_id = $2').get(npub, videoId));
    }
    return db.prepare('SELECT id FROM user_bookmarks WHERE npub = ? AND video_id = ?').get(npub, videoId);
  },
  
  addBookmark: async (npub, videoId) => {
    if (usePostgres) {
      await db.prepare(`INSERT INTO user_bookmarks (npub, video_id) VALUES ($1, $2)`).run(npub, videoId);
    } else {
      db.prepare(`INSERT INTO user_bookmarks (npub, video_id) VALUES (?, ?)`).run(npub, videoId);
    }
  },
  
  removeBookmark: async (npub, videoId) => {
    if (usePostgres) {
      await db.prepare(`DELETE FROM user_bookmarks WHERE npub = $1 AND video_id = $2`).run(npub, videoId);
    } else {
      db.prepare(`DELETE FROM user_bookmarks WHERE npub = ? AND video_id = ?`).run(npub, videoId);
    }
  },
  
  getBookmarks: async (npub) => {
    const sql = `SELECT v.*, ub.bookmarked_at FROM user_bookmarks ub JOIN videos v ON ub.video_id = v.id WHERE ub.npub = $1 ORDER BY ub.bookmarked_at DESC`;
    if (usePostgres) {
      return (await db.prepare(sql).all(npub)) || [];
    }
    return db.prepare(sql.replace('$1', '?')).all(npub);
  }
};

module.exports = { db, queries, usePostgres, initSchema };
