const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');
const https = require('https');

const app = express();
app.use(cors());
app.use(express.json());

// Advanced headers for Cloudflare bypass
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

const axiosInstance = axios.create({
    timeout: 30000,
    headers: BROWSER_HEADERS,
    httpsAgent: new https.Agent({
        rejectUnauthorized: false,
        keepAlive: true
    }),
    maxRedirects: 5
});

// Fetch with retry
async function fetchWithRetry(url, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await axiosInstance.get(url);
            return response;
        } catch (error) {
            if (i === retries - 1) throw error;
            await new Promise(resolve => setTimeout(resolve, 2000 * (i + 1)));
        }
    }
}

// Scrape function
async function scrapeFullDetails() {
    console.log('🔄 Starting scrape at:', new Date().toISOString());
    
    try {
        const targetUrl = process.env.TARGET_URL || 'https://animepahe.pw/';
        const response = await fetchWithRetry(targetUrl);
        const $ = cheerio.load(response.data);
        
        const episodes = [];
        
        // Try multiple selectors
        const selectors = ['.episode-box', '.episode-item', '.video-item', '.anime-item', '.item', '.episode'];
        
        for (const selector of selectors) {
            const elements = $(selector);
            if (elements.length > 0) {
                elements.each((i, element) => {
                    const $el = $(element);
                    const title = $el.find('.episode-title, .title, h3, h4, .name').first().text().trim();
                    const description = $el.find('.description, .synopsis, .summary, p, .desc').text().trim();
                    const image = $el.find('img').attr('src') || $el.find('img').attr('data-src');
                    const link = $el.find('a').attr('href') || $el.find('a').attr('data-href');
                    const episodeNum = $el.find('.episode-number, .ep-num, .num, .episode').text().trim() || (i + 1);
                    
                    if (title || link) {
                        episodes.push({
                            id: i + 1,
                            title: title || `Episode ${episodeNum}`,
                            episode: parseInt(episodeNum) || i + 1,
                            description: description || 'No description available',
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
                if (episodes.length > 0) break;
            }
        }
        
        // Save to file
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
    
    $('iframe[src]').each((i, iframe) => {
        const src = $(iframe).attr('src');
        if (src && (src.includes('kwik') || src.includes('m3u8') || src.includes('video'))) {
            videoUrl = src;
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
        
        const response = await fetchWithRetry(episodeUrl);
        const videoUrl = extractVideoSource(response.data);
        
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
