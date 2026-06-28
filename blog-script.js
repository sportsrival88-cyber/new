}

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

// ==========================================
// ARTICLE SHELL INITIALIZATION
// ==========================================
const PageManager = {
    
    detectPageType() {
        if (document.querySelector('.post') || document.getElementById('blog-content') || document.getElementById('comments')) {
            return 'article';
        }
        return 'static'; // Default fallback for informational pages (About, Terms, etc)
    },

    init() {
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
        console.log(`PageManager: Detected [${pageType}] page.`);

        if (pageType === 'article') {
            this.initArticle();
        } else {
            this.initStaticPage();
        }
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
