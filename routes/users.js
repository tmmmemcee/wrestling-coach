/**
 * User data routes (likes, bookmarks) for Wrestling Coach
 */

const { userQueries, videoQueries } = require('../db');
const { formatVideo } = require('./videos');
const { Router } = require('express');
const router = Router();

// Toggle like
router.post('/like/:videoId', (req, res) => {
  const npub = req.headers['x-npub'];
  const videoId = req.params.videoId;
  
  if (!npub) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  
  try {
    const existing = userQueries.getLike.get(npub, videoId);
    
    if (existing) {
      userQueries.removeLike.run(npub, videoId);
      res.json({ liked: false });
    } else {
      userQueries.addLike.run(npub, videoId);
      res.json({ liked: true });
    }
  } catch (error) {
    console.error('Like error:', error);
    res.status(500).json({ error: 'Failed to toggle like' });
  }
});

// Get user's likes
router.get('/user/likes', (req, res) => {
  const npub = req.headers['x-npub'];
  
  if (!npub) {
    return res.json({ likes: [] });
  }
  
  const likes = userQueries.getLikes.all(npub);
  res.json({ likes: likes.map(formatVideo) });
});

// Toggle bookmark
router.post('/bookmark/:videoId', (req, res) => {
  const npub = req.headers['x-npub'];
  const videoId = req.params.videoId;
  
  if (!npub) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  
  try {
    const existing = userQueries.getBookmark.get(npub, videoId);
    
    if (existing) {
      userQueries.removeBookmark.run(npub, videoId);
      res.json({ bookmarked: false });
    } else {
      userQueries.addBookmark.run(npub, videoId);
      res.json({ bookmarked: true });
    }
  } catch (error) {
    console.error('Bookmark error:', error);
    res.status(500).json({ error: 'Failed to toggle bookmark' });
  }
});

// Get user's bookmarks
router.get('/user/bookmarks', (req, res) => {
  const npub = req.headers['x-npub'];
  
  if (!npub) {
    return res.json({ bookmarks: [] });
  }
  
  const bookmarks = userQueries.getBookmarks.all(npub);
  res.json({ bookmarks: bookmarks.map(formatVideo) });
});

module.exports = { router };
