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
