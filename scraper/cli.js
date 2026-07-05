// scraper/cli.js - FULL SEASON SCRAPER WITH PUPPETEER
const { scrapeAnimeEpisodes, scrapeEpisodeSource } = require('./index');
const { scrapeHiAnime } = require('./sources/hianime');
const { getEpisodeVideoSourceBrowser } = require('./sources/hianimeBrowser');
const { supabase } = require('../supabaseClient');
const animeList = require('./anime-list.json');

// ============================================================
// CONFIGURATION
// ============================================================
const CONFIG = {
  // How many episodes to scrape (0 = all)
  MAX_EPISODES: 0,
  
  // Delay between episodes (avoid rate limiting)
  EPISODE_DELAY_MS: 2000,
  
  // Delay between anime
  ANIME_DELAY_MS: 5000,
};

// ============================================================
// SCRAPE FULL SEASON WITH PUPPETEER
// ============================================================
async function scrapeFullSeason(anime) {
  console.log(`\n📼 Scraping FULL SEASON: ${anime.name} (Search: ${anime.id})`);

  // Step 1: Get the correct slug from HiAnime
  console.log(`📡 Finding correct slug for ${anime.name}...`);
  
  let animeSlug = null;
  
  try {
    // Search for the anime to get the correct slug
    const searchResult = await scrapeHiAnime(anime.id, 1);
    if (searchResult && searchResult.watchUrl) {
      const match = searchResult.watchUrl.match(/\/watch\/([^-]+(?:-[^-]+)*?)(?:-episode-|$)/);
      if (match) {
        animeSlug = match[1];
        console.log(`✅ Found slug: ${animeSlug}`);
      }
    }
  } catch (error) {
    console.log(`⚠️ Could not find slug for ${anime.id}, using search term`);
    animeSlug = anime.id.toLowerCase().replace(/ /g, '-');
  }

  // Step 2: Upsert anime
  const { error: animeError } = await supabase
    .from('anime')
    .upsert(
      {
        id: animeSlug,
        name: anime.name,
        last_scraped: new Date().toISOString()
      },
      { onConflict: 'id' }
    );

  if (animeError) {
    console.error('❌ Supabase anime upsert error:', animeError.message);
    return false;
  }
  console.log(`✅ Upserted anime entry: ${animeSlug}`);

  // Step 3: Get all episodes
  console.log(`📡 Fetching episodes for ${anime.name}...`);
  const episodes = await scrapeAnimeEpisodes(anime.id);

  if (!episodes || episodes.length === 0) {
    console.log(`⚠️ No episodes found for ${anime.name}`);
    return false;
  }

  let episodesToProcess = episodes;
  if (CONFIG.MAX_EPISODES > 0 && episodes.length > CONFIG.MAX_EPISODES) {
    episodesToProcess = episodes.slice(0, CONFIG.MAX_EPISODES);
  }

  console.log(`📺 Found ${episodesToProcess.length} episodes`);

  // Step 4: Save episodes
  console.log(`💾 Saving episodes to Supabase...`);
  for (const ep of episodesToProcess) {
    await supabase
      .from('episodes')
      .upsert(
        {
          anime_id: animeSlug,
          episode_number: ep.number,
          title: ep.title,
          watch_url: ep.url
        },
        { onConflict: 'anime_id,episode_number' }
      );
  }
  console.log(`✅ Saved ${episodesToProcess.length} episodes`);

  // Step 5: Scrape EACH episode with Puppeteer (get megaplay URLs)
  console.log(`🎬 Scraping sources for ALL ${episodesToProcess.length} episodes with Puppeteer...`);
  console.log(`⏳ This will take about ${episodesToProcess.length * 5} seconds...`);

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < episodesToProcess.length; i++) {
    const ep = episodesToProcess[i];
    try {
      process.stdout.write(`\r  📡 Episode ${ep.number}/${episodesToProcess.length} (${i + 1}/${episodesToProcess.length})... `);

      // Use Puppeteer for EVERY episode to get megaplay URL
      const source = await getEpisodeVideoSourceBrowser(animeSlug, ep.number);

      if (source && source.url && !source.fallback) {
        await supabase
          .from('episode_sources')
          .upsert(
            {
              anime_id: animeSlug,
              episode_number: ep.number,
              embed_url: source.url,
              watch_url: source.watchUrl || source.url,
              via: 'puppeteer-full-season',
              updated_at: new Date().toISOString()
            },
            { onConflict: 'anime_id,episode_number' }
          );
        successCount++;
        process.stdout.write(`✅`);
      } else {
        process.stdout.write(`⚠️`);
        failCount++;
      }

      // Small delay between episodes
      await new Promise(resolve => setTimeout(resolve, CONFIG.EPISODE_DELAY_MS));

    } catch (epError) {
      console.error(`\n❌ Failed to scrape episode ${ep.number}:`, epError.message);
      failCount++;
    }
  }

  console.log(`\n✅ Scraped ${successCount}/${episodesToProcess.length} episodes`);
  if (failCount > 0) {
    console.log(`⚠️ ${failCount} episodes failed`);
  }

  return true;
}

// ============================================================
// MAIN
// ============================================================
async function main() {
  console.log('🎬 Starting FULL SEASON HiAnime scraper with Puppeteer...');
  console.log('🌐 Using: https://hianime.ro');
  console.log(`📊 Scraping ALL episodes for ${animeList.length} anime`);
  console.log(`⏳ Estimated time: ~${animeList.length * 30} seconds\n`);

  for (const anime of animeList) {
    try {
      await scrapeFullSeason(anime);
      console.log(`\n⏳ Waiting ${CONFIG.ANIME_DELAY_MS/1000}s before next anime...`);
      await new Promise(resolve => setTimeout(resolve, CONFIG.ANIME_DELAY_MS));
    } catch (error) {
      console.error(`❌ Failed to scrape ${anime.name}:`, error.message);
    }
  }

  console.log('\n🎉 Scraping complete!');
  console.log(`💾 Data stored in Supabase`);
}

// ============================================================
// EXPORT (for API if needed)
// ============================================================
module.exports = { scrapeFullSeason, CONFIG };

if (require.main === module) {
  main().catch(console.error);
}
