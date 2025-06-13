import { fetchIpIgnorelist, updateIpIgnorelist, fetchPendingChanges } from '../script.js'; // استيراد الدوال

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('nav-ignore').classList.add('active'); // تفعيل الرابط النشط

    fetchIpIgnorelist(); // جلب قائمة IP المستثناة

    const ipInput = document.getElementById('ipInput');
    const addIpBtn = document.getElementById('addIpBtn');
    if (addIpBtn) {
        addIpBtn.addEventListener('click', async () => {
            const ip = ipInput.value.trim();
            if (ip) {
                await updateIpIgnorelist(ip, 'add');
            } else {
                alert('الرجاء إدخال عنوان IP صالح.');
            }
        });
    }
});