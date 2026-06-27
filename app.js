/**
 * =========================================================
 * OneSports Application Framework
 * =========================================================
 * A modular, vanilla JavaScript architecture for routing,
 * component rendering, and managing state across Match, Stream, 
 * and Player stages within the Blogger environment.
 */

/**
 * 1. LOGGER
 * Handles console output and external logging services.
 */
const Logger = {
    init() { /* TODO: Hook into global configuration (window.OneSports.debug) */ },
    info(msg, data = {}) { /* TODO: Implement standard logging */ },
    warn(msg, data = {}) { /* TODO: Implement warning logging */ },
    error(msg, error = null) { /* TODO: Implement error logging */ }
};

/**
 * 2. ERROR HANDLER
 * Catches unhandled exceptions and displays fallback UIs to prevent hard crashes.
 */
const ErrorHandler = {
    init() { /* TODO: Bind window.onerror and window.onunhandledrejection */ },
    handle(error, context) { /* TODO: Display graceful error message in UI */ }
};

/**
 * 3. EVENT MANAGER
 * Global Pub/Sub system for decoupled cross-module communication.
 */
const EventManager = {
    listeners: {},
    on(event, callback) { /* TODO: Implement publish/subscribe pattern */ },
    off(event, callback) { /* TODO: Implement unsubscribe */ },
    emit(event, data) { /* TODO: Implement event firing */ }
};

/**
 * 4. THEME MANAGER
 * Handles Dark/Light mode switching, persistence, and OS preference detection.
 */
const ThemeManager = {
    init() { /* TODO: Detect OS theme, read localStorage, bind toggle button */ },
    toggle() { /* TODO: Switch between dark and light mode classes */ },
    setTheme(theme) { /* TODO: Apply theme to document */ }
};

const NavigationManager = {
    init() { 
        if ('scrollRestoration' in history) {
            history.scrollRestoration = 'manual';
        }
        const btt = document.createElement('button');
        btt.className = 'back-to-top';
        btt.setAttribute('aria-label', 'Back to top');
        btt.innerHTML = '<i class="fas fa-chevron-up"></i>';
        btt.onclick = () => window.scrollTo({top: 0, behavior: 'smooth'});
        document.body.appendChild(btt);

        window.addEventListener('scroll', () => {
            if (window.scrollY > 500) btt.classList.add('visible');
            else btt.classList.remove('visible');
        });
    },
    showPageLoader() {
        let loader = document.getElementById('os-page-loader');
        if (!loader) {
            loader = document.createElement('div');
            loader.id = 'os-page-loader';
            loader.className = 'os-page-loader';
            loader.innerHTML = '<div class="os-loader-spinner"></div>';
            document.body.appendChild(loader);
        }
        loader.classList.remove('hidden');
    },
    hidePageLoader() {
        const loader = document.getElementById('os-page-loader');
        if (loader) loader.classList.add('hidden');
    }
};

const AnimationManager = {
    fadeIn(element, duration = 300) { /* TODO: Implement transition logic */ },
    fadeOut(element, duration = 300) { /* TODO: Implement transition logic */ },
    slideToggle(element) { /* TODO: Implement slide down/up for accordions */ }
};

/**
 * 6.5. HELPERS
 * Shared utility functions migrated from the existing 365Scores implementation.
 */
const Helpers = {
    sanitizeHTML(str) {
        if (!str) return '';
        const temp = document.createElement('div');
        temp.textContent = str;
        return temp.innerHTML;
    },
    getLogoUrl(id, version = 1) {
        return `https://imagecache.365scores.com/image/upload/f_png,w_100,h_100,c_limit,q_auto:eco,d_Competitors:default1.png/v${version}/Competitors/${id}`;
    },
    getCompLogoUrl(id) {
        return `https://imagecache.365scores.com/image/upload/f_png,w_24,h_24,c_limit,q_auto:eco/v1/Competitions/${id}`;
    },
    getLiveTime(game) {
        const isActuallyLive = game.statusGroup === 2 || game.statusGroup === 3 || game.shortStatusText === 'Live' || game.statusText === "1st Half" || game.statusText === "2nd Half";
        if (isActuallyLive) {
            let timeStr = game.gameTimeDisplay || game.statusText || game.shortStatusText || "";
            const isGenericText = timeStr === "1st Half" || timeStr === "2nd Half" || timeStr.includes("Half");
            
            if (isGenericText || !timeStr) {
                if (game.gameTime && game.gameTime > 0) {
                    timeStr = `${game.gameTime}'`;
                    if (game.addedTime) timeStr = `${game.gameTime}+${game.addedTime}'`;
                } else {
                    const start = new Date(game.startTime).getTime();
                    const diffMins = Math.floor((Date.now() - start) / 60000);
                    if (timeStr === "1st Half" || (!timeStr && diffMins >= 0 && diffMins <= 50)) {
                        timeStr = `${Math.max(1, Math.min(45, diffMins))}'`;
                    } else if (timeStr === "2nd Half" || (!timeStr && diffMins > 50)) {
                        const secondHalfStart = start + (60000 * 60);
                        const diff2nd = Math.floor((Date.now() - secondHalfStart) / 60000);
                        timeStr = `${Math.max(46, Math.min(90, 45 + diff2nd))}'`;
                    } else {
                        timeStr = "Live";
                    }
                }
            }
            return timeStr;
        }
        return game.statusText || "Scheduled";
    }
};

const MatchTimer = {
    getDisplay(game) {
        const isLive = game.statusGroup === 2 || game.statusGroup === 3 || game.shortStatusText === 'Live';
        const isScheduled = game.statusText === "Scheduled" || game.statusGroup === 1;
        const isEnded = game.statusText === "Ended" || game.statusGroup === 4 || game.statusText === "After Pen.";
        
        if (isScheduled) {
            const dateObj = new Date(game.startTime);
            const kickOffTime = dateObj.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            return `<div class="countdown-pill" data-start-time="${dateObj.getTime()}">${kickOffTime}</div>`;
        } else if (isLive) {
            return `<div class="center-status-indicator live-timer-pill live">${Helpers.getLiveTime(game)}</div>`;
        } else if (isEnded) {
            return `<div class="countdown-pill">FT</div>`;
        }
        return `<div class="countdown-pill">${game.statusText}</div>`;
    }
};

const CacheManager = {
    get(key) {
        try {
            const itemStr = sessionStorage.getItem(key);
            if (!itemStr) return null;
            const item = JSON.parse(itemStr);
            if (Date.now() > item.expiry) {
                sessionStorage.removeItem(key);
                return null;
            }
            return item.value;
        } catch(e) { return null; }
    },
    set(key, value, ttl = 300000) {
        try {
            sessionStorage.setItem(key, JSON.stringify({ value, expiry: Date.now() + ttl }));
        } catch(e) {}
    }
};

const APIManager = {
    async getFixture(id, forceRefresh = false) { 
        if (!id) return null;
        if (!navigator.onLine) {
            Logger.warn("Offline detected");
            return { _error: "offline" }; 
        }

        const cacheKey = `fixture_${id}`;
        if (!forceRefresh) {
            const cached = CacheManager.get(cacheKey);
            if (cached) {
                const isLive = cached.statusGroup === 2 || cached.statusGroup === 3 || cached.shortStatusText === 'Live';
                if (!isLive) return cached; 
            }
        }

        if (window.OneSports365 && typeof window.OneSports365.getFixture === 'function') {
            let retries = 3;
            while (retries > 0) {
                try {
                    const game = await Promise.race([
                        window.OneSports365.getFixture(id),
                        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 8000))
                    ]);
                    if (game) {
                        const isLive = game.statusGroup === 2 || game.statusGroup === 3 || game.shortStatusText === 'Live';
                        CacheManager.set(cacheKey, game, isLive ? 60000 : 300000); // 1m for live, 5m others
                    }
                    return game;
                } catch (err) {
                    retries--;
                    const msg = (err.message || '').toString();
                    if (msg.includes('401') || msg.includes('403') || msg.includes('404') || msg.includes('429')) {
                        return { _error: msg };
                    }
                    if (retries === 0) return { _error: err.message };
                    await new Promise(r => setTimeout(r, 1000));
                }
            }
        }
        return null;
    }
};

const Renderer = {
    observer: null,
    initObserver() {
        if (!this.observer && 'IntersectionObserver' in window) {
            this.observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add('reveal-visible');
                        this.observer.unobserve(entry.target);
                    }
                });
            }, { threshold: 0.1 });
        }
    },
    mount(component, data) {
        try {
            this.initObserver();
            
            if (data === undefined) {
                if (typeof component.loading === 'function') component.loading();
            } else if (data === null || data._error || (Array.isArray(data) && data.length === 0)) {
                if (typeof component.empty === 'function') component.empty();
            } else {
                if (typeof component.render === 'function') component.render(data);
                
                if (component.container && component.container.firstElementChild && this.observer) {
                    const el = component.container.firstElementChild;
                    el.classList.add('reveal-hidden');
                    this.observer.observe(el);
                }
            }
        } catch (err) {
            Logger.error("Component render failed", err);
            if (typeof component.error === 'function') component.error(err.message);
        }
    }
};

/**
 * 8. UI COMPONENTS
 * Isolated, reusable building blocks for constructing stages.
 */
class BaseComponent {
    constructor(container) {
        this.container = typeof container === 'string' ? document.getElementById(container) : container;
    }
    loading() {
        if (this.container) this.container.innerHTML = `<div class="widget-placeholder"><div class="spinner"></div></div>`;
    }
    empty() {
        if (this.container) {
            this.container.innerHTML = "";
            this.container.style.display = "none";
        }
    }
    error(msg) {
        this.empty(); // Gracefully hide on error
    }
    render(data) {
        // To be implemented by subclasses
    }
}

const UIHelpers = {
    renderMiniMatch(m) {
        if (!m || !m.homeCompetitor || !m.awayCompetitor) return '';
        const hScore = m.homeCompetitor.score !== -1 && m.homeCompetitor.score !== undefined ? m.homeCompetitor.score : '-';
        const aScore = m.awayCompetitor.score !== -1 && m.awayCompetitor.score !== undefined ? m.awayCompetitor.score : '-';
        return `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 0; border-bottom:1px solid rgba(255,255,255,0.05); font-size:0.85rem;">
                <div style="flex:1; text-align:right; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${m.homeCompetitor.name}</div>
                <div style="padding:0 15px; color:var(--primary); font-weight:bold; white-space:nowrap;">${hScore} - ${aScore}</div>
                <div style="flex:1; text-align:left; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${m.awayCompetitor.name}</div>
            </div>
        `;
    }
};

class HeroComponent extends BaseComponent {
    render(game) { 
        if (!this.container || !game) return;
        const compName = game.competitionDisplayName || "COMPETITION";
        const isLive = game.statusGroup === 2 || game.statusGroup === 3 || game.shortStatusText === 'Live';
        
        const pageElement = document.getElementById("onesports-page");
        const bloggerImg = pageElement ? pageElement.dataset.image : null;
        const compImg = `https://imagecache.365scores.com/image/upload/f_png,w_1200,h_300,c_fill,q_auto:eco/v1/Backgrounds/Competitions/${game.competitionId}`;
        const defaultImg = "https://imagecache.365scores.com/image/upload/f_png,w_1200,h_300,c_fill,q_auto:eco/v1/Backgrounds/1";
        
        const heroImg = bloggerImg || compImg || defaultImg;
        
        this.container.innerHTML = `
            <div class="match-hero glass-card">
                <img src="${heroImg}" alt="${Helpers.sanitizeHTML(compName)}" fetchpriority="high" loading="eager" decoding="async" />
                <div class="match-hero-overlay"></div>
                <div class="match-hero-badges">
                    <span class="sport-pill">${compName}</span>
                    ${isLive ? '<span class="live-badge">LIVE</span>' : ''}
                </div>
            </div>
        `;
    }
}

class HeaderComponent extends BaseComponent {
    render(game) { 
        if (!this.container || !game) return;
        
        const homeLogoUrl = Helpers.getLogoUrl(game.homeCompetitor.id, game.homeCompetitor.imageVersion || 1);
        const awayLogoUrl = Helpers.getLogoUrl(game.awayCompetitor.id, game.awayCompetitor.imageVersion || 1);
        
        const isScheduled = game.statusText === "Scheduled" || game.statusGroup === 1;
        
        const homeScore = game.homeCompetitor.score !== undefined && game.homeCompetitor.score !== -1 ? game.homeCompetitor.score : "-";
        const awayScore = game.awayCompetitor.score !== undefined && game.awayCompetitor.score !== -1 ? game.awayCompetitor.score : "-";
        
        const dateObj = new Date(game.startTime);
        const kickOffTime = dateObj.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        
        const compName = game.competitionDisplayName || "COMPETITION";
        const venue = game.venueName || "TBD";
        const referee = game.refereeName || "TBD";
        
        const topScoreText = isScheduled ? "VS" : `${homeScore} - ${awayScore}`;
        const timerHtml = MatchTimer.getDisplay(game);

        this.container.innerHTML = `
            <div class="match-header-card glass-card">
                <div class="match-meta-top">${compName} • ${venue}</div>
                <div class="match-teams-wrapper">
                    <div class="team-block">
                        <img src="${homeLogoUrl}" alt="${game.homeCompetitor.name}" class="team-logo" style="filter:none; opacity:1;" />
                        <h2 class="team-name">${game.homeCompetitor.name}</h2>
                    </div>
                    <div class="score-block">
                        <div class="countdown-pill" style="font-size:1.5rem; background:transparent; border:none;">${topScoreText}</div>
                        ${timerHtml}
                    </div>
                    <div class="team-block">
                        <img src="${awayLogoUrl}" alt="${game.awayCompetitor.name}" class="team-logo" style="filter:none; opacity:1;" />
                        <h2 class="team-name">${game.awayCompetitor.name}</h2>
                    </div>
                </div>
                <div class="match-info-grid">
                    <div class="info-item"><span class="info-label">Kickoff</span><span class="info-value">${dateObj.toLocaleDateString()} ${kickOffTime}</span></div>
                    <div class="info-item"><span class="info-label">Venue</span><span class="info-value">${venue}</span></div>
                    ${referee !== "TBD" ? `<div class="info-item"><span class="info-label">Referee</span><span class="info-value">${referee}</span></div>` : ''}
                    ${game.weather ? `<div class="info-item"><span class="info-label">Weather</span><span class="info-value">${game.weather.type || 'N/A'}</span></div>` : ''}
                </div>
            </div>
        `;
    }
}

class CTAComponent extends BaseComponent {
    constructor(containerId, options = {}) { 
        super(containerId);
        this.label = options.label || "WATCH LIVE STREAM";
        this.icon = options.icon || "fa-play-circle";
        this.variant = options.variant || "top";
        this.urlType = options.urlType || "stream";
    }
    render(game) { 
        if (!this.container || !game) return;
        const pageElement = document.getElementById("onesports-page");
        const idValue = pageElement ? pageElement.dataset[this.urlType] : null;
        
        if (!idValue) {
            this.container.innerHTML = `
                <div class="cta-wrapper">
                    <button class="cta-btn cta-btn-${this.variant}" style="opacity:0.5; pointer-events:none;" aria-disabled="true" aria-label="${this.label} (Not Available)">
                        <i class="fas ${this.icon}" style="margin-right: 8px;"></i> ${this.label}
                    </button>
                </div>
            `;
            return;
        }

        const href = idValue;
        
        this.container.innerHTML = `
            <div class="cta-wrapper">
                <a href="${href}" class="cta-btn cta-btn-${this.variant}" aria-label="${this.label}">
                    <i class="fas ${this.icon}" style="margin-right: 8px;"></i> ${this.label}
                </a>
            </div>
        `;
    }
}

class MatchTimelineComponent extends BaseComponent {
    render(game) {
        if (!game.events || game.events.length === 0) return this.empty();
        let eventsHtml = `<div class="timeline-container">`;
        game.events.forEach(ev => {
            let icon = 'fa-futbol';
            let color = 'var(--text-main)';
            if (ev.eventType.name === 'Yellow Card') { icon = 'fa-square'; color = '#f1c40f'; }
            if (ev.eventType.name === 'Red Card') { icon = 'fa-square'; color = '#e74c3c'; }
            if (ev.eventType.name === 'Substitution') { icon = 'fa-exchange-alt'; color = '#2ecc71'; }
            if (ev.eventType.name === 'VAR') { icon = 'fa-tv'; color = '#9b59b6'; }
            if (ev.eventType.name === 'Penalty Shootout') { icon = 'fa-bullseye'; }
            
            const isHome = ev.competitorId === game.homeCompetitor.id;
            eventsHtml += `
                <div class="timeline-row ${isHome ? 'home' : 'away'}">
                    <div class="timeline-time">${ev.gameTime}'</div>
                    <div class="timeline-icon" style="color:${color}"><i class="fas ${icon}"></i></div>
                    <div class="timeline-details">
                        <span class="player-name">${ev.playerName || ''}</span>
                    </div>
                </div>
            `;
        });
        eventsHtml += `</div>`;
        this.container.innerHTML = `<div class="widget-card glass-card"><div class="widget-header"><i class="fas fa-stream"></i><h3>Match Timeline</h3></div>${eventsHtml}</div>`;
    }
}

class MatchMomentumComponent extends BaseComponent {
    render(game) {
        if (!game.momentum) return this.empty();
        const points = game.momentum.graph || game.momentum.points;
        if (!points || !Array.isArray(points) || points.length === 0) return this.empty();
        
        let graphHtml = `<div style="display:flex; align-items:flex-end; height:100px; gap:1px; border-bottom:1px solid rgba(255,255,255,0.1); margin-top:15px;">`;
        points.slice(0, 100).forEach(pt => {
            const val = typeof pt === 'number' ? pt : (pt.value || 0);
            const isHome = val > 0;
            const height = Math.min(100, Math.abs(val) || 5); 
            const color = isHome ? 'var(--primary)' : 'var(--secondary)';
            graphHtml += `<div style="flex:1; background:${color}; height:${height}%; opacity:0.8; border-radius:2px 2px 0 0;"></div>`;
        });
        graphHtml += `</div>`;
        this.container.innerHTML = `<div class="widget-card glass-card"><div class="widget-header"><i class="fas fa-chart-area"></i><h3>Match Momentum</h3></div>${graphHtml}</div>`;
    }
}

class StatisticsComponent extends BaseComponent {
    render(game) {
        if (!game.statistics || game.statistics.length === 0) return this.empty();
        let statsHtml = `<div class="stats-list" style="display:flex; flex-direction:column; gap:15px;">`;
        game.statistics.forEach(stat => {
            const homeVal = parseFloat(stat.homeValue) || 0;
            const awayVal = parseFloat(stat.awayValue) || 0;
            const name = stat.name || "Stat";
            const total = homeVal + awayVal || 1; 
            const homePct = (homeVal / total) * 100;
            const awayPct = (awayVal / total) * 100;
            statsHtml += `
                <div class="stat-row">
                    <div style="display:flex; justify-content:space-between; font-size:0.85rem; font-weight:600; margin-bottom:5px;">
                        <span>${stat.homeValue || '0'}</span><span style="color:var(--text-muted); text-transform:uppercase;">${name}</span><span>${stat.awayValue || '0'}</span>
                    </div>
                    <div style="display:flex; height:6px; border-radius:3px; overflow:hidden; background:rgba(255,255,255,0.05);">
                        <div style="width:${homePct}%; background:var(--primary);"></div>
                        <div style="width:${awayPct}%; background:var(--secondary);"></div>
                    </div>
                </div>
            `;
        });
        statsHtml += `</div>`;
        this.container.innerHTML = `<div class="widget-card glass-card"><div class="widget-header"><i class="fas fa-chart-pie"></i><h3>Match Statistics</h3></div>${statsHtml}</div>`;
    }
}

class LineupsComponent extends BaseComponent {
    render(game) {
        const homeLineup = game.homeCompetitor.lineups && game.homeCompetitor.lineups.members ? game.homeCompetitor.lineups.members : null;
        const awayLineup = game.awayCompetitor.lineups && game.awayCompetitor.lineups.members ? game.awayCompetitor.lineups.members : null;
        if (!homeLineup || !awayLineup) return this.empty();

        let lineupsHtml = `<div style="display:grid; grid-template-columns: 1fr 1fr; gap:20px;">`;
        lineupsHtml += `<div><h4 style="margin-bottom:15px; color:var(--text-main); font-family:var(--font-heading); border-bottom:1px solid var(--glass-border); padding-bottom:10px;">${game.homeCompetitor.name}</h4><ul style="list-style:none; padding:0; font-size:0.9rem;">`;
        homeLineup.forEach(p => {
            const rating = p.ranking ? `<span style="float:right; color:#2ecc71; font-weight:bold;">${p.ranking}</span>` : '';
            lineupsHtml += `<li style="padding:10px 0; border-bottom:1px solid rgba(255,255,255,0.02); display:flex; align-items:center; gap:12px;"><span style="color:var(--primary); font-weight:bold; width:22px;">${p.jerseyNumber||'-'}</span> <span style="flex-grow:1;">${p.name}</span> ${rating}</li>`;
        });
        lineupsHtml += `</ul></div>`;

        lineupsHtml += `<div><h4 style="margin-bottom:15px; color:var(--text-main); font-family:var(--font-heading); border-bottom:1px solid var(--glass-border); padding-bottom:10px;">${game.awayCompetitor.name}</h4><ul style="list-style:none; padding:0; font-size:0.9rem;">`;
        awayLineup.forEach(p => {
            const rating = p.ranking ? `<span style="float:right; color:#2ecc71; font-weight:bold;">${p.ranking}</span>` : '';
            lineupsHtml += `<li style="padding:10px 0; border-bottom:1px solid rgba(255,255,255,0.02); display:flex; align-items:center; gap:12px;"><span style="color:var(--secondary); font-weight:bold; width:22px;">${p.jerseyNumber||'-'}</span> <span style="flex-grow:1;">${p.name}</span> ${rating}</li>`;
        });
        lineupsHtml += `</ul></div></div>`;

        this.container.innerHTML = `<div class="widget-card glass-card"><div class="widget-header"><i class="fas fa-users"></i><h3>Lineups & Ratings</h3></div>${lineupsHtml}</div>`;
    }
}

class LeagueTableComponent extends BaseComponent {
    render(game) {
        if (!game.standings || game.standings.length === 0) return this.empty();
        const table = game.standings[0]; 
        if (!table || !table.rows) return this.empty();
        let rowsHtml = '';
        table.rows.slice(0, 5).forEach(row => {
            const isTarget = row.competitor.id === game.homeCompetitor.id || row.competitor.id === game.awayCompetitor.id;
            rowsHtml += `
                <div style="display:flex; padding:8px 0; border-bottom:1px solid rgba(255,255,255,0.05); font-size:0.85rem; ${isTarget ? 'color:var(--primary); font-weight:bold;' : 'color:var(--text-muted);'}">
                    <div style="width:30px;">${row.position}</div>
                    <div style="flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${row.competitor.name}</div>
                    <div style="width:30px; text-align:center;">${row.matchesPlayed}</div>
                    <div style="width:30px; text-align:center;">${row.points}</div>
                </div>
            `;
        });
        let header = `
            <div style="display:flex; padding-bottom:10px; border-bottom:1px solid rgba(255,255,255,0.1); font-size:0.75rem; text-transform:uppercase; color:var(--text-muted); font-weight:bold;">
                <div style="width:30px;">#</div>
                <div style="flex:1;">Team</div>
                <div style="width:30px; text-align:center;">PL</div>
                <div style="width:30px; text-align:center;">PTS</div>
            </div>
        `;
        this.container.innerHTML = `<div class="widget-card glass-card"><div class="widget-header"><i class="fas fa-list-ol"></i><h3>League Table</h3></div>${header}${rowsHtml}</div>`;
    }
}

class MatchStatsComponent extends BaseComponent {
    render(game) { 
        if (!this.container || !game) return;
        this.container.innerHTML = "";
        
        const subWidgets = [
            MatchTimelineComponent,
            MatchMomentumComponent,
            StatisticsComponent,
            LineupsComponent,
            LeagueTableComponent
        ];

        subWidgets.forEach(CompClass => {
            const div = document.createElement('div');
            this.container.appendChild(div);
            Renderer.mount(new CompClass(div), game);
        });
    }
}

class StreamPlayerComponent extends BaseComponent {
    render(game) { 
        if (!this.container || !game) return;
        this.container.innerHTML = `
            <div class="widget-card glass-card" style="padding:0; overflow:hidden;">
                <div style="background:#000; width:100%; aspect-ratio:16/9; display:flex; align-items:center; justify-content:center; flex-direction:column; color:white;">
                    <i class="fas fa-video-slash" style="font-size:3rem; margin-bottom:15px; color:var(--text-muted)"></i>
                    <h3 style="margin:0; font-family:var(--font-heading)">Stream Player Placeholder</h3>
                    <p style="color:var(--text-muted); font-size:0.9rem; margin-top:5px;">Please select a server from the list below</p>
                </div>
            </div>
        `;
    }
}

class ServerListComponent extends BaseComponent {
    render(game) { 
        if (!this.container || !game) return;
        const servers = [
            { name: 'UltraStream 1', res: '4K', lang: 'EN', status: 'Online', health: 98, updated: 'Just now' },
            { name: 'MegaSports 2', res: 'FHD', lang: 'ES', status: 'Online', health: 95, updated: '1 min ago' },
            { name: 'FastPlay 3', res: 'FHD', lang: 'EN', status: 'Online', health: 92, updated: '2 mins ago' },
            { name: 'LiveCast 4', res: 'HD', lang: 'PT', status: 'Busy', health: 70, updated: '5 mins ago' },
            { name: 'GlobalNet 5', res: 'HD', lang: 'FR', status: 'Online', health: 85, updated: '1 min ago' },
            { name: 'Backup 6', res: 'SD', lang: 'EN', status: 'Online', health: 99, updated: 'Just now' },
            { name: 'Fallback 7', res: 'SD', lang: 'Multi', status: 'Offline', health: 0, updated: '10 mins ago' }
        ];

        let html = `<div class="widget-card glass-card">
            <div class="widget-header"><i class="fas fa-server"></i><h3>Available Servers</h3></div>
            <div class="server-list">`;
            
        servers.forEach(s => {
            const healthColor = s.health > 90 ? 'var(--primary)' : (s.health > 0 ? '#f39c12' : '#e74c3c');
            html += `
                <div class="server-card">
                    <div class="server-info">
                        <div class="server-title">
                            <span class="server-health" style="background:${healthColor}"></span>
                            <h4>${s.name}</h4>
                        </div>
                        <div class="server-badges">
                            <span class="s-badge res-badge">${s.res}</span>
                            <span class="s-badge lang-badge">${s.lang}</span>
                            <span class="s-badge status-badge ${s.status === 'Online' ? 'online' : (s.status === 'Offline' ? 'offline' : 'busy')}">${s.status}</span>
                        </div>
                        <div class="server-meta"><i class="fas fa-clock"></i> Updated: ${s.updated}</div>
                    </div>
                    <button class="server-btn" aria-label="Play ${s.name} Stream"><i class="fas fa-play"></i></button>
                </div>
            `;
        });
        
        html += `</div></div>`; 

        html += `
            <div class="stream-actions glass-card">
                <button class="action-btn"><i class="fas fa-sync-alt"></i> Refresh Stream</button>
                <button class="action-btn"><i class="fas fa-flag"></i> Report Broken</button>
                <button class="action-btn"><i class="fas fa-random"></i> Alt Servers</button>
                <button class="action-btn tips-btn"><i class="fas fa-lightbulb"></i> Streaming Tips</button>
            </div>
        `;

        this.container.innerHTML = html;
    }
}

class EmbeddedPlayerComponent extends BaseComponent {
    render(game) { 
        if (!this.container || !game) return;
        this.container.innerHTML = `
            <div class="widget-card glass-card" style="padding:0; overflow:hidden;">
                <!-- Player Area -->
                <div class="player-wrapper" style="background:#000; width:100%; aspect-ratio:16/9; position:relative;">
                    <div id="video-player-container" style="width:100%; height:100%; display:flex; align-items:center; justify-content:center; flex-direction:column; color:white;">
                        <i class="fas fa-play-circle" style="font-size:3rem; margin-bottom:15px; color:var(--text-muted)"></i>
                        <h3 style="margin:0; font-family:var(--font-heading)">Stream Ready</h3>
                        <p style="color:var(--text-muted); font-size:0.9rem; margin-top:5px;">Player will be injected here</p>
                    </div>
                </div>
                <!-- Player Controls -->
                <div class="player-controls" style="padding:15px; display:flex; justify-content:space-between; align-items:center; background:rgba(0,0,0,0.5); border-top:1px solid rgba(255,255,255,0.1);">
                    <div style="display:flex; align-items:center; gap:10px;">
                        <span class="server-health" style="background:#2ecc71;"></span>
                        <span style="font-weight:bold; font-size:0.9rem; color:var(--text-main);">Connection Stable</span>
                    </div>
                    <div style="display:flex; gap:10px;">
                        <button class="action-btn" style="padding:8px 15px; font-size:0.75rem;"><i class="fas fa-sync-alt"></i> Refresh</button>
                        <button class="action-btn" style="padding:8px 15px; font-size:0.75rem; color:#e74c3c; border-color:rgba(231,76,60,0.3);"><i class="fas fa-flag"></i> Report</button>
                    </div>
                </div>
            </div>
            
            <div class="widget-card glass-card" style="margin-top:20px;">
                <div class="widget-header"><i class="fas fa-random"></i><h3>Alternative Streams</h3></div>
                <div class="stream-actions" style="margin-bottom:0;">
                    <button class="action-btn"><i class="fas fa-server"></i> Server 2</button>
                    <button class="action-btn"><i class="fas fa-server"></i> Server 3</button>
                    <button class="action-btn"><i class="fas fa-server"></i> Backup</button>
                </div>
            </div>
        `;
    }

    injectPlayer(sourceUrl) {
        const container = document.getElementById('video-player-container');
        if (container) {
            container.innerHTML = `<p style="color:var(--primary);">Loading stream from ${sourceUrl}...</p>`;
        }
    }
}

class PlayerWidgetsComponent extends BaseComponent {
    render(game) {
        if (!this.container || !game) return;
        this.container.innerHTML = "";
        
        const subWidgets = [
            MatchTimelineComponent,
            StatisticsComponent
        ];

        subWidgets.forEach(CompClass => {
            const div = document.createElement('div');
            this.container.appendChild(div);
            Renderer.mount(new CompClass(div), game);
        });
    }
}

class MissingPlayersComponent extends BaseComponent {
    render(game) {
        if (!game.missingPlayers || game.missingPlayers.length === 0) return this.empty();
        let html = `<ul style="list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:10px;">`;
        game.missingPlayers.forEach(mp => {
            const icon = mp.type === 'Suspended' ? 'fa-ban' : 'fa-briefcase-medical';
            const color = mp.type === 'Suspended' ? '#e74c3c' : '#f39c12';
            html += `<li><i class="fas ${icon}" style="color:${color}; width:20px;"></i> ${mp.playerName}</li>`;
        });
        html += `</ul>`;
        this.container.innerHTML = `<div class="widget-card glass-card"><div class="widget-header"><i class="fas fa-user-injured"></i><h3>Injuries & Suspensions</h3></div>${html}</div>`;
    }
}

class MatchInfoComponent extends BaseComponent {
    render(game) {
        const hasVenue = !!game.venueName;
        const hasRef = !!game.refereeName;
        const hasWeather = !!game.weather;
        if (!hasVenue && !hasRef && !hasWeather) return this.empty();
        
        let html = `<div style="display:flex; flex-direction:column; gap:15px; font-size:0.9rem;">`;
        if (hasVenue) html += `<div><i class="fas fa-map-marker-alt" style="color:var(--primary); width:20px;"></i> <strong>Venue:</strong> ${game.venueName}</div>`;
        if (hasRef) html += `<div><i class="fas fa-whistle" style="color:var(--primary); width:20px;"></i> <strong>Referee:</strong> ${game.refereeName}</div>`;
        if (hasWeather) html += `<div><i class="fas fa-cloud" style="color:var(--primary); width:20px;"></i> <strong>Weather:</strong> ${game.weather.type} (${game.weather.temperature}°)</div>`;
        html += `</div>`;
        this.container.innerHTML = `<div class="widget-card glass-card"><div class="widget-header"><i class="fas fa-info-circle"></i><h3>Match Info</h3></div>${html}</div>`;
    }
}

class H2HComponent extends BaseComponent {
    render(game) {
        if (!game.previousMeetings || game.previousMeetings.length === 0) return this.empty();
        let html = '';
        game.previousMeetings.slice(0, 5).forEach(m => { html += UIHelpers.renderMiniMatch(m); });
        this.container.innerHTML = `<div class="widget-card glass-card"><div class="widget-header"><i class="fas fa-history"></i><h3>Previous Meetings</h3></div>${html}</div>`;
    }
}

class FormComponent extends BaseComponent {
    render(game) {
        let hasHome = game.homeCompetitor.recentMatches && game.homeCompetitor.recentMatches.length > 0;
        let hasAway = game.awayCompetitor.recentMatches && game.awayCompetitor.recentMatches.length > 0;
        if (!hasHome && !hasAway) return this.empty();
        
        let html = '';
        if (hasHome) {
            html += `<h4 style="margin:10px 0; font-size:0.9rem; color:var(--text-main);">${game.homeCompetitor.name}</h4>`;
            game.homeCompetitor.recentMatches.slice(0,3).forEach(m => html += UIHelpers.renderMiniMatch(m));
        }
        if (hasAway) {
            html += `<h4 style="margin:15px 0 10px; font-size:0.9rem; color:var(--text-main);">${game.awayCompetitor.name}</h4>`;
            game.awayCompetitor.recentMatches.slice(0,3).forEach(m => html += UIHelpers.renderMiniMatch(m));
        }
        this.container.innerHTML = `<div class="widget-card glass-card"><div class="widget-header"><i class="fas fa-chart-line"></i><h3>Recent Form</h3></div>${html}</div>`;
    }
}

class UpcomingFixturesComponent extends BaseComponent {
    render(game) {
        let hasHome = game.homeCompetitor.nextMatches && game.homeCompetitor.nextMatches.length > 0;
        let hasAway = game.awayCompetitor.nextMatches && game.awayCompetitor.nextMatches.length > 0;
        if (!hasHome && !hasAway) return this.empty();
        
        let html = '';
        if (hasHome) {
            html += `<h4 style="margin:10px 0; font-size:0.9rem; color:var(--text-main);">${game.homeCompetitor.name}</h4>`;
            game.homeCompetitor.nextMatches.slice(0,3).forEach(m => html += UIHelpers.renderMiniMatch(m));
        }
        if (hasAway) {
            html += `<h4 style="margin:15px 0 10px; font-size:0.9rem; color:var(--text-main);">${game.awayCompetitor.name}</h4>`;
            game.awayCompetitor.nextMatches.slice(0,3).forEach(m => html += UIHelpers.renderMiniMatch(m));
        }
        this.container.innerHTML = `<div class="widget-card glass-card"><div class="widget-header"><i class="fas fa-calendar-plus"></i><h3>Upcoming Fixtures</h3></div>${html}</div>`;
    }
}

class TVChannelsComponent extends BaseComponent {
    render(game) {
        if (!game.tvNetworks || game.tvNetworks.length === 0) return this.empty();
        let html = `<div style="display:flex; gap:10px; flex-wrap:wrap;">`;
        game.tvNetworks.forEach(tv => {
            html += `<span class="s-badge" style="background:var(--primary); color:#000;">${tv.name}</span>`;
        });
        html += `</div>`;
        this.container.innerHTML = `<div class="widget-card glass-card"><div class="widget-header"><i class="fas fa-tv"></i><h3>TV Channels</h3></div>${html}</div>`;
    }
}

class NewsComponent extends BaseComponent {
    render(game) {
        if (!game.news || game.news.length === 0) return this.empty();
        let html = `<div style="display:flex; flex-direction:column; gap:15px;">`;
        game.news.slice(0, 4).forEach(article => {
            const img = article.imageUrl ? `<img src="${article.imageUrl}" loading="lazy" onload="this.classList.add('loaded')" class="lazy-img" style="width:70px; height:70px; object-fit:cover; border-radius:8px; margin-right:15px;">` : '';
            html += `
                <a href="${article.url}" target="_blank" style="display:flex; align-items:center; text-decoration:none; color:inherit; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:12px;">
                    ${img}
                    <div style="flex:1;">
                        <h4 style="margin:0 0 6px; font-size:0.9rem; line-height:1.4; color:var(--text-main); font-family:var(--font-heading);">${article.title}</h4>
                        <span style="font-size:0.75rem; color:var(--primary);">${article.source || 'News'}</span>
                    </div>
                </a>
            `;
        });
        html += `</div>`;
        this.container.innerHTML = `<div class="widget-card glass-card"><div class="widget-header"><i class="fas fa-newspaper"></i><h3>Latest News</h3></div>${html}</div>`;
    }
}

class FAQComponent extends BaseComponent {
    render(game) {
        if (!game) return this.empty();
        const comp = game.competitionDisplayName || 'the competition';
        const home = game.homeCompetitor.name || 'Home Team';
        const away = game.awayCompetitor.name || 'Away Team';
        this.container.innerHTML = `
            <div class="widget-card glass-card">
                <div class="widget-header"><i class="fas fa-question-circle"></i><h3>FAQ</h3></div>
                <details style="margin-bottom:10px; cursor:pointer;"><summary><strong>Who is playing?</strong></summary><p style="margin-top:5px; color:var(--text-muted); font-size:0.9rem;">${home} is facing ${away} in ${comp}.</p></details>
                <details style="margin-bottom:10px; cursor:pointer;"><summary><strong>Where can I watch the stream?</strong></summary><p style="margin-top:5px; color:var(--text-muted); font-size:0.9rem;">Click the "WATCH LIVE STREAM" button above to see all available premium servers.</p></details>
            </div>
        `;
    }
}

class WidgetsComponent extends BaseComponent {
    render(game) { 
        if (!this.container || !game) return;
        this.container.innerHTML = "";
        
        const subWidgets = [
            MissingPlayersComponent,
            MatchInfoComponent,
            H2HComponent,
            FormComponent,
            UpcomingFixturesComponent,
            TVChannelsComponent,
            NewsComponent,
            FAQComponent
        ];

        subWidgets.forEach(CompClass => {
            const div = document.createElement('div');
            this.container.appendChild(div);
            Renderer.mount(new CompClass(div), game);
        });
    }
}

class EditorialComponent extends BaseComponent {
    render(game) { 
        // Blogger renders editorial content natively inside the container.
        // We ensure it stays visible if it has content.
        if (this.container && this.container.innerHTML.trim() !== "") {
            this.container.style.display = 'block';
        }
    }
}

class RelatedComponent extends BaseComponent {
    // Falls back to empty() hiding entirely if no related matches exist
}


/**
 * 9. STAGE MANAGER
 * Assembles UI components based on the active stage type and manages their lifecycle.
 */
const StageManager = {
    renderGlobalError(containerId, errorMsg) {
        const container = document.getElementById(containerId);
        if (container) {
            container.innerHTML = `
                <div class="widget-card glass-card" style="text-align:center; padding:40px 20px;">
                    <i class="fas ${errorMsg === 'offline' ? 'fa-wifi-slash' : 'fa-exclamation-triangle'}" style="font-size:4rem; color:var(--text-muted); margin-bottom:20px;"></i>
                    <h3 style="margin-bottom:10px; font-family:var(--font-heading); color:var(--text-main);">
                        ${errorMsg === 'offline' ? 'No Internet Connection' : 'Data Unavailable'}
                    </h3>
                    <p style="color:var(--text-muted); margin-bottom:20px;">
                        ${errorMsg === 'offline' ? 'Please check your network and try again.' : 'We encountered an error fetching match data.'}
                    </p>
                    <button class="action-btn" onclick="window.location.reload()" style="margin:0 auto; padding:10px 25px;"><i class="fas fa-sync-alt"></i> Try Again</button>
                </div>
            `;
        }
    },

    renderSharedShell(game, mainComponent, secondaryComponent, topConfig, bottomConfig) {
        const hero = new HeroComponent('os-hero');
        const header = new HeaderComponent('os-header');
        const topCta = new CTAComponent('os-action-top', topConfig);
        const editorial = new EditorialComponent('os-editorial');
        const related = new RelatedComponent('os-related');
        const bottomCta = new CTAComponent('os-action-bottom', bottomConfig);

        Renderer.mount(hero, game);
        Renderer.mount(header, game);
        Renderer.mount(topCta, game);
        if (mainComponent) Renderer.mount(mainComponent, game);
        if (secondaryComponent) Renderer.mount(secondaryComponent, game);
        Renderer.mount(editorial, game);
        Renderer.mount(related, game);
        Renderer.mount(bottomCta, game);
    },

    async loadMatchStage(fixtureId) {
        Logger.info(`Assembling Match Stage for ID: ${fixtureId}`);
        NavigationManager.showPageLoader();
        let game = null;
        if (fixtureId) game = await APIManager.getFixture(fixtureId);
        NavigationManager.hidePageLoader();

        if (!game || game._error) return this.renderGlobalError('os-primary', game ? game._error : 'missing');

        this.renderSharedShell(game, 
            new MatchStatsComponent('os-primary'), 
            new WidgetsComponent('os-secondary'),
            { label: 'WATCH LIVE STREAM', icon: 'fa-play-circle', variant: 'top', urlType: 'stream' },
            { label: 'WATCH LIVE STREAM', icon: 'fa-play-circle', variant: 'bottom', urlType: 'stream' }
        );
    },

    async loadStreamStage(fixtureId) {
        Logger.info(`Assembling Stream Stage for ID: ${fixtureId}`);
        NavigationManager.showPageLoader();
        let game = null;
        if (fixtureId) game = await APIManager.getFixture(fixtureId);
        NavigationManager.hidePageLoader();

        if (!game || game._error) return this.renderGlobalError('os-primary', game ? game._error : 'missing');

        this.renderSharedShell(game, 
            new StreamPlayerComponent('os-primary'), 
            new ServerListComponent('os-secondary'),
            { label: 'CONTINUE TO PLAYER', icon: 'fa-forward', variant: 'top', urlType: 'player' },
            { label: 'CONTINUE TO PLAYER', icon: 'fa-forward', variant: 'bottom', urlType: 'player' }
        );
    },

    async loadPlayerStage(fixtureId) {
        Logger.info(`Assembling Watch Stage for ID: ${fixtureId}`);
        NavigationManager.showPageLoader();
        let game = null;
        if (fixtureId) game = await APIManager.getFixture(fixtureId);
        NavigationManager.hidePageLoader();
        
        if (!game || game._error) return this.renderGlobalError('os-primary', game ? game._error : 'missing');

        this.renderSharedShell(game, 
            new EmbeddedPlayerComponent('os-primary'), 
            new PlayerWidgetsComponent('os-secondary'),
            { label: 'REFRESH PLAYER', icon: 'fa-sync', variant: 'top', urlType: 'player' },
            { label: 'ALL MATCHES', icon: 'fa-home', variant: 'bottom', urlType: 'home' }
        );
    }
};

/**
 * 10. ROUTER
 * Parses the DOM to detect the active stage and triggers the Stage Manager.
 */
const Router = {
    init() {
        Logger.info("Router initialized.");
        const rootElement = document.getElementById("onesports-page");
        
        if (!rootElement) {
            Logger.info("No #onesports-page found. Running framework in generic mode.");
            return;
        }

        // Read routing data attributes
        const stage = rootElement.dataset.stage;
        const fixtureId = rootElement.dataset.fixture || rootElement.dataset.id;
        const streamId = rootElement.dataset.stream;
        const playerId = rootElement.dataset.player;

        // Route to the appropriate Stage
        switch(stage) {
            case "match":
                StageManager.loadMatchStage(fixtureId);
                break;
            case "stream":
                StageManager.loadStreamStage(streamId, fixtureId);
                break;
            case "player":
                StageManager.loadPlayerStage(playerId);
                break;
            default:
                Logger.warn(`Unknown stage type detected: ${stage}`);
                break;
        }
    }
};

/**
 * 11. APPLICATION
 * Main entry point. Bootstraps all subsystems.
 */
class Application {
    constructor() {
        this.version = "1.0";
        this.initialized = false;
    }

    init() {
        if (this.initialized) return;
        
        try {
            // Apply global configurations if available from the XML <head>
            const config = window.OneSports || {};
            
            // Initialize Core Systems
            Logger.init();
            ErrorHandler.init();
            ThemeManager.init();
            NavigationManager.init();
            
            // Wait for DOM Content to be fully loaded before routing
            if (document.readyState === "loading") {
                document.addEventListener("DOMContentLoaded", () => Router.init());
            } else {
                Router.init();
            }

            this.initialized = true;
            Logger.info("OneSports Application Framework loaded successfully.");

        } catch (error) {
            ErrorHandler.handle(error, "Application Initialization");
        }
    }
}

// =========================================================
// BOOTSTRAP
// =========================================================
const app = new Application();
app.init();
