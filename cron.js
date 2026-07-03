const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const cheerio = require('cheerio');

// Simple fetch with retry
async function fetchWithRetry(url, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            console.log(`📡 Attempt ${i + 1} to fetch: ${url}`);
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Connection': 'keep-alive'
                },
                timeout: 30000
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const text = await response.text();
            return text;
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
        
        // Try multiple selectors to find episodes
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
                
                if (episodes.length > 0) break;
            }
        }
        
        // Fallback: find any links to episodes
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
