# 🎓 منصة الأطفال التعليمية — Backend

دليل شامل لتشغيل النظام الكامل (Node.js + Spring Boot)

---

## 🗂️ هيكل المشروع الكامل

```
kids-platform/
├── backend-node/              ← Node.js (Port 3000)
│   ├── src/
│   │   ├── database/
│   │   │   ├── db.js          ← الاتصال بـ SQLite
│   │   │   └── schema.sql     ← تعريف الجداول
│   │   ├── middleware/
│   │   │   ├── auth.js        ← التحقق من JWT
│   │   │   └── validate.js    ← التحقق من المدخلات
│   │   ├── routes/
│   │   │   ├── auth.routes.js
│   │   │   ├── parent.routes.js
│   │   │   ├── child.routes.js
│   │   │   ├── activity.routes.js
│   │   │   └── internal.routes.js  ← للـ Admin فقط
│   │   ├── controllers/
│   │   │   ├── auth.controller.js
│   │   │   ├── parent.controller.js
│   │   │   ├── child.controller.js
│   │   │   └── activity.controller.js
│   │   └── app.js
│   ├── server.js              ← نقطة التشغيل
│   ├── api.js                 ← ملف Frontend (انسخه للـ Frontend)
│   ├── package.json
│   └── .env.example
│
├── admin-service/             ← Spring Boot (Port 8080)
│   ├── src/main/java/com/kidsplatform/admin/
│   │   ├── AdminApplication.java
│   │   ├── config/
│   │   │   ├── SecurityConfig.java
│   │   │   └── DataInitializer.java
│   │   ├── entity/
│   │   │   ├── AdminUser.java
│   │   │   └── AdminUserRepository.java
│   │   ├── dto/
│   │   │   └── NodeApiDTOs.java
│   │   ├── security/
│   │   │   ├── JwtUtil.java
│   │   │   └── JwtAuthFilter.java
│   │   ├── service/
│   │   │   ├── AdminService.java      ← يتصل بـ Node.js
│   │   │   └── AdminAuthService.java
│   │   └── controller/
│   │       └── AdminController.java
│   ├── src/main/resources/
│   │   └── application.properties
│   └── pom.xml
│
└── kids-website-main/         ← Frontend (HTML/CSS/JS)
    ├── api.js                 ← انسخ هذا من backend-node/api.js
    ├── login.html
    ├── parents.html
    ├── dashboard.html
    └── ...
```

---

## ⚡ تشغيل Node.js Backend

### 1. المتطلبات
- Node.js **v18+**
- npm

### 2. التثبيت

```bash
cd backend-node

# نسخ ملف الإعداد
cp .env.example .env

# تعديل .env بقيمك الخاصة (مهم!)
# على الأقل: JWT_SECRET و INTERNAL_ADMIN_API_KEY

# تثبيت المكتبات
npm install

# تشغيل بيئة التطوير
npm run dev

# أو تشغيل Production
npm start
```

### 3. التحقق من التشغيل

```bash
curl http://localhost:3000/health
# الرد: { "success": true, "message": "منصة الأطفال تعمل بخير 🌟" }
```

---

## ☕ تشغيل Spring Boot Admin Service

### 1. المتطلبات
- Java **17+**
- Maven **3.6+**

### 2. التشغيل

```bash
cd admin-service

# تشغيل مباشر
mvn spring-boot:run

# أو بناء JAR أولاً
mvn clean package -DskipTests
java -jar target/admin-service-1.0.0.jar
```

### 3. بيانات الدخول الافتراضية للـ Admin
```
Email:    admin@kidsplatform.com
Password: Admin@123
```
> ⚠️ **غيّر كلمة المرور فور أول تسجيل دخول!**

### 4. H2 Console (لمراقبة قاعدة البيانات)
```
URL:      http://localhost:8080/h2-console
JDBC URL: jdbc:h2:mem:admindb
Username: sa
Password: (فارغ)
```

---

## 🌐 ربط الـ Frontend

### الخطوة 1: نسخ api.js

```bash
cp backend-node/api.js kids-website-main/api.js
```

### الخطوة 2: إضافة api.js في كل صفحة HTML

في **login.html، parents.html، dashboard.html، achievements.html**:

```html
<!-- أضف هذا قبل أي script آخر -->
<script src="api.js"></script>
```

في صفحات الأنشطة (داخل مجلد activities/):
```html
<script src="../api.js"></script>
```

### الخطوة 3: تعديل script.js

```javascript
// ❌ قبل (localStorage فقط)
localStorage.setItem('parentSession', JSON.stringify(parentSession));

// ✅ بعد (API حقيقي)
const result = await Auth.register(
    { name: parentName, email: parentEmail, password: parentPassword },
    { name: childName,  age: childAge, gender: childGender, pin: '1234', avatarId: 1 }
);
if (result.success) window.location.href = 'parents.html';
```

### الخطوة 4: تعديل parents.js

```javascript
// ❌ قبل
const childData = session.child || getChildData();
displayChildProfile(childData);

// ✅ بعد
const response = await Parents.getMyChildren();
if (response.success && response.data.length > 0) {
    displayChildProfile(response.data[0]);
}
```

```javascript
// ❌ قبل (loadAnalytics بيانات عشوائية)
const stats = { totalTime: Math.random() * 120 ... };

// ✅ بعد (بيانات حقيقية من API)
async function loadAnalytics() {
    const childId = localStorage.getItem('childId');
    const response = await Children.getStatsSummary(childId);
    if (response.success) {
        const { progress } = response.data;
        document.getElementById('totalTimeStat').textContent = progress.total_time_min || 0;
    }
}
```

### الخطوة 5: تعديل dashboard.js

```javascript
// ❌ قبل
function loadProgressStats() { /* من localStorage */ }

// ✅ بعد
async function loadProgressStats() {
    const response = await Children.getProgress();
    if (response.success) {
        const p = response.data;
        // تحديث العناصر...
        document.getElementById('totalStars').textContent = p.total_stars;
        document.getElementById('currentLevel').textContent = p.level;
    }
}
```

```javascript
// ✅ تسجيل نشاط الحروف عند إكمالها
async function completeLetterActivity(letterType, letter, starsEarned) {
    await Activities.complete(
        letterType === 'arabic' ? 'arabic_letters' : 'english_letters',
        starsEarned,
        0,     // score
        2,     // durationMin
        { letter, letterType, attempts: 1 }
    );
}
```

---

## 📡 API Endpoints كاملة

### Node.js (Port 3000)

| Method | Endpoint | الوصف |
|--------|----------|-------|
| POST | `/api/auth/parent/register` | تسجيل ولي أمر |
| POST | `/api/auth/parent/login`    | تسجيل دخول |
| POST | `/api/auth/child/login`     | دخول الطفل بالـ PIN |
| POST | `/api/auth/refresh`         | تجديد التوكن |
| POST | `/api/auth/logout`          | تسجيل الخروج |
| GET  | `/api/parents/me`           | بيانات ولي الأمر |
| GET  | `/api/parents/me/children`  | قائمة الأطفال |
| GET  | `/api/parents/me/stats`     | الإحصائيات |
| POST | `/api/children`             | إضافة طفل |
| GET  | `/api/children/:id`         | بيانات طفل |
| PUT  | `/api/children/:id`         | تعديل طفل |
| GET  | `/api/children/:id/progress`| تقدم الطفل |
| GET  | `/api/children/:id/achievements` | الإنجازات |
| GET  | `/api/children/:id/stats/summary` | ملخص الإحصائيات |
| POST | `/api/activities/complete`  | تسجيل نشاط |
| POST | `/api/activities/save-drawing` | حفظ رسمة |
| GET  | `/api/activities/leaderboard` | قائمة النجوم |

### Spring Boot Admin (Port 8080)

| Method | Endpoint | الوصف |
|--------|----------|-------|
| POST | `/api/admin/auth/login`              | دخول Admin |
| GET  | `/api/admin/users/parents`           | جميع الأهل |
| GET  | `/api/admin/users/children`          | جميع الأطفال |
| GET  | `/api/admin/users/relationships`     | علاقات الأهل والأطفال |
| GET  | `/api/admin/dashboard/stats`         | إحصائيات النظام |
| PUT  | `/api/admin/users/parents/:id`       | تعديل ولي أمر |
| PUT  | `/api/admin/users/children/:id`      | تعديل طفل |
| DELETE | `/api/admin/users/parents/:id`     | حذف ولي أمر |
| DELETE | `/api/admin/users/children/:id`    | حذف طفل |
| POST | `/api/admin/users/parents/:id/freeze`   | تجميد |
| POST | `/api/admin/users/parents/:id/unfreeze` | رفع التجميد |

---

## 🔐 الأمان

| المتطلب | التطبيق |
|---------|---------|
| كلمات المرور | bcrypt (saltRounds: 12) |
| PIN الطفل | bcrypt |
| Access Token | JWT مدته 15 دقيقة |
| Refresh Token | عشوائي، مدته 7 أيام، مُخزَّن في DB |
| Rate Limiting | 10 محاولات / 15 دقيقة على Auth endpoints |
| CORS | Frontend origin فقط |
| Admin Internal Key | منفصل عن JWT، في .env |

---

## 🆕 الأفكار الإضافية المُضافة

بالإضافة للمطلوب الأصلي، تم إضافة:

1. **جدول `drawings`** — حفظ رسومات الأطفال كـ Base64 مع حد أقصى 50 رسمة
2. **نظام إنجازات تلقائي** — 11 إنجاز يُمنح تلقائياً عند تسجيل كل نشاط
3. **نظام مستويات** — كل 50 نجمة = مستوى جديد
4. **حد أقصى للأطفال** — 5 أطفال لكل حساب لمنع الإساءة
5. **WAL mode في SQLite** — أداء أفضل للقراءة المتزامنة
6. **تجديد Token تلقائي** في `api.js` عند انتهاء الصلاحية
7. **`DataInitializer`** — إنشاء حساب Super Admin تلقائياً عند أول تشغيل
8. **Internal Stats endpoint** — `/api/internal/stats` للـ Admin Dashboard
9. **Backwards Compatibility** في `api.js` — دوال بنفس أسماء الدوال القديمة

---

## 🐛 حل المشاكل الشائعة

**Node.js لا يبدأ:**
```bash
# تحقق من وجود ملف .env
ls backend-node/.env

# تحقق من الـ Node version
node --version  # يجب أن تكون v18+
```

**Spring Boot لا يتصل بـ Node.js:**
```bash
# تحقق أن Node.js يعمل أولاً
curl http://localhost:3000/health

# تحقق من تطابق INTERNAL_ADMIN_API_KEY في الملفين:
# backend-node/.env → INTERNAL_ADMIN_API_KEY
# admin-service/application.properties → node.service.internal-key
```

**خطأ CORS:**
```bash
# تحقق من FRONTEND_URL في .env
# يجب أن يتطابق مع رابط الـ Frontend
FRONTEND_URL=http://localhost:5500
```
