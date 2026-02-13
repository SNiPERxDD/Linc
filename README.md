# Linc 

> **Mission**: Achieving 100% data extraction fidelity from LinkedIn profiles through a hybrid Internal-API and DOM-Adaptive extraction engine.

**Linc** is a high-precision Chrome extension designed for developers and researchers. It operates silently in the background, automatically capturing structured profile data (Experience, Education, Skills, etc.) as you browse. 

While LinkedIn has shifted toward **Streaming-Based Content Delivery** (fragmented hydration objects rather than static JSON blocks), this engine is designed to intercept and reconstruct these internal streams to ensure no data loss due to UI truncation.

> [!CAUTION]
> **Automation Risk Advisory**: LinkedIn employs extremely aggressive behavioral analysis and frequency-based detection. Excessive or rapid use of this tool (even in passive mode) may trigger account restrictions, CAPTCHAs, or permanent automation bans. It is strongly recommended to use this tool conservatively and simulate human browsing patterns.

---

## 🏗 Architectural Doctrine

The scraper is built on three core technical pillars:

1.  **Hydration Interception**: Prioritizes raw, internal hydration data embedded in LinkedIn's `<code>` blocks and streaming responses. This bypasses the need for clicking "Show all" or handling "... more" markers in the DOM.
2.  **DOM-Adaptive Fallback**: When internal streams are incomplete or gated, a semantic-aware DOM engine takes over, using proximity-based discovery and attribute normalization to extract data from obfuscated CSS classes.
3.  **DeepClean Processing**: A post-extraction pipeline that strips LinkedIn UI artifacts (e.g., "Show credential", "Endorse", duplicated section headers) and normalizes dates and durations.

---

## ✨ Features

### Core Extraction
- **High-Precision Profile Parsing**: Captures 16+ profile segments:
  - Experience (with company, roles, dates, descriptions, duration)
  - Education (school, field, degree, date range)
  - Projects (title, description, dates, links)
  - Skills (skill name, endorsement count)
  - Languages (language, proficiency level)
  - Honors & Awards, Publications, Certifications, Volunteering, and more
- **Structured JSON Output**: Converts raw text into clean, queryable JSON objects with proper date ranges and position durations
- **No Expansion Required**: Extracts full content from the DOM without clicking "Show more" buttons, reducing detection risk by 100%

### Capture Modes
- **Manual Capture (Recommended)**: Use keyboard shortcut or popup button to immediately capture the current profile
  - Mac: `Cmd+Shift+E`
  - Windows/Linux: `Ctrl+Shift+E`
  - **Why this is safest**: You control exactly when capturing occurs, mimicking natural human behavior
  - Minimal detection risk when used with human-like browsing patterns

- **Auto-Capture Mode (Optional)**: Silently and automatically detects when you navigate to a LinkedIn profile and triggers extraction
  - ⚠️ **Use conservatively**: Enable only when intentionally browsing LinkedIn, not for bulk scraping
  - Configurable initial delay (default: 3.5s) to simulate natural human reading time
  - Customizable polling interval (default: 2.5s) for profile change detection
  - Per-profile cooldown (default: 30s) — **increase to 60%+ seconds for safer use**

### Profile Management
- **History & Storage**: Stores up to 100 captured profiles locally with timestamps
- **Smart Deduplication**: Optional auto-dedup feature prevents duplicate captures of the same person
- **Profile Preview**: View extracted data inline with section-by-section breakdown (About, Experience, Education, Skills, etc.)
- **Export to JSON**: Download any captured profile as a formatted JSON file for external analysis or archival
- **Batch Operations**: Select and manage multiple profiles from history

### User Interface
- **Dark Mode**: Full dark theme support with system detection and manual toggle
  - Automatically adapts to your OS theme preferences
  - Manual override available in settings
- **Responsive Design**: Optimized popup interface for quick access and profile browsing
- **Real-time Status**: Visual feedback during auto-capture with extraction metadata (extraction method, sources, etc.)
- **Section-Based Rendering**: Clean, organized display of each profile section with expandable sub-items

### Settings & Customization
- **Auto-Scrape Toggle**: Enable/disable automatic profile capture
- **Initial Delay Configuration**: Control the delay before extraction begins (3.5s default - allows LinkedIn to fully render)
- **Poll Interval Adjustment**: Fine-tune how often the extension checks for profile changes
- **Cooldown Period**: Set minimum time between captures of the same profile
- **Save Folder Selection**: Choose download destination for exported profiles
- **Auto-Dedup**: Automatically prevent capturing duplicate profiles

### Safety & Compliance
- **Zero-Click Extraction**: Extracts visible DOM content without clicking expansion buttons (avoids telemetry)
- **Humanized Timing**: Log-normal distributed delays simulate natural human browsing patterns
- **Silent Operation**: No console logs, no DOM mutations, no performance fingerprints
- **Rate Limiting**: Per-tab and global rate limiting prevents detection through pattern analysis
- **Metadata Tracking**: Logs which extraction method provided which data (DOM-only, Voyager+DOM, etc.)

---

## 🚀 Getting Started

### Installation (Developer Mode)

1.  Clone this repository.
2.  Open Chrome and navigate to `chrome://extensions`.
3.  Enable **Developer mode** (toggle in top-right).
4.  Click **Load unpacked**.
5.  Select the `extension/` directory within this project.

### Usage

#### ⭐ **Recommended: Manual Capture via Keyboard Shortcut (Safest)**
For maximum safety and to avoid detection, use the manual keyboard shortcut:
- **Mac**: `Cmd+Shift+E`
- **Windows/Linux**: `Ctrl+Shift+E`

This approach gives you complete control over *when* and *which* profiles are captured, simulating natural human behavior. Navigate to a LinkedIn profile, read for a moment, then press the shortcut to capture. This is the **lowest-risk** method.

**Pro Tip for Stealth**: Wait 2–3 seconds after the page loads before hitting the shortcut. This mimics a human actually reading the headline and profile summary, making the behavior indistinguishable from natural browsing.

**If Capture Fails**: Reload the tab (`Cmd+R` or `Ctrl+R`) and try again. This ensures all profile elements are fully rendered before extraction attempts.

#### Auto-Capture Mode (Use with Caution)
If you choose to enable Auto-Capture:
- Ensure **large cooldown periods** (minimum 60+ seconds between profiles)
- **Disable** Auto-Scrape by default and only enable when actively and intentionally browsing LinkedIn
- Monitor extension behavior through the History tab to verify realistic timing patterns
- Do **not** use in scripts or automated LinkedIn browsing scenarios

#### Viewing Results
- Open the extension popup to view your capture history
- Click any profile to preview extracted data
- Use the History tab to filter, search, and export captured profiles as JSON

> [!WARNING]
> **Auto-Capture Detection Risk**: Leaving auto-scrape enabled while actively browsing can create detectable patterns. For safest use, **primarily rely on the keyboard shortcut (`Cmd+Shift+E` / `Ctrl+Shift+E`)** and treat auto-capture as an optional feature for selective use only.

---

## 📁 Project Structure

The project has been streamlined to focus exclusively on the core extension logic:

```text
.
├── extension/          # Core Extension Source
│   ├── manifest.json   # V3 Extension Manifest
│   ├── content.js      # Page Lifecycle Logic
│   ├── scraper_engine.js # Central Orchestrator
│   ├── parsers.js      # Structured Item Parsers
│   ├── section_finder.js # DOM Location Logic
│   └── metadata.js     # Internal API & Fallbacks
├── deleted/            # Archived Legacy Plans & Data (Redacted)
└── CHANGELOG.md        # Detailed Version History
```

---

## ⚖️ Legal & Compliance

This tool is intended for personal research and educational purposes. Users are responsible for ensuring their use of this software complies with:
1.  LinkedIn's Terms of Service.
2.  Local data privacy laws (e.g., GDPR, CCPA).
3.  Ethical scraping standards.

---

**Developed with Precision.**
