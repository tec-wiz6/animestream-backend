// api/index.js - FULL API WITH ON-DEMAND
const express = require('express');
const cors = require('cors');
const NodeCache = require('node-cache');
const { supabase } = require('../supabaseClient');
const { scrapeAndPlay, scrapeEpisodeOnDemand } = require('../scraper/on-demand');

const app = express();
const cache = new NodeCache({ stdTTL: 3600 });

app.use(cors());
app.use(express.json());

// ============================================================
// HEALTH CHECK
// ============================================================
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'REWIND backend is running',
    timestamp: new Date().toISOString()
  });
});

// ============================================================
// ROOT
// ============================================================
app.get('/', (req, res) => {
  res.json({
    message: 'REWIND API is running!',
    version: '2.0.0',
    endpoints: [
      { path: '/api/health', method: 'GET' },
      { path: '/api/anime/:id/episodes', method: 'GET' },
      { path: '/api/anime/:id/episode/:num', method: 'GET' },
      { path: '/api/anime/:id/play/:num', method: 'GET' },
      { path: '/api/search', method: 'GET' },
    ],
  });
});

// ============================================================
// GET ALL EPISODES
// ============================================================
app.get('/api/anime/:id/episodes', async (req, res) => {
  try {
    const { id } = req.params;
    const cacheKey = `episodes_${id}`;

    let episodes = cache.get(cacheKey);
    if (episodes) {
      return res.json({ episodes, cached: true, source: 'memory-cache' });
    }

    const { data, error } = await supabase
      .from('episodes')
      .select('episode_number, title, watch_url')
      .eq('anime_id', id)
      .order('episode_number', { ascending: true });

    if (error) {
      return res.status(500).json({ error: 'Failed to fetch episodes' });
    }

    episodes = data.map((ep) => ({
      number: ep.episode_number,
      title: ep.title,
      url: ep.watch_url,
    }));

    cache.set(cacheKey, episodes);

    res.json({ 
      episodes, 
      cached: false, 
      source: 'supabase',
      count: episodes.length
    });
  } catch (error) {
    console.error('Error fetching episodes:', error);
    res.status(500).json({ error: 'Failed to fetch episodes' });
  }
});

// ============================================================
// GET EPISODE SOURCE (Static)
// ============================================================
app.get('/api/anime/:id/episode/:num', async (req, res) => {
  try {
    const { id, num } = req.params;
    const episodeNum = parseInt(num, 10);
    const cacheKey = `episode_${id}_${episodeNum}`;

    let videoSource = cache.get(cacheKey);
    if (videoSource) {
      return res.json({ ...videoSource, cached: true, source: 'memory-cache' });
    }

    const { data, error } = await supabase
      .from('episode_sources')
      .select('embed_url, watch_url, via')
      .eq('anime_id', id)
      .eq('episode_number', episodeNum)
      .single();

    if (error || !data) {
      return res.status(404).json({
        error: 'Episode source not found',
        message: 'Use /play endpoint for on-demand scraping.',
      });
    }

    videoSource = {
      url: data.embed_url,
      sources: [{ quality: 'HD', url: data.embed_url }],
      watchUrl: data.watch_url,
      via: data.via,
    };

    cache.set(cacheKey, videoSource);

    res.json({ ...videoSource, cached: false, source: 'supabase' });
  } catch (error) {
    console.error('Error fetching episode source:', error);
    res.status(500).json({ error: 'Failed to fetch episode source' });
  }
});

// api/index.js - Add better error handling for on-demand scraping

// ============================================================
// ON-DEMAND PLAY ENDPOINT (FIXED)
// ============================================================
app.get('/api/anime/:id/play/:num', async (req, res) => {
  try {
    const { id, num } = req.params;
    const episodeNum = parseInt(num, 10);
    const cacheKey = `play_${id}_${episodeNum}`;

    // Check cache
    let videoSource = cache.get(cacheKey);
    if (videoSource) {
      return res.json({ 
        ...videoSource, 
        cached: true, 
        source: 'memory-cache' 
      });
    }

    // Try Supabase first
    const { data: existing, error } = await supabase
      .from('episode_sources')
      .select('embed_url, watch_url, via')
      .eq('anime_id', id)
      .eq('episode_number', episodeNum)
      .single();

    if (existing && existing.embed_url) {
      videoSource = {
        url: existing.embed_url,
        sources: [{ quality: 'HD', url: existing.embed_url }],
        watchUrl: existing.watch_url,
        via: existing.via,
      };
      cache.set(cacheKey, videoSource);
      return res.json({ 
        ...videoSource, 
        cached: false, 
        source: 'supabase'
      });
    }

    // NOT IN DB → Try on-demand scraping
    console.log(`🔄 [API] On-demand scraping: ${id} Episode ${episodeNum}`);
    
    try {
      const source = await scrapeAndPlay(id, episodeNum);
      
      videoSource = {
        url: source.url,
        sources: [{ quality: 'HD', url: source.url }],
        watchUrl: source.watchUrl || source.url,
        via: source.via || 'on-demand',
      };

      cache.set(cacheKey, videoSource);

      return res.json({
        ...videoSource,
        cached: false,
        source: 'on-demand-scrape',
        backgroundScraping: source.backgroundScraping || false,
        message: source.backgroundScraping ? 'Background scraping full season...' : 'Episode ready!'
      });
      
    } catch (scrapeError) {
      console.error('❌ On-demand scrape failed:', scrapeError.message);
      
      // Return a user-friendly error
      return res.status(404).json({
        error: 'Episode not available',
        message: `"${id}" is not in our database yet. Try searching for it first, or it may not be available.`,
        suggestion: 'Go back and search for the anime you want to watch.',
        animeId: id,
        episode: episodeNum
      });
    }

  } catch (error) {
    console.error('Error in on-demand play:', error);
    res.status(500).json({ 
      error: 'Failed to fetch episode',
      message: error.message 
    });
  }
});
// ============================================================
// BACKGROUND SCRAPE ENDPOINT
// ============================================================
app.post('/api/anime/:id/scrape', async (req, res) => {
  try {
    const { id } = req.params;
    const { episode } = req.body;

    if (!episode) {
      return res.status(400).json({ error: 'Episode number required' });
    }

    scrapeEpisodeOnDemand(id, parseInt(episode, 10))
      .then(() => console.log(`✅ Background scrape complete: ${id} Episode ${episode}`))
      .catch(err => console.error(`❌ Background scrape failed:`, err.message));

    res.json({ 
      message: `Started scraping ${id} Episode ${episode} in background`,
      status: 'processing'
    });

  } catch (error) {
    console.error('Error starting background scrape:', error);
    res.status(500).json({ error: 'Failed to start background scrape' });
  }
});

// ============================================================
// SEARCH
// ============================================================
app.get('/api/search', async (req, res) => {
  try {
    const { q, page = 1 } = req.query;
    if (!q) {
      return res.status(400).json({ error: 'Search query required' });
    }

    const response = await fetch(
      `https://api.jikan.moe/v4/anime?q=${encodeURIComponent(q)}&page=${page}&limit=18&sfw=true`
    );
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Search failed:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

module.exports = app;
