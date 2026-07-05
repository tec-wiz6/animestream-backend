// scraper/on-demand.js - ON-DEMAND SCRAPING
const { supabase } = require('../supabaseClient');
const { scrapeHiAnime } = require('./sources/hianime');
const { getEpisodeVideoSourceBrowser } = require('./sources/hianimeBrowser');
const { scrapeFullSeasonInBackground } = require('./cli');

// ============================================================
// SCRAPE AND PLAY
// ============================================================
// scraper/on-demand.js - FIXED with better error handling

async function scrapeAndPlay(animeId, episodeNum = 1) {
  console.log(`🎬 [ON-DEMAND] Play request: ${animeId} Episode ${episodeNum}`);
  
  try {
    // Check if episode source exists
    const { data: existing, error } = await supabase
      .from('episode_sources')
      .select('embed_url, watch_url, via')
      .eq('anime_id', animeId)
      .eq('episode_number', episodeNum)
      .single();

    if (existing && existing.embed_url) {
      console.log(`✅ [ON-DEMAND] Episode ${episodeNum} already in DB!`);
      return {
        url: existing.embed_url,
        sources: [{ quality: 'HD', url: existing.embed_url }],
        watchUrl: existing.watch_url,
        via: existing.via,
        fromCache: true
      };
    }

    // Check if anime exists
    const { data: animeExists } = await supabase
      .from('anime')
      .select('id')
      .eq('id', animeId)
      .single();

    // If new anime, try to find the correct slug first
    let slugToUse = animeId;
    
    if (!animeExists) {
      console.log(`🔄 [ON-DEMAND] New anime detected: ${animeId}`);
      
      // Try to find the correct slug by searching
      try {
        const { scrapeHiAnime } = require('./sources/hianime');
        // Just do a search to get the slug
        const searchResult = await scrapeHiAnime(animeId, 1);
        if (searchResult && searchResult.watchUrl) {
          const match = searchResult.watchUrl.match(/\/watch\/([^-]+(?:-[^-]+)*?)(?:-episode-|$)/);
          if (match) {
            slugToUse = match[1];
            console.log(`📺 Found correct slug: ${slugToUse}`);
            
            // If the slug is different, update the anime ID for this request
            if (slugToUse !== animeId) {
              // Check if the slug exists in DB
              const { data: slugExists } = await supabase
                .from('anime')
                .select('id')
                .eq('id', slugToUse)
                .single();
              
              if (slugExists) {
                // Use the slug from now on
                console.log(`✅ Using existing anime with slug: ${slugToUse}`);
                animeId = slugToUse;
              }
            }
          }
        }
      } catch (searchError) {
        console.log(`⚠️ Could not find correct slug: ${searchError.message}`);
      }
    }

    // Try to get the episode source with the slug
    console.log(`📡 [ON-DEMAND] Scraping episode ${episodeNum} with Puppeteer...`);
    const source = await getEpisodeVideoSourceBrowser(animeId, episodeNum);

    // If we got a valid source, save it
    if (source && source.url && !source.fallback) {
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

      // Save anime if new
      if (!animeExists) {
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
      }

      console.log(`✅ [ON-DEMAND] Episode ${episodeNum} scraped and saved!`);
      
      // Start background scraping for more episodes
      if (!animeExists) {
        setTimeout(() => {
          scrapeFullSeasonInBackground(animeId);
        }, 1000);
      }

      return {
        url: source.url,
        sources: [{ quality: 'HD', url: source.url }],
        watchUrl: source.watchUrl || source.url,
        via: 'on-demand-puppeteer',
        fromCache: false,
        backgroundScraping: !animeExists
      };
    } else {
      throw new Error('Could not find video source for this anime. It may not be available on HiAnime.');
    }

  } catch (error) {
    console.error(`❌ [ON-DEMAND] Failed:`, error.message);
    throw error;
  }
}

// ============================================================
// SCRAPE EPISODE ON DEMAND
// ============================================================
async function scrapeEpisodeOnDemand(animeId, episodeNum) {
  console.log(`📡 [ON-DEMAND] Scraping episode ${episodeNum} for ${animeId}`);
  
  try {
    const { data: existing } = await supabase
      .from('episode_sources')
      .select('embed_url')
      .eq('anime_id', animeId)
      .eq('episode_number', episodeNum)
      .single();

    if (existing && existing.embed_url) {
      console.log(`✅ Episode ${episodeNum} already exists`);
      return existing;
    }

    // Try static HTML first
    console.log(`  ⚡ Trying static HTML...`);
    let source = await scrapeHiAnime(animeId, episodeNum);

    // Fallback to Puppeteer
    if (!source || !source.url || source.fallback) {
      console.log(`  🚀 Static failed, trying Puppeteer...`);
      source = await getEpisodeVideoSourceBrowser(animeId, episodeNum);
    }

    if (source && source.url) {
      await supabase
        .from('episode_sources')
        .upsert(
          {
            anime_id: animeId,
            episode_number: episodeNum,
            embed_url: source.url,
            watch_url: source.watchUrl || source.url,
            via: 'on-demand-static',
            updated_at: new Date().toISOString()
          },
          { onConflict: 'anime_id,episode_number' }
        );
      
      console.log(`✅ Episode ${episodeNum} scraped and saved`);
      return source;
    }

    console.log(`⚠️ Could not scrape episode ${episodeNum}`);
    return null;

  } catch (error) {
    console.error(`❌ Failed to scrape episode ${episodeNum}:`, error.message);
    return null;
  }
}

module.exports = { scrapeAndPlay, scrapeEpisodeOnDemand };
