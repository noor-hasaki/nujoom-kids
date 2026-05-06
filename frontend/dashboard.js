// dashboard.js - واجهة الطفل (نسخة محسنة مع دعم الإنجليزية)

// ========================================
// === تهيئة الصفحة عند التحميل ===
// ========================================
document.addEventListener('DOMContentLoaded', () => {
    // ✅ جلب بيانات الطفل من أي مصدر متاح
    const childData = getChildDataFromAnySource();
    
    if (!childData || !childData.name) {
        console.warn('⚠️ No child data found, redirecting to parents...');
        window.location.href = 'parents.html';
        return;
    }
    
    // ✅ عرض البيانات ديناميكياً في الواجهة
    renderChildDashboard(childData);
    
    // 📊 تحميل الإحصائيات والتقدم المحفوظ
    loadProgressStats();
    loadSavedProgress();
    
    // 📅 عرض تاريخ اليوم
    displayCurrentDate();
    
    // 🎮 تهيئة أحداث الألعاب
    initGameEvents();
    
    // ⌨️ دعم لوحة المفاتيح
    initKeyboardNavigation();
    
    console.log('✅ Child Dashboard Loaded Successfully! 🎉');
});

// ========================================
// === بيانات الحروف التعليمية ===
// ========================================

// 📚 الحروف العربية
const arabicLetters = [
    { letter: 'ا', name: 'ألف', forms: { isolated: 'ا', initial: 'اـ', medial: 'ـا', final: 'ـا' }, example: 'أَرَنَب', meaning: 'حيوان صغير أبيض جميل', illustration: '🐰', tip: 'الألف حرف ممدود، نطيله قليلاً عند النطق: آآآآ', color: '#667eea', stars: 3 },
    { letter: 'ب', name: 'باء', forms: { isolated: 'ب', initial: 'بـ', medial: 'ـبـ', final: 'ـب' }, example: 'بَطَّة', meaning: 'طائر يسبح في الماء', illustration: '🦆', tip: 'الباء لها نقطة واحدة تحتها، احفظ مكان النقطة!', color: '#764ba2', stars: 3 },
    { letter: 'ت', name: 'تاء', forms: { isolated: 'ت', initial: 'تـ', medial: 'ـتـ', final: 'ـت' }, example: 'تُفَّاح', meaning: 'فاكهة حمراء لذيذة', illustration: '🍎', tip: 'التاء لها نقطتان من فوق، مثل عينين صغيرتين!', color: '#f093fb', stars: 3 },
    { letter: 'ث', name: 'ثاء', forms: { isolated: 'ث', initial: 'ثـ', medial: 'ـثـ', final: 'ـث' }, example: 'ثَعْلَب', meaning: 'حيوان ذكي ذو ذيل كثيف', illustration: '🦊', tip: 'الثاء لها ثلاث نقاط مثل مثلث صغير فوق الحرف', color: '#f5576c', stars: 3 },
    { letter: 'ج', name: 'جيم', forms: { isolated: 'ج', initial: 'جـ', medial: 'ـجـ', final: 'ـج' }, example: 'جَمَل', meaning: 'سفينة الصحراء', illustration: '🐪', tip: 'الجيم لها نقطة واحدة من تحت، مثل بذرة صغيرة', color: '#11998e', stars: 3 },
    { letter: 'ح', name: 'حاء', forms: { isolated: 'ح', initial: 'حـ', medial: 'ـحـ', final: 'ـح' }, example: 'حِصَان', meaning: 'حيوان قوي يركبه الناس', illustration: '🐴', tip: 'الحاء تنطق من الحلق، جرب أن تقول "حـ" ببطء', color: '#6c5ce7', stars: 3 },
    { letter: 'خ', name: 'خاء', forms: { isolated: 'خ', initial: 'خـ', medial: 'ـخـ', final: 'ـخ' }, example: 'خَرُوف', meaning: 'حيوان أليف صوفي', illustration: '🐑', tip: 'الخاء مثل الحاء ولكن مع هواء أكثر', color: '#00cec9', stars: 3 },
    { letter: 'د', name: 'دال', forms: { isolated: 'د', initial: 'دـ', medial: 'ـد', final: 'ـد' }, example: 'دُب', meaning: 'حيوان كبير قوي', illustration: '🐻', tip: 'الدال حرف سهل، اضغط بلسانك على أسنانك العليا', color: '#00b894', stars: 3 },
    { letter: 'ذ', name: 'ذال', forms: { isolated: 'ذ', initial: 'ذـ', medial: 'ـذ', final: 'ـذ' }, example: 'ذِئْب', meaning: 'حيوان بري مفترس', illustration: '🐺', tip: 'الذال مثل الدال ولكن مع صوت أزيز خفيف', color: '#fdcb6e', stars: 3 },
    { letter: 'ر', name: 'راء', forms: { isolated: 'ر', initial: 'رـ', medial: 'ـر', final: 'ـر' }, example: 'رُمَّان', meaning: 'فاكهة حمراء بها حبات صغيرة', illustration: '🍎', tip: 'الرَاء تُلفظ بلفظة خفيفة من طرف اللسان', color: '#e17055', stars: 3 }
    // يمكن إضافة باقي الحروف بنفس النمط
];

// 🔤 الحروف الإنجليزية (A-Z كاملة)
const englishLetters = [
    { letter: 'A', smallLetter: 'a', name: 'Ay', phonetic: '/eɪ/', example: 'Apple', meaning: 'تفاحة 🍎', illustration: '🍎', tip: 'افتح فمك واسعاً وقل "آه" مثل عندما ترى شيئاً مذهلاً!', color: '#FF6B6B', stars: 3, wordImage: '🍎' },
    { letter: 'B', smallLetter: 'b', name: 'Bee', phonetic: '/biː/', example: 'Ball', meaning: 'كرة ⚽', illustration: '⚽', tip: 'أغلق شفتيك ثم افتحهما بسرعة مع إخراج صوت "بـ"', color: '#4ECDC4', stars: 3, wordImage: '⚽' },
    { letter: 'C', smallLetter: 'c', name: 'Cee', phonetic: '/siː/', example: 'Cat', meaning: 'قطة 🐱', illustration: '🐱', tip: 'ضع لسانك خلف أسنانك العليا وقل "كـ" بنعومة', color: '#95E1D3', stars: 3, wordImage: '🐱' },
    { letter: 'D', smallLetter: 'd', name: 'Dee', phonetic: '/diː/', example: 'Dog', meaning: 'كلب 🐶', illustration: '🐶', tip: 'اضغط بلسانك على سقف فمك ثم قل "دْ"', color: '#F38181', stars: 3, wordImage: '🐶' },
    { letter: 'E', smallLetter: 'e', name: 'Ee', phonetic: '/iː/', example: 'Elephant', meaning: 'فيل 🐘', illustration: '🐘', tip: 'ابتسم قليلاً وقل "إيـ" بصوت طويل', color: '#AA96DA', stars: 3, wordImage: '🐘' },
    { letter: 'F', smallLetter: 'f', name: 'Ef', phonetic: '/ef/', example: 'Fish', meaning: 'سمكة 🐟', illustration: '🐟', tip: 'ضع أسنانك العليا على شفتك السفلى واهمس "فـ"', color: '#FCBAD3', stars: 3, wordImage: '🐟' },
    { letter: 'G', smallLetter: 'g', name: 'Jee', phonetic: '/dʒiː/', example: 'Grape', meaning: 'عنب 🍇', illustration: '🍇', tip: 'قل "جـ" كما في كلمة "جميل" مع ابتسامة', color: '#FFFFD2', stars: 3, wordImage: '🍇' },
    { letter: 'H', smallLetter: 'h', name: 'Aitch', phonetic: '/eɪtʃ/', example: 'Hat', meaning: 'قبعة 🎩', illustration: '🎩', tip: 'أخرج هواءً دافئاً من حلقك مثل عندما تريد تدفئة يديك', color: '#A8D8EA', stars: 3, wordImage: '🎩' },
    { letter: 'I', smallLetter: 'i', name: 'Eye', phonetic: '/aɪ/', example: 'Ice Cream', meaning: 'آيس كريم 🍦', illustration: '🍦', tip: 'افتح فمك وقل "آي" كما عندما تفرح بشيء لذيذ!', color: '#FFAAA5', stars: 3, wordImage: '🍦' },
    { letter: 'J', smallLetter: 'j', name: 'Jay', phonetic: '/dʒeɪ/', example: 'Juice', meaning: 'عصير 🧃', illustration: '🧃', tip: 'قل "جـ" مع ابتسامة واسعة مثل عندما تشرب شيئاً منعشاً', color: '#FFD3B6', stars: 3, wordImage: '🧃' },
    { letter: 'K', smallLetter: 'k', name: 'Kay', phonetic: '/keɪ/', example: 'Kite', meaning: 'طائرة ورقية 🪁', illustration: '🪁', tip: 'ارفع مؤخرة لسانك وقل "كـ" بنبرة واضحة', color: '#C7CEEA', stars: 3, wordImage: '🪁' },
    { letter: 'L', smallLetter: 'l', name: 'El', phonetic: '/el/', example: 'Lion', meaning: 'أسد 🦁', illustration: '🦁', tip: 'ضع طرف لسانك خلف أسنانك العليا وقل "لـ"', color: '#B8E6B8', stars: 3, wordImage: '🦁' },
    { letter: 'M', smallLetter: 'm', name: 'Em', phonetic: '/em/', example: 'Moon', meaning: 'قمر 🌙', illustration: '🌙', tip: 'أغلق شفتيك وقل "مـ" مع خروج الصوت من الأنف', color: '#E8B4E8', stars: 3, wordImage: '🌙' },
    { letter: 'N', smallLetter: 'n', name: 'En', phonetic: '/en/', example: 'Nest', meaning: 'عش 🪹', illustration: '🪹', tip: 'مثل الميم ولكن مع فتح الفم قليلاً', color: '#FFB3BA', stars: 3, wordImage: '🪹' },
    { letter: 'O', smallLetter: 'o', name: 'Oh', phonetic: '/oʊ/', example: 'Orange', meaning: 'برتقالة 🍊', illustration: '🍊', tip: 'شكّل شفتيك دائرة وقل "أو" بصوت عميق', color: '#FFA07A', stars: 3, wordImage: '🍊' },
    { letter: 'P', smallLetter: 'p', name: 'Pee', phonetic: '/piː/', example: 'Panda', meaning: 'باندا 🐼', illustration: '🐼', tip: 'أغلق شفتيك ثم افتحهما مع دفعة هواء خفيفة', color: '#D4A5A5', stars: 3, wordImage: '🐼' },
    { letter: 'Q', smallLetter: 'q', name: 'Cue', phonetic: '/kjuː/', example: 'Queen', meaning: 'ملكة 👑', illustration: '👑', tip: 'قل "كـ" ثم "يو" بسرعة: كيو!', color: '#E6B8E6', stars: 3, wordImage: '👑' },
    { letter: 'R', smallLetter: 'r', name: 'Ar', phonetic: '/ɑːr/', example: 'Rabbit', meaning: 'أرنب 🐰', illustration: '🐰', tip: 'لف لسانك قليلاً للداخل وقل "ررر"', color: '#B8D4E6', stars: 3, wordImage: '🐰' },
    { letter: 'S', smallLetter: 's', name: 'Ess', phonetic: '/es/', example: 'Sun', meaning: 'شمس ☀️', illustration: '☀️', tip: 'ضع لسانك خلف أسنانك واهمس "سـ"', color: '#FFD93D', stars: 3, wordImage: '☀️' },
    { letter: 'T', smallLetter: 't', name: 'Tee', phonetic: '/tiː/', example: 'Tiger', meaning: 'نمر 🐯', illustration: '🐯', tip: 'اضغط بلسانك على سقف فمك ثم أطلق صوت "تْ"', color: '#FF9F7F', stars: 3, wordImage: '🐯' },
    { letter: 'U', smallLetter: 'u', name: 'You', phonetic: '/juː/', example: 'Umbrella', meaning: 'مظلة ☂️', illustration: '☂️', tip: 'قل "يو" كما في كلمة "يوم" ولكن بصوت إنجليزي', color: '#A8D8EA', stars: 3, wordImage: '☂️' },
    { letter: 'V', smallLetter: 'v', name: 'Vee', phonetic: '/viː/', example: 'Violin', meaning: 'كمان 🎻', illustration: '🎻', tip: 'ضع أسنانك العليا على شفتك السفلى واهتز: "ڤـ"', color: '#C7A8E6', stars: 3, wordImage: '🎻' },
    { letter: 'W', smallLetter: 'w', name: 'Double-U', phonetic: '/ˈdʌbəl.juː/', example: 'Water', meaning: 'ماء 💧', illustration: '💧', tip: 'شكّل شفتيك كما للنفخ وقل "و" مع ابتسامة', color: '#7EC8E3', stars: 3, wordImage: '💧' },
    { letter: 'X', smallLetter: 'x', name: 'Ex', phonetic: '/eks/', example: 'Xylophone', meaning: 'زيلوفون 🎵', illustration: '🎵', tip: 'قل "كـ" ثم "س" بسرعة: كس!', color: '#E6A8B8', stars: 3, wordImage: '🎵' },
    { letter: 'Y', smallLetter: 'y', name: 'Why', phonetic: '/waɪ/', example: 'Yellow', meaning: 'أصفر 💛', illustration: '💛', tip: 'قل "يـ" كما في كلمة "يوم" ولكن بصوت أطول', color: '#FFF4A3', stars: 3, wordImage: '💛' },
    { letter: 'Z', smallLetter: 'z', name: 'Zed', phonetic: '/zed/', example: 'Zebra', meaning: 'حمار وحشي 🦓', illustration: '🦓', tip: 'اهتز بأسنانك وقل "ززز" مثل صوت النحلة', color: '#B8E6D4', stars: 3, wordImage: '🦓' }
];

// ========================================
// === متغيرات حالة اللعبة ===
// ========================================

// حالة لعبة الحروف العربية
let arabicGameState = {
    currentIndex: 0,
    completed: new Set(),
    isPlaying: false
};

// حالة لعبة الحروف الإنجليزية
let englishGameState = {
    currentIndex: 0,
    completed: new Set(),
    isPlaying: false
};

// إعدادات عامة
const appConfig = {
    confettiCount: 30,
    toastDuration: 3000,
    soundRate: { arabic: 0.8, english: 0.7 },
    soundPitch: { arabic: 1.0, english: 1.2 }
};

// ========================================
// === دوال جلب وعرض البيانات ===
// ========================================

function getChildDataFromAnySource() {
    // المصدر 1: البيانات المباشرة من api.js
    const directData = getChildData();
    if (directData?.name) return directData;
    
    // المصدر 2: من localStorage مباشرة
    const childName = localStorage.getItem('childName');
    if (childName) {
        return {
            id: localStorage.getItem('childId'),
            name: childName,
            gender: localStorage.getItem('childGender') || '',
            age: localStorage.getItem('childAge') || ''
        };
    }
    
    return null;
}

function renderChildDashboard(child) {
    // 🎯 الاسم الديناميكي
    const nameEl = document.getElementById('childName');
    if (nameEl && child.name) {
        const firstName = child.name.trim().split(/\s+/)[0];
        nameEl.textContent = firstName;
        nameEl.title = child.name;
    }
    
    // 🎭 الأفاتار حسب الجنس
    const avatar = document.getElementById('childAvatar');
    if (avatar) {
        const styles = {
            girl: { icon: 'fa-girl', gradient: 'linear-gradient(135deg, #E84393, #FD79A8)' },
            boy: { icon: 'fa-boy', gradient: 'linear-gradient(135deg, #3498db, #00CEC9)' },
            default: { icon: 'fa-child', gradient: 'linear-gradient(135deg, #A29BFE, #6C5CE7)' }
        };
        const style = styles[child.gender] || styles.default;
        avatar.innerHTML = `<i class="fas ${style.icon}"></i>`;
        avatar.style.background = style.gradient;
        avatar.style.color = '#FFF';
    }
}

// getChildData() and getParentSession() are defined in api.js — no override here

function displayCurrentDate() {
    const el = document.getElementById('currentDate');
    if (el) {
        el.textContent = new Date().toLocaleDateString('ar-EG', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
        });
    }
}

// ========================================
// === دوال الإحصائيات والتقدم ===
// ========================================

async function loadProgressStats() {
    // ✅ تحميل التقدم الحقيقي من الـ API
    const childId = localStorage.getItem('childId');
    if (childId) {
        try {
            const result = await Children.getProgress(childId);
            if (result.success && result.data) {
                const p = result.data;
                const totalStars = p.total_stars || 0;
                const totalTime  = p.total_time_min || 0;

                // حفظ في localStorage كنسخة احتياطية
                localStorage.setItem('childProgress', JSON.stringify({
                    starsEarned: totalStars,
                    timeSpent:   totalTime,
                    progress:    Math.min(100, Math.floor((totalStars / 200) * 100))
                }));

                // تحديث النجوم والوقت في الواجهة
                const starsEl = document.getElementById('starsEarned');
                const timeEl  = document.getElementById('timeSpent');
                if (starsEl) starsEl.textContent = totalStars;
                if (timeEl)  timeEl.textContent  = totalTime;

                // تحديث شريط التقدم
                const progress = Math.min(100, Math.floor((totalStars / 200) * 100));
                const bar  = document.getElementById('dailyProgress');
                const text = bar?.querySelector('.progress-text');
                if (bar) {
                    setTimeout(() => {
                        bar.style.width = `${progress}%`;
                        if (text) text.textContent = `${progress}%`;
                    }, 600);
                }

                console.log('✅ Progress loaded from API:', totalStars, 'stars');
                return;
            }
        } catch (e) {
            console.warn('⚠️ Could not load progress from API:', e);
        }
    }

    // Fallback: استخدام localStorage إذا فشل الـ API
    const saved = localStorage.getItem('childProgress');
    const stats = saved ? JSON.parse(saved) : { progress: 0, timeSpent: 0, starsEarned: 0 };

    const bar  = document.getElementById('dailyProgress');
    const text = bar?.querySelector('.progress-text');
    if (bar) {
        setTimeout(() => {
            bar.style.width = `${stats.progress}%`;
            if (text) text.textContent = `${stats.progress}%`;
        }, 600);
    }
    const timeEl  = document.getElementById('timeSpent');
    const starsEl = document.getElementById('starsEarned');
    if (timeEl)  timeEl.textContent  = stats.timeSpent;
    if (starsEl) starsEl.textContent = stats.starsEarned;
}

function saveProgressStats() {
    const stats = {
        progress: calculateTotalProgress(),
        timeSpent: parseInt(document.getElementById('timeSpent')?.textContent) || 0,
        starsEarned: parseInt(document.getElementById('starsEarned')?.textContent) || 0,
        lastUpdated: new Date().toISOString()
    };
    localStorage.setItem('childProgress', JSON.stringify(stats));
}

function calculateTotalProgress() {
    const arabicTotal = arabicLetters.length;
    const englishTotal = englishLetters.length;
    const arabicDone = arabicGameState.completed.size;
    const englishDone = englishGameState.completed.size;
    
    const total = arabicTotal + englishTotal;
    const done = arabicDone + englishDone;
    
    return total > 0 ? Math.round((done / total) * 100) : 0;
}

// ========================================
// === حفظ وتحميل تقدم الألعاب ===
// ========================================

function saveSavedProgress() {
    const progress = {
        arabic: {
            currentIndex: arabicGameState.currentIndex,
            completed: Array.from(arabicGameState.completed)
        },
        english: {
            currentIndex: englishGameState.currentIndex,
            completed: Array.from(englishGameState.completed)
        },
        starsEarned: document.getElementById('starsEarned')?.textContent || 0,
        lastPlayed: new Date().toISOString()
    };
    localStorage.setItem('childLearningProgress', JSON.stringify(progress));
}

function loadSavedProgress() {
    try {
        const saved = localStorage.getItem('childLearningProgress');
        if (!saved) return;
        
        const progress = JSON.parse(saved);
        
        // تحميل تقدم العربية
        if (progress.arabic?.completed) {
            arabicGameState.completed = new Set(progress.arabic.completed);
        }
        if (progress.arabic?.currentIndex !== undefined) {
            arabicGameState.currentIndex = progress.arabic.currentIndex;
        }
        
        // تحميل تقدم الإنجليزية
        if (progress.english?.completed) {
            englishGameState.completed = new Set(progress.english.completed);
        }
        if (progress.english?.currentIndex !== undefined) {
            englishGameState.currentIndex = progress.english.currentIndex;
        }
        
        // تحديث النجوم
        if (progress.starsEarned) {
            const starsEl = document.getElementById('starsEarned');
            if (starsEl) starsEl.textContent = progress.starsEarned;
        }
        
        console.log('✅ Saved progress loaded');
    } catch (e) {
        console.warn('⚠️ Could not load saved progress:', e);
    }
}

// ========================================
// === تهيئة أحداث الألعاب ===
// ========================================

function initGameEvents() {
    // إضافة مستمعات للأزرار الديناميكية (إذا لزم)
    document.addEventListener('click', (e) => {
        // إغلاق الألعاب عند النقر خارجها
        const gameContainers = document.querySelectorAll('.letters-game-container');
        const isInsideGame = e.target.closest('.letters-game-container');
        const isGameButton = e.target.closest('.activity-card.arabic-letters, .activity-card.english-letters');
        
        if (!isInsideGame && !isGameButton) {
            // لا تغلق تلقائياً لتحسين تجربة المستخدم
        }
    });
}

function initKeyboardNavigation() {
    document.addEventListener('keydown', (e) => {
        // زر الهروب لإغلاق الألعاب
        if (e.key === 'Escape') {
            closeArabicGame();
            closeEnglishGame();
        }
        
        // الأسهم للتنقل في الألعاب المفتوحة
        const arabicActive = document.getElementById('lettersGame')?.classList.contains('active');
        const englishActive = document.getElementById('englishLettersGame')?.classList.contains('active');
        
        if (arabicActive) {
            if (e.key === 'ArrowLeft') changeArabicLetter(1); // التالي بالعربية
            if (e.key === 'ArrowRight') changeArabicLetter(-1); // السابق بالعربية
        }
        
        if (englishActive) {
            if (e.key === 'ArrowLeft') changeEnglishLetter(1);
            if (e.key === 'ArrowRight') changeEnglishLetter(-1);
        }
    });
}

// ========================================
// === 🎮 دوال لعبة الحروف العربية ===
// ========================================

function openArabicGame() {
    // إخفاء الأقسام الأخرى
    hideMainSections();
    closeEnglishGame();
    
    // إظهار لعبة العربية
    const gameSection = document.getElementById('lettersGame');
    if (gameSection) {
        gameSection.style.display = 'block';
        gameSection.classList.add('active');
        arabicGameState.isPlaying = true;
        
        // عرض الحرف الحالي
        renderArabicLetterStage(arabicGameState.currentIndex);
        renderArabicProgressDots();
        
        // تأثيرات احتفالية
        createConfetti();
        
        // تمرير سلس
        gameSection.scrollIntoView({ behavior: 'smooth' });
        
        console.log('🎮 Arabic Letters Game Opened');
    }
}

function closeArabicGame() {
    const gameSection = document.getElementById('lettersGame');
    if (gameSection) {
        gameSection.style.display = 'none';
        gameSection.classList.remove('active');
        arabicGameState.isPlaying = false;
    }
    showMainSections();
}

function hideMainSections() {
    document.querySelector('.activities-grid')?.style.setProperty('display', 'none', 'important');
    document.querySelector('.welcome-section')?.style.setProperty('display', 'none', 'important');
    document.querySelector('.daily-progress')?.style.setProperty('display', 'none', 'important');
}

function showMainSections() {
    document.querySelector('.activities-grid')?.style.removeProperty('display');
    document.querySelector('.welcome-section')?.style.removeProperty('display');
    document.querySelector('.daily-progress')?.style.removeProperty('display');
}

function renderArabicLetterStage(index) {
    const letter = arabicLetters[index];
    if (!letter) return;
    
    const stage = document.getElementById('currentLetterStage');
    if (!stage) return;
    
    stage.innerHTML = `
        <div class="letter-name">حرف الـ <span style="color: ${letter.color}">${letter.name}</span></div>
        
        <div class="letter-display" style="color: ${letter.color}">${letter.letter}</div>
        
        <div class="letter-forms">
            <div class="form-item" onclick="playArabicSound('${letter.forms.isolated}')">
                <span class="form-label">منفرد</span>
                <span class="form-char">${letter.forms.isolated}</span>
            </div>
            <div class="form-item" onclick="playArabicSound('${letter.forms.initial}')">
                <span class="form-label">في البداية</span>
                <span class="form-char">${letter.forms.initial}</span>
            </div>
            <div class="form-item" onclick="playArabicSound('${letter.forms.medial}')">
                <span class="form-label">في الوسط</span>
                <span class="form-char">${letter.forms.medial}</span>
            </div>
            <div class="form-item" onclick="playArabicSound('${letter.forms.final}')">
                <span class="form-label">في النهاية</span>
                <span class="form-char">${letter.forms.final}</span>
            </div>
        </div>
        
        <div class="letter-illustration" style="background: linear-gradient(135deg, ${letter.color} 0%, ${letter.color}dd 100%);">
            ${letter.illustration}
        </div>
        
        <div class="word-example">${letter.example}</div>
        <div class="word-meaning">تعني: ${letter.meaning}</div>
        
        <div class="letter-tip">
            <i class="fas fa-lightbulb"></i> ${letter.tip}
        </div>
        
        <div class="stars-reward">${'⭐'.repeat(letter.stars)}</div>
        
        <div style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
            <button class="audio-btn" onclick="playArabicSound('${letter.letter}')">
                <i class="fas fa-volume-up"></i> استمع للنطق
            </button>
            <button class="audio-btn" style="background: linear-gradient(135deg, #11998e, #38ef7d);" onclick="markArabicComplete(${index})">
                <i class="fas fa-check"></i> أحسنت! تعلمت هذا الحرف
            </button>
        </div>
    `;
    
    // تحديث النقاط النشطة
    updateArabicProgressDots(index);
}

function renderArabicProgressDots() {
    const container = document.getElementById('progressDots');
    if (!container) return;
    
    container.innerHTML = '';
    
    arabicLetters.forEach((_, index) => {
        const dot = document.createElement('div');
        const isCompleted = arabicGameState.completed.has(index);
        const isActive = index === arabicGameState.currentIndex;
        
        dot.className = `progress-dot ${isCompleted ? 'completed' : ''} ${isActive ? 'active' : ''}`;
        dot.onclick = () => goToArabicLetter(index);
        dot.title = arabicLetters[index].name;
        dot.setAttribute('tabindex', '0');
        dot.setAttribute('role', 'button');
        dot.setAttribute('aria-label', `انتقل إلى حرف ${arabicLetters[index].name}`);
        
        container.appendChild(dot);
    });
}

function updateArabicProgressDots(activeIndex) {
    document.querySelectorAll('#progressDots .progress-dot').forEach((dot, index) => {
        dot.classList.toggle('active', index === activeIndex);
    });
}

function changeArabicLetter(direction) {
    const newIndex = arabicGameState.currentIndex + direction;
    if (newIndex >= 0 && newIndex < arabicLetters.length) {
        arabicGameState.currentIndex = newIndex;
        renderArabicLetterStage(newIndex);
        updateArabicProgressDots(newIndex);
    }
}

function goToArabicLetter(index) {
    if (index >= 0 && index < arabicLetters.length) {
        arabicGameState.currentIndex = index;
        renderArabicLetterStage(index);
        updateArabicProgressDots(index);
    }
}

function playArabicSound(text) {
    // إيقاف أي صوت قيد التشغيل
    if (window.speechSynthesis?.speaking) {
        window.speechSynthesis.cancel();
    }
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ar-SA';
    utterance.rate = appConfig.soundRate.arabic;
    utterance.pitch = appConfig.soundPitch.arabic;
    
    speechSynthesis.speak(utterance);
    
    // تأثير بصري على الزر
    const btn = event?.currentTarget;
    if (btn) {
        const originalHTML = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-play"></i> 🔊 جاري التشغيل...';
        btn.disabled = true;
        
        setTimeout(() => {
            btn.innerHTML = originalHTML;
            btn.disabled = false;
        }, 2000);
    }
}

function markArabicComplete(index) {
    if (arabicGameState.completed.has(index)) return;
    
    // إضافة للحروف المكتملة
    arabicGameState.completed.add(index);
    
    // تحديث النجوم
    const starsEl = document.getElementById('starsEarned');
    if (starsEl) {
        const current = parseInt(starsEl.textContent) || 0;
        starsEl.textContent = current + arabicLetters[index].stars;
    }
    
    // تأثير احتفالي
    createConfetti();
    
    // رسالة تشجيعية
    const letter = arabicLetters[index];
    showToast(`🎉 أحسنت يا بطل!\nتعلمت حرف ${letter.name} (${letter.letter})\n+${letter.stars} نجوم ⭐`);
    
    // الانتقال التلقائي للحرف التالي
    if (index < arabicLetters.length - 1) {
        setTimeout(() => {
            changeArabicLetter(1);
        }, 2000);
    }
    
    // تحديث الواجهة والحفظ
    renderArabicProgressDots();
    saveProgressStats();
    saveSavedProgress();
    
    // مزامنة مع API
    if (typeof syncActivityToAPI === 'function') {
        syncActivityToAPI('arabic_letters', letter.stars, 0, 1, {
            letterIndex: index,
            letter: letter.letter,
            name: letter.name
        });
    }
}

// ========================================
// === 🎮 دوال لعبة الحروف الإنجليزية ===
// ========================================

function openEnglishGame() {
    // إخفاء الأقسام الأخرى
    hideMainSections();
    closeArabicGame();
    
    // إظهار لعبة الإنجليزية
    const gameSection = document.getElementById('englishLettersGame');
    if (gameSection) {
        gameSection.style.display = 'block';
        gameSection.classList.add('active');
        englishGameState.isPlaying = true;
        
        // عرض الحرف الحالي
        renderEnglishLetterStage(englishGameState.currentIndex);
        renderEnglishProgressDots();
        
        // تأثيرات احتفالية
        createConfetti();
        
        // تمرير سلس
        gameSection.scrollIntoView({ behavior: 'smooth' });
        
        console.log('🎮 English Letters Game Opened');
    }
}

function closeEnglishGame() {
    const gameSection = document.getElementById('englishLettersGame');
    if (gameSection) {
        gameSection.style.display = 'none';
        gameSection.classList.remove('active');
        englishGameState.isPlaying = false;
    }
    showMainSections();
}

function renderEnglishLetterStage(index) {
    const letter = englishLetters[index];
    if (!letter) return;
    
    const stage = document.getElementById('currentEnglishLetterStage');
    if (!stage) return;
    
    // تعيين متغير اللون للاستخدام في CSS
    document.documentElement.style.setProperty('--letter-color', letter.color);
    
    stage.innerHTML = `
        <div class="letter-name">Letter <span style="color: ${letter.color}">${letter.name}</span></div>
        
        <!-- عرض الحرف كبير وصغير -->
        <div class="english-letter-display">
            <div class="letter-box-large" style="--letter-color: ${letter.color}" 
                 onclick="playEnglishSound('${letter.letter}')" 
                 title="Click to hear ${letter.letter}"
                 tabindex="0"
                 role="button"
                 aria-label="Play sound for capital ${letter.letter}">
                ${letter.letter}
            </div>
            <div class="letter-box-small" style="--letter-color: ${letter.color}" 
                 onclick="playEnglishSound('${letter.smallLetter}')"
                 title="Click to hear ${letter.smallLetter}"
                 tabindex="0"
                 role="button"
                 aria-label="Play sound for small ${letter.smallLetter}">
                ${letter.smallLetter}
            </div>
        </div>
        
        <!-- النطق الصوتي -->
        <div style="background: #e3f2fd; padding: 10px 20px; border-radius: 12px; display: inline-block; margin: 10px 0;">
            <span style="color: #666; font-size: 14px;">Pronunciation: </span>
            <strong style="color: ${letter.color}; font-size: 18px; font-family: 'Fredoka', sans-serif;">${letter.phonetic}</strong>
        </div>
        
        <!-- بطاقة الكلمة المصورة -->
        <div class="word-card">
            <div style="font-size: 14px; color: #888;">${letter.letter} is for...</div>
            <div class="word-card-image" aria-hidden="true">${letter.wordImage}</div>
            <div class="word-card-text">${letter.example}</div>
            <div class="word-card-meaning">${letter.meaning}</div>
        </div>
        
        <!-- نصيحة تعليمية -->
        <div class="letter-tip" style="border-right-color: ${letter.color}; background: ${letter.color}15;">
            <i class="fas fa-lightbulb" style="color: ${letter.color}"></i> 
            <strong>Tip:</strong> ${letter.tip}
        </div>
        
        <!-- المكافأة والأزرار -->
        <div class="stars-reward" aria-label="${letter.stars} stars reward">${'⭐'.repeat(letter.stars)}</div>
        
        <div style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
            <button class="audio-btn english" onclick="playEnglishSound('${letter.letter} ${letter.example}')">
                <i class="fas fa-volume-up"></i> استمع للنطق
            </button>
            <button class="audio-btn" style="background: linear-gradient(135deg, #FFD3B6, #FFAAA5);" onclick="markEnglishComplete(${index})">
                <i class="fas fa-check"></i> أحسنت! تعلمت هذا الحرف
            </button>
        </div>
    `;
    
    // إنشاء شبكة المربعات التعليمية
    renderEnglishLetterBoxes(letter);
    
    // تحديث نقاط التقدم
    updateEnglishProgressDots(index);
}

function renderEnglishLetterBoxes(letter) {
    const grid = document.getElementById('letterBoxesGrid');
    if (!grid) return;
    
    grid.innerHTML = `
        <div class="letter-box-item" onclick="traceLetter('${letter.letter}')" tabindex="0" role="button">
            <div class="letter-box-label">Capital</div>
            <div class="letter-box-char">${letter.letter}</div>
            <div class="letter-box-trace">✍️ تتبع</div>
        </div>
        <div class="letter-box-item" onclick="traceLetter('${letter.smallLetter}')" tabindex="0" role="button">
            <div class="letter-box-label">Small</div>
            <div class="letter-box-char">${letter.smallLetter}</div>
            <div class="letter-box-trace">✍️ تتبع</div>
        </div>
        <div class="letter-box-item" onclick="playEnglishSound('${letter.example}')" tabindex="0" role="button">
            <div class="letter-box-label">Word</div>
            <div class="letter-box-char" style="font-size: 24px;">${letter.example}</div>
            <div class="letter-box-trace">🔊 استمع</div>
        </div>
        <div class="letter-box-item" tabindex="0">
            <div class="letter-box-label">Write</div>
            <div class="letter-box-char" style="font-size: 24px;">?</div>
            <div class="letter-box-trace" contenteditable="true" style="border-style: solid;" 
                 placeholder="اكتب هنا..." aria-label="Write the letter here">اكتب هنا</div>
        </div>
    `;
    
    // إضافة مستمع للمسح على المربعات القابلة للكتابة
    const traceBox = grid.querySelector('[contenteditable="true"]');
    if (traceBox) {
        traceBox.addEventListener('focus', (e) => {
            if (e.target.textContent === 'اكتب هنا') {
                e.target.textContent = '';
            }
        });
        traceBox.addEventListener('blur', (e) => {
            if (!e.target.textContent.trim()) {
                e.target.textContent = 'اكتب هنا';
            }
        });
    }
}

function renderEnglishProgressDots() {
    const container = document.getElementById('englishProgressDots');
    if (!container) return;
    
    container.innerHTML = '';
    
    englishLetters.forEach((_, index) => {
        const dot = document.createElement('div');
        const isCompleted = englishGameState.completed.has(index);
        const isActive = index === englishGameState.currentIndex;
        
        dot.className = `progress-dot ${isCompleted ? 'completed' : ''} ${isActive ? 'active' : ''}`;
        dot.onclick = () => goToEnglishLetter(index);
        dot.title = `${englishLetters[index].name} - ${englishLetters[index].example}`;
        dot.setAttribute('tabindex', '0');
        dot.setAttribute('role', 'button');
        dot.setAttribute('aria-label', `Go to letter ${englishLetters[index].name}`);
        
        container.appendChild(dot);
    });
}

function updateEnglishProgressDots(activeIndex) {
    document.querySelectorAll('#englishProgressDots .progress-dot').forEach((dot, index) => {
        dot.classList.toggle('active', index === activeIndex);
    });
}

function changeEnglishLetter(direction) {
    const newIndex = englishGameState.currentIndex + direction;
    if (newIndex >= 0 && newIndex < englishLetters.length) {
        englishGameState.currentIndex = newIndex;
        renderEnglishLetterStage(newIndex);
        updateEnglishProgressDots(newIndex);
    }
}

function goToEnglishLetter(index) {
    if (index >= 0 && index < englishLetters.length) {
        englishGameState.currentIndex = index;
        renderEnglishLetterStage(index);
        updateEnglishProgressDots(index);
    }
}

function playEnglishSound(text) {
    // إيقاف أي صوت قيد التشغيل
    if (window.speechSynthesis?.speaking) {
        window.speechSynthesis.cancel();
    }
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = appConfig.soundRate.english;
    utterance.pitch = appConfig.soundPitch.english;
    
    speechSynthesis.speak(utterance);
    
    // تأثير بصري على الزر
    const btn = event?.currentTarget;
    if (btn) {
        const originalHTML = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-play"></i> 🔊 Playing...';
        btn.disabled = true;
        
        setTimeout(() => {
            btn.innerHTML = originalHTML;
            btn.disabled = false;
        }, 2500);
    }
}

function traceLetter(char) {
    // تشغيل الصوت أولاً
    playEnglishSound(char);
    
    // تأثير تفاعلي
    const boxes = document.querySelectorAll('.letter-box-item');
    boxes.forEach(box => {
        box.style.transform = 'scale(0.95)';
        setTimeout(() => box.style.transform = '', 200);
    });
    
    // رسالة تشجيعية
    showToast(`🎨 Great! Try writing "${char}" in the box ✍️`);
}

function markEnglishComplete(index) {
    if (englishGameState.completed.has(index)) return;
    
    // إضافة للحروف المكتملة
    englishGameState.completed.add(index);
    
    // تحديث النجوم
    const starsEl = document.getElementById('starsEarned');
    if (starsEl) {
        const current = parseInt(starsEl.textContent) || 0;
        starsEl.textContent = current + englishLetters[index].stars;
    }
    
    // تأثير احتفالي
    createConfetti();
    
    // رسالة تشجيعية مخصصة
    const letter = englishLetters[index];
    showToast(`🎉 Excellent! 🌟\nYou learned letter ${letter.name} (${letter.letter})\nWord: ${letter.example} ${letter.wordImage}\n+${letter.stars} stars ⭐`);
    
    // الانتقال التلقائي للحرف التالي
    if (index < englishLetters.length - 1) {
        setTimeout(() => {
            changeEnglishLetter(1);
        }, 2000);
    }
    
    // تحديث الواجهة والحفظ
    renderEnglishProgressDots();
    saveProgressStats();
    saveSavedProgress();
    
    // مزامنة مع API
    if (typeof syncActivityToAPI === 'function') {
        syncActivityToAPI('english_letters', letter.stars, 0, 1, {
            letterIndex: index,
            letter: letter.letter,
            name: letter.name
        });
    }
}

// ========================================
// === ✨ دوال التأثيرات والمرئيات ===
// ========================================

function createConfetti() {
    const colors = ['#FF6B6B', '#4ECDC4', '#FFD93D', '#A29BFE', '#00CEC9', '#FF7675', '#FFA502'];
    
    for (let i = 0; i < appConfig.confettiCount; i++) {
        setTimeout(() => {
            const confetti = document.createElement('div');
            confetti.className = 'confetti';
            confetti.style.left = Math.random() * 100 + 'vw';
            confetti.style.background = colors[Math.floor(Math.random() * colors.length)];
            confetti.style.animationDuration = (2 + Math.random() * 2) + 's';
            confetti.style.width = (8 + Math.random() * 8) + 'px';
            confetti.style.height = confetti.style.width;
            
            document.body.appendChild(confetti);
            
            // إزالة العنصر بعد الانتهاء
            setTimeout(() => confetti.remove(), 4000);
        }, i * 80);
    }
}

function showToast(message, duration = appConfig.toastDuration) {
    // إزالة أي Toast موجود
    const existing = document.querySelector('.toast-notification');
    if (existing) existing.remove();
    
    const toast = document.createElement('div');
    toast.className = 'toast-notification';
    toast.innerHTML = message;
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'polite');
    
    document.body.appendChild(toast);
    
    // إزالة تلقائية
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(-50%) translateY(-10px)';
        setTimeout(() => toast.remove(), 500);
    }, duration);
}

// ========================================
// === دوال مساعدة عامة ===
// ========================================

function logout() {
    // تنظيف جلسة الطفل
    localStorage.removeItem('activeChildMode');
    
    // حفظ التقدم قبل الخروج
    saveSavedProgress();
    
    // العودة لصفحة الأهل
    window.location.href = 'parents.html';
}

function resetProgress(confirmReset = true) {
    if (confirmReset && !confirm('⚠️ هل أنت متأكد من إعادة تعيين كل التقدم؟\nلا يمكن التراجع عن هذا الإجراء.')) {
        return;
    }
    
    // إعادة تعيين الحالة
    arabicGameState.completed.clear();
    arabicGameState.currentIndex = 0;
    englishGameState.completed.clear();
    englishGameState.currentIndex = 0;
    
    // إعادة تعيين النجوم
    const starsEl = document.getElementById('starsEarned');
    if (starsEl) starsEl.textContent = '0';
    
    // حذف البيانات المحفوظة
    localStorage.removeItem('childLearningProgress');
    
    // تحديث الواجهة
    if (document.getElementById('lettersGame')?.classList.contains('active')) {
        renderArabicLetterStage(0);
        renderArabicProgressDots();
    }
    if (document.getElementById('englishLettersGame')?.classList.contains('active')) {
        renderEnglishLetterStage(0);
        renderEnglishProgressDots();
    }
    
    showToast('🔄 تم إعادة تعيين التقدم بنجاح!');
    console.log('🔄 Progress reset');
}

// دالة للتصدير (لأغراض التطوير)
function exportProgress() {
    const data = {
        arabic: {
            completed: Array.from(arabicGameState.completed),
            currentIndex: arabicGameState.currentIndex
        },
        english: {
            completed: Array.from(englishGameState.completed),
            currentIndex: englishGameState.currentIndex
        },
        stars: document.getElementById('starsEarned')?.textContent,
        exportedAt: new Date().toISOString()
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `child-progress-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    showToast('📥 تم تصدير التقدم بنجاح!');
}

// ========================================
// === دوال الربط مع HTML (Global) ===
// ========================================

// ربط دوال الألعاب بالأزرار في HTML
window.openLettersGame = openArabicGame;
window.closeLettersGame = closeArabicGame;
window.changeLetter = changeArabicLetter;
window.goToLetter = goToArabicLetter;
window.playLetterSound = playArabicSound;
window.markAsComplete = markArabicComplete;

window.openEnglishLettersGame = openEnglishGame;
window.closeEnglishLettersGame = closeEnglishGame;
window.changeEnglishLetter = changeEnglishLetter;
window.goToEnglishLetter = goToEnglishLetter;
window.playEnglishSound = playEnglishSound;
window.markEnglishComplete = markEnglishComplete;
window.traceLetter = traceLetter;

// دوال عامة
window.logout = logout;
window.resetProgress = resetProgress;
window.exportProgress = exportProgress;

// ========================================
// === نهاية الملف ===
// ========================================
console.log('🎯 dashboard.js loaded with Arabic & English Letters Support');