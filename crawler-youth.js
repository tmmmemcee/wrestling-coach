/**
 * Youth Wrestling Priority Crawler
 * Focus: Ages 6-12 beginner wrestling techniques
 */

const { execSync } = require('child_process');
const Database = require('better-sqlite3');
const path = require('path');
const { fetchThumbnail, fetchThumbnailsBatch, updateThumbnailsInDatabase } = require('./thumbs');

const db = new Database(path.join(__dirname, 'wrestling.db'));

const YOUTH_COACHES = [
  { name: 'Garnet Seward', queries: [
      'garnet seyward youth wrestling drills',
      'garnet seyward elementary wrestling',
      'garnet seyward wrestling fundamentals',
      'garnet seyward teaching wrestling'
  ]},
  { name: 'Dave Schultz', queries: [
      'dave schultz youth wrestling',
      'dave schultz wrestling instruction',
      'dave schultz kids wrestling'
  ]},
  { name: 'Dan Gable', queries: [
      'dan gable youth wrestling',
      'dan gable basic wrestling',
      'dan gable wrestling fundamentals'
  ]},
  { name: 'youth wrestling', queries: [
      'wrestling stance for kids',
      'wrestling basics for beginners',
      'how to wrestle for kids',
      'elementary wrestling techniques',
      'wrestling drills for children',
      'youth wrestling stance'
  ]},
  { name: 'wrestling for kids', queries: [
      'single leg takedown for kids',
      'youth wrestling takedowns',
      'basic takedown for beginners',
      'double leg takedown kids',
      'basic wrestling escape',
      'wrestling defense for kids'
  ]}
];

const YOUTH_PREFERENCES = {
  maxDuration: 600,
  idealDuration: 300,
  youthKeywords: ['for kids', 'for beginners', 'elementary', 'youth', 'teaching', 'how to', 'basics', 'fundamentals', 'basic', 'kids wrestling', 'wrestling for kids', 'teaching wrestling', 'drills for', 'instruction', 'tutorial'],
  skipKeywords: ['vlog', 'interview', 'competition', 'match', 'highlights', 'freestyle', 'greco-roman', 'senior', 'adult', 'advanced', 'college', 'olympic', 'championship', 'tournament', 'ufc', 'mma', 'grappling', 'jiu-jitsu', 'judo', 'brazilian', 'training camp', 'workout', 'fitness']
};

function isYouthAppropriate(title, description, duration) {
  const text = (title + ' ' + (description || '')).toLowerCase();
  if (duration && duration > YOUTH_PREFERENCES.maxDuration) return false;
  for (const skip of YOUTH_PREFERENCES.skipKeywords) {
    if (text.includes(skip)) return false;
  }
  const hasYouthSignal = YOUTH_PREFERENCES.youthKeywords.some(kw => text.includes(kw));
  const hasInstructional = ['wrestling', 'technique', 'how to', 'tutorial', 'instruction', 'drill'].some(kw => text.includes(kw));
  return hasInstructional && hasYouthSignal;
}

function categorizeForYouth(title, description, channel) {
  const text = (title + ' ' + (description || '')).toLowerCase();
  let content_type = 'technique';
  if (text.includes('drill') || text.includes('workout') || text.includes('exercise')) content_type = 'drill';
  else if (text.includes('match') || text.includes('competition')) content_type = 'match';
  
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

function crawlCoach(channelName, queries, maxResults = 5) {
  console.log(`\n🏆 Crawling: ${channelName}`);
  let added = 0;
  
  for (const query of queries) {
    try {
      const cmd = `yt-dlp --flat-playlist --dump-json "ytsearch${maxResults}:${query}" 2>/dev/null`;
      const output = execSync(cmd, { timeout: 30000 }).toString().trim();
      const lines = output.split('\n').filter(Boolean);
      
      for (const line of lines) {
        let entry;
        try { entry = JSON.parse(line); } catch { continue; }
        
        const { id: youtube_id, title, description, duration } = entry;
        if (!isYouthAppropriate(title, description, duration)) continue;
        
        const cat = categorizeForYouth(title, description, channelName);
        const existing = db.prepare('SELECT id FROM videos WHERE youtube_id = ?').get(youtube_id);
        if (existing) continue;
        
        const tags = `${channelName}, youth wrestling, ${cat.content_type}, elementary`;
        
        db.prepare(`
          INSERT INTO videos 
            (youtube_id, title, description, coach_name, duration, 
             category, content_type, position, age_group, style, source_type, tags, thumbnail_url)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          youtube_id, title, (description || '').slice(0, 2000), channelName, duration,
          cat.category, cat.content_type, cat.position, 'elementary (6-10)', 'folkstyle', 'youtube', tags, ''
        );
        
        added++;
        console.log(`   ✅ ${title.slice(0, 70)}`);
      }
    } catch (e) {
      console.log(`   ❌ Error: ${e.message.slice(0, 50)}`);
    }
  }
  
  return added;
}

async function runYouthCrawl() {
  console.log('\n🎯 YOUTH WRESTLING CRAWLER (Ages 6-12)');
  console.log('=' .repeat(50));
  
  let totalAdded = 0;
  
  console.log('\n📺 Crawling Youth-Focused Content');
  for (const { name, queries } of YOUTH_COACHES) {
    const count = crawlCoach(name, queries, 5);
    totalAdded += count;
  }
  
  console.log(`\n${'*'.repeat(50)}`);
  console.log(`\n✅ Crawl Complete!`);
  console.log(`   📹 Videos Added: ${totalAdded}`);
  console.log(`\n📸 Now fetching thumbnails...`);
  
  const allVideos = db.prepare('SELECT youtube_id FROM videos WHERE thumbnail_url IS NULL OR thumbnail_url = ""').all();
  const videoIds = allVideos.map(v => v.youtube_id).filter(id => id !== null && id !== '');
  
  if (videoIds.length > 0) {
    console.log(`   📸 Found ${videoIds.length} videos without thumbnails\n`);
    const thumbnails = await fetchThumbnailsBatch(videoIds);
    updateThumbnailsInDatabase(db, thumbnails);
  } else {
    console.log('   ✓ All videos already have thumbnails!');
  }
  
  const total = db.prepare('SELECT COUNT(*) as total FROM videos WHERE age_group = "elementary (6-10)"').get();
  console.log(`\n📊 Current Youth Videos: ${total.total}`);
  
  db.close();
}

runYouthCrawl().catch(console.error);
