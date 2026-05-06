/**
 * ============================================
 * Main JavaScript File
 * Platform: Kids Learning Platform
 * ============================================ */

// ============================================
// Theme Toggle Functionality
// ============================================
class ThemeManager {
    constructor() {
        this.themeToggle = document.getElementById('themeToggle');
        this.body = document.body;
        this.icon = this.themeToggle?.querySelector('i');
        
        this.init();
    }

    init() {
        // Load saved theme
        this.loadTheme();
        
        // Add event listener
        if (this.themeToggle) {
            this.themeToggle.addEventListener('click', () => this.toggleTheme());
        }
    }

    toggleTheme() {
        this.body.classList.toggle('dark-mode');
        
        if (this.body.classList.contains('dark-mode')) {
            this.icon.classList.remove('fa-moon');
            this.icon.classList.add('fa-sun');
            localStorage.setItem('theme', 'dark');
        } else {
            this.icon.classList.remove('fa-sun');
            this.icon.classList.add('fa-moon');
            localStorage.setItem('theme', 'light');
        }
    }

    loadTheme() {
        const savedTheme = localStorage.getItem('theme');
        
        if (savedTheme === 'dark') {
            this.body.classList.add('dark-mode');
            this.icon.classList.remove('fa-moon');
            this.icon.classList.add('fa-sun');
        }
    }
}

// ============================================
// Scroll Animations
// ============================================
class ScrollAnimations {
    constructor() {
        this.observerOptions = {
            threshold: 0.1,
            rootMargin: "0px 0px -50px 0px"
        };
        
        this.init();
    }

    init() {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('visible');
                }
            });
        }, this.observerOptions);

        // Observe all fade-in elements
        document.querySelectorAll('.fade-in').forEach((el) => {
            observer.observe(el);
        });
    }
}

// ============================================
// Developers Modal Manager - NEW VERSION
// ============================================
class DevelopersModal {
    constructor() {
        // Elements
        this.openBtn = document.getElementById('developersBtn');
        this.modal = document.getElementById('developersModal');
        this.closeBtn = document.getElementById('modalClose');
        this.backdrop = document.getElementById('modalBackdrop');
        this.modalContent = document.getElementById('modalContent');
        
        this.developers = [
            { number: '01', name: 'نور', role: 'Frontend UI/UX Lead' },
            { number: '02', name: 'ناديا', role: 'Database' },
            { number: '03', name: 'ليلاس', role: 'statistic' },
            { number: '04', name: 'لانه', role: 'statistic' },
            { number: '05', name: 'هبه', role: 'Frontend' }
        ];
        
        this.init();
    }

    init() {
        // Event Listeners
        if (this.openBtn) {
            this.openBtn.addEventListener('click', () => this.open());
        }
        
        if (this.closeBtn) {
            this.closeBtn.addEventListener('click', () => this.close());
        }
        
        if (this.backdrop) {
            this.backdrop.addEventListener('click', () => this.close());
        }
        
        // Keyboard & Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isOpen()) {
                this.close();
            }
        });
        
        // Prevent scroll when modal is open
        this.modal?.addEventListener('click', (e) => {
            if (e.target === this.modal) {
                this.close();
            }
        });
        
        // Render content
        this.renderDevelopers();
    }

    isOpen() {
        return this.modal?.classList.contains('active');
    }

    open() {
        if (!this.modal) return;
        
        this.modal.hidden = false;
        // Force reflow for animation
        void this.modal.offsetWidth;
        this.modal.classList.add('active');
        document.body.style.overflow = 'hidden';
        
        // Focus trap for accessibility
        this.closeBtn?.focus();
        
        console.log('🎓 Developers Modal Opened');
    }

    close() {
        if (!this.modal) return;
        
        this.modal.classList.add('closing');
        
        setTimeout(() => {
            this.modal.classList.remove('active', 'closing');
            this.modal.hidden = true;
            document.body.style.overflow = '';
            this.openBtn?.focus();
            console.log('🎓 Developers Modal Closed');
        }, 300);
    }

    renderDevelopers() {
        const container = document.getElementById('developersListNew');
        if (!container) return;
        
        container.innerHTML = this.developers.map((dev) => `
            <div class="developer-card-new">
                <div class="dev-sparkle-new">✨</div>
                <div class="dev-info-new">
                    <h4 class="dev-name-new">${dev.name}</h4>
                    <p class="dev-role-new">${dev.role}</p>
                </div>
                <span class="dev-number-new">${dev.number}</span>
            </div>
        `).join('');
    }
}

// ============================================
// Smooth Scroll
// ============================================
class SmoothScroll {
    constructor() {
        this.init();
    }

    init() {
        document.querySelectorAll('a[href^="#"]').forEach(anchor => {
            anchor.addEventListener('click', function (e) {
                e.preventDefault();
                const target = document.querySelector(this.getAttribute('href'));
                if (target) {
                    target.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start'
                    });
                }
            });
        });
    }
}

// ============================================
// Navbar Scroll Effect
// ============================================
class NavbarEffect {
    constructor() {
        this.navbar = document.querySelector('.navbar');
        this.init();
    }

    init() {
        window.addEventListener('scroll', () => {
            if (window.scrollY > 100) {
                this.navbar.style.boxShadow = '0 4px 20px rgba(0,0,0,0.15)';
            } else {
                this.navbar.style.boxShadow = '0 2px 10px rgba(0,0,0,0.1)';
            }
        });
    }
}

// ============================================
// Initialize All Components
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    // Initialize all classes
    new ThemeManager();
    new ScrollAnimations();
    new DevelopersModal();
    new SmoothScroll();
    new NavbarEffect();
    
    console.log('🚀 Kids Learning Platform Initialized Successfully!');
});

// ============================================
// Utility Functions
// ============================================

/**
 * Show notification toast
 */
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('show');
    }, 100);
    
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

/**
 * Format date for Arabic locale
 */
function formatDateArabic(date) {
    return new Intl.DateTimeFormat('ar-SY', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    }).format(date);
}

/**
 * Debounce function for performance
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Export functions for use in other files (for MERN integration)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        formatDateArabic,
        debounce,
        showToast
    };
}