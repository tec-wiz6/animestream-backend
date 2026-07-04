// ============================================================
// REWIND BACKEND - Simplified Working Version
// ============================================================

const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// ============================================================
// SIMPLE SEARCH - Works without cloudscraper
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

        // Sample data for testing
        const sampleResults = [
            {
                id: 1,
                title: `${q} - Episode 1`,
                episodes: 100,
                image: null,
                type: 'TV',
                year: 2024,
                score: '8.5'
            },
            {
                id: 2,
                title: `${q} - Episode 2`,
                episodes: 50,
                image: null,
                type: 'TV',
                year: 2023,
                score: '8.0'
            }
        ];

        res.json({
            success: true,
            results: sampleResults,
            total: sampleResults.length,
            query: q,
            source: 'Sample Data (Backend Working!)'
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
// EPISODES - Sample data
// ============================================================
app.get('/api/episodes', async (req, res) => {
    try {
        const { id } = req.query;
        
        console.log(`📺 Getting episodes for anime ID: ${id}`);

        const sampleEpisodes = [
            { id: 101, episode: 1, title: 'Episode 1', hasVideo: true },
            { id: 102, episode: 2, title: 'Episode 2', hasVideo: true },
            { id: 103, episode: 3, title: 'Episode 3', hasVideo: true },
            { id: 104, episode: 4, title: 'Episode 4', hasVideo: true },
            { id: 105, episode: 5, title: 'Episode 5', hasVideo: true }
        ];

        res.json({
            success: true,
            episodes: sampleEpisodes,
            total: sampleEpisodes.length,
            animeId: id
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
// VIDEO LINK - Returns sample video
// ============================================================
app.get('/api/video', async (req, res) => {
    try {
        const { id } = req.query;
        
        console.log(`🎬 Getting video for episode: ${id}`);

        // Sample video URL (this is a real test video from Google)
        // Replace this with actual AnimePahe video links when working
        const sampleVideo = {
            success: true,
            videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
            quality: '1080p',
            episodeId: id,
            source: 'Sample Video (Testing)'
        };

        res.json(sampleVideo);

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
// CATCH-ALL - Handle 404s
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
