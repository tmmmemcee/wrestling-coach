/**
 * Video routes for Wrestling Coach
 */

const { queries, usePostgres } = require('../db');
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
router.get('/search', async (req, res) => {
  const { q = '', move_type = '', position = '', difficulty = '', category = '', content_type = '', coach = '', style = '', limit = '100' } = req.query;
  const npub = req.headers['x-npub'];
  
  let conditions = ['1=1'];
  let params = [];
  let paramIndex = 1;

  const addParam = (value) => {
    if (usePostgres) {
      params.push(value);
      return `$${paramIndex++}`;
    }
    params.push(value);
    return '?';
  };

  if (q) {
    const wild = `%${q}%`;
    const p1 = addParam(wild);
    conditions.push(`(title LIKE ${p1} OR description LIKE ${p1} OR tags LIKE ${p1} OR move_type LIKE ${p1} OR channel LIKE ${p1} OR coach_name LIKE ${p1} OR category LIKE ${p1})`);
    // Need to add wild 7 times
    for (let i = 0; i < 6; i++) addParam(wild);
  }
  if (move_type) conditions.push(`move_type = ${addParam(move_type)}`);
  if (position) conditions.push(`position = ${addParam(position)}`);
  if (difficulty) conditions.push(`difficulty = ${addParam(difficulty)}`);
  if (category) conditions.push(`category = ${addParam(category)}`);
  if (content_type) conditions.push(`content_type = ${addParam(content_type)}`);
  if (coach) conditions.push(`coach_name LIKE ${addParam(`%${coach}%`)}`);
  if (style && style !== 'all') conditions.push(`styles LIKE ${addParam(`%${style}%`)}`);

  // Exclude pro wrestling
  conditions.push(`is_pro_wrestling = 0`);

  try {
    const videos = await queries.searchVideos(conditions, params, parseInt(limit));
    
    // If user is logged in, sort liked videos to top
    if (npub) {
      const likes = await queries.getLikes(npub);
      const likedIds = new Set(likes.map(l => l.id));
      
      // Sort: liked videos first, then by rating
      videos.sort((a, b) => {
        const aLiked = likedIds.has(a.id);
        const bLiked = likedIds.has(b.id);
        if (aLiked && !bLiked) return -1;
        if (!aLiked && bLiked) return 1;
        return (b.rating || 0) - (a.rating || 0);
      });
    }
    
    res.json(videos.map(formatVideo));
  } catch (e) {
    console.error('Search error:', e);
    res.status(500).json({ error: 'Search failed' });
  }
});

// Get categories
router.get('/categories', async (req, res) => {
  const cats = await queries.getCategories();
  res.json(cats.map(c => c.category));
});

// Get content types
router.get('/content_types', async (req, res) => {
  const types = await queries.getContentTypes();
  res.json(types.map(t => t.content_type));
});

// Get documentaries
router.get('/documentaries', async (req, res) => {
  const documentaries = await queries.searchVideos(["content_type = 'documentary'", "is_pro_wrestling = 0"], [], 100);
  res.json(documentaries.map(formatVideo));
});

// Get coaches
router.get('/coaches', async (req, res) => {
  const coaches = await queries.getCoaches();
  res.json(coaches.map(c => ({ name: c.coach_name, count: c.count })));
});

// Vote on video
router.post('/vote/:id', async (req, res) => {
  const { vote } = req.body;
  const videoId = parseInt(req.params.id);
  
  if (vote === 'up') {
    await queries.voteVideo(videoId, 1);
  } else {
    await queries.downvoteVideo(videoId);
  }
  
  const video = await queries.getVideoById(videoId);
  res.json(formatVideo(video));
});

// Get stats
router.get('/stats', async (req, res) => {
  const total = (await queries.getStats()).count;
  const byCat = await queries.getCategories();
  const byContentType = await queries.getContentTypes();
  const topRated = await queries.searchVideos(['1=1'], [], 5);
  const lessonPlanCount = (await queries.countPlans()).count;
  const topCoaches = (await queries.getCoaches()).slice(0, 10);

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
