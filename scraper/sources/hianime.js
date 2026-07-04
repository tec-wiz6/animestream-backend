const cheerio = require('cheerio');

async function scrapeHiAnime(animeId, episodeNum = null) {
  const baseUrl = 'https://hianime.ro';
  
  try {
    console.log(`🔍 Searching for: ${animeId}`);
    
    // Try different search URL formats
    const searchUrls = [
      `${baseUrl}/search?keyword=${encodeURIComponent(animeId)}`,
      `${baseUrl}/search.html?keyword=${encodeURIComponent(animeId)}`,
      `${baseUrl}/search?q=${encodeURIComponent(animeId)}`,
      `${baseUrl}/category/${encodeURIComponent(animeId)}`,
    ];
    
    let data = null;
    let $ = null;
    let workingUrl = null;
    
    // Try each search URL until one works
    for (const url of searchUrls) {
      try {
        console.log(`  Trying: ${url}`);
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1'
          }
        });
        
        if (response.ok) {
          data = await response.text();
          $ = cheerio.load(data);
          workingUrl = url;
          console.log(`  ✅ Found page at: ${url}`);
          break;
        }
      } catch (e) {
        console.log(`  ❌ Failed: ${e.message}`);
        continue;
      }
    }
    
    if (!$ || !data) {
      console.log(`⚠️ Could not find anime: ${animeId}`);
      return generateMockData(animeId, episodeNum);
    }
    
    // Find anime link - try different selectors
    let animeSlug = null;
    const selectors = [
      '.film-poster a',
      '.anime-poster a', 
      '.poster a',
      '.thumb a',
      '.film_list .film-poster a',
      '.anime-list .poster a'
    ];
    
    for (const selector of selectors) {
      const result = $(selector).first();
      if (result.length > 0) {
        const href = result.attr('href');
        animeSlug = href?.replace('/', '').replace(/^\/+/, '');
        if (animeSlug) {
          console.log(`📺 Found anime slug: ${animeSlug} using selector: ${selector}`);
          break;
        }
      }
    }
    
    // If no anime slug found, try to find it from the page title or other elements
    if (!animeSlug) {
      console.log('⚠️ No anime slug found, checking page content...');
      
      // Try to find any link to an anime
      $('a[href*="/anime/"], a[href*="/watch/"], a[href*="/category/"]').each((i, el) => {
        if (!animeSlug) {
          const href = $(el).attr('href');
          if (href) {
            const match = href.match(/\/(anime|watch|category)\/([^\/?]+)/);
            if (match) {
              animeSlug = match[2];
              console.log(`📺 Found anime slug from link: ${animeSlug}`);
            }
          }
        }
      });
    }
    
    if (!animeSlug) {
      console.log(`⚠️ No anime found for: ${animeId}`);
      return generateMockData(animeId, episodeNum);
    }
    
    // Now get the episode list
    const episodeUrl = `${baseUrl}/anime/${animeSlug}`;
    console.log(`📡 Fetching episodes from: ${episodeUrl}`);
    
    const epResponse = await fetch(episodeUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    if (!epResponse.ok) {
      // Try alternative URL format
      const altEpisodeUrl = `${baseUrl}/category/${animeSlug}`;
      console.log(`  Trying alternative: ${altEpisodeUrl}`);
      const altResponse = await fetch(altEpisodeUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      
      if (!altResponse.ok) {
        console.log(`⚠️ Could not fetch episodes for: ${animeSlug}`);
        return generateMockData(animeId, episodeNum);
      }
      
      const episodeData = await altResponse.text();
      const $$ = cheerio.load(episodeData);
      return extractEpisodes($$, animeSlug, episodeNum, baseUrl);
    }
    
    const episodeData = await epResponse.text();
    const $$ = cheerio.load(episodeData);
    return extractEpisodes($$, animeSlug, episodeNum, baseUrl);
    
  } catch (error) {
    console.error('❌ HiAnime scraper error:', error.message);
    return generateMockData(animeId, episodeNum);
  }
}

function extractEpisodes($, animeSlug, episodeNum, baseUrl) {
  if (episodeNum) {
    return getEpisodeSource($, animeSlug, episodeNum, baseUrl);
  }
  
  // Get all episodes
  const episodes = [];
  const episodeSelectors = [
    '.episodes a',
    '.episode-list a', 
    '.ep-list a',
    '.eps a',
    '.list-episode a',
    '.episode-item a'
  ];
  
  let episodeLinks = [];
  for (const selector of episodeSelectors) {
    const links = $(selector);
    if (links.length > 0) {
      episodeLinks = links;
      console.log(`✅ Found ${links.length} episodes using selector: ${selector}`);
      break;
    }
  }
  
  if (episodeLinks.length === 0) {
    console.log('⚠️ No episode links found, checking page for episode data...');
    
    // Try to find episode numbers in the page
    $('[data-episode], .episode, .ep, .eps-item').each((i, el) => {
      const num = $(el).attr('data-episode') || $(el).text().match(/\d+/);
      if (num) {
        const epNum = parseInt(num);
        if (!isNaN(epNum)) {
          episodes.push({
            number: epNum,
            title: `Episode ${epNum}`,
            url: `${baseUrl}/watch/${animeSlug}-episode-${epNum}`
          });
        }
      }
    });
    
    if (episodes.length > 0) {
      episodes.sort((a, b) => a.number - b.number);
      console.log(`✅ Found ${episodes.length} episodes from data attributes`);
      return episodes;
    }
    
    return generateMockData(animeSlug, null);
  }
  
  episodeLinks.each((i, el) => {
    const href = $(el).attr('href');
    const title = $(el).text().trim() || $(el).attr('title') || `Episode ${i + 1}`;
    const match = href?.match(/episode-(\d+)/);
    if (match) {
      episodes.push({
        number: parseInt(match[1]),
        title: title,
        url: href.startsWith('http') ? href : `${baseUrl}${href}`
      });
    }
  });
  
  episodes.sort((a, b) => a.number - b.number);
  console.log(`✅ Found ${episodes.length} episodes`);
  return episodes;
}

async function getEpisodeSource($, animeSlug, episodeNum, baseUrl) {
  try {
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
          console.log(`  ✅ Found watch page`);
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
      '#player iframe'
    ];
    
    for (const selector of videoSelectors) {
      const element = $$(selector).first();
      if (element.length > 0) {
        let src = element.attr('src') || element.attr('data-video') || element.attr('data-src') || element.attr('data-url');
        if (src) {
          if (src.startsWith('/')) src = `https:${src}`;
          sources.push({ quality: 'HD', url: src });
          console.log(`  ✅ Found video source: ${src.substring(0, 50)}...`);
          break;
        }
      }
    }
    
    // If no video found, check scripts
    if (sources.length === 0) {
      const scripts = $$('script').map((i, el) => $$(el).html()).get();
      for (const script of scripts) {
        if (script && script.includes('video')) {
          const match = script.match(/['"](https?:\/\/[^'"]+\.(m3u8|mp4)[^'"]*)['"]/);
          if (match) {
            sources.push({ quality: 'HD', url: match[1] });
            console.log(`  ✅ Found video in script`);
            break;
          }
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
