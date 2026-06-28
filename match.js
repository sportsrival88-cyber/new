
const CONFIG = {
    DEBUG: false, // Debug Mode configuration flag
    TIMEOUT_MS: 8000,
    MAX_RETRIES: 3,
    INITIAL_BACKOFF_MS: 1000
};

const Logger = {
    log(message, ...args) {
        if (CONFIG.DEBUG) console.log(`[INFO] [${new Date().toISOString()}]`, message, ...args);
    },
    warn(message, ...args) {
        if (CONFIG.DEBUG) console.warn(`[WARN] [${new Date().toISOString()}]`, message, ...args);
    },
    error(message, error, ...args) {
        // Errors are always logged in debug mode, but can be reported globally
        if (CONFIG.DEBUG) console.error(`[ERROR] [${new Date().toISOString()}]`, message, error, ...args);
    },
    time(label) {
        if (CONFIG.DEBUG) console.time(label);
    },
    timeEnd(label) {
        if (CONFIG.DEBUG) console.timeEnd(label);
    }
};

const Security = {
    escapeHTML(str) {
        if (str === null || str === undefined) return "";
        return String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
};

const NetworkStatus = {
    bannerEl: null,
    init() {
        window.addEventListener('online', () => this.handleStatusChange());
        window.addEventListener('offline', () => this.handleStatusChange());
        this.handleStatusChange();
    },
    handleStatusChange() {
        if (!navigator.onLine) {
            this.showOfflineBanner();
        } else {
            this.hideOfflineBanner();
        }
    },
    showOfflineBanner() {
        if (this.bannerEl) return;
        const shell = document.querySelector('.os-match-shell');
        if (!shell) return;

        this.bannerEl = document.createElement('div');
        this.bannerEl.id = 'os-offline-banner';
        this.bannerEl.style.cssText = `
            background: rgba(244, 67, 54, 0.9);
            color: #fff;
            text-align: center;
            padding: 10px;
            font-size: 0.9rem;
            font-weight: 600;
            border-radius: 8px;
            margin-bottom: 15px;
            box-shadow: 0 4px 10px rgba(0,0,0,0.3);
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
            font-family: var(--font-main, sans-serif);
            z-index: 100;
        `;
        this.bannerEl.innerHTML = `<i class="fas fa-exclamation-triangle"></i> Connection lost. Showing the latest available match data.`;
        shell.insertBefore(this.bannerEl, shell.firstChild);
    },
    hideOfflineBanner() {
        if (this.bannerEl) {
            this.bannerEl.remove();
            this.bannerEl = null;
        }
    }
};

const API = {
    inFlightRequests: {},
    async fetchJSON(url, options = {}) {
        if (this.inFlightRequests[url]) return this.inFlightRequests[url];
        const promise = this.fetchWithTimeoutAndRetry(url, options)
            .finally(() => {
                delete this.inFlightRequests[url];
            });
        this.inFlightRequests[url] = promise;
        return promise;
    },
    async fetchWithTimeoutAndRetry(url, options = {}, attempt = 1) {
        const timeout = CONFIG.TIMEOUT_MS;
        let controller = null;
        let signal = null;
        let timeoutId = null;

        const hasAbortController = typeof AbortController !== 'undefined';
        if (hasAbortController) {
            controller = new AbortController();
            signal = controller.signal;
        }

        const fetchPromise = fetch(url, { ...options, signal });
        const timeoutPromise = new Promise((_, reject) => {
            timeoutId = setTimeout(() => {
                if (controller) controller.abort();
                reject(new Error("TimeoutError"));
            }, timeout);
        });

        Logger.time(`API_Request: ${url}`);
        try {
            const response = await Promise.race([fetchPromise, timeoutPromise]);
            clearTimeout(timeoutId);
            Logger.timeEnd(`API_Request: ${url}`);

            if (!response.ok) {
                if (response.status >= 500 && response.status < 600) {
                    throw { type: 'transient', status: response.status, message: `Server Error ${response.status}` };
                } else {
                    throw { type: 'fatal', status: response.status, message: `HTTP Error ${response.status}` };
                }
            }

            let data;
            try {
                data = await response.json();
            } catch (jsonErr) {
                throw { type: 'fatal', message: 'Malformed JSON response' };
            }

            return data;
        } catch (error) {
            clearTimeout(timeoutId);
            Logger.timeEnd(`API_Request: ${url}`);
            Logger.error(`Request failed on attempt ${attempt}: ${url}`, error);

            const isTimeout = error.message === 'TimeoutError' || error.name === 'AbortError';
            const isTransient = error.type === 'transient' || isTimeout || error.message === 'Failed to fetch';

            if (isTransient && attempt < CONFIG.MAX_RETRIES) {
                const delay = CONFIG.INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1);
                Logger.warn(`Retrying request to ${url} in ${delay}ms (Attempt ${attempt + 1}/${CONFIG.MAX_RETRIES})`);
                await new Promise(resolve => setTimeout(resolve, delay));
                return this.fetchWithTimeoutAndRetry(url, options, attempt + 1);
            }

            throw error;
        }
    }
};

const Cache = {
    TTLs: { match: 60 * 1000 },
    async staleWhileRevalidate(key, url, ttlMs, callback) {
        const cachedItem = localStorage.getItem(key);
        let parsedCache = null;
        let isStale = true;
        if (cachedItem) {
            try {
                parsedCache = JSON.parse(cachedItem);
                isStale = (Date.now() - parsedCache.timestamp) > ttlMs;
                callback(parsedCache.data, true);
            } catch (e) {
                Logger.error("Cache parsing error", e);
            }
        }
        if (isStale || !parsedCache) {
            try {
                const freshData = await API.fetchJSON(url);
                if (!parsedCache || JSON.stringify(parsedCache.data) !== JSON.stringify(freshData)) {
                    localStorage.setItem(key, JSON.stringify({ timestamp: Date.now(), data: freshData }));
                    callback(freshData, false);
                }
            } catch (error) {
                Logger.error("Background fetch failed for", key, error);
                if (!parsedCache) callback({ error: true, message: error.message }, false);
            }
        }
    }
};

const Helpers = {
    getLogoUrl(id, version = 1) {
        return `https://imagecache.365scores.com/image/upload/f_png,w_120,h_120,c_limit,q_auto:eco,d_Competitors:default1.png/v${version}/Competitors/${id}`;
    },
    getMatchLiveTime(game) {
        const isLive = game.statusGroup === 2 || game.statusGroup === 3 || game.shortStatusText === 'Live' || game.statusText.includes("Half");
        if (isLive) {
            if (game.gameTime && game.gameTime > 0) {
                return game.addedTime ? `${game.gameTime}+${game.addedTime}'` : `${game.gameTime}'`;
            }
            return `<span style="color: var(--secondary);"><i class="fas fa-circle" style="font-size: 0.6rem; animation: livePulse 1.5s infinite;"></i> LIVE</span>`;
        }
        return Security.escapeHTML(game.statusText) || "Ended";
    },
    formatDate(dateStr) {
        if (!dateStr) return "";
        const d = new Date(dateStr);
        return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    }
};

const MatchEventBus = {
    events: {},
    on(event, listener) {
        if (!this.events[event]) this.events[event] = [];
        this.events[event].push(listener);
    },
    emit(event, data) {
        if (this.events[event]) {
            this.events[event].forEach(listener => listener(data));
        }
    }
};

const MatchStore = {
    metadata: {},
    game: null,
    standings: null,
    h2h: null,
    relatedMatches: null,
    
    updateMetadata(data) {
        this.metadata = data;
        MatchEventBus.emit('metadataUpdated', this.metadata);
    },
    updateGame(data) {
        if (!this.game) {
            this.game = data;
            MatchEventBus.emit('heroUpdated', this.game);
            MatchEventBus.emit('liveScoreUpdated', this.game);
            MatchEventBus.emit('infoUpdated', this.game);
            MatchEventBus.emit('lineupsUpdated', this.game);
            MatchEventBus.emit('statisticsUpdated', this.game);
            MatchEventBus.emit('timelineUpdated', this.game);
            MatchEventBus.emit('recentFormUpdated', this.game);
            return;
        }

        const oldGame = this.game;
        this.game = data;

        const oldScore = JSON.stringify({ h: oldGame.game.homeCompetitor?.score, a: oldGame.game.awayCompetitor?.score, time: oldGame.game.gameTime, status: oldGame.game.statusGroup });
        const newScore = JSON.stringify({ h: data.game.homeCompetitor?.score, a: data.game.awayCompetitor?.score, time: data.game.gameTime, status: data.game.statusGroup });
        if (oldScore !== newScore) {
            MatchEventBus.emit('liveScoreUpdated', this.game);
            MatchEventBus.emit('heroUpdated', this.game);
        }

        if (JSON.stringify(oldGame.game.venue) !== JSON.stringify(data.game.venue) || oldGame.game.startTime !== data.game.startTime) {
            MatchEventBus.emit('infoUpdated', this.game);
        }

        const oldLineups = JSON.stringify(oldGame.game.homeCompetitor?.lineups) + JSON.stringify(oldGame.game.awayCompetitor?.lineups);
        const newLineups = JSON.stringify(data.game.homeCompetitor?.lineups) + JSON.stringify(data.game.awayCompetitor?.lineups);
        if (oldLineups !== newLineups) {
            MatchEventBus.emit('lineupsUpdated', this.game);
        }

        const oldStats = JSON.stringify(oldGame.game.statistics || oldGame.game.homeCompetitor?.statistics);
        const newStats = JSON.stringify(data.game.statistics || data.game.homeCompetitor?.statistics);
        if (oldStats !== newStats) {
            MatchEventBus.emit('statisticsUpdated', this.game);
        }

        const oldEvents = JSON.stringify(oldGame.game.events);
        const newEvents = JSON.stringify(data.game.events);
        if (oldEvents !== newEvents) {
            MatchEventBus.emit('timelineUpdated', this.game);
        }

        const oldForm = JSON.stringify(oldGame.game.homeCompetitor?.recentMatches);
        const newForm = JSON.stringify(data.game.homeCompetitor?.recentMatches);
        if (oldForm !== newForm) {
            MatchEventBus.emit('recentFormUpdated', this.game);
        }
    },
    updateStandings(data) {
        this.standings = data;
        MatchEventBus.emit('standingsUpdated', this.standings);
    },
    updateH2H(data) {
        this.h2h = data;
        MatchEventBus.emit('h2hUpdated', this.h2h);
    },
    updateRelatedMatches(data) {
        this.relatedMatches = data;
        MatchEventBus.emit('relatedMatchesUpdated', this.relatedMatches);
    }
};

const MatchAPI = {
    async fetchMainData() {
        if (!MatchStore.metadata.matchId) return;
        const url = `https://webws.365scores.com/web/game/?appTypeId=5&langId=1&timezoneName=Asia%2FCalcutta&userCountryId=80&gameId=${MatchStore.metadata.matchId}`;
        
        Cache.staleWhileRevalidate(`os_match_${MatchStore.metadata.matchId}`, url, Cache.TTLs.match, (data) => {
            if (data && !data.error && data.game) {
                MatchStore.updateGame(data);
                
                // Fetch secondary endpoints if missing
                if (!data.standings && data.game.hasStandings && data.game.competitionId && !MatchStore.standings) {
                    this.fetchStandings(data.game.competitionId);
                } else if (data.standings && data.standings.length > 0) {
                    MatchStore.updateStandings(data.standings[0]);
                }

                if (!data.previousMeetings && data.game.hasPreviousMeetings && !MatchStore.h2h) {
                    this.fetchH2H(data.game.id);
                } else if (data.previousMeetings) {
                    MatchStore.updateH2H(data.previousMeetings);
                }
            } else {
                MatchEventBus.emit('gameError', true);
            }
        });
    },

    async fetchStandings(compId) {
        const url = `https://webws.365scores.com/web/standings/?appTypeId=5&langId=1&timezoneName=Asia%2FCalcutta&userCountryId=80&competitions=${compId}`;
        try {
            const fetched = await API.fetchJSON(url);
            if (fetched && fetched.standings && fetched.standings.length > 0) {
                MatchStore.updateStandings(fetched.standings[0]);
            } else {
                MatchEventBus.emit('standingsError', true);
            }
        } catch (e) {
            MatchEventBus.emit('standingsError', true);
        }
    },

    async fetchH2H(gameId) {
        const url = `https://webws.365scores.com/web/game/previousmeetings/?appTypeId=5&langId=1&timezoneName=Asia%2FCalcutta&userCountryId=80&gameId=${gameId}`;
        try {
            const fetched = await API.fetchJSON(url);
            if (fetched && fetched.previousMeetings) {
                MatchStore.updateH2H(fetched.previousMeetings);
            } else {
                MatchEventBus.emit('h2hError', true);
            }
        } catch (e) {
            MatchEventBus.emit('h2hError', true);
        }
    },
    
    async fetchRelatedMatches() {
        MatchStore.updateRelatedMatches([]);
    }
};

const MatchScheduler = {
    intervalId: null,
    isPaused: false,
    isFinished: false,
    
    init() {
        document.addEventListener('visibilitychange', () => {
            if (this.isFinished) return;
            if (document.hidden) {
                this.isPaused = true;
                this.stop();
            } else {
                this.isPaused = false;
                this.start();
            }
        });
        window.addEventListener('pagehide', () => this.stop());
        window.addEventListener('beforeunload', () => this.stop());
    },

    start() {
        if (this.isPaused || this.isFinished) return;
        this.stop();
        this.tick();
    },
    
    stop() {
        if (this.intervalId) {
            clearTimeout(this.intervalId);
            this.intervalId = null;
        }
    },
    
    async tick() {
        if (this.isPaused || this.isFinished) return;

        await MatchAPI.fetchMainData();
        const game = MatchStore.game?.game;
        if (!game) {
            this.intervalId = setTimeout(() => this.tick(), 60000);
            return;
        }

        let delay = 300000;
        const status = game.statusGroup;
        if (status === 2) { 
            delay = 300000;
        } else if (status === 3) { 
            if (game.shortStatusText === 'HT') delay = 60000;
            else if (game.shortStatusText === 'ET') delay = 20000;
            else if (game.shortStatusText === 'Pen') delay = 10000;
            else delay = 30000;
        } else if (status === 4) {
            this.isFinished = true;
            this.stop();
            return;
        }

        this.intervalId = setTimeout(() => this.tick(), delay);
    }
};

const MatchObservers = {
    init() {
        const lazyEls = [
            'os-match-timeline',
            'os-match-h2h',
            'os-recent-form',
            'os-group-standings',
            'os-related-matches'
        ];
        
        const hasIntersectionObserver = typeof IntersectionObserver !== 'undefined';
        if (!hasIntersectionObserver) {
            Logger.warn("IntersectionObserver not supported, loading all components immediately.");
            lazyEls.forEach(id => {
                MatchEventBus.emit(`lazyLoad_${id}`, true);
            });
            return;
        }

        const observer = new IntersectionObserver((entries, obs) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const id = entry.target.id;
                    MatchEventBus.emit(`lazyLoad_${id}`, true);
                    obs.unobserve(entry.target);
                }
            });
        }, { rootMargin: "200px" });

        lazyEls.forEach(id => {
            const el = MatchRenderer.elements[id];
            if (el) observer.observe(el);
        });
    }
};

const MatchRenderer = {
    elements: {},
    
    cacheDOM() {
        const ids = [
            'os-match-photo', 'os-hero-banner', 'os-live-score', 'os-live-commentary', 'os-match-info',
            'os-team-cards', 'os-match-lineups', 'os-match-formations', 'os-player-ratings', 'os-match-timeline', 
            'os-match-highlights', 'os-match-events', 'os-match-stats', 'os-broadcast-link', 'os-match-h2h', 
            'os-recent-form', 'os-match-injuries', 'os-social-feed',
            'os-group-standings', 'os-related-matches',
            'os-popular-posts', 'os-footer-cta'
        ];
        ids.forEach(id => {
            this.elements[id] = document.getElementById(id);
        });
    },

    initEvents() {
        MatchEventBus.on('heroUpdated', (data) => {
            try {
                Logger.time("renderHero");
                MatchRenderer.renderHero(data);
                Logger.timeEnd("renderHero");
            } catch(e) {
                Logger.error("renderHero Error", e);
            }
        });
        MatchEventBus.on('liveScoreUpdated', (data) => {
            try {
                Logger.time("renderLiveScore");
                MatchRenderer.renderLiveScore(data);
                Logger.timeEnd("renderLiveScore");
            } catch(e) {
                Logger.error("renderLiveScore Error", e);
            }
        });
        MatchEventBus.on('infoUpdated', (data) => {
            try {
                Logger.time("renderMatchInfo");
                MatchRenderer.renderMatchInfo(data);
                Logger.timeEnd("renderMatchInfo");
            } catch(e) {
                Logger.error("renderMatchInfo Error", e);
            }
        });
        MatchEventBus.on('lineupsUpdated', (data) => {
            try {
                Logger.time("renderLineups");
                MatchRenderer.renderLineups(data);
                Logger.timeEnd("renderLineups");
            } catch(e) {
                Logger.error("renderLineups Error", e);
            }
        });
        MatchEventBus.on('statisticsUpdated', (data) => {
            try {
                Logger.time("renderMatchStats");
                MatchRenderer.renderMatchStats(data);
                Logger.timeEnd("renderMatchStats");
            } catch(e) {
                Logger.error("renderMatchStats Error", e);
            }
        });
        MatchEventBus.on('recentFormUpdated', (data) => {
            try {
                Logger.time("renderMatchRecentForm");
                MatchRenderer.renderMatchRecentForm(data);
                Logger.timeEnd("renderMatchRecentForm");
            } catch(e) {
                Logger.error("renderMatchRecentForm Error", e);
            }
        });

        MatchEventBus.on('gameError', () => {
            MatchRenderer.renderHeroError();
            MatchRenderer.renderLiveScoreError();
            MatchRenderer.renderMatchInfoError();
            MatchRenderer.renderLineupsError();
            MatchRenderer.renderMatchStatsError();
            MatchRenderer.renderMatchRecentFormError();
        });

        MatchEventBus.on('lazyLoad_os-match-timeline', () => {
            MatchRenderer.initMatchTimeline();
            if (MatchStore.game) {
                try {
                    Logger.time("renderMatchTimeline");
                    MatchRenderer.renderMatchTimeline(MatchStore.game);
                    Logger.timeEnd("renderMatchTimeline");
                } catch(e) {
                    Logger.error("Timeline render error", e);
                }
            }
            MatchEventBus.on('timelineUpdated', (data) => {
                try {
                    Logger.time("renderMatchTimeline");
                    MatchRenderer.renderMatchTimeline(data);
                    Logger.timeEnd("renderMatchTimeline");
                } catch(e) {
                    Logger.error("Timeline error", e);
                }
            });
        });

        MatchEventBus.on('lazyLoad_os-group-standings', () => {
            MatchRenderer.initMatchStandings();
            if (MatchStore.standings) {
                try {
                    Logger.time("renderMatchStandings");
                    MatchRenderer.renderMatchStandings(MatchStore.standings);
                    Logger.timeEnd("renderMatchStandings");
                } catch(e) {
                    Logger.error("Standings render error", e);
                }
            }
            MatchEventBus.on('standingsUpdated', (data) => {
                try {
                    Logger.time("renderMatchStandings");
                    MatchRenderer.renderMatchStandings(data);
                    Logger.timeEnd("renderMatchStandings");
                } catch(e) {
                    Logger.error("Standings error", e);
                }
            });
            MatchEventBus.on('standingsError', () => MatchRenderer.renderMatchStandingsError());
        });

        MatchEventBus.on('lazyLoad_os-match-h2h', () => {
            MatchRenderer.initMatchH2H();
            if (MatchStore.h2h) {
                try {
                    Logger.time("renderMatchH2H");
                    MatchRenderer.renderMatchH2H(MatchStore.h2h);
                    Logger.timeEnd("renderMatchH2H");
                } catch(e) {
                    Logger.error("H2H render error", e);
                }
            }
            MatchEventBus.on('h2hUpdated', (data) => {
                try {
                    Logger.time("renderMatchH2H");
                    MatchRenderer.renderMatchH2H(data);
                    Logger.timeEnd("renderMatchH2H");
                } catch(e) {
                    Logger.error("H2H error", e);
                }
            });
            MatchEventBus.on('h2hError', () => MatchRenderer.renderMatchH2HError());
        });

        MatchEventBus.on('lazyLoad_os-related-matches', () => {
            MatchRenderer.initRelatedMatches();
            if (MatchStore.relatedMatches) {
                try {
                    Logger.time("renderRelatedMatches");
                    MatchRenderer.renderRelatedMatches(MatchStore.relatedMatches);
                    Logger.timeEnd("renderRelatedMatches");
                } catch(e) {
                    Logger.error("Related matches render error", e);
                }
            }
            MatchEventBus.on('relatedMatchesUpdated', (data) => {
                try {
                    Logger.time("renderRelatedMatches");
                    MatchRenderer.renderRelatedMatches(data);
                    Logger.timeEnd("renderRelatedMatches");
                } catch(e) {
                    Logger.error("Related error", e);
                }
            });
            MatchAPI.fetchRelatedMatches(); 
        });
    },

    renderHeroError() {
        const container = this.elements['os-hero-banner'];
        if (container) container.innerHTML = `<div style="text-align:center; padding: 40px; color: var(--text-muted); font-family: var(--font-main);">Match data unavailable</div>`;
    },
    renderLiveScoreError() {
        const container = this.elements['os-live-score'];
        if (container) container.innerHTML = `<div style="text-align:center; padding: 20px; color: var(--text-muted); font-family: var(--font-main);">Live score unavailable</div>`;
    },

    renderMatchInfoError() {
        const container = this.elements['os-match-info'];
        if (!container) return;
        container.innerHTML = `<div style="text-align:center; padding: 20px; color: var(--text-muted); font-family: var(--font-main);">Match information unavailable</div>`;
    },

    renderLineupsError() {
        const container = this.elements['os-match-lineups'];
        if (!container) return;
        container.innerHTML = `<div style="text-align:center; padding: 20px; color: var(--text-muted); font-family: var(--font-main);">Unable to load lineups.</div>`;
    },

    renderMatchStatsError() {
        const container = this.elements['os-match-stats'];
        if (!container) return;
        container.innerHTML = `<div style="text-align:center; padding: 20px; color: var(--text-muted); font-family: var(--font-main);">Unable to load match statistics.</div>`;
    },

    initMatchTimeline() {
        const container = this.elements['os-match-timeline'];
        if (!container) return;
        
        container.innerHTML = `
            <div class="os-timeline-container">
                <div class="os-mi-header">Match Timeline</div>
                <div class="os-timeline-wrapper" id="os-timeline-inner">
                    <div style="text-align:center; padding: 20px; color: var(--text-muted); font-family: var(--font-main);">
                        <i class="fas fa-spinner fa-spin"></i> Loading timeline...
                    </div>
                </div>
            </div>
        `;
        
        const eventsContainer = this.elements['os-match-events'];
        if (eventsContainer) {
            eventsContainer.style.display = 'none'; // Optional secondary view
        }
    },
    
    renderMatchTimelineError() {
        const inner = document.getElementById('os-timeline-inner');
        if (!inner) return;
        inner.innerHTML = `<div style="text-align:center; padding: 20px; color: var(--text-muted); font-family: var(--font-main);">Unable to load match events.</div>`;
    },

    getEventIcon(eventName) {
        const n = String(eventName || "").toLowerCase();
        if (n.includes('goal')) return '<i class="fas fa-futbol" style="color:var(--text-main);"></i>';
        if (n.includes('yellow') && n.includes('red')) return '<i class="fas fa-square" style="color: #ff9800;"></i>';
        if (n.includes('yellow')) return '<i class="fas fa-square" style="color: #ffeb3b;"></i>';
        if (n.includes('red')) return '<i class="fas fa-square" style="color: #f44336;"></i>';
        if (n.includes('sub')) return '<i class="fas fa-exchange-alt" style="color: #4caf50;"></i>';
        if (n.includes('var')) return '<i class="fas fa-tv" style="color: var(--primary);"></i>';
        if (n.includes('half') || n.includes('time')) return '<i class="fas fa-stopwatch" style="color: var(--text-muted);"></i>';
        if (n.includes('injury')) return '<i class="fas fa-medkit" style="color: #f44336;"></i>';
        return '<i class="fas fa-info-circle" style="color: var(--text-muted);"></i>';
    },

    renderMatchTimeline(data) {
        const inner = document.getElementById('os-timeline-inner');
        if (!inner) return;

        const game = data.game;
        const events = game.events || [];

        if (events.length === 0) {
            inner.innerHTML = `
                <div style="text-align:center; padding: 20px; color: var(--text-muted); font-family: var(--font-main);">
                    No match events yet.
                </div>
            `;
            return;
        }

        const existingCount = inner.querySelectorAll('.os-tl-row').length;
        if (existingCount === events.length && existingCount > 0) {
            return; // No new events
        }

        let html = '';
        const homeId = game.homeCompetitor.id;
        
        for (let i = existingCount; i < events.length; i++) {
            const ev = events[i];
            const time = ev.gameTime !== undefined ? ev.gameTime : "-";
            const addedTime = ev.addedTime ? `+${ev.addedTime}` : "";
            const displayTime = `${time}'${addedTime}`;
            
            const evName = Security.escapeHTML(ev.eventType ? ev.eventType.name : (ev.type || "Event"));
            const iconHtml = this.getEventIcon(evName);
            
            let playerName = "";
            if (ev.playerId && game.members) {
                const athlete = game.members.find(a => a.id === ev.playerId);
                if (athlete) playerName = Security.escapeHTML(athlete.name);
            } else if (ev.playerName) {
                playerName = Security.escapeHTML(ev.playerName);
            }
            
            let extraName = "";
            if (ev.extraPlayers && ev.extraPlayers.length > 0 && game.members) {
                const extraId = ev.extraPlayers[0];
                const athlete = game.members.find(a => a.id === extraId);
                if (athlete) extraName = `<div class="os-tl-assist">Assist: ${Security.escapeHTML(athlete.name)}</div>`;
            }

            const teamId = ev.competitorId;
            let sideClass = "center";
            let logoUrl = "";
            let teamName = "";
            
            if (teamId === homeId) {
                sideClass = "home";
                logoUrl = Helpers.getLogoUrl(game.homeCompetitor.id, game.homeCompetitor.imageVersion);
                teamName = game.homeCompetitor.name;
            } else if (teamId === game.awayCompetitor.id) {
                sideClass = "away";
                logoUrl = Helpers.getLogoUrl(game.awayCompetitor.id, game.awayCompetitor.imageVersion);
                teamName = game.awayCompetitor.name;
            }

            const scoreHtml = (evName.toLowerCase().includes('goal') && ev.homeScore !== undefined) ? 
                `<div class="os-tl-score">${ev.homeScore} - ${ev.awayScore}</div>` : '';

            let rowContent = '';
            if (sideClass === 'center') {
                rowContent = `
                    <div class="os-tl-center-badge">${displayTime}</div>
                    <div class="os-tl-center-content">
                        ${iconHtml} <span class="os-tl-evt-name">${evName}</span>
                    </div>
                `;
            } else {
                const contentInner = `
                    <div class="os-tl-header">
                        <img src="${logoUrl}" class="os-tl-logo" width="24" height="24" loading="lazy" decoding="async" alt="${teamName}">
                        <span class="os-tl-team">${teamName}</span>
                    </div>
                    <div class="os-tl-title">${iconHtml} <strong>${evName}</strong></div>
                    <div class="os-tl-player">${playerName}</div>
                    ${extraName}
                    ${scoreHtml}
                `;
                
                if (sideClass === 'home') {
                    rowContent = `
                        <div class="os-tl-card home-card animate-in">${contentInner}</div>
                        <div class="os-tl-time-badge">${displayTime}</div>
                        <div class="os-tl-spacer"></div>
                    `;
                } else {
                    rowContent = `
                        <div class="os-tl-spacer"></div>
                        <div class="os-tl-time-badge">${displayTime}</div>
                        <div class="os-tl-card away-card animate-in">${contentInner}</div>
                    `;
                }
            }

            html += `<div class="os-tl-row ${sideClass}">${rowContent}</div>`;
        }

        if (existingCount === 0) {
            inner.innerHTML = `
                <div class="os-tl-line"></div>
                ${html}
            `;
        } else if (html !== '') {
            inner.insertAdjacentHTML('beforeend', html);
        }
    },

    initMatchH2H() {
        const container = this.elements['os-match-h2h'];
        if (!container) return;
        container.innerHTML = `
            <div class="os-h2h-container">
                <div class="os-mi-header">Head to Head</div>
                <div style="text-align:center; padding: 20px; color: var(--text-muted); font-family: var(--font-main);">
                    <i class="fas fa-spinner fa-spin"></i> Loading...
                </div>
            </div>
        `;
    },

    renderMatchH2HError() {
        const container = this.elements['os-match-h2h'];
        if (!container) return;
        container.innerHTML = `<div style="text-align:center; padding: 20px; color: var(--text-muted); font-family: var(--font-main);">Unable to load Head-to-Head information.</div>`;
    },

    renderMatchH2H(data) {
        const container = this.elements['os-match-h2h'];
        if (!container) return;
        
        const game = data.game;
        let h2hData = data.previousMeetings || game.previousMeetings;

        if (!h2hData && game.hasPreviousMeetings) {
            container.innerHTML = `
                <div class="os-mi-header">Head to Head</div>
                <div style="text-align:center; padding: 20px; color: var(--text-muted); font-family: var(--font-main);">
                    <i class="fas fa-spinner fa-spin"></i> Loading...
                </div>
            `;
            const url = `https://webws.365scores.com/web/game/previousmeetings/?appTypeId=5&langId=1&timezoneName=Asia%2FCalcutta&userCountryId=80&gameId=${MatchStore.metadata.matchId}`;
            API.fetchJSON(url).then(fetched => {
                if (fetched && fetched.previousMeetings) {
                    this.buildH2HContent(container, game, fetched.previousMeetings, data.competitions);
                } else {
                    this.renderMatchH2HError();
                }
            }).catch(e => {
                console.error("H2H fetch error", e);
                this.renderMatchH2HError();
            });
        } else if (h2hData) {
            this.buildH2HContent(container, game, h2hData, data.competitions);
        } else {
            container.innerHTML = `
                <div class="os-mi-header">Head to Head</div>
                <div style="text-align:center; padding: 20px; color: var(--text-muted); font-family: var(--font-main);">
                    No previous meetings found.
                </div>
            `;
        }
    },

    buildH2HContent(container, game, h2hData, competitions) {
        if (!h2hData || !Array.isArray(h2hData) || h2hData.length === 0) {
            container.innerHTML = `
                <div class="os-mi-header">Head to Head</div>
                <div style="text-align:center; padding: 20px; color: var(--text-muted); font-family: var(--font-main);">
                    No previous meetings found.
                </div>
            `;
            return;
        }

        const totalMatches = h2hData.length;
        let homeWins = 0;
        let awayWins = 0;
        let draws = 0;

        const homeId = game.homeCompetitor.id;
        const awayId = game.awayCompetitor.id;
        const homeName = Security.escapeHTML(game.homeCompetitor.name);
        const awayName = Security.escapeHTML(game.awayCompetitor.name);

        const recentMatches = h2hData.slice(0, 5);
        let recentHtml = '';

        h2hData.forEach(match => {
            let hScore = -1, aScore = -1;
            let matchHomeId = -1, matchAwayId = -1;
            
            if (match.homeCompetitor) {
                matchHomeId = match.homeCompetitor.id;
                hScore = match.homeCompetitor.score !== undefined ? match.homeCompetitor.score : -1;
            }
            if (match.awayCompetitor) {
                matchAwayId = match.awayCompetitor.id;
                aScore = match.awayCompetitor.score !== undefined ? match.awayCompetitor.score : -1;
            }

            if (hScore !== -1 && aScore !== -1) {
                if (hScore === aScore) {
                    draws++;
                } else if (hScore > aScore) {
                    if (matchHomeId === homeId) homeWins++;
                    else awayWins++;
                } else {
                    if (matchAwayId === homeId) homeWins++;
                    else awayWins++;
                }
            }
        });

        recentMatches.forEach(match => {
            let hScore = match.homeCompetitor?.score !== undefined ? match.homeCompetitor.score : '-';
            let aScore = match.awayCompetitor?.score !== undefined ? match.awayCompetitor.score : '-';
            
            let hName = match.homeCompetitor?.name || "Home";
            let aName = match.awayCompetitor?.name || "Away";

            let hWinnerClass = '';
            let aWinnerClass = '';
            
            if (hScore !== '-' && aScore !== '-') {
                if (hScore > aScore) hWinnerClass = 'winner';
                else if (aScore > hScore) aWinnerClass = 'winner';
            }
            
            let compName = "";
            if (match.competitionId && competitions) {
                const comp = competitions.find(c => c.id === match.competitionId);
                if (comp) compName = comp.name;
            }
            if (!compName && match.competitionDisplayName) compName = match.competitionDisplayName;
            
            const dateStr = match.startTime ? Helpers.formatDate(match.startTime) : "";
            let statusStr = match.shortStatusText || match.statusText || "FT";
            
            recentHtml += `
                <div class="os-h2h-recent-row">
                    <div class="os-h2h-recent-meta">
                        <span class="os-h2h-comp">${compName}</span>
                        <span class="os-h2h-date">${dateStr}</span>
                        <span class="os-h2h-status">${statusStr}</span>
                    </div>
                    <div class="os-h2h-recent-teams">
                        <div class="os-h2h-team home ${hWinnerClass}">${hName}</div>
                        <div class="os-h2h-score">${hScore} - ${aScore}</div>
                        <div class="os-h2h-team away ${aWinnerClass}">${aName}</div>
                    </div>
                </div>
            `;
        });

        let homePct = 0, awayPct = 0, drawPct = 0;
        if (totalMatches > 0) {
            homePct = (homeWins / totalMatches) * 100;
            drawPct = (draws / totalMatches) * 100;
            awayPct = (awayWins / totalMatches) * 100;
        }

        container.innerHTML = `
            <div class="os-h2h-container">
                <div class="os-mi-header">Head to Head</div>
                
                <div class="os-h2h-summary">
                    <div class="os-h2h-total-badge">
                        <span class="os-h2h-total-num">${totalMatches}</span>
                        <span class="os-h2h-total-lbl">Matches</span>
                    </div>
                </div>

                <div class="os-h2h-comparison">
                    <div class="os-h2h-comp-labels">
                        <div class="os-h2h-comp-lbl">
                            <span class="os-h2h-comp-name">${homeName}</span>
                            <span class="os-h2h-comp-val">${homeWins}</span>
                        </div>
                        <div class="os-h2h-comp-lbl center">
                            <span class="os-h2h-comp-name">Draws</span>
                            <span class="os-h2h-comp-val">${draws}</span>
                        </div>
                        <div class="os-h2h-comp-lbl right">
                            <span class="os-h2h-comp-name">${awayName}</span>
                            <span class="os-h2h-comp-val">${awayWins}</span>
                        </div>
                    </div>
                    <div class="os-h2h-comp-bar">
                        <div class="os-h2h-bar-segment home" style="width: ${homePct}%"></div>
                        <div class="os-h2h-bar-segment draw" style="width: ${drawPct}%"></div>
                        <div class="os-h2h-bar-segment away" style="width: ${awayPct}%"></div>
                    </div>
                </div>

                <div class="os-h2h-recent-title">Recent Meetings</div>
                <div class="os-h2h-recent-list">
                    ${recentHtml}
                </div>
            </div>
        `;
    },

    renderMatchRecentFormError() {
        const container = this.elements['os-recent-form'];
        if (!container) return;
        container.innerHTML = `<div style="text-align:center; padding: 20px; color: var(--text-muted); font-family: var(--font-main);">Unable to load recent form.</div>`;
    },

    renderMatchRecentForm(data) {
        const container = this.elements['os-recent-form'];
        if (!container) return;
        
        const game = data.game;
        const hc = game.homeCompetitor;
        const ac = game.awayCompetitor;
        
        let hRecent = hc.recentMatches || [];
        let aRecent = ac.recentMatches || [];
        
        if (!hRecent.length && !aRecent.length) {
            if (data.recentMatches && data.recentMatches.homeCompetitorMatches) {
                hRecent = data.recentMatches.homeCompetitorMatches;
                aRecent = data.recentMatches.awayCompetitorMatches;
            } else if (data.homeCompetitorMatches) {
                hRecent = data.homeCompetitorMatches;
                aRecent = data.awayCompetitorMatches;
            }
        }
        
        const homeData = this.calculateFormStats(hRecent, hc.id, data.competitions);
        const awayData = this.calculateFormStats(aRecent, ac.id, data.competitions);
        
        container.innerHTML = `
            <div class="os-rf-container">
                <div class="os-mi-header">Recent Form</div>
                <div class="os-rf-panels">
                    <div class="os-rf-panel home-panel">
                        <div class="os-rf-panel-header">
                            <img src="${Helpers.getLogoUrl(hc.id, hc.imageVersion)}" alt="${hc.name}" class="os-rf-logo" width="40" height="40" loading="lazy" decoding="async">
                            <span class="os-rf-team-name">${hc.name}</span>
                        </div>
                        <div class="os-rf-rating ${homeData.ratingClass}">${homeData.ratingStr} Form</div>
                        
                        <div class="os-rf-form-badges">
                            ${homeData.badgesHtml}
                        </div>
                        
                        <div class="os-rf-summary-grid">
                            <div class="os-rf-sum-item">
                                <span class="os-rf-sum-val">${homeData.w}</span>
                                <span class="os-rf-sum-lbl">Wins</span>
                            </div>
                            <div class="os-rf-sum-item">
                                <span class="os-rf-sum-val">${homeData.d}</span>
                                <span class="os-rf-sum-lbl">Draws</span>
                            </div>
                            <div class="os-rf-sum-item">
                                <span class="os-rf-sum-val">${homeData.l}</span>
                                <span class="os-rf-sum-lbl">Losses</span>
                            </div>
                            <div class="os-rf-sum-item">
                                <span class="os-rf-sum-val">${homeData.gf}</span>
                                <span class="os-rf-sum-lbl">Goals For</span>
                            </div>
                            <div class="os-rf-sum-item">
                                <span class="os-rf-sum-val">${homeData.ga}</span>
                                <span class="os-rf-sum-lbl">Goals Agst</span>
                            </div>
                            <div class="os-rf-sum-item">
                                <span class="os-rf-sum-val">${homeData.cs}</span>
                                <span class="os-rf-sum-lbl">Clean Sheets</span>
                            </div>
                            <div class="os-rf-sum-item full-width">
                                <span class="os-rf-sum-val">${homeData.avgGoals}</span>
                                <span class="os-rf-sum-lbl">Avg Goals/Match</span>
                            </div>
                        </div>

                        <div class="os-rf-matches-list">
                            ${homeData.matchesHtml}
                        </div>
                    </div>
                    
                    <div class="os-rf-panel away-panel">
                        <div class="os-rf-panel-header">
                            <img src="${Helpers.getLogoUrl(ac.id, ac.imageVersion)}" alt="${ac.name}" class="os-rf-logo" width="40" height="40" loading="lazy" decoding="async">
                            <span class="os-rf-team-name">${ac.name}</span>
                        </div>
                        <div class="os-rf-rating ${awayData.ratingClass}">${awayData.ratingStr} Form</div>
                        
                        <div class="os-rf-form-badges">
                            ${awayData.badgesHtml}
                        </div>
                        
                        <div class="os-rf-summary-grid">
                            <div class="os-rf-sum-item">
                                <span class="os-rf-sum-val">${awayData.w}</span>
                                <span class="os-rf-sum-lbl">Wins</span>
                            </div>
                            <div class="os-rf-sum-item">
                                <span class="os-rf-sum-val">${awayData.d}</span>
                                <span class="os-rf-sum-lbl">Draws</span>
                            </div>
                            <div class="os-rf-sum-item">
                                <span class="os-rf-sum-val">${awayData.l}</span>
                                <span class="os-rf-sum-lbl">Losses</span>
                            </div>
                            <div class="os-rf-sum-item">
                                <span class="os-rf-sum-val">${awayData.gf}</span>
                                <span class="os-rf-sum-lbl">Goals For</span>
                            </div>
                            <div class="os-rf-sum-item">
                                <span class="os-rf-sum-val">${awayData.ga}</span>
                                <span class="os-rf-sum-lbl">Goals Agst</span>
                            </div>
                            <div class="os-rf-sum-item">
                                <span class="os-rf-sum-val">${awayData.cs}</span>
                                <span class="os-rf-sum-lbl">Clean Sheets</span>
                            </div>
                            <div class="os-rf-sum-item full-width">
                                <span class="os-rf-sum-val">${awayData.avgGoals}</span>
                                <span class="os-rf-sum-lbl">Avg Goals/Match</span>
                            </div>
                        </div>

                        <div class="os-rf-matches-list">
                            ${awayData.matchesHtml}
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    calculateFormStats(recentMatches, mainTeamId, competitions) {
        let w = 0, d = 0, l = 0;
        let gf = 0, ga = 0;
        let cs = 0;
        let badgesHtml = '';
        let matchesHtml = '';
        
        let validMatches = 0;
        
        const matches = (recentMatches || []).slice(0, 5);
        
        matches.forEach(match => {
            const isHome = match.homeCompetitor && match.homeCompetitor.id === mainTeamId;
            const mainComp = isHome ? match.homeCompetitor : match.awayCompetitor;
            const oppComp = isHome ? match.awayCompetitor : match.homeCompetitor;
            
            if (!mainComp || !oppComp) return;
            
            const mainScore = mainComp.score !== undefined ? mainComp.score : -1;
            const oppScore = oppComp.score !== undefined ? oppComp.score : -1;
            
            let resultChar = '-';
            let badgeClass = 'none';
            
            if (mainScore !== -1 && oppScore !== -1) {
                validMatches++;
                gf += mainScore;
                ga += oppScore;
                if (oppScore === 0) cs++;
                
                if (mainScore > oppScore) {
                    w++;
                    resultChar = 'W';
                    badgeClass = 'win';
                } else if (mainScore < oppScore) {
                    l++;
                    resultChar = 'L';
                    badgeClass = 'loss';
                } else {
                    d++;
                    resultChar = 'D';
                    badgeClass = 'draw';
                }
            }
            
            badgesHtml += `<span class="os-rf-badge ${badgeClass}">${resultChar}</span>`;
            
            let compName = "";
            if (match.competitionId && competitions) {
                const comp = competitions.find(c => c.id === match.competitionId);
                if (comp) compName = comp.name;
            }
            if (!compName && match.competitionDisplayName) compName = match.competitionDisplayName;
            
            const dateStr = match.startTime ? Helpers.formatDate(match.startTime) : "";
            const oppName = oppComp.name;
            const homeAwayIndicator = isHome ? "(H)" : "(A)";
            const finalScore = mainScore !== -1 ? (isHome ? `${mainScore} - ${oppScore}` : `${oppScore} - ${mainScore}`) : "v";
            
            matchesHtml += `
                <div class="os-rf-match-row">
                    <div class="os-rf-match-meta">
                        <span class="os-rf-comp">${compName}</span>
                        <span class="os-rf-date">${dateStr}</span>
                    </div>
                    <div class="os-rf-match-main">
                        <div class="os-rf-opp">${oppName} <span class="os-rf-ha">${homeAwayIndicator}</span></div>
                        <div class="os-rf-mscore ${badgeClass}">${finalScore}</div>
                    </div>
                </div>
            `;
        });
        
        let avgGoals = "0.00";
        if (validMatches > 0) {
            avgGoals = (gf / validMatches).toFixed(2);
        }
        
        let ratingStr = "Unknown";
        let ratingClass = "none";
        
        if (validMatches > 0) {
            const pts = (w * 3) + (d * 1);
            const maxPts = validMatches * 3;
            const pct = pts / maxPts;
            
            if (pct >= 0.7) {
                ratingStr = "Excellent";
                ratingClass = "excellent";
            } else if (pct >= 0.5) {
                ratingStr = "Good";
                ratingClass = "good";
            } else if (pct >= 0.3) {
                ratingStr = "Average";
                ratingClass = "average";
            } else {
                ratingStr = "Poor";
                ratingClass = "poor";
            }
        }
        
        return {
            w, d, l, gf, ga, cs, avgGoals,
            badgesHtml, matchesHtml,
            ratingStr, ratingClass
        };
    },

    initMatchStandings() {
        const container = this.elements['os-group-standings'];
        if (!container) return;
        
        container.innerHTML = `
            <div class="os-st-container">
                <div class="os-mi-header">Standings</div>
                <div class="os-st-table-wrapper" id="os-st-wrapper">
                    <div style="text-align:center; padding: 20px; color: var(--text-muted); font-family: var(--font-main);">
                        <i class="fas fa-spinner fa-spin"></i> Loading...
                    </div>
                </div>
            </div>
        `;
    },

    renderMatchStandingsError() {
        const container = this.elements['os-group-standings'];
        if (!container) return;
        container.innerHTML = `<div style="text-align:center; padding: 20px; color: var(--text-muted); font-family: var(--font-main);">Standings currently unavailable.</div>`;
    },

    renderMatchStandings(standingsData) {
        const container = this.elements['os-group-standings'];
        if (!container || !MatchStore.game?.game) return;
        
        if (MatchStore.game.game.hasStandings === false) {
            container.style.display = 'none';
            return;
        }

        if (standingsData) {
            this.buildStandingsContent(MatchStore.game.game, standingsData);
        } else {
            this.renderMatchStandingsError();
        }
    },

    buildStandingsContent(game, standingsObj) {
        const container = MatchRenderer.elements['os-group-standings'];
        if (!container) return;

        if (!standingsObj.rows || standingsObj.rows.length === 0) {
            container.style.display = 'none';
            return;
        }

        const homeId = game.homeCompetitor.id;
        const awayId = game.awayCompetitor.id;

        // Find which group each team belongs to
        const homeRow = standingsObj.rows.find(r => r.competitor && r.competitor.id === homeId);
        const awayRow = standingsObj.rows.find(r => r.competitor && r.competitor.id === awayId);

        if (!homeRow && !awayRow) {
            container.style.display = 'none';
            return;
        }

        const homeGroupNum = homeRow ? homeRow.groupNum : null;
        const awayGroupNum = awayRow ? awayRow.groupNum : null;
        const sameGroup = homeGroupNum !== null && homeGroupNum === awayGroupNum;

        const getGroupName = (groupNum) => {
            if (!groupNum || !standingsObj.groups) return '';
            const g = standingsObj.groups.find(g => g.num === groupNum);
            return g ? Security.escapeHTML(g.name) : '';
        };

        const getDestinationColors = () => {
            const destColors = {};
            if (standingsObj.destinations) {
                standingsObj.destinations.forEach(d => { destColors[d.num] = d.color; });
            }
            return destColors;
        };
        const destColors = getDestinationColors();

        const buildGroupTable = (groupNum, highlightIds) => {
            const groupRows = standingsObj.rows
                .filter(r => r.groupNum === groupNum)
                .sort((a, b) => a.position - b.position);
            const groupName = getGroupName(groupNum);

            let rowsHtml = '';
            groupRows.forEach(row => {
                const comp = row.competitor;
                const isHighlight = highlightIds.includes(comp.id) ? 'highlight' : '';

                const borderColor = row.destinationNum && destColors[row.destinationNum]
                    ? destColors[row.destinationNum]
                    : 'transparent';

                let formHtml = '';
                if (row.recentForm && row.recentForm.length > 0) {
                    row.recentForm.slice(-5).forEach(f => {
                        let fClass = 'loss', fChar = 'L';
                        if (f === 1) { fClass = 'win'; fChar = 'W'; }
                        else if (f === 2) { fClass = 'draw'; fChar = 'D'; }
                        formHtml += `<span class="os-st-form-badge ${fClass}">${fChar}</span>`;
                    });
                }

                rowsHtml += `
                    <div class="os-st-row ${isHighlight}" id="os-st-row-${comp.id}" data-pos="${row.position}" style="border-left: 4px solid ${borderColor};">
                        <div class="os-st-col pos" data-field="pos">${row.position}</div>
                        <div class="os-st-col team">
                            <img src="${Helpers.getLogoUrl(comp.id, comp.imageVersion)}" alt="${Security.escapeHTML(comp.name)}" class="os-st-logo" width="24" height="24" loading="lazy" decoding="async">
                            <span class="os-st-team-name">${Security.escapeHTML(comp.name)}</span>
                        </div>
                        <div class="os-st-col" data-field="played">${row.gamePlayed}</div>
                        <div class="os-st-col hide-mobile" data-field="won">${row.gamesWon}</div>
                        <div class="os-st-col hide-mobile" data-field="drawn">${row.gamesEven}</div>
                        <div class="os-st-col hide-mobile" data-field="lost">${row.gamesLost}</div>
                        <div class="os-st-col hide-mobile" data-field="goals">${row.for}:${row.against}</div>
                        <div class="os-st-col" data-field="gd">${row.ratio > 0 ? '+' : ''}${row.ratio}</div>
                        <div class="os-st-col pts" data-field="pts">${row.points}</div>
                        <div class="os-st-col form hide-mobile">${formHtml}</div>
                    </div>
                `;
            });

            return `
                <div class="os-st-group-block">
                    <div class="os-st-group-header">
                        <span class="os-st-group-title">${groupName}</span>
                    </div>
                    <div class="os-st-table">
                        <div class="os-st-header-row">
                            <div class="os-st-col pos">Pos</div>
                            <div class="os-st-col team">Country</div>
                            <div class="os-st-col">P</div>
                            <div class="os-st-col hide-mobile">W</div>
                            <div class="os-st-col hide-mobile">D</div>
                            <div class="os-st-col hide-mobile">L</div>
                            <div class="os-st-col hide-mobile">Goals</div>
                            <div class="os-st-col">GD</div>
                            <div class="os-st-col pts">Pts</div>
                            <div class="os-st-col form hide-mobile">Form</div>
                        </div>
                        <div class="os-st-body">
                            ${rowsHtml}
                        </div>
                    </div>
                </div>
            `;
        };

        let innerHtml = '';
        if (sameGroup) {
            // Same group: show one table with both highlighted
            innerHtml = `<div class="os-st-tables-stack">${buildGroupTable(homeGroupNum, [homeId, awayId])}</div>`;
        } else {
            // Different groups: show two tables side-by-side
            const homeTableHtml = homeGroupNum ? buildGroupTable(homeGroupNum, [homeId]) : '';
            const awayTableHtml = awayGroupNum ? buildGroupTable(awayGroupNum, [awayId]) : '';
            innerHtml = `
                <div class="os-st-tables-stack">
                    ${homeTableHtml}
                    ${awayTableHtml}
                </div>
            `;
        }

        const displayName = Security.escapeHTML(standingsObj.displayName || standingsObj.name || 'Group Standings');
        container.innerHTML = `
            <div class="os-st-container">
                <div class="os-mi-header">${displayName}</div>
                ${innerHtml}
            </div>
        `;
    },

        initRelatedMatches() {
        const container = this.elements['os-related-matches'];
        if (!container) return;
        
        let skeletonHtml = '';
        for(let i=0; i<3; i++) {
            skeletonHtml += `
                <div class="os-rm-card skeleton">
                    <div class="os-rm-card-hero"></div>
                    <div class="os-rm-card-content">
                        <div class="os-rm-card-comp"></div>
                        <div class="os-rm-card-title"></div>
                        <div class="os-rm-card-teams">
                            <div class="os-rm-card-team"></div>
                            <div class="os-rm-card-team"></div>
                        </div>
                        <div class="os-rm-card-meta"></div>
                        <div class="os-rm-card-btn"></div>
                    </div>
                </div>
            `;
        }

        container.innerHTML = `
            <div class="os-rm-container">
                <div class="os-mi-header">Related Matches</div>
                <div class="os-rm-grid" id="os-rm-grid">
                    ${skeletonHtml}
                </div>
            </div>
        `;
    },

    async fetchRelatedMatches(gameData) {
        // Future logic for Blogger Feed API integration matching competition/date
        // We will cache this request via API helper when fully implemented
        return [];
    },

    renderRelatedMatches(matches) {
        const container = this.elements['os-related-matches'];
        const grid = document.getElementById('os-rm-grid');
        if (!container || !grid) return;

        if (!matches || matches.length === 0) {
            grid.innerHTML = `<div style="grid-column: 1 / -1; text-align:center; padding: 40px 20px; color: var(--text-muted); font-family: var(--font-main);">No related matches available.</div>`;
            return;
        }

        let html = '';
        grid.innerHTML = html;
    },

    renderSocialFeed() {
        const container = this.elements['os-social-feed'];
        if (!container) return;

        const tg = MatchStore.metadata.socials.telegram;
        const wa = MatchStore.metadata.socials.whatsapp;

        const tgBtn = tg ? `<a href="${tg}" target="_blank" class="os-sf-btn tg-btn">Join Telegram</a>` 
                         : `<button class="os-sf-btn disabled" disabled>Coming Soon</button>`;

        const waBtn = wa ? `<a href="${wa}" target="_blank" class="os-sf-btn wa-btn">Join WhatsApp</a>` 
                         : `<button class="os-sf-btn disabled" disabled>Coming Soon</button>`;

        container.innerHTML = `
            <div class="os-sf-container">
                <div class="os-mi-header">Join Our Community</div>
                <div class="os-sf-grid">
                    <div class="os-sf-card tg-card">
                        <div class="os-sf-icon-wrap tg-icon">
                            <i class="fab fa-telegram-plane"></i>
                        </div>
                        <div class="os-sf-content">
                            <div class="os-sf-title">Official Telegram Channel</div>
                            <div class="os-sf-desc">Get live match updates, breaking football news, fixtures and alerts.</div>
                            <div class="os-sf-action">${tgBtn}</div>
                        </div>
                    </div>

                    <div class="os-sf-card wa-card">
                        <div class="os-sf-icon-wrap wa-icon">
                            <i class="fab fa-whatsapp"></i>
                        </div>
                        <div class="os-sf-content">
                            <div class="os-sf-title">Official WhatsApp Channel</div>
                            <div class="os-sf-desc">Receive instant match notifications and important updates directly on WhatsApp.</div>
                            <div class="os-sf-action">${waBtn}</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    initMatchStats() {
        const container = this.elements['os-match-stats'];
        if (!container) return;

        let statsHtml = '';
        this.supportedStats.forEach((statName, index) => {
            const isPct = statName.includes("Possession") || statName.includes("Accuracy");
            const defaultVal = isPct ? "0%" : "0";
            
            statsHtml += `
                <div class="os-stat-row" data-stat-id="${index}">
                    <div class="os-stat-labels">
                        <span class="os-stat-val home" data-side="home">${defaultVal}</span>
                        <span class="os-stat-name">${statName}</span>
                        <span class="os-stat-val away" data-side="away">${defaultVal}</span>
                    </div>
                    <div class="os-stat-bar-container">
                        <div class="os-stat-bar home" data-side="home" style="width: 0%"></div>
                        <div class="os-stat-bar away" data-side="away" style="width: 0%"></div>
                    </div>
                </div>
            `;
        });

        container.innerHTML = `
            <div class="os-stats-container">
                <div class="os-mi-header">Match Statistics</div>
                <div class="os-stats-wrapper">
                    ${statsHtml}
                </div>
            </div>
        `;
    },

    animateNumber(el, targetStr, duration) {
        const targetNum = parseFloat(String(targetStr).replace('%', ''));
        if (isNaN(targetNum)) {
            el.innerText = targetStr;
            return;
        }
        const isPct = String(targetStr).includes('%');
        const isFloat = String(targetStr).includes('.');
        const startTime = performance.now();
        
        const update = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const easeProgress = 1 - Math.pow(1 - progress, 3);
            
            let currentNum = targetNum * easeProgress;
            if (!isFloat) currentNum = Math.round(currentNum);
            else currentNum = currentNum.toFixed(1);
            
            el.innerText = currentNum + (isPct ? '%' : '');
            
            if (progress < 1) {
                requestAnimationFrame(update);
            } else {
                el.innerText = targetStr;
            }
        };
        requestAnimationFrame(update);
    },

    renderMatchStats(data) {
        const container = this.elements['os-match-stats'];
        if (!container) return;

        const game = data.game;
        
        let homeStats = [];
        let awayStats = [];
        
        if (game.statistics && Array.isArray(game.statistics)) {
            // Handled via loop below
        } else {
            homeStats = game.homeCompetitor.statistics || game.homeCompetitor.stats || [];
            awayStats = game.awayCompetitor.statistics || game.awayCompetitor.stats || [];
        }
        
        const statsMap = new Map();
        
        if (game.statistics && Array.isArray(game.statistics) && game.statistics[0] && game.statistics[0].homeValue !== undefined) {
            game.statistics.forEach(s => {
                statsMap.set(s.name.toLowerCase(), { home: s.homeValue, away: s.awayValue });
            });
        } else {
            homeStats.forEach(s => statsMap.set(s.name.toLowerCase(), { home: s.value, away: 0 }));
            awayStats.forEach(s => {
                const key = s.name.toLowerCase();
                if (statsMap.has(key)) {
                    statsMap.get(key).away = s.value;
                } else {
                    statsMap.set(key, { home: 0, away: s.value });
                }
            });
        }
        
        this.supportedStats.forEach((statName, index) => {
            const row = container.querySelector(`.os-stat-row[data-stat-id="${index}"]`);
            if (!row) return;

            const lookupName = statName.toLowerCase();
            let matchedStat = statsMap.get(lookupName);
            
            if (!matchedStat) {
                for (let [key, val] of statsMap.entries()) {
                    if (key.includes(lookupName) || lookupName.includes(key) || (key.includes("xg") && lookupName.includes("xg"))) {
                        matchedStat = val;
                        break;
                    }
                }
            }

            const isPct = statName.includes("Possession") || statName.includes("Accuracy");
            
            let hValStr = matchedStat ? String(matchedStat.home) : (isPct ? "0%" : "0");
            let aValStr = matchedStat ? String(matchedStat.away) : (isPct ? "0%" : "0");
            
            if (isPct && !hValStr.includes('%')) hValStr += "%";
            if (isPct && !aValStr.includes('%')) aValStr += "%";
            
            let hNum = parseFloat(hValStr.replace('%', '')) || 0;
            let aNum = parseFloat(aValStr.replace('%', '')) || 0;
            
            let total = hNum + aNum;
            let hPct = 0;
            let aPct = 0;
            if (total > 0) {
                hPct = (hNum / total) * 100;
                aPct = (aNum / total) * 100;
            }

            const hValEl = row.querySelector('.os-stat-val.home');
            const aValEl = row.querySelector('.os-stat-val.away');
            const hBarEl = row.querySelector('.os-stat-bar.home');
            const aBarEl = row.querySelector('.os-stat-bar.away');

            if (hValEl && aValEl && hBarEl && aBarEl) {
                hValEl.classList.remove('os-stat-winner');
                aValEl.classList.remove('os-stat-winner');
                if (hNum > aNum) hValEl.classList.add('os-stat-winner');
                if (aNum > hNum) aValEl.classList.add('os-stat-winner');

                hBarEl.style.width = `${hPct}%`;
                aBarEl.style.width = `${aPct}%`;

                this.animateNumber(hValEl, hValStr, 500);
                this.animateNumber(aValEl, aValStr, 500);
            }
        });
    },

    buildTeamLineupHTML(teamName, teamLogo, lineup, athletes) {
        teamName = Security.escapeHTML(teamName);
        if (!lineup || !lineup.members || lineup.members.length === 0) {
            return `
                <div class="os-lu-team-col">
                    <div class="os-lu-team-head">
                        <img src="${teamLogo}" class="os-lu-team-logo" width="60" height="60" loading="lazy" decoding="async" alt="${teamName}">
                        <span class="os-lu-team-name">${teamName}</span>
                    </div>
                    <div class="os-lu-empty">Lineup pending...</div>
                </div>
            `;
        }

        let starters = [], subs = [], coach = "Not announced";
        let formation = lineup.formation ? lineup.formation : "";

        lineup.members.forEach(member => {
            const athlete = athletes ? athletes.find(a => a.id === member.id) : null;
            const name = Security.escapeHTML(athlete ? athlete.name : (member.name || "Unknown"));
            const num = Security.escapeHTML(athlete && athlete.jerseyNum ? athlete.jerseyNum : (member.jerseyNumber || "-"));
            const pos = Security.escapeHTML(member.position ? member.position.name : "");
            
            // Look for captaincy in member or athlete object
            const isCap = member.statusText === "Captain" || (athlete && athlete.isCaptain) ? `<span class="os-lu-cap">C</span>` : "";

            const row = `
                <div class="os-lu-row">
                    <div class="os-lu-num">${num}</div>
                    <div class="os-lu-player">
                        <div class="os-lu-pname">${name} ${isCap}</div>
                        <div class="os-lu-ppos">${pos}</div>
                    </div>
                </div>
            `;

            if (member.status === 1) starters.push(row);
            else if (member.status === 2) subs.push(row);
            else if (member.status === 4) coach = name;
        });

        return `
            <div class="os-lu-team-col">
                <div class="os-lu-team-head">
                    <img src="${teamLogo}" class="os-lu-team-logo" width="60" height="60" loading="lazy" decoding="async" alt="${teamName}">
                    <div class="os-lu-team-name">${teamName}</div>
                    ${formation ? `<div class="os-lu-formation">${formation}</div>` : ''}
                </div>
                
                <div class="os-lu-section">
                    <div class="os-lu-sect-title">Starting XI</div>
                    <div class="os-lu-list">${starters.join('')}</div>
                </div>
                
                <div class="os-lu-section">
                    <div class="os-lu-sect-title">Substitutes</div>
                    <div class="os-lu-list">${subs.join('')}</div>
                </div>
                
                <div class="os-lu-coach">
                    <span class="os-lu-coach-lbl">Coach:</span> ${coach}
                </div>
            </div>
        `;
    },

    renderLineups(data) {
        const container = this.elements['os-match-lineups'];
        if (!container) return;

        const game = data.game;
        const homeCompetitor = game.homeCompetitor;
        const awayCompetitor = game.awayCompetitor;
        
        const hasHomeLineup = homeCompetitor.lineups && homeCompetitor.lineups.members && homeCompetitor.lineups.members.length > 0;
        const hasAwayLineup = awayCompetitor.lineups && awayCompetitor.lineups.members && awayCompetitor.lineups.members.length > 0;

        if (!hasHomeLineup && !hasAwayLineup) {
            container.innerHTML = `
                <div class="os-mi-header">Match Lineups</div>
                <div style="text-align:center; padding: 20px; color: var(--text-muted); font-family: var(--font-main);">
                    Official lineups have not been released yet.
                </div>
            `;
            return;
        }

        const homeHtml = this.buildTeamLineupHTML(
            homeCompetitor.name,
            Helpers.getLogoUrl(homeCompetitor.id, homeCompetitor.imageVersion),
            homeCompetitor.lineups,
            game.members
        );

        const awayHtml = this.buildTeamLineupHTML(
            awayCompetitor.name,
            Helpers.getLogoUrl(awayCompetitor.id, awayCompetitor.imageVersion),
            awayCompetitor.lineups,
            game.members
        );

        const frag = document.createRange().createContextualFragment(`
            <div class="os-lu-container">
                <div class="os-mi-header">Match Lineups</div>
                <div class="os-lu-grid">
                    ${homeHtml}
                    ${awayHtml}
                </div>
            </div>
        `);
        container.innerHTML = '';
        container.appendChild(frag);
    },

    renderMatchInfo(data) {
        const container = this.elements['os-match-info'];
        if (!container) return;

        const game = data.game;
        
        // Competition
        const comp = data.competitions ? data.competitions.find(c => c.id === game.competitionId) : null;
        const compName = Security.escapeHTML(comp ? comp.name : (MatchStore.metadata.competition || "Match"));
        const stageName = Security.escapeHTML(game.roundName && game.roundName !== "Round" ? game.roundName : (game.stageName && game.stageName !== "Group Stage" ? game.stageName : (MatchStore.metadata.stage || "N/A")));
        const season = Security.escapeHTML(game.seasonNum || (comp ? comp.currentSeasonNum : "N/A") || "N/A");

        // Schedule
        const matchDate = game.startTime ? new Date(game.startTime).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : "N/A";
        const kickoffTime = game.startTime ? new Date(game.startTime).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : "N/A";
        const status = Helpers.getMatchLiveTime(game);

        // Venue
        const stadium = Security.escapeHTML(game.venue ? game.venue.name : (MatchStore.metadata.venue || "N/A"));
        const city = Security.escapeHTML(game.venue && game.venue.city ? game.venue.city : "N/A");
        const country = Security.escapeHTML(game.venue && game.venue.country ? game.venue.country : "N/A");

        // Officials
        let refName = "Not Available", ast1 = "Not Available", ast2 = "Not Available", varRef = "Not Available";
        if (game.officials && game.officials.length > 0) {
            const mainRef = game.officials.find(o => o.roleId === 1 || o.type === 1);
            if (mainRef) refName = Security.escapeHTML(mainRef.name);
            
            const assistants = game.officials.filter(o => o.roleId === 2 || o.type === 2);
            if (assistants.length > 0) ast1 = Security.escapeHTML(assistants[0].name);
            if (assistants.length > 1) ast2 = Security.escapeHTML(assistants[1].name);
            
            const varObj = game.officials.find(o => o.roleId === 4 || o.type === 4 || (o.name && o.name.includes("VAR")));
            if (varObj) varRef = Security.escapeHTML(varObj.name);
        } else if (game.referee) {
            refName = Security.escapeHTML(game.referee.name || game.referee);
        }

        // Metadata
        const matchId = game.id || MatchStore.metadata.matchId;
        const attendance = game.attendance ? game.attendance.toLocaleString() : "Not Available";

        container.innerHTML = `
            <div class="os-mi-container">
                <div class="os-mi-header">Match Information</div>
                <div class="os-mi-grid">
                    
                    <div class="os-mi-section">
                        <div class="os-mi-title"><i class="fas fa-trophy"></i> Competition</div>
                        <div class="os-mi-row"><span class="os-mi-label">Name:</span> <span class="os-mi-val">${compName}</span></div>
                        <div class="os-mi-row"><span class="os-mi-label">Stage:</span> <span class="os-mi-val">${stageName}</span></div>
                        <div class="os-mi-row"><span class="os-mi-label">Season:</span> <span class="os-mi-val">${season}</span></div>
                    </div>

                    <div class="os-mi-section">
                        <div class="os-mi-title"><i class="far fa-calendar-alt"></i> Schedule</div>
                        <div class="os-mi-row"><span class="os-mi-label">Date:</span> <span class="os-mi-val">${matchDate}</span></div>
                        <div class="os-mi-row"><span class="os-mi-label">Kickoff:</span> <span class="os-mi-val">${kickoffTime}</span></div>
                        <div class="os-mi-row"><span class="os-mi-label">Status:</span> <span class="os-mi-val">${status}</span></div>
                    </div>

                    <div class="os-mi-section">
                        <div class="os-mi-title"><i class="fas fa-map-marker-alt"></i> Venue</div>
                        <div class="os-mi-row"><span class="os-mi-label">Stadium:</span> <span class="os-mi-val">${stadium}</span></div>
                        <div class="os-mi-row"><span class="os-mi-label">City:</span> <span class="os-mi-val">${city}</span></div>
                        <div class="os-mi-row"><span class="os-mi-label">Country:</span> <span class="os-mi-val">${country}</span></div>
                    </div>

                    <div class="os-mi-section">
                        <div class="os-mi-title"><i class="fas fa-users"></i> Officials</div>
                        <div class="os-mi-row"><span class="os-mi-label">Referee:</span> <span class="os-mi-val">${refName}</span></div>
                        <div class="os-mi-row"><span class="os-mi-label">Assistants:</span> <span class="os-mi-val">${ast1}, ${ast2}</span></div>
                        <div class="os-mi-row"><span class="os-mi-label">VAR:</span> <span class="os-mi-val">${varRef}</span></div>
                    </div>

                    <div class="os-mi-section full-width">
                        <div class="os-mi-title"><i class="fas fa-info-circle"></i> Match Metadata</div>
                        <div class="os-mi-row-inline">
                            <span class="os-mi-badge">ID: ${matchId}</span>
                            <span class="os-mi-badge">Attendance: ${attendance}</span>
                        </div>
                    </div>

                </div>
            </div>
        `;
    },

    renderLiveScoreError() {
        const container = this.elements['os-live-score'];
        if (!container) return;
        container.innerHTML = `<div style="text-align:center; padding: 20px; color: var(--text-muted); font-family: var(--font-main);">Live score unavailable</div>`;
    },

    renderLiveScore(data) {
        const container = this.elements['os-live-score'];
        if (!container) return;

        const game = data.game;
        const homeName = game.homeCompetitor.name;
        const awayName = game.awayCompetitor.name;
        
        let homeScore = game.homeCompetitor.score >= 0 ? game.homeCompetitor.score : "-";
        let awayScore = game.awayCompetitor.score >= 0 ? game.awayCompetitor.score : "-";
        
        const homePen = game.homeCompetitor.penaltiesScore;
        const awayPen = game.awayCompetitor.penaltiesScore;
        const penHtml = (homePen !== undefined && awayPen !== undefined && homePen >= 0 && awayPen >= 0) 
            ? `<div class="os-ls-pens">(Pens: ${homePen}-${awayPen})</div>` 
            : '';

        const statusText = Helpers.getMatchLiveTime(game);
        
        container.innerHTML = `
            <div class="os-ls-container">
                <div class="os-ls-header">
                    <span class="os-ls-status">${statusText}</span>
                </div>
                <div class="os-ls-teams">
                    <div class="os-ls-team home">
                        <img src="${Helpers.getLogoUrl(game.homeCompetitor.id, game.homeCompetitor.imageVersion)}" alt="${homeName}" class="os-ls-logo" width="60" height="60" loading="lazy" decoding="async">
                        <span class="os-ls-name">${homeName}</span>
                    </div>
                    <div class="os-ls-score-box">
                        <div class="os-ls-score">${homeScore} - ${awayScore}</div>
                        ${penHtml}
                    </div>
                    <div class="os-ls-team away">
                        <img src="${Helpers.getLogoUrl(game.awayCompetitor.id, game.awayCompetitor.imageVersion)}" alt="${awayName}" class="os-ls-logo" width="60" height="60" loading="lazy" decoding="async">
                        <span class="os-ls-name">${awayName}</span>
                    </div>
                </div>
            </div>
        `;
    },

    renderHeroError() {
        const container = this.elements['os-hero-banner'];
        if (!container) return;
        container.innerHTML = `<div style="text-align:center; color: var(--text-muted); font-family: var(--font-main);">Match information unavailable</div>`;
    },

    renderHero(data) {
        const container = this.elements['os-hero-banner'];
        if (!container) return;
        
        const game = data.game;
        
        // Use CMS metadata if API is missing fields
        const comp = data.competitions ? data.competitions.find(c => c.id === game.competitionId) : null;
        const compName = Security.escapeHTML(comp ? comp.name : (MatchStore.metadata.competition || "Match"));
        const stageName = Security.escapeHTML(game.roundName && game.roundName !== "Round" ? game.roundName : (game.stageName && game.stageName !== "Group Stage" ? game.stageName : (MatchStore.metadata.stage || "")));
        
        const venueName = Security.escapeHTML(game.venue ? game.venue.name : (MatchStore.metadata.venue || "Stadium"));
        
        const homeScore = game.homeCompetitor.score >= 0 ? game.homeCompetitor.score : "-";
        const awayScore = game.awayCompetitor.score >= 0 ? game.awayCompetitor.score : "-";
        const statusText = Helpers.getMatchLiveTime(game);
        
        const bgImg = MatchStore.metadata.heroImage || "https://imagecache.365scores.com/image/upload/f_png,w_800,h_400,c_fill,q_auto:eco/v1/Backgrounds/1";

        container.style.backgroundImage = `linear-gradient(to bottom, rgba(11,17,24,0.6) 0%, rgba(11,17,24,0.95) 100%), url('${bgImg}')`;
        container.style.backgroundSize = 'cover';
        container.style.backgroundPosition = 'center';
        
        container.innerHTML = `
            <div class="os-hero-content">
                <div class="os-hero-meta">
                    <span class="os-hero-comp">${compName} ${stageName ? '• ' + stageName : ''}</span>
                    <span class="os-hero-venue"><i class="fas fa-map-marker-alt"></i> ${venueName}</span>
                </div>
                
                <div class="os-hero-matchup">
                    <div class="os-hero-team home">
                        <img src="${Helpers.getLogoUrl(game.homeCompetitor.id, game.homeCompetitor.imageVersion)}" alt="${Security.escapeHTML(game.homeCompetitor.name)}" class="os-hero-logo" width="120" height="120" fetchpriority="high" decoding="sync">
                        <span class="os-hero-team-name">${Security.escapeHTML(game.homeCompetitor.name)}</span>
                    </div>
                    
                    <div class="os-hero-score-center">
                        <div class="os-hero-score">${homeScore} - ${awayScore}</div>
                        <div class="os-hero-status">${statusText}</div>
                        <div class="os-hero-kickoff">${Helpers.formatDate(game.startTime)}</div>
                    </div>
                    
                    <div class="os-hero-team away">
                        <img src="${Helpers.getLogoUrl(game.awayCompetitor.id, game.awayCompetitor.imageVersion)}" alt="${Security.escapeHTML(game.awayCompetitor.name)}" class="os-hero-logo" width="120" height="120" fetchpriority="high" decoding="sync">
                        <span class="os-hero-team-name">${Security.escapeHTML(game.awayCompetitor.name)}</span>
                    </div>
                </div>
            </div>
        `;
    },

    renderMatchPhoto() {
        const container = this.elements['os-match-photo'];
        if (!container) return;
        
        const photoUrl = MatchStore.metadata.matchPhoto;
        if (photoUrl && photoUrl.trim() !== '') {
            container.innerHTML = `<img src="${Security.escapeHTML(photoUrl)}" class="os-match-photo-img" alt="Match Poster" decoding="async" fetchpriority="high">`;
            container.style.display = 'block';
        } else {
            container.style.display = 'none';
        }
    },

    renderBroadcastLink() {
        const container = this.elements['os-broadcast-link'];
        if (!container) return;

        const url = MatchStore.metadata.broadcastUrl;
        
        let contentHtml = '';
        
        if (url && url.trim() !== '') {
            contentHtml = `
                <div class="os-bl-info">
                    <h3 class="os-bl-title">Broadcast Link</h3>
                    <p class="os-bl-desc">Watch the live match broadcast using the official broadcast page below.</p>
                </div>
                <div class="os-bl-action">
                    <a href="${url}" target="_blank" rel="noopener noreferrer" class="os-btn os-btn-primary">Click Here</a>
                </div>
            `;
        } else {
            contentHtml = `
                <div class="os-bl-info">
                    <h3 class="os-bl-title">Broadcast Link</h3>
                    <p class="os-bl-desc">Broadcast link not available.</p>
                </div>
                <div class="os-bl-action">
                    <button class="os-btn os-btn-disabled" disabled>Click Here</button>
                </div>
            `;
        }
        
        container.innerHTML = `
            <div class="os-bl-container">
                ${contentHtml}
            </div>
        `;
    }

};


const MatchSEOController = {
    isInitialized: false,

    init() {
        MatchEventBus.on('heroUpdated', (gameData) => {
            if (!this.isInitialized) {
                this.injectSEO(gameData);
                this.isInitialized = true;
            }
        });
        
        MatchEventBus.on('infoUpdated', (gameData) => {
            if (this.isInitialized) {
                this.injectSEO(gameData);
            }
        });
    },

    injectSEO(data) {
        const game = data.game;
        if (!game) return;

        const homeName = game.homeCompetitor.name;
        const awayName = game.awayCompetitor.name;
        const compName = game.competitionDisplayName || game.competitionName;
        const heroImageUrl = Helpers.getLogoUrl(game.homeCompetitor.id, game.homeCompetitor.imageVersion);

        const title = `${homeName} vs ${awayName} Live Stream | ${compName} | OneSports`;
        const description = `Watch ${homeName} vs ${awayName} live, including live score, lineups, match statistics, standings, head-to-head, and latest updates on OneSports.`;
        const canonicalUrl = window.location.origin + window.location.pathname;

        this.updateMetaTag('title', '', title, true);
        this.updateMetaTag('description', 'name', description);
        this.updateMetaTag('robots', 'name', 'index, follow, max-image-preview:large');
        
        let linkCanonical = document.querySelector('link[rel="canonical"]');
        if (!linkCanonical) {
            linkCanonical = document.createElement('link');
            linkCanonical.rel = 'canonical';
            document.head.appendChild(linkCanonical);
        }
        linkCanonical.href = canonicalUrl;

        // Open Graph
        this.updateMetaTag('og:title', 'property', title);
        this.updateMetaTag('og:description', 'property', description);
        this.updateMetaTag('og:image', 'property', heroImageUrl);
        this.updateMetaTag('og:url', 'property', canonicalUrl);
        this.updateMetaTag('og:type', 'property', 'article');

        // Twitter Card
        this.updateMetaTag('twitter:card', 'name', 'summary_large_image');
        this.updateMetaTag('twitter:title', 'name', title);
        this.updateMetaTag('twitter:description', 'name', description);
        this.updateMetaTag('twitter:image', 'name', heroImageUrl);

        this.injectJSONLD(game, title, description, canonicalUrl, heroImageUrl);
    },

    updateMetaTag(attrValue, attrName, content, isTitle = false) {
        if (isTitle) {
            document.title = content;
            return;
        }
        let el = document.querySelector(`meta[${attrName}="${attrValue}"]`);
        if (!el) {
            el = document.createElement('meta');
            el.setAttribute(attrName, attrValue);
            document.head.appendChild(el);
        }
        el.setAttribute('content', content);
    },

    injectJSONLD(game, title, description, url, imageUrl) {
        const homeName = game.homeCompetitor.name;
        const awayName = game.awayCompetitor.name;
        const compName = game.competitionDisplayName || game.competitionName;
        
        let statusUrl = "https://schema.org/EventScheduled";
        if (game.statusGroup === 3 || game.statusGroup === 2) statusUrl = "https://schema.org/EventInProgress";
        if (game.statusGroup === 4) statusUrl = "https://schema.org/EventMovedOnline"; // fallback for finished
        
        const jsonLd = {
            "@context": "https://schema.org",
            "@graph": [
                {
                    "@type": "SportsEvent",
                    "name": `${homeName} vs ${awayName}`,
                    "description": description,
                    "startDate": game.startTime,
                    "eventStatus": statusUrl,
                    "url": url,
                    "image": imageUrl,
                    "homeTeam": {
                        "@type": "SportsTeam",
                        "name": homeName
                    },
                    "awayTeam": {
                        "@type": "SportsTeam",
                        "name": awayName
                    },
                    "location": {
                        "@type": "Place",
                        "name": game.venue?.name || "TBD",
                        "address": {
                            "@type": "PostalAddress",
                            "addressLocality": game.venue?.city || "",
                            "addressCountry": game.venue?.country || ""
                        }
                    },
                    "description": game.stageName ? `Stage: ${game.stageName} - ${description}` : description
                },
                {
                    "@type": "BreadcrumbList",
                    "itemListElement": [
                        { "@type": "ListItem", "position": 1, "name": "Home", "item": window.location.origin },
                        { "@type": "ListItem", "position": 2, "name": compName, "item": window.location.origin + "/search/label/" + encodeURIComponent(compName) },
                        { "@type": "ListItem", "position": 3, "name": `${homeName} vs ${awayName}`, "item": url }
                    ]
                },
                {
                    "@type": "WebPage",
                    "@id": url,
                    "url": url,
                    "name": title,
                    "description": description
                },
                {
                    "@type": "Article",
                    "headline": title,
                    "image": imageUrl,
                    "author": { "@type": "Organization", "name": "OneSports" },
                    "publisher": { "@type": "Organization", "name": "OneSports", "logo": { "@type": "ImageObject", "url": window.location.origin + "/favicon.ico" } },
                    "datePublished": game.startTime,
                    "dateModified": new Date().toISOString()
                }
            ]
        };

        let scriptId = 'os-jsonld-schema';
        let scriptEl = document.getElementById(scriptId);
        if (!scriptEl) {
            scriptEl = document.createElement('script');
            scriptEl.id = scriptId;
            scriptEl.type = 'application/ld+json';
            document.head.appendChild(scriptEl);
        }
        scriptEl.textContent = JSON.stringify(jsonLd);
    },

    generateShareLinks() {
        const canonicalUrl = window.location.origin + window.location.pathname;
        const encodedUrl = encodeURIComponent(canonicalUrl);
        const encodedTitle = encodeURIComponent(document.title);
        
        return {
            facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
            twitter: `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedTitle}`,
            whatsapp: `https://api.whatsapp.com/send?text=${encodedTitle}%20${encodedUrl}`,
            telegram: `https://t.me/share/url?url=${encodedUrl}&text=${encodedTitle}`,
            copy: canonicalUrl
        };
    }
};


const MatchAdController = {
    isInitialized: false,
    heroLoaded: false,
    infoLoaded: false,
    adSlots: [
        'os-ad-hero',
        'os-ad-stats',
        'os-ad-broadcast',
        'os-ad-h2h',
        'os-ad-related',
        'os-ad-footer'
    ],

    initListeners() {
        MatchEventBus.on('heroUpdated', () => {
            this.heroLoaded = true;
            this.checkInit();
        });
        MatchEventBus.on('infoUpdated', () => {
            this.infoLoaded = true;
            this.checkInit();
        });
    },

    checkInit() {
        if (!this.isInitialized && this.heroLoaded && this.infoLoaded) {
            this.init();
            this.isInitialized = true;
        }
    },

    init() {
        const hasIntersectionObserver = typeof IntersectionObserver !== 'undefined';
        if (!hasIntersectionObserver) {
            Logger.warn("IntersectionObserver not supported, loading all ads immediately.");
            this.adSlots.forEach(id => {
                const el = document.getElementById(id);
                if (el) {
                    el.setAttribute('role', 'complementary');
                    el.setAttribute('aria-label', 'Advertisement');
                }
                MatchEventBus.emit(`adSlotVisible_${id}`, true);
            });
            return;
        }

        const observer = new IntersectionObserver((entries, obs) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const id = entry.target.id;
                    MatchEventBus.emit(`adSlotVisible_${id}`, true);
                    obs.unobserve(entry.target);
                }
            });
        }, { rootMargin: "300px" });

        this.adSlots.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.setAttribute('role', 'complementary');
                el.setAttribute('aria-label', 'Advertisement');
                observer.observe(el);
            }
        });
    }
};

const MatchArticleController = {
    initialized: false,
    init() {
        if (this.initialized) return;
        this.initialized = true;
        Logger.log("MatchArticleController: Initialization started.");
        Logger.time("PageInitialization");
        NetworkStatus.init();
        const payloadContainer = document.getElementById('os-match-data');
        if (!payloadContainer) {
            console.warn("MatchArticleController: No payload container (#os-match-data) found.");
            return;
        }

        const md = {
            matchId: payloadContainer.getAttribute('data-match-id'),
            homeTeam: payloadContainer.getAttribute('data-home-team'),
            awayTeam: payloadContainer.getAttribute('data-away-team'),
            competition: payloadContainer.getAttribute('data-competition'),
            stage: payloadContainer.getAttribute('data-stage'),
            kickoff: payloadContainer.getAttribute('data-kickoff'),
            venue: payloadContainer.getAttribute('data-venue'),
            heroImage: payloadContainer.getAttribute('data-hero-image'),
            socials: {
                telegram: payloadContainer.getAttribute('data-telegram'),
                whatsapp: payloadContainer.getAttribute('data-whatsapp')
            },
            broadcastUrl: payloadContainer.getAttribute('data-broadcast-url'),
            matchPhoto: payloadContainer.getAttribute('data-match-photo')
        };
        MatchStore.updateMetadata(md);

        MatchRenderer.cacheDOM();
        MatchRenderer.initEvents();
        MatchSEOController.init();
        MatchAdController.initListeners();

        // Render synchronous UI elements immediately
        MatchRenderer.renderMatchPhoto();
        MatchRenderer.renderBroadcastLink();
        MatchRenderer.renderSocialFeed();

        // Init Observers for lazy loading
        MatchObservers.init();

        if (MatchStore.metadata.matchId) {
            MatchScheduler.init();
            MatchScheduler.start();
        } else {
            Logger.warn("MatchArticleController: No match ID provided.");
        }
    }
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => MatchArticleController.init());
} else {
    MatchArticleController.init();
}