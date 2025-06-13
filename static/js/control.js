import { restartOpenCanary, fetchServicesStatus, fetchLogs, fetchIpIgnorelist, fetchPendingChanges } from '../script.js'; // استيراد الدوال

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('nav-control').classList.add('active'); // تفعيل الرابط النشط

    const restartCanaryBtn = document.getElementById('restartCanaryBtn');
    if (restartCanaryBtn) {
        restartCanaryBtn.addEventListener('click', async () => {
            await restartOpenCanary();
            // تحديث جميع بيانات الواجهة بعد إعادة التشغيل
            setTimeout(() => {
                fetchServicesStatus();
                fetchLogs();
                fetchIpIgnorelist();
            }, 5000); // انتظر 5 ثوانٍ
        });
    }
});