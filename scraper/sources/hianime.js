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
    
    // Find ALL anime results with titles
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
          const isMain = !isMovie && !isSeason;
          
          animeResults.push({
            slug: slug,
            href: href,
            title: title,
            isMovie: isMovie,
            isSeason: isSeason,
            isMain: isMain,
            slugLength: slug.length
          });
        }
      }
    });
    
    if (animeResults.length === 0) {
      console.log(`⚠️ No anime found for: ${animeId}`);
      return generateMockData(animeId, episodeNum);
    }
    
    // Log all results
    console.log(`  Found ${animeResults.length} results:`);
    animeResults.slice(0, 10).forEach((r, i) => {
      const type = r.isMovie ? '🎬 MOVIE' : r.isSeason ? '📺 SEASON' : '⭐ MAIN';
      console.log(`    ${i + 1}. ${r.title || r.slug} ${type}`);
    });
    
    // Score and pick the best match
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
    
    // Get episode list
    const episodeUrls = [
      `${baseUrl}/category/${animeSlug}`,
      `${baseUrl}/anime/${animeSlug}`,
      `${baseUrl}/series/${animeSlug}`
    ];
    
    let $$ = null;
    let episodePage = null;
    
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
    
    // If specific episode requested, get video source
    if (episodeNum) {
      return await getEpisodeVideoSource($$, animeSlug, episodeNum, baseUrl);
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
        console.log(`  ✅ Found ${episodes.length} episodes from links`);
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
    
    // Method 1: Look for iframe
    $$('iframe').each((i, el) => {
      const src = $$(el).attr('src');
      if (src) {
        const srcClean = src.startsWith('//') ? `https:${src}` : src;
        if (!srcClean.includes('google') && !srcClean.includes('facebook') && !srcClean.includes('twitter') && !srcClean.includes('disqus')) {
          console.log(`  ✅ Found iframe: ${srcClean.substring(0, 80)}...`);
          videoSources.push({
            quality: 'HD',
            url: srcClean
          });
        }
      }
    });
    
    // Method 2: Look for video in script tags
    if (videoSources.length === 0) {
      const scripts = $$('script').map((i, el) => $$(el).html()).get();
      for (const script of scripts) {
        if (script) {
          // Look for various video URL patterns
          const patterns = [
            /['"](https?:\/\/[^'"]+\.m3u8[^'"]*)['"]/i,
            /['"](https?:\/\/[^'"]+\.mp4[^'"]*)['"]/i,
            /['"](https?:\/\/[^'"]+\/embed\/[^'"]+)['"]/i,
            /['"](https?:\/\/[^'"]+\/v\/[^'"]+)['"]/i,
            /data-video=['"]([^'"]+)['"]/i,
            /data-src=['"]([^'"]+)['"]/i,
            /file\s*:\s*['"](https?:\/\/[^'"]+)['"]/i,
            /src\s*:\s*['"](https?:\/\/[^'"]+)['"]/i,
            /url\s*:\s*['"](https?:\/\/[^'"]+)['"]/i
          ];
          
          for (const pattern of patterns) {
            const match = script.match(pattern);
            if (match && !match[1].includes('.jpg') && !match[1].includes('.png') && !match[1].includes('.gif')) {
              console.log(`  ✅ Found video in script: ${match[1].substring(0, 60)}...`);
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
    
    // Method 3: Look for video tag
    if (videoSources.length === 0) {
      $$('video source').each((i, el) => {
        const src = $$(el).attr('src');
        if (src) {
          console.log(`  ✅ Found video source tag: ${src.substring(0, 60)}...`);
          videoSources.push({
            quality: $$(el).attr('data-quality') || 'HD',
            url: src
          });
        }
      });
    }
    
    // Method 4: Look for player container
    if (videoSources.length === 0) {
      const playerSelectors = [
        '.player-container',
        '.video-player',
        '#player',
        '.embed-container',
        '.play-video',
        '.jwplayer',
        '#mediaplayer'
      ];
      
      for (const selector of playerSelectors) {
        const player = $$(selector);
        if (player.length > 0) {
          const html = player.html();
          if (html) {
            const match = html.match(/https?:\/\/[^"'\s]+\.(m3u8|mp4)[^"'\s]*/i);
            if (match) {
              console.log(`  ✅ Found video in player: ${match[0].substring(0, 60)}...`);
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
    
    // Method 5: Check for redirect in script
    if (videoSources.length === 0) {
      const scripts = $$('script').map((i, el) => $$(el).html()).get();
      for (const script of scripts) {
        if (script) {
          const redirectMatch = script.match(/window\.location\s*=\s*['"]([^'"]+)['"]/i);
          if (redirectMatch) {
            console.log(`  🔄 Found redirect, following...`);
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
                  console.log(`  ✅ Found video after redirect`);
                  videoSources.push({
                    quality: 'HD',
                    url: iframeSrc.startsWith('//') ? `https:${iframeSrc}` : iframeSrc
                  });
                }
              }
            } catch (e) {
              console.log(`  Redirect failed: ${e.message}`);
            }
          }
        }
      }
    }
    
    // Return the video source
    if (videoSources.length > 0) {
      // Prefer HLS (.m3u8) or MP4
      const hlsSource = videoSources.find(s => s.url.includes('.m3u8'));
      const mp4Source = videoSources.find(s => s.url.includes('.mp4'));
      const bestSource = hlsSource || mp4Source || videoSources[0];
      
      console.log(`  ✅ Found ${videoSources.length} video sources`);
      console.log(`  📺 Best source: ${bestSource.url.substring(0, 80)}...`);
      
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
