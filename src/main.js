import { Actor, log } from 'apify';
import { chromium } from 'playwright';

/**
 * Media Link Extractor Actor
 * Uses virtual browser to extract media links from any website
 * Simulates pressing F12 to find video URLs
 */

Actor.main(async () => {
    await Actor.init();

    const input = await Actor.getInput();
    const {
        url,
        cookies,
        proxyConfiguration: proxyConfig,
        waitForVideo = true,
        timeout = 30
    } = input;

    if (!url) {
        throw new Error('URL is required');
    }

    log.info(`🎬 Starting media link extraction for: ${url}`);

    // Create proxy configuration if provided
    let proxyConfigObj = null;
    if (proxyConfig) {
        proxyConfigObj = await Actor.createProxyConfiguration(proxyConfig);
        log.info(`🌐 Proxy configuration created`);
    }

    // Launch browser with proxy if configured
    const browserOptions = {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    };

    let proxyServer = null;
    if (proxyConfigObj) {
        const proxyInfo = await proxyConfigObj.newUrl();
        proxyServer = proxyInfo;
        log.info(`🔧 Using proxy: ${proxyServer}`);
        browserOptions.proxy = { server: proxyServer };
    }

    const browser = await chromium.launch(browserOptions);
    const context = await browser.newContext();

    // Add cookies if provided
    if (cookies) {
        try {
            const cookiesArray = parseNetscapeCookies(cookies);
            await context.addCookies(cookiesArray);
            log.info(`🍪 Added ${cookiesArray.length} cookies`);
        } catch (error) {
            log.warning(`Failed to parse cookies: ${error.message}`);
        }
    }

    const page = await context.newPage();

    try {
        log.info(`📄 Navigating to: ${url}`);
        await page.goto(url, { 
            waitUntil: 'networkidle',
            timeout: timeout * 1000
        });

        // Wait for video elements if requested
        if (waitForVideo) {
            log.info(`⏳ Waiting for video elements to load...`);
            try {
                await page.waitForSelector('video, source, iframe', { 
                    timeout: 10000 
                });
                log.info(`✅ Video elements found`);
            } catch (error) {
                log.warning(`No video elements found within timeout`);
            }
        }

        // Extract media links using JavaScript in the browser
        const mediaLinks = await page.evaluate(() => {
            const links = [];

            // Get all video elements
            const videos = document.querySelectorAll('video');
            videos.forEach((video, index) => {
                if (video.src) links.push({ type: 'video', url: video.src, method: 'video.src' });
                if (video.currentSrc) links.push({ type: 'video', url: video.currentSrc, method: 'video.currentSrc' });
                
                // Check for source children
                const sources = video.querySelectorAll('source');
                sources.forEach(source => {
                    if (source.src) links.push({ type: 'video', url: source.src, method: 'source.src' });
                    if (source.srcset) {
                        source.srcset.split(',').forEach(s => {
                            const url = s.trim().split(' ')[0];
                            if (url) links.push({ type: 'video', url, method: 'source.srcset' });
                        });
                    }
                });
            });

            // Get all audio elements
            const audios = document.querySelectorAll('audio');
            audios.forEach(audio => {
                if (audio.src) links.push({ type: 'audio', url: audio.src, method: 'audio.src' });
                if (audio.currentSrc) links.push({ type: 'audio', url: audio.currentSrc, method: 'audio.currentSrc' });
            });

            // Get all iframe elements (potential embedded videos)
            const iframes = document.querySelectorAll('iframe');
            iframes.forEach(iframe => {
                if (iframe.src) links.push({ type: 'iframe', url: iframe.src, method: 'iframe.src' });
            });

            // Search for video URLs in network requests (simulating F12 Network tab)
            // This would require intercepting network requests, but we can check for common patterns
            const allElements = document.querySelectorAll('*');
            allElements.forEach(element => {
                // Check data attributes
                ['data-src', 'data-url', 'data-video-url', 'data-media-url'].forEach(attr => {
                    const value = element.getAttribute(attr);
                    if (value && (value.includes('.mp4') || value.includes('.webm') || value.includes('.m3u8'))) {
                        links.push({ type: 'data-attribute', url: value, method: attr });
                    }
                });
            });

            // Look for video URLs in scripts (potential JSON data)
            const scripts = document.querySelectorAll('script');
            scripts.forEach(script => {
                const content = script.textContent;
                if (content) {
                    // Match common video URL patterns
                    const patterns = [
                        /https?:\/\/[^"'\s]+\.(mp4|webm|m3u8|mov|avi)/gi,
                        /https?:\/\/[^"'\s]+\/video\/[^"'\s]+/gi,
                        /https?:\/\/[^"'\s]+\/stream\/[^"'\s]+/gi
                    ];
                    
                    patterns.forEach(pattern => {
                        const matches = content.match(pattern);
                        if (matches) {
                            matches.forEach(url => {
                                if (!links.find(l => l.url === url)) {
                                    links.push({ type: 'script-embedded', url, method: 'regex-pattern' });
                                }
                            });
                        }
                    });
                }
            });

            return links;
        });

        log.info(`🔍 Found ${mediaLinks.length} media links`);

        // Filter and deduplicate links
        const uniqueLinks = mediaLinks.filter((link, index, self) =>
            index === self.findIndex(l => l.url === link.url)
        );

        log.info(`✨ ${uniqueLinks.length} unique media links after filtering`);

        // Save results to dataset
        await Actor.pushData({
            url,
            mediaLinks: uniqueLinks,
            proxyUsed: proxyServer || 'none',
            timestamp: new Date().toISOString()
        });

        log.info(`💾 Results saved to dataset`);

        // Also save as key-value store for easy access
        await Actor.setValue('media-links', uniqueLinks);
        await Actor.setValue('original-url', url);

        log.info(`✅ Media link extraction completed successfully`);

    } catch (error) {
        log.error(`❌ Error during extraction: ${error.message}`);
        throw error;
    } finally {
        await browser.close();
    }

    await Actor.exit();
});

/**
 * Parse Netscape cookie format
 */
function parseNetscapeCookies(cookieString) {
    const lines = cookieString.split('\n').filter(line => 
        line.trim() && !line.startsWith('#')
    );
    
    return lines.map(line => {
        const parts = line.split('\t');
        if (parts.length >= 7) {
            return {
                domain: parts[0],
                path: parts[2],
                name: parts[5],
                value: parts[6],
                httpOnly: parts[1] === 'TRUE',
                secure: parts[3] === 'TRUE',
                sameSite: 'Lax'
            };
        }
        return null;
    }).filter(cookie => cookie !== null);
}
