#!/usr/bin/env node
// Script to add style support and reclassify videos

const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'wrestling.db'));

// Add styles column if it doesn't exist (comma-separated list)
try {
  db.exec('ALTER TABLE videos ADD COLUMN styles TEXT DEFAULT "folkstyle"');
  console.log('✓ Added styles column');
} catch (e) {
  console.log('Styles column already exists');
}

// Add is_pro_wrestling column (boolean)
try {
  db.exec('ALTER TABLE videos ADD COLUMN is_pro_wrestling INTEGER DEFAULT 0');
  console.log('✓ Added is_pro_wrestling column');
} catch (e) {
  console.log('is_pro_wrestling column already exists');
}

// Add style_categories table
db.exec(`CREATE TABLE IF NOT EXISTS style_categories (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  order_num INTEGER
)`);

// Insert standard wrestling styles
db.exec(`INSERT OR IGNORE INTO style_categories (id, name, description, order_num) VALUES
  (1, 'folkstyle', 'Catch wrestling (US high school/college style)', 1),
  (2, 'freestyle', 'International freestyle wrestling', 2),
  (3, 'greco', 'Greco-Roman (no below the belt)', 3),
  (4, 'sumo', 'Japanese sumo wrestling', 4),
  (5, 'beachwrestling', 'Beach wrestling competitions', 5)
`);

// Update existing videos - mark pro wrestling and tag styles
console.log('\n🔍 Analyzing videos for style tagging...');

// Pro wrestling keywords (mark these)
const proKeywords = [
  'wwe', 'wrestlemania', 'smackdown', 'raw', 'roh',
  'all Japan', 'nova', 'pro wrestling', 'entertainment',
  'big show', 'stone cold', 'the rock', 'triple h',
  'hulkamania', 'mankind', ' Undertaker', 'cm punk',
  'john cena', 'batista', 'kane', 'bret hart',
  'edge', 'christian', 'shawn michaels', 'kevin oneil'
];

// Style keywords (to auto-tag)
const styleKeywords = {
  'freestyle': ['freestyle', 'world championships', 'olympic', 'style',
    'denver', 'glasgow', 'cadillac', 'las vegas'],
  'greco': ['greco', 'roman', 'greco-roman', 'no_below_belt'],
  'sumo': ['sumo', 'japanese', 'heya', 'ichinojo', 'harumafuji', 'kakuryu'],
  'beachwrestling': ['beach', 'sand wrestling', 'beachwrestling']
};

// Count by category
const stats = {
  folkstyle: 0,
  freestyle: 0,
  greco: 0,
  sumo: 0,
  beach: 0,
  pro: 0
};

const updateStatement = db.prepare(`
  UPDATE videos SET styles = ?, is_pro_wrestling = ? WHERE id = ?
`);

let updated = 0;

// Iterate through videos
const allVideos = db.prepare('SELECT id, title, channel FROM videos').all();

for (const video of allVideos) {
  const title = (video.title || '').toLowerCase();
  const channel = (video.channel || '').toLowerCase();
  const combined = title + ' ' + channel;
  
  let styles = [];
  let isPro = false;
  
  // Check for pro wrestling
  for (const keyword of proKeywords) {
    if (combined.includes(keyword.toLowerCase())) {
      isPro = true;
      break;
    }
  }
  
  // Check for real wrestling styles
  for (const [style, keywords] of Object.entries(styleKeywords)) {
    for (const keyword of keywords) {
      if (combined.includes(keyword.toLowerCase())) {
        styles.push(style);
        break;
      }
    }
  }
  
  // Default to folkstyle if nothing else matches and not pro
  if (styles.length === 0 && !isPro) {
    stats.folkstyle++;
    styles.push('folkstyle');
  } else {
    for (const style of styles) {
      stats[style]++;
    }
  }
  
  if (isPro) {
    stats.pro++;
  }
  
  // Update if changed
  const newStylesString = styles.join(',');
  if (newStylesString !== video.styles || (isPro ? 1 : 0) !== video.is_pro_wrestling) {
    updateStatement.run(newStylesString, isPro ? 1 : 0, video.id);
    updated++;
  }
}

db.close();

console.log('\n✅ Classification complete!');
console.log(`\n📊 Results:`);
console.log(`  Folkstyle: ${stats.folkstyle} videos`);
console.log(`  Freestyle: ${stats.freestyle} videos`);
console.log(`  Greco-Roman: ${stats.greco} videos`);
console.log(`  Sumo: ${stats.sumo} videos`);
console.log(`  Beach Wrestling: ${stats.beach} videos`);
console.log(`  Pro Wrestling (marked): ${stats.pro} videos`);
console.log(`\nUpdated: ${updated} videos`);
