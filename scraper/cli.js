// scraper/cli.js
const { scrapeAnimeEpisodes, scrapeEpisodeSource } = require('./index');
const { supabase } = require('../supabaseClient');
const animeList = require('./anime-list.json');

async function main() {
  console.log('🎬 Starting REAL HiAnime scraper...');
  console.log('🌐 Using: https://hianime.ro\n');

  for (const anime of animeList) {
    try {
      console.log(`\n📼 Scraping: ${anime.name} (Search: ${anime.id})`);

      // Scrape episodes from HiAnime
      const episodes = await scrapeAnimeEpisodes(anime.id);

      // Upsert anime row in Supabase
      const { error: animeError } = await supabase
        .from('anime')
        .upsert(
          {
            id: anime.id, // e.g. "naruto", "one piece"
            name: anime.name, // e.g. "Naruto", "One Piece"
            last_scraped: new Date().toISOString()
          },
          { onConflict: 'id' }
        );

      if (animeError) {
        console.error('❌ Supabase anime upsert error:', animeError.message);
      } else {
        console.log(`✅ Upserted anime entry for ${anime.name}`);
      }

      // Upsert episodes in Supabase (one by one to avoid ON CONFLICT issues)
      if (episodes && episodes.length > 0) {
        for (const ep of episodes) {
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
            console.error(
              `❌ Supabase episode upsert error for ${anime.name} ep ${ep.number}:`,
              epError.message
            );
          }
        }

        console.log(`✅ Upserted ${episodes.length} episodes for ${anime.name}`);

        // Scrape and upsert source for episode 1
        console.log('  Testing episode 1 video source...');
        const sourceEpisode1 = await scrapeEpisodeSource(anime.id, 1);
        console.log(
          `  📺 Video URL: ${sourceEpisode1.url?.substring(0, 80) || 'N/A'}...`
        );
        console.log(
          `  📊 Sources found: ${sourceEpisode1.sources?.length || 0}`
        );

        const { error: srcError } = await supabase
          .from('episode_sources')
          .upsert(
            {
              anime_id: anime.id,
              episode_number: 1,
              embed_url: sourceEpisode1.url,
              watch_url: sourceEpisode1.watchUrl,
              via: sourceEpisode1.via || 'puppeteer',
              updated_at: new Date().toISOString()
            },
            { onConflict: 'anime_id,episode_number' }
          );

        if (srcError) {
          console.error('❌ Supabase source upsert error:', srcError.message);
        } else {
          console.log(`✅ Upserted episode 1 source for ${anime.name}`);
        }
      } else {
        console.log(`⚠️ No episodes scraped for ${anime.name}`);
      }

      // Small delay between anime to be gentle to HiAnime
      await new Promise((resolve) => setTimeout(resolve, 3000));
    } catch (error) {
      console.error(`❌ Failed to scrape ${anime.name}:`, error.message);
    }
  }

  console.log('\n🎉 Scraping complete!');
}

main().catch(console.error);
