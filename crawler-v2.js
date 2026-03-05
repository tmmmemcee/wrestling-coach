/**
 * Wrestling Video Crawler with Taxonomy
 * Searches YouTube and auto-tags using the complete folkstyle taxonomy
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const taxonomy = JSON.parse(fs.readFileSync(path.join(__dirname, 'taxonomy.json'), 'utf8')).folkstyle_taxonomy;

// Build flat keyword list for tagging
function buildKeywordMap() {
  const keywords = {};
  for (const category of Object.values(taxonomy)) {
    for (const move of category.moves) {
      for (const kw of move.keywords) {
        keywords[kw.toLowerCase()] = {
          move_type: move.name,
          move_id: move.id,
          position: move.position,
          difficulty: move.difficulty
        };
      }
    }
  }
  return keywords;
}

const keywordMap = buildKeywordMap();

// Build category keywords for broader matching
function buildCategoryKeywords() {
  return {
    'pins': ['pin', 'fall', 'shoulders', 'mat'],
    'tilts': ['tilt', 'turn', 'exposure', 'back'],
    'takedowns': ['takedown', 'td', 'shot', 'attack'],
    'escapes': ['escape', 'get out', 'get away'],
    'reversals': ['reversal', 'reverse', 'turn over'],
    'defense': ['defense', 'counter', 'stop', 'block'],
    'top_riding': ['ride', 'riding', 'top', 'control'],
    'fundamentals': ['fundamental', 'basic', 'drill', 'position']
  };
}

const categoryKeywords = buildCategoryKeywords();

// ─── Search queries by category ─────────────────────────────────────────────

const SEARCH_QUERIES = {
  pins: [
    'folkstyle wrestling half nelson pin youth',
    'wrestling power half nelson technique',
    'youth wrestling double chicken wing',
    'wrestling bar arm pin technique',
    'wrestling arm bar pin tutorial',
    'youth wrestling cradle pin',
    'folkstyle tight waist pin',
    'wrestling spladle pin technique',
    'youth wrestling cement mixer',
    'wrestling bow and arrow pin',
    'wrestling spiral breakdown technique',
    'folkstyle turk pin riding'
  ],
  tilts: [
    'wrestling wrist tilt youth',
    '2 on 1 tilt technique wrestling',
    'wrestling leg tilt riding',
    'deep half tilt wrestling'
  ],
  takedowns: [
    'folkstyle wrestling single leg takedown',
    'wrestling double leg takedown kids',
    'youth wrestling ankle pick',
    'wrestling firemans carry takedown',
    'youth wrestling duck under',
    'wrestling high crotch takedown',
    'wrestling low single takedown',
    'wrestling sweep single technique',
    'wrestling blast double takedown',
    'wrestling snap down technique',
    'wrestling shuck by technique',
    'wrestling arm drag takedown',
    'wrestling russian tie technique'
  ],
  escapes: [
    'wrestling stand up escape bottom',
    'youth wrestling switch escape',
    'wrestling sit out escape',
    'wrestling granby roll escape',
    'wrestling hip heist escape',
    'wrestling peterson roll escape'
  ],
  reversals: [
    'wrestling switch reversal',
    'wrestling sit out turn in',
    'wrestling whip over reversal'
  ],
  defense: [
    'wrestling sprawl defense',
    'wrestling whizzer defense',
    'wrestling underhook defense',
    'wrestling down block defense',
    'wrestling head position defense'
  ],
  fundamentals: [
    'wrestling stance and motion drill',
    'wrestling level change drill',
    'wrestling penetration step drill',
    'wrestling hand fighting tutorial',
    'wrestling chain wrestling drill'
  ],
  trusted: [
    'FloWrestling technique tutorial',
    'RUDIS wrestling instruction',
    'CKLWrestling technique'
  ]
};

// ─── Tagging Logic ────────────────────────────────────────────────────────

function tagVideo(title, description, channel) {
  const text = `${title} ${description} ${channel}`.toLowerCase();
  
  // Try specific keyword matching first
  for (const [keyword, data] of Object.entries(keywordMap)) {
    if (text.includes(keyword)) {
      return {
        move_type: data.move_type,
        move_id: data.move_id,
        position: data.position,
        difficulty: data.difficulty,
        category: findCategory(data.move_id),
        style: 'folkstyle',
        tags: `${data.move_type}, ${data.position}, ${data.difficulty}, folkstyle`
      };
    }
  }
  
  // Broader category matching
  for (const [cat, keywords] of Object.entries(categoryKeywords)) {
    if (keywords.some(kw => text.includes(kw))) {
      return {
        move_type: cat.replace('_', ' '),
        position: inferPosition(cat, text),
        difficulty: inferDifficulty(text),
        category: cat,
        style: 'folkstyle',
        tags: `${cat}, ${inferPosition(cat, text)}, ${inferDifficulty(text)}, folkstyle`
      };
    }
  }
  
  // Default tagging
  return {
    move_type: null,
    position: null,
    difficulty: inferDifficulty(text),
    category: null,
    style: 'folkstyle',
    tags: 'folkstyle, wrestling'
  };
}

function findCategory(moveId) {
  for (const [catName, catData] of Object.entries(taxonomy)) {
    if (catData.moves.some(m => m.id === moveId)) {
      return catName;
    }
  }
  return null;
}

function inferPosition(category, text) {
  if (text.includes('bottom') || text.includes('escape') || text.includes('reversal')) return 'bottom';
  if (text.includes('top') || text.includes('riding') || text.includes('pin')) return 'top';
  if (category === 'takedowns' || category === 'defense' || category === 'fundamentals') return 'neutral';
  return 'neutral';
}

function inferDifficulty(text) {
  if (text.includes('advanced') || text.includes('college') || text.includes('elite')) return 'advanced';
  if (text.includes('intermediate') || text.includes('drill')) return 'intermediate';
  return 'beginner';
}

function isRelevant(title, description, duration) {
  const text = `${title} ${description}`.toLowerCase();
  
  // Skip non-instruction content
  const skipKeywords = [
    'match', 'tournament', 'finals', 'semifinal', 'highlights', 'vlog',
    'podcast', 'interview', 'recap', 'commentary', 'freestyle', 'greco',
    'sumo', 'jiu jitsu', 'judo', 'mma', 'ufc', 'arm wrestling'
  ];
  if (skipKeywords.some(kw => text.includes(kw))) return false;
  
  // Must be instruction
  const instructionKeywords = [
    'technique', 'tutorial', 'instruction', 'how to', 'drill',
    'teaching', 'learn', 'tips', 'basics', 'fundamental', 'wrestling'
  ];
  if (!instructionKeywords.some(kw => text.includes(kw))) return false;
  
  // Duration filter
  if (duration && (duration < 45 || duration > 1200)) return false; // 45s to 20min
  
  return true;
}

// ─── Local DB Helper ──────────────────────────────────────────────────────

const DB_PATH = path.join(__dirname, 'wrestling.db');

function initDB() {
  const Database = require('better-sqlite3');
  const db = new Database(DB_PATH);
  
  db.exec(`
    CREATE TABLE IF NOT EXISTS videos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      youtube_id TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      channel TEXT,
      duration INTEGER,
      thumbnail_url TEXT,
      move_type TEXT,
      move_id TEXT,
      position TEXT,
      difficulty TEXT,
      age_group TEXT DEFAULT 'elementary (6-10)',
      style TEXT DEFAULT 'folkstyle',
      category TEXT,
      tags TEXT,
      upvotes INTEGER DEFAULT 0,
      downvotes INTEGER DEFAULT 0,
      rating INTEGER DEFAULT 0,
      source_type TEXT DEFAULT 'youtube',
      indexed_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  return db;
}

// ─── Main Crawler ─────────────────────────────────────────────────────────

const DRY_RUN = process.argv.includes('--dry-run');
const MAX = parseInt((process.argv.find(a => a.startsWith('--max=')) || '--max=3').split('=')[1]);

async function crawl() {
  console.log(`\n🤼 Wrestling Crawler Starting`);
  console.log(`   Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log(`   Max per query: ${MAX}\n`);
  
  let db;
  if (!DRY_RUN) {
    try {
      db = initDB();
    } catch (e) {
      console.log(`❌ DB init failed: ${e.message}`);
      console.log(`   Try: npm install better-sqlite3`);
      return;
    }
  }
  
  let added = 0, skipped = 0, exists = 0;
  const allQueries = Object.values(SEARCH_QUERIES).flat();
  
  for (const query of allQueries) {
    console.log(`🔍 ${query}`);
    try {
      const cmd = `yt-dlp --flat-playlist --dump-json "ytsearch${MAX}:${query}" 2>/dev/null`;
      const output = execSync(cmd, { timeout: 30000 }).toString().trim();
      const lines = output.split('\n').filter(Boolean);
      
      for (const line of lines) {
        let entry;
        try { entry = JSON.parse(line); } catch { continue; }
        
        const { id: youtube_id, title = '', description = '', channel = '', uploader = '', duration, thumbnail } = entry;
        const ch = channel || uploader;
        
        if (!isRelevant(title, description || '', duration)) {
          skipped++;
          continue;
        }
        
        const tags = tagVideo(title, description || '', ch);
        
        if (DRY_RUN) {
          console.log(`  ✅ ${title.slice(0, 60)}`);
          console.log(`     Move: ${tags.move_type} | Pos: ${tags.position} | Diff: ${tags.difficulty}`);
          added++;
          continue;
        }
        
        // Check exists
        const existing = db.prepare('SELECT id FROM videos WHERE youtube_id = ?').get(youtube_id);
        if (existing) {
          exists++;
          continue;
        }
        
        // Insert
        try {
          db.prepare(`
            INSERT INTO videos 
              (youtube_id, title, description, channel, duration, thumbnail_url,
               move_type, move_id, position, difficulty, age_group, style, category, tags, source_type)
            VALUES 
              (@youtube_id, @title, @description, @channel, @duration, @thumbnail_url,
               @move_type, @move_id, @position, @difficulty, @age_group, @style, @category, @tags, @source_type)
          `).run({
            youtube_id,
            title,
            description: (description || '').slice(0, 2000),
            channel: ch,
            duration,
            thumbnail_url: thumbnail || `https://i.ytimg.com/vi/${youtube_id}/hqdefault.jpg`,
            move_type: tags.move_type,
            move_id: tags.move_id,
            position: tags.position,
            difficulty: tags.difficulty,
            age_group: 'elementary (6-10)',
            style: tags.style,
            category: tags.category,
            tags: tags.tags,
            source_type: 'youtube'
          });
          added++;
          console.log(`  ✅ ${title.slice(0, 60)}`);
        } catch (e) {
          console.log(`  ❌ DB error: ${e.message.slice(0, 60)}`);
        }
      }
    } catch (e) {
      console.log(`  ❌ Search error: ${e.message.slice(0, 80)}`);
    }
  }
  
  console.log(`\n✅ Done! Added: ${added} | Skipped: ${skipped} | Exists: ${exists}`);
  if (db) db.close();
}

crawl();
