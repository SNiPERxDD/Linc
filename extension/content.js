/**
 * LinkedIn Profile Scraper — Content Script
 * Humanized: random delays, no console fingerprints, URL polling instead of MutationObserver
 */

const _DBG = false; // Set true only during development

// Log-normal delay for human-like timing
function _humanDelay(baseMs) {
  const u1 = Math.random(), u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(Math.max(u1, 0.0001))) * Math.cos(2 * Math.PI * u2);
  return new Promise(r => setTimeout(r, Math.max(baseMs * 0.4, Math.round(baseMs * Math.exp(z * 0.3)))));
}

// Timing configuration (defaults, will be overridden by settings)
let _initialDelaySeconds = 1.5; // Will be loaded from settings (reduced for faster response)
let _pollIntervalMs = 2500; // Will be loaded from settings
let _cooldownPeriodSeconds = 30; // Will be loaded from settings

// Load timing configuration from storage
async function _loadTimingConfig() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['initialDelay', 'pollInterval', 'cooldownPeriod'], (result) => {
      _initialDelaySeconds = result.initialDelay || 1.5;
      _pollIntervalMs = result.pollInterval || 2500;
      _cooldownPeriodSeconds = result.cooldownPeriod || 30;
      resolve();
    });
  });
}

/**
 * Silent logging — stores extraction metadata in chrome.storage (zero telemetry footprint)
 * NOW WITH 100% VERIFICATION: Tracks which extraction method provided which data
 */
async function logExtractionSilently(data, expandResult, requestedExpandEnabled, extractionTimeMs, waitTimeMs) {
  try {
    const meta = data._extractionMetadata || {};
    
    // Determine extraction method used
    let extractionMethod = 'Unknown';
    if (meta.fullyVoyagerFed) {
      extractionMethod = 'Voyager-only';
    } else if (meta.voyagerFound) {
      extractionMethod = 'Voyager+DOM';
    } else {
      extractionMethod = 'DOM-only';
    }
    
    const logEntry = {
      timestamp: new Date().toISOString(),
      name: data.name || 'Unknown',
      url: data.url,
      // TIMING TRACKING
      waitTimeMs: waitTimeMs || 0,
      extractionTimeMs: extractionTimeMs,
      // EXTRACTION METHOD
      extractionMethod: extractionMethod,
      // EXPANSION TRACKING
      expandRequested: requestedExpandEnabled === true,
      expandAttempted: !!expandResult,
      expandSucceeded: expandResult?.totalClicked > 0,
      expandClickCount: expandResult?.totalClicked || 0,
      expandElapsedMs: expandResult?.elapsedMs || 0,
      // VOYAGER DATA TRACKING (100% verification)
      voyagerFound: meta.voyagerFound,
      voyagerHadConnections: meta.voyagerHasConnections,
      voyagerHadFollowers: meta.voyagerHasFollowers,
      voyagerHadHeadline: meta.voyagerHasHeadline,
      // Which fields came from Voyager (TRUE Ghost Mode = all three from Voyager)
      fullyVoyagerFed: meta.voyagerHasConnections && meta.voyagerHasFollowers && meta.voyagerHasHeadline,
      dataPoints: {
        hasConnections: !!data.connections,
        hasFollowers: !!data.followers,
        hasHeadline: !!data.headline,
        hasExperience: (data.sections?.Experience || []).length > 0,
        hasEducation: (data.sections?.Education || []).length > 0,
        hasAbout: (data.sections?.About || []).length > 0,
        hasSkills: (data.sections?.Skills || []).length > 0
      }
    };
    
    const result = await chrome.storage.local.get('extractionLogs');
    const logs = result.extractionLogs || [];
    logs.push(logEntry);
    await chrome.storage.local.set({ extractionLogs: logs.slice(-100) }); // Keep last 100
  } catch (e) {
    // Silently fail — don't break extraction if logging fails
  }
}

async function extractProfileData(forceExpandEnabled, waitTimeMs) {
  const startTime = Date.now(); // Performance tracking
  waitTimeMs = waitTimeMs || 0; // Default to 0 if not provided
  if (_DBG) console.log("Extraction started");

  if (typeof ScraperEngine === 'undefined') {
    if (_DBG) console.error("ScraperEngine not loaded.");
    return null;
  }

  const engine = new ScraperEngine();
  const data = engine.extractAll();
  data.captured_at = new Date().toISOString();
  data.url = window.location.href;

  const extractionTimeMs = Date.now() - startTime; // Calculate time taken

  // Silent logging with FULL verification data (Voyager-only, no expansion needed)
  await logExtractionSilently(data, null, false, extractionTimeMs, waitTimeMs);

  // ALSO: proactively send PROFILE_DATA to background so manual/hotkey captures persist
  try {
    chrome.runtime.sendMessage({ type: 'PROFILE_DATA', payload: data }, () => { /* noop ack */ });
  } catch (e) {
    /* ignore - best-effort */
  }

  return data;
}

/**
 * Auto-capture with human-like behavior:
 * - Random probability gate (don't scrape every single visit)
 * - Variable initial delay (humans don't start reading instantly)
 * - Jittered polling intervals
 */
async function autoCapture() {
  if (!window.location.href.includes("/in/")) return;

  const captureStartTime = Date.now();
  
  // Variable delay before starting (configured in settings) — simulates human "settling in"
  const delayMs = _initialDelaySeconds * 1000 + Math.random() * 2000; // Add +/- jitter
  await _humanDelay(delayMs);
  
  const waitTimeMs = Date.now() - captureStartTime;

  // Wait for profile container to appear
  let attempts = 0;
  while (attempts < 8) {
    if (document.querySelector(".pv-top-card") || document.querySelector("h1")) break;
    await _humanDelay(1100); // Jittered polling
    attempts++;
  }

  // Poll for location element with human-like variable intervals
  let waitTime = 0;
  const maxWait = 8000;
  while (waitTime < maxWait) {
    const locEl = document.querySelector(".text-body-small.inline.t-black--light.break-words");
    if (locEl && locEl.innerText.trim().length > 2) break;
    const interval = 400 + Math.random() * 300;
    await new Promise(r => setTimeout(r, interval));
    waitTime += interval;
  }

  // Final settlement (variable, 1-3s)
  await _humanDelay(1800);

  try {
    const data = await extractProfileData(undefined, waitTimeMs);
    if (!data || !data.name || data.name === "Unknown Profile") return;

    if (!chrome.runtime || !chrome.runtime.id || !chrome.storage || !chrome.storage.local) {
      return;
    }

    const stored = await chrome.storage.local.get("profiles");
    let profiles = stored.profiles || [];
    if (!Array.isArray(profiles)) profiles = Object.values(profiles);

    const index = profiles.findIndex(p =>
      (data.publicId && p.publicId === data.publicId) ||
      (p.name === data.name && p.headline === data.headline)
    );

    if (index > -1) {
      profiles[index] = data;
    } else {
      profiles.unshift(data);
    }

    await chrome.storage.local.set({ profiles: profiles.slice(0, 100) });
    if (_DBG) console.log("Captured:", data.name);
  } catch (e) {
    if (_DBG) console.warn("Capture deferred:", e.message);
  }
}

// Listen for manual actions from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "extract") {
    // FIX #7: Validate message integrity
    const expandEnabled = request.expandEnabled !== undefined ? request.expandEnabled : undefined;
    // No wait time for manual capture (only auto-scrape has wait time)
    extractProfileData(expandEnabled, 0).then(result => {
      sendResponse(result);
    }).catch(e => {
      sendResponse({ error: e.message });
    });
    return true;
  }
  return false;
});

// URL Change Detection — Lightweight polling instead of document-wide MutationObserver
// Polls every 2s with jitter. Far less fingerprintable than MutationObserver on full DOM.
let _lastProfileUrl = null;
let _urlCheckCooldown = false;

function normalizeProfileUrl(url) {
  // Extract just the profile path: https://linkedin.com/in/john-doe?trk=x => /in/john-doe
  const match = url.match(/\/in\/[^/?]+/);
  return match ? match[0] : null;
}

setInterval(async () => {
  const currentUrl = normalizeProfileUrl(location.href);
  if (currentUrl && currentUrl !== _lastProfileUrl && !_urlCheckCooldown) {
    _lastProfileUrl = currentUrl;
    if (currentUrl.includes("/in/")) {
      // Check if auto-scrape is enabled before running
      let autoEnabled = false;
      try {
        const s = await chrome.storage.local.get('autoScrapeEnabled');
        autoEnabled = s.autoScrapeEnabled === true;
      } catch (_) { /* keep false */ }
      
      if (autoEnabled) {
        _urlCheckCooldown = true;
        // Cooldown: don't re-trigger on same navigation
        setTimeout(() => { _urlCheckCooldown = false; }, _cooldownPeriodSeconds * 1000);
        autoCapture();
      }
    }
  }
}, _pollIntervalMs); // Use configured polling interval

// Initial page load - only if auto-scrape is enabled
(async () => {
  // Load timing configuration from storage
  await _loadTimingConfig();
  
  const profileUrl = normalizeProfileUrl(location.href);
  if (profileUrl && profileUrl.includes("/in/")) {
    _lastProfileUrl = profileUrl;
    let autoEnabled = false;
    try {
      const s = await chrome.storage.local.get('autoScrapeEnabled');
      autoEnabled = s.autoScrapeEnabled === true;
    } catch (_) { /* keep false */ }
    
    if (autoEnabled) {
      await new Promise(r => setTimeout(r, 2000)); // Wait for initial page setup
      autoCapture();
    }
  }
})();

// Listen for timing configuration changes from popup settings
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && (changes.initialDelay || changes.pollInterval || changes.cooldownPeriod)) {
    _loadTimingConfig(); // Update timing values without restart
  }
});
