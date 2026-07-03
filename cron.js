const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const cheerio = require('cheerio');
const zlib = require('zlib');

// Custom fetch with proper decompression
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
            const chunks = [];
            
            res.on('data', (chunk) => {
                chunks.push(chunk);
            });
            
            res.on('end', () => {
                let buffer = Buffer.concat(chunks);
                
                // Handle decompression
                const encoding = res.headers['content-encoding'];
                if (encoding === 'gzip') {
                    zlib.gunzip(buffer, (err, decoded) => {
                        if (err) reject(err);
                        else resolve(decoded.toString());
                    });
                } else if (encoding === 'deflate') {
                    zlib.inflate(buffer, (err, decoded) => {
                        if (err) reject(err);
                        else resolve(decoded.toString());
                    });
                } else {
                    resolve(buffer.toString());
                }
            });
        });
        
        req.on('error', reject);
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
            console.log(`📡 Attempt ${i + 1}: ${url}`);
            const data = await fetchUrl(url);
            console.log(`✅ Success (${data.length} bytes)`);
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
        $('a').each((i, element) => {
            const $el = $(element);
            const href = $el.attr('href');
            
            // Look for episode links
            if (href && (href.includes('/episode') || href.includes('/watch') || href.includes('/video'))) {
                const title = $el.find('.title, .episode-title, h3, h4').first().text().trim() || `Episode ${episodes.length + 1}`;
                const image = $el.find('img').attr('src') || $el.find('img').attr('data-src');
                
                episodes.push({
                    id: episodes.length + 1,
                    title: title,
                    episode: episodes.length + 1,
                    description: 'No description available',
                    image: image ? (image.startsWith('http') ? image : `https://animepahe.pw${image}`) : null,
                    link: href.startsWith('http') ? href : `https://animepahe.pw${href}`,
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
        
        // Also check for episode boxes
        $('.episode-box, .episode-item, .video-item, .anime-item, .item').each((i, element) => {
            const $el = $(element);
            const title = $el.find('.episode-title, .title, h3, h4, .name').first().text().trim();
            const link = $el.find('a').attr('href');
            const image = $el.find('img').attr('src') || $el.find('img').attr('data-src');
            
            if (title && link && !episodes.find(e => e.link === link)) {
                episodes.push({
                    id: episodes.length + 1,
                    title: title,
                    episode: episodes.length + 1,
                    description: $el.find('.description, .synopsis, .summary, p').text().trim() || 'No description available',
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
        
        console.log(`📊 Found ${episodes.length} episodes`);
        
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
        
        console.log(`✅ Saved ${episodes.length} episodes successfully`);
        return data;
        
    } catch (error) {
        console.error('❌ Scrape error:', error.message);
        throw error;
    }
}

// Run if called directly
if (require.main === module) {
    scrapeFullDetails()
        .then(() => {
            console.log('✅ Cron job completed');
            process.exit(0);
        })
        .catch((error) => {
            console.error('❌ Cron job failed:', error.message);
            process.exit(1);
        });
}

module.exports = { scrapeFullDetails };
