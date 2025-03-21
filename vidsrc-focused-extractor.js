const puppeteer = require('puppeteer-extra');
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
async function extractVidSrcStream(url) {
  puppeteer.use(StealthPlugin({enabledEvasions: new Set(["chrome.app", "chrome.csi", "defaultArgs", "navigator.plugins"])}));
  console.log(`Extracting stream from: ${url}`);

  const browser = await puppeteer.launch({
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined, // Use the installed Chrome
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-web-security',
      "--disable-dev-shm-usage",
      '--disable-features=IsolateOrigins,site-per-process',
      "--disable-gpu",
      "--disable-software-rasterizer",
      '--enable-popup-blocking'
    ]
  });

  try {
    // Create a new page
    const page = await browser.newPage();
    let prorcp = null;

    // Set user agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36');
    await page.setExtraHTTPHeaders({
      url,
      'Sec-GPC': '1',
      'DNT': '1',
      'Accept-Language': 'en-US,en;q=0.9',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'cross-site',
    });


    // Storage for captured stream URLs
    const streamUrls = {};

    // Enable request interception and monitoring
    await page.setRequestInterception(true);

    // Monitor all network requests for m3u8 files
    page.on('request', request => {
      const url = request.url();
      if (
          url.includes('analytics') ||
          url.includes('ads') ||
          url.includes('social') ||
          url.includes('disable-devtool') ||
          url.includes('sV05kUlNvOdOxvtC') ||
          url.includes('histats')
      ) {
        // block the request
        request.abort();
      } else if (url.includes('.m3u8')) {
        console.log('M3U8 URL detected in request:', url.slice(url.length - 12).replace('/', ''));
        // Categorize the stream URLs
        streamUrls[url.slice((url.length - 12)).replace('/', '')] = url;
      } else if (url.includes('prorcp')) {
        prorcp = url;
      } else {
        // allow the request
        request.continue();
      }
    });

    // Navigate to the VidSrc page
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 18000});
    console.log('Main page loaded');

    // Wait for initial iframe to load
    const iframeSelector = '#player_iframe';
    await page.waitForSelector(iframeSelector, {timeout: 10000});
    console.log('Initial iframe found');

    const iframeSrc = await page.evaluate(sel => {
      const iframe = document.querySelector(sel);
      return iframe ? iframe.src : null;
    }, iframeSelector);

    if (!iframeSrc) throw new Error('No iframe src found');
    let playerPage = await browser.newPage();
    playerPage.on('request', request => {
      let url = request.url();
      if (url.includes('.m3u8')) {
        console.log('M3U8 URL detected in request:', url);
        // Categorize the stream URLs
        streamUrls[url.slice((url.length - 12)).replace('/', '')] = url;
      }
    });
    await playerPage.goto(iframeSrc);
    await page.close();
    console.log('Player page loaded');

    try {
      // Click the play button
      await playerPage.waitForSelector('#pl_but', {timeout: 30000})
      await playerPage.click('#pl_but',);
      console.log('Clicked play button');

      // Wait for stream URLs to appear in network requests
      console.log('Waiting for stream URLs to appear in network requests...');
      await playerPage.waitForRequest(request => request.url().includes('.m3u8'))
      await playerPage.waitForRequest(request => request.url().includes('.m3u8'))
      await playerPage.waitForRequest(request => request.url().includes('.m3u8'))
    } catch (e) {
      console.log('Error finding or clicking the play button:', e.message);
    }

    // Check if we found any stream URLs
    console.log('Stream URLs found:', streamUrls);

    // If we haven't found any stream URLs, try inspecting the page content
    if (streamUrls.length === 0) {
      console.log('No stream URLs captured from network requests, checking page content...');

      // Get the page content
      const content = await page.content();

      // Look for m3u8 URLs, with special attention to shadowlandschronicles.com
      const regex = /(https?:\/\/[^"'\s]+\.m3u8[^"'\s]*)/g;
      let match;

      while ((match = regex.exec(content)) !== null) {
        const foundUrl = match[1];
        console.log('Found stream URL in page content:', foundUrl);

        if (foundUrl.includes('master.m3u8')) {
          streamUrls.master = foundUrl;
        } else if (foundUrl.includes('index-2.m3u8')) {
          streamUrls.index2 = foundUrl;
        } else {
          streamUrls.other.push(foundUrl);
        }
      }
    }

    // If we still don't have any URLs, try to get them from network resources
    if (streamUrls.length === 0) {
      console.log('No stream URLs found in page content, checking network resources...');

      const resources = await page.evaluate(() => {
        return performance.getEntriesByType('resource')
          .filter(r => r.name.includes('.m3u8'))
          .map(r => r.name);
      });

      console.log('M3U8 resources found:', resources);

      for (const resourceUrl of resources) {
        if (resourceUrl.includes('master.m3u8')) {
          streamUrls.master = resourceUrl;
        } else if (resourceUrl.includes('index-2.m3u8')) {
          streamUrls.index2 = resourceUrl;
        } else {
          streamUrls.other.push(resourceUrl);
        }
      }
    }

    if (streamUrls.length === 0) {
      throw new Error('No stream URL found');
    }

    return streamUrls;

  } catch (error) {
    console.error('Error extracting stream:', error);
    throw error;
  } finally {
    await browser.close();
  }
}

module.exports = { extractVidSrcStream };