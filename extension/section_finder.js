/**
 * section_finder.js — Locates and splits LinkedIn profile sections from the DOM.
 * Handles LinkedIn's fully obfuscated CSS classes and div-based layout.
 */

const SectionFinder = (() => {
    // Requires LinkedInParsers for deepClean
    const _getClean = () => {
        if (typeof LinkedInParsers !== 'undefined') return LinkedInParsers.deepClean;
        if (typeof require !== 'undefined') return require('./parsers.js').deepClean;
        return (t) => t;
    };

    function normalize(text) {
        if (!text) return "";
        return text.toString().replace(/&amp;/g, '&').replace(/\s+/g, " ").trim();
    }

    // ──── Section ID mapping ────
    const sectionIdMap = {
        "about": ["about"],
        "experience": ["experience"],
        "education": ["education"],
        "skills": ["skills"],
        "projects": ["projects"],
        "volunteering": ["volunteering"],
        "publications": ["publications"],
        "honors & awards": ["honors_and_awards", "honors-and-awards", "recognition"],
        "languages": ["languages"],
        "licenses & certifications": ["licenses_and_certifications", "certifications", "licenses-and-certifications"]
    };

    // ──── Split items by <figure> boundaries ────
    function splitByFigures(doc, container, figures, sectionType) {
        const deepClean = _getClean();
        const figureSet = new Set(figures);
        const results = [];
        let currentItem = [];
        let started = false;

        const walker = doc.createTreeWalker(container, 1 /* SHOW_ELEMENT */, null);

        let node = walker.nextNode();
        while (node) {
            if (node.tagName === 'FIGURE' && node.hasAttribute('aria-label') && figureSet.has(node)) {
                if (currentItem.length > 0) {
                    const cleaned = currentItem
                        .filter(t => !t.match(/^(Show all|Show more|Show credential|Endorse|Other authors)/i))
                        .join(' · ');
                    if (cleaned.length > 3) results.push(deepClean(cleaned));
                }
                currentItem = [];
                started = true;
            } else if (started && node.tagName === 'P') {
                const text = node.textContent.trim();
                if (text.length > 1) currentItem.push(text);
            }
            node = walker.nextNode();
        }

        if (currentItem.length > 0) {
            const cleaned = currentItem
                .filter(t => !t.match(/^(Show all|Show more|Show credential|Endorse|Other authors)/i))
                .join(' · ');
            if (cleaned.length > 3) results.push(deepClean(cleaned));
        }

        return results;
    }

    // ──── Split items by company/school links ────
    function splitByLinks(doc, container, links, sectionType) {
        const deepClean = _getClean();
        const seen = new Set();
        const uniqueLinks = links.filter(l => {
            const href = l.getAttribute('href');
            if (seen.has(href)) return false;
            seen.add(href);
            return true;
        });

        const results = [];
        for (const link of uniqueLinks) {
            let itemContainer = link.parentElement;
            let levels = 0;
            while (itemContainer && levels < 5) {
                const parent = itemContainer.parentElement;
                if (!parent || parent === container) break;
                const siblingFig = parent.querySelector(':scope > * > figure, :scope > figure');
                if (siblingFig) { itemContainer = parent; break; }
                itemContainer = parent;
                levels++;
            }

            const ps = Array.from(itemContainer.querySelectorAll('p'));
            const text = ps
                .map(p => p.textContent.trim())
                .filter(t => t.length > 1 && !t.match(/^(Show all|Show more|Show credential|Endorse|Other authors)/i))
                .join(' · ');

            if (text.length > 3) results.push(deepClean(text));
        }

        return results;
    }

    // ──── Split items by <p> tag class patterns ────
    function splitByParagraphs(doc, container, sectionType) {
        const deepClean = _getClean();
        const allPs = Array.from(container.querySelectorAll('p'));
        if (allPs.length < 2) return [];

        const pData = allPs.map(p => ({
            text: p.textContent.trim(),
            classes: (p.className || '').split(/\s+/),
            el: p
        })).filter(d => d.text.length > 1 && !d.text.match(/^(Show all|Show more|Show credential|Endorse|Other authors)/i));

        if (pData.length < 2) return [];

        const getStyleKey = (classes) => classes.length > 1 ? classes[1] : classes[0];
        const firstKey = getStyleKey(pData[0].classes);
        const secondKey = getStyleKey(pData[1].classes);

        if (firstKey === secondKey) return [];

        const titleKey = firstKey;
        const items = [];
        let currentItem = [];

        for (const d of pData) {
            const key = getStyleKey(d.classes);
            if (key === titleKey && currentItem.length > 0) {
                items.push(deepClean(currentItem.join(' · ')));
                currentItem = [d.text];
            } else {
                currentItem.push(d.text);
            }
        }

        if (currentItem.length > 0) items.push(deepClean(currentItem.join(' · ')));
        return items.filter(t => t.length > 3);
    }

    // ──── Main section finder ────
    function findSectionContent(doc, sectionTitle) {
        const deepClean = _getClean();
        const target = sectionTitle.toLowerCase();
        const escapedTitle = sectionTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        let container = null;

        // STRATEGY 1: Find section by ID anchor
        const ids = sectionIdMap[target] || [];
        for (const id of ids) {
            const anchor = doc.getElementById(id);
            if (anchor) {
                container = anchor.closest('section') || anchor.closest('.artdeco-card');
                if (container) break;
            }
        }

        // STRATEGY 2: Find heading within MAIN content area
        if (!container) {
            const main = doc.querySelector('main') || doc.body;
            const candidates = Array.from(main.querySelectorAll("h2, h3, h4, span.visually-hidden, span[aria-hidden='true'], span, div"));

            const heading = candidates.find(el => {
                const text = normalize(el.textContent).toLowerCase();
                return text === target || text === target + target || text === target + " " + target;
            });

            if (heading) container = heading.closest("section") || heading.closest(".artdeco-card");
        }

        // STRATEGY 3: Broad fallback (full DOM)
        if (!container) {
            const allElements = Array.from(doc.querySelectorAll("h1, h2, h3, h4, span, strong, div"));
            const headings = allElements.filter(el => {
                const text = normalize(el.textContent).toLowerCase();
                return text === target || text === target + target || text === target + " " + target;
            });
            const heading = headings.find(h => h.tagName.startsWith('H')) || headings[0];
            if (heading) {
                container = heading.closest("section") ||
                    heading.closest("div.artdeco-card") ||
                    heading.closest(".artdeco-card") ||
                    heading.parentElement?.closest('div') ||
                    heading.parentElement;
            }
        }

        if (!container) return [];

        // ABOUT SECTION: Special handling (text, not list)
        if (target === "about") {
            const aboutSpan = container.querySelector('.inline-show-more-text span[aria-hidden="true"]') ||
                              container.querySelector('.pv-shared-text-with-see-more span[aria-hidden="true"]') ||
                              container.querySelector('.display-flex.full-width span[aria-hidden="true"]');
            if (aboutSpan) {
                const text = deepClean(normalize(aboutSpan.textContent));
                if (text.length > 10) return [text];
            }
            const allSpans = Array.from(container.querySelectorAll('span'));
            const aboutTexts = allSpans
                .map(s => normalize(s.textContent))
                .filter(t => t.length > 50 && !t.toLowerCase().startsWith('about'));
            if (aboutTexts.length > 0) {
                const best = aboutTexts.sort((a, b) => b.length - a.length)[0];
                return [deepClean(best)];
            }
            let content = normalize(container.textContent);
            const titleRegex = new RegExp(`^(\\s*${escapedTitle}\\s*)+`, 'i');
            content = deepClean(content.replace(titleRegex, '').trim());
            return content.length > 10 ? [content] : [];
        }

        // ITEM SPLITTING with multiple strategies
        const figures = Array.from(container.querySelectorAll('figure[aria-label]'));
        const meaningfulFigures = figures.filter(f => (f.getAttribute('aria-label') || '').trim().length > 0);
        const links = Array.from(container.querySelectorAll('a[href*="/company/"], a[href*="/school/"]'));

        // Strategy A: Meaningful <figure> boundaries
        if (meaningfulFigures.length > 0) {
            const items = splitByFigures(doc, container, meaningfulFigures, target);
            if (items.length > 0) return items;
        }

        // Strategy B: <p> tag class patterns
        const pItems = splitByParagraphs(doc, container, target);
        if (pItems.length > 0) return pItems;

        // Strategy C: Company/school links
        if (links.length > 0) {
            const items = splitByLinks(doc, container, links, target);
            if (items.length > 0) return items;
        }

        // LEGACY: UL/LI
        const outerList = container.querySelector('.pvs-list__outer-container > ul') ||
                          container.querySelector('ul.pvs-list') ||
                          container.querySelector('ul');

        if (outerList) {
            const topItems = Array.from(outerList.children).filter(el => el.tagName === 'LI');
            const filteredItems = topItems
                .map(item => deepClean(normalize(item.textContent)))
                .filter(t => t.length > 3 &&
                    !t.match(/^(Show all|Show more|See all|Show credential)/i) &&
                    !t.match(/^Show all \d+/i));
            if (filteredItems.length > 0) return filteredItems;
        }

        // Broader li search - but exclude nested items
        let legacyItems = Array.from(container.querySelectorAll("li.pvs-list__paged-list-item, li.artdeco-list__item"));
        
        // Filter out nested <li> elements (sub-roles within grouped experience)
        legacyItems = legacyItems.filter(li => {
            // Check if this <li> has a parent <li> within the same container
            let parent = li.parentElement;
            while (parent && parent !== container) {
                if (parent.tagName === 'LI') {
                    // This is a nested <li>, skip it
                    return false;
                }
                parent = parent.parentElement;
            }
            return true;
        });
        
        if (legacyItems.length > 0) {
            return legacyItems
                .map(item => deepClean(normalize(item.textContent)))
                .filter(t => t.length > 3 && !t.match(/^(Show all|Show more|See all|Show credential|Experience|Education)/i));
        }

        // TEXT FALLBACK
        let content = normalize(container.textContent);
        const titleRegex = new RegExp(`^(\\s*${escapedTitle}\\s*)+`, 'i');
        content = deepClean(content.replace(titleRegex, '').trim());
        return content.length > 3 ? [content] : [];
    }

    return { findSectionContent, normalize };
})();

// Export for both Chrome extension and Node.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SectionFinder;
} else {
    window.SectionFinder = SectionFinder;
}
