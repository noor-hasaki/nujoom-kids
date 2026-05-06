// parents.js - لوحة تحكم الأهل (متوافق مع api.js)
// ⚠️ الدوال getParentSession() و getChildData() و logout() موجودة في api.js
//    لا نعيد تعريفها هنا لتجنب التعارض

document.addEventListener('DOMContentLoaded', async () => {
    // 1️⃣ التحقق من جلسة ولي الأمر (باستخدام getParentSession من api.js)
    const session = getParentSession();
    
    if (!session || !session.isAuthenticated) {
        console.warn('⚠️ No parent session found, redirecting to login...');
        window.location.href = 'login.html';
        return;
    }
    
    console.log('✅ Parent session found:', session.parentName, session.email);
    
    // 2️⃣ عرض بريد واسم ولي الأمر
    const emailEl = document.getElementById('parentEmailDisplay');
    if (emailEl) emailEl.textContent = session.email || '';
    
    const parentNameEl = document.getElementById('parentNameDisplay');
    if (parentNameEl) parentNameEl.textContent = session.parentName || 'ولي الأمر';
    
    // 3️⃣ تحميل بيانات الأطفال من الـ API
    await loadChildrenFromAPI();
    
    // 4️⃣ تحميل الإحصائيات
    loadAnalytics();
    
    // 5️⃣ معالجة نموذج التعديل
    const updateForm = document.getElementById('updateChildForm');
    if (updateForm) {
        updateForm.addEventListener('submit', saveChildUpdates);
    }
});

// ================= تحميل الأطفال من API =================
async function loadChildrenFromAPI() {
    try {
        const result = await Parents.getMyChildren();
        if (result.success && result.data && result.data.length > 0) {
            const child = result.data[0]; // عرض أول طفل
            const childData = {
                id: child.id,
                name: child.name,
                age: child.age,
                gender: child.gender,
                avatarId: child.avatar_id,
                joinDate: child.join_date,
                totalStars: child.total_stars || 0
            };
            console.log('📦 Child data from API:', childData);
            displayChildProfile(childData);
        } else {
            console.log('📭 No children found');
            const nameEl = document.getElementById('childNameDisplay');
            if (nameEl) nameEl.textContent = 'لم يتم إضافة طفل بعد';
        }
    } catch (e) {
        console.error('Error loading children:', e);
        // Fallback to local data
        const localChild = getChildData();
        if (localChild) displayChildProfile(localChild);
    }
}

// ================= عرض ملف الطفل ديناميكياً =================
function displayChildProfile(child) {
    console.log('🎨 Rendering profile for:', child.name);
    
    const nameEl = document.getElementById('childNameDisplay');
    if (nameEl && child.name) nameEl.textContent = child.name;
    
    const ageEl = document.getElementById('childAgeDisplay');
    if (ageEl && child.age) ageEl.textContent = child.age;
    
    const genderEl = document.getElementById('childGenderDisplay');
    if (genderEl && child.gender) {
        genderEl.textContent = child.gender === 'boy' ? 'ولد' : 'بنت';
    }
    
    const joinEl = document.getElementById('childJoinDate');
    if (joinEl) {
        joinEl.textContent = child.joinDate || child.join_date || new Date().toLocaleDateString('ar-EG');
    }
    
    const avatar = document.getElementById('childAvatar');
    if (avatar) {
        if (child.gender === 'girl') {
            avatar.innerHTML = '<i class="fas fa-girl"></i>';
            avatar.style.background = 'linear-gradient(135deg, #E84393, #FD79A8)';
        } else if (child.gender === 'boy') {
            avatar.innerHTML = '<i class="fas fa-boy"></i>';
            avatar.style.background = 'linear-gradient(135deg, #3498db, #00CEC9)';
        } else {
            avatar.innerHTML = '<i class="fas fa-child"></i>';
            avatar.style.background = 'linear-gradient(135deg, #A29BFE, #6C5CE7)';
        }
    }
    
    fillEditForm(child);
}

function fillEditForm(child) {
    const nameInput = document.getElementById('editName');
    const ageSelect = document.getElementById('editAge');
    if (nameInput && child.name) nameInput.value = child.name;
    if (ageSelect && child.age) ageSelect.value = child.age;
    if (child.gender) {
        const genderRadio = document.querySelector(`input[name="gender"][value="${child.gender}"]`);
        if (genderRadio) genderRadio.checked = true;
    }
}

// ================= إظهار/إخفاء نموذج التعديل =================
function toggleEditMode() {
    const form = document.getElementById('editForm');
    const card = document.getElementById('profileCard');
    if (!form || !card) return;
    if (form.style.display === 'none' || !form.style.display) {
        form.style.display = 'block';
        card.style.display = 'none';
    } else {
        form.style.display = 'none';
        card.style.display = 'flex';
    }
}

// ================= حفظ تحديثات الطفل =================
async function saveChildUpdates(e) {
    e.preventDefault();
    
    const updatedData = {
        name: document.getElementById('editName').value.trim(),
        age: parseInt(document.getElementById('editAge').value),
        gender: document.querySelector('input[name="gender"]:checked')?.value
    };
    
    // حاول التحديث عبر API
    const childId = localStorage.getItem('childId');
    if (childId) {
        const result = await Children.update(childId, updatedData);
        if (result.success) {
            console.log('✅ Child updated via API');
        }
    }
    
    displayChildProfile(updatedData);
    toggleEditMode();
    alert(`✅ تم تحديث بيانات ${updatedData.name} بنجاح!`);
}

// ================= زر وضع الطفل =================
async function enterChildMode() {
    const childId = localStorage.getItem('childId');
    
    if (!childId) {
        alert('⚠️ يرجى إضافة طفل أولاً');
        return;
    }
    
    // يمكن إضافة طلب PIN هنا لاحقاً
    localStorage.setItem('activeChildMode', 'true');
    
    const btn = document.querySelector('.child-mode-btn');
    if (btn) {
        const originalHTML = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        btn.disabled = true;
        setTimeout(() => {
            window.location.href = 'dashboard.html';
        }, 500);
    } else {
        window.location.href = 'dashboard.html';
    }
}

// ================= تسجيل الخروج (يستخدم Auth.logout من api.js) =================
function parentLogout() {
    if (confirm('هل تريد الخروج والعودة لصفحة تسجيل الدخول؟')) {
        Auth.logout();
    }
}

// ================= تحميل الإحصائيات =================
async function loadAnalytics() {
    // محاولة جلب البيانات من API
    try {
        const result = await Parents.getMyStats();
        if (result.success) {
            const d = result.data;
            const timeEl = document.getElementById('totalTimeStat');
            const progEl = document.getElementById('progressStat');
            if (timeEl) timeEl.textContent = d.totalTimeMim || 0;
            if (progEl) progEl.textContent = d.totalStars || 0;
            return;
        }
    } catch(e) {
        console.log('Stats API not available, using defaults');
    }
    
    // Fallback: بيانات افتراضية
    const timeEl = document.getElementById('totalTimeStat');
    const favEl = document.getElementById('favoriteActivityStat');
    const progEl = document.getElementById('progressStat');
    const focusEl = document.getElementById('focusTimeStat');
    
    if (timeEl) timeEl.textContent = '0';
    if (favEl) favEl.textContent = '-';
    if (progEl) progEl.textContent = '0%';
    if (focusEl) focusEl.textContent = '0';
}