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

## ✨ Key Features

- **High-Precision Extraction**: Captures 16+ profile segments including Experience, Education, Projects, Skills, and Languages.
- **Auto-Capture Mode**: Automatically detects profile navigation and initiates extraction without user interaction.
- **Structured Output**: Converts raw text into clean JSON objects with proper date ranges and position durations.
- **History Management**: Local storage of previous captures with preview and export capabilities.
- **Keyboard Shortcuts**: `Cmd+Shift+E` (Mac) or `Ctrl+Shift+E` (Windows) for manual overrides.

---

## 🚀 Getting Started

### Installation (Developer Mode)

1.  Clone this repository.
2.  Open Chrome and navigate to `chrome://extensions`.
3.  Enable **Developer mode** (toggle in top-right).
4.  Click **Load unpacked**.
5.  Select the `extension/` directory within this project.

### Usage

- **Passive Mode**: Simply browse LinkedIn profiles. The extension icon will indicate activity when a capture is triggered.
- **Manual Mode**: Use the keyboard shortcut or open the extension popup and click "Capture".
- **History**: Open the popup to view, filter, and review captured profiles.

> [!WARNING]
> High-frequency manual captures in short intervals significantly increase the risk of account flagging.

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
