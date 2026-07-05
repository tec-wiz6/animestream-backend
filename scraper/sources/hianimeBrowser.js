// scraper/sources/hianimeBrowser.js - FIXED to wait for video
const puppeteer = require('puppeteer');

const BASE_URL = 'https://hianime.ro';

async function getEpisodeVideoSourceBrowser(animeSlug, episodeNum) {
  // Use the SLUG to build the URL
  const watchUrl = `${BASE_URL}/watch/${animeSlug}-episode-${episodeNum}`;
  console.log(`🌐 [Browser] Opening: ${watchUrl}`);

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage'
      ]
    });

    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
      'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // Navigate to the watch page
    await page.goto(watchUrl, { waitUntil: 'networkidle2', timeout: 60000 });

    // ============================================================
    // CRITICAL: Wait for the video player to load
    // ============================================================
    console.log('  ⏳ Waiting for video player to load...');
    
    // Wait for any iframe or video element to appear
    await page.waitForSelector('iframe, video', { timeout: 30000 }).catch(() => {
      console.log('  ⚠️ No iframe/video found, but continuing...');
    });

    // Wait a bit more for dynamic content
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // ============================================================
    // Try multiple methods to find the video URL
    // ============================================================

    // Method 1: Check all iframes
    const iframeSrc = await page.evaluate(() => {
      const iframes = Array.from(document.querySelectorAll('iframe'));
      
      // Filter for video player iframes
      const candidates = iframes.filter((f) => {
        const src = f.getAttribute('src') || f.getAttribute('data-src') || '';
        const s = src.toLowerCase();
        return (
          src &&
          (s.includes('embed') ||
           s.includes('player') ||
           s.includes('video') ||
           s.includes('stream') ||
           s.includes('gogo') ||
           s.includes('megaplay') ||
           s.includes('mp4upload') ||
           s.includes('dood') ||
           s.includes('streamtape'))
        );
      });

      // If no candidates, return the first iframe
      const chosen = candidates[0] || iframes[0];
      if (!chosen) return null;

      const src = chosen.getAttribute('src') || chosen.getAttribute('data-src') || '';
      return src || null;
    });

    if (iframeSrc) {
      let iframeUrl = iframeSrc;
      if (iframeUrl.startsWith('//')) {
        iframeUrl = 'https:' + iframeUrl;
      }
      console.log(`  ✅ [Browser] Found iframe source: ${iframeUrl}`);
      return {
        url: iframeUrl,
        sources: [{ quality: 'HD', url: iframeUrl }],
        watchUrl,
        sourceCount: 1,
        via: 'puppeteer-iframe'
      };
    }

    // Method 2: Check for video element
    const videoSrc = await page.evaluate(() => {
      const video = document.querySelector('video');
      if (!video) return null;

      // Check if video has src
      if (video.src) return video.src;

      // Check source children
      const source = video.querySelector('source');
      if (source && source.src) return source.src;

      return null;
    });

    if (videoSrc) {
      console.log(`  ✅ [Browser] Found video source: ${videoSrc}`);
      return {
        url: videoSrc,
        sources: [{ quality: 'HD', url: videoSrc }],
        watchUrl,
        sourceCount: 1,
        via: 'puppeteer-video'
      };
    }

    // Method 3: Check for script variables containing video URL
    const scriptVideo = await page.evaluate(() => {
      // Look for common video URL patterns in scripts
      const scripts = Array.from(document.querySelectorAll('script'));
      const allScripts = scripts.map(s => s.textContent).join(' ');
      
      // Pattern for megaplay or other embed URLs
      const patterns = [
        /https?:\/\/[^"'\s]+\.megaplay\.[^"'\s]+/i,
        /https?:\/\/[^"'\s]+\.mp4upload\.[^"'\s]+/i,
        /https?:\/\/[^"'\s]+\.dood\.[^"'\s]+/i,
        /https?:\/\/[^"'\s]+\.streamtape\.[^"'\s]+/i,
        /https?:\/\/[^"'\s]+\.(m3u8|mp4)[^"'\s]*/i,
        /file\s*:\s*['"]([^'"]+)['"]/i,
        /url\s*:\s*['"]([^'"]+)['"]/i,
        /src\s*:\s*['"]([^'"]+)['"]/i
      ];

      for (const pattern of patterns) {
        const match = allScripts.match(pattern);
        if (match) {
          return match[1] || match[0];
        }
      }
      return null;
    });

    if (scriptVideo) {
      console.log(`  ✅ [Browser] Found video in script: ${scriptVideo}`);
      return {
        url: scriptVideo,
        sources: [{ quality: 'HD', url: scriptVideo }],
        watchUrl,
        sourceCount: 1,
        via: 'puppeteer-script'
      };
    }

    // Method 4: Check for player container data attributes
    const playerData = await page.evaluate(() => {
      const containers = document.querySelectorAll(
        '.player-container, .video-player, #player, .embed-container, .jwplayer'
      );
      
      for (const container of containers) {
        const data = container.getAttribute('data-video') || 
                     container.getAttribute('data-src') || 
                     container.getAttribute('data-url');
        if (data) return data;
        
        // Check inner HTML
        const html = container.innerHTML;
        const match = html.match(/https?:\/\/[^"'\s]+\.(m3u8|mp4)[^"'\s]*/i);
        if (match) return match[0];
      }
      return null;
    });

    if (playerData) {
      console.log(`  ✅ [Browser] Found video in player data: ${playerData}`);
      return {
        url: playerData,
        sources: [{ quality: 'HD', url: playerData }],
        watchUrl,
        sourceCount: 1,
        via: 'puppeteer-player'
      };
    }

    // ============================================================
    // Method 5: Extract the embed URL from the page (megaplay specific)
    // ============================================================
    const megaplayUrl = await page.evaluate(() => {
      // Find any link or iframe that goes to megaplay
      const links = Array.from(document.querySelectorAll('a, iframe'));
      for (const el of links) {
        const href = el.getAttribute('href') || el.getAttribute('src') || '';
        if (href.includes('megaplay') || href.includes('mp4upload') || href.includes('dood')) {
          return href;
        }
      }

      // Check all scripts for megaplay URLs
      const scripts = Array.from(document.querySelectorAll('script'));
      for (const script of scripts) {
        const content = script.textContent;
        if (content) {
          const match = content.match(/https?:\/\/[^"'\s]*megaplay[^"'\s]*/i);
          if (match) return match[0];
        }
      }
      return null;
    });

    if (megaplayUrl) {
      const cleanUrl = megaplayUrl.startsWith('//') ? `https:${megaplayUrl}` : megaplayUrl;
      console.log(`  ✅ [Browser] Found megaplay URL: ${cleanUrl}`);
      return {
        url: cleanUrl,
        sources: [{ quality: 'HD', url: cleanUrl }],
        watchUrl,
        sourceCount: 1,
        via: 'puppeteer-megaplay'
      };
    }

    // ============================================================
    // Method 6: Try to get the embed URL from the page's HTML
    // ============================================================
    const pageHTML = await page.content();
    const embedMatch = pageHTML.match(/https?:\/\/[^"'\s]*megaplay[^"'\s]*/i) ||
                       pageHTML.match(/https?:\/\/[^"'\s]*mp4upload[^"'\s]*/i) ||
                       pageHTML.match(/https?:\/\/[^"'\s]*doodstream[^"'\s]*/i) ||
                       pageHTML.match(/https?:\/\/[^"'\s]*streamtape[^"'\s]*/i);
    
    if (embedMatch) {
      console.log(`  ✅ [Browser] Found embed in page HTML: ${embedMatch[0]}`);
      return {
        url: embedMatch[0],
        sources: [{ quality: 'HD', url: embedMatch[0] }],
        watchUrl,
        sourceCount: 1,
        via: 'puppeteer-html'
      };
    }

    // ============================================================
    // If all methods fail, return the watch URL as fallback
    // ============================================================
    console.log('  ⚠️ [Browser] No video source found, returning watch URL');
    return {
      url: watchUrl,
      sources: [{ quality: 'HD', url: watchUrl }],
      watchUrl,
      fallback: true,
      via: 'puppeteer-fallback'
    };

  } catch (err) {
    console.error('❌ [Browser] Error getting video source:', err.message);
    return {
      url: `${BASE_URL}/watch/${animeSlug}-episode-${episodeNum}`,
      sources: [{ quality: 'HD', url: `${BASE_URL}/watch/${animeSlug}-episode-${episodeNum}` }],
      watchUrl: `${BASE_URL}/watch/${animeSlug}-episode-${episodeNum}`,
      error: err.message,
      via: 'puppeteer-error'
    };
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch (_) {}
    }
  }
}

module.exports = { getEpisodeVideoSourceBrowser };
