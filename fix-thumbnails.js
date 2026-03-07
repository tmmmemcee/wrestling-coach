const Database = require('better-sqlite3');
const { fetchThumbnail, fetchThumbnailsBatch, updateThumbnailsInDatabase } = require('./thumbs');

const db = new Database('./wrestling.db');

// Get all videos without thumbnails
const allVideos = db.prepare('SELECT youtube_id FROM videos WHERE thumbnail_url IS NULL OR thumbnail_url = ""').all();
console.log('\n📊 Found', allVideos.length, 'videos without thumbnails:');

const videoIds = allVideos.filter(v => v.youtube_id && v.youtube_id.trim()).map(v => v.youtube_id.trim());
console.log('  Valid IDs:', videoIds.length, '(removed empty/null entries)');

if (videoIds.length > 0) {
  console.log('\n🎬 Sample videos needing thumbnails:');
  for (let i = 0; i < Math.min(5, videoIds.length); i++) {
    console.log('   -', videoIds[i]);
  }
  
  console.log('\n📸 Fetching thumbnails...');
  const thumbnails = fetchThumbnailsBatch(videoIds);
  
  console.log('\n🔄 Updating database...');
  updateThumbnailsInDatabase(db, thumbnails);
  
  // Verify
  const remaining = db.prepare('SELECT COUNT(*) as count FROM videos WHERE thumbnail_url IS NULL OR thumbnail_url = ""').get();
  console.log('\n✅ Done! Remaining without thumbnails:', remaining.count);
} else {
  console.log('\n✅ All videos already have thumbnails!');
}

db.close();
