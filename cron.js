const fs = require('fs');
const path = require('path');
const https = require('https');

// 🔥 WORKING ANIME APIS (No Cloudflare!)
async function fetchFromAPI(url) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const options = {
            hostname: urlObj.hostname,
            port: 443,
            path: urlObj.pathname + urlObj.search,
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'application/json'
            }
        };
        
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(e);
                }
            });
        });
        req.on('error', reject);
        req.end();
    });
}

// Get anime from Jikan API (MyAnimeList)
async function getAnimeFromJikan() {
    console.log('📡 Fetching from Jikan API...');
    
    try {
        // Get top anime
        const response = await fetchFromAPI('https://api.jikan.moe/v4/top/anime?limit=25');
        const episodes = [];
        
        if (response.data) {
            response.data.forEach((anime, index) => {
                episodes.push({
                    id: index + 1,
                    title: anime.title,
                    episode: index + 1,
                    description: anime.synopsis || 'No description available',
                    image: anime.images?.jpg?.image_url || null,
                    link: anime.url || null,
                    quality: 'HD',
                    type: anime.type || 'TV',
                    rating: anime.score ? anime.score.toString() : 'N/A',
                    releaseDate: anime.aired?.from ? new Date(anime.aired.from).toISOString().split('T')[0] : 'Unknown',
                    timestamp: new Date().toISOString(),
                    season: 'Latest',
                    studio: anime.studios?.[0]?.name || 'Unknown',
                    genres: anime.genres?.map(g => g.name) || [],
                    source: 'MyAnimeList (Jikan API)'
                });
            });
        }
        
        console.log(`✅ Found ${episodes.length} anime from Jikan API`);
        return episodes;
        
    } catch (error) {
        console.error('❌ Jikan API failed:', error.message);
        return [];
    }
}

// Get anime from Kitsu API
async function getAnimeFromKitsu() {
    console.log('📡 Fetching from Kitsu API...');
    
    try {
        const response = await fetchFromAPI('https://kitsu.io/api/edge/anime?page[limit]=20');
        const episodes = [];
        
        if (response.data) {
            response.data.forEach((item, index) => {
                const attributes = item.attributes;
                episodes.push({
                    id: index + 1,
                    title: attributes.canonicalTitle || 'Unknown',
                    episode: index + 1,
                    description: attributes.synopsis || 'No description available',
                    image: attributes.posterImage?.original || null,
                    link: `https://kitsu.io/anime/${item.id}`,
                    quality: 'HD',
                    type: attributes.showType || 'TV',
                    rating: attributes.averageRating ? (parseFloat(attributes.averageRating) / 10).toFixed(1) : 'N/A',
                    releaseDate: attributes.startDate || 'Unknown',
                    timestamp: new Date().toISOString(),
                    season: 'Latest',
                    studio: 'Unknown',
                    genres: attributes.categories?.map(c => c.name) || [],
                    source: 'Kitsu API'
                });
            });
        }
        
        console.log(`✅ Found ${episodes.length} anime from Kitsu API`);
        return episodes;
        
    } catch (error) {
        console.error('❌ Kitsu API failed:', error.message);
        return [];
    }
}

// Get anime from AniList (GraphQL)
async function getAnimeFromAniList() {
    console.log('📡 Fetching from AniList API...');
    
    try {
        const query = JSON.stringify({
            query: `
                query {
                    Page(page: 1, perPage: 20) {
                        media(type: ANIME, sort: POPULARITY_DESC) {
                            title { romaji english }
                            description
                            coverImage { large }
                            episodes
                            averageScore
                            startDate { year month day }
                            studios { nodes { name } }
                            genres
                            siteUrl
                        }
                    }
                }
            `
        });
        
        const url = new URL('https://graphql.anilist.co');
        const options = {
            hostname: url.hostname,
            port: 443,
            path: url.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'User-Agent': 'Mozilla/5.0'
            }
        };
        
        const result = await new Promise((resolve, reject) => {
            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => data += chunk);
                res.on('end', () => {
                    try {
                        resolve(JSON.parse(data));
                    } catch (e) {
                        reject(e);
                    }
                });
            });
            req.on('error', reject);
            req.write(query);
            req.end();
        });
        
        const episodes = [];
        if (result.data?.Page?.media) {
            result.data.Page.media.forEach((anime, index) => {
                const title = anime.title?.english || anime.title?.romaji || 'Unknown';
                const date = anime.startDate ? 
                    `${anime.startDate.year}-${String(anime.startDate.month).padStart(2, '0')}-${String(anime.startDate.day).padStart(2, '0')}` : 
                    'Unknown';
                
                episodes.push({
                    id: index + 1,
                    title: title,
                    episode: anime.episodes || index + 1,
                    description: (anime.description || 'No description available').replace(/<[^>]*>/g, ''),
                    image: anime.coverImage?.large || null,
                    link: anime.siteUrl || null,
                    quality: 'HD',
                    type: 'TV',
                    rating: anime.averageScore ? (anime.averageScore / 10).toFixed(1) : 'N/A',
                    releaseDate: date,
                    timestamp: new Date().toISOString(),
                    season: 'Latest',
                    studio: anime.studios?.nodes?.[0]?.name || 'Unknown',
                    genres: anime.genres || [],
                    source: 'AniList API'
                });
            });
        }
        
        console.log(`✅ Found ${episodes.length} anime from AniList API`);
        return episodes;
        
    } catch (error) {
        console.error('❌ AniList API failed:', error.message);
        return [];
    }
}

// Scrape ALL sources
async function scrapeFullDetails() {
    console.log('🔄 Starting API scrape at:', new Date().toISOString());
    console.log('📡 Using official anime APIs (No Cloudflare!)');
    
    try {
        let allEpisodes = [];
        const siteResults = {};
        
        // Get from Jikan
        const jikanEpisodes = await getAnimeFromJikan();
        siteResults['MyAnimeList (Jikan)'] = jikanEpisodes.length;
        allEpisodes = allEpisodes.concat(jikanEpisodes);
        
        // Get from Kitsu
        const kitsuEpisodes = await getAnimeFromKitsu();
        siteResults['Kitsu API'] = kitsuEpisodes.length;
        allEpisodes = allEpisodes.concat(kitsuEpisodes);
        
        // Get from AniList
        const anilistEpisodes = await getAnimeFromAniList();
        siteResults['AniList API'] = anilistEpisodes.length;
        allEpisodes = allEpisodes.concat(anilistEpisodes);
        
        // Remove duplicates
        const seen = new Set();
        const uniqueEpisodes = allEpisodes.filter(ep => {
            const key = ep.title.toLowerCase().trim();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
        
        console.log('\n📊 Summary:');
        for (const [site, count] of Object.entries(siteResults)) {
            console.log(`  ${site}: ${count} anime`);
        }
        console.log(`\n📊 Total: ${allEpisodes.length} anime from all APIs`);
        console.log(`📊 Unique: ${uniqueEpisodes.length} unique anime`);
        
        // Save to file
        const dataDir = path.join(__dirname, 'data');
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
        
        const data = {
            lastUpdated: new Date().toISOString(),
            totalEpisodes: uniqueEpisodes.length,
            episodes: uniqueEpisodes.slice(0, 200),
            siteStats: siteResults,
            source: 'Official APIs (No Cloudflare!)'
        };
        
        fs.writeFileSync(
            path.join(dataDir, 'episodes.json'),
            JSON.stringify(data, null, 2)
        );
        
        console.log(`\n✅ Saved ${uniqueEpisodes.length} anime successfully`);
        console.log('📌 Note: This is anime data (title, description, image, rating)');
        console.log('📌 To get actual video links, you need to scrape episode pages separately');
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
