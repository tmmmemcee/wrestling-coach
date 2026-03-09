/**
 * User data routes (likes, bookmarks) for Wrestling Coach
 */

const { queries } = require('../db');
const { formatVideo } = require('./videos');
const { Router } = require('express');
const router = Router();

// Toggle like
router.post('/like/:videoId', async (req, res) => {
  const npub = req.headers['x-npub'];
  const videoId = parseInt(req.params.videoId);
  
  if (!npub) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  
  try {
    const existing = await queries.getLike(npub, videoId);
    
    if (existing) {
      await queries.removeLike(npub, videoId);
      res.json({ liked: false });
    } else {
      await queries.addLike(npub, videoId);
      res.json({ liked: true });
    }
  } catch (error) {
    console.error('Like error:', error);
    res.status(500).json({ error: 'Failed to toggle like' });
  }
});

// Get user's likes
router.get('/user/likes', async (req, res) => {
  const npub = req.headers['x-npub'];
  
  if (!npub) {
    return res.json({ likes: [] });
  }
  
  try {
    const likes = await queries.getLikes(npub);
    res.json({ likes: likes.map(formatVideo) });
  } catch (e) {
    res.json({ likes: [] });
  }
});

// Toggle bookmark
router.post('/bookmark/:videoId', async (req, res) => {
  const npub = req.headers['x-npub'];
  const videoId = parseInt(req.params.videoId);
  
  if (!npub) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  
  try {
    const existing = await queries.getBookmark(npub, videoId);
    
    if (existing) {
      await queries.removeBookmark(npub, videoId);
      res.json({ bookmarked: false });
    } else {
      await queries.addBookmark(npub, videoId);
      res.json({ bookmarked: true });
    }
  } catch (error) {
    console.error('Bookmark error:', error);
    res.status(500).json({ error: 'Failed to toggle bookmark' });
  }
});

// Get user's bookmarks
router.get('/user/bookmarks', async (req, res) => {
  const npub = req.headers['x-npub'];
  
  if (!npub) {
    return res.json({ bookmarks: [] });
  }
  
  try {
    const bookmarks = await queries.getBookmarks(npub);
    res.json({ bookmarks: bookmarks.map(formatVideo) });
  } catch (e) {
    res.json({ bookmarks: [] });
  }
});

module.exports = { router };
