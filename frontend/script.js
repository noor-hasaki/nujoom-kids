// script.js - معالجة التسجيل في index.html

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('parentForm');
    
    if (form) {
        initRegistrationForm(form);
    }
});

function initRegistrationForm(form) {
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        
        // 1️⃣ جمع البيانات من الحقول (ديناميكية 100%)
        const childName = document.getElementById('childName').value.trim();
        const childAge = document.getElementById('childAge').value;
        const genderElement = document.querySelector('input[name="gender"]:checked');
        const parentEmail = document.getElementById('parentEmail').value.trim().toLowerCase();
        
        // التحقق من اختيار الجنس
        if (!genderElement) {
            alert('⚠️ يرجى اختيار جنس الطفل');
            return;
        }
        const childGender = genderElement.value;
        
        // 2️⃣ تجهيز كائن بيانات الطفل (ديناميكي تماماً)
        const childData = {
            name: childName,              // ✅ أي اسم يدخله الأهل
            age: childAge,                // ✅ أي عمر
            gender: childGender,          // ✅ ولد أو بنت
            parentEmail: parentEmail,
            joinDate: new Date().toLocaleDateString('ar-EG'),
            isDemo: (parentEmail === 'parent@sit.edu')
        };
        
        // 3️⃣ تجهيز جلسة ولي الأمر (تحتوي على بيانات الطفل داخلها)
        const parentSession = {
            isAuthenticated: true,
            email: parentEmail,
            parentName: 'ولي الأمر',
            child: childData,             // ✅ الطفل مدمج داخل جلسة الأهل
            loginTime: new Date().toISOString()
        };
        
        // 4️⃣ ✅ حفظ البيانات في مكانين لضمان الوصول إليها من أي صفحة
        localStorage.setItem('childData', JSON.stringify(childData));      // للوصول المباشر
        localStorage.setItem('parentSession', JSON.stringify(parentSession)); // للوصول عبر جلسة الأهل
        
        console.log('💾 Saved childData:', childData);
        console.log('💾 Saved parentSession:', parentSession);
        
        // 5️⃣ تأثير بصري للزر
        const submitBtn = form.querySelector('.submit-btn');
        const originalBtnContent = submitBtn.innerHTML;
        
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الحفظ...';
        submitBtn.disabled = true;
        
        // 6️⃣ محاكاة معالجة ثم التوجيه
        setTimeout(() => {
            if (parentEmail === 'parent@sit.edu') {
                submitBtn.innerHTML = '<i class="fas fa-check"></i> تم الدخول التجريبي!';
                submitBtn.style.backgroundColor = '#00B894';
            } else {
                submitBtn.innerHTML = '<i class="fas fa-check"></i> تم التسجيل!';
                submitBtn.style.backgroundColor = '#27ae60';
            }
            
            // ✅ التوجيه إلى لوحة الأهل أولاً (وليس مباشرة للطفل)
            setTimeout(() => {
                window.location.href = 'parents.html';
            }, 800);
            
        }, 1200);
    });
}

// ================= دوال مساعدة مشتركة =================

function getChildData() {
    try {
        const data = localStorage.getItem('childData');
        return data ? JSON.parse(data) : null;
    } catch { return null; }
}

function getParentSession() {
    try {
        const session = localStorage.getItem('parentSession');
        return session ? JSON.parse(session) : null;
    } catch { return null; }
}

function logout() {
    localStorage.removeItem('childData');
    localStorage.removeItem('parentSession');
    localStorage.removeItem('activeChildMode');
    window.location.href = 'index.html';
}