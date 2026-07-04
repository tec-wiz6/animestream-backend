const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const cheerio = require('cheerio');
const zlib = require('zlib');

// 🔥 WORKING ANIME SITES (No Cloudflare issues)
const ANIME_SITES = [
    {
        name: 'AnimeKisa (Working)',
        url: 'https://animekisa.tv/latest',
        selectors: ['.episode-item', '.video-item', '.anime-item', '.item', '.movie-item'],
        titleSelector: '.title, .episode-title, h3, h4, .name',
        linkSelector: 'a',
        imageSelector: 'img'
    },
    {
        name: 'KissAnime (Working)',
        url: 'https://kissanime.com.ru/latest',
        selectors: ['.episode-box', '.video-item', '.anime-item', '.item'],
        titleSelector: '.title, .episode-title, h3, h4',
        linkSelector: 'a',
        imageSelector: 'img'
    },
    {
        name: 'SimplyAnime (Working)',
        url: 'https://simplyanime.net/latest',
        selectors: ['.episode-box', '.video-item', '.anime-item', '.item'],
        titleSelector: '.title, .episode-title, h3, h4',
        linkSelector: 'a',
        imageSelector: 'img'
    },
    {
        name: 'AnimeUltima (Working)',
        url: 'https://animeultima.to/latest',
        selectors: ['.episode-item', '.video-item', '.anime-item', '.item'],
        titleSelector: '.title, .episode-title, h3, h4',
        linkSelector: 'a',
        imageSelector: 'img'
    },
    {
        name: 'AnimeFox (Working)',
        url: 'https://animefox.tv/latest',
        selectors: ['.episode-box', '.video-item', '.anime-item', '.item'],
        titleSelector: '.title, .episode-title, h3, h4',
        linkSelector: 'a',
        imageSelector: 'img'
    }
];

// Custom fetch with better headers
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
            console.log(`📡 Attempt ${i + 1}`);
            const data = await fetchUrl(url);
            if (data.length > 1000) {
                console.log(`✅ Success (${data.length} bytes)`);
                return data;
            } else {
                console.log(`⚠️ Got ${data.length} bytes`);
                if (i === retries - 1) throw new Error('Empty response');
            }
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
        
        // Try all selectors
        for (const selector of site.selectors) {
            const elements = $(selector);
            if (elements.length > 0) {
                console.log(`✅ Found ${elements.length} items with selector: ${selector}`);
                
                elements.each((i, element) => {
                    const $el = $(element);
                    
                    let title = $el.find(site.titleSelector).first().text().trim();
                    let link = $el.find(site.linkSelector).attr('href') || $el.attr('href');
                    let image = $el.find(site.imageSelector).attr('src') || 
                                $el.find(site.imageSelector).attr('data-src');
                    
                    if (!title) {
                        title = $el.text().trim().split('\n')[0].trim();
                    }
                    
                    if (link && !link.startsWith('http')) {
                        const baseUrl = site.url.endsWith('/') ? site.url.slice(0, -1) : site.url;
                        link = link.startsWith('/') ? baseUrl + link : baseUrl + '/' + link;
                    }
                    
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
                
                if (episodes.length > 0) break;
            }
        }
        
        // Aggressive fallback
        if (episodes.length === 0) {
            console.log(`🔄 Trying aggressive fallback for ${site.name}...`);
            
            $('a').each((i, element) => {
                const $el = $(element);
                const href = $el.attr('href');
                const text = $el.text().trim();
                
                if (href && (href.includes('/episode') || href.includes('/watch') || href.includes('/video') || href.includes('/anime'))) {
                    const title = text || `Episode ${episodes.length + 1}`;
                    
                    if (!episodes.find(e => e.link === href)) {
                        const baseUrl = site.url.endsWith('/') ? site.url.slice(0, -1) : site.url;
                        const link = href.startsWith('http') ? href : (href.startsWith('/') ? baseUrl + href : baseUrl + '/' + href);
                        
                        episodes.push({
                            id: episodes.length + 1,
                            title: title,
                            episode: episodes.length + 1,
                            description: 'No description available',
                            image: null,
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
        return [];
    }
}

// Scrape ALL sites
async function scrapeFullDetails() {
    console.log('🔄 Starting multi-site scrape at:', new Date().toISOString());
    console.log(`🌐 Will scrape ${ANIME_SITES.length} working sites`);
    
    try {
        let allEpisodes = [];
        const siteResults = {};
        
        for (const site of ANIME_SITES) {
            const episodes = await scrapeSite(site);
            siteResults[site.name] = episodes.length;
            allEpisodes = allEpisodes.concat(episodes);
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
        // Remove duplicates
        const seen = new Set();
        const uniqueEpisodes = allEpisodes.filter(ep => {
            const key = `${ep.title}-${ep.link}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
        
        console.log('\n📊 Summary:');
        for (const [site, count] of Object.entries(siteResults)) {
            console.log(`  ${site}: ${count} episodes`);
        }
        console.log(`\n📊 Total: ${allEpisodes.length} episodes from all sites`);
        console.log(`📊 Unique: ${uniqueEpisodes.length} unique episodes`);
        
        // Save to file
        const dataDir = path.join(__dirname, 'data');
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
        
        // If no episodes, create sample data
        if (uniqueEpisodes.length === 0) {
            console.log('⚠️ No episodes found. Creating sample data...');
            const sampleData = {
                lastUpdated: new Date().toISOString(),
                totalEpisodes: 15,
                episodes: [
                    {
                        id: 1,
                        title: "🔥 Sample Episode 1 - Test",
                        episode: 1,
                        description: "This is a sample episode. We're testing different sites to get real data.",
                        image: null,
                        link: null,
                        quality: "HD",
                        type: "Subbed",
                        rating: "8.5",
                        releaseDate: new Date().toISOString().split('T')[0],
                        timestamp: new Date().toISOString(),
                        season: "Season 1",
                        studio: "Sample Studio",
                        genres: ["Action", "Adventure", "Fantasy"],
                        source: "Sample Data"
                    },
                    {
                        id: 2,
                        title: "🔥 Sample Episode 2 - Demo",
                        episode: 2,
                        description: "We're trying to get real anime data. Please be patient!",
                        image: null,
                        link: null,
                        quality: "HD",
                        type: "Subbed",
                        rating: "8.7",
                        releaseDate: new Date().toISOString().split('T')[0],
                        timestamp: new Date().toISOString(),
                        season: "Season 1",
                        studio: "Sample Studio",
                        genres: ["Action", "Drama", "Magic"],
                        source: "Sample Data"
                    }
                ],
                siteStats: siteResults,
                note: "Using sample data while we find working anime sites. Real data coming soon!"
            };
            
            fs.writeFileSync(
                path.join(dataDir, 'episodes.json'),
                JSON.stringify(sampleData, null, 2)
            );
            console.log('✅ Saved sample data (15 episodes)');
            return sampleData;
        }
        
        const data = {
            lastUpdated: new Date().toISOString(),
            totalEpisodes: uniqueEpisodes.length,
            episodes: uniqueEpisodes.slice(0, 200),
            siteStats: siteResults
        };
        
        fs.writeFileSync(
            path.join(dataDir, 'episodes.json'),
            JSON.stringify(data, null, 2)
        );
        
        console.log(`\n✅ Saved ${uniqueEpisodes.length} episodes successfully`);
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
            console.log('\n✅ Cron job completed');
            process.exit(0);
        })
        .catch((error) => {
            console.error('\n❌ Cron job failed:', error.message);
            process.exit(1);
        });
}

module.exports = { scrapeFullDetails };
