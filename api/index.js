const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const cheerio = require('cheerio');

const app = express();
app.use(cors());
app.use(express.json());

// Fetch HTML with retry
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
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
                'Cache-Control': 'max-age=0',
                'Referer': 'https://www.google.com/'
            },
            timeout: 30000
        };
        
        const req = client.request(options, (res) => {
            const chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => {
                const buffer = Buffer.concat(chunks);
                resolve(buffer.toString());
            });
        });
        req.on('error', reject);
        req.end();
    });
}

// 🔥 THE REAL VIDEO EXTRACTOR
async function extractVideoUrl(episodeUrl) {
    console.log(`🔍 Extracting video from: ${episodeUrl}`);
    
    try {
        const html = await fetchUrl(episodeUrl);
        const $ = cheerio.load(html);
        
        let videoUrl = null;
        
        // METHOD 1: Look for iframe sources
        $('iframe').each((i, iframe) => {
            const src = $(iframe).attr('src');
            if (src && (src.includes('kwik') || src.includes('player') || src.includes('video') || src.includes('embed'))) {
                videoUrl = src;
                console.log(`✅ Found iframe: ${videoUrl}`);
                return false;
            }
        });
        
        // METHOD 2: Look for m3u8 in scripts
        if (!videoUrl) {
            $('script').each((i, script) => {
                const content = $(script).html() || '';
                const m3u8Match = content.match(/(https?:\/\/[^\s'"]+\.m3u8[^\s'"]*)/);
                if (m3u8Match) {
                    videoUrl = m3u8Match[1];
                    console.log(`✅ Found m3u8 in script: ${videoUrl}`);
                    return false;
                }
            });
        }
        
        // METHOD 3: Look for video source
        if (!videoUrl) {
            $('video source').each((i, source) => {
                const src = $(source).attr('src');
                if (src && src.includes('.m3u8')) {
                    videoUrl = src;
                    console.log(`✅ Found video source: ${videoUrl}`);
                    return false;
                }
            });
        }
        
        return videoUrl;
        
    } catch (error) {
        console.error(`❌ Video extraction failed: ${error.message}`);
        return null;
    }
}

// 🔥 SEARCH for anime
async function searchAnime(query) {
    console.log(`🔍 Searching for: ${query}`);
    
    const results = [];
    const sites = [
        {
            name: 'AnimePahe',
            url: 'https://animepahe.pw/',
            searchUrl: `https://animepahe.pw/search?q=${encodeURIComponent(query)}`
        },
        {
            name: '9Anime',
            url: 'https://9anime.to/',
            searchUrl: `https://9anime.to/search?keyword=${encodeURIComponent(query)}`
        }
    ];
    
    for (const site of sites) {
        try {
            const html = await fetchUrl(site.searchUrl);
            const $ = cheerio.load(html);
            
            $('a').each((i, link) => {
                const text = $(link).text().trim();
                const href = $(link).attr('href');
                
                if (text && href && 
                    (href.includes('/episode') || href.includes('/watch') || href.includes('/video')) &&
                    text.toLowerCase().includes(query.toLowerCase())) {
                    
                    const url = href.startsWith('http') ? href : `${site.url}${href}`;
                    if (!results.find(r => r.url === url)) {
                        results.push({
                            title: text,
                            url: url,
                            source: site.name
                        });
                    }
                }
            });
            
            // Limit results per site
            if (results.length >= 10) break;
            
        } catch (error) {
            console.log(`❌ Search on ${site.name} failed: ${error.message}`);
        }
    }
    
    return results;
}

// 🚀 API Endpoint: Get video link for an episode
app.get('/api/getvideo', async (req, res) => {
    try {
        const { url } = req.query;
        
        if (!url) {
            return res.status(400).json({ 
                success: false,
                error: 'URL parameter required',
                example: '/api/getvideo?url=https://animepahe.pw/episode/123'
            });
        }
        
        const videoUrl = await extractVideoUrl(url);
        
        if (videoUrl) {
            res.json({
                success: true,
                videoUrl: videoUrl,
                source: 'extracted',
                timestamp: new Date().toISOString()
            });
        } else {
            res.status(404).json({
                success: false,
                error: 'Could not find video link. Try a different episode URL.'
            });
        }
        
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// 🚀 API Endpoint: Search for anime episodes
app.get('/api/search', async (req, res) => {
    try {
        const { q } = req.query;
        if (!q || q.length < 2) {
            return res.status(400).json({
                success: false,
                error: 'Search query required (minimum 2 characters)'
            });
        }
        
        const results = await searchAnime(q);
        
        res.json({
            success: true,
            results: results.slice(0, 20),
            total: results.length,
            query: q
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// 🚀 API Endpoint: Get cached episodes
app.get('/api/episodes', (req, res) => {
    try {
        const dataPath = path.join(__dirname, '../data/episodes.json');
        if (fs.existsSync(dataPath)) {
            const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
            res.json({
                success: true,
                ...data
            });
        } else {
            // Return sample data if no cache exists
            res.json({
                success: true,
                totalEpisodes: 5,
                lastUpdated: new Date().toISOString(),
                episodes: [
                    {
                        id: 1,
                        title: "One Piece Episode 1000",
                        episode: 1000,
                        description: "The Straw Hats arrive at a new island",
                        image: null,
                        link: null,
                        quality: "HD",
                        type: "Subbed",
                        rating: "8.5",
                        releaseDate: new Date().toISOString().split('T')[0],
                        timestamp: new Date().toISOString(),
                        season: "Season 1",
                        studio: "Toei Animation",
                        genres: ["Action", "Adventure"],
                        source: "Sample"
                    }
                ],
                note: "Use search to find episodes, or run the scraper to populate data"
            });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 🚀 API Endpoint: Health check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'operational',
        timestamp: new Date().toISOString(),
        endpoints: [
            { path: '/api/episodes', method: 'GET', description: 'Get cached episodes' },
            { path: '/api/search?q=query', method: 'GET', description: 'Search for anime' },
            { path: '/api/getvideo?url=episode_url', method: 'GET', description: 'Extract video link' }
        ]
    });
});

module.exports = app;
