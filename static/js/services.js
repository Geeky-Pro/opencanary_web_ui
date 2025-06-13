import { fetchServicesStatus, updateServiceStatus, fetchPendingChanges } from '../script.js'; // استيراد الدوال

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('nav-services').classList.add('active'); // تفعيل الرابط النشط

    fetchServicesStatus(); // جلب حالة الخدمات عند تحميل الصفحة
});
