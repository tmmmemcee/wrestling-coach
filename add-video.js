// Manual Video Addition API
// Add videos manually from YouTube links

const Database = require('better-sqlite3');
const path = require('path');
const { fetchThumbnail } = require('./thumbs');

const db = new Database(path.join(__dirname, 'wrestling.db'));

function isValidYouTubeURL(url) {
  const patterns = [
    /youtube\.com\/watch\?v=([a-zA-Z0-9_-]+)/,
    /youtu\.be\/([a-zA-Z0-9_-]+)/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]+)/
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  
  return null;
}

function categorizeVideo(title, description) {
  const text = (title + ' ' + (description || '')).toLowerCase();
  
  let content_type = 'technique';
  if (text.includes('drill') || text.includes('workout') || text.includes('exercise')) {
    content_type = 'drill';
  } else if (text.includes('match') || text.includes('competition')) {
    content_type = 'match';
  }
  
  let category = 'fundamentals';
  if (text.includes('tilt') || text.includes('turn')) category = 'tilts';
  else if (text.includes('takedown') || text.includes('single leg') || text.includes('double leg')) category = 'takedowns';
  else if (text.includes('escape') || text.includes('stand up') || text.includes('switch')) category = 'escapes';
  else if (text.includes('reversal') || text.includes('whip')) category = 'reversals';
  else if (text.includes('sprawl') || text.includes('whizzer') || text.includes('defense')) category = 'defense';
  else if (text.includes('pin') || text.includes('fall') || text.includes('control')) category = 'pins';
  
  let position = 'neutral';
  if (text.includes('top') || text.includes('riding')) position = 'top';
  if (text.includes('bottom') || text.includes('escape')) position = 'bottom';
  
  return { content_type, category, position };
}

async function addVideo(youtubeUrl, options = {}) {
  const youtubeId = isValidYouTubeURL(youtubeUrl);
  if (!youtubeId) {
    return { success: false, error: 'Invalid YouTube URL' };
  }
  
  // Fetch video metadata via yt-dlp
  let metadata;
  try {
    const { execSync } = require('child_process');
    const cmd = `yt-dlp --dump-json --no-playlist "${youtubeUrl}" 2>/dev/null`;
    const output = execSync(cmd, { timeout: 10000 }).toString().trim();
    metadata = JSON.parse(output);
  } catch (e) {
    console.error('Failed to fetch video metadata:', e.message);
    return { success: false, error: 'Could not fetch video metadata' };
  }
  
  const { id: vid, title, description, duration } = metadata;
  if (vid !== youtubeId) {
    return { success: false, error: 'Video ID mismatch' };
  }
  
  // Categorize
  const cat = categorizeVideo(title, description);
  
  // Extract tags/user if available
  const tags = metadata.channel ? `${metadata.channel}, manual` : 'manual';
  
  // Check if exists
  const existing = db.prepare('SELECT id FROM videos WHERE youtube_id = ?').get(vid);
  if (existing) {
    return { success: false, error: 'Video already exists' };
  }
  
  // Fetch thumbnail
  const thumbnailUrl = await fetchThumbnail(vid);
  
  // Insert
  const result = db.prepare(`
    INSERT INTO videos 
      (youtube_id, title, description, duration, 
       category, content_type, position, age_group, style, source_type, tags, thumbnail_url)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    vid,
    title,
    (description || '').slice(0, 2000),
    duration,
    cat.category,
    cat.content_type,
    cat.position,
    options.age_group || 'elementary (6-10)',
    options.style || 'folkstyle',
    'youtube',
    tags,
    thumbnailUrl
  );
  
  return {
    success: true,
    videoId: result.lastInsertRowid,
    youtubeId: vid,
    title,
    thumbnailUrl
  };
}

// Export for use in server
module.exports = { addVideo };

// If run directly
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.log('Usage: node add-video.js <youtube-url>');
    process.exit(1);
  }
  
  const url = args[0];
  
  console.log(`🎯 Adding video from: ${url}\n`);
  
  addVideo(url).then(result => {
    if (result.success) {
      console.log(`✅ Video added successfully!`);
      console.log(`   ID: ${result.videoId}`);
      console.log(`   YouTube: ${result.youtubeId}`);
      console.log(`   Title: ${result.title}`);
      console.log(`   Thumbnail: ${result.thumbnailUrl}`);
    } else {
      console.log(`❌ Error: ${result.error}`);
    }
  }).catch(console.error);
}
