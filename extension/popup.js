/* popup.js — Controller for LinkedIn Extractor popup UI. */

const STORAGE_KEY = "profiles";

// ── SVG Icons ──
const SECTION_ICONS = {
  About: '<svg viewBox="0 0 24 24"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
  Experience: '<svg viewBox="0 0 24 24"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>',
  Education: '<svg viewBox="0 0 24 24"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>',
  "Licenses & certifications": '<svg viewBox="0 0 24 24"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><path d="M12 18v-6"/><path d="M9 15h6"/></svg>',
  Projects: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/></svg>',
  Volunteering: '<svg viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>',
  Skills: '<svg viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
  Publications: '<svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>',
  "Honors & awards": '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></svg>',
  Languages: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>'
};

// ── UI Helpers ──
function setStatus(msg) {
  const el = document.getElementById("status-bar-bottom");
  if (el) el.textContent = msg;
}

function showTab(tabId) {
  document.querySelectorAll(".tab-content").forEach(el => el.classList.remove("active"));
  document.querySelectorAll(".tab-btn").forEach(el => el.classList.remove("active"));
  const view = document.getElementById(`view-${tabId}`);
  const btn = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
  if (view) view.classList.add("active");
  if (btn) btn.classList.add("active");

  // Only show footer on preview tab
  const footer = document.querySelector(".actions-footer");
  if (footer) {
    if (tabId === "preview") {
      footer.classList.remove("hidden");
    } else {
      footer.classList.add("hidden");
    }
  }
}

function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text) e.textContent = text;
  return e;
}

function showToast(message, duration = 2000) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), duration);
}

// Show default avatar placeholder when no profile image
function showDefaultAvatar(name) {
  const profileHeader = document.querySelector('.profile-header');
  if (!profileHeader) return;
  
  // Remove existing placeholder if any
  const existing = profileHeader.querySelector('.default-avatar');
  if (existing) existing.remove();
  
  const placeholder = document.createElement('div');
  placeholder.className = 'default-avatar';
  
  // Generate initials from name
  const initials = (name || 'U')
    .split(' ')
    .filter(w => w.length > 0)
    .map(w => w[0].toUpperCase())
    .slice(0, 2)
    .join('');
  placeholder.textContent = initials;
  
  // Insert before header-info
  const img = document.getElementById("p-image");
  if (img) {
    img.parentElement.insertBefore(placeholder, img);
  }
}

// ── Storage ──
async function getStoredProfiles() {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  const raw = data[STORAGE_KEY];
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object') return Object.values(raw);
  return [];
}

// ── Section Item Renderers ──
function renderExperienceItem(item) {
  const div = el("div", "section-item");

  // Grouped experience: company as parent, roles as children
  if (item.subRoles && item.subRoles.length > 0) {
    div.classList.add("exp-grouped");
    
    // Company header
    const companyHeader = el("div", "exp-company-header");
    companyHeader.appendChild(el("div", "item-primary", item.company || "Unknown Company"));
    if (item.duration) {
      companyHeader.appendChild(el("div", "exp-total-duration", item.duration));
    }
    div.appendChild(companyHeader);

    // Roles tree
    const rolesTree = el("div", "exp-roles-tree");
    item.subRoles.forEach((sr, idx) => {
      const roleNode = el("div", "exp-role-node");
      roleNode.appendChild(el("div", "exp-role-dot"));
      
      const roleHeader = el("div", "exp-role-header");
      roleHeader.appendChild(el("div", "item-primary", sr.role || "Unknown Role"));
      if (sr.employmentType) {
        roleHeader.appendChild(el("span", "item-tag type", sr.employmentType));
      }
      roleNode.appendChild(roleHeader);

      const meta = el("div", "item-meta");
      if (sr.startDate) {
        const d = sr.endDate ? `${sr.startDate} – ${sr.endDate}` : sr.startDate;
        meta.appendChild(el("span", "item-tag date", d));
      }
      if (sr.duration) meta.appendChild(el("span", "item-tag", sr.duration));
      if (sr.location) meta.appendChild(el("span", "item-tag loc", sr.location));
      if (sr.workplaceType) meta.appendChild(el("span", "item-tag", sr.workplaceType));
      if (sr.skills) meta.appendChild(el("span", "item-tag skills", sr.skills));
      if (meta.children.length > 0) roleNode.appendChild(meta);

      if (sr.description) roleNode.appendChild(el("div", "item-desc", sr.description));
      
      rolesTree.appendChild(roleNode);
    });
    div.appendChild(rolesTree);
  } else {
    // Single experience: standard layout
    const primary = el("div", "item-primary", item.role || "Unknown Role");
    const secondary = el("div", "item-secondary", item.company || "");
    div.appendChild(primary);
    div.appendChild(secondary);

    const meta = el("div", "item-meta");
    if (item.employmentType) meta.appendChild(el("span", "item-tag type", item.employmentType));
    if (item.startDate) {
      const dateStr = item.endDate ? `${item.startDate} – ${item.endDate}` : item.startDate;
      meta.appendChild(el("span", "item-tag date", dateStr));
    }
    if (item.duration) meta.appendChild(el("span", "item-tag", item.duration));
    if (item.location) meta.appendChild(el("span", "item-tag loc", item.location));
    if (item.workplaceType) meta.appendChild(el("span", "item-tag", item.workplaceType));
    if (item.skills) meta.appendChild(el("span", "item-tag skills", item.skills));
    if (meta.children.length > 0) div.appendChild(meta);

    if (item.description) div.appendChild(el("div", "item-desc", item.description));
  }

  return div;
}

function renderEducationItem(item) {
  const div = el("div", "section-item");
  div.appendChild(el("div", "item-primary", item.school || "Unknown School"));
  const degreeField = [item.degree, item.field].filter(Boolean).join(", ");
  if (degreeField) div.appendChild(el("div", "item-secondary", degreeField));

  const meta = el("div", "item-meta");
  if (item.startDate) {
    const d = item.endDate ? `${item.startDate} – ${item.endDate}` : item.startDate;
    meta.appendChild(el("span", "item-tag date", d));
  }
  if (meta.children.length > 0) div.appendChild(meta);
  return div;
}

function renderSkillItem(item) {
  const div = el("div", "section-item");
  div.appendChild(el("div", "item-primary", item.skill || item));
  if (item.context) div.appendChild(el("div", "item-secondary", item.context));
  return div;
}

function renderLanguageItem(item) {
  const div = el("div", "section-item");
  div.appendChild(el("div", "item-primary", item.language || item));
  if (item.proficiency) div.appendChild(el("div", "item-secondary", item.proficiency));
  return div;
}

function renderLicenseItem(item) {
  const div = el("div", "section-item");
  div.appendChild(el("div", "item-primary", item.name || item));
  if (item.issuer) div.appendChild(el("div", "item-secondary", item.issuer));
  const meta = el("div", "item-meta");
  if (item.issueDate) meta.appendChild(el("span", "item-tag date", `Issued ${item.issueDate}`));
  if (meta.children.length > 0) div.appendChild(meta);
  return div;
}

function renderProjectItem(item) {
  const div = el("div", "section-item");
  div.appendChild(el("div", "item-primary", item.name || item));
  const meta = el("div", "item-meta");
  if (item.date) meta.appendChild(el("span", "item-tag date", item.date));
  if (item.association) meta.appendChild(el("span", "item-tag", item.association));
  if (item.skills) meta.appendChild(el("span", "item-tag skills", item.skills));
  if (meta.children.length > 0) div.appendChild(meta);
  return div;
}

function renderHonorItem(item) {
  const div = el("div", "section-item");
  div.appendChild(el("div", "item-primary", item.title || item));
  if (item.issuer) div.appendChild(el("div", "item-secondary", `Issued by ${item.issuer}`));
  const meta = el("div", "item-meta");
  if (item.date) meta.appendChild(el("span", "item-tag date", item.date));
  if (item.association) meta.appendChild(el("span", "item-tag", item.association));
  if (meta.children.length > 0) div.appendChild(meta);
  return div;
}

function renderPublicationItem(item) {
  const div = el("div", "section-item");
  div.appendChild(el("div", "item-primary", item.title || item));
  if (item.publication) div.appendChild(el("div", "item-secondary", item.publication));
  const meta = el("div", "item-meta");
  if (item.date) meta.appendChild(el("span", "item-tag date", item.date));
  if (meta.children.length > 0) div.appendChild(meta);
  if (item.description) {
    const desc = el("div", "item-desc");
    desc.textContent = item.description;
    div.appendChild(desc);
  }
  return div;
}

function renderGenericItem(item) {
  const div = el("div", "section-item");
  div.textContent = typeof item === 'string' ? item : JSON.stringify(item);
  return div;
}

const RENDERERS = {
  Experience: renderExperienceItem,
  Volunteering: renderExperienceItem,
  Education: renderEducationItem,
  Skills: renderSkillItem,
  Languages: renderLanguageItem,
  "Licenses & certifications": renderLicenseItem,
  Projects: renderProjectItem,
  "Honors & awards": renderHonorItem,
  Publications: renderPublicationItem
};

// ── Profile Rendering ──
function renderProfile(data) {
  if (!data) return;

  document.getElementById("profile-card").classList.remove("hidden");
  document.getElementById("p-name").textContent = data.name || "Unknown";
  document.getElementById("p-headline").textContent = data.headline || "";
  document.getElementById("p-location").textContent = data.location || "";

  // Connection degree badge
  const degreeEl = document.getElementById("p-degree");
  if (data.connectionDegree) {
    degreeEl.textContent = data.connectionDegree;
    degreeEl.classList.remove("hidden");
  } else {
    degreeEl.classList.add("hidden");
  }

  // Profile image - with fallback for missing images
  const img = document.getElementById("p-image");
  if (data.profileImage && data.profileImage.length > 0 && 
      !data.profileImage.startsWith('data:image/svg')) {
    img.src = data.profileImage;
    img.style.display = 'block';
    img.classList.remove('no-photo');
    img.onerror = function() {
      // If image fails to load, show placeholder
      this.style.display = 'none';
      showDefaultAvatar(data.name);
    };
    // Remove any existing placeholder
    const existing = document.querySelector('.default-avatar');
    if (existing) existing.remove();
  } else {
    img.style.display = 'none';
    showDefaultAvatar(data.name);
  }

  // Stats bar
  const hasStats = data.connections || data.followers || data.mutualConnections;
  if (hasStats) {
    document.getElementById("stats-bar").classList.remove("hidden");
    document.getElementById("s-conn").textContent = data.connections || "—";
    document.getElementById("s-foll").textContent = data.followers || "—";
    document.getElementById("s-mutual").textContent = data.mutualConnections || "0";
  } else {
    document.getElementById("stats-bar").classList.add("hidden");
  }

  // Sections
  const container = document.getElementById("sections-container");
  container.innerHTML = "";

  const sections = data.sections || {};
  Object.keys(sections).forEach(key => {
    const items = sections[key];
    if (!Array.isArray(items) || items.length === 0) return;

    // Section header
    const header = el("div", "section-header");
    const iconSpan = el("span", "section-icon");
    iconSpan.innerHTML = SECTION_ICONS[key] || '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/></svg>';
    header.appendChild(iconSpan);
    header.appendChild(el("span", "section-title", key));
    header.appendChild(el("span", "section-count", items.length.toString()));
    container.appendChild(header);

    // About: special rendering
    if (key === "About") {
      items.forEach(text => container.appendChild(el("div", "about-text", text)));
      return;
    }

    // Section items
    const renderer = RENDERERS[key] || renderGenericItem;
    items.forEach(item => container.appendChild(renderer(item)));
  });

  // JSON view
  document.getElementById("json-output").textContent = JSON.stringify(data, null, 2);
}

// ── Core Logic ──
async function loadLatest() {
  try {
    const profiles = await getStoredProfiles();
    if (profiles.length) {
      renderProfile(profiles[profiles.length - 1]);
    } else {
      setStatus("No profiles captured yet.");
    }
  } catch (e) {
    console.error("Failed to load profiles:", e);
    setStatus("Error loading data.");
  }
}

async function captureNow() {
  setStatus("Capturing...");
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab || !tab.url.includes("linkedin.com/in/")) {
    setStatus("Please open a LinkedIn profile.");
    return;
  }

  // Read current toggle settings from storage
  const settings = await chrome.storage.local.get(['autoScrapeEnabled', 'autoDedupEnabled']);
  const autoDedupEnabled = settings.autoDedupEnabled === true;
  try {
    chrome.tabs.sendMessage(tab.id, { action: "extract" }, async (response) => {
      if (chrome.runtime.lastError) {
        const error = chrome.runtime.lastError.message;
        if (error.includes("Could not establish connection") || error.includes("Receiving end does not exist")) {
          setStatus("Loading... retry in 2s.");
        } else {
          setStatus(`Error: ${error}`);
        }
        return;
      }

      if (response) {
        if (response.error) {
          setStatus("Failed: " + response.error);
          return;
        }

        let history = await getStoredProfiles();
        const newEntry = { ...response, captured_at: new Date().toISOString() };
        
        // Smart deduplication logic (if enabled)
        if (autoDedupEnabled) {
          const duplicateIndex = history.findIndex(p => 
            (p.name && newEntry.name && p.name.toLowerCase() === newEntry.name.toLowerCase()) ||
            (p.url && newEntry.url && normalizeLinkedInUrl(p.url) === normalizeLinkedInUrl(newEntry.url))
          );
          
          if (duplicateIndex !== -1) {
            const oldEntry = history[duplicateIndex];
            const newQuality = calculateDataQuality(newEntry);
            const oldQuality = calculateDataQuality(oldEntry);
            
            // Replace if: new quality > old quality OR (same quality AND newer timestamp)
            if (newQuality > oldQuality || (newQuality === oldQuality && new Date(newEntry.captured_at) > new Date(oldEntry.captured_at))) {
              history[duplicateIndex] = newEntry;
              setStatus("✓ Profile updated (better data)");
            } else {
              setStatus("⊘ Duplicate skipped (existing data better)");
              renderProfile(oldEntry);
              return;
            }
          } else {
            history.push(newEntry);
          }
        } else {
          history.push(newEntry);
        }
        
        await chrome.storage.local.set({ [STORAGE_KEY]: history.slice(-50) });

        renderProfile(newEntry);
        if (!autoDedupEnabled) setStatus("Captured successfully!");
        loadHistory(); // Refresh history list
      } else {
        setStatus("No response received.");
      }
    });
  } catch (e) {
    setStatus("Error: " + e.message);
  }
}

// Calculate data quality score (0-100)
function calculateDataQuality(profile) {
  let score = 0;
  const weights = {
    name: 10,
    headline: 10,
    about: 15,
    location: 5,
    connections: 10,
    followers: 10,
    experience: 15,
    education: 10,
    skills: 10,
    phone: 2.5,
    email: 2.5
  };
  
  if (profile.name) score += weights.name;
  if (profile.headline) score += weights.headline;
  if (profile.about && profile.about.length > 20) score += weights.about;
  if (profile.location) score += weights.location;
  if (profile.connections) score += weights.connections;
  if (profile.followers) score += weights.followers;
  if (profile.experience && profile.experience.length > 0) score += weights.experience;
  if (profile.education && profile.education.length > 0) score += weights.education;
  if (profile.skills && profile.skills.length > 0) score += weights.skills;
  if (profile.phone) score += weights.phone;
  if (profile.email) score += weights.email;
  
  return score;
}

// Normalize LinkedIn URLs for comparison
function normalizeLinkedInUrl(url) {
  if (!url) return '';
  // Remove protocol, www, trailing slash, query params
  return url.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/$/, '').split('?')[0].toLowerCase();
}

// ── Event Listeners ──
document.addEventListener("DOMContentLoaded", () => {
  // Load theme first
  chrome.storage.local.get(['darkMode'], (result) => {
    const darkMode = result.darkMode || false;
    document.body.setAttribute('data-theme', darkMode ? 'dark' : 'light');
  });
  
  loadLatest();
  loadSettings();
  loadDebugLogs(); // Load debug logs on startup too

  // Real-time storage listener - updates UI when profiles or logs are added
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;
    
    const activeTab = document.querySelector('.tab-content.active');
    const activeTabId = activeTab ? activeTab.id : null;
    
    // When profiles are added/updated by auto-scrape
    if (changes.profiles && changes.profiles.newValue) {
      const profiles = changes.profiles.newValue;
      
      // SHOW TOAST IMMEDIATELY (before loading data)
      showToast('✓ New profile scraped');
      
      // Auto-update preview tab with latest profile
      loadLatest();
      
      // Refresh currently visible tab
      if (activeTabId === 'view-history') {
        loadHistory();
      } else if (activeTabId === 'view-json') {
        const latest = profiles[profiles.length - 1];
        const output = document.getElementById('json-output');
        if (output) {
          output.textContent = JSON.stringify(latest, null, 2);
        }
      }
    }
    
    // When extraction logs are added
    if (changes.extractionLogs && activeTabId === 'view-debug') {
      loadDebugLogs();
    }
  });

  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const tab = e.target.dataset.tab;
      showTab(tab);
      if (tab === "history") loadHistory();
      if (tab === "settings") loadSettings();
      if (tab === "debug") loadDebugLogs();
    });
  });

  document.getElementById("capture").addEventListener("click", captureNow);

  document.getElementById("export").addEventListener("click", async () => {
    const profiles = await getStoredProfiles();
    const blob = new Blob([JSON.stringify(profiles, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `linkedin_export_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
  });

  document.getElementById("copy-json").addEventListener("click", () => {
    const text = document.getElementById("json-output").textContent;
    navigator.clipboard.writeText(text);
    showToast("✓ JSON copied to clipboard");
  });

  document.getElementById("copy-json-preview").addEventListener("click", async () => {
    const profiles = await getStoredProfiles();
    const latest = profiles[profiles.length - 1];
    if (latest) {
      navigator.clipboard.writeText(JSON.stringify(latest, null, 2));
      showToast("✓ JSON copied to clipboard");
    } else {
      showToast("⚠ No data to copy");
    }
  });

  document.getElementById("copy-all-json").addEventListener("click", async () => {
    const profiles = await getStoredProfiles();
    if (profiles.length > 0) {
      navigator.clipboard.writeText(JSON.stringify(profiles, null, 2));
      showToast(`✓ All ${profiles.length} profile${profiles.length > 1 ? 's' : ''} copied`);
    } else {
      showToast("⚠ No profiles to copy");
    }
  });

  document.getElementById("save-settings").addEventListener("click", saveSettings);
  
  // Auto-scrape toggle - instant save (prevents auto-reset on page reload)
  document.getElementById("auto-scrape-toggle").addEventListener("change", (e) => {
    chrome.storage.local.set({ autoScrapeEnabled: e.target.checked });
  });
  
  // Dark mode toggle - instant switch
  document.getElementById("dark-mode-toggle").addEventListener("change", (e) => {
    const darkMode = e.target.checked;
    document.body.setAttribute('data-theme', darkMode ? 'dark' : 'light');
    chrome.storage.local.set({ darkMode: darkMode });
  });
  
  // Auto-dedup toggle - instant save
  document.getElementById("auto-dedup-toggle").addEventListener("change", (e) => {
    chrome.storage.local.set({ autoDedupEnabled: e.target.checked });
  });
  
  document.getElementById("deduplicate-btn").addEventListener("click", deduplicateProfiles);

  document.getElementById("clear-history").addEventListener("click", clearHistory);
  document.getElementById("clear-logs").addEventListener("click", clearDebugLogs);

});

// ── History ──
async function loadHistory() {
  try {
    const profiles = await getStoredProfiles();
    const list = document.getElementById("history-list");
    list.innerHTML = "";

    if (profiles.length === 0) {
      list.innerHTML = "<div style='text-align:center; padding:20px; color:#999; font-size:12px;'>No history yet</div>";
      return;
    }

    [...profiles].reverse().forEach((p, idx) => {
      const item = el("div", "history-item");
      const actualIndex = profiles.length - 1 - idx;
      
      const content = el("div", "");
      content.style.flex = "1";
      content.style.cursor = "pointer";
      content.onclick = () => { renderProfile(p); showTab("preview"); };
      content.appendChild(el("div", "history-name", p.name || "Unknown"));
      content.appendChild(el("div", "history-headline", p.headline || "No headline"));
      item.appendChild(content);

      const d = new Date(p.captured_at);
      const dateEl = el("div", "history-date",
        `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${d.getMinutes().toString().padStart(2, '0')}`);
      dateEl.style.cursor = "pointer";
      dateEl.onclick = () => { renderProfile(p); showTab("preview"); };
      item.appendChild(dateEl);
      
      // Add delete button with inline confirmation
      const deleteBtn = document.createElement("button");
      deleteBtn.innerHTML = "✕"; // X icon instead of emoji
      deleteBtn.className = "history-delete-btn";
      deleteBtn.style.cssText = "margin-left: 10px; padding: 4px 10px; background: #ff5252; color: #dc2626; border: 1px solid #fca5a5; border-radius: 4px; cursor: pointer; font-size: 14px; font-weight: bold; transition: all 0.2s;";
      
      let pendingDelete = false;
      deleteBtn.onclick = (e) => {
        e.stopPropagation();
        if (!pendingDelete) {
          // First click: show confirmation
          pendingDelete = true;
          deleteBtn.innerHTML = "Confirm?";
          deleteBtn.style.background = "#dc2626";
          deleteBtn.style.color = "white";
          deleteBtn.style.borderColor = "#991b1b";
          
          // Reset after 4 seconds if not confirmed
          setTimeout(() => {
            if (pendingDelete) {
              pendingDelete = false;
              deleteBtn.innerHTML = "✕";
              deleteBtn.style.background = "#ff5252";
              deleteBtn.style.color = "#dc2626";
              deleteBtn.style.borderColor = "#fca5a5";
            }
          }, 4000);
        } else {
          // Second click: actually delete
          deleteProfile(actualIndex);
        }
      };
      item.appendChild(deleteBtn);

      list.appendChild(item);
    });
  } catch (e) {
    setStatus("Failed to load history.");
  }
}

async function deleteProfile(index) {
  const profiles = await getStoredProfiles();
  profiles.splice(index, 1);
  await chrome.storage.local.set({ [STORAGE_KEY]: profiles });
  loadHistory();
  showToast("✓ Deleted");
}

function clearHistory() {
  if (confirm("Clear all history?")) {
    chrome.storage.local.set({ [STORAGE_KEY]: [] }, () => {
      loadHistory();
      setStatus("History cleared.");
      document.getElementById("profile-card").classList.add("hidden");
    });
  }
}

// ── Settings ──
async function loadSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['autoScrapeEnabled', 'saveFolder', 'darkMode', 'autoDedupEnabled', 'initialDelay', 'pollInterval', 'cooldownPeriod'], (result) => {
      const enabled = result.autoScrapeEnabled === true; // default OFF (passive)
        const folder = result.saveFolder || 'linkedin_profiles';
      const darkMode = result.darkMode || false;
      const autoDedup = result.autoDedupEnabled === true; // default OFF
      const initialDelay = result.initialDelay || 3.5; // seconds (increased to let profile settle)
      const pollInterval = result.pollInterval || 2500; // milliseconds
      const cooldownPeriod = result.cooldownPeriod || 30; // seconds
      
      document.getElementById('auto-scrape-toggle').checked = enabled;
      document.getElementById('auto-dedup-toggle').checked = autoDedup;
      document.getElementById('save-folder').value = folder;
      document.getElementById('dark-mode-toggle').checked = darkMode;
      document.getElementById('initial-delay').value = initialDelay;
      document.getElementById('poll-interval').value = pollInterval;
      document.getElementById('cooldown-period').value = cooldownPeriod;
      
      // Apply theme
      document.body.setAttribute('data-theme', darkMode ? 'dark' : 'light');
      
      resolve({ enabled, folder, darkMode, autoDedup, initialDelay, pollInterval, cooldownPeriod });
    });
  });
}

async function loadDebugLogs() {
  const result = await chrome.storage.local.get(['extractionLogs','lastBackgroundError']);
  const logs = result.extractionLogs || [];
  const lastBgError = result.lastBackgroundError || null;
  const container = document.getElementById('debug-logs');
  
  // Show last background error if present
  if (lastBgError) {
    container.innerHTML = `<div class="card" style="background:#fee2e2; border-left: 4px solid #dc2626; margin-bottom:10px; padding:10px;">
      <strong style="color:#b91c1c;">Background error</strong>
      <div style="font-size:12px; color:#7f1d1d; margin-top:6px;">${String(lastBgError)}</div>
    </div>`;
  } else {
    container.innerHTML = '';
  }
  
  if (logs.length === 0) {
    container.innerHTML += '<p class="setting-desc" style="text-align: center; padding: 20px;">No extraction logs yet</p>';
    return;
  }
  
  // Reverse to show most recent first
  logs.slice().reverse().forEach((log, index) => {
    const logCard = document.createElement('div');
    logCard.className = 'card';
    logCard.style.marginBottom = '10px';
    logCard.style.padding = '12px';
    logCard.style.fontSize = '13px';
    
    const timestamp = new Date(log.timestamp).toLocaleString();
    
    // EXTRACTION METHOD (better contrast colors with white text)
    const method = log.extractionMethod || 'Unknown';
    let methodColor = '#6b7280';
    if (method === 'DOM-only') methodColor = '#7c3aed'; // Purple-600 (stealth)
    else if (method === 'InternalAPI-only') methodColor = '#059669'; // Green-600 (ghost)
    else if (method === 'InternalAPI+DOM') methodColor = '#ca8a04'; // Amber-600 (hybrid)
    
    // PERFORMANCE (high contrast with white text)
    const perfMs = log.extractionTimeMs || 0;
    const perfColor = perfMs < 1000 ? '#059669' : perfMs < 3000 ? '#d97706' : '#dc2626';
    
    // WAIT TIME (if available)
    const waitMs = log.waitTimeMs || 0;
    const waitDisplay = waitMs > 0 ? `<span class="badge" style="background: #2563eb; color: white; font-size: 11px; padding: 3px 8px; margin-left: 6px; border-radius: 4px; font-weight: 500;">⏱ Wait ${waitMs}ms</span>` : '';
    
    // INTERNAL_API TRACKING (100% verification - high contrast)
    const hydrationIcon = log.fullyInternalAPIFed ? '✓ True Ghost' : (log.hydrationFound ? '⚠ Partial' : '✗ No InternalAPI');
    const hydrationColor = log.fullyInternalAPIFed ? '#059669' : (log.hydrationFound ? '#d97706' : '#dc2626');
    
    // EXPANSION TRACKING (high contrast)
    const expandIcon = log.expandSucceeded ? `🤖 Clicked ${log.expandClickCount}x` : (log.expandRequested ? '❌ Requested (0 clicks)' : '👻 Not Requested');
    const expandColor = log.expandSucceeded ? '#2563eb' : (log.expandRequested ? '#dc2626' : '#7c3aed');
    
    const dataPointsList = Object.entries(log.dataPoints)
      .map(([key, val]) => `${val ? '✓' : '✗'} ${key}`)
      .join(' • ');
    
    logCard.innerHTML = `
      <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
        <strong>${log.name}</strong>
        <span style="font-size: 11px; color: var(--text-secondary);">${timestamp}</span>
      </div>
      <div style="margin-bottom: 6px;">
        <span class="badge" style="background: ${methodColor}; color: white; font-size: 11px; padding: 3px 8px; border-radius: 4px; font-weight: 500;">${method}</span>
        ${waitDisplay}
        <span class="badge" style="background: ${perfColor}; color: white; font-size: 11px; padding: 3px 8px; margin-left: 6px; border-radius: 4px; font-weight: 500;">⚡ ${perfMs}ms</span>
        <span class="badge" style="background: ${expandColor}; color: white; font-size: 11px; padding: 3px 8px; margin-left: 6px; border-radius: 4px; font-weight: 500;">${expandIcon}</span>
      </div>
      <div style="font-size: 11px; color: var(--text-secondary); line-height: 1.6;">
        ${dataPointsList}
      </div>
      ${log.hydrationFound ? `<div style="font-size: 10px; color: var(--text-secondary); margin-top: 6px;">
        InternalAPI: ${log.hydrationHadConnections ? '✓conn' : '✗conn'} ${log.hydrationHadFollowers ? '✓foll' : '✗foll'} ${log.hydrationHadHeadline ? '✓head' : '✗head'}
      </div>` : ''}
    `;
    
    container.appendChild(logCard);
  });
}

async function clearDebugLogs() {
  await chrome.storage.local.set({ extractionLogs: [] });
  showToast('✓ Debug logs cleared');
  loadDebugLogs();
}

async function saveSettings() {
  const enabled = document.getElementById('auto-scrape-toggle').checked;
  const autoDedup = document.getElementById('auto-dedup-toggle').checked;
  const folder = document.getElementById('save-folder').value || 'linkedin_profiles';
  const initialDelay = parseInt(document.getElementById('initial-delay').value) || 3.5;
  const pollInterval = parseInt(document.getElementById('poll-interval').value) || 2500;
  const cooldownPeriod = parseInt(document.getElementById('cooldown-period').value) || 30;
  
  chrome.storage.local.set({ 
    autoScrapeEnabled: enabled,
    autoDedupEnabled: autoDedup,
    saveFolder: folder,
    initialDelay: initialDelay,
    pollInterval: pollInterval,
    cooldownPeriod: cooldownPeriod
  }, () => {
    // Notify background script of settings change
    chrome.runtime.sendMessage({ 
      action: 'updateSettings', 
      enabled, 
      autoDedup,
      folder,
      initialDelay,
      pollInterval,
      cooldownPeriod
    });
    
    showToast('✓ Settings saved');
  });
}

async function deduplicateProfiles() {
  const btn = document.getElementById('deduplicate-btn');
  const originalText = btn.textContent;
  btn.textContent = 'Processing...';
  btn.disabled = true;
  
  chrome.runtime.sendMessage({ action: 'deduplicateProfiles' }, (response) => {
    btn.textContent = originalText;
    btn.disabled = false;
    
    if (response && response.ok) {
      const removed = response.before - response.after;
      if (removed > 0) {
        showToast(`✓ Removed ${removed} duplicate${removed > 1 ? 's' : ''}`);
        // Refresh history view if open
        if (document.getElementById('view-history').classList.contains('active')) {
          loadHistory();
        }
      } else {
        showToast('✓ No duplicates found');
      }
    } else {
      showToast('⚠ Deduplication failed');
    }
  });
}
