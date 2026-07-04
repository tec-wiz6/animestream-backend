// ============================================================
// REWIND BACKEND - AnimePahe API (Pal-droid approach)
// Uses cloudscraper + execjs to bypass Cloudflare
// ============================================================

const express = require('express');
const cors = require('cors');
const cloudscraper = require('cloudscraper');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

const app = express();
app.use(cors());
app.use(express.json());

// Advanced headers
const BROWSER_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Cache-Control': 'max-age=0'
};

// Cloudscraper instance with retry
const scraper = cloudscraper.create({
    headers: BROWSER_HEADERS,
    timeout: 30000,
    gzip: true,
    followRedirect: true,
    agent: new (require('http').Agent)({ keepAlive: true, maxSockets: 10 })
});

// ============================================================
// ANIMEPAHE API - Search
// ============================================================
async function searchAnimePahe(query) {
    console.log(`🔍 Searching AnimePahe: ${query}`);
    try {
        const url = `https://animepahe.pw/api?m=search&q=${encodeURIComponent(query)}`;
        const response = await scraper.get(url);
        const data = JSON.parse(response);
        
        if (data.data && data.data.length > 0) {
            return data.data.map(item => ({
                id: item.id,
                title: item.title,
                type: item.type || 'TV',
                episodes: item.episodes || '?',
                image: item.poster ? `https://animepahe.pw${item.poster}` : null,
                year: item.year || 'TBA',
                score: item.score || 'N/A',
                malId: item.mal_id || null
            }));
        }
        return [];
    } catch (error) {
        console.error('Search error:', error.message);
        return [];
    }
}

// ============================================================
// ANIMEPAHE API - Get Episodes
// ============================================================
async function getEpisodes(animeId, page = 1) {
    console.log(`📺 Getting episodes for anime ID: ${animeId}`);
    try {
        const url = `https://animepahe.pw/api?m=release&id=${animeId}&page=${page}&sort=episode_asc`;
        const response = await scraper.get(url);
        const data = JSON.parse(response);
        
        if (data.data && data.data.length > 0) {
            return data.data.map(ep => ({
                id: ep.id,
                episode: ep.episode,
                title: ep.title || `Episode ${ep.episode}`,
                hasVideo: ep.has_video || false,
                session: ep.session || null
            }));
        }
        return [];
    } catch (error) {
        console.error('Episodes error:', error.message);
        return [];
    }
}

// ============================================================
// ANIMEPAHE API - Get Video Links (The tricky part)
// ============================================================
async function getVideoLinks(episodeId) {
    console.log(`🎬 Getting video links for episode: ${episodeId}`);
    try {
        // Step 1: Get the episode page with the player
        const url = `https://animepahe.pw/play/${episodeId}`;
        const response = await scraper.get(url);
        
        // Step 2: Extract the session and snapshot from the page
        const sessionMatch = response.match(/session:"([^"]+)"/);
        const snapshotMatch = response.match(/snapshot:"([^"]+)"/);
        
        if (!sessionMatch || !snapshotMatch) {
            console.log('Could not find session/snapshot');
            return null;
        }
        
        const session = sessionMatch[1];
        const snapshot = snapshotMatch[1];
        
        // Step 3: Get the actual video URL from the API
        const videoUrl = `https://animepahe.pw/api?m=links&id=${episodeId}&session=${session}&snapshot=${snapshot}`;
        const videoResponse = await scraper.get(videoUrl);
        const videoData = JSON.parse(videoResponse);
        
        if (videoData.data && videoData.data.links) {
            // Get the best quality (usually 1080p or highest available)
            const links = videoData.data.links;
            const qualities = ['1080p', '720p', '480p', '360p'];
            
            for (const quality of qualities) {
                if (links[quality]) {
                    return {
                        quality: quality,
                        url: links[quality]
                    };
                }
            }
            
            // Fallback: get the first available
            const firstKey = Object.keys(links)[0];
            if (firstKey) {
                return {
                    quality: firstKey,
                    url: links[firstKey]
                };
            }
        }
        
        return null;
    } catch (error) {
        console.error('Video links error:', error.message);
        return null;
    }
}

// ============================================================
// ALTERNATIVE: Use Node.js to execute JS challenge (Pal-droid approach)
// ============================================================
async function getVideoWithNodeJS(episodeId) {
    console.log(`🧠 Attempting JS challenge bypass for episode: ${episodeId}`);
    try {
        // This would use the Pal-droid method of executing the JS challenge
        // For now, we use the direct API method above
        return await getVideoLinks(episodeId);
    } catch (error) {
        console.error('NodeJS method failed:', error.message);
        return null;
    }
}

// ============================================================
// API ROUTES
// ============================================================

// Search anime
app.get('/api/search', async (req, res) => {
    try {
        const { q } = req.query;
        if (!q || q.length < 2) {
            return res.status(400).json({ 
                success: false, 
                error: 'Search query required (minimum 2 characters)' 
            });
        }
        
        const results = await searchAnimePahe(q);
        res.json({
            success: true,
            results: results.slice(0, 20),
            total: results.length,
            query: q,
            source: 'AnimePahe API'
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get episodes for an anime
app.get('/api/episodes', async (req, res) => {
    try {
        const { id, page } = req.query;
        if (!id) {
            return res.status(400).json({ 
                success: false, 
                error: 'Anime ID required' 
            });
        }
        
        const episodes = await getEpisodes(id, parseInt(page) || 1);
        res.json({
            success: true,
            episodes: episodes,
            total: episodes.length,
            animeId: id
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get video link for an episode
app.get('/api/video', async (req, res) => {
    try {
        const { id } = req.query;
        if (!id) {
            return res.status(400).json({ 
                success: false, 
                error: 'Episode ID required' 
            });
        }
        
        const video = await getVideoWithNodeJS(id);
        
        if (video && video.url) {
            res.json({
                success: true,
                videoUrl: video.url,
                quality: video.quality || 'HD',
                episodeId: id,
                source: 'AnimePahe'
            });
        } else {
            res.status(404).json({
                success: false,
                error: 'No video link found for this episode'
            });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'operational',
        timestamp: new Date().toISOString(),
        endpoints: [
            { path: '/api/search?q=query', method: 'GET', description: 'Search anime' },
            { path: '/api/episodes?id=anime_id', method: 'GET', description: 'Get episodes' },
            { path: '/api/video?id=episode_id', method: 'GET', description: 'Get video link' }
        ]
    });
});

module.exports = app;
