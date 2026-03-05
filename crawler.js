/**
 * Wrestling Video Crawler
 * Uses yt-dlp (via exec) to search YouTube for folkstyle wrestling instruction videos,
 * auto-tags them, and indexes them into the local DB via the API.
 */

const { execSync } = require('child_process');
const http = require('http');

const API = 'http://localhost:3737/api/videos';

// ─── Search queries ────────────────────────────────────────────────────────

const QUERIES = [
  // Takedowns
  'folkstyle wrestling single leg takedown instruction youth',
  'folkstyle wrestling double leg takedown basics kids',
  'youth wrestling ankle pick tutorial',
  'kids wrestling fireman carry technique',
  'youth wrestling duck under technique',
  'folkstyle wrestling high crotch tutorial',
  'wrestling snap down technique kids',
  // Top
  'folkstyle wrestling tilt technique youth',
  'youth wrestling half nelson pin',
  'wrestling cradle technique kids',
  'folkstyle wrestling leg riding basics',
  // Bottom / Escapes
  'folkstyle wrestling stand up escape',
  'youth wrestling switch technique',
  'wrestling sit out escape youth',
  // Defense
  'wrestling sprawl shot defense youth',
  'youth wrestling whizzer defense',
  // Fundamentals
  'youth wrestling stance motion drill',
  'folkstyle wrestling penetration step kids',
  'youth wrestling chain wrestling basics',
  'kids wrestling hand fighting technique',
  // Trusted channels
  'FloWrestling folkstyle technique tutorial',
  'RUDIS wrestling instruction youth',
];

// ─── Tagging logic ─────────────────────────────────────────────────────────

const MOVE_KEYWORDS = {
  'single leg':       ['single leg', 'singles'],
  'double leg':       ['double leg', 'doubles'],
  'ankle pick':       ['ankle pick'],
  "fireman's carry":  ["fireman's carry", 'firemans carry', 'fireman carry'],
  'duck under':       ['duck under'],
  'high crotch':      ['high crotch'],
  'snap down':        ['snap down'],
  'tilt':             ['tilt', 'turk and tilt'],
  'half nelson':      ['half nelson'],
  'cradle':           ['cradle'],
  'leg ride':         ['leg ride', 'leg riding'],
  'stand up':         ['stand up', 'standup'],
  'switch':           ['switch technique'],
  'sit out':          ['sit out'],
  'sprawl':           ['sprawl', 'shot defense'],
  'whizzer':          ['whizzer'],
  'chain wrestling':  ['chain wrestling'],
  'hand fighting':    ['hand fight', 'wrist control'],
  'stance':           ['stance', 'stance and motion'],
  'penetration step': ['penetration step', 'level change'],
};

const POSITION_KEYWORDS = {
  'neutral': ['neutral', 'takedown', 'shot', 'tie up', 'stance'],
  'top':     ['top', 'riding', 'tilt', 'pin', 'half nelson', 'cradle', 'leg ride', 'breakdown'],
  'bottom':  ['bottom', 'escape', 'reversal', 'stand up', 'switch', 'sit out'],
};

const SKIP_KEYWORDS = [
  'match', 'tournament', 'finals', 'semifinal', 'highlights', 'vlog',
  'podcast', 'interview', 'recap', 'commentary', 'freestyle', 'greco',
  'sumo', 'jiu jitsu', 'judo', 'mma', 'ufc', 'arm wrestling'
];

const INSTRUCTION_KEYWORDS = [
  'technique', 'tutorial', 'instruction', 'how to', 'drill',
  'teaching', 'learn', 'tips', 'basics', 'fundamental', 'wrestling'
];

function tag(title, description, channel) {
  const text = `${title} ${description} ${channel}`.toLowerCase();

  let move_type = null;
  for (const [move, kws] of Object.entries(MOVE_KEYWORDS)) {
    if (kws.some(kw => text.includes(kw))) { move_type = move; break; }
  }

  let position = null;
  for (const [pos, kws] of Object.entries(POSITION_KEYWORDS)) {
    if (kws.some(kw => text.includes(kw))) { position = pos; break; }
  }

  let difficulty = 'beginner';
  if (['advanced', 'college', 'elite'].some(kw => text.includes(kw))) difficulty = 'advanced';
  else if (['intermediate', 'drill', 'improve'].some(kw => text.includes(kw))) difficulty = 'intermediate';

  let age_group = 'elementary (6-10)';
  if (['middle school', 'junior high', 'junior'].some(kw => text.includes(kw))) age_group = 'middle school (11-14)';

  const tags = [move_type, position, difficulty, 'folkstyle', 'wrestling'].filter(Boolean).join(', ');

  return { move_type, position, difficulty, age_group, style: 'folkstyle', tags };
}

function isRelevant(title, description, duration) {
  const text = `${title} ${description}`.toLowerCase();
  if (SKIP_KEYWORDS.some(kw => text.includes(kw))) return false;
  if (!INSTRUCTION_KEYWORDS.some(kw => text.includes(kw))) return false;
  if (duration && (duration < 60 || duration > 1800)) return false;
  return true;
}

// ─── API helper ────────────────────────────────────────────────────────────

function postVideo(video) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(video);
    const req = http.request(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ─── Main ──────────────────────────────────────────────────────────────────

const DRY_RUN = process.argv.includes('--dry-run');
const MAX = parseInt((process.argv.find(a => a.startsWith('--max=')) || '--max=5').split('=')[1]);

async function crawl() {
  console.log(`\n🤼 Wrestling Crawler Starting (max=${MAX}, dry_run=${DRY_RUN})\n`);

  let added = 0, skipped = 0;

  for (const query of QUERIES) {
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

        if (!isRelevant(title, description, duration)) {
          skipped++;
          continue;
        }

        const tags = tag(title, description, ch);
        const video = {
          youtube_id,
          title,
          description: (description || '').slice(0, 2000),
          channel: ch,
          duration,
          thumbnail_url: thumbnail || `https://i.ytimg.com/vi/${youtube_id}/hqdefault.jpg`,
          source_type: 'youtube',
          ...tags
        };

        if (DRY_RUN) {
          console.log(`  ✅ Would add: ${title.slice(0, 60)}`);
          console.log(`     Move: ${tags.move_type} | Pos: ${tags.position} | Diff: ${tags.difficulty}`);
          added++;
          continue;
        }

        try {
          const result = await postVideo(video);
          if (result.inserted) {
            added++;
            console.log(`  ✅ Added: ${title.slice(0, 60)}`);
          } else {
            console.log(`  ⏭  Exists: ${title.slice(0, 60)}`);
          }
        } catch (e) {
          console.log(`  ❌ DB error: ${e.message}`);
        }
      }
    } catch (e) {
      console.log(`  ❌ Search error: ${e.message.slice(0, 80)}`);
    }
  }

  console.log(`\n✅ Done! Added: ${added} | Skipped: ${skipped}`);
}

crawl();
