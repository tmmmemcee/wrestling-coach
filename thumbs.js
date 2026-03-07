/**
 * Thumbnail Fetch Service
 * Robustly fetches high-quality JPEG thumbnails for YouTube videos
 */

const THUMBNAIL_SIZES = ['maxresdefault', 'hqdefault', 'mqdefault', 'sddefault', 'default'];
const BASE_URL = 'https://img.youtube.com/vi';

// Node.js native fetch
globalThis.fetch = require('node-fetch').default;

/**
 * Fetch best available thumbnail for a YouTube video ID
 */
async function fetchThumbnail(youtubeId, timeout = 5000) {
  try {
    if (!youtubeId || typeof youtubeId !== 'string') {
      console.log('  ⚠️  Invalid youtubeId:', youtubeId);
      return 'https://via.placeholder.com/480x360.png?text=Invalid';
    }
    
    controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    for (const size of THUMBNAIL_SIZES) {
      const url = BASE_URL + '/' + youtubeId + '/' + size + '.jpg';
      
      const response = await fetch(url, {
        method: 'HEAD',
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        console.log('  ✅ Found:', size);
        return url;
      }
    }
    
    console.log('  ⚠️  No thumbnail available');
    return 'https://via.placeholder.com/480x360.png?text=No+Thumbnail';
  } catch (error) {
    if (error.name === 'AbortError') {
      console.error('  ⏱️  Timeout for', youtubeId);
    } else {
      console.error('  ❌ Error for', youtubeId + ':', error.message);
    }
    return 'https://via.placeholder.com/480x360.png?text=No+Thumbnail';
  }
}

/**
 * Batch fetch thumbnails for multiple video IDs
 */
async function fetchThumbnailsBatch(youtubeIds, batchSize = 10, delayBetweenBatches = 200) {
  console.log('📸 Fetching thumbnails for ' + youtubeIds.length + ' videos...');
  
  const results = [];
  
  for (let i = 0; i < youtubeIds.length; i += batchSize) {
    const batch = youtubeIds.slice(i, i + batchSize);
    
    console.log('\nBatch ' + Math.floor(i / batchSize) + 1 + '/' + Math.ceil(youtubeIds.length / batchSize) + ': Processing ' + batch.length + ' videos');
    
    for (let j = 0; j < batch.length; j++) {
      const ytId = batch[j];
      if (ytId && typeof ytId === 'string' && ytId.trim()) {
        const url = await fetchThumbnail(ytId);
        results.push({ youtubeId: ytId.trim(), thumbnailUrl: url });
      }
    }
    
    if (i + batchSize < youtubeIds.length) {
      await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
    }
  }
  
  console.log('\n✅ Batch complete - fetched ' + results.length + ' thumbnails');
  return results;
}

/**
 * Update video thumbnails in database
 */
function updateThumbnailsInDatabase(db, thumbnails) {
  const allVideos = db.prepare('SELECT youtube_id FROM videos WHERE thumbnail_url IS NULL OR thumbnail_url = ""').all();
  const videoIds = allVideos.filter(v => v.youtube_id && v.youtube_id.trim()).map(v => v.youtube_id.trim());
  
  console.log('  Found', videoIds.length, 'videos needing thumbnails');
  
  const stmt = db.prepare('UPDATE videos SET thumbnail_url = ? WHERE youtube_id = ?');
  
  let updated = 0;
  
  for (let i = 0; i < videoIds.length; i++) {
    const ytId = videoIds[i];
    const thumbObj = thumbnails.find(t => t.youtubeId === ytId);
    if (thumbObj && thumbObj.thumbnailUrl) {
      stmt.run(thumbObj.thumbnailUrl, ytId);
      updated++;
    }
  }
  
  console.log('  ✅ Updated', updated, 'video thumbnails in database');
  return updated;
}

module.exports = { fetchThumbnail, fetchThumbnailsBatch, updateThumbnailsInDatabase };
