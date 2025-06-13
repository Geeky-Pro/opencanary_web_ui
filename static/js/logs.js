import { fetchLogs, fetchPendingChanges } from '../script.js'; // استيراد الدالة

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('nav-logs').classList.add('active'); // تفعيل الرابط النشط

    fetchLogs(); // جلب السجلات عند تحميل الصفحة
    setInterval(fetchLogs, 5000); // تحديث تلقائي كل 5 ثوانٍ

    const refreshLogsBtn = document.getElementById('refreshLogsBtn');
    if (refreshLogsBtn) {
        refreshLogsBtn.addEventListener('click', fetchLogs);
    }
});