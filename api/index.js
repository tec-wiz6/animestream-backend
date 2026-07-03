const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const cloudscraper = require('cloudscraper');
const cheerio = require('cheerio');

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

const cloudscraperInstance = cloudscraper.create({
    headers: BROWSER_HEADERS,
    timeout: 30000,
    gzip: true,
    agent: new (require('http').Agent)({ keepAlive: true, maxSockets: 10 })
});

// ============================================================
// SCRAPE FUNCTION - Full details
// ============================================================
async function scrapeFullDetails() {
    console.log('🔄 Starting scrape at:', new Date().toISOString());
    
    try {
        const targetUrl = process.env.TARGET_URL || 'https://animepahe.pw/';
        
        const response = await cloudscraperInstance({
            method: 'GET',
            uri: targetUrl,
            headers: BROWSER_HEADERS,
            followRedirect: true,
            timeout: 30000
        });
        
        const $ = cheerio.load(response);
        const episodes = [];
        
        // Enhanced scraping - get ALL details
        $('.episode-box, .episode-item, .video-item, .anime-item, .item').each((i, element) => {
            const $el = $(element);
            
            const title = $el.find('.episode-title, .title, h3, h4, .name').first().text().trim();
            const description = $el.find('.description, .synopsis, .summary, p, .desc').text().trim();
            const image = $el.find('img').attr('src') || $el.find('img').attr('data-src') || $el.find('img').attr('data-original');
            const link = $el.find('a').attr('href') || $el.find('a').attr('data-href');
            const episodeNum = $el.find('.episode-number, .ep-num, .num, .episode').text().trim() || (i + 1);
            
            let releaseDate = $el.find('.release-date, .date, .time, .updated').text().trim();
            if (!releaseDate) {
                releaseDate = $el.find('[data-date], [data-release]').attr('data-date') || 
                              $el.find('[datetime]').attr('datetime');
            }
            
            const quality = $el.find('.quality, .hd, .resolution, .q').text().trim() || 'HD';
            const type = $el.find('.type, .sub, .dub, .lang').text().trim() || 'Subbed';
            const rating = $el.find('.rating, .score, .rate').text().trim() || 'N/A';
            
            if (title || link) {
                episodes.push({
                    id: i + 1,
                    title: title || `Episode ${episodeNum}`,
                    episode: parseInt(episodeNum) || i + 1,
                    description: description || 'No description available',
                    image: image ? (image.startsWith('http') ? image : `https://animepahe.pw${image}`) : null,
                    link: link ? (link.startsWith('http') ? link : `https://animepahe.pw${link}`) : null,
                    quality: quality || 'HD',
                    type: type || 'Subbed',
                    rating: rating || 'N/A',
                    releaseDate: releaseDate || new Date().toISOString().split('T')[0],
                    timestamp: new Date().toISOString(),
                    season: $el.find('.season').text().trim() || 'Season 1',
                    studio: $el.find('.studio, .by').text().trim() || 'Unknown',
                    genres: $el.find('.genre, .tags, .categories').text().trim().split(',').map(g => g.trim()).filter(Boolean) || []
                });
            }
        });
        
        // If no episodes found, try fallback selectors
        if (episodes.length === 0) {
            $('a[href*="/episode"], a[href*="/watch"], a[href*="/video"], a[href*="/anime"]').each((i, element) => {
                const $el = $(element);
                const title = $el.text().trim() || `Episode ${i+1}`;
                const link = $el.attr('href');
                const image = $el.find('img').attr('src') || $el.find('img').attr('data-src');
                
                if (link) {
                    episodes.push({
                        id: i + 1,
                        title: title,
                        episode: i + 1,
                        description: 'No description available',
                        image: image ? (image.startsWith('http') ? image : `https://animepahe.pw${image}`) : null,
                        link: link.startsWith('http') ? link : `https://animepahe.pw${link}`,
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
        }
        
        // Save to cache
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

// ============================================================
// EXTRACT VIDEO SOURCE
// ============================================================
function extractVideoSource(html) {
    const $ = cheerio.load(html);
    let videoUrl = null;
    
    // Check scripts for m3u8
    $('script').each((i, script) => {
        const content = $(script).html() || '';
        
        const m3u8Matches = content.match(/(https?:\/\/[^\s'"]+\.m3u8[^\s'"]*)/);
        if (m3u8Matches) {
            videoUrl = m3u8Matches[1];
            return false;
        }
        
        // Check for base64 encoded
        const encodedMatches = content.match(/['"]([A-Za-z0-9+\/]+={0,2})['"]/);
        if (encodedMatches) {
            try {
                const decoded = Buffer.from(encodedMatches[1], 'base64').toString('utf-8');
                if (decoded.includes('.m3u8')) {
                    const urlMatch = decoded.match(/(https?:\/\/[^\s'"]+\.m3u8[^\s'"]*)/);
                    if (urlMatch) {
                        videoUrl = urlMatch[1];
                        return false;
                    }
                }
            } catch (e) {}
        }
        
        // Check for eval/packer
        if (content.includes('eval(function(p,a,c,k,e,d)')) {
            const evalMatch = content.match(/eval\(function\(p,a,c,k,e,d\)\{([\s\S]*?)\}\)/);
            if (evalMatch) {
                try {
                    const decoded = evalMatch[1];
                    const urlMatch = decoded.match(/(https?:\/\/[^\s'"]+\.m3u8[^\s'"]*)/);
                    if (urlMatch) {
                        videoUrl = urlMatch[1];
                        return false;
                    }
                } catch (e) {}
            }
        }
    });
    
    // Check iframes
    $('iframe[src]').each((i, iframe) => {
        const src = $(iframe).attr('src');
        if (src && (src.includes('kwik') || src.includes('m3u8') || src.includes('video'))) {
            videoUrl = src;
            return false;
        }
    });
    
    return videoUrl;
}

// ============================================================
// API ROUTES
// ============================================================

// Get cached episodes (fast)
app.get('/api/episodes', async (req, res) => {
    try {
        const dataPath = path.join(__dirname, '../data/episodes.json');
        
        if (fs.existsSync(dataPath)) {
            const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
            const cacheAge = Date.now() - new Date(data.lastUpdated).getTime();
            
            if (cacheAge < 300000) { // 5 minutes
                return res.json({
                    success: true,
                    cached: true,
                    ...data
                });
            }
        }
        
        // Cache old or missing - scrape fresh
        const freshData = await scrapeFullDetails();
        res.json({
            success: true,
            cached: false,
            ...freshData
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to get episodes'
        });
    }
});

// Fresh scrape
app.get('/api/scrape/latest', async (req, res) => {
    try {
        const data = await scrapeFullDetails();
        res.json({
            success: true,
            ...data
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Extract video
app.get('/api/extract/video', async (req, res) => {
    try {
        const episodeUrl = req.query.url;
        if (!episodeUrl) {
            return res.status(400).json({ error: 'Episode URL required' });
        }
        
        const response = await cloudscraperInstance({
            method: 'GET',
            uri: episodeUrl,
            headers: {
                ...BROWSER_HEADERS,
                'Referer': 'https://animepahe.pw/'
            },
            followRedirect: true,
            timeout: 20000
        });
        
        const videoUrl = extractVideoSource(response);
        
        if (videoUrl) {
            res.json({
                success: true,
                videoUrl: videoUrl,
                source: episodeUrl
            });
        } else {
            res.status(404).json({
                success: false,
                error: 'No video source found'
            });
        }
        
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'operational',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
    });
});

module.exports = app;