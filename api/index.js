const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const cheerio = require('cheerio');

const app = express();
app.use(cors());
app.use(express.json());

// Simple fetch function
async function fetchWithRetry(url, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Accept-Encoding': 'gzip, deflate, br'
                },
                timeout: 30000
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            return await response.text();
        } catch (error) {
            if (i === retries - 1) throw error;
            await new Promise(resolve => setTimeout(resolve, 3000 * (i + 1)));
        }
    }
}

// Scrape function
async function scrapeFullDetails() {
    console.log('🔄 Starting scrape...');
    try {
        const targetUrl = process.env.TARGET_URL || 'https://animepahe.pw/';
        const html = await fetchWithRetry(targetUrl);
        const $ = cheerio.load(html);
        
        const episodes = [];
        
        $('.episode-box, .episode-item, .video-item, .anime-item, .item').each((i, element) => {
            const $el = $(element);
            const title = $el.find('.episode-title, .title, h3, h4').first().text().trim();
            const image = $el.find('img').attr('src') || $el.find('img').attr('data-src');
            const link = $el.find('a').attr('href') || $el.find('a').attr('data-href');
            const episodeNum = $el.find('.episode-number, .ep-num, .num').text().trim() || (i + 1);
            
            if (title || link) {
                episodes.push({
                    id: i + 1,
                    title: title || `Episode ${episodeNum}`,
                    episode: parseInt(episodeNum) || i + 1,
                    description: 'No description available',
                    image: image ? (image.startsWith('http') ? image : `https://animepahe.pw${image}`) : null,
                    link: link ? (link.startsWith('http') ? link : `https://animepahe.pw${link}`) : null,
                    quality: 'HD',
                    type: 'Subbed',
                    rating: 'N/A',
                    releaseDate: new Date().toISOString().split('T')[0],
                    timestamp: new Date().toISOString(),
                    season: 'Season 1',
                    studio: 'Unknown',
                    genres: []
                });
            }
        });
        
        const dataDir = path.join(__dirname, '../data');
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
        
        const data = {
            lastUpdated: new Date().toISOString(),
            totalEpisodes: episodes.length,
            episodes: episodes.slice(0, 100)
        };
        
        fs.writeFileSync(
            path.join(dataDir, 'episodes.json'),
            JSON.stringify(data, null, 2)
        );
        
        console.log(`✅ Scraped ${episodes.length} episodes`);
        return data;
        
    } catch (error) {
        console.error('❌ Scrape error:', error.message);
        throw error;
    }
}

// Extract video source
function extractVideoSource(html) {
    const $ = cheerio.load(html);
    let videoUrl = null;
    
    $('script').each((i, script) => {
        const content = $(script).html() || '';
        const m3u8Matches = content.match(/(https?:\/\/[^\s'"]+\.m3u8[^\s'"]*)/);
        if (m3u8Matches) {
            videoUrl = m3u8Matches[1];
            return false;
        }
    });
    
    return videoUrl;
}

// API Routes
app.get('/api/episodes', async (req, res) => {
    try {
        const dataPath = path.join(__dirname, '../data/episodes.json');
        if (fs.existsSync(dataPath)) {
            const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
            return res.json({ success: true, cached: true, ...data });
        }
        const freshData = await scrapeFullDetails();
        res.json({ success: true, cached: false, ...freshData });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/scrape/latest', async (req, res) => {
    try {
        const data = await scrapeFullDetails();
        res.json({ success: true, ...data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/extract/video', async (req, res) => {
    try {
        const episodeUrl = req.query.url;
        if (!episodeUrl) {
            return res.status(400).json({ error: 'Episode URL required' });
        }
        
        const html = await fetchWithRetry(episodeUrl);
        const videoUrl = extractVideoSource(html);
        
        if (videoUrl) {
            res.json({ success: true, videoUrl, source: episodeUrl });
        } else {
            res.status(404).json({ success: false, error: 'No video source found' });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/health', (req, res) => {
    res.json({
        status: 'operational',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
    });
});

module.exports = app;
