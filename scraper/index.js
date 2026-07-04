const express = require('express');
const cors = require('cors');
const NodeCache = require('node-cache');
const { scrapeAnimeEpisodes, scrapeEpisodeSource } = require('../scraper');

const app = express();
const cache = new NodeCache({ stdTTL: 3600 });

app.use(cors());
app.use(express.json());

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'REWIND backend is running' });
});

// Get all episodes for an anime
app.get('/api/anime/:id/episodes', async (req, res) => {
  try {
    const { id } = req.params;
    const cacheKey = `episodes_${id}`;
    
    let episodes = cache.get(cacheKey);
    if (episodes) {
      return res.json({ episodes, cached: true, source: 'cache' });
    }

    episodes = await scrapeAnimeEpisodes(id);
    cache.set(cacheKey, episodes);
    
    res.json({ episodes, cached: false, source: 'scrape' });
  } catch (error) {
    console.error('Error fetching episodes:', error);
    res.status(500).json({ error: 'Failed to fetch episodes', message: error.message });
  }
});

// Get specific episode video source
app.get('/api/anime/:id/episode/:num', async (req, res) => {
  try {
    const { id, num } = req.params;
    const cacheKey = `episode_${id}_${num}`;
    
    let videoSource = cache.get(cacheKey);
    if (videoSource) {
      return res.json({ ...videoSource, cached: true });
    }

    videoSource = await scrapeEpisodeSource(id, parseInt(num));
    cache.set(cacheKey, videoSource);
    
    res.json({ ...videoSource, cached: false });
  } catch (error) {
    console.error('Error fetching episode source:', error);
    res.status(500).json({ error: 'Failed to fetch episode source' });
  }
});

// Search anime
app.get('/api/search', async (req, res) => {
  try {
    const { q, page = 1 } = req.query;
    const response = await fetch(
      `https://api.jikan.moe/v4/anime?q=${encodeURIComponent(q)}&page=${page}&limit=18&sfw=true`
    );
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Search failed' });
  }
});

// Root route to test
app.get('/', (req, res) => {
  res.json({ 
    message: 'REWIND API is running!',
    endpoints: [
      '/api/health',
      '/api/anime/:id/episodes',
      '/api/anime/:id/episode/:num',
      '/api/search?q=anime'
    ]
  });
});

// For Vercel - export the app
module.exports = app;
