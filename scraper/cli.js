const { scrapeAnimeEpisodes } = require('./index');
const fs = require('fs');
const path = require('path');

const CACHE_DIR = path.join(__dirname, '../cache');
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

// List of popular anime to scrape from hianime.ro
const ANIME_LIST = [
  { id: 'naruto', name: 'Naruto' },
  { id: 'onepiece', name: 'One Piece' },
  { id: 'demonslayer', name: 'Demon Slayer' },
  { id: 'jujutsukaisen', name: 'Jujutsu Kaisen' },
  { id: 'aot', name: 'Attack on Titan' },
  // Add more anime IDs here
  // You can find the ID from the URL: hianime.ro/anime/[ID]
];

async function main() {
  console.log('🎬 Starting REAL HiAnime scraper...');
  console.log(`🌐 Using: https://hianime.ro\n`);
  
  for (const anime of ANIME_LIST) {
    try {
      console.log(`📼 Scraping: ${anime.name} (ID: ${anime.id})`);
      
      const episodes = await scrapeAnimeEpisodes(anime.id);
      
      if (episodes && episodes.length > 0) {
        // Save to cache
        const cacheFile = path.join(CACHE_DIR, `${anime.id}.json`);
        fs.writeFileSync(cacheFile, JSON.stringify({
          anime: anime.name,
          id: anime.id,
          episodes,
          totalEpisodes: episodes.length,
          lastUpdated: new Date().toISOString(),
          source: 'hianime.ro'
        }, null, 2));
        
        console.log(`✅ Saved ${episodes.length} episodes for ${anime.name}`);
        console.log(`💾 Cache: ${cacheFile}\n`);
      } else {
        console.log(`⚠️ No episodes found for ${anime.name}\n`);
      }
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 2000));
      
    } catch (error) {
      console.error(`❌ Failed to scrape ${anime.name}:`, error.message);
      console.log('Continuing to next anime...\n');
    }
  }
  
  console.log('🎉 Scraping complete!');
  console.log(`📁 Cache stored in: ${CACHE_DIR}`);
  console.log(`📊 Total files: ${fs.readdirSync(CACHE_DIR).length}`);
}

main().catch(console.error);
