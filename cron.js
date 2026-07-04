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
        
        // DEBUG: Save HTML for inspection
        const debugDir = path.join(__dirname, 'debug');
        if (!fs.existsSync(debugDir)) {
            fs.mkdirSync(debugDir, { recursive: true });
        }
        fs.writeFileSync(path.join(debugDir, 'page.html'), html);
        console.log('📄 Saved HTML for debugging');
        
        const episodes = [];
        
        // Try ALL possible selectors
        const selectors = [
            // Common anime/episode selectors
            '.episode-box',
            '.episode-item',
            '.video-item',
            '.anime-item',
            '.item',
            '.episode',
            '.video',
            '.card',
            '.post',
            '.entry',
            '.item-episode',
            '.episode-card',
            '.video-card',
            // Links with specific patterns
            'a[href*="/episode"]',
            'a[href*="/watch"]',
            'a[href*="/video"]',
            'a[href*="/anime"]',
            'a[href*="/stream"]',
            'a[href*="/play"]',
            // Any div with episode-like content
            'div[class*="episode"]',
            'div[class*="video"]',
            'div[class*="anime"]',
            'div[class*="item"]',
            // Container elements
            '.list-item',
            '.media-item',
            '.content-item',
            '.result-item'
        ];
        
        let foundAny = false;
        
        for (const selector of selectors) {
            const elements = $(selector);
            if (elements.length > 0) {
                console.log(`✅ Found ${elements.length} items with selector: ${selector}`);
                foundAny = true;
                
                elements.each((i, element) => {
                    const $el = $(element);
                    
                    // Try to extract episode info
                    let title = $el.find('.title, .episode-title, h3, h4, .name, .heading, .label').first().text().trim();
                    let link = $el.attr('href') || $el.find('a').attr('href') || $el.find('a').attr('data-href');
                    let image = $el.find('img').attr('src') || $el.find('img').attr('data-src') || $el.find('img').attr('data-original');
                    let episodeNum = $el.find('.episode-number, .ep-num, .num, .number, .index').text().trim() || (i + 1);
                    
                    // If no title, try to get from text
                    if (!title) {
                        title = $el.text().trim().split('\n')[0].trim();
                    }
                    
                    // Clean up link
                    if (link && !link.startsWith('http')) {
                        link = `https://animepahe.pw${link.startsWith('/') ? '' : '/'}${link}`;
                    }
                    
                    // Only add if we have a title or link
                    if (title || link) {
                        const existing = episodes.find(e => e.link === link);
                        if (!existing) {
                            episodes.push({
                                id: episodes.length + 1,
                                title: title || `Episode ${episodeNum}`,
                                episode: parseInt(episodeNum) || episodes.length + 1,
                                description: $el.find('.description, .synopsis, .summary, .desc, p').text().trim() || 'No description available',
                                image: image ? (image.startsWith('http') ? image : `https://animepahe.pw${image}`) : null,
                                link: link || null,
                                quality: $el.find('.quality, .hd, .resolution, .q').text().trim() || 'HD',
                                type: $el.find('.type, .sub, .dub, .lang').text().trim() || 'Subbed',
                                rating: $el.find('.rating, .score, .rate').text().trim() || 'N/A',
                                releaseDate: $el.find('.release-date, .date, .time').text().trim() || new Date().toISOString().split('T')[0],
                                timestamp: new Date().toISOString(),
                                season: 'Season 1',
                                studio: 'Unknown',
                                genres: []
                            });
                        }
                    }
                });
                
                // If we found episodes, stop trying more selectors
                if (episodes.length > 0) {
                    console.log(`✅ Found ${episodes.length} total episodes so far`);
                    break;
                }
            }
        }
        
        // If still no episodes, try a more aggressive approach
        if (episodes.length === 0) {
            console.log('🔄 Trying aggressive fallback...');
            
            // Find ANY link that might be an episode
            $('a').each((i, element) => {
                const $el = $(element);
                const href = $el.attr('href');
                const text = $el.text().trim();
                
                if (href && (
                    href.includes('/episode') || 
                    href.includes('/watch') || 
                    href.includes('/video') ||
                    href.includes('/anime') ||
                    href.includes('/stream')
                )) {
                    const title = text || `Episode ${episodes.length + 1}`;
                    const image = $el.find('img').attr('src') || $el.find('img').attr('data-src');
                    
                    const existing = episodes.find(e => e.link === href);
                    if (!existing && href) {
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
                }
            });
        }
        
        // Log final results
        console.log(`📊 Found ${episodes.length} episodes total`);
        
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
        console.error('Stack:', error.stack);
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
