/**
 * Humane Content Expander: Natural, human-like inline expansion
 * ONLY inline "see more" buttons — NO navigation, NO "Show all"
 * Safety-first: realistic mouse events, human timing, no DOM fingerprints
 */

class ContentExpander {
    constructor() {
        this.config = {
            clickDelay: 900,      // Base delay between clicks (ms)
            afterClickWait: 1400, // Base wait after click (ms)
            maxButtons: 5,
            timeout: 12000,
            preScrollPause: 600,  // Pause before scrolling to a button
            postScrollSettle: 800 // Settle time after scroll completes
        };
        // Track expanded buttons in memory — no DOM mutations
        this._expanded = new WeakSet();
        this._debug = false; // Set to true only during development
    }

    /**
     * Human-like delay using log-normal distribution.
     * Real human reaction times follow log-normal, not uniform.
     */
    sleep(baseMs) {
        return new Promise(resolve => {
            // Box-Muller transform → standard normal
            const u1 = Math.random();
            const u2 = Math.random();
            const z = Math.sqrt(-2 * Math.log(Math.max(u1, 0.0001))) * Math.cos(2 * Math.PI * u2);
            // Log-normal: multiply base by exp(z * sigma)
            const sigma = 0.35;
            const actual = Math.max(baseMs * 0.4, baseMs * Math.exp(z * sigma));
            setTimeout(resolve, Math.round(actual));
        });
    }

    /**
     * Generate realistic mouse coordinates from element's bounding box.
     * Picks a random point slightly off-center (humans don't click dead center).
     */
    _getClickCoords(el) {
        const rect = el.getBoundingClientRect();
        // Human clicks cluster around center but with gaussian spread
        const cx = rect.left + rect.width * (0.35 + Math.random() * 0.3);
        const cy = rect.top + rect.height * (0.3 + Math.random() * 0.4);
        return {
            clientX: cx, clientY: cy,
            screenX: cx + window.screenX, screenY: cy + window.screenY,
            pageX: cx + window.scrollX, pageY: cy + window.scrollY
        };
    }

    /**
     * Dispatch a realistic mouse/pointer event sequence.
     * Mimics the actual browser event flow when a human clicks.
     */
    async _humanClick(el) {
        const coords = this._getClickCoords(el);
        const eventDefaults = {
            bubbles: true, cancelable: true, view: window,
            ...coords, button: 0, buttons: 1
        };

        // Phase 1: Pointer enters element (brief hover)
        el.dispatchEvent(new PointerEvent('pointerover', { ...eventDefaults, buttons: 0 }));
        el.dispatchEvent(new MouseEvent('mouseover', { ...eventDefaults, buttons: 0 }));
        el.dispatchEvent(new PointerEvent('pointerenter', { ...eventDefaults, buttons: 0 }));
        el.dispatchEvent(new MouseEvent('mouseenter', { ...eventDefaults, buttons: 0 }));

        // Brief hover dwell (humans hover ~100-300ms before clicking)
        await this.sleep(180);

        // Phase 2: Pointer moves slightly (micro-movement during hover)
        const jitter = { clientX: coords.clientX + (Math.random() - 0.5) * 3, clientY: coords.clientY + (Math.random() - 0.5) * 2 };
        el.dispatchEvent(new PointerEvent('pointermove', { ...eventDefaults, ...jitter, buttons: 0 }));
        el.dispatchEvent(new MouseEvent('mousemove', { ...eventDefaults, ...jitter, buttons: 0 }));

        await this.sleep(60);

        // Phase 3: Mouse down
        el.dispatchEvent(new PointerEvent('pointerdown', eventDefaults));
        el.dispatchEvent(new MouseEvent('mousedown', eventDefaults));

        // Human mouse-down-to-up duration: ~80-150ms
        await this.sleep(110);

        // Phase 4: Mouse up + click
        el.dispatchEvent(new PointerEvent('pointerup', { ...eventDefaults, buttons: 0 }));
        el.dispatchEvent(new MouseEvent('mouseup', { ...eventDefaults, buttons: 0 }));
        el.dispatchEvent(new MouseEvent('click', { ...eventDefaults, buttons: 0 }));

        // Phase 5: Focus (if focusable)
        if (el.focus) el.focus();
    }

    /**
     * Smooth scroll to element with preceding pointer trail.
     * Humans generate pointermove events as they move the cursor toward a target.
     */
    async _smoothScrollTo(el) {
        // Generate 2-3 fake pointermove events along the path (simulates cursor travel)
        const rect = el.getBoundingClientRect();
        const startY = window.innerHeight / 2;
        const endY = rect.top + rect.height / 2;
        const steps = 2 + Math.floor(Math.random() * 2);

        for (let i = 0; i < steps; i++) {
            const progress = (i + 1) / (steps + 1);
            const y = startY + (endY - startY) * progress + (Math.random() - 0.5) * 20;
            const x = rect.left + rect.width * (0.3 + Math.random() * 0.4);
            document.dispatchEvent(new PointerEvent('pointermove', {
                bubbles: true, clientX: x, clientY: y, view: window
            }));
            await this.sleep(80);
        }

        // Actual scroll
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await this.sleep(this.config.postScrollSettle);
    }

    /**
     * Find ONLY inline "see more" buttons (NO navigation, NO "show all")
     */
    findInlineExpandButtons() {
        const buttons = [];

        // Strategy 1: Class-based selectors for inline expansion
        const inlineClasses = [
            '.inline-show-more-text__button',
            '.show-more-less-text__button',
            '.lt-line-clamp__more'
        ];

        inlineClasses.forEach(cls => {
            document.querySelectorAll(cls).forEach(btn => {
                if (!this._expanded.has(btn)) {
                    buttons.push(btn);
                }
            });
        });

        // Strategy 2: Text-based search with STRICT filtering
        document.querySelectorAll('button, span[role="button"]').forEach(el => {
            const text = el.textContent.trim().toLowerCase();

            if (text === 'see more' || text === '...more' || text === 'more') {
                if (el.closest('.pvs-list__footer-wrapper') ||
                    el.closest('a') ||
                    text.includes('show all') ||
                    this._expanded.has(el)) {
                    return;
                }
                buttons.push(el);
            }
        });

        return buttons.slice(0, this.config.maxButtons);
    }

    /**
     * Click a button with full human-like interaction sequence
     */
    async clickButton(button) {
        try {
            // Pre-scroll pause (humans pause before moving to next element)
            await this.sleep(this.config.preScrollPause);

            // Scroll to button with pointer trail
            await this._smoothScrollTo(button);

            // Brief visual acquisition pause (human sees the button)
            await this.sleep(this.config.clickDelay);

            // Full human-like click sequence
            await this._humanClick(button);

            // Mark as expanded in memory (no DOM mutation)
            this._expanded.add(button);

            // Wait for content to expand
            await this.sleep(this.config.afterClickWait);

            return true;
        } catch (e) {
            return false;
        }
    }

    /**
     * Humane expansion - slow and natural
     * ONLY inline "see more" text buttons
     */
    async expandAll() {
        if (this._debug) console.log("ContentExpander: Starting expansion...");
        const startTime = Date.now();

        const buttons = this.findInlineExpandButtons();
        if (this._debug) console.log(`Found ${buttons.length} inline expand buttons`);

        if (buttons.length === 0) {
            return { success: true, totalClicked: 0 };
        }

        let clicked = 0;
        for (const button of buttons) {
            if (Date.now() - startTime > this.config.timeout) {
                break;
            }

            const success = await this.clickButton(button);
            if (success) clicked++;
        }

        return { success: true, totalClicked: clicked, elapsedMs: Date.now() - startTime };
    }
}

if (typeof window !== 'undefined') {
    window.ContentExpander = ContentExpander;
}
