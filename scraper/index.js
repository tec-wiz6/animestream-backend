const { scrapeHiAnime } = require('./sources/hianime');
const { scrapeGogoAnime } = require('./sources/gogoanime');

// Try multiple sources in case one fails
async function scrapeAnimeEpisodes(animeId) {
  try {
    // Try HiAnime first
    return await scrapeHiAnime(animeId);
  } catch (error) {
    console.log('HiAnime failed, trying GogoAnime...', error.message);
    try {
      return await scrapeGogoAnime(animeId);
    } catch (e) {
      throw new Error('All sources failed');
    }
  }
}

async function scrapeEpisodeSource(animeId, episodeNum) {
  try {
    return await scrapeHiAnime(animeId, episodeNum);
  } catch (error) {
    console.log('HiAnime failed, trying GogoAnime...', error.message);
    try {
      return await scrapeGogoAnime(animeId, episodeNum);
    } catch (e) {
      throw new Error('All sources failed');
    }
  }
}

module.exports = {
  scrapeAnimeEpisodes,
  scrapeEpisodeSource
};
