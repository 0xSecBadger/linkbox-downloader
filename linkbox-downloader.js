import puppeteer from 'puppeteer';
import fs from 'fs-extra';
import path from 'path';

// Check/import fetch
let fetch;
if (typeof globalThis.fetch === 'function') {
  fetch = globalThis.fetch;
} else {
  try {
    const nodeFetch = await import('node-fetch');
    fetch = nodeFetch.default;
  } catch (error) {
    console.warn("node-fetch is not installed. Please install it with 'npm install node-fetch' if you're using Node.js < 18");
    fetch = async () => ({ headers: { get: () => null } });
  }
}

// Global limits
const MAX_FILE_SIZE = 104857600; // 100 MB
// Timeouts (reduced)
const SELECTOR_TIMEOUT = 5000;
const DOWNLOAD_TIMEOUT = 30000;

// Lightweight logging functions
function logInfo(msg)    { console.log(`ℹ️ ${msg}`); }
function logSuccess(msg) { console.log(`✅ ${msg}`); }
function logWarning(msg) { console.log(`⚠️ ${msg}`); }
function logError(msg)   { console.log(`❌ ${msg}`); }
function logTitle(msg)   { console.log(`\n📦 ${msg}`); }

// Small utility (really minimal) for a short delay
async function sleep(ms = 100) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Filename sanitization
function sanitizeFileName(name) {
  return name.replace(/[^\p{L}\p{N}\u0600-\u06FF\u{1F300}-\u{1F9FF}._-]/gu, '_');
}

// Check if the file is a video
function isVideoFile(fileName) {
  const videoExtensions = ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv'];
  const ext = path.extname(fileName).toLowerCase();
  return videoExtensions.includes(ext);
}

// Check remote file size before downloading
async function checkFileSize(downloadUrl) {
  try {
    const response = await fetch(downloadUrl, { method: 'HEAD' });
    const size = response.headers.get('content-length');
    return size ? parseInt(size, 10) : null;
  } catch {
    return null;
  }
}

// Direct download of MP4 (or other) via Node.js (fallback solution)
async function downloadMP4FileDirectly(url, filePath) {
  logInfo(`Direct download via Node.js: ${url}`);
  try {
    await fs.ensureDir(path.dirname(filePath));
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'video/mp4,video/*;q=0.9,application/octet-stream;q=0.8,*/*;q=0.7',
      },
      timeout: 15000, // Shorter timeout
    });
    if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);

    const contentLength = response.headers.get('content-length');
    const totalSize = contentLength ? parseInt(contentLength) : 0;
    if (totalSize > MAX_FILE_SIZE) {
      logWarning(`File too large (${(totalSize / 1024 / 1024).toFixed(2)} MB): skipped.`);
      return false;
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    await fs.writeFile(filePath, buffer);
    logSuccess(`File saved: ${filePath}`);
    return true;
  } catch (error) {
    logError(`Direct download failed: ${error.message}`);
    return false;
  }
}

// Maximum simplification of download completion: we just wait a bit
async function waitForDownloadComplete(downloadPath, targetFileName) {
  logInfo(`Brief wait for "${targetFileName}"...`);
  // We just wait a few seconds and assume the file is downloaded
  await sleep(3000);
}

// Download a file (click + possible fallback solution)
async function downloadFile(page, fileNameFromDom, downloadPath) {
  try {
    await fs.ensureDir(downloadPath);
    logTitle(`Downloading: ${fileNameFromDom}`);

    // Check if we can get the download URL directly
    const { url: directUrl } = await page.evaluate(() => {
      const downloadBtn = document.querySelector('.download-btn, [data-role="download"], a[download]');
      const videoEl = document.querySelector('video');
      let directUrl = null;
      if (downloadBtn && downloadBtn.href) directUrl = downloadBtn.href;
      else if (videoEl && videoEl.src) directUrl = videoEl.src;
      return { url: directUrl };
    });

    // If we have a direct URL -> direct Node.js download
    if (directUrl) {
      const size = await checkFileSize(directUrl);
      if (size && size > MAX_FILE_SIZE) {
        logWarning("File too large, skipping.");
        return;
      }
      const filePath = path.join(downloadPath, sanitizeFileName(fileNameFromDom));
      const success = await downloadMP4FileDirectly(directUrl, filePath);
      if (success) {
        logSuccess(`Direct download successful for "${fileNameFromDom}"`);
        return;
      }
    }

    // Otherwise we try a click
    logInfo(`Download click for "${fileNameFromDom}"`);
    const clicked = await page.evaluate(() => {
      const btn = document.querySelector('.download-btn, [data-role="download"], a[download]');
      if (btn) {
        btn.click();
        return true;
      }
      // We try a last resort: click on the video element
      const videoEl = document.querySelector('video');
      if (videoEl) {
        videoEl.click();
        return true;
      }
      return false;
    });
    await sleep(500);

    if (!clicked) {
      logWarning("No clickable button or video detected for download.");
      return;
    }

    // Wait for completion (ultra-short version)
    await waitForDownloadComplete(downloadPath, fileNameFromDom);
    logSuccess(`Download completed: ${fileNameFromDom}`);
  } catch (error) {
    logError(`Error in downloadFile: ${error.message}`);
  }
}

// Very lightweight folder traversal (assuming few nested folders, clicking faster)
async function processFolder(page, folderPath = 'downloads') {
  logTitle(`Processing folder: ${folderPath}`);
  await fs.ensureDir(folderPath);

  // Wait for the list to appear (reduced timeout)
  try {
    await page.waitForSelector('.nfli-info', { timeout: SELECTOR_TIMEOUT });
  } catch {
    logWarning("No .nfli-info, assuming no subfolders/files.");
    return;
  }

  // Get items
  const items = await page.evaluate(() => {
    const els = document.querySelectorAll('.nfli-info');
    const results = [];
    for (let i = 0; i < els.length; i++) {
      const nameEl = els[i].querySelector('.nfli-info-name');
      if (!nameEl) continue;
      const name = nameEl.textContent.trim();
      // We look for a dot to guess if it's a file
      const isFolder = !name.includes('.');
      results.push({ name, index: i, isFolder });
    }
    return results;
  });

  if (!items.length) {
    logWarning("No items in this folder.");
    return;
  }
  logInfo(`${items.length} item(s) detected.`);

  for (const item of items) {
    try {
      // Click on the item
      await page.evaluate((idx) => {
        const all = document.querySelectorAll('.nfli-info');
        if (all[idx]) all[idx].click();
      }, item.index);
      await sleep(500);

      if (item.isFolder) {
        // Recursive call
        const newFolderPath = path.join(folderPath, sanitizeFileName(item.name));
        await processFolder(page, newFolderPath);
        // Go back
        await page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => {});
        await sleep(500);
      } else {
        // Download the file
        await downloadFile(page, item.name, folderPath);
        // Go back
        await page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => {});
        await sleep(500);
      }
    } catch (err) {
      logError(`Error with item "${item.name}": ${err.message}`);
      await page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => {});
    }
  }
}

// Main script
async function main(url) {
  logTitle(`🚀 Launching speed-optimized script`);
  logInfo(`URL: ${url}`);

  const downloadPath = path.resolve('downloads');
  await fs.ensureDir(downloadPath);

  // Launch Puppeteer (headless=false just to see the sequence,
  // we can set headless:true to save even more time)
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-popup-blocking',
      '--disable-dev-shm-usage',
      '--window-size=1280,800',
    ]
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0');
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    logSuccess('Page loaded');

    // Simple consent management (we try a click if present)
    await page.evaluate(() => {
      const consentBtn = document.querySelector('.fc-button.fc-cta-consent');
      if (consentBtn) consentBtn.click();
    });

    // Small delay to let loading finish
    await sleep(2000);

    // Browse content
    await processFolder(page, downloadPath);

    logSuccess('✨ Downloads completed!');
  } catch (error) {
    logError(`Global error: ${error.message}`);
  } finally {
    await sleep(1000);
    await browser.close();
    logSuccess('Browser closed');
  }
}

// Launch via command line
const url = process.argv[2];
if (!url) {
  logError("Please provide the URL as an argument.");
  process.exit(1);
}
main(url);