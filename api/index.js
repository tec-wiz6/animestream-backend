// api/index.js - SIMPLIFIED (no on-demand)
const express = require('express');
const cors = require('cors');
const NodeCache = require('node-cache');
const { supabase } = require('../supabaseClient');

const app = express();
const cache = new NodeCache({ stdTTL: 3600 });

app.use(cors());
app.use(express.json());

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'REWIND backend is running' });
});

// Root
app.get('/', (req, res) => {
  res.json({
    message: 'REWIND API is running!',
    version: '2.0.0',
    endpoints: [
      { path: '/api/health', method: 'GET' },
      { path: '/api/anime/:id/episodes', method: 'GET' },
      { path: '/api/anime/:id/episode/:num', method: 'GET' },
      { path: '/api/search', method: 'GET' },
    ],
  });
});

// Get all episodes for an anime
app.get('/api/anime/:id/episodes', async (req, res) => {
  try {
    const { id } = req.params;
    const cacheKey = `episodes_${id}`;

    // Check cache
    let episodes = cache.get(cacheKey);
    if (episodes) {
      return res.json({ episodes, cached: true, source: 'memory-cache' });
    }

    // Query Supabase
    const { data, error } = await supabase
      .from('episodes')
      .select('episode_number, title, watch_url')
      .eq('anime_id', id)
      .order('episode_number', { ascending: true });

    if (error) {
      console.error('Supabase error:', error.message);
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

// Get specific episode source
app.get('/api/anime/:id/episode/:num', async (req, res) => {
  try {
    const { id, num } = req.params;
    const episodeNum = parseInt(num, 10);
    const cacheKey = `episode_${id}_${episodeNum}`;

    // Check cache
    let videoSource = cache.get(cacheKey);
    if (videoSource) {
      return res.json({ ...videoSource, cached: true, source: 'memory-cache' });
    }

    // Query Supabase
    const { data, error } = await supabase
      .from('episode_sources')
      .select('embed_url, watch_url, via')
      .eq('anime_id', id)
      .eq('episode_number', episodeNum)
      .single();

    if (error || !data) {
      return res.status(404).json({
        error: 'Episode not found',
        message: `Episode ${episodeNum} for "${id}" is not available. Make sure it's been scraped.`,
        available: false
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

// Search anime (Jikan API)
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
