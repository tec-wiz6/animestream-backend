const { scrapeAnimeEpisodes } = require('./index');
const fs = require('fs');
const path = require('path');

const CACHE_DIR = path.join(__dirname, '../cache');
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

// Use search terms instead of slugs - the scraper will find the correct slug
const ANIME_LIST = [
  { id: 'naruto', name: 'Naruto' },
  { id: 'one piece', name: 'One Piece' },  // Use space for search
  { id: 'demon slayer', name: 'Demon Slayer' },  // Use actual title
  { id: 'jujutsu kaisen', name: 'Jujutsu Kaisen' },
  { id: 'attack on titan', name: 'Attack on Titan' },
];

async function main() {
  console.log('🎬 Starting REAL HiAnime scraper...');
  console.log(`🌐 Using: https://hianime.ro\n`);
  
  for (const anime of ANIME_LIST) {
    try {
      console.log(`📼 Scraping: ${anime.name} (Search: ${anime.id})`);
      
      const episodes = await scrapeAnimeEpisodes(anime.id);
      
      if (episodes && episodes.length > 0) {
        // Check if it's real data (has real URLs)
        const isRealData = episodes.some(ep => ep.url && !ep.url.includes('example.com'));
        console.log(`  📊 Data type: ${isRealData ? 'REAL' : 'MOCK'}`);
        console.log(`  📝 First episode URL: ${episodes[0]?.url || 'N/A'}`);
      }
      
      const cacheFile = path.join(CACHE_DIR, `${anime.id.replace(/\s+/g, '-')}.json`);
      fs.writeFileSync(cacheFile, JSON.stringify({
        anime: anime.name,
        searchTerm: anime.id,
        episodes,
        totalEpisodes: episodes.length,
        lastUpdated: new Date().toISOString(),
        source: 'hianime.ro'
      }, null, 2));
      
      console.log(`✅ Saved ${episodes.length} episodes for ${anime.name}`);
      console.log(`💾 Cache: ${cacheFile}\n`);
      
      // Wait between requests to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 3000));
      
    } catch (error) {
      console.error(`❌ Failed to scrape ${anime.name}:`, error.message);
      console.log('Continuing...\n');
    }
  }
  
  console.log('🎉 Scraping complete!');
  console.log(`📁 Cache stored in: ${CACHE_DIR}`);
  console.log(`📊 Total files: ${fs.readdirSync(CACHE_DIR).length}`);
}

main().catch(console.error);
