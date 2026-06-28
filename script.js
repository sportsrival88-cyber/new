// api.js
const API = {
    inFlightRequests: {},

    /**
     * Fetches JSON from a URL. Ensures the exact same URL isn't requested twice concurrently.
     * @param {string} url 
     * @returns {Promise<any>}
     */
    async fetchJSON(url) {
        if (this.inFlightRequests[url]) {
            return this.inFlightRequests[url];
        }

        const requestPromise = fetch(url).then(response => {
            if (!response.ok) throw new Error("API Network Error");
            return response.json();
        }).finally(() => {
            delete this.inFlightRequests[url];
        });

        this.inFlightRequests[url] = requestPromise;
        return requestPromise;
    }
};
// cache.js
const Cache = {
    TTLs: {
        today: 60 * 1000,           // 60 seconds
        yesterday: 5 * 60 * 1000,   // 5 minutes
        tomorrow: 5 * 60 * 1000,    // 5 minutes
        standings: 10 * 60 * 1000,  // 10 minutes
        leaderboards: 10 * 60 * 1000 // 10 minutes
    },

    /**
     * @param {string} key Unique cache identifier
     * @param {string} url URL to fetch
     * @param {number} ttlMs Time to live in milliseconds
     * @param {Function} callback Function to call with data (data, isCached)
     */
    async staleWhileRevalidate(key, url, ttlMs, callback) {
        const cachedItem = localStorage.getItem(key);
        let parsedCache = null;
        let isStale = true;

        if (cachedItem) {
            try {
                parsedCache = JSON.parse(cachedItem);
                const age = Date.now() - parsedCache.timestamp;
                isStale = age > ttlMs;
                
                // Immediately yield cached data to achieve FCP < 1s
                callback(parsedCache.data, true);
            } catch (e) {
                console.error("Cache parsing error", e);
            }
        }

        // If stale or missing, fetch fresh data quietly in background
        if (isStale || !parsedCache) {
            try {
                const freshData = await API.fetchJSON(url);
                
                // Simple equality check to prevent unnecessary repaints
                if (!parsedCache || JSON.stringify(parsedCache.data) !== JSON.stringify(freshData)) {
                    localStorage.setItem(key, JSON.stringify({
                        timestamp: Date.now(),
                        data: freshData
                    }));
                    callback(freshData, false);
                }
            } catch (error) {
                console.error("Background fetch failed for", key, error);
                // If it fails but we had cached data, we already rendered it, so we do nothing.
                if (!parsedCache) {
                    callback({ error: true, message: error.message }, false);
                }
            }
        }
    }
};
// helpers.js
const Helpers = {
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
    },

    getDateString(offsetDays) {
        const date = new Date();
        date.setDate(date.getDate() + offsetDays);
        const dd = String(date.getDate()).padStart(2, '0');
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const yyyy = date.getFullYear();
        return `${dd}/${mm}/${yyyy}`;
    },

    getTimeAgo(dateString) {
        const diffMs = Date.now() - new Date(dateString).getTime();
        const diffMins = Math.floor(diffMs / 60000);
        if (diffMins < 60) return `${diffMins} Minutes Ago`;
        const diffHours = Math.floor(diffMins / 60);
        if (diffHours < 24) return `${diffHours} Hours Ago`;
        return `${Math.floor(diffHours / 24)} Days Ago`;
    },

    getMatchUrl(dateStr) {
        return `https://webws.365scores.com/web/games/allscores/?appTypeId=5&langId=1&timezoneName=Asia%2FCalcutta&userCountryId=80&startDate=${encodeURIComponent(dateStr)}&endDate=${encodeURIComponent(dateStr)}&showOdds=true&onlyMajorGames=true&withTop=true`;
    },

    getLogoUrl(id, version = 1) {
        return `https://imagecache.365scores.com/image/upload/f_png,w_80,h_80,c_limit,q_auto:eco,d_Competitors:default1.png/v${version}/Competitors/${id}`;
    },

    getPlayerPhotoUrl(id, version = 1) {
        return `https://imagecache.365scores.com/image/upload/f_png,w_100,h_100,c_limit,q_auto:eco,d_Athletes:default1.png/v${version}/Athletes/${id}`;
    },

    initLazyLoading() {
        // Only select images that haven't been observed yet to prevent multiple observers from racing
        const lazyImages = document.querySelectorAll('img[data-src]:not(.is-observed)');
        if ('IntersectionObserver' in window) {
            const imageObserver = new IntersectionObserver((entries, observer) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        const img = entry.target;
                        // Extra safety check to ensure data-src still exists
                        if (img.dataset.src) {
                            img.src = img.dataset.src;
                            img.removeAttribute('data-src');
                            img.classList.add('fade-in');
                        }
                        imageObserver.unobserve(img);
                    }
                });
            }, { rootMargin: '50px 0px', threshold: 0.01 });

            lazyImages.forEach(img => {
                img.classList.add('is-observed');
                imageObserver.observe(img);
            });
        } else {
            // Fallback
            lazyImages.forEach(img => {
                if (img.dataset.src) {
                    img.src = img.dataset.src;
                    img.removeAttribute('data-src');
                }
            });
        }
    }
};
// fixtures.js
const Fixtures = {
    currentSport: 'All',

    getFilteredGames(data) {
        if (!data || !data.games) return [];
        return data.games.filter(game => {
            const comp = data.competitions && data.competitions.find(c => c.id === game.competitionId);
            const compName = comp ? comp.name.toLowerCase() : '';
            const isF1 = compName.includes('formula') || compName.includes('f1');
            
            if (this.currentSport === 'All') {
                return (game.sportId === 1 && game.competitionId === 5930) || isF1;
            } else if (this.currentSport === 'Football') {
                return game.sportId === 1 && game.competitionId === 5930;
            } else if (this.currentSport === 'Cricket') {
                // Temporarily blocking all cricket matches per user request
                return false; 
                // return game.sportId === 10 || game.sportId === 11 || game.sportId === 27;
            }
            return false;
        });
    },

    renderSkeletons() {
        const container = document.getElementById('matches-container');
        container.innerHTML = `
            <div class="skeleton-card"></div>
            <div class="skeleton-card"></div>
            <div class="skeleton-card"></div>
        `;
    },

    renderError(msg) {
        const container = document.getElementById('matches-container');
        container.innerHTML = `
            <div style="background:var(--card-bg); padding:20px; border-radius:16px; border:1px solid var(--glass-border); text-align:center;">
                <p class="primary-text"><i class="fas fa-exclamation-triangle"></i> Failed to load matches.</p>
                <p style="color: red; font-size: 12px; margin-top: 10px;">${msg}</p>
            </div>`;
    },

    render(data, isCached, offsetDays) {
        const container = document.getElementById('matches-container');
        if (data.error) {
            this.renderError(data.message);
            return;
        }

        if (!data || !data.games) return;

        const activeGames = this.getFilteredGames(data);

        // Sort matches: Live first, Scheduled next, Ended last.
        activeGames.sort((a, b) => {
            const getStatusRank = (game) => {
                if (game.statusGroup === 2 || game.statusGroup === 3 || game.shortStatusText === 'Live' || game.statusText === "1st Half" || game.statusText === "2nd Half") {
                    return 1; // Live
                } else if (game.statusText === "Ended" || game.statusGroup === 4) {
                    return 3; // Ended
                }
                return 2; // Scheduled
            };
            const rankA = getStatusRank(a);
            const rankB = getStatusRank(b);
            
            if (rankA !== rankB) return rankA - rankB;
            return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
        });

        if (activeGames.length === 0) {
            let emptyMsg = `No ${this.currentSport !== 'All' ? this.currentSport : ''} matches found for ${Helpers.getDateString(offsetDays)}.`;
            if (this.currentSport === 'Cricket') {
                emptyMsg = `No schedules found for cricket matches.`;
            }
            container.innerHTML = `
                <div style="background:var(--card-bg); padding:30px; border-radius:16px; border:1px solid var(--glass-border); text-align:center;">
                    <i class="fas fa-calendar-times" style="font-size:3rem; color:var(--text-muted); margin-bottom:15px;"></i>
                    <p>${emptyMsg}</p>
                </div>`;
            return;
        }

        let html = "";
        activeGames.forEach(game => {
            const isLive = game.statusGroup === 2 || game.statusGroup === 3 || game.shortStatusText === 'Live' || game.statusText === "1st Half" || game.statusText === "2nd Half";
            const statusClass = isLive ? 'match-status live' : 'match-status';
            
            const homeLogoUrl = Helpers.getLogoUrl(game.homeCompetitor.id, game.homeCompetitor.imageVersion || 1);
            const awayLogoUrl = Helpers.getLogoUrl(game.awayCompetitor.id, game.awayCompetitor.imageVersion || 1);

            const homeScore = game.homeCompetitor.score !== undefined && game.homeCompetitor.score !== -1 ? game.homeCompetitor.score : "-";
            const awayScore = game.awayCompetitor.score !== undefined && game.awayCompetitor.score !== -1 ? game.awayCompetitor.score : "-";
            const timeText = game.gameTimeDisplay || game.shortStatusText || "Scheduled";

            const comp = data.competitions && data.competitions.find(c => c.id === game.competitionId);
            const compName = comp ? comp.name : (game.sportId === 1 ? 'FIFA WORLD CUP' : 'CRICKET MATCH');
            const compLogo = `https://imagecache.365scores.com/image/upload/f_png,w_24,h_24,c_limit,q_auto:eco/v1/Competitions/${game.competitionId}`;
            
            const roundText = game.groupName || (game.roundName && game.roundName !== "Round" ? game.roundName : (game.stageName && game.stageName !== "Group Stage" ? game.stageName : ""));

            const matchName = `${game.homeCompetitor.name} vs ${game.awayCompetitor.name}`;
            let matchUrl = "";
            if (window.MatchLinks) {
                if (window.MatchLinks[matchName]) matchUrl = window.MatchLinks[matchName];
                else if (window.MatchLinks[game.id]) matchUrl = window.MatchLinks[game.id];
            }
            const clickAttr = matchUrl ? `onclick="window.location.href='${matchUrl}'"` : '';
            const cursorStyle = matchUrl ? 'cursor: pointer;' : '';

            html += `
            <div class="match-card" id="match-${game.id}" data-start-time="${new Date(game.startTime).getTime()}" data-status="${game.statusText}" ${clickAttr} style="position: relative; overflow: hidden; ${cursorStyle}">
                <!-- Background Flag Fills -->
                <div class="card-bg-flag left" style="background-image: url('${homeLogoUrl}')"></div>
                <div class="card-bg-flag right" style="background-image: url('${awayLogoUrl}')"></div>
                
                <!-- Content layer -->
                <div style="position: relative; z-index: 2;">
                    <div class="match-header" style="position: relative; justify-content: center;">
                        <div style="display:flex; align-items:center; position: absolute; left: 0;"><img src="${compLogo}" alt="Cup" style="width:14px; height:14px; margin-right:6px; border-radius:2px;"> <span style="text-transform: uppercase; color: var(--primary); font-weight: bold;">${compName}</span></div>
                        <div style="font-family: var(--font-heading); font-weight: 900; letter-spacing: 1px; color: var(--text-muted); font-size: 0.8rem; opacity: 0.5;">ONE<span style="color:var(--primary);">SPORTS</span></div>
                        ${roundText ? `<div style="position: absolute; right: 0; font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; font-weight: 700;">${roundText}</div>` : ''}
                    </div>

                    <div class="match-teams-score">
                        <div class="team">
                            <!-- LAZY LOAD IMAGES -->
                            <img data-src="${homeLogoUrl}" alt="${game.homeCompetitor.name}">
                            <div class="team-name">${game.homeCompetitor.name}</div>
                        </div>

                        <div class="score-area">
                            ${game.statusText === "Scheduled" ? `
                                <div class="center-status-indicator countdown-pill">Loading...</div>
                            ` : (() => {
                                const isHalfTime = game.statusText === "Half Time" || game.shortStatusText === "HT" || game.gameTimeDisplay === "Half Time";
                                const pillClass = isHalfTime ? "center-status-indicator countdown-pill" : `center-status-indicator live-timer-pill ${isLive ? 'live' : ''}`;
                                const displayTime = isHalfTime ? "HT" : (isLive ? Helpers.getLiveTime(game) : game.statusText);
                                return `
                                    <div class="score-text">${homeScore} - ${awayScore}</div>
                                    <div class="${pillClass}">${displayTime}</div>
                                `;
                            })()}
                        </div>

                        <div class="team">
                            <img data-src="${awayLogoUrl}" alt="${game.awayCompetitor.name}">
                            <div class="team-name">${game.awayCompetitor.name}</div>
                        </div>
                    </div>
                </div>
            </div>
            `;
        });

        container.innerHTML = html;
        Helpers.initLazyLoading();
    },

    loadDay(offsetDays, isMainDisplay = true) {
        if (isMainDisplay) this.renderSkeletons();
        
        const dateStr = Helpers.getDateString(offsetDays);
        const url = Helpers.getMatchUrl(dateStr);
        let ttlMs = Cache.TTLs.today;
        
        if (offsetDays === -1) ttlMs = Cache.TTLs.yesterday;
        if (offsetDays === 1) ttlMs = Cache.TTLs.tomorrow;
        
        const cacheKey = `fixtures_${dateStr}`;
        
        return new Promise(resolve => {
            Cache.staleWhileRevalidate(cacheKey, url, ttlMs, (data, isCached) => {
                if (isMainDisplay) this.render(data, isCached, offsetDays);
                resolve(data);
            });
        });
    }
};
// standings.js
const Standings = {
    allRows: [],
    currentGroupNum: 1, // 1 = Group A, 2 = Group B, etc.

    getGroupName(num) {
        return "Group " + String.fromCharCode(64 + num); // 1->A, 2->B
    },

    getFormBadges(recentFormArray) {
        // Form array usually [1, 2, 3] where 1=Win, 2=Loss, 3=Draw (Standard 365Scores mapping: 1=W, 2=L, 3=D or similar. Let's map dynamically if needed, but the user said W/D/L colored badges)
        if (!recentFormArray) return "";
        let html = '<div class="form-badges">';
        recentFormArray.slice(0,3).forEach(f => {
            if (f === 1) html += '<span class="badge win">W</span>';
            else if (f === 3 || f === 0) html += '<span class="badge draw">D</span>';
            else html += '<span class="badge loss">L</span>';
        });
        html += '</div>';
        return html;
    },

    render() {
        const tbody = document.getElementById('standings-body');
        if (!this.allRows.length) return;

        const groupRows = this.allRows.filter(r => r.groupNum === this.currentGroupNum);
        
        if (groupRows.length === 0) {
            tbody.innerHTML = `<tr><td colspan="9" class="text-center muted-text" style="padding:20px;">No data for ${this.getGroupName(this.currentGroupNum)}</td></tr>`;
            return;
        }

        groupRows.sort((a,b) => a.position - b.position);

        let html = "";
        groupRows.forEach(row => {
            const c = row.competitor;
            const flagUrl = Helpers.getLogoUrl(c.id, c.imageVersion || 1);
            const isQualified = row.position <= 2; // Typically top 2 qualify
            const rowClass = isQualified ? 'qualified-row' : '';
            const leaderClass = row.position === 1 ? 'current-leader' : '';

            html += `
            <tr class="${rowClass} ${leaderClass}">
                <td style="text-align:center;">${row.position}</td>
                <td>
                    <div style="display:flex; align-items:center; gap:10px;">
                        <img data-src="${flagUrl}" width="24" height="24" style="border-radius:50%; object-fit:cover;">
                        <span style="font-weight:600;">${c.name}</span>
                    </div>
                </td>
                <td>${row.gamePlayed}</td>
                <td>${row.gamesWon}</td>
                <td>${row.gamesEven}</td>
                <td>${row.gamesLost}</td>
                <td>${row.for - row.against > 0 ? '+' : ''}${row.for - row.against}</td>
                <td style="font-weight:bold; color:var(--secondary);">${row.points}</td>
                <td>${this.getFormBadges(row.recentForm)}</td>
            </tr>
            `;
        });

        tbody.innerHTML = html;
        Helpers.initLazyLoading();
    },

    load() {
        return new Promise(resolve => {
            const url = "https://webws.365scores.com/web/standings/?appTypeId=5&langId=1&timezoneName=Asia%2FCalcutta&userCountryId=80&competitions=5930&live=false&withSeasonsFilter=true";
            Cache.staleWhileRevalidate("wc_standings", url, Cache.TTLs.standings, (data) => {
                if (data && data.standings && data.standings.length > 0) {
                    this.allRows = data.standings[0].rows || [];
                    this.render();
                }
                resolve(data);
            });
        });
    }
};
// leaderboards.js
const Leaderboards = {
    allStats: [],
    currentTab: 'Goals', // or 'Assists'

    render() {
        const container = document.getElementById('leaderboard-container');
        if (!this.allStats || this.allStats.length === 0) return;

        const targetStat = this.allStats.find(a => a.name === this.currentTab);
        if (!targetStat || !targetStat.rows) {
            container.innerHTML = `<div class="muted-text text-center" style="padding:20px;">No ${this.currentTab} data available.</div>`;
            return;
        }

        let html = "";
        const top5 = targetStat.rows.slice(0, 5);

        top5.forEach((row, index) => {
            const rank = index + 1;
            const e = row.entity;
            const photoUrl = Helpers.getPlayerPhotoUrl(e.id, e.imageVersion || 1);
            const flagUrl = Helpers.getLogoUrl(e.competitorId, e.imageVersion || 1); // fallback to 1 if team version not easily available, but wait, usually athletes have imageVersion. Let's just pass 1 for flag if not available on e.
            
            // The primary stat value is typically the first item in row.stats array for Goals/Assists
            const statValue = row.stats && row.stats.length > 0 ? row.stats[0].value : 0;

            let rankClass = "rank-badge";
            if (rank === 1) rankClass += " gold";
            if (rank === 2) rankClass += " silver";
            if (rank === 3) rankClass += " bronze";

            html += `
            <div class="player-card glass-card">
                <div class="player-rank">
                    <span class="${rankClass}">${rank}</span>
                </div>
                <img data-src="${photoUrl}" class="player-photo" alt="${e.name}">
                <div class="player-info">
                    <div class="player-name">${e.name}</div>
                    <div class="player-country">
                        <img data-src="${flagUrl}" width="16" height="16" style="border-radius:2px;">
                        <span class="muted-text">${e.positionShortName || e.positionName || "Player"}</span>
                    </div>
                </div>
                <div class="player-stat-value">
                    <span class="stat-number count-up">${statValue}</span>
                    ${this.currentTab === 'Assists' ? '<div class="assist-img-icon"></div>' : '<i class="fas fa-futbol goal-icon"></i>'}
                </div>
            </div>
            `;
        });

        container.innerHTML = html;
        Helpers.initLazyLoading();
    },

    load() {
        return new Promise(resolve => {
            const url = "https://webws.365scores.com/web/stats/?appTypeId=5&langId=1&timezoneName=Asia%2FCalcutta&userCountryId=80&competitions=5930&competitors=&withSeasons=true";
            Cache.staleWhileRevalidate("wc_leaderboards", url, Cache.TTLs.leaderboards, (data) => {
                if (data && data.stats && data.stats.athletesStats) {
                    this.allStats = data.stats.athletesStats;
                    this.render();
                }
                resolve(data);
            });
        });
    }
};
// News Section
const News = {
    async load() {
        try {
            const baseUrl = `https://webws.365scores.com/web/news/?appTypeId=5&langId=1&timezoneName=Asia%2FCalcutta&userCountryId=80`;
            const [footballRes, cricketRes] = await Promise.all([
                fetch(`${baseUrl}&sports=1`).then(r => r.json()),
                fetch(`${baseUrl}&sports=11`).then(r => r.json())
            ]);
            
            const container = document.getElementById('news-container');
            if (!container) return;
            
            let allNews = [];
            const sources = {};
            
            if (footballRes.news) allNews = allNews.concat(footballRes.news);
            if (cricketRes.news) allNews = allNews.concat(cricketRes.news);
            
            if (footballRes.newsSources) footballRes.newsSources.forEach(s => sources[s.id] = s.name);
            if (cricketRes.newsSources) cricketRes.newsSources.forEach(s => sources[s.id] = s.name);
            
            if (allNews.length === 0) {
                document.querySelector('.news-section').style.display = 'none';
                return;
            }
            
            let html = "";
            
            // Limit to exactly 6 news articles (3 at top, 3 at bottom in a 3-column grid)
            const articles = allNews.slice(0, 6);
            
            articles.forEach(article => {
                const sourceName = sources[article.sourceId] || "News";
                const timeAgo = Helpers.getTimeAgo(article.publishDate);
                const imageUrl = article.image || "https://imagecache.365scores.com/image/upload/f_png,w_300,h_150,c_fill,q_auto:eco/v1/Backgrounds/1";
                
                html += `
                <a href="${article.url}" target="_blank" class="news-card">
                    <img src="${imageUrl}" alt="News" class="news-image">
                    <div class="news-content">
                        <div class="news-title">${article.title}</div>
                        <div class="news-meta">
                            <span>${sourceName}</span>
                            <span>${timeAgo}</span>
                        </div>
                    </div>
                </a>
                `;
            });
            
            container.innerHTML = html;
        } catch (err) {
            console.error("Failed to load news", err);
            document.querySelector('.news-section').style.display = 'none';
        }
    }
};

// LiveUpdater
const LiveUpdater = {
    pollingInterval: null,
    countdownInterval: null,

    start() {
        this.startCountdown();
        this.startPolling();
    },

    startCountdown() {
        if (this.countdownInterval) clearInterval(this.countdownInterval);
        this.countdownInterval = setInterval(() => {
            const now = Date.now();
            const scheduledCards = document.querySelectorAll('.match-card[data-status="Scheduled"]');
            
            scheduledCards.forEach(card => {
                const startTime = parseInt(card.getAttribute('data-start-time'), 10);
                if (!startTime) return;
                
                const diff = startTime - now;
                const statusIndicator = card.querySelector('.center-status-indicator');
                if (!statusIndicator) return;
                
                if (diff <= 0) {
                    statusIndicator.innerText = "Starting...";
                } else {
                    const hours = Math.floor(diff / (1000 * 60 * 60));
                    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                    const secs = Math.floor((diff % (1000 * 60)) / 1000);
                    
                    let timeStr = "";
                    if (hours > 24) {
                        const days = Math.floor(hours / 24);
                        timeStr = `${days}d ${hours % 24}h`;
                    } else if (hours > 0) {
                        timeStr = `${hours}h ${mins}m ${secs}s`;
                    } else {
                        timeStr = `${mins.toString().padStart(2, '0')}m ${secs.toString().padStart(2, '0')}s`;
                    }
                    
                    if (timeStr !== statusIndicator.innerText) {
                        statusIndicator.innerText = timeStr;
                    }
                }
            });
        }, 1000);
    },

    startPolling() {
        if (this.pollingInterval) clearInterval(this.pollingInterval);
        this.pollingInterval = setInterval(async () => {
            try {
                const dateStr = Helpers.getDateString(0);
                const url = `https://webws.365scores.com/web/games/allscores/?appTypeId=5&langId=1&timezoneName=Asia%2FCalcutta&userCountryId=80&startDate=${dateStr}&endDate=${dateStr}&showOdds=true&onlyMajorGames=true&withTop=true`;
                
                const response = await fetch(url);
                const data = await response.json();
                
                const activeGames = Fixtures.getFilteredGames(data);
                
                activeGames.forEach(game => {
                    const card = document.getElementById(`match-${game.id}`);
                    if (!card) return;
                    
                    card.setAttribute('data-status', game.statusText);
                    const isLive = game.statusGroup === 2 || game.statusGroup === 3 || game.shortStatusText === 'Live' || game.statusText === "1st Half" || game.statusText === "2nd Half";
                    
                    const scoreAreaContainer = card.querySelector('.score-area');
                    if (game.statusText !== "Scheduled" && scoreAreaContainer) {
                        let scoreText = scoreAreaContainer.querySelector('.score-text');
                        let statusIndicator = scoreAreaContainer.querySelector('.center-status-indicator');
                        
                        const homeScore = game.homeCompetitor.score !== undefined && game.homeCompetitor.score !== -1 ? game.homeCompetitor.score : "-";
                        const awayScore = game.awayCompetitor.score !== undefined && game.awayCompetitor.score !== -1 ? game.awayCompetitor.score : "-";
                        
                        const isHalfTime = game.statusText === "Half Time" || game.shortStatusText === "HT" || game.gameTimeDisplay === "Half Time";
                        const pillClass = isHalfTime ? "center-status-indicator countdown-pill" : `center-status-indicator live-timer-pill ${isLive ? 'live' : ''}`;
                        const displayTime = isHalfTime ? "HT" : (isLive ? Helpers.getLiveTime(game) : game.statusText);

                        if (!scoreText) {
                            scoreAreaContainer.innerHTML = `
                                <div class="score-text">${homeScore} - ${awayScore}</div>
                                <div class="${pillClass}">${displayTime}</div>
                            `;
                        } else {
                            if (scoreText.innerText !== `${homeScore} - ${awayScore}`) {
                                scoreText.innerText = `${homeScore} - ${awayScore}`;
                                scoreText.classList.add('fade-in'); 
                            }
                            if (statusIndicator) {
                                statusIndicator.className = pillClass;
                                statusIndicator.innerText = displayTime;
                            }
                        }
                    }
                });
            } catch (err) {
                console.error("Polling failed", err);
            }
        }, 5000); // 5 seconds
    }
};

// ui.js
const UI = {
    init() {
        // Theme Toggle Logic
        const themeToggle = document.getElementById('theme-toggle');
        if (themeToggle) {
            if (localStorage.getItem('theme') === 'light') {
                document.body.classList.add('light-mode');
                themeToggle.classList.remove('fa-moon');
                themeToggle.classList.add('fa-sun');
            }
            themeToggle.addEventListener('click', () => {
                document.body.classList.toggle('light-mode');
                const isLight = document.body.classList.contains('light-mode');
                
                if (isLight) {
                    themeToggle.classList.remove('fa-moon');
                    themeToggle.classList.add('fa-sun');
                    localStorage.setItem('theme', 'light');
                } else {
                    themeToggle.classList.remove('fa-sun');
                    themeToggle.classList.add('fa-moon');
                    localStorage.setItem('theme', 'dark');
                }
            });
        }

        // Mobile menu logic
        const menuOverlay = document.getElementById('mobile-menu-overlay');
        const sideMenu = document.getElementById('mobile-side-menu');
        const openMenuBtn = document.getElementById('open-menu');
        const closeMenuBtn = document.getElementById('close-menu');
        
        if (openMenuBtn) {
            openMenuBtn.addEventListener('click', () => {
                menuOverlay.classList.add('active');
                sideMenu.classList.add('active');
            });
        }
        
        if (closeMenuBtn) {
            closeMenuBtn.addEventListener('click', () => {
                menuOverlay.classList.remove('active');
                sideMenu.classList.remove('active');
            });
        }
        
        if (menuOverlay) {
            menuOverlay.addEventListener('click', () => {
                menuOverlay.classList.remove('active');
                sideMenu.classList.remove('active');
            });
        }

        // Date Tabs (Yesterday, Today, Tomorrow)
        const dateTabs = document.querySelectorAll('.date-filters .filter-tab');
        dateTabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                if (e.target.classList.contains('active')) return; // Already active

                dateTabs.forEach(t => t.classList.remove('active'));
                e.target.classList.add('active');
                
                const day = e.target.getAttribute('data-day');
                let offset = 0;
                if (day === 'yesterday') offset = -1;
                else if (day === 'tomorrow') offset = 1;

                Fixtures.loadDay(offset, true);
            });
        });

        // Sport Tabs
        const sportTabs = document.querySelectorAll('.sport-filters .sport-pill');
        sportTabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                const btn = e.target.closest('.sport-pill');
                if (!btn || btn.classList.contains('active')) return;

                sportTabs.forEach(t => t.classList.remove('active'));
                btn.classList.add('active');
                
                Fixtures.currentSport = btn.getAttribute('data-sport');
                
                const activeDateTab = document.querySelector('.date-filters .filter-tab.active');
                let offset = 0;
                if (activeDateTab) {
                    const day = activeDateTab.getAttribute('data-day');
                    if (day === 'yesterday') offset = -1;
                    else if (day === 'tomorrow') offset = 1;
                }
                Fixtures.loadDay(offset, true);
            });
        });

        // Standings Group Selector
        const groupSelector = document.getElementById('group-selector');
        if (groupSelector) {
            groupSelector.addEventListener('change', (e) => {
                // 'A' is charCode 65, which is index 1.
                Standings.currentGroupNum = e.target.value.charCodeAt(0) - 64; 
                Standings.render();
            });
        }

        // Leaderboards Tabs
        const statsTabs = document.querySelectorAll('.stats-filters .filter-tab');
        statsTabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                if (e.target.classList.contains('active')) return;

                statsTabs.forEach(t => t.classList.remove('active'));
                e.target.classList.add('active');
                
                Leaderboards.currentTab = e.target.getAttribute('data-stat');
                Leaderboards.render();
            });
        });
    }
};
// router.js
// ==========================================
// PAGE INITIALIZATION ARCHITECTURE
// ==========================================
const PageManager = {
    
    detectPageType() {
        if (document.getElementById('matches-container')) {
            return 'homepage';
        }
        // Blogger dynamically adds 'post' or we have our custom 'blog-content'
        if (document.querySelector('.post') || document.getElementById('blog-content') || document.getElementById('comments')) {
            return 'article';
        }
        return 'static'; // Default fallback for informational pages (About, Terms, etc)
    },

    async init() {
        // 1. Always initialize Navbar/Footer UI elements (Theme toggles, mobile menu)
        if (window.UI) UI.init();
        
        // 2. Initialize global social links
        if (window.SocialLinks) {
            const tgBtn = document.getElementById('telegram-link');
            const waBtn = document.getElementById('whatsapp-link');
            if (tgBtn && window.SocialLinks.Telegram) tgBtn.href = window.SocialLinks.Telegram;
            if (waBtn && window.SocialLinks.WhatsApp) waBtn.href = window.SocialLinks.WhatsApp;
        }

        const pageType = this.detectPageType();
        console.log(PageManager: Detected [\$pageType\] page.);

        switch(pageType) {
            case 'homepage':
                await this.initHomepage();
                break;
            case 'article':
                this.initArticle();
                break;
            case 'static':
                this.initStaticPage();
                break;
        }
    },

    async initHomepage() {
        // Strict Sequential Loading with Tomorrow fallback logic
        try {
            Fixtures.renderSkeletons();
            
            const todayData = await Fixtures.loadDay(0, false);
            const activeGames = Fixtures.getFilteredGames(todayData);
            
            const allEnded = activeGames.length > 0 && activeGames.every(g => g.statusText === "Ended");
            const noGames = activeGames.length === 0;

            if (allEnded || noGames) {
                const tabs = document.querySelectorAll('.date-filters .filter-tab');
                tabs.forEach(t => t.classList.remove('active'));
                const tomorrowTab = Array.from(tabs).find(t => t.getAttribute('data-day') === "tomorrow");
                if(tomorrowTab) tomorrowTab.classList.add('active');
                
                await Fixtures.loadDay(1, true);   // 1. Tomorrow (Active)
            } else {
                Fixtures.render(todayData, true, 0); // 1. Today (Active)
                await Fixtures.loadDay(1, false);    // 2. Tomorrow (Background)
            }

            await Fixtures.loadDay(-1, false); // 3. Yesterday
            await Standings.load();            // 4. Standings
            await Leaderboards.load();         // 5. Goals & Assists
            await News.load();                 // 6. Live Football News
        } catch (err) {
            console.error("Sequential load failed:", err);
        }

        LiveUpdater.start();
    },

    initArticle() {
        // Place future article-level enhancements here (e.g. related posts, image lazy loading)
        console.log("Article-specific enhancements initialized.");
    },

    initStaticPage() {
        // Place future static-page scripts here
        console.log("Static page initialized.");
    }
};

// Start application
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => PageManager.init());
} else {
    PageManager.init();
}
