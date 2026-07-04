const { scrapeAnimeEpisodes, scrapeEpisodeSource } = require('./index');
const fs = require('fs');
const path = require('path');

// Create cache directory if it doesn't exist
const CACHE_DIR = path.join(__dirname, '../cache');
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

// List of popular anime IDs to scrape
const ANIME_LIST = [
  { id: '1', name: 'Naruto' },
  { id: '2', name: 'One Piece' },
  { id: '3', name: 'Demon Slayer' },
  { id: '4', name: 'Jujutsu Kaisen' },
  { id: '5', name: 'Attack on Titan' },
];

async function main() {
  console.log('🎬 Starting anime scraper...');
  console.log(`📀 Will scrape ${ANIME_LIST.length} anime`);
  
  for (const anime of ANIME_LIST) {
    try {
      console.log(`\n📼 Scraping: ${anime.name} (ID: ${anime.id})`);
      
      // Get episodes
      const episodes = await scrapeAnimeEpisodes(anime.id);
      console.log(`✅ Found ${episodes.length} episodes`);
      
      // Save to cache
      const cacheFile = path.join(CACHE_DIR, `${anime.id}.json`);
      fs.writeFileSync(cacheFile, JSON.stringify({
        anime: anime.name,
        id: anime.id,
        episodes,
        lastUpdated: new Date().toISOString()
      }, null, 2));
      
      console.log(`💾 Saved to cache: ${cacheFile}`);
      
      // Optionally scrape first 3 episodes to warm the cache
      console.log(`🔥 Warming cache for first 3 episodes...`);
      for (let i = 1; i <= Math.min(3, episodes.length); i++) {
        try {
          const source = await scrapeEpisodeSource(anime.id, i);
          const epCacheFile = path.join(CACHE_DIR, `${anime.id}_ep${i}.json`);
          fs.writeFileSync(epCacheFile, JSON.stringify(source, null, 2));
          console.log(`   ✅ Episode ${i} cached`);
        } catch (e) {
          console.log(`   ⚠️ Episode ${i} failed: ${e.message}`);
        }
      }
      
    } catch (error) {
      console.error(`❌ Failed to scrape ${anime.name}:`, error.message);
    }
  }
  
  console.log('\n🎉 Scraping complete!');
  console.log(`📁 Cache stored in: ${CACHE_DIR}`);
}

// Run the scraper
main().catch(console.error);
