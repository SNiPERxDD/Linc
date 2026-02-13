
# Extension

## Overview

This folder contains the source for a high-precision browser extension designed to capture LinkedIn profile data. It utilizes a hybrid extraction engine that:
1. **Intercepts Streaming Hydration**: Reconstructs data from LinkedIn's fragmented internal streams.
2. **Adaptive DOM Scraping**: Falls back to semantic DOM parsing when streams are gated.

The extension consists of a manifest plus background, content, and UI scripts.

## Supported browsers

- Chromium-based browsers (Chrome, Edge, etc.) that support Manifest V2 or V3 as indicated in the extension's `manifest.json`.

## Installation (load unpacked)

1. Open the browser and go to `chrome://extensions` (or the equivalent extensions page).
2. Enable "Developer mode".
3. Click "Load unpacked" and select this `extension/` folder.
4. After loading, use the browser DevTools to inspect content script logs on the page and the extension's background console.

## Usage

- The extension runs client-side scripts inside the browser context. Behavior is determined by the scripts and permissions declared in `manifest.json`.
- To observe runtime activity, open the page where the extension runs and check the page console (content scripts) and the extension background console.

## Security and compliance

> [!CAUTION]
> **Account Safety**: LinkedIn monitors for scraping activity. Excessive extraction may lead to temporary or permanent account bans. Use with caution and avoid high-frequency automation.

- Review `manifest.json` and all extension scripts before installing.
- Confirm that using the extension complies with the target website's terms of service and applicable laws.

## Troubleshooting

- If the extension does not appear after loading, confirm the selected folder contains `manifest.json`.
- Use the browser's extension inspection tools to view errors and logs.

## Contact

If this folder is part of a project with issue tracking, open an issue for questions or problems. Otherwise, inspect the source files in this folder for implementation details.
