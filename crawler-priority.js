/**
 * Priority Crawler - Top Coaching Channels First
 * Searches for videos from the most popular/instructional coaches
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const Database = require('better-sqlite3');
const db = new Database(path.join(__dirname, 'wrestling.db'));

// Priority coaching channels (most instructional/popular first)
const COACH_CHANNELS = [
  { name: 'Jordan Burroughs', queries: [
      'jordan burroughs wrestling technique',
      'jordan burroughs takedowns',
      'jordan burroughs defense',
      'jordan burroughs match breakdown'
  ]},
  { name: 'John Smith', queries: [
      'john smith wrestling fundamentals',
      'john smith coaching philosophy',
      'john smith techniques',
      'john smith match highlights'
  ]},
  { name: 'Cary Kolat', queries: [
      'cary kolat wrestling technique',
      'cary kolat tilts',
      'cary kolat control'
  ]},
  { name: 'Jason Nolf', queries: [
      'jason nolf wrestling technique',
      'jason nolf defense',
      'jason nolf flo wrestling'
  ]},
  { name: 'Kyle Dake', queries: [
      'kyle dake wrestling technique',
      'kyle dake coaching',
      'kyle dake elite training'
  ]},
  { name: 'Garnet Seward', queries: [
      'garnet seward youth wrestling',
      'garnet seward fundamentals',
      'garnet seward coaching'
  ]},
  { name: 'Will Saylor', queries: [
      'will saylore wrestling',
      'will saylore coaching',
      'will saylore high school wrestling'
  ]},
  { name: 'Ben Askren', queries: [
      'ben askren wrestling technique',
      'ben askren grappling',
      'ben askren fundamentals'
  ]},
  { name: 'David Taylor', queries: [
      'david taylor wrestling technique',
      'david taylor defense'
  ]},
  { name: 'Toshihito Endo', queries: [
      'toshihito endo wrestling technique',
      'toshihito endo japanese wrestling'
  ]}
];

// Content type search queries
const CONTENT_QUERIES = {
  drills: [
    'wrestling drills for beginners',
    'partner wrestling drills',
    'solo wrestling drills',
    'wrestling workouts'
  ],
  matches: [
    'wrestling match breakdown',
    'live wrestling match',
    'championship wrestling match',
    'folkstyle wrestling match highlights'
  ]
};

function isRelevant(title, description, duration) {
  const text = `${title} ${description}`.toLowerCase();
  
  const skipKeywords = [
    'vlog', 'interview', 'reaction', 'commentary',
    'freestyle', 'greco', 'sumo', 'jiu jitsu', 'judo',
    'mma', 'ufc', 'arm wrestling', 'training camp'
  ];
  if (skipKeywords.some(kw => text.includes(kw))) return false;
  
  const instructionKeywords = [
    'technique', 'tutorial', 'instruction', 'drill',
    'how to', 'wrestling', 'match', 'breakdown'
  ];
  if (!instructionKeywords.some(kw => text.includes(kw))) return false;
  
  if (duration && (duration < 45 || duration > 1800)) return false;
  
  return true;
}

function categorizeVideo(title, description, channel) {
  const text = (title + ' ' + (description || '')).toLowerCase();
  
  // Determine content type
  let content_type = 'technique';
  if (text.includes('drill') || text.includes('workout') || text.includes('exercise')) {
    content_type = 'drill';
  } else if (text.includes('match') || text.includes('competition') || text.includes('live')) {
    content_type = 'match';
  }
  
  // Determine category
  let category = null;
  if (text.includes('pin') || text.includes('fall') || text.includes('shoulders')) category = 'pins';
  else if (text.includes('tilt') || text.includes('turn')) category = 'tilts';
  else if (text.includes('takedown') || text.includes('single leg') || text.includes('double leg')) category = 'takedowns';
  else if (text.includes('escape') || text.includes('stand up') || text.includes('switch')) category = 'escapes';
  else if (text.includes('reversal') || text.includes('whip')) category = 'reversals';
  else if (text.includes('sprawl') || text.includes('whizzer') || text.includes('defense')) category = 'defense';
  else if (text.includes('stance') || text.includes('drill')) category = 'fundamentals';
  
  // Determine position (default to neutral)
  let position = 'neutral';
  if (text.includes('top') || text.includes('riding') || text.includes('pin')) position = 'top';
  if (text.includes('bottom') || text.includes('escape')) position = 'bottom';
  
  return {
    content_type,
    category,
    position
  };
}

function crawlChannel(channel, coachName, max = 3) {
  console.log(`📺 Crawling: ${coachName}`);
  let added = 0, skipped = 0;
  
  const queries = COACH_CHANNELS.find(c => c.name === coachName)?.queries || [];
  if (!queries) {
    console.log(`   ❓ Unknown coach, skipping`);
    return { added: 0, skipped: 0 };
  }
  
  for (const query of queries) {
    try {
      const cmd = `yt-dlp --flat-playlist --dump-json "ytsearch${max}:${query}" 2>/dev/null`;
      const output = execSync(cmd, { timeout: 30000 }).toString().trim();
      const lines = output.split('\n').filter(Boolean);
      
      for (const line of lines) {
        let entry;
        try { entry = JSON.parse(line); } catch { continue; }
        
        const { id: youtube_id, title, description, channelName, duration } = entry;
        
        if (!isRelevant(title, description, duration)) {
          skipped++;
          continue;
        }
        
        const cat = categorizeVideo(title, description, coachName);
        
        // Check if exists
        const existing = db.prepare('SELECT id FROM videos WHERE youtube_id = ?').get(youtube_id);
        if (existing) continue;
        
        // Insert
        db.prepare(`
          INSERT INTO videos 
            (youtube_id, title, description, coach_name, duration, 
             category, content_type, position, source_type, tags)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          youtube_id,
          title,
          (description || '').slice(0, 2000),
          coachName,
          duration,
          cat.category || 'fundamentals',
          cat.content_type,
          cat.position || 'neutral',
          'youtube',
          `${coachName}, ${cat.content_type}, folkstyle`
        );
        
        added++;
        console.log(`   ✅ ${title.slice(0, 60)}`);
      }
    } catch (e) {
      console.log(`   ❌ Error: ${e.message.slice(0, 60)}`);
    }
  }
  
  return { added, skipped };
}

// Run crawlers
console.log('\n🎯 Priority Crawler - Top Coaching Channels\n');

let totalAdded = 0;
let totalSkipped = 0;

for (const { name, queries } of COACH_CHANNELS) {
  const result = crawlChannel(name, name, max = 5);
  totalAdded += result.added;
  totalSkipped += result.skipped;
}

// Also crawl drills and matches
console.log('\n🥊 Crawling Drills & Matches\n');

for (const [type, queries] of Object.entries(CONTENT_QUERIES)) {
  console.log(`📊 Content Type: ${type}`);
  for (const query of queries) {
    try {
      const cmd = `yt-dlp --flat-playlist --dump-json "ytsearch5:${query}" 2>/dev/null`;
      const output = execSync(cmd, { timeout: 30000 }).toString().trim();
      const lines = output.split('\n').filter(Boolean);
      
      for (const line of lines) {
        let entry;
        try { entry = JSON.parse(line); } catch { continue; }
        
        const { id: youtube_id, title, description, duration } = entry;
        
        if (!isRelevant(title, description, duration)) continue;
        
        const existing = db.prepare('SELECT id FROM videos WHERE youtube_id = ?').get(youtube_id);
        if (existing) continue;
        
        db.prepare(`
          INSERT INTO videos 
            (youtube_id, title, description, duration, 
             content_type, position, source_type)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          youtube_id,
          title,
          (description || '').slice(0, 2000),
          duration,
          type,
          'neutral',
          'youtube'
        );
        
        totalAdded++;
        console.log(`   ✅ ${title.slice(0, 60)}`);
      }
    } catch (e) {
      // silent fail
    }
  }
}

console.log(`\n✅ Done! Added: ${totalAdded} | Skipped: ${totalSkipped}`);
db.close();
