#!/usr/bin/env node
// Script to add Nostr auth tables to wrestling.db

const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'wrestling.db'));

// Add users table for Nostr authentication
db.exec(`CREATE TABLE IF NOT EXISTS users (
  npub TEXT PRIMARY KEY,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_login DATETIME DEFAULT CURRENT_TIMESTAMP,
  display_name TEXT
)`);

console.log('✓ Created users table for Nostr auth');

// Add user_likes table to track who liked what
db.exec(`CREATE TABLE IF NOT EXISTS user_likes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  npub TEXT NOT NULL,
  video_id INTEGER NOT NULL,
  liked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (npub) REFERENCES users(npub) ON DELETE CASCADE,
  FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE,
  UNIQUE(npub, video_id)
)`);

console.log('✓ Created user_likes table for persistent likes');

// Add user_bookmarks table for saving favorites/documentsaries
db.exec(`CREATE TABLE IF NOT EXISTS user_bookmarks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  npub TEXT NOT NULL,
  video_id INTEGER NOT NULL,
  bookmarked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (npub) REFERENCES users(npub) ON DELETE CASCADE,
  FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE,
  UNIQUE(npub, video_id)
)`);

console.log('✓ Created user_bookmarks table for favorites');

// Add user_lesson_plans for saved plans
db.exec(`CREATE TABLE IF NOT EXISTS user_lesson_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  npub TEXT NOT NULL,
  plan_id INTEGER NOT NULL,
  name TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (npub) REFERENCES users(npub) ON DELETE CASCADE,
  FOREIGN KEY (plan_id) REFERENCES lesson_plans(id) ON DELETE CASCADE
)`);

console.log('✓ Created user_lesson_plans table for saved plans');

console.log('\n✅ Nostr auth tables added successfully!');

db.close();
