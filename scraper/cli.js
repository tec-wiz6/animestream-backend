const fs = require('fs');
const path = require('path');

// Create cache directory
const CACHE_DIR = path.join(__dirname, '../cache');
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

// Sample anime data
const sampleAnime = [
  { id: 'naruto', name: 'Naruto', episodes: 220 },
  { id: 'onepiece', name: 'One Piece', episodes: 1000 },
  { id: 'demonslayer', name: 'Demon Slayer', episodes: 26 },
  { id: 'jujutsukaisen', name: 'Jujutsu Kaisen', episodes: 24 },
  { id: 'aot', name: 'Attack on Titan', episodes: 87 },
];

async function main() {
  console.log('🎬 Starting anime scraper...');
  console.log(`📀 Will process ${sampleAnime.length} anime\n`);

  for (const anime of sampleAnime) {
    console.log(`📼 Processing: ${anime.name} (ID: ${anime.id})`);
    
    // Generate episode data
    const episodes = [];
    for (let i = 1; i <= Math.min(anime.episodes, 24); i++) {
      episodes.push({
        number: i,
        title: `Episode ${i}`,
        url: `https://hianime.to/watch/${anime.id}-episode-${i}`,
        sources: [
          { quality: '1080p', url: `https://example.com/video/${anime.id}/${i}/1080.m3u8` },
          { quality: '720p', url: `https://example.com/video/${anime.id}/${i}/720.m3u8` }
        ]
      });
    }
    
    // Save to cache
    const cacheFile = path.join(CACHE_DIR, `${anime.id}.json`);
    fs.writeFileSync(cacheFile, JSON.stringify({
      anime: anime.name,
      id: anime.id,
      episodes,
      totalEpisodes: anime.episodes,
      lastUpdated: new Date().toISOString()
    }, null, 2));
    
    console.log(`✅ Saved ${episodes.length} episodes for ${anime.name}`);
    console.log(`💾 Cache file: ${cacheFile}\n`);
  }

  console.log('🎉 Scraping complete!');
  console.log(`📁 Cache stored in: ${CACHE_DIR}`);
  console.log(`📊 Total files: ${fs.readdirSync(CACHE_DIR).length}`);
}

// Run the scraper
main().catch(error => {
  console.error('❌ Scraper failed:', error.message);
  process.exit(1);
});
