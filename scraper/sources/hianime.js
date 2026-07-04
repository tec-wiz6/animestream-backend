const axios = require('axios');
const cheerio = require('cheerio');

async function scrapeHiAnime(animeId, episodeNum = null) {
  // Using hianime.ro instead of .to
  const baseUrl = 'https://hianime.ro';
  
  try {
    console.log(`🔍 Searching for: ${animeId} on ${baseUrl}`);
    
    // Step 1: Search for the anime
    const searchUrl = `${baseUrl}/search?keyword=${encodeURIComponent(animeId)}`;
    const { data } = await axios.get(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      }
    });
    
    const $ = cheerio.load(data);
    
    // Find first anime result
    const firstResult = $('.film-poster a').first();
    const animeSlug = firstResult.attr('href')?.replace('/', '');
    
    if (!animeSlug) {
      console.log(`⚠️ No results found for: ${animeId}`);
      // Return mock data if not found
      return generateMockData(animeId, episodeNum);
    }
    
    console.log(`📺 Found anime: ${animeSlug}`);
    
    // Step 2: Get episode list
    const episodeUrl = `${baseUrl}/${animeSlug}`;
    console.log(`📡 Fetching episodes from: ${episodeUrl}`);
    
    const { data: episodeData } = await axios.get(episodeUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    const $$ = cheerio.load(episodeData);
    
    // If we want a specific episode's video source
    if (episodeNum) {
      return await getEpisodeSource($$, animeSlug, episodeNum, baseUrl);
    }
    
    // Get all episodes
    const episodes = [];
    
    // Try different selectors - hianime might use different classes
    const episodeLinks = $$('.episodes a, .episode-list a, .ep-list a, .eps a');
    
    if (episodeLinks.length === 0) {
      console.log('⚠️ No episode links found, generating mock data');
      return generateMockData(animeSlug, null);
    }
    
    episodeLinks.each((i, el) => {
      const href = $$(el).attr('href');
      const title = $$(el).text().trim() || $$(el).attr('title') || `Episode ${i + 1}`;
      const match = href?.match(/episode-(\d+)/);
      if (match) {
        episodes.push({
          number: parseInt(match[1]),
          title: title,
          url: `${baseUrl}${href}`
        });
      }
    });
    
    // Sort episodes by number
    episodes.sort((a, b) => a.number - b.number);
    
    console.log(`✅ Found ${episodes.length} episodes`);
    return episodes;
    
  } catch (error) {
    console.error('❌ HiAnime scraper error:', error.message);
    // Return mock data on error
    return generateMockData(animeId, episodeNum);
  }
}

// Function to get episode video source
async function getEpisodeSource($, animeSlug, episodeNum, baseUrl) {
  try {
    const watchUrl = `${baseUrl}/${animeSlug}-episode-${episodeNum}`;
    console.log(`📺 Fetching video source: ${watchUrl}`);
    
    const { data: watchData } = await axios.get(watchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    const $$$ = cheerio.load(watchData);
    
    // Try to find video sources
    const sources = [];
    
    // Look for iframe
    const iframe = $$$('iframe').first();
    let videoUrl = iframe.attr('src');
    if (videoUrl && videoUrl.startsWith('/')) {
      videoUrl = `https:${videoUrl}`;
    }
    
    // Look for video sources in data attributes
    $$$('[data-video], [data-src], [data-url]').each((i, el) => {
      const src = $$$(el).attr('data-video') || $$$(el).attr('data-src') || $$$(el).attr('data-url');
      if (src) {
        sources.push({ quality: 'HD', url: src });
      }
    });
    
    // Look for source tags
    $$$('source').each((i, el) => {
      const src = $$$(el).attr('src');
      const quality = $$$(el).attr('data-quality') || `${i + 1}p`;
      if (src) {
        sources.push({ quality, url: src });
      }
    });
    
    // Check script tags for video URLs
    const scripts = $$$('script').map((i, el) => $$$(el).html()).get();
    for (const script of scripts) {
      if (script && script.includes('video')) {
        // Look for various video URL patterns
        const patterns = [
          /['"](https?:\/\/[^'"]+\.m3u8[^'"]*)['"]/,
          /['"](https?:\/\/[^'"]+\.mp4[^'"]*)['"]/,
          /['"](https?:\/\/[^'"]+\.ts[^'"]*)['"]/
        ];
        for (const pattern of patterns) {
          const match = script.match(pattern);
          if (match) {
            sources.push({ quality: 'HD', url: match[1] });
            break;
          }
        }
      }
    }
    
    return {
      url: videoUrl || (sources.length > 0 ? sources[0].url : null),
      sources: sources,
      watchUrl: watchUrl
    };
    
  } catch (error) {
    console.error('❌ Failed to get episode source:', error.message);
    return {
      url: null,
      sources: [{ quality: '720p', url: `https://example.com/video/${animeSlug}/${episodeNum}/720.m3u8` }],
      error: error.message
    };
  }
}

// Generate mock data when scraping fails
function generateMockData(animeId, episodeNum) {
  if (episodeNum) {
    return {
      url: `https://hianime.ro/watch/${animeId}-episode-${episodeNum}`,
      sources: [
        { quality: '1080p', url: `https://example.com/video/${animeId}/${episodeNum}/1080.m3u8` },
        { quality: '720p', url: `https://example.com/video/${animeId}/${episodeNum}/720.m3u8` }
      ],
      watchUrl: `https://hianime.ro/watch/${animeId}-episode-${episodeNum}`
    };
  }
  
  const episodes = [];
  for (let i = 1; i <= 24; i++) {
    episodes.push({
      number: i,
      title: `Episode ${i}`,
      url: `https://hianime.ro/watch/${animeId}-episode-${i}`
    });
  }
  return episodes;
}

module.exports = { scrapeHiAnime };
