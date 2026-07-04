// ============================================================
// REWIND BACKEND - With AnimePahe Search (Safe Version)
// ============================================================

const express = require('express');
const cors = require('cors');
const https = require('https');
const http = require('http');

const app = express();
app.use(cors());
app.use(express.json());

// ============================================================
// FETCH FUNCTION - Simple and safe
// ============================================================
function fetchUrl(url) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const isHttps = urlObj.protocol === 'https:';
        const client = isHttps ? https : http;
        
        const options = {
            hostname: urlObj.hostname,
            port: urlObj.port || (isHttps ? 443 : 80),
            path: urlObj.pathname + urlObj.search,
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive'
            },
            timeout: 10000
        };
        
        const req = client.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => resolve(data));
        });
        
        req.on('error', (error) => reject(error));
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });
        
        req.end();
    });
}

// ============================================================
// SEARCH ANIME - Try AnimePahe, fallback to sample
// ============================================================
app.get('/api/search', async (req, res) => {
    try {
        const { q } = req.query;
        
        if (!q || q.length < 2) {
            return res.status(400).json({
                success: false,
                error: 'Search query required (minimum 2 characters)'
            });
        }

        console.log(`🔍 Searching for: ${q}`);
        
        let results = [];
        let source = 'Sample Data';

        try {
            // Try AnimePahe API
            const paheUrl = `https://animepahe.pw/api?m=search&q=${encodeURIComponent(q)}`;
            console.log(`📡 Fetching: ${paheUrl}`);
            
            const response = await fetchUrl(paheUrl);
            const data = JSON.parse(response);
            
            if (data.data && data.data.length > 0) {
                results = data.data.map(item => ({
                    id: item.id,
                    title: item.title,
                    episodes: item.episodes || '?',
                    image: item.poster ? `https://animepahe.pw${item.poster}` : null,
                    type: item.type || 'TV',
                    year: item.year || 'TBA',
                    score: item.score || 'N/A',
                    malId: item.mal_id || null
                }));
                source = 'AnimePahe API';
                console.log(`✅ Found ${results.length} results from AnimePahe`);
            }
        } catch (paheError) {
            console.log(`⚠️ AnimePahe error: ${paheError.message}`);
            // Fallback to sample data
        }

        // If no results, use sample data
        if (results.length === 0) {
            results = [
                {
                    id: 1,
                    title: `${q} - Sample Result 1`,
                    episodes: 100,
                    image: null,
                    type: 'TV',
                    year: 2024,
                    score: '8.5',
                    malId: null
                },
                {
                    id: 2,
                    title: `${q} - Sample Result 2`,
                    episodes: 50,
                    image: null,
                    type: 'TV',
                    year: 2023,
                    score: '8.0',
                    malId: null
                }
            ];
            source = 'Sample Data (AnimePahe unavailable)';
        }

        res.json({
            success: true,
            results: results.slice(0, 20),
            total: results.length,
            query: q,
            source: source,
            note: results.length > 0 ? 'Showing results' : 'No results found'
        });

    } catch (error) {
        console.error('Search error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================================
// GET EPISODES
// ============================================================
app.get('/api/episodes', async (req, res) => {
    try {
        const { id } = req.query;
        
        if (!id) {
            return res.status(400).json({
                success: false,
                error: 'Anime ID required'
            });
        }

        console.log(`📺 Getting episodes for anime ID: ${id}`);
        
        let episodes = [];
        let source = 'Sample Data';

        try {
            // Try AnimePahe API
            const paheUrl = `https://animepahe.pw/api?m=release&id=${id}&page=1&sort=episode_asc`;
            console.log(`📡 Fetching: ${paheUrl}`);
            
            const response = await fetchUrl(paheUrl);
            const data = JSON.parse(response);
            
            if (data.data && data.data.length > 0) {
                episodes = data.data.map(ep => ({
                    id: ep.id,
                    episode: ep.episode,
                    title: ep.title || `Episode ${ep.episode}`,
                    hasVideo: ep.has_video || false,
                    session: ep.session || null
                }));
                source = 'AnimePahe API';
                console.log(`✅ Found ${episodes.length} episodes from AnimePahe`);
            }
        } catch (paheError) {
            console.log(`⚠️ AnimePahe error: ${paheError.message}`);
        }

        // Fallback to sample
        if (episodes.length === 0) {
            episodes = [
                { id: 101, episode: 1, title: 'Episode 1', hasVideo: true },
                { id: 102, episode: 2, title: 'Episode 2', hasVideo: true },
                { id: 103, episode: 3, title: 'Episode 3', hasVideo: true },
                { id: 104, episode: 4, title: 'Episode 4', hasVideo: true },
                { id: 105, episode: 5, title: 'Episode 5', hasVideo: true }
            ];
            source = 'Sample Data (AnimePahe unavailable)';
        }

        res.json({
            success: true,
            episodes: episodes,
            total: episodes.length,
            animeId: id,
            source: source
        });

    } catch (error) {
        console.error('Episodes error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================================
// GET VIDEO LINK
// ============================================================
app.get('/api/video', async (req, res) => {
    try {
        const { id } = req.query;
        
        if (!id) {
            return res.status(400).json({
                success: false,
                error: 'Episode ID required'
            });
        }

        console.log(`🎬 Getting video for episode: ${id}`);
        
        let videoUrl = null;
        let quality = 'HD';
        let source = 'Sample Video';

        try {
            // Try AnimePahe API
            // Step 1: Get the episode page
            const playUrl = `https://animepahe.pw/play/${id}`;
            console.log(`📡 Fetching: ${playUrl}`);
            
            const html = await fetchUrl(playUrl);
            
            // Step 2: Extract session and snapshot
            const sessionMatch = html.match(/session:"([^"]+)"/);
            const snapshotMatch = html.match(/snapshot:"([^"]+)"/);
            
            if (sessionMatch && snapshotMatch) {
                const session = sessionMatch[1];
                const snapshot = snapshotMatch[1];
                
                // Step 3: Get video links
                const linksUrl = `https://animepahe.pw/api?m=links&id=${id}&session=${session}&snapshot=${snapshot}`;
                console.log(`📡 Fetching: ${linksUrl}`);
                
                const linksResponse = await fetchUrl(linksUrl);
                const linksData = JSON.parse(linksResponse);
                
                if (linksData.data && linksData.data.links) {
                    const links = linksData.data.links;
                    // Try to get 1080p, then 720p, then any
                    const qualities = ['1080p', '720p', '480p', '360p'];
                    for (const q of qualities) {
                        if (links[q]) {
                            videoUrl = links[q];
                            quality = q;
                            source = 'AnimePahe API';
                            console.log(`✅ Found ${quality} video`);
                            break;
                        }
                    }
                }
            }
        } catch (paheError) {
            console.log(`⚠️ AnimePahe video error: ${paheError.message}`);
        }

        // Fallback to sample video if AnimePahe fails
        if (!videoUrl) {
            videoUrl = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4';
            quality = '1080p (Sample)';
            source = 'Sample Video (Testing)';
            console.log('📹 Using sample video');
        }

        res.json({
            success: true,
            videoUrl: videoUrl,
            quality: quality,
            episodeId: id,
            source: source,
            note: videoUrl ? 'Video found' : 'No video available'
        });

    } catch (error) {
        console.error('Video error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================================
// HEALTH CHECK
// ============================================================
app.get('/api/health', (req, res) => {
    res.json({
        status: 'operational ✅',
        timestamp: new Date().toISOString(),
        message: 'Backend is running!',
        endpoints: [
            { path: '/api/search?q=query', method: 'GET', description: 'Search anime' },
            { path: '/api/episodes?id=anime_id', method: 'GET', description: 'Get episodes' },
            { path: '/api/video?id=episode_id', method: 'GET', description: 'Get video link' },
            { path: '/api/health', method: 'GET', description: 'Health check' }
        ]
    });
});

// ============================================================
// CATCH-ALL
// ============================================================
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'Endpoint not found',
        availableEndpoints: [
            '/api/search?q=query',
            '/api/episodes?id=anime_id',
            '/api/video?id=episode_id',
            '/api/health'
        ]
    });
});

module.exports = app;
