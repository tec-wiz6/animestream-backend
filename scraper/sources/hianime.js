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
    
    // Find ALL anime results with their titles
    let animeResults = [];
    
    $('.film-poster a, .poster a, .thumb a, .film-list .film-poster a, .anime-item a, .movie-item a').each((i, el) => {
      const href = $(el).attr('href');
      if (href && href.includes('/watch/')) {
        const match = href.match(/\/watch\/([^-]+(?:-[^-]+)*?)(?:-episode-|$)/);
        if (match) {
          // Get the title from alt text or title attribute
          const img = $(el).find('img');
          const title = img.attr('alt') || $(el).find('.title').text() || $(el).find('.name').text() || $(el).text().trim() || match[1];
          const slug = match[1];
          
          // Check if it has a season/episode indicator
          const isSeason = title.match(/season\s*\d+/i) || title.match(/part\s*\d+/i) || title.match(/arc/i);
          const isMovie = title.match(/movie|film|special|ova|oad/i);
          const isMain = !isMovie && !isSeason;
          
          animeResults.push({
            slug: slug,
            href: href,
            title: title,
            isMovie: isMovie,
            isSeason: isSeason,
            isMain: isMain,
            // Prefer shorter slugs (usually the main series)
            slugLength: slug.length
          });
        }
      }
    });
    
    if (animeResults.length === 0) {
      console.log(`⚠️ No anime found for: ${animeId}`);
      return generateMockData(animeId, episodeNum);
    }
    
    // Log all found results with titles
    console.log(`  Found ${animeResults.length} results:`);
    animeResults.forEach((r, i) => {
      const type = r.isMovie ? '🎬 MOVIE' : r.isSeason ? '📺 SEASON' : '⭐ MAIN';
      console.log(`    ${i + 1}. ${r.title || r.slug} ${type}`);
    });
    
    // Pick the BEST match - prefer main series, then seasons, avoid movies
    let bestMatch = null;
    
    // First: Try to find exact match with search term in title (case insensitive)
    const searchLower = animeId.toLowerCase();
    const searchWords = searchLower.split(' ');
    
    // Score each result
    let scoredResults = animeResults.map(result => {
      let score = 0;
      const titleLower = (result.title || '').toLowerCase();
      
      // Bonus for main series (not movie)
      if (!result.isMovie && !result.isSeason) score += 10;
      // Bonus for seasons
      if (result.isSeason) score += 5;
      // Penalty for movies
      if (result.isMovie) score -= 10;
      
      // Bonus for exact title match
      if (titleLower === searchLower) score += 20;
      // Bonus for containing all search words
      const allWordsMatch = searchWords.every(word => titleLower.includes(word));
      if (allWordsMatch) score += 15;
      
      // Bonus for shorter slugs (main series tend to be shorter)
      if (result.slugLength < 20) score += 5;
      if (result.slugLength < 15) score += 5;
      
      // Bonus if title doesn't have movie/special keywords
      if (!titleLower.includes('movie') && !titleLower.includes('film') && !titleLower.includes('special')) {
        score += 5;
      }
      
      return { ...result, score };
    });
    
    // Sort by score descending
    scoredResults.sort((a, b) => b.score - a.score);
    
    console.log(`  Top scores:`);
    scoredResults.slice(0, 3).forEach((r, i) => {
      console.log(`    ${i + 1}. ${r.title || r.slug} (score: ${r.score})`);
    });
    
    bestMatch = scoredResults[0];
    
    if (!bestMatch) {
      bestMatch = animeResults[0];
    }
    
    const animeSlug = bestMatch.slug;
    console.log(`📺 Selected: ${bestMatch.title || animeSlug} (score: ${bestMatch.score})`);
    console.log(`📺 Final anime slug: ${animeSlug}`);
    
    // Now get the episode list
    const episodeUrls = [
      `${baseUrl}/category/${animeSlug}`,
      `${baseUrl}/anime/${animeSlug}`,
      `${baseUrl}/series/${animeSlug}`
    ];
    
    let episodePage = null;
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
      '.episodes .episode-item a',
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
