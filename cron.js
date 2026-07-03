const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const cheerio = require('cheerio');

// Custom fetch using native HTTPS
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
                'Accept-Encoding': 'gzip, deflate',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1'
            },
            timeout: 30000
        };
        
        const req = client.request(options, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 400) {
                    resolve(data);
                } else {
                    reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
                }
            });
        });
        
        req.on('error', (error) => {
            reject(error);
        });
        
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });
        
        req.end();
    });
}

// Fetch with retry
async function fetchWithRetry(url, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            console.log(`📡 Attempt ${i + 1} to fetch: ${url}`);
            const data = await fetchUrl(url);
            return data;
        } catch (error) {
            console.log(`❌ Attempt ${i + 1} failed: ${error.message}`);
            if (i === retries - 1) throw error;
            await new Promise(resolve => setTimeout(resolve, 3000 * (i + 1)));
        }
    }
}

// Scrape function
async function scrapeFullDetails() {
    console.log('🔄 Starting scrape at:', new Date().toISOString());
    
    try {
        const targetUrl = process.env.TARGET_URL || 'https://animepahe.pw/';
        console.log(`📡 Fetching: ${targetUrl}`);
        
        const html = await fetchWithRetry(targetUrl);
        const $ = cheerio.load(html);
        
        const episodes = [];
        
        // Try multiple selectors
        const selectors = [
            '.episode-box',
            '.episode-item', 
            '.video-item',
            '.anime-item',
            '.item',
            '.episode',
            '.video'
        ];
        
        for (const selector of selectors) {
            const elements = $(selector);
            if (elements.length > 0) {
                console.log(`✅ Found ${elements.length} items with selector: ${selector}`);
                
                elements.each((i, element) => {
                    const $el = $(element);
                    
                    const title = $el.find('.episode-title, .title, h3, h4, .name').first().text().trim();
                    const description = $el.find('.description, .synopsis, .summary, p, .desc').text().trim();
                    const image = $el.find('img').attr('src') || $el.find('img').attr('data-src') || $el.find('img').attr('data-original');
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
        
        // Fallback
        if (episodes.length === 0) {
            console.log('🔄 Trying fallback selectors...');
            $('a[href*="/episode"], a[href*="/watch"], a[href*="/video"]').each((i, element) => {
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
        
        // Save to file
        const dataDir = path.join(__dirname, 'data');
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
        
        console.log(`✅ Scraped ${episodes.length} episodes successfully`);
        return data;
        
    } catch (error) {
        console.error('❌ Scrape error:', error.message);
        console.error('Stack:', error.stack);
        throw error;
    }
}

// Run if called directly
if (require.main === module) {
    scrapeFullDetails()
        .then(() => {
            console.log('✅ Cron job completed successfully');
            process.exit(0);
        })
        .catch((error) => {
            console.error('❌ Cron job failed:', error.message);
            process.exit(1);
        });
}

module.exports = { scrapeFullDetails };
