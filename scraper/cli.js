// scraper/cli.js - FULL SEASON SCRAPER WITH ON-DEMAND LOGIC
const { scrapeAnimeEpisodes, scrapeEpisodeSource } = require('./index');
const { scrapeHiAnime } = require('./sources/hianime');
const { getEpisodeVideoSourceBrowser } = require('./sources/hianimeBrowser');
const { supabase } = require('../supabaseClient');
const animeList = require('./anime-list.json');

// ============================================================
// CONFIGURATION
// ============================================================
const CONFIG = {
  // 0 = only episode 1, >0 = pre-scrape that many episodes
  PRE_SCRAPE_EPISODES: 0,
  
  // Delay between episodes (avoid rate limiting)
  EPISODE_DELAY_MS: 1000,
  
  // Delay between anime
  ANIME_DELAY_MS: 3000,
  
  // Use Puppeteer for episode 1 only (faster)
  USE_PUPPETEER_FOR_EPISODE_1: true,
  
  // Max episodes to scrape per anime (0 = all)
  MAX_EPISODES: 0,
};

// ============================================================
// SCRAPE FULL SEASON
// ============================================================
async function scrapeFullSeason(anime) {
  console.log(`\n📼 Scraping FULL SEASON: ${anime.name} (Search: ${anime.id})`);

  // Step 1: Upsert anime
  const { error: animeError } = await supabase
    .from('anime')
    .upsert(
      {
        id: anime.id,
        name: anime.name,
        last_scraped: new Date().toISOString()
      },
      { onConflict: 'id' }
    );

  if (animeError) {
    console.error('❌ Supabase anime upsert error:', animeError.message);
    return false;
  }
  console.log(`✅ Upserted anime entry for ${anime.name}`);

  // Step 2: Get all episodes
  console.log(`📡 Fetching episode list for ${anime.name}...`);
  const episodes = await scrapeAnimeEpisodes(anime.id);

  if (!episodes || episodes.length === 0) {
    console.log(`⚠️ No episodes found for ${anime.name}`);
    return false;
  }

  // Limit episodes if configured
  let episodesToProcess = episodes;
  if (CONFIG.MAX_EPISODES > 0 && episodes.length > CONFIG.MAX_EPISODES) {
    episodesToProcess = episodes.slice(0, CONFIG.MAX_EPISODES);
    console.log(`📊 Limiting to ${CONFIG.MAX_EPISODES} episodes (out of ${episodes.length})`);
  }

  console.log(`📺 Found ${episodesToProcess.length} episodes for ${anime.name}`);

  // Step 3: Upsert ALL episodes
  console.log(`💾 Saving ${episodesToProcess.length} episodes to Supabase...`);
  for (const ep of episodesToProcess) {
    const { error: epError } = await supabase
      .from('episodes')
      .upsert(
        {
          anime_id: anime.id,
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

  // Step 4: Scrape sources
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
      const usePuppeteer = (CONFIG.USE_PUPPETEER_FOR_EPISODE_1 && ep.number === 1);
      
      process.stdout.write(`\r  📡 Episode ${ep.number}/${episodesToProcess.length} (${usePuppeteer ? '🚀' : '⚡'})... `);

      let source;
      if (usePuppeteer) {
        source = await getEpisodeVideoSourceBrowser(anime.id, ep.number);
      } else {
        source = await scrapeHiAnime(anime.id, ep.number);
      }

      const { error: srcError } = await supabase
        .from('episode_sources')
        .upsert(
          {
            anime_id: anime.id,
            episode_number: ep.number,
            embed_url: source.url || source.watchUrl,
            watch_url: source.watchUrl || source.url,
            via: source.via || (usePuppeteer ? 'puppeteer-cli' : 'static-cli'),
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
    const { data: existingAnime } = await supabase
      .from('anime')
      .select('id')
      .eq('id', animeId)
      .single();

    if (!existingAnime) {
      console.log(`📝 [ON-DEMAND] New anime detected! Will scrape full season in background...`);
      setTimeout(() => {
        scrapeFullSeasonInBackground(animeId);
      }, 1000);
    }

    console.log(`📡 [ON-DEMAND] Scraping episode ${episodeNum} now...`);
    const source = await getEpisodeVideoSourceBrowser(animeId, episodeNum);

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
// BACKGROUND FULL SEASON SCRAPER
// ============================================================
async function scrapeFullSeasonInBackground(animeId) {
  console.log(`🔄 [BACKGROUND] Starting full season scrape for: ${animeId}`);
  
  try {
    const episodes = await scrapeAnimeEpisodes(animeId);
    
    if (!episodes || episodes.length === 0) {
      console.log(`⚠️ [BACKGROUND] No episodes found for ${animeId}`);
      return;
    }

    const animeName = animeId.split('-').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');

    await supabase
      .from('anime')
      .upsert(
        {
          id: animeId,
          name: animeName,
          last_scraped: new Date().toISOString()
        },
        { onConflict: 'id' }
      );

    for (const ep of episodes) {
      await supabase
        .from('episodes')
        .upsert(
          {
            anime_id: animeId,
            episode_number: ep.number,
            title: ep.title,
            watch_url: ep.url
          },
          { onConflict: 'anime_id,episode_number' }
        );
    }

    console.log(`🔄 [BACKGROUND] Scraping ${episodes.length - 1} remaining episodes...`);
    
    let scraped = 0;
    for (const ep of episodes) {
      const { data: existing } = await supabase
        .from('episode_sources')
        .select('id')
        .eq('anime_id', animeId)
        .eq('episode_number', ep.number)
        .single();

      if (existing) continue;

      const source = await scrapeHiAnime(animeId, ep.number);
      
      if (source && source.url) {
        await supabase
          .from('episode_sources')
          .upsert(
            {
              anime_id: animeId,
              episode_number: ep.number,
              embed_url: source.url,
              watch_url: source.watchUrl || source.url,
              via: 'background-static',
              updated_at: new Date().toISOString()
            },
            { onConflict: 'anime_id,episode_number' }
          );
        scraped++;
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log(`✅ [BACKGROUND] Full season scrape complete! ${scraped} episodes added`);

  } catch (error) {
    console.error(`❌ [BACKGROUND] Failed:`, error.message);
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
  scrapeFullSeasonInBackground,
  CONFIG 
};

if (require.main === module) {
  main().catch(console.error);
}
