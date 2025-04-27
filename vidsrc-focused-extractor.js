const puppeteer = require('puppeteer-extra');
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const AnonymizeUAPlugin = require('puppeteer-extra-plugin-anonymize-ua');
const UserPreferencesPlugin = require('puppeteer-extra-plugin-user-preferences');
const undetected = require('undetected-puppeteer');

puppeteer.use(StealthPlugin());
puppeteer.use(AnonymizeUAPlugin());
puppeteer.use(UserPreferencesPlugin({
  userPrefs: {
    "profile.default_content_setting_values.notifications": 2,
    "profile.default_content_setting_values.geolocation": 2,
    "profile.password_manager_enabled": false,
    "profile.default_content_settings.popups": 0,
    "credentials_enable_service": false
  }
}));

function randomUserAgent() {
  const versions = ['114.0.5735.198', '113.0.5672.126', '112.0.5615.138'];
  const version = versions[Math.floor(Math.random() * versions.length)];
  return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${version} Safari/537.36`;
}

async function extractWithNormalPuppeteer(url) {
  console.log(`Extracting stream from: ${url}`);

  const browser = await puppeteer.launch({
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
    return await extractStream(browser, url);
  } finally {
    await browser.close();
  }
}

async function extractWithUndetectedPuppeteer(url) {
  const browser = await undetected.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-web-security',
      '--disable-features=IsolateOrigins,site-per-process',
      '--disable-gpu',
      '--disable-software-rasterizer',
      '--enable-popup-blocking'
    ]
  });

  try {
    return await extractStream(browser, url);
  } finally {
    await browser.close();
  }
}

async function extractStream(browser, url) {
    // Create a new page
    const page = await browser.newPage();

    // Set user agent
    await page.setUserAgent(randomUserAgent());
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
      } else {
        // allow the request
        request.continue();
      }
    });

    // Navigate to the VidSrc page
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000});
    console.log('Main page loaded');

    // Wait for initial iframe to load
    const iframeSelector = '#player_iframe';
    await page.waitForSelector(iframeSelector, {timeout: 30000});

    const iframeSrc = await page.evaluate(sel => {
      const iframe = document.querySelector(sel);
      return iframe ? iframe.src : null;
    }, iframeSelector);

    if (!iframeSrc) throw new Error('No iframe src found');

    await page.goto(iframeSrc);
    console.log('Player page loaded');


    try {
      // Click the play button
      await page.waitForSelector('#pl_but', {timeout: 30000})
      await page.click('#pl_but');
      console.log('Clicked play button');
      await page.waitForSelector('iframe', {timeout: 10000});
      console.log('second iframe found');
      const iframeSrc2 = await page.evaluate(sel => {
        const iframe = document.querySelector(sel);
        return iframe ? iframe.src : null;
      }, iframeSelector);
      await page.goto(iframeSrc2);
      // Wait for stream URLs to appear in network requests
      if (streamUrls.isEmpty) {
        console.log('Waiting for stream URLs to appear in network requests...');
        await page.waitForRequest(request => request.url().includes('.m3u8'), {timeout: 5000}).catch(() => {})
      }
    } catch (e) {
      console.log('Error finding or clicking the play button:', e.message);
    }

    // Check if we found any stream URLs
    if (streamUrls.length === 0) {
      throw new Error('No stream URL found');
    }

    console.log('Stream URLs found:', streamUrls);
    return streamUrls;
}

async function extractVidSrcStream(url) {
  try {
    console.log('Normal Puppeteer')
    return await extractWithNormalPuppeteer(url);
  } catch (e1) {
    console.error('Normal puppeteer failed, switching to undetected-puppeteer:', e1.message);
    try {
      return await extractWithUndetectedPuppeteer(url);
    } catch (e2) {
      console.error('Undetected puppeteer failed too:', e2.message);
      throw new Error('Extraction failed with both methods');
    }
  }
}

module.exports = { extractVidSrcStream: extractVidSrcStream };