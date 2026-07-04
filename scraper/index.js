// scraper/index.js - EXPORTS SCRAPER FUNCTIONS
const { scrapeHiAnime } = require('./sources/hianime');

async function scrapeAnimeEpisodes(animeId) {
  console.log(`🔍 Scraping episodes for: ${animeId}`);
  try {
    const episodes = await scrapeHiAnime(animeId);
    return episodes;
  } catch (error) {
    console.error(`❌ Scrape failed for ${animeId}:`, error.message);
    // Return mock data as fallback
    const mockEpisodes = [];
    for (let i = 1; i <= 12; i++) {
      mockEpisodes.push({
        number: i,
        title: `Episode ${i}`,
        url: `https://hianime.ro/watch/${animeId}-episode-${i}`
      });
    }
    return mockEpisodes;
  }
}

async function scrapeEpisodeSource(animeId, episodeNum) {
  console.log(`🔍 Getting source for: ${animeId} - Episode ${episodeNum}`);
  try {
    const source = await scrapeHiAnime(animeId, episodeNum);
    return source;
  } catch (error) {
    console.error(`❌ Source fetch failed:`, error.message);
    return {
      url: `https://hianime.ro/watch/${animeId}-episode-${episodeNum}`,
      sources: [
        { quality: '720p', url: `https://example.com/video/${animeId}/${episodeNum}/720.m3u8` }
      ]
    };
  }
}

module.exports = {
  scrapeAnimeEpisodes,
  scrapeEpisodeSource
};
