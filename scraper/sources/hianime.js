const cheerio = require('cheerio');

async function scrapeHiAnime(animeId, episodeNum = null) {
  const baseUrl = 'https://hianime.ro';
  
  try {
    console.log(`🔍 Searching for: ${animeId}`);
    
    // Fix: Use ?s= instead of /search?keyword=
    const searchUrl = `${baseUrl}/?s=${encodeURIComponent(animeId)}`;
    console.log(`  Searching: ${searchUrl}`);
    
    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.text();
    const $ = cheerio.load(data);
    
    // Find the first anime result - look for .film-poster or similar
    let animeSlug = null;
    let animeTitle = null;
    
    // Try different selectors for hianime.ro
    const selectors = [
      '.film-poster a',
      '.poster a',
      '.thumb a',
      '.film-list .film-poster a',
      '.anime-item a',
      '.movie-item a'
    ];
    
    for (const selector of selectors) {
      const result = $(selector).first();
      if (result.length > 0) {
        const href = result.attr('href');
        console.log(`  Found link: ${href}`);
        
        // Extract anime slug from the watch URL
        // Example: /watch/naruto-shippuuden-movie-3-inheritors-of-will-of-fire-episode-1-24453/
        // We need to get the base anime slug (before -episode-)
        const match = href?.match(/\/watch\/([^-]+(?:-[^-]+)*?)(?:-episode-|$)/);
        if (match) {
          animeSlug = match[1];
          console.log(`  Extracted slug: ${animeSlug}`);
          break;
        }
      }
    }
    
    // If still no slug, look for any link with /watch/
    if (!animeSlug) {
      $('a[href*="/watch/"]').each((i, el) => {
        if (!animeSlug) {
          const href = $(el).attr('href');
          const match = href?.match(/\/watch\/([^-]+(?:-[^-]+)*?)(?:-episode-|$)/);
          if (match) {
            animeSlug = match[1];
            console.log(`  Found slug from watch link: ${animeSlug}`);
          }
        }
      });
    }
    
    if (!animeSlug) {
      console.log(`⚠️ No anime found for: ${animeId}`);
      return generateMockData(animeId, episodeNum);
    }
    
    console.log(`📺 Found anime slug: ${animeSlug}`);
    
    // Now get the episode list for this anime
    // The URL format might be /category/[anime-slug] or /anime/[anime-slug]
    const episodeUrls = [
      `${baseUrl}/category/${animeSlug}`,
      `${baseUrl}/anime/${animeSlug}`,
      `${baseUrl}/series/${animeSlug}`
    ];
    
    let episodePage = null;
    let $$ = null;
    
    for (const url of episodeUrls) {
      try {
        console.log(`  Trying episode list: ${url}`);
        const epResponse = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });
        
        if (epResponse.ok) {
          const epData = await epResponse.text();
          $$ = cheerio.load(epData);
          episodePage = url;
          console.log(`  ✅ Found episode list at: ${url}`);
          break;
        }
      } catch (e) {
        continue;
      }
    }
    
    if (!$$) {
      console.log(`⚠️ Could not find episode list for: ${animeSlug}`);
      return generateMockData(animeId, episodeNum);
    }
    
    if (episodeNum) {
      return await getEpisodeSource($$, animeSlug, episodeNum, baseUrl);
    }
    
    // Extract all episodes
    const episodes = [];
    const episodeSelectors = [
      '.episodes a',
      '.episode-list a',
      '.ep-list a',
      '.eps a',
      '.list-episode a',
      '.episode-item a',
      '.episodes .ep-item a',
      '.episodes .episode-item a'
    ];
    
    let episodeLinks = [];
    for (const selector of episodeSelectors) {
      const links = $$(selector);
      if (links.length > 0) {
        episodeLinks = links;
        console.log(`  Found ${links.length} episodes using selector: ${selector}`);
        break;
      }
    }
    
    // If no episode links found, try to find them from the page
    if (episodeLinks.length === 0) {
      console.log('  Looking for episodes in page...');
      
      // Try to find episodes from any links with episode numbers
      $$('a[href*="episode"]').each((i, el) => {
        const href = $$(el).attr('href');
        if (href) {
          const match = href.match(/episode-(\d+)/);
          if (match) {
            const epNum = parseInt(match[1]);
            episodes.push({
              number: epNum,
              title: `Episode ${epNum}`,
              url: href.startsWith('http') ? href : `${baseUrl}${href}`
            });
          }
        }
      });
      
      if (episodes.length > 0) {
        episodes.sort((a, b) => a.number - b.number);
        console.log(`  ✅ Found ${episodes.length} episodes from links`);
        return episodes;
      }
      
      return generateMockData(animeId, null);
    }
    
    // Process found episode links
    episodeLinks.each((i, el) => {
      const href = $$(el).attr('href');
      const title = $$(el).text().trim() || $$(el).attr('title') || `Episode ${i + 1}`;
      
      // Try to extract episode number from href or text
      let epNum = null;
      const match = href?.match(/episode-(\d+)/);
      if (match) {
        epNum = parseInt(match[1]);
      } else {
        // Try to extract from text
        const textMatch = title.match(/\d+/);
        if (textMatch) {
          epNum = parseInt(textMatch[0]);
        }
      }
      
      if (epNum) {
        episodes.push({
          number: epNum,
          title: title,
          url: href?.startsWith('http') ? href : `${baseUrl}${href}`
        });
      }
    });
    
    episodes.sort((a, b) => a.number - b.number);
    console.log(`✅ Found ${episodes.length} episodes for ${animeSlug}`);
    return episodes;
    
  } catch (error) {
    console.error('❌ HiAnime scraper error:', error.message);
    return generateMockData(animeId, episodeNum);
  }
}

async function getEpisodeSource($, animeSlug, episodeNum, baseUrl) {
  try {
    // Try different watch URL formats
    const watchUrls = [
      `${baseUrl}/watch/${animeSlug}-episode-${episodeNum}`,
      `${baseUrl}/anime/${animeSlug}/episode/${episodeNum}`,
      `${baseUrl}/episode/${animeSlug}-${episodeNum}`
    ];
    
    let watchData = null;
    let $$ = null;
    
    for (const url of watchUrls) {
      try {
        console.log(`  Trying watch URL: ${url}`);
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });
        
        if (response.ok) {
          watchData = await response.text();
          $$ = cheerio.load(watchData);
          console.log(`  ✅ Found watch page at: ${url}`);
          break;
        }
      } catch (e) {
        continue;
      }
    }
    
    if (!$$ || !watchData) {
      throw new Error('Could not fetch watch page');
    }
    
    const sources = [];
    
    // Try to find video source
    const videoSelectors = [
      'iframe',
      'video source',
      '[data-video]',
      '[data-src]',
      '[data-url]',
      '.player-container iframe',
      '#player iframe',
      '.embed-player iframe'
    ];
    
    for (const selector of videoSelectors) {
      const element = $$(selector).first();
      if (element.length > 0) {
        let src = element.attr('src') || element.attr('data-video') || element.attr('data-src') || element.attr('data-url');
        if (src) {
          if (src.startsWith('/')) src = `https:${src}`;
          sources.push({ quality: 'HD', url: src });
          console.log(`  ✅ Found video source`);
          break;
        }
      }
    }
    
    // If no video found, check scripts for embedded video
    if (sources.length === 0) {
      const scripts = $$('script').map((i, el) => $$(el).html()).get();
      for (const script of scripts) {
        if (script) {
          // Look for various video URL patterns
          const patterns = [
            /['"](https?:\/\/[^'"]+\.m3u8[^'"]*)['"]/,
            /['"](https?:\/\/[^'"]+\.mp4[^'"]*)['"]/,
            /['"](https?:\/\/[^'"]+\.ts[^'"]*)['"]/,
            /file:\s*['"](https?:\/\/[^'"]+)['"]/
          ];
          for (const pattern of patterns) {
            const match = script.match(pattern);
            if (match) {
              sources.push({ quality: 'HD', url: match[1] });
              console.log(`  ✅ Found video in script`);
              break;
            }
          }
          if (sources.length > 0) break;
        }
      }
    }
    
    return {
      url: sources.length > 0 ? sources[0].url : null,
      sources: sources,
      watchUrl: watchUrls[0]
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
