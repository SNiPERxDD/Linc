/* Background service worker for LinkedIn passive scraper. */

const STORAGE_KEY = "profiles";
let autoScrapeEnabled = false;
let saveFolder = 'linkedin_profiles';

// Rate limiting: per-tab cooldown + global rate limit
const _tabCooldowns = new Map(); // tabId → last scrape timestamp
const TAB_COOLDOWN_MS = 50000;   // Don't re-scrape same tab within 50s
const GLOBAL_RATE_LIMIT = 1;     // Max 1 scrape per minute (45-60s between profiles)
let _recentScrapes = [];         // Timestamps of recent scrapes

// Load settings on startup
chrome.storage.local.get(['autoScrapeEnabled', 'saveFolder'], (result) => {
  autoScrapeEnabled = result.autoScrapeEnabled || false;
  saveFolder = result.saveFolder || 'linkedin_profiles';
});

/** Load all stored profiles. */
async function loadProfiles() {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  const raw = data[STORAGE_KEY];
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object') return Object.values(raw);
  return [];
}

/** Save profiles array. */
async function saveProfiles(profiles) {
  await chrome.storage.local.set({ [STORAGE_KEY]: profiles.slice(-50) });
}

/** Create a notification for capture events. */
function notify(title, message) {
  chrome.notifications.create({
    type: "basic",
    iconUrl: chrome.runtime.getURL("icon128.png"),
    title,
    message
  });
}

/** Save profile to downloads folder as JSON */
async function saveProfileToFile(profile) {
  try {
    const sanitize = (str) => str.replace(/[^a-z0-9_\-]/gi, '_');
    const name = sanitize(profile.name || 'Unknown');
    const filename = `${saveFolder}/${name}_${Date.now()}.json`;
    const blob = new Blob([JSON.stringify(profile, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    await chrome.downloads.download({
      url: url,
      filename: filename,
      saveAs: false
    });
    
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) {
    // Silent fail
  }
}

/** Check if profile has meaningful data */
function hasValidData(profile) {
  if (!profile || !profile.name) return false;
  
  // Check if it has at least headline OR experience OR education
  return profile.headline || 
         (profile.sections?.Experience?.length > 0) || 
         (profile.sections?.Education?.length > 0);
}

/** Merge two profiles, keeping the one with more data */
function mergeProfiles(existing, newProfile) {
  // If new profile has more data, use it
  const newScore = hasValidData(newProfile) ? 
    (newProfile.headline ? 1 : 0) + 
    (newProfile.sections?.Experience?.length || 0) + 
    (newProfile.sections?.Education?.length || 0) : 0;
  
  const existingScore = hasValidData(existing) ? 
    (existing.headline ? 1 : 0) + 
    (existing.sections?.Experience?.length || 0) + 
    (existing.sections?.Education?.length || 0) : 0;
  
  if (newScore > existingScore) {
    return { ...newProfile, firstCaptured: existing.captured_at };
  }
  return existing;
}

/** Check if URL is a valid LinkedIn profile */
function isValidProfileUrl(url) {
  if (!url) return false;
  
  // Must be /in/ profile page
  if (!url.includes('linkedin.com/in/')) return false;
  
  // Exclude non-profile pages and sub-overlays
  const excludePatterns = [
    '/mynetwork',
    '/connections',
    '/feed',
    '/jobs',
    '/messaging',
    '/notifications',
    '/overlay/'
  ];
  
  return !excludePatterns.some(pattern => url.includes(pattern));
}

/** Normalize LinkedIn profile URL for deduplication */
function normalizeProfileUrl(url) {
  if (!url) return null;
  
  try {
    // Remove overlays from URL (e.g., /overlay/contact-info/)
    let cleanUrl = url.replace(/\/overlay\/[^/]+\/?$/, '');
    cleanUrl = cleanUrl.replace(/\/overlay\/[^/]+\/$/, '');
    
    const urlObj = new URL(cleanUrl);
    // Keep only protocol, host, and pathname (remove query params, hash, trailing slash)
    let normalized = `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`;
    // Remove trailing slash
    normalized = normalized.replace(/\/$/, '');
    return normalized;
  } catch (e) {
    // If URL parsing fails, return cleaned version
    return url.split('?')[0].split('#')[0].replace(/\/overlay\/[^/]+\/?$/, '').replace(/\/$/, '');
  }
}

/** Auto-scrape LinkedIn profile when tab loads — with rate limiting */
async function autoScrapeProfile(tabId, url) {
  if (!autoScrapeEnabled) return;
  if (!isValidProfileUrl(url)) return;

  // Per-tab cooldown
  const lastScrape = _tabCooldowns.get(tabId);
  if (lastScrape && Date.now() - lastScrape < TAB_COOLDOWN_MS) return;

  // Global rate limit: max N scrapes per minute
  const now = Date.now();
  _recentScrapes = _recentScrapes.filter(t => now - t < 60000);
  if (_recentScrapes.length >= GLOBAL_RATE_LIMIT) return;
  
  try {
    // RECORD TIMESTAMP FIRST to prevent race conditions
    _tabCooldowns.set(tabId, Date.now());
    _recentScrapes.push(Date.now());
    
    // Human-like variable delay between profiles: 45-60 seconds
    // A human does NOT read a full professional profile every 15 seconds
    const delay = 45000 + Math.random() * 15000;
    await new Promise(resolve => setTimeout(resolve, delay));
    
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (!tab) return;
    
    // Execute scraper
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        if (typeof ScraperEngine !== 'undefined') {
          const engine = new ScraperEngine(document);
          return engine.extractAll();
        }
        return null;
      }
    });
    
    if (results && results[0] && results[0].result) {
      const profile = results[0].result;
      
      // Skip if no valid data (page didn't fully load)
      if (!hasValidData(profile)) {
        // Skipped empty profile
        return;
      }
      
      profile.captured_at = new Date().toISOString();
      profile.url = url;
      
      // Normalize URL for deduplication
      const normalizedUrl = normalizeProfileUrl(url);
      
      // Load existing profiles
      const profiles = await loadProfiles();
      
      // Find existing by normalized URL
      const existingIndex = profiles.findIndex(p => normalizeProfileUrl(p.url) === normalizedUrl);
      
      if (existingIndex >= 0) {
        // Merge with existing
        profiles[existingIndex] = mergeProfiles(profiles[existingIndex], profile);

      } else {
        // Add new
        profiles.push(profile);

      }
      
      await saveProfiles(profiles);
      
      // Save to file only if not duplicate
      if (existingIndex < 0) {
        await saveProfileToFile(profile);
      }
      
      // Update badge
      chrome.action.setBadgeText({ text: String(profiles.length) });
      chrome.action.setBadgeBackgroundColor({ color: "#0A66C2" });
      
      notify("Auto-scraped", profile.name || "Profile captured");
    }
  } catch (error) {
    // Silent fail
  }
}

// Listen for tab updates (page loads)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    autoScrapeProfile(tabId, tab.url);
  }
});

// Handle manual capture messages from popup/content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "PROFILE_DATA") {
    (async () => {
      try {
        const profile = message.payload;
        if (!profile) {
          sendResponse({ ok: false, error: "Missing profile data" });
          return;
        }
        
        profile.captured_at = profile.captured_at || new Date().toISOString();
        
        const profiles = await loadProfiles();
        
        // URL-based deduplication with normalization
        if (profile.url) {
          const normalizedUrl = normalizeProfileUrl(profile.url);
          const existingIndex = profiles.findIndex(p => normalizeProfileUrl(p.url) === normalizedUrl);
          
          if (existingIndex >= 0) {
            // Merge with existing
            profiles[existingIndex] = mergeProfiles(profiles[existingIndex], profile);
            await saveProfiles(profiles);
            
            notify("Profile updated", profile.name || "Unknown");
            sendResponse({ ok: true, updated: true });
            
            chrome.action.setBadgeText({ text: String(profiles.length) });
            chrome.action.setBadgeBackgroundColor({ color: "#0A66C2" });
            return;
          }
        }
        
        // New profile
        profiles.push(profile);
        await saveProfiles(profiles);

        const count = profiles.length;
        chrome.action.setBadgeText({ text: String(count) });
        chrome.action.setBadgeBackgroundColor({ color: "#0A66C2" });

        notify("Profile captured", profile.name || "Unknown");
        sendResponse({ ok: true, updated: false });
      } catch (err) {
        // Surface the error for debugging and ensure sender gets a response
        console.error('PROFILE_DATA handler error:', err);
        try {
          chrome.storage.local.set({ lastBackgroundError: (err && err.message) || String(err) });
        } catch (_) { /* ignore */ }
        notify('Save failed', (err && err.message) || 'Unknown error');
        sendResponse({ ok: false, error: (err && err.message) || 'Background save error' });
      }
    })();
    return true;
  }
  
  if (message?.action === "updateSettings") {
    autoScrapeEnabled = message.enabled;
    saveFolder = message.folder || 'linkedin_profiles';
    sendResponse({ ok: true });
    return true;
  }
  
  if (message?.action === "deduplicateProfiles") {
    (async () => {
      const profiles = await loadProfiles();
      const uniqueMap = new Map();
      
      // Keep the best version of each normalized URL
      for (const profile of profiles) {
        if (!profile.url) continue;
        
        const normalizedUrl = normalizeProfileUrl(profile.url);
        
        if (!uniqueMap.has(normalizedUrl)) {
          uniqueMap.set(normalizedUrl, profile);
        } else {
          const existing = uniqueMap.get(normalizedUrl);
          uniqueMap.set(normalizedUrl, mergeProfiles(existing, profile));
        }
      }
      
      const deduplicated = Array.from(uniqueMap.values());
      await saveProfiles(deduplicated);
      
      sendResponse({ 
        ok: true, 
        before: profiles.length, 
        after: deduplicated.length 
      });
    })();
    return true;
  }
  
  return undefined;
});

/** Handle keyboard shortcut for capture. */
chrome.commands.onCommand.addListener((command) => {
  // Notify immediately so user can tell whether Chrome received the shortcut
  notify("Shortcut pressed", `Command: ${command}`);

  if (command === "capture-profile") {
    // Get the active tab and send capture command to its content script
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length === 0) return;
      
      const tab = tabs[0];
      
      // Only works on LinkedIn profile pages
      if (!tab.url || !tab.url.includes("linkedin.com/in/")) {
        notify("Not a LinkedIn profile", "Open a LinkedIn profile page first");
        return;
      }
      
      chrome.tabs.sendMessage(
        tab.id,
        { action: "extract", expandEnabled: false },
        (response) => {
          if (chrome.runtime.lastError) {
            // Content script might not have loaded yet
            notify("Error", "Extension not ready on this page");
            return;
          }

          // If content script returned an error object
          if (response?.error) {
            notify("Capture failed", response.error);
            return;
          }

          // If content script returned profile data, forward to background save handler
          if (response && (response.name || response.url)) {
            // Forward to the same onMessage PROFILE_DATA handler so saving/dedup logic is reused
            chrome.runtime.sendMessage({ type: 'PROFILE_DATA', payload: response }, (ack) => {
              if (chrome.runtime.lastError) {
                notify('Save failed', 'Background save error');
                return;
              }

              notify('Capture queued', response.name || (response.url || 'Profile'));
            });
            return;
          }

          // Unexpected result
          notify('Capture', 'No profile returned from page');
        }
      );
    });
  }
});

