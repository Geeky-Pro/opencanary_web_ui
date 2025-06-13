// هذا الملف يحتوي على دوال API المساعدة التي ستُستخدم في جميع الصفحات.
// يتم تصديرها لتكون متاحة عالمياً.
// عناصر منطقة التغييرات المعلقة
const pendingChangesNotification = document.getElementById('pending-changes-notification');
const applyChangesBtn = document.getElementById('applyChangesBtn');
const discardChangesBtn = document.getElementById('discardChangesBtn');


export async function fetchServicesStatus() {
    try {
        const servicesStatusDiv = document.getElementById('services-status'); 
        if (!servicesStatusDiv) {
            console.warn("Element 'services-status' not found. Skipping fetchServicesStatus.");
            return;
        }

        const response = await fetch('/api/services/status');
        const data = await response.json();

        servicesStatusDiv.innerHTML = '';

        for (const serviceName in data) {
            const service = data[serviceName];
            const card = document.createElement('div');
            card.classList.add('service-card');
            card.classList.add(service.enabled ? 'enabled' : 'disabled');

            card.innerHTML = `
                <h3>${serviceName.toUpperCase()}</h3>
                <p>المنفذ: ${service.port}</p>
                <p>الحالة: <span style="font-weight: bold; color: ${service.enabled ? '#28a745' : '#dc3545'};">${service.enabled ? 'مُمكّن' : 'مُعطّل'}</span></p>
                <button data-service="${serviceName}" data-action="${service.enabled ? 'disable' : 'enable'}">
                    ${service.enabled ? 'تعطيل' : 'تمكين'}
                </button>
            `;
            servicesStatusDiv.appendChild(card);
        }

        document.querySelectorAll('.service-card button').forEach(button => {
            button.addEventListener('click', async (event) => {
                const serviceName = event.target.dataset.service;
                const action = event.target.dataset.action;
                await updateServiceStatus(serviceName, action);
            });
        });

    } catch (error) {
        console.error('Error fetching services status:', error);
        const servicesStatusDiv = document.getElementById('services-status');
        if (servicesStatusDiv) {
            servicesStatusDiv.innerHTML = '<p style="color: red;">فشل تحميل حالة الخدمات.</p>';
        }
    }
}

export async function updateServiceStatus(serviceName, action) {
    try {
        const response = await fetch(`/api/service/${serviceName}/${action}`, {method: 'POST'});
        const data = await response.json();
        if (response.ok) {
            alert(data.message);
            fetchServicesStatus();
        } else {
            alert(`خطأ: ${data.error}`);
        }
    } catch (error) {
        console.error('Error updating service status:', error);
        alert('فشل تحديث حالة الخدمة.');
    }
}

export async function restartOpenCanary() {
    if (confirm('هل أنت متأكد أنك تريد إعادة تشغيل Open Canary؟ هذا سيؤدي إلى تعطيل الخدمات مؤقتاً.')) {
        try {
            const response = await fetch('/api/opencanary/restart', {
                method: 'POST'
            });
            const data = await response.json();
            if (response.ok) {
                alert(data.message);
                // يجب على كل صفحة تحديث بياناتها الخاصة بعد إعادة التشغيل إذا كانت تحتاج لذلك
            } else {
                alert(`خطأ في إعادة التشغيل: ${data.error}`);
            }
        } catch (error) {
            console.error('Error restarting OpenCanary:', error);
            alert('فشل الاتصال بخادم إعادة التشغيل.');
        }
    }
}

export async function fetchLogs() {
    try {
        const logOutputPre = document.getElementById('log-output');
        if (!logOutputPre) {
            console.warn("Element 'log-output' not found. Skipping fetchLogs.");
            return;
        }

        const response = await fetch('/api/logs');
        const data = await response.json();
        if (response.ok && data.logs) {
            const alertsContainer = document.createElement('div');
            alertsContainer.classList.add('alerts-list');
            
            logOutputPre.innerHTML = ''; // مسح المحتوى القديم

            if (data.logs.length === 0) {
                alertsContainer.textContent = 'لا توجد تنبيهات لعرضها.';
            } else {
                data.logs.forEach(log => {
                    let alertMessage = "تنبيه غير معروف";
                    let alertSource = log.src_host || 'غير معروف';
                    let alertTime = "غير معروف";
                    let alertType = "عام";
                    let iconClass = "fas fa-question-circle";

                    // **********************************************************************************
                    // تأكد أن هذه الشروط تعمل وأنها لا يتم تجاوزها
                    // **********************************************************************************

                    // تجاهل رسائل بدء تشغيل OpenCanary وإضافة الخدمات
                    if (log.logtype === 1001 && log.logdata && log.logdata.msg && 
                       (log.logdata.msg.logdata === "Canary running!!!" || 
                        log.logdata.msg.logdata.includes("Added service from class Canary"))) {
                        console.log('Skipping startup/add service log:', log.logdata.msg.logdata); // سجل للتصحيح
                        return; // تخطي هذا السجل
                    }
                    // تجاهل سجلات فحص المنفذ 5000 (Flask) التي تكرر نفسها
                    if (log.logtype === 5001 && log.dst_port == "5000") {
                        console.log('Skipping Flask port scan log:', log.dst_port); // سجل للتصحيح
                        return; // تخطي سجلات فحص المنفذ 5000
                    }
                    // تجاهل سجلات تبادل إصدارات SSH (logtype 4001)
                    if (log.logtype === 4001) { 
                        console.log('Skipping SSH version exchange log.'); // سجل للتصحيح
                        return; 
                    }

                    // **********************************************************************************
                    // تحليل أنواع التنبيهات الشائعة بناءً على logtype و logdata
                    // **********************************************************************************

                    if (log.logtype === 4002 && log.logdata && log.logdata.USERNAME) { // SSH Login Attempt
                        alertType = "محاولة تسجيل دخول SSH";
                        alertMessage = `محاولة تسجيل دخول SSH فاشلة للمستخدم: ${log.logdata.USERNAME} بكلمة المرور: ${log.logdata.PASSWORD || 'غير محدد'}`;
                        iconClass = "fas fa-user-lock";
                    } else if (log.logtype === 4000 && log.dst_port === 22) { // SSH Session / Connection (بداية جلسة SSH)
                        alertType = "اتصال SSH";
                        alertMessage = `تم اكتشاف اتصال SSH على المنفذ ${log.dst_port}`;
                        iconClass = "fas fa-user-shield";
                    } else if (log.logtype === 2000 && log.logdata && log.logdata.USERNAME) { // FTP Login Attempt
                        alertType = "محاولة تسجيل دخول FTP";
                        alertMessage = `محاولة تسجيل دخول FTP فاشلة للمستخدم: ${log.logdata.USERNAME} بكلمة المرور: ${log.logdata.PASSWORD || 'غير محدد'}`;
                        iconClass = "fas fa-file-upload";
                    } else if (log.logtype === 5001 && log.logdata && log.dst_port) { // Portscan/TCP Connection
                        alertType = "فحص منفذ / اتصال TCP";
                        alertMessage = `تم اكتشاف اتصال TCP على المنفذ ${log.dst_port} من ${log.src_host || 'غير معروف'}`;
                        iconClass = "fas fa-wifi";
                    } else if (log.logtype === 3000 && log.logdata && log.logdata.url) { // HTTP Get
                        alertType = "طلب HTTP/HTTPS";
                        alertMessage = `طلب HTTP/HTTPS إلى: ${log.logdata.url || 'غير محدد'} من ${log.src_host || 'غير معروف'}`;
                        iconClass = "fas fa-globe";
                    }
                    // يمكنك إضافة المزيد من الشروط لأنواع logtype الأخرى هنا
                    // للحصول على قائمة logtype الكاملة: https://github.com/thinkst/opencanary/wiki/Log-Types

                    // **********************************************************************************
                    // معالجة السجلات التي لم يتم التعرف عليها
                    // **********************************************************************************
                    if (alertType === "عام") {
                        alertMessage = `سجل غير معرف. تفاصيل: ${JSON.stringify(log.logdata || log.msg || log, null, 2)}`;
                        iconClass = "fas fa-exclamation-triangle";
                    }
                    
                    // **********************************************************************************
                    // تنسيق الوقت والتاريخ (ميلادي 12 ساعة)
                    // **********************************************************************************
                    if (log.local_time_adjusted) {
                        try {
                            const date = new Date(log.local_time_adjusted);
                            const year = date.getFullYear();
                            const month = String(date.getMonth() + 1).padStart(2, '0');
                            const day = String(date.getDate()).padStart(2, '0');
                            const formattedDate = `${year}-${month}-${day}`;

                            const formattedTime = date.toLocaleString('en-US', {
                                hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
                            });

                            alertTime = `${formattedDate} ${formattedTime}`;
                        } catch (e) {
                            console.error("Error parsing date or formatting time:", e);
                        }
                    }

                    const alertCard = document.createElement('div');
                    alertCard.classList.add('alert-card');
                    alertCard.innerHTML = `
                        <div class="alert-icon"><i class="${iconClass}"></i></div>
                        <div class="alert-content">
                            <p class="alert-type">${alertType}</p>
                            <p class="alert-message">${alertMessage}</p>
                            <p class="alert-meta">
                                <span class="alert-source">المصدر: ${alertSource}</span>
                                <span class="alert-time" style="text-align: left; margin-right: 15px;">${alertTime}</span>
                            </p>
                        </div>
                    `;
                    alertsContainer.appendChild(alertCard);
                });
            }
            logOutputPre.appendChild(alertsContainer);
            logOutputPre.scrollTop = logOutputPre.scrollHeight;
        } else {
            logOutputPre.textContent = 'فشل تحميل السجلات.';
        }
    } catch (error) {
        console.error('Error fetching logs:', error);
        logOutputPre.textContent = 'فشل تحميل السجلات.';
    }
}

export async function fetchIpIgnorelist() {
    try {
        const ipListUl = document.getElementById('ipList');
        if (!ipListUl) {
            console.warn("Element 'ipList' not found. Skipping fetchIpIgnorelist.");
            return;
        }

        const response = await fetch('/api/ip_ignorelist');
        const data = await response.json();

        ipListUl.innerHTML = ''; 

        if (data.ip_ignorelist && data.ip_ignorelist.length > 0) {
            data.ip_ignorelist.forEach(ip => {
                const listItem = document.createElement('li');
                listItem.textContent = ip;
                
                const deleteBtn = document.createElement('button');
                deleteBtn.textContent = 'حذف';
                deleteBtn.dataset.ip = ip;
                deleteBtn.addEventListener('click', async (event) => {
                    await updateIpIgnorelist(event.target.dataset.ip, 'remove');
                });
                
                listItem.appendChild(deleteBtn);
                ipListUl.appendChild(listItem);
            });
        } else {
            ipListUl.innerHTML = '<li>لا توجد عناوين IP مستثناة حالياً.</li>';
        }
    } catch (error) {
        console.error('Error fetching IP ignorelist:', error);
        const ipListUl = document.getElementById('ipList');
        if (ipListUl) {
            ipListUl.innerHTML = '<li style="color: red;">فشل تحميل قائمة IP المستثناة.</li>';
        }
    }
}

export async function updateIpIgnorelist(ip, action) {
    try {
        const response = await fetch('/api/ip_ignorelist', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ action: action, ip: ip })
        });
        const data = await response.json();
        if (response.ok) {
            alert(data.message);
            const ipInput = document.getElementById('ipInput');
            if (ipInput) ipInput.value = '';
            fetchIpIgnorelist();
        } else {
            alert(`خطأ: ${data.error}`);
        }
    } catch (error) {
        console.error('Error updating IP ignorelist:', error);
        alert('فشل تحديث قائمة IP المستثناة.');
    }
}


// دالة لجلب وعرض حالة التغييرات المعلقة
export async function fetchPendingChanges() {
    try {
        const response = await fetch('/api/pending_changes');
        const data = await response.json();

        if (data.pending_changes && Object.keys(data.pending_changes).length > 0) {
            // إذا كان هناك تغييرات معلقة، أظهر الإشعار
            pendingChangesNotification.classList.remove('pending-changes-hidden');
        } else {
            // إذا لم يكن هناك تغييرات، أخفِ الإشعار
            pendingChangesNotification.classList.add('pending-changes-hidden');
        }
    } catch (error) {
        console.error('Error fetching pending changes:', error);
        // قد ترغب في إظهار رسالة خطأ للمستخدم هنا
    }
}

// دالة لتطبيق التغييرات المعلقة
async function applyChanges() {
    if (confirm('هل أنت متأكد أنك تريد تطبيق جميع التغييرات المعلقة؟ سيعاد تشغيل Open Canary.')) {
        try {
            const response = await fetch('/api/apply_changes', { method: 'POST' });
            const data = await response.json();
            alert(data.message);
            if (response.ok) {
                fetchPendingChanges(); // تحديث حالة التغييرات المعلقة (يجب أن تختفي)
                // تحديث جميع بيانات الواجهة بعد التطبيق
                setTimeout(() => {
                    fetchServicesStatus();
                    fetchLogs();
                    fetchIpIgnorelist();
                }, 5000); // انتظر 5 ثواني
            }
        } catch (error) {
            console.error('Error applying changes:', error);
            alert('فشل تطبيق التغييرات.');
        }
    }
}

// دالة لإلغاء التغييرات المعلقة
async function discardChanges() {
    if (confirm('هل أنت متأكد أنك تريد إلغاء جميع التغييرات المعلقة؟')) {
        try {
            const response = await fetch('/api/discard_changes', { method: 'POST' });
            const data = await response.json();
            alert(data.message);
            if (response.ok) {
                fetchPendingChanges(); // تحديث حالة التغييرات المعلقة (يجب أن تختفي)
                // تحديث جميع بيانات الواجهة للعودة إلى الحالة المطبقة
                fetchServicesStatus();
                fetchLogs();
                fetchIpIgnorelist();
            }
        } catch (error) {
            console.error('Error discarding changes:', error);
            alert('فشل إلغاء التغييرات.');
        }
    }
}


// هذا الجزء من الكود يجب أن يكون في نهاية الملف، خارج أي دالة DOMContentLoaded
// أو أي دالة أخرى، ليتم تنفيذه عالمياً

// ربط أزرار التغييرات المعلقة
if (applyChangesBtn) {
    applyChangesBtn.addEventListener('click', applyChanges);
}
if (discardChangesBtn) {
    discardChangesBtn.addEventListener('click', discardChanges);
}

// استدعاء جلب التغييرات المعلقة عند تحميل أي صفحة
// هذا يجب أن يُستدعى مباشرة في الجزء العام من script.js 
// ليتم تشغيله مرة واحدة عند تحميل script.js
fetchPendingChanges();

// تحديث التغييرات المعلقة بشكل دوري أيضاً
setInterval(fetchPendingChanges, 10000); // كل 10 ثواني مثلاً
