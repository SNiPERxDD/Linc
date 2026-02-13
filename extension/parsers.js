/**
 * parsers.js — Structured parsers for each LinkedIn profile section.
 * Converts raw `·`-delimited text into structured objects.
 */

const LinkedInParsers = (() => {
    // ──── Shared utilities ────
    function deepClean(text) {
        if (!text) return "";
        return text
            .replace(/Show all \d+ [a-z]+/gi, "")
            .replace(/Show all|Show more|See all|See more/gi, "")
            .replace(/\.{3,}\s*more/gi, "")
            .replace(/…\s*more/gi, "")
            .replace(/\.{3,}$/gi, "")
            .replace(/…$/g, "")
            .replace(/\d+\s+endorsements?/gi, "")
            .replace(/Endorse/gi, "")
            .replace(/Show credential/gi, "")
            .replace(/\bReport this profile\b/gi, "")
            .replace(/\bMessage\b/g, "")
            .replace(/\bMore\b$/g, "")
            .replace(/\bConnect\b$/g, "")
            .replace(/\bFollow\b$/g, "")
            .replace(/\s{2,}/g, " ")
            .trim();
    }

    function splitParts(rawText) {
        const cleaned = deepClean(rawText);
        const parts = cleaned.split(/\s*·\s*/).map(p => p.trim()).filter(p => p.length > 0);
        return { cleaned, parts };
    }

    // ──── Regex patterns used across parsers ────
    const dateRangeRegex = /^((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+)?\d{4}\s*[-–]\s*(Present|(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+)?\d{4})/i;
    const singleDateRegex = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}$/i;
    const durationRegex = /^(\d+\s+yrs?\s*\d*\s*mos?|\d+\s+yrs?|\d+\s+mos?)$/i;
    const locationRegex = /^\p{Lu}[\p{L}\s\-']+,\s+\p{Lu}/u;
    const locationKeywords = /\b(Region|Area|Bay|Metropolitan|City|County|District|Province|State)\b/i;
    const typeRegex = /^(Full-time|Part-time|Contract|Internship|Self-employed|Freelance|Apprenticeship|Seasonal|Permanent Part-time)$/i;
    const workplaceRegex = /^(On-site|Remote|Hybrid)$/i;

    const skillsPattern = (p) => /and\s+\+\d+\s+skills?$/i.test(p);
    const isLocation = (p) => p.length < 80 && (locationRegex.test(p) || locationKeywords.test(p));
    const isDate = (p) => dateRangeRegex.test(p) || singleDateRegex.test(p);

    function parseDate(p) {
        if (dateRangeRegex.test(p)) {
            const dp = p.split(/[-–]/);
            return { startDate: dp[0].trim(), endDate: dp[1]?.trim() || null };
        }
        return { startDate: p, endDate: null };
    }

    // ──── Experience Parser ────
    function parseExperience(rawText) {
        const { cleaned, parts } = splitParts(rawText);

        const result = {
            role: null, company: null, employmentType: null,
            startDate: null, endDate: null, duration: null,
            location: null, workplaceType: null, skills: null,
            description: null, subRoles: null, raw: cleaned
        };

        const dateRangeCount = parts.filter(p => dateRangeRegex.test(p)).length;

        if (dateRangeCount > 1) {
            // GROUPED EXPERIENCE — identify roles by date ranges
            result.company = parts[0];
            
            // Find all date range indices
            const dateIndices = [];
            for (let i = 1; i < parts.length; i++) {
                if (isDate(parts[i])) dateIndices.push(i);
            }
            
            // Pre-calculate backward claim boundaries for each role.
            // Each role "claims" its name + employment type parts before the date.
            // This prevents the forward scan of one role from consuming parts
            // that belong to the next role.
            const roleClaimStarts = [];
            for (let roleIdx = 0; roleIdx < dateIndices.length; roleIdx++) {
                const dateIdx = dateIndices[roleIdx];
                let claimStart = dateIdx;
                
                for (let i = dateIdx - 1; i >= 1; i--) {
                    const part = parts[i];
                    if (typeRegex.test(part) || workplaceRegex.test(part)) {
                        claimStart = i;
                    } else if (durationRegex.test(part)) {
                        // Duration may belong to parent or previous role — don't claim
                    } else {
                        // This is the role name
                        claimStart = i;
                        break;
                    }
                }
                
                roleClaimStarts.push(claimStart);
            }
            
            // Extract company-level attributes (from index 1 to first role's claim start)
            const companyEnd = roleClaimStarts.length > 0 ? roleClaimStarts[0] : dateIndices[0];
            for (let i = 1; i < companyEnd; i++) {
                const part = parts[i];
                if (durationRegex.test(part) && !result.duration) {
                    result.duration = part;
                } else if (typeRegex.test(part) && !result.employmentType) {
                    result.employmentType = part;
                } else if (workplaceRegex.test(part)) {
                    result.workplaceType = part;
                } else if (isLocation(part)) {
                    result.location = result.location || part;
                } else if (!result.location && part.length < 60) {
                    // At company level, remaining short text is typically location
                    result.location = part;
                }
            }
            
            // Extract roles using proper boundaries
            const subRoles = [];
            for (let roleIdx = 0; roleIdx < dateIndices.length; roleIdx++) {
                const dateIdx = dateIndices[roleIdx];
                // Forward scan stops at the next role's claim start
                const nextBoundary = (roleIdx + 1 < dateIndices.length)
                    ? roleClaimStarts[roleIdx + 1]
                    : parts.length;
                
                const role = {
                    role: null, employmentType: null, startDate: null, endDate: null,
                    duration: null, location: null, workplaceType: null,
                    skills: null, description: null
                };
                
                // Set date
                const d = parseDate(parts[dateIdx]);
                role.startDate = d.startDate;
                role.endDate = d.endDate;
                
                // Look backwards for role name and employment type
                for (let i = dateIdx - 1; i >= 1; i--) {
                    const part = parts[i];
                    if (typeRegex.test(part)) {
                        role.employmentType = part;
                    } else if (durationRegex.test(part)) {
                        // Skip — belongs to parent or previous role
                    } else if (workplaceRegex.test(part)) {
                        role.workplaceType = part;
                    } else if (!role.role) {
                        role.role = part;
                        break;
                    }
                }
                
                // Look forwards for attributes (bounded by next role's claim zone)
                for (let i = dateIdx + 1; i < nextBoundary; i++) {
                    const part = parts[i];
                    
                    if (durationRegex.test(part) && !role.duration) {
                        role.duration = part;
                    } else if (typeRegex.test(part) && !role.employmentType) {
                        role.employmentType = part;
                    } else if (workplaceRegex.test(part)) {
                        role.workplaceType = part;
                    } else if (skillsPattern(part)) {
                        role.skills = part;
                    } else if (isLocation(part)) {
                        role.location = role.location || part;
                    } else if (part.length > 80) {
                        role.description = (role.description ? role.description + ' ' : '') + part;
                    } else {
                        // In sub-roles, remaining unmatched short text is a skill/area tag
                        // (e.g., "Business Intelligence (BI)", "Communication")
                        // NOT a location — real locations match isLocation()
                        if (!role.skills) {
                            role.skills = part;
                        } else {
                            role.skills = role.skills + ', ' + part;
                        }
                    }
                }
                
                subRoles.push(role);
            }
            
            result.subRoles = subRoles;
            result.role = subRoles.length > 0 ? subRoles[0].role : null;
            if (subRoles.length > 0 && !result.startDate) {
                result.startDate = subRoles[0].startDate;
                result.endDate = subRoles[0].endDate;
            }
        } else {
            // SINGLE EXPERIENCE
            const classified = {
                roles: [], companies: [], dates: [], durations: [],
                locations: [], types: [], workplaces: [], skills: [], descriptions: []
            };

            for (const part of parts) {
                if (isDate(part)) classified.dates.push(part);
                else if (durationRegex.test(part)) classified.durations.push(part);
                else if (typeRegex.test(part)) classified.types.push(part);
                else if (workplaceRegex.test(part)) classified.workplaces.push(part);
                else if (skillsPattern(part)) classified.skills.push(part);
                else if (isLocation(part)) classified.locations.push(part);
                else if (part.length > 80) classified.descriptions.push(part);
                else if (classified.roles.length === 0) classified.roles.push(part);
                else if (classified.companies.length === 0) classified.companies.push(part);
                else classified.descriptions.push(part);
            }

            result.role = classified.roles[0] || null;
            result.company = classified.companies[0] || null;
            result.employmentType = classified.types[0] || null;
            result.workplaceType = classified.workplaces[0] || null;
            result.location = classified.locations[0] || null;
            result.skills = classified.skills[0] || null;
            if (classified.dates.length > 0) {
                const d = parseDate(classified.dates[0]);
                result.startDate = d.startDate;
                result.endDate = d.endDate;
            }
            result.duration = classified.durations[0] || null;
            result.description = classified.descriptions.filter(Boolean).join('; ') || null;
        }

        return result;
    }

    // ──── Education Parser ────
    function parseEducation(rawText) {
        const { cleaned, parts } = splitParts(rawText);

        const result = { school: null, degree: null, field: null, startDate: null, endDate: null, raw: cleaned };

        const dateRegex = /^(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)?\s*\d{4}\s*[–-]\s*(?:Present|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)?\s*\d{4})/i;
        const degreeRegex = /Doctor of Philosophy|PhD|Master of|M\.?S\.?|Bachelor of|B\.?S\.?|B\.?A\.?|MBA|Engineer/i;

        for (const part of parts) {
            if (dateRegex.test(part)) {
                const dateParts = part.split(/[-–]/);
                result.startDate = dateParts[0].trim();
                result.endDate = dateParts[1]?.trim() || null;
            } else if (degreeRegex.test(part)) {
                const commaIdx = part.indexOf(',');
                if (commaIdx > 0) {
                    result.degree = part.substring(0, commaIdx).trim();
                    result.field = part.substring(commaIdx + 1).trim();
                } else {
                    result.degree = part;
                }
            } else if (!result.school) {
                result.school = part;
            } else if (!result.field) {
                result.field = part;
            }
        }

        return result;
    }

    // ──── Skills Parser ────
    function parseSkill(rawText) {
        if (typeof rawText !== 'string') return rawText;
        const { parts } = splitParts(rawText);
        if (parts.length >= 2) {
            return { skill: deepClean(parts[0]), context: deepClean(parts.slice(1).join(' · ')) };
        }
        return { skill: parts[0] || deepClean(rawText), context: null };
    }

    // ──── Languages Parser ────
    function parseLanguage(rawText) {
        if (typeof rawText !== 'string') return rawText;
        const { parts } = splitParts(rawText);
        if (parts.length >= 2) {
            return { language: parts[0], proficiency: parts.slice(1).join(' ') };
        }
        const profLevels = [
            'Native or bilingual proficiency', 'Full professional proficiency',
            'Professional working proficiency', 'Limited working proficiency',
            'Elementary proficiency'
        ];
        for (const level of profLevels) {
            const idx = rawText.indexOf(level);
            if (idx > 0) {
                return { language: rawText.substring(0, idx).trim(), proficiency: level };
            }
        }
        return { language: deepClean(rawText), proficiency: null };
    }

    // ──── Licenses & Certifications Parser ────
    function parseLicense(rawText) {
        if (typeof rawText !== 'string') return rawText;
        const { cleaned, parts } = splitParts(rawText);
        const result = { name: null, issuer: null, issueDate: null, raw: cleaned };

        for (const part of parts) {
            const issuedMatch = part.match(/^Issued\s+((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4})/i);
            if (issuedMatch) {
                result.issueDate = issuedMatch[1];
            } else if (!result.name) {
                result.name = part;
            } else if (!result.issuer) {
                result.issuer = part;
            }
        }
        return result;
    }

    // ──── Projects Parser ────
    function parseProject(rawText) {
        if (typeof rawText !== 'string') return rawText;
        const { cleaned, parts } = splitParts(rawText);
        const result = { name: null, date: null, association: null, skills: null, raw: cleaned };

        const projDateRegex = /^((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}|\d{4})\s*[–-]\s*(Present|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}|\d{4})$/i;
        const assocRegex = /^Associated with\s+/i;

        for (const part of parts) {
            if (projDateRegex.test(part)) {
                result.date = part;
            } else if (assocRegex.test(part)) {
                result.association = part.replace(assocRegex, '').trim();
            } else if (!result.name) {
                result.name = part;
            } else if (!result.skills) {
                result.skills = part;
            }
        }
        return result;
    }

    // ──── Honors & Awards Parser ────
    function parseHonor(rawText) {
        if (typeof rawText !== 'string') return rawText;
        const { cleaned, parts } = splitParts(rawText);
        const result = { title: null, issuer: null, date: null, association: null, raw: cleaned };

        const honorDateRegex = /^(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}$/i;
        const issuedByRegex = /^Issued by\s+(.+)/i;
        const assocRegex = /^Associated with\s+(.+)/i;

        for (const part of parts) {
            const issuedMatch = part.match(issuedByRegex);
            const assocMatch = part.match(assocRegex);
            if (honorDateRegex.test(part)) {
                result.date = part;
            } else if (issuedMatch) {
                result.issuer = issuedMatch[1];
            } else if (assocMatch) {
                result.association = assocMatch[1];
            } else if (!result.title) {
                result.title = part;
            } else if (!result.issuer) {
                result.issuer = part;
            }
        }
        return result;
    }

    // ──── Publications Parser ────
    function parsePublication(rawText) {
        if (typeof rawText !== 'string') return rawText;
        const { cleaned, parts } = splitParts(rawText);
        const result = { title: null, publication: null, date: null, description: null, raw: cleaned };

        const pubDateRegex = /^((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},?\s+\d{4}|\d{4})$/i;

        for (const part of parts) {
            if (pubDateRegex.test(part)) {
                result.date = part;
            } else if (!result.title) {
                result.title = part;
            } else if (!result.publication) {
                result.publication = part;
            } else if (!result.description) {
                result.description = part;
            } else {
                result.description = (result.description || '') + ' ' + part;
            }
        }
        return result;
    }

    // ──── Section-aware dispatcher ────
    function parseSection(sectionKey, items) {
        if (!Array.isArray(items)) return items;

        const parserMap = {
            'Experience': parseExperience,
            'Education': parseEducation,
            'Volunteering': parseExperience, // Reuses experience parser
            'Skills': parseSkill,
            'Languages': parseLanguage,
            'Licenses & certifications': parseLicense,
            'Projects': parseProject,
            'Honors & awards': parseHonor,
            'Publications': parsePublication
        };

        const parser = parserMap[sectionKey];
        if (!parser) return items; // About and unknown sections: return raw

        return items
            .map(item => typeof item === 'string' ? parser(item) : item)
            .filter(item => {
                if (!item) return false;
                // Skills: filter out near-empty
                if (sectionKey === 'Skills' && item.skill && item.skill.length <= 1) return false;
                return true;
            });
    }

    // ──── Public API ────
    return {
        deepClean,
        parseExperience,
        parseEducation,
        parseSkill,
        parseLanguage,
        parseLicense,
        parseProject,
        parseHonor,
        parsePublication,
        parseSection
    };
})();

// Export for both Chrome extension and Node.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = LinkedInParsers;
} else {
    window.LinkedInParsers = LinkedInParsers;
}
