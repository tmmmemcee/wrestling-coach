/**
 * Video routes for Wrestling Coach
 */

const { videoQueries, db } = require('../db');
const { Router } = require('express');
const router = Router();

// Helper to format video data
function formatVideo(v) {
  const mins = v.duration ? Math.floor(v.duration / 60) : null;
  const secs = v.duration ? String(v.duration % 60).padStart(2, '0') : null;
  return {
    ...v,
    duration_formatted: mins !== null ? `${mins}:${secs}` : null,
    embed_url: `https://www.youtube.com/embed/${v.youtube_id}`
  };
}

// Search videos
router.get('/search', (req, res) => {
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
  if (content_type) { conditions.push(`content_type = ?`); params.push(content_type); }
  if (coach) { conditions.push(`coach_name LIKE ?`); params.push(`%${coach}%`); }
  if (style && style !== 'all') {
    conditions.push(`styles LIKE ?`);
    params.push(`%${style}%`);
  }

  // Exclude pro wrestling by default
  conditions.push(`is_pro_wrestling = 0`);

  const videos = videoQueries.searchFiltered(conditions, params, parseInt(limit));
  res.json(videos.map(formatVideo));
});

// Get categories
router.get('/categories', (req, res) => {
  const cats = videoQueries.getCategories.all();
  res.json(cats.map(c => c.category));
});

// Get content types
router.get('/content_types', (req, res) => {
  const types = videoQueries.getContentTypes.all();
  res.json(types.map(t => t.content_type));
});

// Get documentaries
router.get('/documentaries', (req, res) => {
  const documentaries = db.prepare(`
    SELECT * FROM videos 
    WHERE content_type = 'documentary' 
    AND is_pro_wrestling = 0
    ORDER BY rating DESC, upvotes DESC
  `).all();
  res.json(documentaries.map(formatVideo));
});

// Get coaches
router.get('/coaches', (req, res) => {
  const coaches = videoQueries.getCoaches.all();
  res.json(coaches.map(c => ({ name: c.coach_name, count: c.count })));
});

// Vote on video
router.post('/vote/:id', (req, res) => {
  const { vote } = req.body;
  const videoId = req.params.id;
  
  const increment = vote === 'up' ? 1 : -1;
  videoQueries.vote.run(increment > 0 ? 1 : 0, videoId);
  
  if (vote === 'down') {
    db.prepare('UPDATE videos SET downvotes = downvotes + 1, rating = upvotes - downvotes WHERE id = ?').run(videoId);
  }
  
  const video = videoQueries.getById.get(videoId);
  res.json(formatVideo(video));
});

// Get stats
router.get('/stats', (req, res) => {
  const total = videoQueries.getStats.get().count;
  const byCat = db.prepare('SELECT category, COUNT(*) as count FROM videos WHERE category IS NOT NULL GROUP BY category').all();
  const byContentType = db.prepare('SELECT content_type, COUNT(*) as count FROM videos WHERE content_type IS NOT NULL GROUP BY content_type').all();
  const topRated = db.prepare('SELECT * FROM videos ORDER BY rating DESC LIMIT 5').all();
  const lessonPlanCount = db.prepare('SELECT COUNT(*) as count FROM lesson_plans').get().count;
  const topCoaches = videoQueries.getCoaches.all().slice(0, 10);

  res.json({
    total,
    byCat,
    byContentType,
    topRated: topRated.map(formatVideo),
    topCoaches: topCoaches.map(c => ({ name: c.coach_name, count: c.count })),
    lessonPlanCount
  });
});

module.exports = { router, formatVideo };
