# 🌟 نجوم التعلم — منصة تعليمية للأطفال

## 📋 متطلبات التشغيل
- **Node.js** الإصدار 18 أو أحدث
- متصفح حديث (Chrome, Firefox, Safari, Edge)

## 🚀 خطوات التشغيل

### ١. افتح Terminal وانتقل لمجلد الباك إند:
```bash
cd kids-website-main/kids-platform/backend-node
```

### ٢. أنشئ ملف الإعدادات:
```bash
cp .env.example .env
# عدّل القيم في .env (خاصة JWT_SECRET و INTERNAL_ADMIN_API_KEY)
```

### ٣. ثبّت المكتبات المطلوبة:
```bash
npm install
```

### ٤. شغّل الخادم:
```bash
npm start
```
أو لوضع التطوير (إعادة تشغيل تلقائية عند أي تعديل):
```bash
npm run dev
```

### ٥. افتح المتصفح:
| الصفحة | الرابط |
|--------|--------|
| 🏠 الصفحة الرئيسية | http://localhost:3000/home.html |
| 🔑 تسجيل الدخول | http://localhost:3000/login.html |
| 👨‍👩‍👧 لوحة تحكم الأهل | http://localhost:3000/parents.html |
| 👶 لوحة الطفل | http://localhost:3000/dashboard.html |
| 🛡️ لوحة الإدارة (Admin) | http://localhost:3000/admin.html |

## 🔐 بيانات الوصول

### لوحة الإدارة (Admin):
- مفتاح الإدارة يُعيَّن في ملف `.env` (المتغير `INTERNAL_ADMIN_API_KEY`)
- انسخ `.env.example` إلى `.env` وعدّل القيم قبل التشغيل

### اختبار المنصة:
1. افتح صفحة تسجيل الدخول
2. أنشئ حساب جديد (اسم + بريد + كلمة مرور تحتوي رقم واحد على الأقل)
3. أضف طفلاً من لوحة تحكم الأهل
4. ادخل وضع الطفل واستمتع بالأنشطة

## 🏗️ هيكل المشروع
```
kids-website-main/
├── frontend/              # الواجهة الأمامية (HTML, CSS, JS)
│   ├── home.html          # الصفحة الرئيسية
│   ├── login.html         # تسجيل الدخول
│   ├── parents.html       # لوحة تحكم الأهل
│   ├── dashboard.html     # لوحة الطفل
│   ├── admin.html         # لوحة الإدارة
│   ├── api.js             # طبقة الاتصال مع الخادم
│   └── activities/        # صفحات الأنشطة
├── kids-platform/
│   └── backend-node/      # الخادم (Node.js + Express + SQLite)
│       ├── server.js       # نقطة البداية
│       ├── src/
│       │   ├── app.js      # إعداد Express
│       │   ├── database/   # قاعدة البيانات
│       │   ├── routes/     # المسارات
│       │   ├── controllers/ # المنطق
│       │   └── middleware/  # التحقق والحماية
│       ├── .env.example    # قالب إعدادات البيئة (انسخه إلى .env)
│       └── package.json
├── .gitignore
```

## 📡 API Endpoints

### المصادقة
- `POST /api/auth/parent/register` — تسجيل حساب جديد
- `POST /api/auth/parent/login` — تسجيل دخول
- `POST /api/auth/child/login` — دخول الطفل بـ PIN
- `POST /api/auth/refresh` — تجديد التوكن
- `POST /api/auth/logout` — تسجيل الخروج

### أولياء الأمور (يتطلب JWT)
- `GET /api/parents/me` — بيانات ولي الأمر
- `GET /api/parents/me/children` — قائمة الأطفال
- `GET /api/parents/me/stats` — إحصائيات

### الأطفال (يتطلب JWT)
- `POST /api/children` — إضافة طفل
- `GET /api/children/:id/progress` — تقدم الطفل
- `GET /api/children/:id/achievements` — الإنجازات

### الإدارة (يتطلب x-admin-key)
- `GET /api/internal/stats` — إحصائيات المنصة
- `GET /api/internal/parents` — قائمة الأهل
- `GET /api/internal/children` — قائمة الأطفال
- `PUT /api/internal/parents/:id/freeze` — تجميد حساب
- `DELETE /api/internal/parents/:id` — حذف حساب
