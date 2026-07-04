const puppeteer = require('puppeteer');

const BASE_URL = 'https://hianime.ro';

async function getEpisodeVideoSourceBrowser(animeSlug, episodeNum) {
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

    await page.goto(watchUrl, { waitUntil: 'networkidle2', timeout: 60000 });

    // Instead of page.waitForTimeout, use plain JS delay
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // Try to locate an iframe that looks like a player
    const iframeSrc = await page.evaluate(() => {
      const iframes = Array.from(document.querySelectorAll('iframe'));
      const candidates = iframes.filter((f) => {
        const src = f.getAttribute('src') || f.getAttribute('data-src') || '';
        const s = src.toLowerCase();
        return (
          src &&
          (s.includes('embed') ||
           s.includes('player') ||
           s.includes('video') ||
           s.includes('stream') ||
           s.includes('gogo'))
        );
      });

      const chosen = candidates[0] || iframes[0];
      if (!chosen) return null;

      const src =
        chosen.getAttribute('src') || chosen.getAttribute('data-src') || '';
      return src || null;
    });

    if (iframeSrc) {
      let iframeUrl = iframeSrc;
      if (iframeUrl.startsWith('//')) {
        iframeUrl = 'https:' + iframeUrl;
      }

      console.log(
        `  ✅ [Browser] Found iframe source: ${iframeUrl.substring(0, 120)}...`
      );

      return {
        url: iframeUrl,
        sources: [{ quality: 'HD', url: iframeUrl }],
        watchUrl,
        sourceCount: 1,
        via: 'puppeteer'
      };
    }

    // Fallback: try to find a <video> tag
    const videoSrc = await page.evaluate(() => {
      const video = document.querySelector('video');
      if (!video) return null;

      const source = video.querySelector('source');
      if (source && source.src) return source.src;

      if (video.src) return video.src;
      return null;
    });

    if (videoSrc) {
      console.log(
        `  ✅ [Browser] Found <video> source: ${videoSrc.substring(0, 120)}...`
      );

      return {
        url: videoSrc,
        sources: [{ quality: 'HD', url: videoSrc }],
        watchUrl,
        sourceCount: 1,
        via: 'puppeteer'
      };
    }

    console.log(
      '  ⚠️ [Browser] No iframe/video source found after JS execution, using watch URL'
    );

    return {
      url: watchUrl,
      sources: [{ quality: 'HD', url: watchUrl }],
      watchUrl,
      fallback: true,
      via: 'puppeteer'
    };
  } catch (err) {
    console.error('❌ [Browser] Error getting video source:', err.message);
    return {
      url: `${BASE_URL}/watch/${animeSlug}-episode-${episodeNum}`,
      sources: [
        { quality: 'HD', url: `${BASE_URL}/watch/${animeSlug}-episode-${episodeNum}` }
      ],
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
