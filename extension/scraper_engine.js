/**
 * ScraperEngine: Orchestrator for LinkedIn Profile Extraction.
 *
 * Delegates to:
 *   - parsers.js        → Structured section parsers
 *   - section_finder.js  → DOM section location & item splitting
 *   - metadata.js        → Profile metadata, Voyager JSON, fallbacks
 *
 * This file is intentionally kept thin — all heavy logic lives in the modules above.
 */
class ScraperEngine {
    constructor(doc = document) {
        this.doc = doc;

        // Resolve module references (works in both Chrome extension & Node.js)
        if (typeof LinkedInParsers !== 'undefined') {
            this.parsers = LinkedInParsers;
        } else if (typeof require !== 'undefined') {
            this.parsers = require('./parsers.js');
        }

        if (typeof SectionFinder !== 'undefined') {
            this.sectionFinder = SectionFinder;
        } else if (typeof require !== 'undefined') {
            this.sectionFinder = require('./section_finder.js');
        }

        if (typeof MetadataExtractor !== 'undefined') {
            this.metadata = MetadataExtractor;
        } else if (typeof require !== 'undefined') {
            this.metadata = require('./metadata.js');
        }

        this.sections = [
            "About", "Experience", "Education", "Projects", "Volunteering",
            "Skills", "Publications", "Honors & awards", "Languages",
            "Licenses & certifications"
        ];
    }

    /**
     * Public API — kept for backward compatibility with existing callers.
     */
    normalize(text) {
        return this.sectionFinder.normalize(text);
    }

    deepClean(text) {
        return this.parsers.deepClean(text);
    }

    findSectionContent(sectionTitle) {
        return this.sectionFinder.findSectionContent(this.doc, sectionTitle);
    }

    parseExperience(rawText) {
        return this.parsers.parseExperience(rawText);
    }

    parseEducation(rawText) {
        return this.parsers.parseEducation(rawText);
    }

    /**
     * Main extraction — assembles metadata + sections + parsing.
     * Returns: { profile data, PLUS metadata about extraction sources }
     */
    extractAll() {
        const doc = this.doc;

        // 1. DOM metadata
        const domData = this.metadata.extractDomMetadata(doc);

        // 2. Voyager JSON data (track whether it succeeded)
        const voyager = this.metadata.extractVoyagerData(doc, domData.name);
        const voyagerFound = voyager !== null;
        const voyagerHasConnections = !!voyager?.metadata?.connections;
        const voyagerHasFollowers = !!voyager?.metadata?.followers;
        const voyagerHasHeadline = !!voyager?.metadata?.headline;

        // 3. Extract all section raw items from DOM
        const domSections = {};
        this.sections.forEach(sec => {
            domSections[sec] = this.sectionFinder.findSectionContent(doc, sec);
        });

        // 4. Mutual connections
        const mutuals = this.metadata.extractMutuals(doc);

        // 5. Merge DOM + Voyager metadata (prefer Voyager)
        const final = {
            name: (voyager?.metadata?.name && voyager.metadata.name.length > 2)
                ? voyager.metadata.name
                : (domData.name || "Unknown Profile"),
            headline: (voyager?.metadata?.headline && voyager.metadata.headline.length > 2)
                ? voyager.metadata.headline
                : (domData.headline || ""),
            location: voyager?.metadata?.location || domData.location,
            connectionDegree: domData.connectionDegree || voyager?.metadata?.connectionDegree,
            connections: voyager?.metadata?.connections || domData.connections,
            followers: voyager?.metadata?.followers || domData.followers,
            profileImage: this.metadata.getBestProfileImage(doc, domData.profileImage),
            mutualConnections: mutuals.mutualConnections,
            mutualNames: mutuals.mutualNames,
            sections: { ...domSections },
            // EXTRACTION SOURCE METADATA (for 100% verification)
            _extractionMetadata: {
                voyagerFound,
                voyagerHasConnections,
                voyagerHasFollowers,
                voyagerHasHeadline,
                connectionsFromVoyager: voyagerHasConnections,
                followersFromVoyager: voyagerHasFollowers,
                headlineFromVoyager: voyagerHasHeadline
            }
        };

        // 6. Voyager section overlay (prefer Voyager if DOM is truncated)
        if (voyager?.sections) {
            Object.keys(voyager.sections).forEach(key => {
                const domItems = domSections[key] || [];
                const voyItems = voyager.sections[key] || [];
                const isTruncated = domItems.some(i =>
                    i.toLowerCase().includes("show all") ||
                    i.toLowerCase().includes("show more") ||
                    i.includes("… more") ||
                    i.includes("... more") ||
                    i.toLowerCase().endsWith("more")
                );

                if (voyItems.length > 0 && (isTruncated || voyItems.length >= domItems.length)) {
                    final.sections[key] = voyItems;
                }
            });
        }

        // 7. Apply robust fallbacks
        this.metadata.applyFallbacks(doc, final);

        // 8. Parse raw section strings into structured objects
        Object.keys(final.sections).forEach(key => {
            final.sections[key] = this.parsers.parseSection(key, final.sections[key]);
        });

        // 9. Final metadata
        final.captured_at = new Date().toISOString();
        try { final.url = doc.location.href; } catch (_) { final.url = ""; }

        return final;
    }
}

// Export for both Chrome extension and Node.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ScraperEngine;
} else {
    window.ScraperEngine = ScraperEngine;
}
