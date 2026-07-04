const { scrapeAnimeEpisodes, scrapeEpisodeSource } = require('./index');
const fs = require('fs');
const path = require('path');

const CACHE_DIR = path.join(__dirname, '../cache');
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

const ANIME_LIST = [
  { id: 'naruto', name: 'Naruto' },
  { id: 'one piece', name: 'One Piece' },
  { id: 'demon slayer', name: 'Demon Slayer' },
  { id: 'jujutsu kaisen', name: 'Jujutsu Kaisen' },
  { id: 'attack on titan', name: 'Attack on Titan' },
];

async function main() {
  console.log('🎬 Starting REAL HiAnime scraper...');
  console.log(`🌐 Using: https://hianime.ro\n`);
  
  for (const anime of ANIME_LIST) {
    try {
      console.log(`\n📼 Scraping: ${anime.name} (Search: ${anime.id})`);
      
      const episodes = await scrapeAnimeEpisodes(anime.id);
      let sourceEpisode1 = null;

      if (episodes && episodes.length > 0) {
        console.log(`  Testing episode 1 video source...`);
        sourceEpisode1 = await scrapeEpisodeSource(anime.id, 1);
        console.log(`  📺 Video URL: ${sourceEpisode1.url?.substring(0, 80) || 'N/A'}...`);
        console.log(`  📊 Sources found: ${sourceEpisode1.sources?.length || 0}`);
      }
      
      const cacheFile = path.join(CACHE_DIR, `${anime.id.replace(/\s+/g, '-')}.json`);
      fs.writeFileSync(cacheFile, JSON.stringify({
        anime: anime.name,
        searchTerm: anime.id,
        episodes,
        totalEpisodes: episodes.length,
        sourceEpisode1,
        lastUpdated: new Date().toISOString(),
        source: 'hianime.ro'
      }, null, 2));
      
      console.log(`✅ Saved ${episodes.length} episodes for ${anime.name}`);
      
      await new Promise(resolve => setTimeout(resolve, 3000));
      
    } catch (error) {
      console.error(`❌ Failed to scrape ${anime.name}:`, error.message);
    }
  }
  
  console.log('\n🎉 Scraping complete!');
  console.log(`📁 Cache stored in: ${CACHE_DIR}`);
}

main().catch(console.error);
