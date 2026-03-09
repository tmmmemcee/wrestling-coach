/**
 * Nostr authentication routes for Wrestling Coach
 */

const { queries } = require('../db');
const { Router } = require('express');
const router = Router();

// Store challenges in memory
const challenges = new Map();

// Generate authentication challenge
router.get('/nostr/challenge', (req, res) => {
  const challengeId = Date.now().toString(36) + Math.random().toString(36).substr(2);
  const challengeText = `Sign this to authenticate with Wrestling Coach: ${challengeId}`;
  
  challenges.set(challengeId, {
    text: challengeText,
    created: Date.now(),
    expires: Date.now() + 5 * 60 * 1000
  });
  
  // Clean expired
  for (const [id, challenge] of challenges) {
    if (Date.now() > challenge.expires) challenges.delete(id);
  }
  
  res.json({
    challengeId,
    message: challengeText,
    expires: Date.now() + 5 * 60 * 1000
  });
});

// Verify authentication
router.post('/nostr/auth', async (req, res) => {
  const { event } = req.body;
  
  if (!event || !event.pubkey || !event.sig) {
    return res.status(400).json({ error: 'Invalid event' });
  }
  
  const challengeTag = event.tags?.find(tag => tag[0] === 'challenge');
  if (!challengeTag) {
    return res.status(400).json({ error: 'No challenge in event' });
  }
  
  const challengeId = challengeTag[1];
  const challenge = challenges.get(challengeId);
  
  if (!challenge || Date.now() > challenge.expires) {
    challenges.delete(challengeId);
    return res.status(400).json({ error: 'Challenge not found or expired' });
  }
  
  challenges.delete(challengeId);
  
  const npub = event.pubkey;
  
  try {
    const existingUser = await queries.getUserByNpub(npub);
    
    if (existingUser) {
      await queries.updateLogin(npub);
      res.json({
        success: true,
        user: {
          npub,
          display_name: existingUser.display_name,
          logged_in_at: existingUser.last_login
        }
      });
    } else {
      const displayName = `User ${npub.slice(0, 8)}...`;
      await queries.createUser(npub, displayName);
      
      res.json({
        success: true,
        user: {
          npub,
          display_name: displayName,
          created_at: Date.now()
        }
      });
    }
  } catch (e) {
    console.error('Auth error:', e);
    res.status(500).json({ error: 'Authentication failed' });
  }
});

// Check authentication
router.get('/nostr/authenticated', async (req, res) => {
  const npub = req.headers['x-npub'];
  
  if (!npub) {
    return res.json({ authenticated: false });
  }
  
  try {
    const user = await queries.getUserByNpub(npub);
    res.json({
      authenticated: !!user,
      user: user || null
    });
  } catch (e) {
    res.json({ authenticated: false });
  }
});

module.exports = { router };
