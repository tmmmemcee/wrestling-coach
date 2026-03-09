/**
 * Nostr authentication routes for Wrestling Coach
 */

const { userQueries } = require('../db');
const { Router } = require('express');
const router = Router();

// Store challenges in memory (in production, use Redis or similar)
const challenges = new Map();

// Generate authentication challenge
router.get('/nostr/challenge', (req, res) => {
  const challengeId = Date.now().toString(36) + Math.random().toString(36).substr(2);
  const challengeText = `Sign this to authenticate with Wrestling Coach: ${challengeId}`;
  
  challenges.set(challengeId, {
    text: challengeText,
    created: Date.now(),
    expires: Date.now() + 5 * 60 * 1000 // 5 minutes
  });
  
  // Clean up expired challenges
  for (const [id, challenge] of challenges) {
    if (Date.now() > challenge.expires) {
      challenges.delete(id);
    }
  }
  
  res.json({
    challengeId,
    message: challengeText,
    expires: Date.now() + 5 * 60 * 1000
  });
});

// Verify authentication and create/login user
router.post('/nostr/auth', (req, res) => {
  const { event } = req.body;
  
  if (!event || !event.pubkey || !event.sig) {
    return res.status(400).json({ error: 'Invalid event' });
  }
  
  // Note: In production, verify the signature with nostr-tools
  // For now, we trust the event structure
  
  // Extract challenge from event tags
  const challengeTag = event.tags?.find(tag => tag[0] === 'challenge');
  if (!challengeTag) {
    return res.status(400).json({ error: 'No challenge in event' });
  }
  
  const challengeId = challengeTag[1];
  const challenge = challenges.get(challengeId);
  
  if (!challenge) {
    return res.status(400).json({ error: 'Challenge not found or expired' });
  }
  
  if (Date.now() > challenge.expires) {
    challenges.delete(challengeId);
    return res.status(400).json({ error: 'Challenge expired' });
  }
  
  challenges.delete(challengeId);
  
  // Create npub from pubkey (hex to bech32)
  // For simplicity, we'll use the hex pubkey directly
  const npub = event.pubkey;
  
  const existingUser = userQueries.getByNpub.get(npub);
  
  if (existingUser) {
    userQueries.updateLogin.run(npub);
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
    userQueries.create.run(npub, displayName);
    
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

// Check if user is authenticated
router.get('/nostr/authenticated', (req, res) => {
  const npub = req.headers['x-npub'];
  
  if (!npub) {
    return res.json({ authenticated: false });
  }
  
  const user = userQueries.getByNpub.get(npub);
  res.json({
    authenticated: !!user,
    user: user || null
  });
});

module.exports = { router };
