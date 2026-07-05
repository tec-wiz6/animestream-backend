// scraper/cli.js - FIXED to use the SLUG from the scrape result

const { scrapeAnimeEpisodes, scrapeEpisodeSource } = require('./index');
const { scrapeHiAnime } = require('./sources/hianime');
const { getEpisodeVideoSourceBrowser } = require('./sources/hianimeBrowser');
const { supabase } = require('../supabaseClient');
const animeList = require('./anime-list.json');

// ============================================================
// CONFIGURATION
// ============================================================
const CONFIG = {
  PRE_SCRAPE_EPISODES: 0,
  EPISODE_DELAY_MS: 1000,
  ANIME_DELAY_MS: 3000,
  USE_PUPPETEER_FOR_EPISODE_1: true,
  MAX_EPISODES: 0,
};

// ============================================================
// SCRAPE FULL SEASON
// ============================================================
async function scrapeFullSeason(anime) {
  console.log(`\n📼 Scraping FULL SEASON: ${anime.name} (Search: ${anime.id})`);

  // Step 1: Get the episode list and determine the correct SLUG
  console.log(`📡 Fetching episode list for ${anime.name}...`);
  const episodes = await scrapeAnimeEpisodes(anime.id);
  
  // IMPORTANT: We need to get the SLUG from the scrape result
  // The slug is the actual anime identifier (e.g., "naruto-shippuden")
  let animeSlug = anime.id; // fallback to search term
  
  // Re-run the scrape to get the slug (scrapeAnimeEpisodes returns episodes but doesn't expose the slug)
  // We need to call scrapeHiAnime directly to get both episodes AND the slug
  const { scrapeHiAnime } = require('./sources/hianime');
  try {
    // This will log the selected slug in the console
    const result = await scrapeHiAnime(anime.id);
    if (result && result.length > 0) {
      // The slug is logged in the console, but we need to extract it
      // For now, we'll use the search term and fix the URL building
      // Actually, we need to get the slug from the scrape result
      // Let's re-run with episode 1 to get the correct watch URL
      const testSource = await scrapeHiAnime(anime.id, 1);
      if (testSource && testSource.watchUrl) {
        // Extract slug from watchUrl
        const match = testSource.watchUrl.match(/\/watch\/([^-]+(?:-[^-]+)*?)(?:-episode-|$)/);
        if (match) {
          animeSlug = match[1];
          console.log(`📺 Extracted slug from watch URL: ${animeSlug}`);
        }
      }
    }
  } catch (e) {
    console.log(`⚠️ Could not extract slug, using search term: ${anime.id}`);
  }

  // Step 2: Upsert anime with the correct slug
  const { error: animeError } = await supabase
    .from('anime')
    .upsert(
      {
        id: animeSlug, // Use the SLUG as the ID!
        name: anime.name,
        last_scraped: new Date().toISOString()
      },
      { onConflict: 'id' }
    );

  if (animeError) {
    console.error('❌ Supabase anime upsert error:', animeError.message);
    return false;
  }
  console.log(`✅ Upserted anime entry for ${anime.name} with slug: ${animeSlug}`);

  if (!episodes || episodes.length === 0) {
    console.log(`⚠️ No episodes found for ${anime.name}`);
    return false;
  }

  let episodesToProcess = episodes;
  if (CONFIG.MAX_EPISODES > 0 && episodes.length > CONFIG.MAX_EPISODES) {
    episodesToProcess = episodes.slice(0, CONFIG.MAX_EPISODES);
    console.log(`📊 Limiting to ${CONFIG.MAX_EPISODES} episodes (out of ${episodes.length})`);
  }

  console.log(`📺 Found ${episodesToProcess.length} episodes for ${anime.name}`);

  // Step 3: Upsert ALL episodes with the SLUG as anime_id
  console.log(`💾 Saving ${episodesToProcess.length} episodes to Supabase...`);
  for (const ep of episodesToProcess) {
    const { error: epError } = await supabase
      .from('episodes')
      .upsert(
        {
          anime_id: animeSlug, // Use the SLUG!
          episode_number: ep.number,
          title: ep.title,
          watch_url: ep.url
        },
        { onConflict: 'anime_id,episode_number' }
      );

    if (epError) {
      console.error(`❌ Episode ${ep.number} upsert error:`, epError.message);
    }
  }
  console.log(`✅ Saved ${episodesToProcess.length} episodes to Supabase`);

  // Step 4: Scrape sources using the SLUG
  console.log(`🎬 Scraping sources for episodes...`);

  let episodesToScrape = CONFIG.PRE_SCRAPE_EPISODES;
  if (episodesToScrape === 0) {
    episodesToScrape = 1;
    console.log(`📌 Pre-scraping mode: Episode 1 only (on-demand for rest)`);
  } else {
    episodesToScrape = episodesToProcess.length;
    console.log(`📌 Season mode: Scraping all ${episodesToScrape} episodes`);
  }

  episodesToScrape = Math.min(episodesToScrape, episodesToProcess.length);

  let sourceCount = 0;
  let failCount = 0;

  for (let i = 0; i < episodesToScrape; i++) {
    const ep = episodesToProcess[i];
    try {
      process.stdout.write(`\r  📡 Episode ${ep.number}/${episodesToProcess.length} (🚀)... `);

      // ============================================================
      // CRITICAL FIX: Use the SLUG, NOT the search term!
      // ============================================================
      const source = await getEpisodeVideoSourceBrowser(animeSlug, ep.number);

      const { error: srcError } = await supabase
        .from('episode_sources')
        .upsert(
          {
            anime_id: animeSlug, // Use the SLUG!
            episode_number: ep.number,
            embed_url: source.url,
            watch_url: source.watchUrl || source.url,
            via: source.via || 'puppeteer',
            updated_at: new Date().toISOString()
          },
          { onConflict: 'anime_id,episode_number' }
        );

      if (srcError) {
        console.error(`\n❌ Source error for ep ${ep.number}:`, srcError.message);
        failCount++;
      } else {
        sourceCount++;
      }

      await new Promise(resolve => setTimeout(resolve, CONFIG.EPISODE_DELAY_MS));

    } catch (epError) {
      console.error(`\n❌ Failed to scrape episode ${ep.number}:`, epError.message);
      failCount++;
    }
  }

  console.log(`\n✅ Scraped ${sourceCount}/${episodesToScrape} episode sources`);
  if (failCount > 0) {
    console.log(`⚠️ ${failCount} episodes failed`);
  }

  return true;
}

// ============================================================
// ON-DEMAND SCRAPING
// ============================================================
async function scrapeOnDemand(animeId, episodeNum = 1) {
  console.log(`🎬 [ON-DEMAND] Scraping: ${animeId} Episode ${episodeNum}`);
  
  try {
    // Check if episode source exists
    const { data: existing } = await supabase
      .from('episode_sources')
      .select('embed_url')
      .eq('anime_id', animeId)
      .eq('episode_number', episodeNum)
      .single();

    if (existing && existing.embed_url) {
      console.log(`✅ [ON-DEMAND] Episode ${episodeNum} already in DB!`);
      return existing;
    }

    // Scrape with Puppeteer using the animeId (which should already be the slug)
    console.log(`📡 [ON-DEMAND] Scraping episode ${episodeNum} with Puppeteer...`);
    const source = await getEpisodeVideoSourceBrowser(animeId, episodeNum);

    // Save to Supabase
    await supabase
      .from('episode_sources')
      .upsert(
        {
          anime_id: animeId,
          episode_number: episodeNum,
          embed_url: source.url,
          watch_url: source.watchUrl || source.url,
          via: 'on-demand-puppeteer',
          updated_at: new Date().toISOString()
        },
        { onConflict: 'anime_id,episode_number' }
      );

    console.log(`✅ [ON-DEMAND] Episode ${episodeNum} scraped and saved!`);
    return source;

  } catch (error) {
    console.error(`❌ [ON-DEMAND] Failed:`, error.message);
    throw error;
  }
}

// ============================================================
// MAIN
// ============================================================
async function main() {
  console.log('🎬 Starting FULL SEASON HiAnime scraper...');
  console.log('🌐 Using: https://hianime.ro');
  console.log(`📊 Mode: ${CONFIG.PRE_SCRAPE_EPISODES > 0 ? 'FULL SEASON' : 'EPISODE 1 ONLY (on-demand rest)'}`);
  console.log(`📊 Max episodes: ${CONFIG.MAX_EPISODES > 0 ? CONFIG.MAX_EPISODES : 'ALL'}\n`);

  for (const anime of animeList) {
    try {
      await scrapeFullSeason(anime);
      await new Promise(resolve => setTimeout(resolve, CONFIG.ANIME_DELAY_MS));
    } catch (error) {
      console.error(`❌ Failed to scrape ${anime.name}:`, error.message);
    }
  }

  console.log('\n🎉 Scraping complete!');
  console.log(`💾 Data stored in Supabase`);
}

// ============================================================
// EXPORTS
// ============================================================
module.exports = { 
  scrapeFullSeason, 
  scrapeOnDemand,
  CONFIG 
};

if (require.main === module) {
  main().catch(console.error);
}
