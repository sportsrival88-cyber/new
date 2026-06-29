'use strict';

const OneSportsMatch = (() => {

    // ==========================================
    // Configuration
    // ==========================================
    let MATCH_CONFIG = {};

    const buildConfig = (container) => {
        const gameIdRaw = container.getAttribute('data-game-id');
        const streamUrl = container.getAttribute('data-stream');
        const telegram = container.getAttribute('data-telegram');
        const whatsapp = container.getAttribute('data-whatsapp');
        const poster = container.getAttribute('data-poster');

        // Build one immutable configuration object
        MATCH_CONFIG = Object.freeze({
            gameId: gameIdRaw ? Number(gameIdRaw) : null,
            streamUrl: streamUrl || null,
            telegram: telegram || null,
            whatsapp: whatsapp || null,
            poster: poster || null
        });
    };


    // ==========================================
    // Validation
    // ==========================================
    const validateConfig = () => {
        const { gameId, streamUrl, telegram, whatsapp, poster } = MATCH_CONFIG;

        if (!gameId || isNaN(gameId)) {
            console.error('[OneSportsMatch] CRITICAL ERROR: Missing or invalid numeric "data-game-id". Execution stopped.');
            return false;
        }

        if (!streamUrl) console.warn('[OneSportsMatch] Warning: "data-stream" attribute is missing.');
        if (!telegram) console.warn('[OneSportsMatch] Warning: "data-telegram" attribute is missing.');
        if (!whatsapp) console.warn('[OneSportsMatch] Warning: "data-whatsapp" attribute is missing.');
        if (!poster) console.warn('[OneSportsMatch] Warning: "data-poster" attribute is missing.');

        return true;
    };


    // ==========================================
    // Utilities
    // ==========================================
    // Placeholder for future utility functions


    // ==========================================
    // API Layer
    // ==========================================

    // Initialize global namespace
    window.OneSports = window.OneSports || {};
    window.OneSports.Match = {};

    // Global debug logger
    window.OneSports.log = (message, data = null, isError = false) => {
        const prefix = '[OneSports API]';
        if (isError) {
            console.error(`${prefix} ${message}`, data || '');
        } else {
            console.log(`${prefix} ${message}`, data || '');
        }
    };

    const ApiService = (() => {
        let isLoaded = false;
        const TIMEOUT_MS = 10000;

        /**
         * Validates configuration and orchestrates the API fetch cycle.
         * Resolves safely without throwing uncaught exceptions.
         */
        const initialize = async () => {
            if (hasLoaded()) {
                window.OneSports.log('API Service already loaded. Skipping duplicate request.');
                return true;
            }

            // Validate configuration
            if (!MATCH_CONFIG || !MATCH_CONFIG.gameId || isNaN(MATCH_CONFIG.gameId)) {
                window.OneSports.log('Missing or invalid Game ID in MATCH_CONFIG.', null, true);
                return false;
            }

            try {
                const rawJson = await loadMatch();
                const normalizedData = normalizeMatch(rawJson);
                cacheMatch(normalizedData);
                return true;
            } catch (error) {
                window.OneSports.log('Failed to initialize API Service:', error.message, true);
                return false;
            }
        };

        /**
         * Builds the API request and fetches the raw JSON data.
         * Handles timeouts, network failures, and empty responses.
         */
        const loadMatch = async () => {
            const gameId = MATCH_CONFIG.gameId;
            const url = `https://webws.365scores.com/web/game/?gameId=${gameId}`;
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

            try {
                const response = await fetch(url, { signal: controller.signal });
                clearTimeout(timeoutId);

                if (!response.ok) {
                    throw new Error(`Network failure: Status ${response.status} (${response.statusText})`);
                }

                const rawJson = await response.json();

                if (!rawJson || Object.keys(rawJson).length === 0) {
                    throw new Error('Empty response received from API.');
                }

                return rawJson;
            } catch (error) {
                clearTimeout(timeoutId);
                
                if (error.name === 'AbortError') {
                    throw new Error(`API Timeout: Request exceeded ${TIMEOUT_MS}ms.`);
                }
                
                // Bubble other network or JSON parsing errors
                throw error;
            }
        };

        /**
         * Extracts only the useful properties from the raw JSON response.
         * Defines the unified internal data model.
         */
        const normalizeMatch = (rawJson) => {
            try {
                // The 365Scores API wraps game data inside a 'game' object
                const game = rawJson?.game;
                
                if (!game) {
                    throw new Error('Invalid JSON structure: "game" root object is missing.');
                }

                return {
                    id: game.id,
                    
                    homeTeam: {
                        id: game.homeCompetitor?.id,
                        name: game.homeCompetitor?.name,
                        shortName: game.homeCompetitor?.shortName,
                        logo: game.homeCompetitor?.id ? `https://imagecache.365scores.com/image/upload/f_auto,q_auto,w_120/v1/Competitors/${game.homeCompetitor.id}` : null
                    },
                    
                    awayTeam: {
                        id: game.awayCompetitor?.id,
                        name: game.awayCompetitor?.name,
                        shortName: game.awayCompetitor?.shortName,
                        logo: game.awayCompetitor?.id ? `https://imagecache.365scores.com/image/upload/f_auto,q_auto,w_120/v1/Competitors/${game.awayCompetitor.id}` : null
                    },
                    
                    competition: {
                        id: game.competitionId,
                        name: game.competitionDisplayName,
                        logo: game.competitionId ? `https://imagecache.365scores.com/image/upload/f_auto,q_auto,w_120/v1/Competitions/${game.competitionId}` : null
                    },
                    
                    stage: game.stageName || null,
                    
                    round: game.roundNum || null,
                    
                    venue: {
                        stadium: game.venue?.name || null,
                        city: game.venue?.city || null,
                        country: game.venue?.country || null
                    },
                    
                    kickoff: game.startTime || null,
                    
                    referee: game.referee?.name || null,
                    
                    attendance: game.attendance || null,
                    
                    status: game.statusText || null,
                    
                    score: {
                        home: (game.homeCompetitor?.score >= 0) ? game.homeCompetitor.score : null,
                        away: (game.awayCompetitor?.score >= 0) ? game.awayCompetitor.score : null
                    }
                };
            } catch (error) {
                throw new Error(`Normalization failed: ${error.message}`);
            }
        };

        /**
         * Stores the normalized match object deeply frozen to prevent accidental mutation.
         */
        const cacheMatch = (normalizedData) => {
            window.OneSports.Match = Object.freeze(normalizedData);
            isLoaded = true;
            window.OneSports.log('Match successfully cached.', window.OneSports.Match);
        };

        /**
         * Safely returns the cached match data for future modules.
         */
        const getMatch = () => {
            if (!isLoaded || !window.OneSports.Match) {
                window.OneSports.log('Attempted to get match data before API successfully loaded.', null, true);
                return null;
            }
            return window.OneSports.Match;
        };

        /**
         * Simple flag check for rendering modules.
         */
        const hasLoaded = () => isLoaded;

        // Expose public API
        return {
            initialize,
            loadMatch,
            normalizeMatch,
            cacheMatch,
            getMatch,
            hasLoaded
        };
    })();

    // Expose ApiService securely to the global namespace
    window.OneSports.Api = ApiService;


    // ==========================================
    // Rendering
    // ==========================================
    // Placeholder for UI generation, layout construction, and rendering


    // ==========================================
    // Widgets
    // ==========================================
    // Placeholder for 365Scores widget injections and management


    // ==========================================
    // SEO
    // ==========================================
    // Placeholder for SEO tags, OpenGraph, Twitter Cards, and Structured Data


    // ==========================================
    // Ads
    // ==========================================
    // Placeholder for AdSense integration and banner placements


    // ==========================================
    // Recent Posts
    // ==========================================
    // Placeholder for fetching and rendering recent posts


    // ==========================================
    // Related Posts
    // ==========================================
    // Placeholder for fetching and rendering related posts


    // ==========================================
    // Event System
    // ==========================================
    const EventBus = (() => {
        const listeners = {};

        const on = (event, callback) => {
            if (!listeners[event]) listeners[event] = [];
            listeners[event].push(callback);
        };

        const off = (event, callback) => {
            if (!listeners[event]) return;
            listeners[event] = listeners[event].filter(cb => cb !== callback);
        };

        const emit = (event, data = null) => {
            window.OneSports.log(`Event Emitted: [${event}]`, data);
            if (!listeners[event]) return;
            listeners[event].forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    window.OneSports.log(`Error in event listener for [${event}]`, error, true);
                }
            });
        };

        return { on, off, emit };
    })();

    // Expose Event System to future modules safely
    window.OneSports.Events = EventBus;


    // ==========================================
    // Application Modules
    // ==========================================
    const Modules = {
        Poster: {
            init: async () => {
                const container = document.getElementById('onesports-match');
                if (!container) return;

                const match = window.OneSports.Api.hasLoaded() ? window.OneSports.Api.getMatch() : null;
                const altText = match && match.homeTeam && match.awayTeam 
                    ? `${match.homeTeam.name} vs ${match.awayTeam.name} Poster` 
                    : 'Match Poster';

                const posterUrl = MATCH_CONFIG.poster || 'https://placehold.co/1200x675/1a1a24/ffffff?text=OneSports+Live';

                const html = `
                    <div class="os-poster-container fade-in">
                        <img src="${posterUrl}" alt="${altText}" class="os-poster-image" loading="lazy">
                    </div>
                `;
                container.insertAdjacentHTML('beforeend', html);
                window.OneSports.log('Poster Module rendered.');
            }
        },

        MatchInfo: {
            init: async () => {
                const container = document.getElementById('onesports-match');
                const match = window.OneSports.Api.getMatch();
                if (!container || !match) return;

                const dateObj = match.kickoff ? new Date(match.kickoff) : null;
                const dateStr = dateObj ? dateObj.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) : 'TBD';
                const timeStr = dateObj ? dateObj.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : 'TBD';

                const homeLogoUrl = match.homeTeam?.logo || '';
                const awayLogoUrl = match.awayTeam?.logo || '';
                const compLogo = match.competition?.logo || '';
                const compName = match.competition?.name || '';
                const roundText = match.round ? `Round ${match.round}` : '';

                const html = `
                    <style>
                        /* Injected Flag Glassmorphic Background Styles */
                        .card-bg-flag {
                            position: absolute;
                            top: -15px;
                            bottom: -15px;
                            width: 40%;
                            background-size: cover;
                            background-position: center;
                            background-repeat: no-repeat;
                            opacity: 0.25;
                            z-index: 1;
                            filter: blur(4px) saturate(150%);
                        }
                        .card-bg-flag.left {
                            left: -25px;
                            mask-image: linear-gradient(to right, rgba(0,0,0,1) 40%, rgba(0,0,0,0) 100%);
                            -webkit-mask-image: linear-gradient(to right, rgba(0,0,0,1) 40%, rgba(0,0,0,0) 100%);
                        }
                        .card-bg-flag.right {
                            right: -25px;
                            mask-image: linear-gradient(to left, rgba(0,0,0,1) 40%, rgba(0,0,0,0) 100%);
                            -webkit-mask-image: linear-gradient(to left, rgba(0,0,0,1) 40%, rgba(0,0,0,0) 100%);
                        }
                    </style>
                    <div class="match-card fade-in" style="position: relative; margin-bottom: 30px; cursor: default; border-color: var(--glass-border); padding: 30px; border-radius: 20px; background: rgba(20, 20, 25, 0.4); backdrop-filter: blur(10px); overflow: hidden;">
                        <!-- Background Flag Fills -->
                        ${homeLogoUrl ? `<div class="card-bg-flag left" style="background-image: url('${homeLogoUrl}'); opacity: 0.15; filter: blur(24px) saturate(120%);"></div>` : ''}
                        ${awayLogoUrl ? `<div class="card-bg-flag right" style="background-image: url('${awayLogoUrl}'); opacity: 0.15; filter: blur(24px) saturate(120%);"></div>` : ''}
                        
                        <!-- Content layer -->
                        <div style="position: relative; z-index: 2;">
                            
                            <!-- Top Row: Competition, Logo, & Round -->
                            <div class="match-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px;">
                                ${compName ? `
                                <div style="display:flex; align-items:center;">
                                    ${compLogo ? `<img src="${compLogo}" alt="Cup" style="width:20px; height:20px; margin-right:8px; border-radius:2px;">` : ''}
                                    <span style="text-transform: uppercase; color: #ffffff; font-weight: 600; font-size: 0.9rem; letter-spacing: 0.5px;">${compName}</span>
                                </div>` : '<div></div>'}
                                
                                <div style="display: flex; align-items: center; gap: 15px;">
                                    ${roundText ? `<div style="color: #ffffff; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 1px; font-weight: 600; opacity: 0.8;">${roundText}</div>` : ''}
                                    <div style="font-family: var(--font-heading); font-weight: 900; letter-spacing: 1px; color: var(--text-muted); font-size: 0.9rem; opacity: 0.6;">
                                        ONE<span style="color:var(--primary);">SPORTS</span>
                                    </div>
                                </div>
                            </div>

                            <!-- Middle Row: Teams & VS -->
                            <div class="match-teams-score" style="display: flex; flex-direction: row; align-items: center; justify-content: space-between; margin-top: 10px; margin-bottom: 40px; width: 100%;">
                                <div class="team" style="display: flex; flex-direction: column; align-items: center; width: 40%;">
                                    <img src="${homeLogoUrl}" alt="${match.homeTeam?.name}" style="width: 85px; height: 85px; margin-bottom: 15px; filter: drop-shadow(0 4px 10px rgba(0,0,0,0.6));">
                                    <div class="team-name" style="font-family: var(--font-heading); font-size: 1.5rem; font-weight: 800; color: #ffffff; letter-spacing: 1px; text-transform: uppercase; text-align: center;">${match.homeTeam?.name || 'Home Team'}</div>
                                </div>

                                <div class="score-area" style="display: flex; flex-direction: column; align-items: center; justify-content: center; width: 20%;">
                                    <div style="font-family: var(--font-heading); font-size: 2.5rem; font-weight: 900; color: #ffffff; opacity: 0.7; letter-spacing: 2px;">VS</div>
                                </div>

                                <div class="team" style="display: flex; flex-direction: column; align-items: center; width: 40%;">
                                    <img src="${awayLogoUrl}" alt="${match.awayTeam?.name}" style="width: 85px; height: 85px; margin-bottom: 15px; filter: drop-shadow(0 4px 10px rgba(0,0,0,0.6));">
                                    <div class="team-name" style="font-family: var(--font-heading); font-size: 1.5rem; font-weight: 800; color: #ffffff; letter-spacing: 1px; text-transform: uppercase; text-align: center;">${match.awayTeam?.name || 'Away Team'}</div>
                                </div>
                            </div>

                            <!-- Bottom Row: Match Details -->
                            <div class="os-mi-details" style="border-top: 1px solid rgba(255,255,255,0.08); padding-top: 25px;">
                                <div class="os-mi-detail-item" style="color: #ffffff; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.04); border-radius: 8px;"><i class="fas fa-calendar-alt" style="color: #ffffff; opacity: 0.5;"></i> ${dateStr}</div>
                                <div class="os-mi-detail-item" style="color: #ffffff; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.04); border-radius: 8px;"><i class="fas fa-clock" style="color: #ffffff; opacity: 0.5;"></i> ${timeStr}</div>
                                ${match.venue?.stadium ? `
                                <div class="os-mi-detail-item" style="color: #ffffff; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.04); border-radius: 8px;">
                                    <i class="fas fa-map-marker-alt" style="color: #ffffff; opacity: 0.5;"></i> ${match.venue.stadium}${match.venue.city ? `, ${match.venue.city}` : ''}
                                </div>` : ''}
                            </div>

                        </div>
                    </div>
                `;

                container.insertAdjacentHTML('beforeend', html);
                window.OneSports.log('MatchInfo Module rendered.');
            }
        },
        
        Buttons: {
            init: async () => {
                const container = document.getElementById('onesports-match');
                if (!container) return;

                const { telegram, whatsapp } = MATCH_CONFIG;
                if (!telegram && !whatsapp) return;

                let html = `
                    <style>
                        .community-join-section { display: flex; gap: 15px; margin-top: 25px; margin-bottom: 30px; width: 100%; }
                        .community-btn { flex: 1; padding: 12px !important; border-radius: 8px !important; text-align: center !important; text-decoration: none !important; font-weight: 600 !important; color: #ffffff !important; font-size: 0.9rem !important; transition: transform 0.2s, box-shadow 0.2s; border: none !important; outline: none !important; display: inline-block; }
                        .community-btn:hover { transform: translateY(-2px); box-shadow: var(--glass-shadow); color: #ffffff !important; }
                        .telegram-btn { background: linear-gradient(135deg, #0088cc, #00aaff) !important; }
                        .whatsapp-btn { background: linear-gradient(135deg, #25D366, #128C7E) !important; }
                        @media (max-width: 768px) { .community-join-section { flex-direction: column; } }
                    </style>
                    <div class="community-join-section">
                `;
                
                if (telegram) {
                    html += `
                        <a href="${telegram}" target="_blank" rel="noopener noreferrer" class="community-btn telegram-btn" aria-label="Join Telegram" id="telegram-link">
                            <i class="fab fa-telegram-plane"></i> Join Telegram
                        </a>
                    `;
                }
                
                if (whatsapp) {
                    html += `
                        <a href="${whatsapp}" target="_blank" rel="noopener noreferrer" class="community-btn whatsapp-btn" aria-label="Join WhatsApp" id="whatsapp-link">
                            <i class="fab fa-whatsapp"></i> Join WhatsApp
                        </a>
                    `;
                }
                
                html += '</div>';

                container.insertAdjacentHTML('beforeend', html);
                window.OneSports.log('Buttons Module rendered.');
            }
        },
        Widgets: {
            init: async () => {
                const container = document.getElementById('onesports-match');
                if (!container || !MATCH_CONFIG.gameId) return;

                // Create the widget wrapper with injected fallback styles
                const widgetWrapperHTML = `
                    <style>
                        /* Injected Widget Styles to bypass cache */
                        .os-widget-container { width: 100%; margin-top: 25px; margin-bottom: 40px; position: relative; min-height: 800px; overflow: hidden; }
                        .os-standings-container { width: 100%; margin-top: 25px; margin-bottom: 40px; position: relative; min-height: 500px; overflow: hidden; }
                        .os-widget-iframe { width: 100%; height: 850px; border: none; opacity: 0; transition: opacity 0.5s ease-in-out; z-index: 1; position: relative; display: block; }
                        .os-widget-iframe.loaded { opacity: 1; }
                        .os-widget-skeleton, .os-standings-skeleton { position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: flex; flex-direction: column; gap: 15px; padding: 20px; z-index: 2; background: rgba(0,0,0,0.2); }
                        .os-skeleton-row { width: 100%; height: 60px; background: rgba(255, 255, 255, 0.03); border-radius: 8px; animation: os-shimmer 1.5s infinite linear; }
                        .os-skeleton-row:first-child { height: 150px; }
                        body.light-mode .os-skeleton-row { background: rgba(0, 0, 0, 0.04); }
                        @keyframes os-shimmer { 0% { opacity: 0.4; } 50% { opacity: 1; } 100% { opacity: 0.4; } }
                    </style>
                    <div id="os-match-widget" class="glass-card os-widget-container fade-in" aria-label="Live Match Center">
                        <div class="os-widget-skeleton">
                            <div class="os-skeleton-row"></div>
                            <div class="os-skeleton-row"></div>
                            <div class="os-skeleton-row"></div>
                            <div class="os-skeleton-row"></div>
                        </div>
                    </div>
                `;
                container.insertAdjacentHTML('beforeend', widgetWrapperHTML);

                const widgetWrapper = document.getElementById('os-match-widget');
                
                // Load widget immediately to maximize performance instead of waiting for scroll
                Modules.Widgets.loadIframe(widgetWrapper);
                window.OneSports.log('Widget Module initialized (Immediate Loading).');
            },

            loadIframe: (wrapper) => {
                const match = window.OneSports.Api.getMatch();
                if (!match || !match.homeTeam || !match.awayTeam || !match.competition) {
                    return Modules.Widgets.renderError(wrapper);
                }

                const entityId = `${match.homeTeam.id}-${match.awayTeam.id}-${match.competition.id}`;
                const isLightMode = document.body.classList.contains('light-mode');
                const themeParam = isLightMode ? 'light' : 'dark';
                
                const iframe = document.createElement('iframe');
                iframe.className = 'os-widget-iframe fade-in';
                iframe.title = "Live Match Center";
                iframe.setAttribute('allowtransparency', 'true');
                iframe.style.cssText = "width: 100%; height: 750px; border: none; overflow-y: auto; border-radius: 8px; display: block; opacity: 0; transition: opacity 0.5s ease;";

                // Encapsulate the widget inside an iframe to prevent its global CSS from leaking and breaking the site's layout.
                const html = `
                    <!DOCTYPE html>
                    <html lang="en">
                    <head>
                        <meta charset="UTF-8">
                        <meta name="viewport" content="width=device-width, initial-scale=1.0">
                        <link rel="preconnect" href="https://widgets.365scores.com">
                        <link rel="preload" href="https://widgets.365scores.com/main.js" as="script">
                        <style>
                            body { margin: 0; padding: 0; background: transparent; overflow-y: auto; overflow-x: hidden; }
                            #powered-by { display: none !important; }
                        </style>
                    </head>
                    <body>
                        <div data-allow-premium-data="true" 
                             data-entity-id="${entityId}" 
                             data-lang="en-US" 
                             data-support-top-games="true" 
                             data-theme="${themeParam}" 
                             data-widget-id="0.fwq61qa3fvf" 
                             data-widget-type="game">
                        </div>
                        <scr` + `ipt src="https://widgets.365scores.com/main.js"></scr` + `ipt>
                    </body>
                    </html>
                `;

                iframe.srcdoc = html;

                let hasLoaded = false;
                iframe.onload = () => {
                    if (hasLoaded) return;
                    hasLoaded = true;
                    const skeleton = wrapper.querySelector('.os-widget-skeleton');
                    if (skeleton) skeleton.style.display = 'none';
                    iframe.style.opacity = '1';
                    window.OneSports.log('365Scores Widget encapsulated successfully.');
                };

                // Fallback timeout in case iframe fails silently
                setTimeout(() => {
                    if (!hasLoaded) {
                        hasLoaded = true;
                        Modules.Widgets.renderError(wrapper);
                    }
                }, 12000);

                wrapper.appendChild(iframe);
            },

            renderError: (wrapper) => {
                wrapper.innerHTML = `
                    <div class="os-widget-error">
                        <i class="fas fa-exclamation-triangle" style="font-size: 2.5rem; color: var(--secondary); margin-bottom: 15px;"></i>
                        <h4 style="font-family: var(--font-heading); margin-bottom: 10px;">Widget Unavailable</h4>
                        <p style="color: var(--text-muted); font-size: 0.95rem;">Match information is temporarily unavailable. Please refresh the page or try again later.</p>
                    </div>
                `;
                window.OneSports.log('365Scores Widget failed to load.', null, true);
            }
        },

        WatchButton: {
            init: async () => {
                const container = document.getElementById('onesports-match');
                if (!container) return;

                const streamUrl = MATCH_CONFIG.streamUrl;
                
                // Determine disabled state and attributes
                const isDisabled = !streamUrl;
                const hrefAttr = isDisabled ? 'javascript:void(0)' : streamUrl;
                const targetAttr = (streamUrl && streamUrl.startsWith('/')) ? '_self' : '_blank';
                const disabledClass = isDisabled ? 'os-disabled' : '';
                
                const html = `
                    <div class="os-watch-btn-container fade-in">
                        <a href="${hrefAttr}" 
                           target="${targetAttr}" 
                           ${!isDisabled && targetAttr === '_blank' ? 'rel="noopener noreferrer"' : ''}
                           class="community-btn watch-btn ${disabledClass}" 
                           aria-label="Watch Live Match"
                           ${isDisabled ? 'aria-disabled="true" tabindex="-1"' : ''}>
                            <i class="fas fa-play-circle"></i> WATCH LIVE
                        </a>
                    </div>
                `;

                container.insertAdjacentHTML('beforeend', html);
                window.OneSports.log('WatchButton Module rendered.');
            }
        },

        Standings: {
            allRows: [],
            currentGroupNum: 1,

            getGroupName: (num) => {
                return "Group " + String.fromCharCode(64 + num); // 1->A, 2->B
            },

            getFormBadges: (recentFormArray) => {
                if (!recentFormArray) return "";
                let html = '<div style="display:flex; gap:4px;">';
                recentFormArray.slice(0, 3).forEach(f => {
                    let color = '#fff'; let bg = '#666'; let text = '?';
                    if (f === 1) { text = 'W'; bg = '#0CF737'; color = '#000'; } // Win
                    else if (f === 3 || f === 0) { text = 'D'; bg = '#4f4f4f'; } // Draw
                    else { text = 'L'; bg = '#ff4d4d'; } // Loss
                    html += `<span style="display:inline-flex; align-items:center; justify-content:center; width:20px; height:20px; border-radius:4px; font-size:10px; font-weight:bold; background:${bg}; color:${color};">${text}</span>`;
                });
                html += '</div>';
                return html;
            },

            init: async () => {
                const container = document.getElementById('onesports-match');
                const match = window.OneSports.Api.getMatch();
                
                if (!container || !match || !match.competition || !match.competition.id) return;

                const compId = match.competition.id;
                const widgetWrapperHTML = `
                    <style>
                        /* Standings Table overrides */
                        .standings-table { width: 100%; border-collapse: collapse; margin-top: 5px; font-size: 13px; }
                        .standings-table th { text-align: left; padding: 12px 8px; border-bottom: 1px solid var(--glass-border); color: var(--text-muted); font-weight: 500; }
                        .standings-table td { padding: 12px 8px; border-bottom: 1px solid rgba(255,255,255,0.02); text-align: left; vertical-align: middle; }
                        .standings-table tr:hover td { background: rgba(255,255,255,0.03); }
                        .standings-table .team-name { text-align: left; font-weight: 600; display: flex; align-items: center; gap: 8px; }
                    </style>
                    <div id="os-standings-widget" class="glass-card os-standings-container fade-in" style="min-height: auto; padding: 20px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 5px; border-bottom: 1px solid var(--glass-border); padding-bottom: 8px;">
                            <h3 style="margin: 0; font-family: var(--font-heading); font-size: 1.2rem;"><i class="fas fa-list-ol" style="color: var(--secondary); margin-right: 8px;"></i> Standings</h3>
                        </div>
                        <div style="overflow-x: auto;">
                            <table class="standings-table">
                                <thead>
                                    <tr>
                                        <th style="width:30px;">#</th>
                                        <th style="text-align:left;">Team</th>
                                        <th style="width:30px;" title="Played">P</th>
                                        <th style="width:30px;" title="Won">W</th>
                                        <th style="width:30px;" title="Drawn">D</th>
                                        <th style="width:30px;" title="Lost">L</th>
                                        <th style="width:40px;" title="Goal Difference">GD</th>
                                        <th style="width:40px;" title="Points">Pts</th>
                                    </tr>
                                </thead>
                                <tbody id="os-standings-body">
                                    <tr><td colspan="8" style="padding:40px;">
                                        <div class="os-skeleton-row" style="height: 30px; margin-bottom: 10px;"></div>
                                        <div class="os-skeleton-row" style="height: 30px; margin-bottom: 10px;"></div>
                                        <div class="os-skeleton-row" style="height: 30px;"></div>
                                    </td></tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                `;
                container.insertAdjacentHTML('beforeend', widgetWrapperHTML);

                Modules.Standings.loadData(compId);
            },

            loadData: async (compId) => {
                const url = `https://webws.365scores.com/web/standings/?appTypeId=5&langId=1&timezoneName=Asia%2FCalcutta&userCountryId=80&competitions=${compId}&live=false&withSeasonsFilter=true`;
                try {
                    const response = await fetch(url);
                    if (!response.ok) throw new Error('Network response was not ok');
                    const data = await response.json();
                    
                    if (data && data.standings && data.standings.length > 0) {
                        Modules.Standings.allRows = data.standings[0].rows || [];
                        Modules.Standings.destinations = data.standings[0].destinations || [];
                        Modules.Standings.setupGroups();
                        Modules.Standings.renderTable();
                    } else {
                        throw new Error('No standings data');
                    }
                } catch (error) {
                    window.OneSports.log('Failed to load standings API', error, true);
                    const widget = document.getElementById('os-standings-widget');
                    if (widget) widget.style.display = 'none';
                }
            },

            setupGroups: () => {
                const match = window.OneSports.Api.getMatch();
                const homeId = match?.homeTeam?.id;
                const awayId = match?.awayTeam?.id;

                const homeRow = Modules.Standings.allRows.find(r => r.competitor.id === homeId);
                const awayRow = Modules.Standings.allRows.find(r => r.competitor.id === awayId);

                let targetGroups = new Set();
                if (homeRow) targetGroups.add(homeRow.groupNum || 1);
                if (awayRow) targetGroups.add(awayRow.groupNum || 1);
                
                if (targetGroups.size === 0) targetGroups.add(1);

                Modules.Standings.targetGroups = Array.from(targetGroups).sort();
            },

            renderTable: () => {
                const tbody = document.getElementById('os-standings-body');
                if (!Modules.Standings.allRows.length) return;

                const match = window.OneSports.Api.getMatch();
                const homeId = match?.homeTeam?.id;
                const awayId = match?.awayTeam?.id;
                
                const allGroups = [...new Set(Modules.Standings.allRows.map(r => r.groupNum || 1))];
                let html = "";

                Modules.Standings.targetGroups.forEach(groupNum => {
                    const groupRows = Modules.Standings.allRows.filter(r => (r.groupNum || 1) === groupNum);
                    
                    if (groupRows.length === 0) return;

                    // Group Divider
                    if (allGroups.length > 1) {
                        if (html !== "") {
                            html += `<tr><td colspan="8" style="height: 15px;"></td></tr>`;
                        }
                        html += `<tr><td colspan="8" style="background:rgba(255,255,255,0.06); font-weight:700; color:#fff; text-align:left; padding:10px 15px; font-size:1.05rem; border-left: 3px solid var(--primary); letter-spacing:0.5px;"><i class="fas fa-layer-group" style="color:var(--secondary); margin-right:8px;"></i>${Modules.Standings.getGroupName(groupNum)}</td></tr>`;
                    }

                    groupRows.sort((a,b) => a.position - b.position);

                    groupRows.forEach(row => {
                        const c = row.competitor;
                        const flagUrl = `https://imagecache.365scores.com/image/upload/f_auto,q_auto,w_48/v1/Competitors/${c.id}`;
                        
                        const dest = Modules.Standings.destinations.find(d => d.num === row.destinationNum);
                        const destBg = (dest && dest.type === 1) ? `background: rgba(12, 247, 55, 0.025);` : '';
                        const borderStyle = dest ? `border-left: 3px solid ${dest.color};` : '';

                        const isPlaying = (c.id === homeId || c.id === awayId);
                        const highlightBg = isPlaying ? 'background: rgba(255,255,255,0.08);' : destBg;
                        const fontWeight = isPlaying ? 'font-weight: bold;' : '';
                        const finalBorder = isPlaying ? 'border-left: 3px solid var(--primary);' : borderStyle;

                        html += `
                        <tr style="${highlightBg} ${fontWeight}">
                            <td style="${finalBorder}">${row.position}</td>
                            <td class="team-name">
                                <img src="${flagUrl}" width="24" height="24" style="border-radius:50%; object-fit:cover;" alt="${c.name}" loading="lazy">
                                <span>${c.name}</span>
                            </td>
                            <td>${row.gamePlayed}</td>
                            <td>${row.gamesWon}</td>
                            <td>${row.gamesEven}</td>
                            <td>${row.gamesLost}</td>
                            <td>${row.for - row.against > 0 ? '+' : ''}${row.for - row.against}</td>
                            <td style="font-weight:bold; color:var(--secondary);">${row.points}</td>
                        </tr>
                        `;
                    });
                });

                if (html === "") {
                    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:20px; color:var(--text-muted);">No standings available for these teams.</td></tr>`;
                } else {
                    tbody.innerHTML = html;
                }
            }
        },

        BloggerContent: {
            init: async () => {
                const container = document.getElementById('onesports-match');
                if (!container) return;

                // Create the sections
                const html = `
                    <div id="os-related-posts" class="os-blogger-section fade-in">
                        <div class="section-header">
                            <h3>Related Posts</h3>
                        </div>
                        <div class="os-blogger-grid" id="os-related-grid">
                            ${Modules.BloggerContent.renderSkeleton(6)}
                        </div>
                    </div>
                    <div id="os-recent-posts" class="os-blogger-section fade-in">
                        <div class="section-header">
                            <h3>Recent Posts</h3>
                        </div>
                        <div class="os-blogger-grid" id="os-recent-grid">
                            ${Modules.BloggerContent.renderSkeleton(6)}
                        </div>
                    </div>
                `;
                container.insertAdjacentHTML('beforeend', html);

                // Load in parallel
                await Promise.all([
                    Modules.BloggerContent.loadRelated(),
                    Modules.BloggerContent.loadRecent()
                ]);
                
                window.OneSports.log('BloggerContent Module rendered.');
            },

            getLabels: () => {
                const tags = [];
                document.querySelectorAll('a[rel="tag"]').forEach(a => tags.push(a.textContent.trim()));
                document.querySelectorAll('meta[property="article:tag"]').forEach(m => tags.push(m.getAttribute('content')));
                return [...new Set(tags)];
            },

            getCurrentUrl: () => {
                return window.location.href.split('?')[0].split('#')[0];
            },

            fetchFeed: async (url) => {
                try {
                    const response = await fetch(url);
                    if (!response.ok) throw new Error('Network response was not ok');
                    return await response.json();
                } catch (error) {
                    window.OneSports.log('Blogger feed fetch error:', error, true);
                    return null;
                }
            },

            parseFeed: (data) => {
                if (!data || !data.feed || !data.feed.entry) return [];
                const currentUrl = Modules.BloggerContent.getCurrentUrl();
                
                return data.feed.entry
                    .map(entry => {
                        let link = entry.link.find(l => l.rel === 'alternate')?.href || '';
                        let title = entry.title.$t || '';
                        let published = new Date(entry.published.$t).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
                        // Request higher quality image from Blogger thumbnail URL
                        let thumbnail = entry.media$thumbnail ? entry.media$thumbnail.url.replace(/\/s\d+(-c)?\//, '/s600/') : 'https://placehold.co/600x400/1a1a24/ffffff?text=OneSports';
                        
                        return { title, link, published, thumbnail };
                    })
                    .filter(post => post.link !== currentUrl);
            },

            renderCards: (posts, containerId, limit) => {
                const grid = document.getElementById(containerId);
                if (!grid) return;
                
                if (!posts || posts.length === 0) {
                    Modules.BloggerContent.renderError(grid);
                    return;
                }

                const postsToRender = posts.slice(0, limit);
                
                const html = postsToRender.map(post => `
                    <a href="${post.link}" class="news-card fade-in" aria-label="Read ${post.title}">
                        <img src="${post.thumbnail}" alt="${post.title}" class="news-image" loading="lazy">
                        <div class="news-content">
                            <h4 class="news-title">${post.title}</h4>
                            <div class="news-meta">
                                <span><i class="fas fa-calendar-alt"></i> ${post.published}</span>
                            </div>
                        </div>
                    </a>
                `).join('');

                grid.innerHTML = html;
            },

            renderSkeleton: (count) => {
                let html = '';
                for(let i=0; i<count; i++) {
                    html += `
                        <div class="news-card os-skeleton-card">
                            <div class="news-image os-skeleton-img"></div>
                            <div class="news-content" style="gap: 10px;">
                                <div class="os-skeleton-row" style="height: 15px; width: 90%; animation-duration: 1s;"></div>
                                <div class="os-skeleton-row" style="height: 15px; width: 60%; animation-duration: 1s;"></div>
                                <div class="os-skeleton-row" style="height: 10px; width: 40%; margin-top: auto; animation-duration: 1s;"></div>
                            </div>
                        </div>
                    `;
                }
                return html;
            },

            renderError: (grid) => {
                grid.innerHTML = `
                    <div class="os-widget-error" style="grid-column: 1 / -1; padding: 30px;">
                        <i class="fas fa-newspaper" style="font-size: 2rem; color: var(--text-muted); margin-bottom: 10px;"></i>
                        <p style="color: var(--text-muted);">Unable to load articles. Please refresh the page.</p>
                    </div>
                `;
            },

            loadRecent: async () => {
                // Fetch slightly more to account for currentUrl filtering
                const url = '/feeds/posts/summary?alt=json&max-results=8';
                const data = await Modules.BloggerContent.fetchFeed(url);
                const posts = Modules.BloggerContent.parseFeed(data);
                Modules.BloggerContent.renderCards(posts, 'os-recent-grid', 6);
            },

            loadRelated: async () => {
                const labels = Modules.BloggerContent.getLabels();
                let posts = [];
                
                if (labels.length > 0) {
                    const labelQuery = encodeURIComponent(labels[0]);
                    const url = `/feeds/posts/summary/-/${labelQuery}?alt=json&max-results=8`;
                    const data = await Modules.BloggerContent.fetchFeed(url);
                    posts = Modules.BloggerContent.parseFeed(data);
                }
                
                // Fallback to recent if empty or failed
                if (posts.length === 0) {
                    const url = '/feeds/posts/summary?alt=json&max-results=8';
                    const data = await Modules.BloggerContent.fetchFeed(url);
                    posts = Modules.BloggerContent.parseFeed(data);
                }
                
                Modules.BloggerContent.renderCards(posts, 'os-related-grid', 6);
            }
        },

        TitleManager: {
            generateCoreTitle: (match) => {
                if (!match || !match.homeTeam || !match.awayTeam) return 'Live Match';
                return `${match.homeTeam.name} vs ${match.awayTeam.name}`;
            },

            generateBrowserTitle: (match) => {
                const coreTitle = Modules.TitleManager.generateCoreTitle(match);
                const compStr = match.competition?.name ? ` | ${match.competition.name}` : '';
                // Configurable browser title format
                return `${coreTitle} Live Stream${compStr} | OneSports`;
            },

            init: async () => {
                const match = window.OneSports.Api.getMatch();
                if (!match) return;

                const browserTitle = Modules.TitleManager.generateBrowserTitle(match);

                // Update visible browser tab title
                document.title = browserTitle;

                // Update existing Open Graph tag
                const ogTitle = document.querySelector('meta[property="og:title"]');
                if (ogTitle) ogTitle.setAttribute('content', browserTitle);

                // Update existing Twitter tag
                const twitterTitle = document.querySelector('meta[name="twitter:title"]');
                if (twitterTitle) twitterTitle.setAttribute('content', browserTitle);

                window.OneSports.log('TitleManager synchronized titles.', browserTitle);
            }
        },

        SEO: {
            init: async () => {
                const match = window.OneSports.Api.getMatch();
                if (!match) return;

                Modules.SEO.injectSportsEventSchema(match);
                window.OneSports.log('SEO Module initialized.');
            },

            getEventStatus: (statusCode, statusText) => {
                // Map 365Scores status to valid Schema.org EventStatusType
                const text = (statusText || '').toLowerCase();
                if (text.includes('cancel')) return 'https://schema.org/EventCancelled';
                if (text.includes('postpone')) return 'https://schema.org/EventPostponed';
                if (text.includes('reschedule')) return 'https://schema.org/EventRescheduled';
                
                // For Scheduled, Live, and Finished, EventScheduled is the standard base type
                return 'https://schema.org/EventScheduled';
            },

            injectSportsEventSchema: (match) => {
                // Prevent duplicate injection
                if (document.getElementById('os-sportsevent-schema')) return;

                const { homeTeam, awayTeam, competition, venue, kickoff, round, referee } = match;
                
                // Safely validate required fields for a valid schema
                if (!homeTeam || !awayTeam || !kickoff) {
                    window.OneSports.log('SEO Module aborted: Missing required schema data.');
                    return;
                }

                const eventName = Modules.TitleManager.generateCoreTitle(match);
                const poster = MATCH_CONFIG.poster || 'https://www.onesports.live/favicon.ico';
                
                const schema = {
                    "@context": "https://schema.org",
                    "@type": "SportsEvent",
                    "name": eventName,
                    "sport": "Football",
                    "url": window.location.href,
                    "image": poster,
                    "startDate": kickoff,
                    "eventStatus": Modules.SEO.getEventStatus(match.statusCode, match.status),
                    "homeTeam": {
                        "@type": "SportsTeam",
                        "name": homeTeam.name,
                        "image": homeTeam.logo
                    },
                    "awayTeam": {
                        "@type": "SportsTeam",
                        "name": awayTeam.name,
                        "image": awayTeam.logo
                    }
                };

                // Optional attributes
                if (competition && competition.name) {
                    schema.superEvent = {
                        "@type": "SportsEvent",
                        "name": competition.name,
                        "description": round ? `Round ${round}` : undefined
                    };
                    schema.organizer = {
                        "@type": "Organization",
                        "name": competition.name,
                        "url": "https://www.onesports.live"
                    };
                }

                if (venue && venue.stadium) {
                    schema.location = {
                        "@type": "Place",
                        "name": venue.stadium,
                        "address": {
                            "@type": "PostalAddress",
                            "addressLocality": venue.city || undefined,
                            "addressCountry": venue.country || undefined
                        }
                    };
                }

                if (referee && referee !== 'N/A') {
                    // Mapping referee as a performer or generic contributor
                    schema.performer = {
                        "@type": "Person",
                        "name": referee,
                        "jobTitle": "Referee"
                    };
                }

                const script = document.createElement('script');
                script.type = 'application/ld+json';
                script.id = 'os-sportsevent-schema';
                script.textContent = JSON.stringify(schema, null, 2);
                
                document.head.appendChild(script);
            },

            /**
             * Optional helper to enhance title dynamically in the future.
             * DISABLED BY DEFAULT to respect native Blogger title.
             */
            enhanceTitle: (newContext) => {
                // const currentTitle = document.title;
                // document.title = `${newContext} - ${currentTitle}`;
            },

            /**
             * Optional helper to enhance meta description dynamically in the future.
             * DISABLED BY DEFAULT to respect native Blogger description.
             */
            enhanceDescription: (additionalInfo) => {
                // const metaDesc = document.querySelector('meta[name="description"]');
                // if (metaDesc) {
                //     const currentDesc = metaDesc.getAttribute('content');
                //     metaDesc.setAttribute('content', `${currentDesc} ${additionalInfo}`);
                // }
            }
        },

        Ads: { init: async () => {} }
    };

    // Organized rendering sequence for future UI modules
    const renderQueue = [
        Modules.Poster,
        Modules.MatchInfo,
        Modules.Buttons,
        Modules.Widgets,
        Modules.WatchButton,
        Modules.Standings,
        Modules.BloggerContent
    ];


    // ==========================================
    // Application Bootstrapper
    // ==========================================
    const AppController = (() => {
        
        // Single source of truth for the application state
        const AppState = {
            loading: false,
            ready: false,
            error: false,
            matchLoaded: false
        };

        /**
         * Step 1: Pre-loading phase.
         * Extracts and validates DOM-level configuration.
         */
        const beforeLoad = () => {
            AppState.loading = true;
            EventBus.emit('match:loading');
            
            const container = document.getElementById('onesports-match');
            if (!container) {
                throw new Error('CRITICAL ERROR: "#onesports-match" element not found in DOM.');
            }
            
            buildConfig(container);
            
            if (!validateConfig()) {
                throw new Error('CRITICAL ERROR: Configuration validation failed.');
            }
            
            EventBus.emit('config:loaded', MATCH_CONFIG);
        };

        /**
         * Step 2: Data loading phase.
         * Defers to the ApiService to fetch, normalize, and cache data.
         */
        const loadData = async () => {
            const apiSuccess = await window.OneSports.Api.initialize();
            
            if (!apiSuccess) {
                throw new Error('API Service failed to initialize match data.');
            }
            
            AppState.matchLoaded = true;
            EventBus.emit('match:loaded', window.OneSports.Api.getMatch());
        };

        /**
         * Step 3: Post-loading phase.
         * Orchestrates the initialization of all downstream rendering modules.
         */
        const afterLoad = async () => {
            // Initialize all UI rendering modules sequentially
            for (const module of renderQueue) {
                if (module && typeof module.init === 'function') {
                    try {
                        await module.init();
                    } catch (error) {
                        window.OneSports.log('Module initialization error', error, true);
                    }
                }
            }
            
            // Initialize independent background modules
            await Modules.TitleManager.init();
            await Modules.SEO.init();
            await Modules.Ads.init();
        };

        /**
         * Step 4: Finalize phase.
         * Signals that the application is fully loaded and stable.
         */
        const ready = () => {
            AppState.loading = false;
            AppState.ready = true;
            EventBus.emit('app:ready', AppState);
            window.OneSports.log('Application Bootstrapper sequence complete.');
        };

        /**
         * Handles critical failures during the initialization lifecycle.
         * Prevents further execution and leaves the system in a known state.
         */
        const handleError = (error) => {
            AppState.loading = false;
            AppState.error = true;
            EventBus.emit('match:error', error);
            window.OneSports.log('Application Bootstrapper aborted due to error.', error.message, true);
        };

        /**
         * The central execution flow for the entire application.
         */
        const init = async () => {
            try {
                window.OneSports.log('Application Bootstrapper sequence started.');
                beforeLoad();
                await loadData();
                await afterLoad();
                ready();
            } catch (error) {
                handleError(error);
            }
        };

        return {
            init,
            getState: () => Object.freeze({ ...AppState })
        };
    })();

    // Expose globally for potential external access
    window.OneSports.App = AppController;

    // Return the controller init to the main IIFE
    return {
        init: AppController.init
    };

})();

// Wait until the DOM is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', OneSportsMatch.init);
} else {
    OneSportsMatch.init();
}
