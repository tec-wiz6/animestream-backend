const cheerio = require('cheerio');

async function scrapeHiAnime(animeId, episodeNum = null) {
  const baseUrl = 'https://hianime.ro';
  
  try {
    console.log(`🔍 Searching for: ${animeId}`);
    
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
    
    // Find ALL anime results
    let animeResults = [];
    
    $('.film-poster a, .poster a, .thumb a').each((i, el) => {
      const href = $(el).attr('href');
      if (href && href.includes('/watch/')) {
        const match = href.match(/\/watch\/([^-]+(?:-[^-]+)*?)(?:-episode-|$)/);
        if (match) {
          const img = $(el).find('img');
          const title = img.attr('alt') || $(el).find('.title').text() || $(el).text().trim() || match[1];
          const slug = match[1];
          
          animeResults.push({
            slug: slug,
            href: href,
            title: title,
            isMovie: title?.toLowerCase().includes('movie') || title?.toLowerCase().includes('film')
          });
        }
      }
    });
    
    if (animeResults.length === 0) {
      console.log(`⚠️ No anime found for: ${animeId}`);
      return generateMockData(animeId, episodeNum);
    }
    
    // Find best match (prefer main series, not movies)
    let bestMatch = animeResults.find(r => !r.isMovie) || animeResults[0];
    const animeSlug = bestMatch.slug;
    console.log(`📺 Selected: ${bestMatch.title || animeSlug}`);
    
    // Get episode list
    const episodeUrls = [
      `${baseUrl}/category/${animeSlug}`,
      `${baseUrl}/anime/${animeSlug}`,
      `${baseUrl}/series/${animeSlug}`
    ];
    
    let $$ = null;
    for (const url of episodeUrls) {
      try {
        const epResponse = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });
        
        if (epResponse.ok) {
          const epData = await epResponse.text();
          $$ = cheerio.load(epData);
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
      // Get specific episode video source
      return await getEpisodeVideoSource($$, animeSlug, episodeNum, baseUrl);
    }
    
    // Extract all episodes
    const episodes = [];
    const episodeLinks = $$('.episodes a, .episode-list a, .ep-list a, .eps a, .ep a');
    
    if (episodeLinks.length === 0) {
      console.log('  Looking for episodes in page...');
      $$('a[href*="episode"]').each((i, el) => {
        const href = $$(el).attr('href');
        if (href) {
          const match = href.match(/episode-(\d+)/);
          if (match) {
            episodes.push({
              number: parseInt(match[1]),
              title: `Episode ${match[1]}`,
              url: href.startsWith('http') ? href : `${baseUrl}${href}`
            });
          }
        }
      });
      
      if (episodes.length > 0) {
        episodes.sort((a, b) => a.number - b.number);
        return episodes;
      }
      return generateMockData(animeId, null);
    }
    
    episodeLinks.each((i, el) => {
      const href = $$(el).attr('href');
      const match = href?.match(/episode-(\d+)/);
      if (match) {
        episodes.push({
          number: parseInt(match[1]),
          title: `Episode ${match[1]}`,
          url: href.startsWith('http') ? href : `${baseUrl}${href}`
        });
      }
    });
    
    episodes.sort((a, b) => a.number - b.number);
    console.log(`✅ Found ${episodes.length} episodes`);
    return episodes;
    
  } catch (error) {
    console.error('❌ HiAnime scraper error:', error.message);
    return generateMockData(animeId, episodeNum);
  }
}

// NEW: Get actual video source from the watch page
async function getEpisodeVideoSource($, animeSlug, episodeNum, baseUrl) {
  try {
    const watchUrl = `${baseUrl}/watch/${animeSlug}-episode-${episodeNum}`;
    console.log(`📺 Getting video source from: ${watchUrl}`);
    
    const response = await fetch(watchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Referer': baseUrl,
        'Sec-Fetch-Dest': 'iframe',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'same-origin',
        'Upgrade-Insecure-Requests': '1'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.text();
    const $$ = cheerio.load(data);
    
    // LOOK FOR THE VIDEO IFRAME
    let videoSources = [];
    
    // Method 1: Look for iframe that contains the video player
    $$('iframe').each((i, el) => {
      const src = $$(el).attr('src');
      if (src && !src.includes('google') && !src.includes('facebook') && !src.includes('twitter')) {
        console.log(`  Found iframe: ${src}`);
        videoSources.push({
          quality: 'HD',
          url: src.startsWith('//') ? `https:${src}` : src
        });
      }
    });
    
    // Method 2: Look for video player embed URL in script tags
    if (videoSources.length === 0) {
      const scripts = $$('script').map((i, el) => $$(el).html()).get();
      for (const script of scripts) {
        if (script) {
          // Look for embed URL patterns
          const embedPatterns = [
            /['"](https?:\/\/[^'"]+\.(m3u8|mp4)[^'"]*)['"]/i,
            /['"](https?:\/\/[^'"]+\/embed\/[^'"]+)['"]/i,
            /['"](https?:\/\/[^'"]+\/v\/[^'"]+)['"]/i,
            /data-video=['"]([^'"]+)['"]/i,
            /data-src=['"]([^'"]+)['"]/i
          ];
          
          for (const pattern of embedPatterns) {
            const match = script.match(pattern);
            if (match) {
              console.log(`  Found video URL in script: ${match[1]}`);
              videoSources.push({
                quality: 'HD',
                url: match[1]
              });
              break;
            }
          }
          if (videoSources.length > 0) break;
        }
      }
    }
    
    // Method 3: Look for video source in data attributes
    if (videoSources.length === 0) {
      $$('[data-video], [data-src], [data-url]').each((i, el) => {
        const src = $$(el).attr('data-video') || $$(el).attr('data-src') || $$(el).attr('data-url');
        if (src && !src.includes('image') && !src.includes('jpg') && !src.includes('png')) {
          console.log(`  Found video in data attribute: ${src}`);
          videoSources.push({
            quality: 'HD',
            url: src
          });
        }
      });
    }
    
    // Method 4: Check for video tag
    if (videoSources.length === 0) {
      $$('video source').each((i, el) => {
        const src = $$(el).attr('src');
        if (src) {
          console.log(`  Found video source tag: ${src}`);
          videoSources.push({
            quality: $$(el).attr('data-quality') || 'HD',
            url: src
          });
        }
      });
    }
    
    // Method 5: Try to find the player container and extract embed URL
    if (videoSources.length === 0) {
      // Look for common player containers
      const playerSelectors = [
        '.player-container',
        '.video-player',
        '#player',
        '.embed-container',
        '.play-video'
      ];
      
      for (const selector of playerSelectors) {
        const player = $$(selector);
        if (player.length > 0) {
          const html = player.html();
          const match = html?.match(/https?:\/\/[^"'\s]+\.(m3u8|mp4)[^"'\s]*/i);
          if (match) {
            console.log(`  Found video in player: ${match[0]}`);
            videoSources.push({
              quality: 'HD',
              url: match[0]
            });
            break;
          }
        }
      }
    }
    
    // If still no video, check if there's a redirect to an external player
    if (videoSources.length === 0) {
      // Check for redirect scripts
      const scripts = $$('script').map((i, el) => $$(el).html()).get();
      for (const script of scripts) {
        if (script) {
          const redirectMatch = script.match(/window\.location\s*=\s*['"]([^'"]+)['"]/i);
          if (redirectMatch) {
            console.log(`  Found redirect: ${redirectMatch[1]}`);
            // Try to fetch the redirect URL
            try {
              const redirectResponse = await fetch(redirectMatch[1], {
                headers: {
                  'User-Agent': 'Mozilla/5.0'
                }
              });
              if (redirectResponse.ok) {
                const redirectData = await redirectResponse.text();
                const redirect$ = cheerio.load(redirectData);
                const iframeSrc = redirect$('iframe').first().attr('src');
                if (iframeSrc) {
                  videoSources.push({
                    quality: 'HD',
                    url: iframeSrc
                  });
                }
              }
            } catch (e) {
              console.log(`  Redirect fetch failed: ${e.message}`);
            }
          }
        }
      }
    }
    
    // Return the video source
    if (videoSources.length > 0) {
      // Prefer .m3u8 or .mp4 URLs
      const hlsSource = videoSources.find(s => s.url.includes('.m3u8'));
      const mp4Source = videoSources.find(s => s.url.includes('.mp4'));
      const bestSource = hlsSource || mp4Source || videoSources[0];
      
      return {
        url: bestSource.url,
        sources: videoSources,
        watchUrl: watchUrl,
        sourceCount: videoSources.length
      };
    }
    
    // If no video found, return the watch URL as fallback
    console.log(`⚠️ No video source found, returning watch URL`);
    return {
      url: watchUrl,
      sources: [{ quality: 'HD', url: watchUrl }],
      watchUrl: watchUrl,
      fallback: true
    };
    
  } catch (error) {
    console.error('❌ Error getting video source:', error.message);
    return {
      url: `https://hianime.ro/watch/${animeSlug}-episode-${episodeNum}`,
      sources: [{ quality: 'HD', url: `https://hianime.ro/watch/${animeSlug}-episode-${episodeNum}` }],
      error: error.message
    };
  }
}

function generateMockData(animeId, episodeNum) {
  if (episodeNum) {
    return {
      url: `https://hianime.ro/watch/${animeId}-episode-${episodeNum}`,
      sources: [
        { quality: 'HD', url: `https://hianime.ro/watch/${animeId}-episode-${episodeNum}` }
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
