/**
 * api.js — طبقة الاتصال بين Frontend وBackend
 * يُضاف في جميع الصفحات: <script src="api.js"></script>
 *
 * يتواصل مع Node.js API — يدعم نفس المنفذ أو منفذ مختلف
 */

// ═══════════════════════════════════════════════════════════════
// 1. الإعداد الأساسي
// ═══════════════════════════════════════════════════════════════

// Always use a relative path — works behind nginx, on any port, and satisfies CSP
const API_BASE = '/api';

/**
 * دالة الطلب المركزية — تُضيف التوكن تلقائياً وتعالج الأخطاء
 */
async function apiRequest(endpoint, options = {}) {
    const token = localStorage.getItem('token') || localStorage.getItem('childToken');

    const config = {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...(token && { Authorization: `Bearer ${token}` }),
            ...options.headers
        }
    };

    if (config.body && typeof config.body === 'object' && !(config.body instanceof FormData)) {
        config.body = JSON.stringify(config.body);
    }

    try {
        const response = await fetch(`${API_BASE}${endpoint}`, config);
        const data = await response.json();

        // إذا انتهت صلاحية التوكن، جرّب تجديده تلقائياً
        if (response.status === 401 && data.code === 'TOKEN_EXPIRED') {
            const renewed = await renewToken();
            if (renewed) {
                config.headers.Authorization = `Bearer ${localStorage.getItem('token')}`;
                const retry = await fetch(`${API_BASE}${endpoint}`, config);
                return retry.json();
            } else {
                Auth.logout();
                return { success: false, error: 'انتهت الجلسة', code: 'SESSION_EXPIRED' };
            }
        }

        return data;

    } catch (err) {
        console.error(`❌ API Error [${endpoint}]:`, err);
        return {
            success: false,
            error: 'تعذّر الاتصال بالخادم. تأكد من تشغيل الخادم.',
            code: 'NETWORK_ERROR'
        };
    }
}

/** تجديد Access Token باستخدام Refresh Token */
async function renewToken() {
    const refreshToken = localStorage.getItem('refreshToken');
    if (!refreshToken) return false;

    try {
        const resp = await fetch(`${API_BASE}/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken })
        });
        const data = await resp.json();

        if (data.success && data.data?.token) {
            localStorage.setItem('token', data.data.token);
            return true;
        }
    } catch (e) {
        console.error('Token renewal failed:', e);
    }
    return false;
}


// ═══════════════════════════════════════════════════════════════
// 2. Auth API — التسجيل والدخول
// ═══════════════════════════════════════════════════════════════

const Auth = {

    /**
     * تسجيل ولي أمر جديد
     */
    async register(parentData, childData) {
        const reg = await apiRequest('/auth/parent/register', {
            method: 'POST',
            body: parentData
        });

        if (!reg.success) return reg;

        localStorage.setItem('token',         reg.data.token);
        localStorage.setItem('refreshToken',  reg.data.refreshToken);
        localStorage.setItem('parentId',      reg.data.parent.id);
        localStorage.setItem('parentName',    reg.data.parent.name);
        localStorage.setItem('parentEmail',   reg.data.parent.email);

        if (childData) {
            const child = await Children.create(childData);
            if (child.success) {
                localStorage.setItem('childId', child.data.id);
            }
        }

        return reg;
    },

    /**
     * تسجيل دخول ولي الأمر
     */
    async loginParent(email, password) {
        const data = await apiRequest('/auth/parent/login', {
            method: 'POST',
            body: { email, password }
        });

        if (data.success) {
            localStorage.setItem('token',         data.data.token);
            localStorage.setItem('refreshToken',  data.data.refreshToken);
            localStorage.setItem('parentId',      data.data.parent.id);
            localStorage.setItem('parentName',    data.data.parent.name);
            localStorage.setItem('parentEmail',   data.data.parent.email);

            if (data.data.children?.length > 0) {
                const firstChild = data.data.children[0];
                localStorage.setItem('childId', firstChild.id);
            }
        }

        return data;
    },

    /**
     * دخول الطفل بالـ PIN (بالمعرف)
     */
    async loginChild(childId, pin) {
        const data = await apiRequest('/auth/child/login', {
            method: 'POST',
            body: { childId, pin }
        });

        if (data.success) {
            localStorage.setItem('childToken', data.data.token);
            localStorage.setItem('childId',    data.data.child.id);
            localStorage.setItem('childName',  data.data.child.name);
            localStorage.setItem('activeChildMode', 'true');
        }

        return data;
    },

    /**
     * دخول الطفل بالاسم + PIN
     */
    async loginChildByName(name, pin) {
        const data = await apiRequest('/auth/child/login-by-name', {
            method: 'POST',
            body: { name, pin }
        });

        if (data.success) {
            localStorage.setItem('childToken', data.data.token);
            localStorage.setItem('childId',    data.data.child.id);
            localStorage.setItem('childName',  data.data.child.name);
            localStorage.setItem('childGender', data.data.child.gender || '');
            localStorage.setItem('childAge',    data.data.child.age || '');
            localStorage.setItem('activeChildMode', 'true');
            // مزامنة مع النظام القديم
            localStorage.setItem('kidsAppSession', JSON.stringify({
                type: 'child',
                id: data.data.child.id,
                name: data.data.child.name,
                avatar: '🧑‍🚀'
            }));
        }

        return data;
    },

    /**
     * ولي الأمر يحصل على توكن للطفل (بدون PIN)
     */
    async loginChildAsParent(childId) {
        const data = await apiRequest('/auth/child/token-from-parent', {
            method: 'POST',
            body: { childId }
        });

        if (data.success) {
            localStorage.setItem('childToken', data.data.token);
            localStorage.setItem('childId',    data.data.child.id);
            localStorage.setItem('childName',  data.data.child.name);
            localStorage.setItem('childGender', data.data.child.gender || '');
            localStorage.setItem('childAge',    data.data.child.age || '');
            localStorage.setItem('activeChildMode', 'true');
            localStorage.setItem('kidsAppSession', JSON.stringify({
                type: 'child',
                id: data.data.child.id,
                name: data.data.child.name,
                avatar: '🧑‍🚀'
            }));
        }

        return data;
    },

    /** تسجيل الخروج الكامل */
    logout() {
        const refreshToken = localStorage.getItem('refreshToken');
        if (refreshToken) {
            apiRequest('/auth/logout', {
                method: 'POST',
                body: { refreshToken }
            }).catch(() => {});
        }

        // ✅ لا نمسح النجوم المحفوظة — البيانات موجودة في DB
        // نمسح فقط بيانات الجلسة الحساسة
        const keysToKeep = []; // كل شيء يُحفظ في DB، لا نحتاج localStorage
        localStorage.clear();
        window.location.href = 'login.html';
    },

    /** التحقق من وجود جلسة نشطة */
    isAuthenticated() {
        return !!localStorage.getItem('token');
    },

    /** الحصول على معلومات ولي الأمر */
    getParentInfo() {
        return {
            id:    localStorage.getItem('parentId'),
            name:  localStorage.getItem('parentName'),
            email: localStorage.getItem('parentEmail')
        };
    }
};


// ═══════════════════════════════════════════════════════════════
// 3. Parents API
// ═══════════════════════════════════════════════════════════════

const Parents = {
    async getMe() { return apiRequest('/parents/me'); },
    async updateMe(data) { return apiRequest('/parents/me', { method: 'PUT', body: data }); },
    async getMyChildren() { return apiRequest('/parents/me/children'); },
    async getMyStats() { return apiRequest('/parents/me/stats'); }
};


// ═══════════════════════════════════════════════════════════════
// 4. Children API
// ═══════════════════════════════════════════════════════════════

const Children = {
    async create(data) { return apiRequest('/children', { method: 'POST', body: data }); },
    async get(id) { return apiRequest(`/children/${id}`); },
    async update(id, data) { return apiRequest(`/children/${id}`, { method: 'PUT', body: data }); },
    async getProgress(id) {
        id = id || localStorage.getItem('childId');
        // ✅ استخدام childToken إذا توفر (الطفل يطلب بياناته بنفسه)
        const childToken = localStorage.getItem('childToken');
        if (childToken) {
            return apiRequest(`/children/${id}/progress`, {
                headers: { Authorization: `Bearer ${childToken}` }
            });
        }
        return apiRequest(`/children/${id}/progress`);
    },
    async getActivities(id, params = {}) {
        const query = new URLSearchParams(params).toString();
        return apiRequest(`/children/${id}/activities${query ? '?' + query : ''}`);
    },
    async getAchievements(id) {
        id = id || localStorage.getItem('childId');
        return apiRequest(`/children/${id}/achievements`);
    },
    async getStatsSummary(id) { return apiRequest(`/children/${id}/stats/summary`); }
};


// ═══════════════════════════════════════════════════════════════
// 5. Activities API
// ═══════════════════════════════════════════════════════════════

const Activities = {
    async complete(activityType, starsEarned = 0, score = 0, durationMin = 0, metadata = {}) {
        const childToken = localStorage.getItem('childToken');
        return apiRequest('/activities/complete', {
            method: 'POST',
            headers: childToken ? { Authorization: `Bearer ${childToken}` } : {},
            body: { activityType, starsEarned, score, durationMin, metadata }
        });
    },

    async saveDrawing(imageData, title = 'رسمة جميلة') {
        const childToken = localStorage.getItem('childToken');
        return apiRequest('/activities/save-drawing', {
            method: 'POST',
            headers: childToken ? { Authorization: `Bearer ${childToken}` } : {},
            body: { imageData, title }
        });
    },

    async getLeaderboard() { return apiRequest('/activities/leaderboard'); }
};


// ═══════════════════════════════════════════════════════════════
// 5b. دالة مزامنة النشاط مع API — تستخدم من جميع الصفحات
// ═══════════════════════════════════════════════════════════════

let _syncTimer = null;
async function syncActivityToAPI(activityType, starsEarned, score, durationMin, metadata) {
    const childToken = localStorage.getItem('childToken');
    if (!childToken) {
        console.log('⚠️ No childToken, skipping API sync for:', activityType);
        return { success: false, error: 'no token' };
    }
    try {
        const result = await Activities.complete(activityType, starsEarned, score, durationMin, metadata);
        if (result.success) {
            console.log('✅ Activity synced to API:', activityType, '+' + starsEarned + '⭐');
        }
        return result;
    } catch(e) {
        console.log('⚠️ API sync failed:', e);
        return { success: false, error: e.message };
    }
}

// دالة مزامنة مع debounce لتجنب الطلبات الكثيرة
function syncActivityDebounced(activityType, starsEarned, score, durationMin, metadata) {
    clearTimeout(_syncTimer);
    _syncTimer = setTimeout(() => {
        syncActivityToAPI(activityType, starsEarned, score, durationMin, metadata);
    }, 1500);
}

// جعل الدوال متاحة عالمياً لجميع الصفحات
window.syncActivityToAPI = syncActivityToAPI;
window.syncActivityDebounced = syncActivityDebounced;


// ═══════════════════════════════════════════════════════════════
// 6. دوال التوافق مع الكود القديم (Backwards Compatibility)
// ═══════════════════════════════════════════════════════════════

function getParentSession() {
    const token = localStorage.getItem('token');
    if (!token) return null;
    return {
        isAuthenticated: true,
        email: localStorage.getItem('parentEmail'),
        parentName: localStorage.getItem('parentName'),
        parentId: localStorage.getItem('parentId')
    };
}

function getChildData() {
    const childId = localStorage.getItem('childId');
    if (!childId) return null;
    return {
        id:     childId,
        name:   localStorage.getItem('childName')   || '',
        gender: localStorage.getItem('childGender') || '',
        age:    localStorage.getItem('childAge')    || ''
    };
}

function logout() { Auth.logout(); }


// ═══════════════════════════════════════════════════════════════
// 7. UI helpers
// ═══════════════════════════════════════════════════════════════

const UI = {
    showSuccess(msg) {
        console.log('✅', msg);
        const el = document.getElementById('apiSuccessMsg');
        if (el) { el.textContent = msg; el.style.display = 'block'; }
    },
    showError(msg) {
        console.error('❌', msg);
        const el = document.getElementById('apiErrorMsg');
        if (el) { el.textContent = msg; el.style.display = 'block'; }
    },
    showLoading(selector) {
        const el = document.querySelector(selector);
        if (el) el.classList.add('loading');
    },
    hideLoading(selector) {
        const el = document.querySelector(selector);
        if (el) el.classList.remove('loading');
    }
};


// ═══════════════════════════════════════════════════════════════
// 8. Auto-init — حماية الصفحات (بدون حلقة إعادة توجيه)
// ═══════════════════════════════════════════════════════════════

(function autoInit() {
    const page = window.location.pathname.split('/').pop() || '';

    // صفحات لا تحتاج حماية — لا تفعل شيئاً
    const publicPages = ['login.html', 'home.html', 'index.html', '', 'admin.html'];
    if (publicPages.includes(page)) return;

    // صفحات تتطلب جلسة ولي أمر
    const parentPages = ['parents.html'];
    // صفحات تتطلب جلسة طفل
    const childPages  = ['dashboard.html', 'achievements.html'];
    // صفحات الأنشطة
    const activityPages = ['drawing.html', 'games.html', 'math.html', 'stories.html', 'vocabulary.html', 'certificate.html'];

    if (parentPages.includes(page) && !Auth.isAuthenticated()) {
        window.location.href = 'login.html';
        return;
    }

    if ([...childPages, ...activityPages].includes(page)) {
        const childToken = localStorage.getItem('childToken');
        if (!childToken && !Auth.isAuthenticated()) {
            window.location.href = 'login.html';
            return;
        }
    }
})();

// تصدير للاستخدام في بيئات Node.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Auth, Parents, Children, Activities };
}

console.log('🌟 Kids Platform API Client loaded — API:', API_BASE);