const Database = require('better-sqlite3');
const { fetchThumbnail } = require('./thumbs');

const db = new Database('./wrestling.db');

async function fixAllThumbnails() {
  console.log('📸 FIXING THUMBNAILS FOR 66 VIDEOS\n');
  
  // Get videos without thumbnails (using LENGTH check to avoid SQL syntax issues)
  const videos = db.prepare('SELECT id, youtube_id, title FROM videos WHERE thumbnail_url IS NULL OR LENGTH(thumbnail_url) = 0').all();
  
  console.log(`Found ${videos.length} videos needing thumbnails\n`);
  
  if (videos.length === 0) {
    console.log('✅ All videos have thumbnails!');
    db.close();
    return;
  }
  
  const stmt = db.prepare('UPDATE videos SET thumbnail_url = ? WHERE id = ?');
  let updated = 0;
  
  for (let i = 0; i < videos.length; i++) {
    const v = videos[i];
    
    if (!v.youtube_id || v.youtube_id.trim().length === 0) {
      console.log(`[${i+1}/${videos.length}] ⚠️  Skipping video ${v.id} - empty youtube_id`);
      continue;
    }
    
    console.log(`[${i+1}/${videos.length}] Fetching thumbnail for ${v.youtube_id}...`);
    
    const thumbnailUrl = await fetchThumbnail(v.youtube_id);
    
    stmt.run(thumbnailUrl, v.id);
    updated++;
    
    // Small delay to avoid rate limiting
    if (i < videos.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  console.log(`\n✅ Updated ${updated} thumbnails`);
  
  // Verify
  const remaining = db.prepare('SELECT COUNT(*) as count FROM videos WHERE thumbnail_url IS NULL OR LENGTH(thumbnail_url) = 0').get();
  console.log(`📊 Remaining without thumbnails: ${remaining.count}`);
  
  db.close();
}

fixAllThumbnails().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
