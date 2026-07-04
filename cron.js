const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const cheerio = require('cheerio');
const zlib = require('zlib');

// List of anime sites to scrape
const ANIME_SITES = [
    {
        name: 'GoGoAnime',
        url: 'https://gogoanime3.cc/',
        selectors: ['.episode-item', '.video-item', '.anime-item', '.item', 'a[href*="/episode"]'],
        titleSelector: '.title, .episode-title, h3, h4, .name',
        linkSelector: 'a',
        imageSelector: 'img'
    },
    {
        name: 'AnimeFox',
        url: 'https://animefox.tv/',
        selectors: ['.episode-box', '.video-item', '.anime-item', 'a[href*="/watch"]'],
        titleSelector: '.title, .episode-title, h3, h4',
        linkSelector: 'a',
        imageSelector: 'img'
    },
    {
        name: '9Anime',
        url: 'https://9anime.to/',
        selectors: ['.episode-item', '.video-item', '.anime-item', 'a[href*="/watch"]'],
        titleSelector: '.title, .episode-title, h3, h4',
        linkSelector: 'a',
        imageSelector: 'img'
    },
    {
        name: 'Zoro',
        url: 'https://zoro.to/',
        selectors: ['.episode-item', '.video-item', '.anime-item', 'a[href*="/watch"]'],
        titleSelector: '.title, .episode-title, h3, h4',
        linkSelector: 'a',
        imageSelector: 'img'
    },
    {
        name: 'AnimeSuge',
        url: 'https://animesuge.to/',
        selectors: ['.episode-item', '.video-item', '.anime-item', 'a[href*="/watch"]'],
        titleSelector: '.title, .episode-title, h3, h4',
        linkSelector: 'a',
        imageSelector: 'img'
    }
];

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
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Sec-Fetch-User': '?1',
                'Cache-Control': 'max-age=0',
                'Referer': 'https://www.google.com/',
                'DNT': '1'
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

// Scrape a single site
async function scrapeSite(site) {
    console.log(`\n🌐 Scraping ${site.name}: ${site.url}`);
    
    try {
        const html = await fetchWithRetry(site.url);
        const $ = cheerio.load(html);
        const episodes = [];
        
        // Try all selectors for this site
        for (const selector of site.selectors) {
            const elements = $(selector);
            if (elements.length > 0) {
                console.log(`✅ Found ${elements.length} items with selector: ${selector}`);
                
                elements.each((i, element) => {
                    const $el = $(element);
                    
                    let title = $el.find(site.titleSelector).first().text().trim();
                    let link = $el.find(site.linkSelector).attr('href') || $el.attr('href');
                    let image = $el.find(site.imageSelector).attr('src') || 
                                $el.find(site.imageSelector).attr('data-src') || 
                                $el.find(site.imageSelector).attr('data-original');
                    
                    // If no title, try to get from text
                    if (!title) {
                        title = $el.text().trim().split('\n')[0].trim();
                    }
                    
                    // Clean up link
                    if (link && !link.startsWith('http')) {
                        const baseUrl = site.url.endsWith('/') ? site.url.slice(0, -1) : site.url;
                        link = link.startsWith('/') ? baseUrl + link : baseUrl + '/' + link;
                    }
                    
                    // Only add if we have a title or link
                    if (title || link) {
                        episodes.push({
                            id: episodes.length + 1,
                            title: title || `Episode ${episodes.length + 1}`,
                            episode: episodes.length + 1,
                            description: $el.find('.description, .synopsis, .summary, .desc, p').text().trim() || 'No description available',
                            image: image ? (image.startsWith('http') ? image : `${site.url}${image}`) : null,
                            link: link || null,
                            quality: $el.find('.quality, .hd, .resolution, .q').text().trim() || 'HD',
                            type: $el.find('.type, .sub, .dub, .lang').text().trim() || 'Subbed',
                            rating: $el.find('.rating, .score, .rate').text().trim() || 'N/A',
                            releaseDate: $el.find('.release-date, .date, .time').text().trim() || new Date().toISOString().split('T')[0],
                            timestamp: new Date().toISOString(),
                            season: 'Season 1',
                            studio: 'Unknown',
                            genres: [],
                            source: site.name
                        });
                    }
                });
                
                // If we found episodes, stop trying more selectors
                if (episodes.length > 0) {
                    console.log(`✅ Found ${episodes.length} episodes from ${site.name}`);
                    break;
                }
            }
        }
        
        // Aggressive fallback for this site
        if (episodes.length === 0) {
            console.log(`🔄 Trying aggressive fallback for ${site.name}...`);
            
            $('a').each((i, element) => {
                const $el = $(element);
                const href = $el.attr('href');
                const text = $el.text().trim();
                
                if (href && (
                    href.includes('/episode') || 
                    href.includes('/watch') || 
                    href.includes('/video') ||
                    href.includes('/anime') ||
                    href.includes('/stream') ||
                    href.includes('/play')
                )) {
                    const title = text || `Episode ${episodes.length + 1}`;
                    const image = $el.find('img').attr('src') || $el.find('img').attr('data-src');
                    
                    const existing = episodes.find(e => e.link === href);
                    if (!existing && href) {
                        const baseUrl = site.url.endsWith('/') ? site.url.slice(0, -1) : site.url;
                        const link = href.startsWith('http') ? href : (href.startsWith('/') ? baseUrl + href : baseUrl + '/' + href);
                        
                        episodes.push({
                            id: episodes.length + 1,
                            title: title,
                            episode: episodes.length + 1,
                            description: 'No description available',
                            image: image ? (image.startsWith('http') ? image : baseUrl + '/' + image) : null,
                            link: link,
                            quality: 'HD',
                            type: 'Subbed',
                            rating: 'N/A',
                            releaseDate: new Date().toISOString().split('T')[0],
                            timestamp: new Date().toISOString(),
                            season: 'Season 1',
                            studio: 'Unknown',
                            genres: [],
                            source: site.name
                        });
                    }
                }
            });
        }
        
        console.log(`✅ ${site.name}: Found ${episodes.length} episodes`);
        return episodes;
        
    } catch (error) {
        console.log(`❌ ${site.name} failed: ${error.message}`);
        return []; // Return empty array for failed sites
    }
}

// Scrape ALL sites
async function scrapeFullDetails() {
    console.log('🔄 Starting multi-site scrape at:', new Date().toISOString());
    console.log(`🌐 Will scrape ${ANIME_SITES.length} sites`);
    
    try {
        let allEpisodes = [];
        const siteResults = {};
        
        // Scrape each site
        for (const site of ANIME_SITES) {
            const episodes = await scrapeSite(site);
            siteResults[site.name] = episodes.length;
            allEpisodes = allEpisodes.concat(episodes);
            
            // Small delay between sites to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
        // Remove duplicates based on title and link
        const seen = new Set();
        const uniqueEpisodes = allEpisodes.filter(ep => {
            const key = `${ep.title}-${ep.link}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
        
        // Log results
        console.log('\n📊 Summary:');
        for (const [site, count] of Object.entries(siteResults)) {
            console.log(`  ${site}: ${count} episodes`);
        }
        console.log(`\n📊 Total: ${allEpisodes.length} episodes from all sites`);
        console.log(`📊 Unique: ${uniqueEpisodes.length} unique episodes after deduplication`);
        
        // Save to file
        const dataDir = path.join(__dirname, 'data');
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
        
        const data = {
            lastUpdated: new Date().toISOString(),
            totalEpisodes: uniqueEpisodes.length,
            episodes: uniqueEpisodes.slice(0, 200), // Store up to 200 episodes
            siteStats: siteResults
        };
        
        fs.writeFileSync(
            path.join(dataDir, 'episodes.json'),
            JSON.stringify(data, null, 2)
        );
        
        console.log(`\n✅ Saved ${uniqueEpisodes.length} unique episodes successfully`);
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
            console.log('\n✅ Cron job completed');
            process.exit(0);
        })
        .catch((error) => {
            console.error('\n❌ Cron job failed:', error.message);
            process.exit(1);
        });
}

module.exports = { scrapeFullDetails };
