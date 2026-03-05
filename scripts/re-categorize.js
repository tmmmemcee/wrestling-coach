/**
 * Script to re-categorize existing videos using the taxonomy
 * Run this locally to update seed_videos.json, then push
 */

const fs = require('fs');
const path = require('path');

const taxonomy = JSON.parse(fs.readFileSync(path.join(__dirname, 'taxonomy.json'), 'utf8')).folkstyle_taxonomy;

// Build keyword map
function buildKeywordMap() {
  const keywords = {};
  for (const [catName, catData] of Object.entries(taxonomy)) {
    for (const move of catData.moves) {
      for (const kw of move.keywords) {
        keywords[kw.toLowerCase()] = {
          move_type: move.name,
          move_id: move.id,
          category: catName,
          position: move.position,
          difficulty: move.difficulty
        };
      }
    }
  }
  return keywords;
}

const keywordMap = buildKeywordMap();

function categorizeVideo(title, description, channel) {
  const text = `${title} ${description} ${channel}`.toLowerCase();
  
  // Try specific keyword matching first
  for (const [keyword, data] of Object.entries(keywordMap)) {
    if (text.includes(keyword)) {
      return {
        move_type: data.move_type,
        move_id: data.move_id,
        category: data.category,
        position: data.position,
        difficulty: data.difficulty
      };
    }
  }
  
  // Fallback for common terms
  if (text.includes('half nelson') || text.includes('power half') || text.includes('chicken wing')) {
    return { category: 'pins', move_type: 'Pin', position: 'top' };
  }
  if (text.includes('tilt') || text.includes('wrist tilt')) {
    return { category: 'tilts', move_type: 'Tilt', position: 'top' };
  }
  if (text.includes('single leg') || text.includes('double leg')) {
    return { category: 'takedowns', move_type: 'Takedown', position: 'neutral' };
  }
  if (text.includes('stand up') || text.includes('switch') || text.includes('sit out')) {
    return { category: 'escapes', move_type: 'Escape', position: 'bottom' };
  }
  if (text.includes('reversal') || text.includes('whip')) {
    return { category: 'reversals', move_type: 'Reversal', position: 'bottom' };
  }
  if (text.includes('sprawl') || text.includes('whizzer') || text.includes('underhook')) {
    return { category: 'defense', move_type: 'Defense', position: 'neutral' };
  }
  if (text.includes('stance') || text.includes('drill') || text.includes('fundamental')) {
    return { category: 'fundamentals', move_type: 'Fundamental', position: 'neutral' };
  }

  return { category: null, move_type: null, position: null };
}

// Load seed data
const seedPath = path.join(__dirname, 'seed_videos.json');
const videos = JSON.parse(fs.readFileSync(seedPath, 'utf8'));

console.log(`Re-categorizing ${videos.length} videos...\n`);

let updated = 0;
for (const video of videos) {
  const cat = categorizeVideo(video.title, video.description || '', video.channel);
  
  if (cat.category && !video.category) {
    video.category = cat.category;
    video.move_id = cat.move_id || null;
    video.position = cat.position || video.position;
    video.move_type = cat.move_type || video.move_type;
    updated++;
  }
}

// Save updated seed data
fs.writeFileSync(seedPath, JSON.stringify(videos, null, 2));
console.log(`✅ Updated: ${updated} videos with categories\n`);
console.log('Run: git add seed_videos.json && git commit -m "Re-categorize all videos" && git push');
