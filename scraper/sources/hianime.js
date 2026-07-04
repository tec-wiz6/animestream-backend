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
    
    let animeResults = [];
    
    $('.film-poster a, .poster a, .thumb a, .film-list .film-poster a, .anime-item a, .movie-item a').each((i, el) => {
      const href = $(el).attr('href');
      if (href && href.includes('/watch/')) {
        const match = href.match(/\/watch\/([^-]+(?:-[^-]+)*?)(?:-episode-|$)/);
        if (match) {
          const img = $(el).find('img');
          const title = img.attr('alt') || $(el).find('.title').text() || $(el).find('.name').text() || $(el).text().trim() || match[1];
          const slug = match[1];
          
          const titleLower = (title || '').toLowerCase();
          const isMovie = titleLower.includes('movie') || titleLower.includes('film') || titleLower.includes('special');
          const isSeason = titleLower.includes('season') || titleLower.includes('part') || titleLower.includes('arc');
          
          animeResults.push({
            slug: slug,
            href: href,
            title: title,
            isMovie: isMovie,
            isSeason: isSeason,
            slugLength: slug.length
          });
        }
      }
    });
    
    if (animeResults.length === 0) {
      console.log(`⚠️ No anime found for: ${animeId}`);
      return generateMockData(animeId, episodeNum);
    }
    
    console.log(`  Found ${animeResults.length} results:`);
    animeResults.slice(0, 10).forEach((r, i) => {
      const type = r.isMovie ? '🎬 MOVIE' : r.isSeason ? '📺 SEASON' : '⭐ MAIN';
      console.log(`    ${i + 1}. ${r.title || r.slug} ${type}`);
    });
    
    const searchLower = animeId.toLowerCase();
    const searchWords = searchLower.split(' ');
    
    let scoredResults = animeResults.map(result => {
      let score = 0;
      const titleLower = (result.title || '').toLowerCase();
      
      if (!result.isMovie && !result.isSeason) score += 20;
      if (result.isSeason) score += 10;
      if (result.isMovie) score -= 20;
      
      if (titleLower === searchLower) score += 30;
      const allWordsMatch = searchWords.every(word => titleLower.includes(word));
      if (allWordsMatch) score += 15;
      
      if (result.slugLength < 20) score += 5;
      if (result.slugLength < 15) score += 5;
      
      if (!titleLower.includes('movie') && !titleLower.includes('film') && !titleLower.includes('special')) {
        score += 10;
      }
      
      return { ...result, score };
    });
    
    scoredResults.sort((a, b) => b.score - a.score);
    
    const bestMatch = scoredResults[0];
    const animeSlug = bestMatch.slug;
    console.log(`📺 Selected: ${bestMatch.title || animeSlug} (score: ${bestMatch.score})`);
    console.log(`📺 Final anime slug: ${animeSlug}`);
    
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
      return await getEpisodeVideoSource($$, animeSlug, episodeNum, baseUrl);
    }
    
    const episodes = [];
    const episodeSelectors = [
      '.episodes a',
      '.episode-list a',
      '.ep-list a',
      '.eps a',
      '.list-episode a',
      '.episode-item a',
      '.episodes .ep-item a',
      '.episode a',
      '.ep a'
    ];
    
    let episodeLinks = [];
    for (const selector of episodeSelectors) {
      const links = $$(selector);
      if (links.length > 0) {
        episodeLinks = links;
        console.log(`  Found ${links.length} episode links using selector: ${selector}`);
        break;
      }
    }
    
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
      const title = $$(el).text().trim() || $$(el).attr('title') || `Episode ${i + 1}`;
      
      let epNum = null;
      const match = href?.match(/episode-(\d+)/);
      if (match) {
        epNum = parseInt(match[1]);
      } else {
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

// ============================================================
// GET ACTUAL VIDEO SOURCE FROM WATCH PAGE
// ============================================================
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
        'Upgrade-Insecure-Requests': '1'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.text();
    const $$ = cheerio.load(data);
    
    let videoSources = [];
    
    // ============================================================
    // SKIP TRACKING/ANALYTICS URLS
    // ============================================================
    const isTrackingUrl = (url) => {
      if (!url) return true;
      const blocked = [
        'track', 'analytics', 'telemetry', 'stats', 
        'wp-json', 'otakuthemes', 'views', 'api',
        '.jpg', '.png', '.gif', '.webp', '.svg',
        'google-analytics', 'gtag', 'facebook', 'twitter'
      ];
      return blocked.some(b => url.toLowerCase().includes(b));
    };
    
    // ============================================================
    // METHOD 1: Look for the player iframe with data-src attribute
    // ============================================================
    $$('.player iframe, .video-player iframe, #player iframe, .embed-player iframe, .jwplayer iframe').each((i, el) => {
      const src = $$(el).attr('src') || $$(el).attr('data-src');
      if (src && !isTrackingUrl(src)) {
        const cleanSrc = src.startsWith('//') ? `https:${src}` : src;
        console.log(`  ✅ Found player iframe: ${cleanSrc.substring(0, 80)}...`);
        videoSources.push({
          quality: 'HD',
          url: cleanSrc
        });
      }
    });
    
    // ============================================================
    // METHOD 2: Look for the main video iframe
    // ============================================================
    if (videoSources.length === 0) {
      $$('iframe').each((i, el) => {
        const src = $$(el).attr('src') || $$(el).attr('data-src');
        if (src && !isTrackingUrl(src)) {
          const cleanSrc = src.startsWith('//') ? `https:${src}` : src;
          // Check if it's likely a video iframe
          if (cleanSrc.includes('/embed/') || cleanSrc.includes('/v/') || 
              cleanSrc.includes('player') || cleanSrc.includes('video') ||
              cleanSrc.includes('gogo') || cleanSrc.includes('stream')) {
            console.log(`  ✅ Found video iframe: ${cleanSrc.substring(0, 80)}...`);
            videoSources.push({
              quality: 'HD',
              url: cleanSrc
            });
          }
        }
      });
    }
    
    // ============================================================
    // METHOD 3: Look for embed URL in script tags
    // ============================================================
    if (videoSources.length === 0) {
      const scripts = $$('script').map((i, el) => $$(el).html()).get();
      for (const script of scripts) {
        if (script) {
          // Look for embed URLs - prioritize these domains
          const embedPatterns = [
            /https?:\/\/[^\s<>'"]+\.(m3u8|mp4|ts)[^\s<>'"]*/gi,
            /https?:\/\/[^\s<>'"]+\/embed\/[^\s<>'"]*/gi,
            /https?:\/\/[^\s<>'"]+\/v\/[^\s<>'"]*/gi,
            /https?:\/\/[^\s<>'"]+\.gogoanime[^\s<>'"]*/gi,
            /https?:\/\/[^\s<>'"]+\.vidstream[^\s<>'"]*/gi,
            /https?:\/\/[^\s<>'"]+\.mp4upload[^\s<>'"]*/gi,
            /https?:\/\/[^\s<>'"]+\.dood[^\s<>'"]*/gi,
            /https?:\/\/[^\s<>'"]+\.streamtape[^\s<>'"]*/gi,
            /https?:\/\/[^\s<>'"]+\.mcloud[^\s<>'"]*/gi,
          ];
          
          for (const pattern of embedPatterns) {
            let match;
            while ((match = pattern.exec(script)) !== null) {
              let url = match[1] || match[0];
              url = url.replace(/^['"]|['"]$/g, '');
              if (url && !isTrackingUrl(url)) {
                console.log(`  ✅ Found video in script: ${url.substring(0, 80)}...`);
                videoSources.push({
                  quality: 'HD',
                  url: url
                });
              }
            }
          }
          
          if (videoSources.length > 0) break;
        }
      }
    }
    
    // ============================================================
    // METHOD 4: Look for video tag
    // ============================================================
    if (videoSources.length === 0) {
      $$('video source').each((i, el) => {
        const src = $$(el).attr('src');
        if (src && !isTrackingUrl(src)) {
          console.log(`  ✅ Found video source tag: ${src.substring(0, 80)}...`);
          videoSources.push({
            quality: $$(el).attr('data-quality') || 'HD',
            url: src
          });
        }
      });
    }
    
    // ============================================================
    // METHOD 5: Look for data attributes on player container
    // ============================================================
    if (videoSources.length === 0) {
      const playerSelectors = [
        '.player-container',
        '.video-player',
        '#player',
        '.embed-container',
        '.play-video',
        '.jwplayer',
        '#mediaplayer',
        '.video-js',
        '.player'
      ];
      
      for (const selector of playerSelectors) {
        const player = $$(selector);
        if (player.length > 0) {
          const dataVideo = player.attr('data-video') || player.attr('data-src') || player.attr('data-url');
          if (dataVideo && !isTrackingUrl(dataVideo)) {
            console.log(`  ✅ Found video in data attribute: ${dataVideo.substring(0, 80)}...`);
            videoSources.push({
              quality: 'HD',
              url: dataVideo
            });
            break;
          }
          
          const html = player.html();
          if (html) {
            const match = html.match(/https?:\/\/[^"'\s]+\.(m3u8|mp4)[^"'\s]*/i);
            if (match && !isTrackingUrl(match[0])) {
              console.log(`  ✅ Found video in player HTML: ${match[0].substring(0, 80)}...`);
              videoSources.push({
                quality: 'HD',
                url: match[0]
              });
              break;
            }
          }
        }
      }
    }
    
    // ============================================================
    // METHOD 6: Look for gogoanime or similar embed patterns
    // ============================================================
    if (videoSources.length === 0) {
      const scripts = $$('script').map((i, el) => $$(el).html()).get();
      for (const script of scripts) {
        if (script) {
          // Look for specific embed domains
          const domainPatterns = [
            /https?:\/\/[^"']*(gogoanime|gogo|anime)[^"']*\.(m3u8|mp4)[^"']*/gi,
            /https?:\/\/[^"']*(vidstream|mp4upload|dood|streamtape|mcloud)[^"']*/gi,
            /https?:\/\/[^"']*(emb|player|video)[^"']*\.(m3u8|mp4)[^"']*/gi
          ];
          
          for (const pattern of domainPatterns) {
            const match = script.match(pattern);
            if (match && !isTrackingUrl(match[0])) {
              console.log(`  ✅ Found embed URL: ${match[0].substring(0, 80)}...`);
              videoSources.push({
                quality: 'HD',
                url: match[0]
              });
              break;
            }
          }
          if (videoSources.length > 0) break;
        }
      }
    }
    
    // ============================================================
    // METHOD 7: Check for redirect and follow it
    // ============================================================
    if (videoSources.length === 0) {
      const scripts = $$('script').map((i, el) => $$(el).html()).get();
      for (const script of scripts) {
        if (script) {
          const redirectMatch = script.match(/window\.location\s*=\s*['"]([^'"]+)['"]/i);
          if (redirectMatch) {
            const redirectUrl = redirectMatch[1];
            if (!isTrackingUrl(redirectUrl)) {
              console.log(`  🔄 Found redirect: ${redirectUrl.substring(0, 80)}...`);
              try {
                const redirectResponse = await fetch(redirectUrl, {
                  headers: {
                    'User-Agent': 'Mozilla/5.0'
                  }
                });
                if (redirectResponse.ok) {
                  const redirectData = await redirectResponse.text();
                  const redirect$ = cheerio.load(redirectData);
                  const iframeSrc = redirect$('iframe').first().attr('src');
                  if (iframeSrc && !isTrackingUrl(iframeSrc)) {
                    const cleanSrc = iframeSrc.startsWith('//') ? `https:${iframeSrc}` : iframeSrc;
                    console.log(`  ✅ Found video after redirect`);
                    videoSources.push({
                      quality: 'HD',
                      url: cleanSrc
                    });
                    break;
                  }
                }
              } catch (e) {
                console.log(`  Redirect failed: ${e.message}`);
              }
            }
          }
        }
      }
    }
    
    // ============================================================
    // Return the video source
    // ============================================================
    if (videoSources.length > 0) {
      // Remove duplicates and filter out tracking
      const uniqueSources = [];
      const seenUrls = new Set();
      for (const source of videoSources) {
        if (!seenUrls.has(source.url) && !isTrackingUrl(source.url)) {
          seenUrls.add(source.url);
          uniqueSources.push(source);
        }
      }
      
      // Prefer HLS (.m3u8) or MP4
      const hlsSource = uniqueSources.find(s => s.url.includes('.m3u8'));
      const mp4Source = uniqueSources.find(s => s.url.includes('.mp4'));
      const embedSource = uniqueSources.find(s => s.url.includes('/embed/') || s.url.includes('/v/'));
      const bestSource = hlsSource || mp4Source || embedSource || uniqueSources[0];
      
      console.log(`  ✅ Found ${uniqueSources.length} unique video sources`);
      console.log(`  📺 Best source: ${bestSource.url.substring(0, 100)}...`);
      
      return {
        url: bestSource.url,
        sources: uniqueSources,
        watchUrl: watchUrl,
        sourceCount: uniqueSources.length
      };
    }
    
    // ============================================================
    // If no video found, return the watch URL as fallback
    // ============================================================
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
