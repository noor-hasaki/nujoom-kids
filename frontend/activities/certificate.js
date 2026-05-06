// دالة لتوليد الشهادة
function generateCertificate(studentName, achievement, date) {
    document.getElementById('studentName').textContent = studentName;
    document.getElementById('description').textContent = achievement;
    document.getElementById('date').textContent = date || new Date().toLocaleDateString();
}

// دالة لطباعة الشهادة كـ PDF
function downloadCertificate() {
    window.print();
}

// مثال على الاستخدام
window.onload = function() {
    // يمكنك جلب البيانات من قاعدة البيانات أو إدخال المستخدم
    generateCertificate(
        'Ahmed Mohamed',
        'For successfully completing the Mathematics Course with outstanding performance',
        'March 31, 2026'
    );
};