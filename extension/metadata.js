/**
 * metadata.js — Extracts profile metadata: name, headline, location, image,
 * connections, followers, degree, mutuals, and Voyager JSON data.
 */

const MetadataExtractor = (() => {
    const _getNormalize = () => {
        if (typeof SectionFinder !== 'undefined') return SectionFinder.normalize;
        if (typeof require !== 'undefined') return require('./section_finder.js').normalize;
        return (t) => (t || '').toString().replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
    };

    const _getClean = () => {
        if (typeof LinkedInParsers !== 'undefined') return LinkedInParsers.deepClean;
        if (typeof require !== 'undefined') return require('./parsers.js').deepClean;
        return (t) => t;
    };

    // ──── Selector config ────
    const selectors = {
        name: ["h1.text-heading-xlarge", "h1"],
        headline: [
            ".text-body-medium.break-words",
            ".pv-text-details__left-panel .text-body-medium",
            "[data-generated-suggestion-target]",
            "div.text-body-medium:not([aria-hidden])"
        ],
        location: [
            ".text-body-small.inline.t-black--light.break-words",
            ".pv-text-details__left-panel .text-body-small",
            "span.text-body-small"
        ],
        profileImage: [
            "img.pv-top-card-profile-picture__image",
            ".pv-top-card-profile-picture__image--show",
            "button.pv-top-card-profile-picture img",
            "meta[property='og:image']"
        ],
        connectionDegree: [
            "span.dist-value",
            ".distance-badge .dist-value"
        ],
        connections: [
            ".link-without-visited-state .t-bold",
            "span.link-without-visited-state span.t-bold",
            "p.t-black--light span",
            "p[class*='t-black'] span",
            "div[class*='pv-top-card'] p span"
        ],
        followers: [
            "span.pvs-entity__caption-wrapper",
            "li.text-body-small.t-black--light.inline-block .t-bold",
            ".text-body-small.t-black--light .t-bold"
        ]
    };

    // ──── Headline detection helper (used in multiple places) ────
    function _looksLikeHeadline(text) {
        return /\b(at|@)\s+[A-Z]/.test(text) ||
               /\b(Director|Engineer|Developer|Manager|CEO|CTO|CFO|COO|VP|Head|Student|Professor|Founder|Co-Founder|Analyst|Designer|Consultant|Specialist|Officer|Lead|Architect|Scientist|Researcher|Intern|Freelance|Owner|Partner)\b/i.test(text) ||
               /\b(Sr\.|Jr\.|Senior|Junior)\b/i.test(text);
    }

    // ──── Profile Image: get best available (no URL modification) ────
    function getBestProfileImage(doc, domImage) {
        const getShrinkSize = (url) => {
            if (!url) return 0;
            const matches = url.match(/shrink_(\d+)_(\d+)/g);
            if (!matches) return 0;
            const lastMatch = matches[matches.length - 1];
            return parseInt(lastMatch.match(/\d+/)[0]);
        };

        // Validate image URL — filter out default avatars and broken links
        const isValidProfileImage = (src) => {
            if (!src || src.length < 20) return false;
            // SVG data URIs are default avatars (LinkedIn uses SVG for no-photo)
            if (src.startsWith('data:image/svg')) return false;
            // Known invalid patterns
            if (src.includes('/icon/') || src.includes('blank') || src.includes('ghost')) return false;
            // Reject shrink_100_100 — those are mutual connection thumbnails
            if (src.includes('shrink_100_100')) return false;
            // Also reject scale_100_100 and any other 100x100 variant
            if (/_100_100/.test(src)) return false;
            return true;
        };

        // First: Check if profile has default avatar (SVG icon)
        // LinkedIn shows an SVG when user has no profile picture
        const profilePhotoButton = doc.querySelector(
            'button.pv-top-card-profile-picture, ' +
            'button.pv-top-card-profile-picture__image, ' +
            'button[aria-label*="profile"]'
        );
        
        if (profilePhotoButton) {
            // Check for SVG child (default avatar)
            const svgIcon = profilePhotoButton.querySelector('svg[aria-hidden="true"]');
            if (svgIcon) {
                return null; // User has default avatar, no photo
            }
        }

        // Also check for SVG-only profile image areas (obfuscated class names)
        // If the profile photo area only has an SVG and no <img>, it's a default avatar
        const topCardImgs = doc.querySelectorAll('img');
        let hasSvgOnlyAvatar = false;
        for (const img of topCardImgs) {
            const src = img.src || img.getAttribute('src') || '';
            if (src.startsWith('data:image/svg+xml')) {
                // Check if this SVG image is in the profile photo area (near the top, before main content)
                const parent = img.parentElement;
                if (parent && !img.closest('ul') && !img.closest('li') &&
                    !img.closest('section') && !(img.alt && img.alt.toLowerCase().includes('logo'))) {
                    hasSvgOnlyAvatar = true;
                    break;
                }
            }
        }

        const candidates = [];

        // Find main profile container
        const mainProfile = doc.querySelector('main') || 
                           doc.querySelector('.scaffold-layout__main') || 
                           doc.querySelector('[data-view-name="profile-view"]') ||
                           doc.body;
        
        // Look ONLY in profile picture button/container (very specific)
        const profilePicSelectors = [
            'button.pv-top-card-profile-picture img',
            '.pv-top-card-profile-picture__image img',
            '.pv-top-card__photo img',
            ".pv-top-card-profile-picture img[src*='profile-displayphoto']",
            ".artdeco-entity-image img[src*='profile-displayphoto']",
            "button.pv-top-card-profile-picture img[src^='data:image']"
        ];
        
        profilePicSelectors.forEach(selector => {
            try {
                const imgs = mainProfile.querySelectorAll(selector);
                imgs.forEach(img => {
                    const src = img.src || '';
                    if (isValidProfileImage(src) &&
                        !(img.alt && img.alt.toLowerCase().includes('cover'))) {
                        candidates.push(src);
                    }
                });
            } catch (_) { /* */ }
        });
        
        // Fallback for base64 images (SingleFile saves with stripped classes)
        if (candidates.length === 0) {
            const allImages = mainProfile.querySelectorAll('img[src^="data:image/jpeg"]');
            const validImages = [];
            
            for (const img of allImages) {
                const src = img.src || '';
                const isExcluded = 
                    !isValidProfileImage(src) ||
                    (img.alt && img.alt.toLowerCase().includes('cover')) ||
                    (img.alt && img.alt.toLowerCase().includes('logo')) ||
                    img.closest('ul') || 
                    img.closest('li');
                
                if (!isExcluded) {
                    validImages.push(img);
                }
            }
            
            // Only use if 1-3 images (not feed images)
            if (validImages.length > 0 && validImages.length <= 3) {
                candidates.push(validImages[0].src);
            }
        }

        // Additional selectors from config
        for (const sel of selectors.profileImage) {
            try {
                const el = doc.querySelector(sel);
                if (el) {
                    const src = el.src || el.getAttribute('content');
                    if (src && src.includes('profile-displayphoto')) {
                        // Double-check it's not from mutual connections
                        const parentList = el.closest('ul');
                        if (!parentList) {
                            candidates.push(src);
                        }
                    }
                }
            } catch (_) { /* */ }
        }

        if (domImage && domImage.includes('profile-displayphoto') && isValidProfileImage(domImage)) {
            candidates.push(domImage);
        }

        const seen = new Set();
        const unique = candidates.filter(url => {
            if (!isValidProfileImage(url)) return false;
            const base = url.split('?')[0];
            if (seen.has(base)) return false;
            seen.add(base);
            return true;
        });

        if (unique.length === 0) return null;

        unique.sort((a, b) => getShrinkSize(b) - getShrinkSize(a));
        return unique[0];
    }

    // ──── DOM-Based Metadata Extraction ────
    function extractDomMetadata(doc) {
        const normalize = _getNormalize();

        const domData = {
            name: normalize(doc.querySelector("h1")?.textContent || doc.title?.split("|")[0] || ""),
            headline: "",
            location: "",
            profileImage: null,
            connectionDegree: null,
            connections: null,
            followers: null
        };

        function cleanName(name) {
            if (!name) return "";
            return name.replace(/\s*\|\s*LinkedIn$/i, "").replace(/^LinkedIn\s*\|\s*/i, "").trim();
        }

        // Fill via selectors
        for (const [key, paths] of Object.entries(selectors)) {
            if (key === "name") continue;
            if (domData[key]) continue;

            let val = "";
            for (const path of paths) {
                try {
                    const el = doc.querySelector(path);
                    if (!el) continue;

                    if (key === "profileImage") {
                        val = el.src || el.getAttribute("content");
                        if (val && val.startsWith('http')) {
                            domData.profileImage = val;
                            break;
                        }
                        continue;
                    }

                    val = path.startsWith("meta") ? normalize(el.getAttribute("content")) : normalize(el.textContent);

                    if (key === "headline") {
                        if (val.includes('notification') || val.includes('Notification') ||
                            el.getAttribute('aria-hidden') === 'true') {
                            val = "";
                            continue;
                        }
                    }

                    if (val && val.length > 2) break;
                } catch (_) { /* */ }
            }

            if (key !== "profileImage") {
                domData[key] = (key === "name") ? cleanName(val) : val;
            }
        }

        if (domData.name.includes("Add name") || domData.name.length < 2) domData.name = "";

        // ── Location fallback: Direct text search near name element ──
        // Works with obfuscated CSS classes (SingleFile captures, etc.)
        if (!domData.location || domData.location.length < 3) {
            const nameEl = doc.querySelector('h1');
            if (nameEl) {
                let container = nameEl;
                for (let i = 0; i < 5 && container.parentElement && container.tagName !== 'BODY'; i++) {
                    container = container.parentElement;
                }
                
                const locCandidates = Array.from(container.querySelectorAll('p, span')).filter(el => {
                    const text = normalize(el.textContent).trim();
                    if (text.length < 3 || text.length > 80) return false;
                    if (text === domData.name || text.includes(domData.name)) return false;
                    if (text === domData.headline) return false;
                    // Must not be a headline
                    if (_looksLikeHeadline(text)) return false;
                    // Must not contain action/UI words
                    if (/\b(Contact|Connect|Follow|Message|connections|followers|Notification)\b/i.test(text)) return false;
                    // Must not look like a sentence (exclamation, question marks, verbs at start)
                    if (/[!?]/.test(text) || /^\s*(Following|Liked|Posted|Shared|Commented)/i.test(text)) return false;
                    // Location indicators: comma-separated SHORT segments (place names)
                    const segments = text.split(',').map(s => s.trim());
                    const hasCommaPattern = segments.length >= 2 && segments.length <= 4 &&
                        segments.every(s => s.length > 1 && s.length < 35 && /^[A-Z\u00C0-\u024F]/.test(s));
                    const hasLocationKeyword = /\b(Area|City|Region|Metropolitan|County|Province|District|Bay|State)\b/i.test(text);
                    return hasCommaPattern || hasLocationKeyword;
                });
                
                if (locCandidates.length > 0) {
                    // Pick the shortest match (most specific location text)
                    locCandidates.sort((a, b) => a.textContent.trim().length - b.textContent.trim().length);
                    let best = normalize(locCandidates[0].textContent).trim()
                        .replace(/\s*·\s*Contact info.*$/i, '')  // Remove "· Contact info" suffix
                        .trim();
                    if (best.length > 3) domData.location = best;
                }
            }
        }

        // Proximity-based fallback for headline/location
        if (!domData.headline || domData.headline.length < 3 || !domData.location || domData.location.length < 3) {
            let nameEl = Array.from(doc.querySelectorAll("h1")).find(h => normalize(h.textContent).includes(domData.name));
            if (!nameEl) {
                const walker = doc.createTreeWalker(doc.body, 4);
                while (walker.nextNode()) {
                    const node = walker.currentNode;
                    const text = normalize(node.textContent);
                    if (text.length > 3 && text.length < 100 && text.includes(domData.name)) {
                        const parent = node.parentElement;
                        if (parent && !["SCRIPT", "STYLE", "NOSCRIPT", "TITLE"].includes(parent.tagName)) {
                            nameEl = parent;
                            break;
                        }
                    }
                }
            }

            if (nameEl) {
                let container = nameEl.parentElement;
                let levels = 0;
                while (container && levels < 6 && container.parentElement && container.tagName !== "BODY") {
                    container = container.parentElement;
                    levels++;
                }

                if (container) {
                    const allEls = Array.from(container.querySelectorAll("*"));
                    const candidates = allEls.filter(el => {
                        const txt = normalize(el.textContent);
                        return txt.length > 2 && txt !== domData.name && !txt.includes(domData.name);
                    });

                    for (const el of candidates) {
                        const text = normalize(el.textContent);
                        const segments = text.split(",").map(s => s.trim());
                        const isLocationLike = text.length < 80 && !_looksLikeHeadline(text) &&
                            !/[!?]/.test(text) && !/^\s*(Following|Liked|Posted|Shared)/i.test(text) &&
                            !/\b(Contact|Connect|Follow|Message|connections|followers)\b/i.test(text) &&
                            (
                                (segments.length >= 2 && segments.length <= 4 && segments.every(s => s.length > 1 && s.length < 35 && /^[A-Z\u00C0-\u024F]/.test(s))) ||
                                /\b(Area|City|Region|Metropolitan|Bay|France|India|Germany|UK|US|Canada|Australia|Japan|China|Brazil)\b/i.test(text)
                            );
                        if (!domData.location && isLocationLike) {
                            domData.location = text.replace(/\s*·\s*Contact info.*$/i, '').trim();
                        } else if (!domData.headline && text.length > 5 && text.length < 300) {
                            if (!text.includes("Contact") && !text.includes("connections") && !text.includes("followers") && !text.includes("Cmd+")) {
                                domData.headline = text;
                            }
                        }
                    }
                }
            }
        }

        return domData;
    }

    // ──── Mutual Connections ────
    function extractMutuals(doc) {
        const normalize = _getNormalize();
        let mutualConnections = 0;
        let mutualNames = [];

        // Find mutual connection text — support both numbered and unnumbered patterns
        // Patterns:
        //   "Name is a mutual connection"           → 1 mutual
        //   "Name1 and Name2 are mutual connections" → 2 mutuals (no digit)
        //   "Name1, Name2 and 8 other mutual connections" → names + 8 mutuals
        const mutualTextEl = Array.from(doc.querySelectorAll("button, a, div")).find(el => {
            const text = el.textContent;
            return text && text.includes("mutual connection") && text.length < 150 && !text.toLowerCase().includes("page");
        });

        if (mutualTextEl) {
            const text = normalize(mutualTextEl.textContent);


            // Check for single mutual: "Name is a mutual connection"
            const singleMatch = text.match(/^(.+?)\s+is\s+a\s+mutual\s+connection/i);
            if (singleMatch) {
                const name = singleMatch[1].trim();
                if (name.length > 1 && name.length < 60) {
                    mutualNames.push(name);
                    mutualConnections = 1;
                }
            } else {
                // Multi-mutual patterns
                const countMatch = text.match(/and\s+(\d+)\s+other/i) || text.match(/(\d+)\s+other\s+mutual/i) || text.match(/plus\s+(\d+)\s+autres/i);
                const extraCount = countMatch ? parseInt(countMatch[1]) : 0;

                const cleanText = text.replace(/mutual connections?/i, "").replace(/\s+are\s*$/i, "").replace("and", ",").replace("other", "");
                const parts = cleanText.split(",").map(p => p.trim()).filter(p => p.length > 0);

                parts.forEach(p => {
                    const clean = p.replace(/\d+/, "").trim();
                    if (clean.length > 1 && isNaN(clean)) mutualNames.push(clean);
                });

                mutualConnections = mutualNames.length + extraCount;
            }
        }

        return { mutualConnections, mutualNames };
    }

    // ──── Voyager JSON Extraction ────
    function extractVoyagerData(doc, domName) {
        try {
            const codeBlocks = Array.from(doc.querySelectorAll('code'));
            let allObjects = [];

            for (const block of codeBlocks) {
                try {
                    const content = block.textContent.trim();
                    if (!content.startsWith('{')) continue;
                    let decoded = content.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
                    const json = JSON.parse(decoded);
                    if (json.data) allObjects.push(json.data);
                    if (json.included) allObjects.push(...json.included);
                } catch (_) { /* */ }
            }

            const findObj = (type) => allObjects.filter(o => o.$type?.includes(type));

            const meObj = findObj("common.Me")[0];
            const meId = meObj?.miniProfile?.split(':').pop();

            let profiles = findObj("identity.profile.Profile")
                .concat(findObj("identity.profile.ProfileView"))
                .concat(findObj("identity.shared.MiniProfile"));



            if (meId) {
                profiles = profiles.filter(p => {
                    const id = p.publicIdentifier || p.entityUrn?.split(':').pop();
                    return id !== meId && id !== "me";
                });
            }

            // SIMPLIFIED: Take the first valid profile (no strict name matching)
            // Strict matching was causing false negatives when names had emojis, titles, or middle names

            let profile = profiles.find(p => p.$type?.includes("profile.Profile") && (p.firstName || p.lastName)) ||
                profiles.find(p => p.$type?.includes("ProfileView") && (p.firstName || p.lastName)) ||
                profiles[0];

            if (!profile) return null;

            const relationship = findObj("identity.profile.Relationship")[0];
            const connectionDegree = relationship?.degree === "FIRST" ? "1st" : relationship?.degree === "SECOND" ? "2nd" : relationship?.degree === "THIRD" ? "3rd" : null;

            const connections = profile?.connectionsCount || profile?.numConnections || findObj("entity.MemberConnections")[0]?.memberCount;
            const followers = profile?.followersCount || profile?.numFollowers || findObj("profile.Follower")[0]?.followerCount;

            const mapping = {
                Experience: "Position", Education: "Education", Skills: "Skill",
                Projects: "Project", Volunteering: "VolunteerExperience",
                Publications: "Publication", "Honors & awards": "Honor"
            };

            const voyagerSections = {};
            Object.entries(mapping).forEach(([key, type]) => {
                voyagerSections[key] = findObj(type).map(o => {
                    if (type === "Skill") return o.name;
                    if (type === "Position") {
                        const date = o.timePeriod?.startDate ? ` (${o.timePeriod.startDate.year})` : "";
                        return `${o.title || o.name || ""} at ${o.companyName || ""}${date} - ${o.description || ""}`.trim();
                    }
                    if (type === "Education") {
                        return `${o.schoolName || ""} - ${o.degreeName || ""} ${o.fieldOfStudy ? `(${o.fieldOfStudy})` : ""}`.trim();
                    }
                    return o.title || o.name || o.description || "";
                }).filter(Boolean);
            });

            let headline = profile?.headline || profile?.occupation || profile?.summary;
            if (!headline || headline.length < 5) {
                const latestPos = findObj("Position")[0];
                if (latestPos) headline = `${latestPos.title} at ${latestPos.companyName}`;
            }

            return {
                metadata: {
                    name: (profile.firstName || profile.lastName) ? `${profile.firstName || ""} ${profile.lastName || ""}`.trim() : null,
                    headline,
                    location: profile?.locationName || profile?.location || findObj("ProfileGeoLocation")[0]?.name,
                    connections, followers,
                    publicId: profile?.publicIdentifier,
                    connectionDegree
                },
                sections: voyagerSections
            };
        } catch (_) {
            return null;
        }
    }

    // ──── Robust Fallbacks ────
    function applyFallbacks(doc, final) {
        const normalize = _getNormalize();

        // Profile Image - validate URL
        if (!final.profileImage) {
            // Search for profile-displayphoto images that are NOT mutual connection avatars
            const allProfileImgs = doc.querySelectorAll("img[src*='profile-displayphoto']");
            for (const img of allProfileImgs) {
                const src = img.src || '';
                if (!src.startsWith('http')) continue;
                if (src.includes('blank.gif') || src.includes('ghost')) continue;
                // Reject any 100x100 variant (shrink, scale, etc.) — mutual thumbnails
                if (/_100_100/.test(src)) continue;
                // Reject images inside lists (mutual connections area)
                if (img.closest('ul') || img.closest('li')) continue;
                final.profileImage = src;
                break;
            }
        }

        // Connections & Followers - handles various formats and orderings
        // ───────────────────────────────────────────────────────────────────
        // LinkedIn displays connection counts in 3 ways:
        // 1. Clickable count (most common): Link element with number
        // 2. Non-clickable count: Plain <p> or <span> with number, not clickable
        // 3. Hidden count (rare): User chose to hide their count - no number shown
        // Handles multiple orderings: "followers • connections" or "connections • followers"
        // ───────────────────────────────────────────────────────────────────
        
        // Helper: Check if a number is a connection degree (1st, 2nd, 3rd)
        const isConnectionDegree = (num) => {
            return num && /^[123]$/.test(num.replace(/[^\d]/g, ''));
        };
        
        // Strategy 1: Look for combined patterns with both "followers" and "connections"
        // Handles: "9,255 followers • 500+ connections" or reverse order
        if (!final.connections || !final.followers) {
            const allElements = Array.from(doc.querySelectorAll('span, a, li, p, div'));
            
            // Find elements containing both keywords
            const combinedElements = allElements.filter(el => {
                const text = el.textContent;
                return text && text.includes('connection') && text.includes('follower') && 
                       text.length < 150 && !text.includes('mutual');
            });
            
            for (const el of combinedElements) {
                const text = el.textContent;
                
                // Pattern: (number1) followers [separator] (number2) connections
                // OR: (number1) connections [separator] (number2) followers
                // Separator can be: bullet (•), dot (·), comma, space, etc.
                const combinedPattern = /([\d,+]+)\s*(?:followers|connections)[\s•·,–-]+([\d,+]+)\s*(?:followers|connections)/i;
                const match = text.match(combinedPattern);
                
                if (match) {
                    // Extract both numbers
                    const num1 = match[1];
                    const num2 = match[2];
                    
                    // Find which keyword comes first in the original text
                    const followerIndex = text.toLowerCase().indexOf('follower');
                    const connectionIndex = text.toLowerCase().indexOf('connection');
                    
                    // Assign numbers based on keyword position
                    if (followerIndex < connectionIndex) {
                        // "followers" comes first → num1 is followers, num2 is connections
                        if (!final.followers && !isConnectionDegree(num1)) {
                            final.followers = num1;
                        }
                        if (!final.connections && !isConnectionDegree(num2)) {
                            final.connections = num2;
                        }
                    } else {
                        // "connections" comes first → num1 is connections, num2 is followers
                        if (!final.connections && !isConnectionDegree(num1)) {
                            final.connections = num1;
                        }
                        if (!final.followers && !isConnectionDegree(num2)) {
                            final.followers = num2;
                        }
                    }
                    
                    if (final.connections && final.followers) break;
                }
            }
        }
        
        // Strategy 2: Look for connections separately (if not found in combined pattern)
        if (!final.connections) {
            const allElements = Array.from(doc.querySelectorAll('span, a, li, p, div'));
            
            // Filter to connection-related elements (exclude mutual connections)
            const candidates = allElements.filter(el => {
                const text = el.textContent;
                return text && text.includes('connection') && text.length < 150 && !text.includes('mutual');
            });
            
            let foundHiddenPattern = false;
            
            // Try to extract connection count
            for (const el of candidates) {
                const text = el.textContent;
                
                // Skip "X other connections follow" patterns (from Education/Experience sections)
                if (text.match(/\d+\s+(other|more)\s+connections?\s+(follow|also)/i)) {
                    continue;
                }
                
                // Case 1: Clickable or non-clickable with visible number
                // Matches: "500+ connections", "1,234 connections", etc.
                // Must be direct connection count, not "X other connections"
                const match = text.match(/([\d,+]+)\s+connections?/i);
                if (match && !isConnectionDegree(match[1]) && !text.match(/other|more|follow/i)) {
                    final.connections = match[1];
                    break;
                }
                
                // Case 2: Non-clickable with number but different format
                // Check if parent or children contain the number
                if (text.toLowerCase().includes('connection') && !text.match(/see|view|show|other|follow/i)) {
                    // Look at immediate element's text first
                    const immediateMatch = text.match(/([\d,+]+)/);
                    if (immediateMatch && !isConnectionDegree(immediateMatch[1]) && 
                        !text.match(/[123](st|nd|rd)/)) {
                        // Verify this looks like a connection count (not degree)
                        const num = immediateMatch[1].replace(/[^\d]/g, '');
                        if (num.length >= 2 || immediateMatch[1].includes('+')) {
                            final.connections = immediateMatch[1];
                            break;
                        }
                    }
                    
                    // Look at parent if needed
                    const parent = el.parentElement;
                    if (parent) {
                        const parentText = parent.textContent;
                        // More specific pattern to avoid connection degree
                        const parentMatch = parentText.match(/([\d,+]{2,})\s+connection/i);
                        if (parentMatch && !isConnectionDegree(parentMatch[1])) {
                            final.connections = parentMatch[1];
                            break;
                        }
                    }
                }
                
                // Case 3 Detection: Look for explicit hidden patterns
                // "See connections", "View connections" (without numbers)
                if (!foundHiddenPattern && 
                    text.match(/^(see|view|show)\s+(all\s+)?connections?$/i)) {
                    foundHiddenPattern = true;
                }
            }
            
            // Case 3: Mark as hidden only if we found explicit hidden pattern
            // and no actual connection count was found
            if (!final.connections && foundHiddenPattern) {
                final.connections = "Hidden";
            }
            
            // Fallback: If we have a valid profile but no connection info at all,
            // assume connections are hidden (user privacy setting)
            if (!final.connections && (final.name || final.headline)) {
                // Check if there's at least SOME profile content loaded
                // If profile exists but no connection data, likely hidden
                final.connections = "Hidden";
            }
        }

        // Strategy 3: Look for followers separately (if not found in combined pattern)
        if (!final.followers) {
            const allSpans = Array.from(doc.querySelectorAll('span, p, li, div'));
            
            // Look for "followers" keyword first
            const followerEl = allSpans.find(s => {
                const text = s.textContent;
                return text.includes('followers') && /\d/.test(text) && text.length < 150;
            });
            
            if (followerEl) {
                const text = followerEl.textContent;
                // Match: "number followers" with flexible spacing/separators
                const match = text.match(/([\d,]+)\s*followers/i);
                if (match) {
                    const num = match[1];
                    // Verify it's not a degree (1st, 2nd, 3rd)
                    if (!isConnectionDegree(num)) {
                        final.followers = num;
                    }
                }
            }
        }

        // Connection degree - ALWAYS check DOM (overrides potentially stale Voyager data)
        // LinkedIn shows degree as "1st", "2nd", "3rd", or "3rd+" near the name, prefixed with · or •
        {
            let foundDegree = null;
            // Regex that handles any bullet/dot prefix: · (U+00B7), • (U+2022), regular dot, whitespace
            // Captures degree WITH optional plus sign, and allows trailing whitespace
            const degreeRe = /^[\s·•.\u00B7\u2022\u2024\u2027]*([123](?:st|nd|rd)\+?)\s*$/;

            // Strategy 1: Look for main profile by finding pronouns + degree together
            // Get the main profile container
            let mainProfileContainer = null;
            const h1 = doc.querySelector('h1');
            if (h1) {
                mainProfileContainer = h1.parentElement;
            } else {
                mainProfileContainer = doc.querySelector('main') ||
                                      doc.querySelector('[role="main"]') ||
                                      doc.querySelector('[class*="pv-top-card"]');
            }
            
            if (mainProfileContainer) {
                // Method 1: Look for pronouns (He/Him, She/Her, They/Them) which indicate profile header
                // These typically only appear in main profile, not in recommendation cards
                const pronounPattern = /(?:He|She|They)\/(?:Him|Her|Them)/;
                const allElements = Array.from(mainProfileContainer.querySelectorAll('*'));
                
                for (const el of allElements) {
                    if (pronounPattern.test(el.textContent)) {
                        // Found the profile header (contains pronouns)
                        // Search only NEAR this element, not the entire page
                        
                        // First try the element itself and its immediate parent
                        const searchCandidates = [el, el.parentElement, el.parentElement?.parentElement].filter(Boolean);
                        
                        for (const searchArea of searchCandidates) {
                            const candidates = Array.from(searchArea.querySelectorAll('span, p'));
                            
                            // Look for the FIRST matching degree near the pronouns
                            // (skip "1st" which often appears early as stray element from recommendation cards)
                            const matches = [];
                            for (let i = 0; i < candidates.length; i++) {
                                const candidate = candidates[i];
                                const t = candidate.textContent.trim();
                                if (t.length >= 3 && t.length <= 6) {
                                    const m = t.match(degreeRe);
                                    if (m) {
                                        matches.push({ idx: i, degree: m[1], el: candidate });
                                    }
                                }
                            }
                            
                            if (matches.length > 0) {
                                // Prefer "2nd" or "3rd" if available, otherwise take first
                                const preferred = matches.find(m => m.degree === '2nd' || m.degree === '3rd' || m.degree === '3rd+');
                                if (preferred) {
                                    foundDegree = preferred.degree;
                                } else {
                                    foundDegree = matches[0].degree;
                                }
                                if (foundDegree) break;
                            }
                        }
                        if (foundDegree) break;
                    }
                }
                
                // Fallback: if pronouns not found, look in first few elements (saved HTML case)
                if (!foundDegree) {
                    const candidates = Array.from(mainProfileContainer.querySelectorAll('span, p'));
                    const topElements = candidates.slice(0, 10);
                    
                    for (const el of topElements) {
                        const t = el.textContent.trim();
                        if (t.length >= 3 && t.length <= 6) {
                            const m = t.match(degreeRe);
                            if (m) {
                                foundDegree = m[1];
                                break;
                            }
                        }
                    }
                }
            }

            // Strategy 2: Search ALL short span/p elements in the document
            if (!foundDegree) {
                const allEls = Array.from(doc.querySelectorAll('span, p'));
                for (const el of allEls) {
                    const t = el.textContent.trim();
                    if (t.length <= 10) {
                        const m = t.match(degreeRe);
                        if (m) { foundDegree = m[1]; break; }
                    }
                }
            }

            // Strategy 3: Search text nodes containing "1st"/"2nd"/"3rd" anywhere
            if (!foundDegree) {
                const walker = doc.createTreeWalker(doc.body || doc.documentElement, 4 /* NodeFilter.SHOW_TEXT */);
                while (walker.nextNode()) {
                    const t = walker.currentNode.textContent.trim();
                    if (t.length > 0 && t.length <= 10) {
                        const m = t.match(degreeRe);
                        if (m) { foundDegree = m[1]; break; }
                    }
                }
            }

            if (foundDegree) {
                final.connectionDegree = foundDegree;
            }
        }

        // Nuclear fallback: location/headline
        if (!final.location || !final.headline) {
            const candidates = Array.from(doc.querySelectorAll("p, span, div.text-body-small, div.text-body-medium"));
            for (const el of candidates) {
                const text = normalize(el.textContent);
                if (!final.location && !_looksLikeHeadline(text) && text.length < 80 &&
                    !/[!?]/.test(text) && !/^\s*(Following|Liked|Posted|Shared)/i.test(text)) {
                    const segs = text.split(",").map(s => s.trim());
                    const isLocPattern = segs.length >= 2 && segs.length <= 4 &&
                        segs.every(s => s.length > 1 && s.length < 35 && /^[A-Z\u00C0-\u024F]/.test(s));
                    if (isLocPattern && !/\b(Contact|Connect|Follow|Message|connections|followers)\b/i.test(text)) {
                        final.location = text.replace(/\s*·\s*Contact info.*$/i, '').trim();
                    }
                }
                if (!final.headline && text.length > 10 && text.length < 150) {
                    if (text.includes(" at ") || text.includes(" | ") || text.includes("Engineer") || text.includes("Developer") || text.includes("Manager")) {
                        if (el.tagName !== 'A' && !text.includes("Show all") && !text.includes("Notification")) {
                            final.headline = text;
                        }
                    }
                }
            }
        }

        return final;
    }

    return {
        extractDomMetadata,
        extractMutuals,
        extractVoyagerData,
        getBestProfileImage,
        applyFallbacks,
        selectors
    };
})();

// Export for both Chrome extension and Node.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MetadataExtractor;
} else {
    window.MetadataExtractor = MetadataExtractor;
}
