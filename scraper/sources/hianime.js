// scraper/hianime.js
const cheerio = require('cheerio');
const fetch = require('node-fetch'); // ensure this is installed in your backend

const BASE_URL = 'https://hianime.ro';

// ============================================================
// MAIN SCRAPER ENTRY
// ============================================================
async function scrapeHiAnime(animeId, episodeNum = null) {
  try {
    console.log(`🔍 Searching for: ${animeId}`);

    const searchUrl = `${BASE_URL}/?s=${encodeURIComponent(animeId)}`;
    console.log(`  Searching: ${searchUrl}`);

    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept':
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      }
    });

    if (!response.ok) {
      throw new Error(`Search HTTP error! status: ${response.status}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // ============================================================
    // COLLECT SEARCH RESULTS
    // ============================================================
    const animeResults = [];

    $('.film-poster a, .poster a, .thumb a, .film-list .film-poster a, .anime-item a, .movie-item a').each(
      (i, el) => {
        const href = $(el).attr('href');
        if (!href) return;

        if (!href.includes('/watch/')) return;

        const match = href.match(/\/watch\/([^-]+(?:-[^-]+)*?)(?:-episode-|$)/);
        if (!match) return;

        const img = $(el).find('img');
        const title =
          img.attr('alt') ||
          $(el).find('.title').text() ||
          $(el).find('.name').text() ||
          $(el).text().trim() ||
          match[1];

        const slug = match[1];
        const titleLower = (title || '').toLowerCase();

        const isMovie =
          titleLower.includes('movie') ||
          titleLower.includes('film') ||
          titleLower.includes('special');

        const isSeason =
          titleLower.includes('season') ||
          titleLower.includes('part') ||
          titleLower.includes('arc');

        animeResults.push({
          slug,
          href,
          title,
          isMovie,
          isSeason,
          slugLength: slug.length
        });
      }
    );

    if (animeResults.length === 0) {
      console.log(`⚠️ No anime found for: ${animeId}`);
      return generateMockData(animeId, episodeNum);
    }

    console.log(`  Found ${animeResults.length} results:`);
    animeResults.slice(0, 10).forEach((r, i) => {
      const type = r.isMovie ? '🎬 MOVIE' : r.isSeason ? '📺 SEASON' : '⭐ MAIN';
      console.log(`    ${i + 1}. ${r.title || r.slug} ${type}`);
    });

    // ============================================================
    // SCORE RESULTS
    // ============================================================
    const searchLower = animeId.toLowerCase();
    const searchWords = searchLower.split(/\s+/).filter(Boolean);

    const scoredResults = animeResults.map((result) => {
      let score = 0;
      const titleLower = (result.title || '').toLowerCase();

      if (!result.isMovie && !result.isSeason) score += 20;
      if (result.isSeason) score += 10;
      if (result.isMovie) score -= 20;

      if (titleLower === searchLower) score += 30;

      const allWordsMatch = searchWords.every((word) =>
        titleLower.includes(word)
      );
      if (allWordsMatch) score += 15;

      if (result.slugLength < 20) score += 5;
      if (result.slugLength < 15) score += 5;

      if (
        !titleLower.includes('movie') &&
        !titleLower.includes('film') &&
        !titleLower.includes('special')
      ) {
        score += 10;
      }

      return { ...result, score };
    });

    scoredResults.sort((a, b) => b.score - a.score);
    const bestMatch = scoredResults[0];
    const animeSlug = bestMatch.slug;

    console.log(
      `📺 Selected: ${bestMatch.title || animeSlug} (score: ${bestMatch.score})`
    );
    console.log(`📺 Final anime slug: ${animeSlug}`);

    // ============================================================
    // FIND EPISODE LIST PAGE
    // ============================================================
    const episodeUrls = [
      `${BASE_URL}/category/${animeSlug}`,
      `${BASE_URL}/anime/${animeSlug}`,
      `${BASE_URL}/series/${animeSlug}`,
      `${BASE_URL}/watch/${animeSlug}` // extra fallback
    ];

    let $$ = null;
    let epUrlUsed = null;

    for (const url of episodeUrls) {
      try {
        const epResponse = await fetch(url, {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });

        if (!epResponse.ok) {
          console.log(
            `  ⚠️ Episode list HTTP status ${epResponse.status} at ${url}`
          );
          continue;
        }

        const epHtml = await epResponse.text();
        $$ = cheerio.load(epHtml);
        epUrlUsed = url;
        console.log(`  ✅ Found episode list at: ${url}`);
        break;
      } catch (e) {
        console.log(`  ⚠️ Error fetching episode list at ${url}: ${e.message}`);
        continue;
      }
    }

    if (!$$) {
      console.log(`⚠️ Could not find episode list for: ${animeSlug}`);
      return generateMockData(animeId, episodeNum);
    }

    // If frontend asked for a specific episode source:
    if (episodeNum) {
      console.log(`  Testing episode ${episodeNum} video source...`);
      const video = await getEpisodeVideoSource(animeSlug, episodeNum);
      return video;
    }

    // ============================================================
    // COLLECT EPISODE LINKS
    // ============================================================
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
      '.ep a',
      'a[href*="episode-"]' // generic fallback
    ];

    let episodeLinks = null;

    for (const selector of episodeSelectors) {
      const links = $$(selector);
      if (links && links.length > 0) {
        episodeLinks = links;
        console.log(
          `  Found ${links.length} episode links using selector: ${selector}`
        );
        break;
      }
    }

    if (!episodeLinks || episodeLinks.length === 0) {
      console.log(
        '  No structured episode list found, scanning for episode-XX in href...'
      );
      $$( 'a[href*="episode-"]' ).each((i, el) => {
        const href = $$(el).attr('href');
        if (!href) return;

        const match = href.match(/episode-(\d+)/);
        if (!match) return;

        const number = parseInt(match[1], 10);
        episodes.push({
          number,
          title: `Episode ${number}`,
          url: href.startsWith('http') ? href : `${BASE_URL}${href}`
        });
      });

      if (episodes.length === 0) {
        console.log(
          '  ⚠️ Still no episodes found, returning mock data instead.'
        );
        return generateMockData(animeId, null);
      }

      episodes.sort((a, b) => a.number - b.number);
      console.log(`✅ Found ${episodes.length} episodes for ${animeSlug}`);
      return episodes;
    }

    episodeLinks.each((i, el) => {
      const href = $$(el).attr('href');
      if (!href) return;

      const rawTitle =
        $$(el).text().trim() ||
        $$(el).attr('title') ||
        `Episode ${i + 1}`;

      let epNum = null;
      const hrefMatch = href.match(/episode-(\d+)/);
      if (hrefMatch) {
        epNum = parseInt(hrefMatch[1], 10);
      } else {
        const textMatch = rawTitle.match(/\d+/);
        if (textMatch) {
          epNum = parseInt(textMatch[0], 10);
        }
      }

      if (!epNum) return;

      episodes.push({
        number: epNum,
        title: rawTitle,
        url: href.startsWith('http') ? href : `${BASE_URL}${href}`
      });
    });

    episodes.sort((a, b) => a.number - b.number);
    console.log(`✅ Found ${episodes.length} episodes for ${animeSlug}`);
    return episodes;
  } catch (err) {
    console.error('❌ HiAnime scraper error:', err.message);
    return generateMockData(animeId, episodeNum);
  }
}

// ============================================================
// GET ACTUAL VIDEO SOURCE FROM WATCH PAGE (IMPROVED)
// ============================================================
async function getEpisodeVideoSource(animeSlug, episodeNum) {
  const watchUrl = `${BASE_URL}/watch/${animeSlug}-episode-${episodeNum}`;
  console.log(`📺 Getting video source from: ${watchUrl}`);

  try {
    const response = await fetch(watchUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept':
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Connection': 'keep-alive',
        'Referer': BASE_URL,
        'Upgrade-Insecure-Requests': '1'
      }
    });

    if (!response.ok) {
      throw new Error(`Watch HTTP error! status: ${response.status}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    const videoSources = [];

    // Helper: skip obvious tracking/non-video URLs
    const isTrackingUrl = (url) => {
      if (!url) return true;
      const blocked = [
        'track',
        'analytics',
        'telemetry',
        'stats',
        'wp-json',
        'otakuthemes',
        'views',
        'api',
        '.jpg',
        '.jpeg',
        '.png',
        '.gif',
        '.webp',
        '.svg',
        'google-analytics',
        'gtag',
        'facebook',
        'twitter'
      ];
      return blocked.some((b) => url.toLowerCase().includes(b));
    };

    // ============================================================
    // METHOD 1: Specific player iframes
    // ============================================================
    $('.player iframe, .video-player iframe, #player iframe, .embed-player iframe, .jwplayer iframe').each(
      (i, el) => {
        const src = $(el).attr('src') || $(el).attr('data-src');
        if (!src) return;
        if (isTrackingUrl(src)) return;

        const cleanSrc = src.startsWith('//') ? `https:${src}` : src;
        console.log(
          `  ✅ Found player iframe: ${cleanSrc.substring(0, 100)}...`
        );
        videoSources.push({
          quality: 'HD',
          url: cleanSrc
        });
      }
    );

    // ============================================================
    // METHOD 2: Any iframe that looks like video
    // ============================================================
    if (videoSources.length === 0) {
      $('iframe').each((i, el) => {
        const src = $(el).attr('src') || $(el).attr('data-src');
        if (!src) return;
        if (isTrackingUrl(src)) return;

        const cleanSrc = src.startsWith('//') ? `https:${src}` : src;

        if (
          cleanSrc.includes('/embed/') ||
          cleanSrc.includes('/v/') ||
          cleanSrc.toLowerCase().includes('player') ||
          cleanSrc.toLowerCase().includes('video') ||
          cleanSrc.toLowerCase().includes('stream') ||
          cleanSrc.toLowerCase().includes('gogo')
        ) {
          console.log(
            `  ✅ Found generic video iframe: ${cleanSrc.substring(0, 100)}...`
          );
          videoSources.push({
            quality: 'HD',
            url: cleanSrc
          });
        }
      });
    }

    // ============================================================
    // METHOD 3: Video URLs inside script tags
    // ============================================================
    if (videoSources.length === 0) {
      const scripts = $('script')
        .map((i, el) => $(el).html())
        .get();

      const embedPatterns = [
        /https?:\/\/[^\s<>'"]+\.(m3u8|mp4|ts)[^\s<>'"]*/gi,
        /https?:\/\/[^\s<>'"]+\/embed\/[^\s<>'"]*/gi,
        /https?:\/\/[^\s<>'"]+\/v\/[^\s<>'"]*/gi
      ];

      for (const script of scripts) {
        if (!script) continue;

        for (const pattern of embedPatterns) {
          let match;
          while ((match = pattern.exec(script)) !== null) {
            let url = match[0];
            url = url.replace(/^['"]|['"]$/g, '');
            if (!url || isTrackingUrl(url)) continue;

            console.log(
              `  ✅ Found video in script: ${url.substring(0, 100)}...`
            );
            videoSources.push({
              quality: 'HD',
              url
            });
          }
        }

        if (videoSources.length > 0) break;
      }
    }

    // ============================================================
    // METHOD 4: <video><source> tags
    // ============================================================
    if (videoSources.length === 0) {
      $('video source').each((i, el) => {
        const src = $(el).attr('src');
        if (!src) return;
        if (isTrackingUrl(src)) return;

        console.log(
          `  ✅ Found <video> source: ${src.substring(0, 100)}...`
        );
        videoSources.push({
          quality: $(el).attr('data-quality') || 'HD',
          url: src
        });
      });
    }

    // ============================================================
    // METHOD 5: Player container data attributes / inner HTML
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
        const player = $(selector);
        if (!player || player.length === 0) continue;

        const dataVideo =
          player.attr('data-video') ||
          player.attr('data-src') ||
          player.attr('data-url');
        if (dataVideo && !isTrackingUrl(dataVideo)) {
          console.log(
            `  ✅ Found video in data attribute: ${dataVideo.substring(0, 100)}...`
          );
          videoSources.push({
            quality: 'HD',
            url: dataVideo
          });
          break;
        }

        const html = player.html();
        if (!html) continue;

        const match = html.match(
          /https?:\/\/[^"'\s]+\.(m3u8|mp4)[^"'\s]*/i
        );
        if (match && !isTrackingUrl(match[0])) {
          console.log(
            `  ✅ Found video in player HTML: ${match[0].substring(0, 100)}...`
          );
          videoSources.push({
            quality: 'HD',
            url: match[0]
          });
          break;
        }
      }
    }

    // ============================================================
    // METHOD 6: Extra domain-based patterns
    // ============================================================
    if (videoSources.length === 0) {
      const scripts = $('script')
        .map((i, el) => $(el).html())
        .get();

      const domainPatterns = [
        /https?:\/\/[^"']*(gogoanime|gogo|anime)[^"']*\.(m3u8|mp4)[^"']*/gi,
        /https?:\/\/[^"']*(vidstream|mp4upload|dood|streamtape|mcloud)[^"']*/gi,
        /https?:\/\/[^"']*(emb|player|video)[^"']*\.(m3u8|mp4)[^"']*/gi
      ];

      for (const script of scripts) {
        if (!script) continue;

        for (const pattern of domainPatterns) {
          const match = script.match(pattern);
          if (match && !isTrackingUrl(match[0])) {
            console.log(
              `  ✅ Found domain embed URL: ${match[0].substring(0, 100)}...`
            );
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

    // ============================================================
    // FINAL SELECTION
    // ============================================================
    if (videoSources.length > 0) {
      const uniqueSources = [];
      const seen = new Set();

      for (const src of videoSources) {
        if (!src.url || isTrackingUrl(src.url)) continue;
        if (seen.has(src.url)) continue;
        seen.add(src.url);
        uniqueSources.push(src);
      }

      const hls = uniqueSources.find((s) => s.url.includes('.m3u8'));
      const mp4 = uniqueSources.find((s) => s.url.includes('.mp4'));
      const embed = uniqueSources.find(
        (s) =>
          s.url.includes('/embed/') ||
          s.url.includes('/v/') ||
          s.url.toLowerCase().includes('player')
      );

      const bestSource = hls || mp4 || embed || uniqueSources[0];

      console.log(
        `  ✅ Found ${uniqueSources.length} unique video sources`
      );
      console.log(
        `  📺 Best source: ${bestSource.url.substring(0, 120)}...`
      );

      return {
        url: bestSource.url,
        sources: uniqueSources,
        watchUrl,
        sourceCount: uniqueSources.length
      };
    }

    // No direct source found → clear fallback
    console.log(
      `⚠️ No video source found in HTML, returning watch URL as fallback`
    );
    return {
      url: watchUrl,
      sources: [{ quality: 'HD', url: watchUrl }],
      watchUrl,
      fallback: true
    };
  } catch (err) {
    console.error('❌ Error getting video source:', err.message);
    return {
      url: watchUrl,
      sources: [{ quality: 'HD', url: watchUrl }],
      watchUrl,
      error: err.message
    };
  }
}

// ============================================================
// MOCK DATA (fallback when site structure breaks)
// ============================================================
function generateMockData(animeId, episodeNum) {
  if (episodeNum) {
    const watchUrl = `${BASE_URL}/watch/${animeId}-episode-${episodeNum}`;
    return {
      url: watchUrl,
      sources: [{ quality: 'HD', url: watchUrl }],
      watchUrl
    };
  }

  const episodes = [];
  for (let i = 1; i <= 24; i++) {
    episodes.push({
      number: i,
      title: `Episode ${i}`,
      url: `${BASE_URL}/watch/${animeId}-episode-${i}`
    });
  }
  return episodes;
}

module.exports = { scrapeHiAnime };
