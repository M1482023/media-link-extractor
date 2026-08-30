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

    // Network interception to capture media requests (like F12 Network tab)
    const networkRequests = [];
    page.on('response', async (response) => {
        const url = response.url();
        const contentType = response.headers()['content-type'] || '';

        // Check if this is a media file - more comprehensive patterns
        if (url.match(/\.(mp4|webm|m3u8|mov|avi|flv|mkv|mp3|wav|ogg|ts|f4v|mpd)/i) ||
            contentType.includes('video') ||
            contentType.includes('audio') ||
            url.includes('stream') ||
            url.includes('hls') ||
            url.includes('video') ||
            url.includes('media') ||
            url.includes('cdn') ||
            url.includes('vod') ||
            url.includes('dash')) {
            networkRequests.push({
                type: 'network-request',
                url: url,
                contentType: contentType,
                method: 'network-interception'
            });
        }
    });

    // Also intercept requests to see what's being requested
    page.on('request', request => {
        const url = request.url();
        if (url.match(/\.(mp4|webm|m3u8|mov|avi|flv|mkv|mp3|wav|ogg|ts|f4v|mpd)/i) ||
            url.includes('stream') ||
            url.includes('hls') ||
            url.includes('video') ||
            url.includes('media') ||
            url.includes('dash')) {
            if (!networkRequests.find(req => req.url === url)) {
                networkRequests.push({
                    type: 'network-request',
                    url: url,
                    contentType: 'unknown',
                    method: 'network-request-interception'
                });
            }
        }
    });

    try {
        log.info(`📄 Navigating to: ${url}`);
        await page.goto(url, {
            waitUntil: 'networkidle',
            timeout: timeout * 1000
        });

        // Wait additional time for dynamic content to load
        log.info(`⏳ Waiting for dynamic content to load...`);
        await page.waitForTimeout(5000);

        // Try to scroll down to trigger lazy loading
        log.info(`📜 Scrolling page to trigger lazy loading...`);
        try {
            await page.evaluate(() => {
                if (document.body) {
                    window.scrollTo(0, document.body.scrollHeight / 2);
                } else {
                    window.scrollTo(0, 500);
                }
            });
            await page.waitForTimeout(2000);

            await page.evaluate(() => {
                if (document.body) {
                    window.scrollTo(0, document.body.scrollHeight);
                } else {
                    window.scrollTo(0, 1000);
                }
            });
            await page.waitForTimeout(2000);

            // Scroll back to top
            await page.evaluate(() => {
                window.scrollTo(0, 0);
            });
            await page.waitForTimeout(2000);
        } catch (error) {
            log.warning(`Scrolling failed: ${error.message}, continuing with extraction`);
        }

        // Set up MutationObserver to watch for dynamically added content
        log.info(`👁️ Setting up MutationObserver for dynamic content...`);
        await page.evaluate(() => {
            window.foundVideos = [];
            const observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    mutation.addedNodes.forEach((node) => {
                        if (node.nodeType === 1) { // Element node
                            // Check for video elements
                            const videos = node.querySelectorAll ? node.querySelectorAll('video, source, iframe') : [];
                            videos.forEach(video => {
                                if (video.src || video.currentSrc) {
                                    window.foundVideos.push({
                                        type: 'mutation-observer',
                                        url: video.src || video.currentSrc,
                                        method: 'dynamic-content'
                                    });
                                }
                            });

                            // Check for video in attributes
                            if (node.getAttribute) {
                                ['data-src', 'data-url', 'data-video-url', 'data-media-url'].forEach(attr => {
                                    const value = node.getAttribute(attr);
                                    if (value && (value.includes('.mp4') || value.includes('.m3u8') || value.includes('video'))) {
                                        window.foundVideos.push({
                                            type: 'mutation-observer',
                                            url: value,
                                            method: attr
                                        });
                                    }
                                });
                            }
                        }
                    });
                });
            });

            // Find a valid target node for the observer
            const targetNode = document.body || document.documentElement || document;
            if (targetNode && typeof targetNode.addEventListener === 'function') {
                observer.observe(targetNode, {
                    childList: true,
                    subtree: true
                });
                window.mutationObserver = observer;
            } else {
                console.warn('Could not find valid target for MutationObserver');
            }
        });

        // Try to click on play buttons to trigger video loading
        log.info(`🖱️ Attempting to click on play buttons...`);
        await page.evaluate(() => {
            const playSelectors = [
                '.play-button',
                '.video-play',
                '[class*="play"]',
                '[class*="video"]',
                '[class*="player"]',
                'button[aria-label*="play"]',
                'button[aria-label*="video"]',
                '.video-player button',
                '.player-container button',
                '[data-play]',
                '[onclick*="play"]'
            ];

            playSelectors.forEach(selector => {
                try {
                    const buttons = document.querySelectorAll(selector);
                    buttons.forEach(button => {
                        try {
                            button.click();
                        } catch (e) {
                            // Click failed, continue
                        }
                    });
                } catch (e) {
                    // Query selector failed, continue
                }
            });
        });

        // Wait for MutationObserver to catch dynamic content
        await page.waitForTimeout(5000);

        // Get results from MutationObserver
        const mutationResults = await page.evaluate(() => {
            if (window.mutationObserver) {
                window.mutationObserver.disconnect();
            }
            return window.foundVideos || [];
        });

        log.info(`👁️ MutationObserver found ${mutationResults.length} dynamic videos`);

        // Wait for video elements if requested
        if (waitForVideo) {
            log.info(`⏳ Waiting for video elements to load...`);
            try {
                await page.waitForSelector('video, source, iframe, .video-player, .player-container, .video-wrapper, .media-player', {
                    timeout: 20000
                });
                log.info(`✅ Video elements found`);
            } catch (error) {
                log.warning(`No video elements found within timeout, will try alternative methods`);
            }
        }

        // Extract media links using JavaScript in the browser
        const currentUrl = page.url();
        const isMakoSite = currentUrl.includes('mako.co.il');

        log.info(`🎯 Site analysis: ${isMakoSite ? 'Mako site detected' : 'Generic site'}`);

        const mediaLinks = await page.evaluate((isMakoSite) => {
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
                ['data-src', 'data-url', 'data-video-url', 'data-media-url', 'data-hls-url', 'data-stream-url', 'data-file', 'data-video-file'].forEach(attr => {
                    const value = element.getAttribute(attr);
                    if (value && (value.includes('.mp4') || value.includes('.webm') || value.includes('.m3u8') || value.includes('stream') || value.includes('video'))) {
                        links.push({ type: 'data-attribute', url: value, method: attr });
                    }
                });
            });

            // Look for video URLs in scripts (potential JSON data) - Enhanced patterns
            const scripts = document.querySelectorAll('script');
            scripts.forEach(script => {
                const content = script.textContent;
                if (content) {
                    // Match common video URL patterns - more aggressive with specific keys
                    const patterns = [
                        /https?:\/\/[^"'\s]+\.(mp4|webm|m3u8|mov|avi|flv|mkv|wmv|f4v)/gi,
                        /https?:\/\/[^"'\s]+\/video\/[^"'\s]+/gi,
                        /https?:\/\/[^"'\s]+\/stream\/[^"'\s]+/gi,
                        /https?:\/\/[^"'\s]+\/media\/[^"'\s]+/gi,
                        /https?:\/\/[^"'\s]+\/hls\/[^"'\s]+/gi,
                        /https?:\/\/[^"'\s]+\.m3u8[^"'\s]*/gi,
                        /"url":\s*"([^"]+)"/gi,
                        /"videoUrl":\s*"([^"]+)"/gi,
                        /"src":\s*"([^"]+\.(mp4|webm|m3u8)[^"]*)"/gi,
                        /"file":\s*"([^"]+\.(mp4|webm|m3u8)[^"]*)"/gi,
                        /"mp4":\s*"([^"]+)"/gi,
                        /"hls":\s*"([^"]+)"/gi,
                        /"video_file":\s*"([^"]+)"/gi,
                        /"videoSrc":\s*"([^"]+)"/gi,
                        /url\s*=\s*['"]([^'"]+\.(mp4|webm|m3u8)[^'"]*)['"]/gi,
                        /file\s*=\s*['"]([^'"]+\.(mp4|webm|m3u8)[^'"]*)['"]/gi,
                    ];

                    patterns.forEach(pattern => {
                        const matches = content.match(pattern);
                        if (matches) {
                            matches.forEach(url => {
                                // Clean up the URL if it's in JSON format
                                let cleanUrl = url;
                                if (url.includes('"')) {
                                    cleanUrl = url.replace(/"/g, '').replace(/url:/g, '').replace(/videoUrl:/g, '').replace(/src:/g, '').replace(/file:/g, '').replace(/mp4:/g, '').replace(/hls:/g, '').replace(/video_file:/g, '').replace(/videoSrc:/g, '').trim();
                                }
                                if (!links.find(l => l.url === cleanUrl) && cleanUrl.startsWith('http')) {
                                    links.push({ type: 'script-embedded', url: cleanUrl, method: 'regex-pattern' });
                                }
                            });
                        }
                    });
                }
            });

            // Also check window object for video configurations - More comprehensive
            const windowProps = ['videoConfig', 'playerConfig', 'mediaConfig', 'videoData', 'playerData', 'mediaData', 'appConfig', 'playerOptions', 'videoOptions'];
            windowProps.forEach(prop => {
                if (window[prop]) {
                    try {
                        const configStr = JSON.stringify(window[prop]);
                        const urlPatterns = /https?:\/\/[^"'\s]+\.(mp4|webm|m3u8|mov|avi|flv|mkv|wmv)/gi;
                        const urls = configStr.match(urlPatterns);
                        if (urls) {
                            urls.forEach(url => {
                                if (!links.find(l => l.url === url)) {
                                    links.push({ type: 'window-config', url, method: `window.${prop}` });
                                }
                            });
                        }
                    } catch (e) {
                        // JSON stringify failed, skip
                    }
                }
            });

            // Check for meta tags with video info
            const metaTags = document.querySelectorAll('meta[property], meta[name]');
            metaTags.forEach(meta => {
                const property = meta.getAttribute('property') || meta.getAttribute('name');
                const content = meta.getAttribute('content');
                if (content && (property === 'og:video' || property === 'og:video:url' || property === 'og:video:secure_url' || property === 'video' || property === 'twitter:player')) {
                    if (content.startsWith('http')) {
                        links.push({ type: 'meta-tag', url: content, method: property });
                    }
                }
            });

            // Check for link tags with video
            const linkTags = document.querySelectorAll('link');
            linkTags.forEach(link => {
                const rel = link.getAttribute('rel');
                const href = link.getAttribute('href');
                if (href && (rel === 'video_src' || rel === 'canonical' || rel === 'alternate')) {
                    if (href.match(/\.(mp4|webm|m3u8|mov|avi)/i)) {
                        links.push({ type: 'link-tag', url: href, method: rel });
                    }
                }
            });

            // Special handling for Israeli sites like mako.co.il
            if (isMakoSite) {
                // Try to find mako-specific video patterns
                const makoPatterns = [
                    /https?:\/\/[^"'\s]+keshet[^"'\s]+/gi,
                    /https?:\/\/[^"'\s]+mako[^"'\s]+/gi,
                    /https?:\/\/[^"'\s]+vod[^"'\s]+/gi,
                ];

                // Search entire page content for mako-specific patterns
                try {
                    const pageContent = document.documentElement ? document.documentElement.outerHTML : document.body.innerHTML;
                    makoPatterns.forEach(pattern => {
                        const matches = pageContent.match(pattern);
                        if (matches) {
                            matches.forEach(url => {
                                if (!links.find(l => l.url === url) && url.includes('http')) {
                                    links.push({ type: 'mako-specific', url, method: 'mako-pattern' });
                                }
                            });
                        }
                    });
                } catch (e) {
                    // Failed to get page content, continue with other methods
                }

                // Try to click on video elements to trigger loading
                try {
                    const videoButtons = document.querySelectorAll('.play-button, .video-play, [class*="play"], [class*="video"]');
                    videoButtons.forEach(button => {
                        try {
                            button.click();
                        } catch (e) {
                            // Click failed, continue
                        }
                    });
                } catch (e) {
                    // Query selector failed, continue
                }
            }

            return links;
        }, isMakoSite);

        // Wait additional time after JavaScript execution for any lazy-loaded content
        if (isMakoSite) {
            log.info(`🎬 Mako site detected, waiting for additional video loading...`);
            await page.waitForTimeout(5000);
        }

        log.info(`🔍 Found ${mediaLinks.length} media links`);
        log.info(`🌐 Captured ${networkRequests.length} network requests`);

        // Combine media links, network requests, and mutation results
        const allLinks = [...mediaLinks, ...networkRequests, ...mutationResults];

        // Filter and deduplicate links
        const uniqueLinks = allLinks.filter((link, index, self) =>
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
