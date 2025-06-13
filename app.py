import json
import os
import subprocess
import time
from flask import Flask, jsonify, request, render_template

app = Flask(__name__)

# تحديد مسار ملف التكوين الخاص بـ Open Canary
CONFIG_FILE_PATH = "/etc/opencanaryd/opencanary.conf"

# متغيرات لتخزين حالة التكوين والتغييرات المعلقة
# في بيئة الإنتاج، قد تحتاج إلى حل تخزين أكثر دوامًا (قاعدة بيانات صغيرة، Redis)
current_live_config = {} # آخر تكوين تم تطبيقه على Open Canary
pending_config = {}      # التكوين مع التغييرات التي لم تطبق بعد

# دالة لتهيئة التكوين الأولي عند بدء التطبيق
def initialize_configs():
    global current_live_config, pending_config
    live_config = _read_config_from_file() # استخدام دالة القراءة من الملف
    if live_config:
        current_live_config = live_config
        pending_config = dict(live_config) # ابدأ بـ pending_config نسخة من التكوين الحالي
    else:
        app.logger.error("Failed to read initial OpenCanary config. Starting with empty configs.")
        current_live_config = {}
        pending_config = {}

# دالة مساعدة لقراءة التكوين من الملف (تُستخدم فقط عند الحاجة)
def _read_config_from_file():
    try:
        with open(CONFIG_FILE_PATH, 'r') as f:
            return json.load(f)
    except FileNotFoundError:
        app.logger.error(f"Config file not found at {CONFIG_FILE_PATH}")
        return None
    except json.JSONDecodeError as e:
        app.logger.error(f"Error decoding JSON from config file: {e}")
        return None

# دالة مساعدة لكتابة التكوين إلى الملف
def _write_config(config_data):
    try:
        with open(CONFIG_FILE_PATH, 'w') as f:
            json.dump(config_data, f, indent=4)
        return True
    except Exception as e:
        app.logger.error(f"Error writing config file: {e}")
        return False

# نقطة نهاية لعرض ملف التكوين كاملاً (ستعرض pending_config)
@app.route('/api/config', methods=['GET'])
def get_config():
    # تعرض pending_config لأنها تمثل الحالة التي يراها المستخدم
    if not pending_config: # إذا لم يتم تهيئة التكوين بعد
        initialize_configs() # حاول التهيئة
    return jsonify(pending_config) # تعرض pending_config

# نقطة نهاية لجلب قائمة IP المستثناة (ستعرض من pending_config)
@app.route('/api/ip_ignorelist', methods=['GET'])
def get_ip_ignorelist():
    # اقرأ من التكوين المعلق الذي يتم عرضه للمستخدم
    config = pending_config
    if not config: # إذا لم يتم تهيئة التكوين بعد
        initialize_configs() # حاول التهيئة
        config = pending_config # بعد التهيئة

    ip_ignorelist = config.get("ip.ignorelist", [])
    return jsonify({"ip_ignorelist": ip_ignorelist})

# نقطة نهاية لتحديث قائمة IP المستثناة (إضافة/حذف) (ستعدل pending_config)
@app.route('/api/ip_ignorelist', methods=['POST'])
def update_ip_ignorelist():
    global pending_config # للوصول إلى المتغير العام وتعديله

    data = request.get_json()
    if not data or 'action' not in data or 'ip' not in data:
        return jsonify({"error": "Invalid request. Must include 'action' (add/remove) and 'ip'."}), 400

    action = data['action']
    ip_address = data['ip']

    config = pending_config # العمل على نسخة pending_config
    if not config: # إذا لم يتم تهيئة التكوين بعد
        initialize_configs() # حاول التهيئة
        config = pending_config # بعد التهيئة

    current_ignorelist = config.get("ip.ignorelist", [])
    
    # نعمل على نسخة للقائمة لتجنب مشاكل المرجع
    new_ignorelist = list(current_ignorelist) 

    if action == 'add':
        if ip_address not in new_ignorelist:
            new_ignorelist.append(ip_address)
            message = f"IP {ip_address} added to pending ignore list."
        else:
            return jsonify({"message": f"IP {ip_address} is already in pending ignore list."}), 200
    elif action == 'remove':
        if ip_address in new_ignorelist:
            new_ignorelist.remove(ip_address)
            message = f"IP {ip_address} removed from pending ignore list."
        else:
            return jsonify({"message": f"IP {ip_address} not found in pending ignore list."}), 200
    else:
        return jsonify({"error": "Invalid action. Must be 'add' or 'remove'."}), 400

    config["ip.ignorelist"] = new_ignorelist
    pending_config = dict(config) # تحديث المتغير العام pending_config

    return jsonify({"message": message, "ip_ignorelist": new_ignorelist})


# ************************************************************
# المسارات الجديدة لصفحات الويب المنفصلة
# ************************************************************

@app.route('/')
@app.route('/services') # مسار لصفحة حالة الخدمات (افتراضية)
def services_page():
    return render_template('services.html')

@app.route('/ignore') # مسار لصفحة إدارة قوائم التجاهل
def ignore_page():
    return render_template('ignore.html')

@app.route('/logs') # مسار لصفحة سجلات التنبيهات
def logs_page():
    return render_template('logs.html')

@app.route('/control') # مسار لصفحة التحكم العام
def control_page():
    return render_template('control.html')

# ************************************************************
# نهاية المسارات الجديدة
# ************************************************************


# نقطة نهاية لعرض حالة جميع الخدمات (ستعرض من pending_config)
@app.route('/api/services/status', methods=['GET'])
def get_services_status():
    # اقرأ من التكوين المعلق الذي يتم عرضه للمستخدم
    config = pending_config
    if not config: # إذا لم يتم تهيئة التكوين بعد
        initialize_configs() # حاول التهيئة
        config = pending_config # بعد التهيئة

    services_status = {}
    known_services = [
        "ftp", "http", "https", "httpproxy", "llmnr", "smb", "mysql",
        "ssh", "redis", "rdp", "sip", "snmp", "ntp", "tftp",
        "tcpbanner", "telnet", "mssql", "vnc", "git", "portscan"
    ]

    for service in known_services:
        enabled_key = f"{service}.enabled"
        if enabled_key in config:
            services_status[service] = {
                "enabled": config[enabled_key],
                "port": config.get(f"{service}.port", "N/A")
            }

    return jsonify(services_status)

# نقطة نهاية لتحديث حالة خدمة معينة (تمكين/تعطيل) (ستعدل pending_config)
@app.route('/api/service/<string:service_name>/<string:action>', methods=['POST'])
def update_service_status(service_name, action):
    global pending_config # للوصول إلى المتغير العام وتعديله
    
    config = pending_config # العمل على نسخة pending_config

    if not config: # إذا لم يتم تهيئة التكوين بعد
        initialize_configs() # حاول التهيئة
        config = pending_config # بعد التهيئة

    enabled_key = f"{service_name}.enabled"
    if enabled_key not in config:
        return jsonify({"error": f"Service '{service_name}' or its 'enabled' key not found in config."}), 404

    old_value = config.get(enabled_key) # استخدام .get لتجنب KeyError إذا كان المفتاح غير موجود
    if action == 'enable':
        config[enabled_key] = True
        message_action = "enabled"
    elif action == 'disable':
        config[enabled_key] = False
        message_action = "disabled"
    else:
        return jsonify({"error": "Invalid action. Must be 'enable' or 'disable'."}), 400

    # لا نكتب إلى الملف هنا. فقط نحدث pending_config
    pending_config = dict(config) # تحديث المتغير العام pending_config (نأخذ نسخة لتجنب مشاكل المرجع)

    # ارجع رسالة النجاح، ودع الواجهة الأمامية تتعامل مع التغييرات المعلقة
    # يمكننا لاحقاً تتبع التغييرات المحددة هنا
    return jsonify({
        "message": f"Service '{service_name}' {message_action} in pending changes.",
        "service_status": {service_name: config[enabled_key]}
    })


# نقطة نهاية API لإعادة تشغيل Open Canary (التي ستستدعي دالة العملية)
@app.route('/api/opencanary/restart', methods=['POST'])
def api_restart_opencanary():
    result = restart_opencanary_process() # استدعاء الدالة المساعدة
    if result.get("status") == "success":
        return jsonify({"message": "OpenCanary restarted successfully."})
    else:
        return jsonify({"error": f"Failed to restart OpenCanary: {result.get('error')}"}), 500


# ************************************************************
# نقاط نهاية جديدة لإدارة التغييرات المعلقة
# ************************************************************

# نقطة نهاية لجلب التغييرات المعلقة (مقارنة pending_config بـ current_live_config)
@app.route('/api/pending_changes', methods=['GET'])
def get_pending_changes():
    if not current_live_config or not pending_config:
        initialize_configs() # حاول التهيئة إذا لم تكن قد تمت

    changes = {}
    
    # التغييرات على المفاتيح الموجودة
    for key in pending_config:
        if key not in current_live_config or pending_config[key] != current_live_config[key]:
            changes[key] = pending_config[key]
    
    # المفاتيح المحذوفة (إذا كانت pending_config لا تحتوي على مفتاح موجود في current_live_config)
    for key in current_live_config:
        if key not in pending_config:
            changes[key] = "__DELETED__" # قيمة خاصة للإشارة إلى الحذف (يمكن أن تكون None)

    return jsonify({"pending_changes": changes})

# نقطة نهاية لتطبيق التغييرات المعلقة وإعادة تشغيل Open Canary
@app.route('/api/apply_changes', methods=['POST'])
def apply_changes():
    global current_live_config, pending_config # للوصول إلى المتغيرات العامة وتعديلها

    if not pending_config or pending_config == current_live_config:
        return jsonify({"message": "No new pending changes to apply."}), 200
    
    if _write_config(pending_config): # اكتب التكوين المعلق إلى الملف
        current_live_config = dict(pending_config) # التكوين المعلق يصبح هو التكوين المطبق الآن
        # قم بإعادة تشغيل Open Canary لتطبيق التغييرات
        result = restart_opencanary_process() # استدعاء دالة إعادة تشغيل العملية
        if result.get("status") == "success":
            return jsonify({"message": "Changes applied and OpenCanary restarted successfully."})
        else:
            return jsonify({"error": f"Changes applied to config, but OpenCanary restart failed: {result.get('error')}"}), 500
    else:
        return jsonify({"error": "Failed to write changes to config file."}), 500

# نقطة نهاية لإلغاء التغييرات المعلقة
@app.route('/api/discard_changes', methods=['POST'])
def discard_changes():
    global pending_config
    # استعادة pending_config إلى حالة current_live_config
    pending_config = dict(current_live_config)
    return jsonify({"message": "Pending changes discarded."})


# دالة مساعدة لإعادة تشغيل عملية Open Canary (وليست نقطة نهاية API)
def restart_opencanary_process():
    opencanaryd_path = "/home/open-canary/opencanary_project/env/bin/opencanaryd"
    
    try:
        # 1. البحث عن PID لـ opencanaryd الذي لا يزال يعمل وقتله بقوة
        try:
            # البحث عن عملية python3 التي تشغل المسار الكامل لـ opencanaryd
            find_pid_command = ["sudo", "pgrep", "-f", f"python3.*{opencanaryd_path}"]
            app.logger.info(f"Attempting to find active OpenCanary PID: {' '.join(find_pid_command)}")
            
            # تنفيذ الأمر وتتبع النتائج
            pid_result = subprocess.run(find_pid_command, capture_output=True, text=True, check=False)
            
            if pid_result.stdout:
                pids_to_kill = [p.strip() for p in pid_result.stdout.strip().split('\n') if p.strip()] # تقسيم PIDs حسب الأسطر الجديدة وفلترة الفراغات
                app.logger.info(f"Found PIDs to kill: {pids_to_kill}")
                
                for pid in pids_to_kill:
                    try:
                        # تأكد من أن pid هو رقم صحيح
                        if not pid.isdigit():
                            app.logger.warning(f"Skipping non-numeric PID: {pid}")
                            continue

                        kill_command_force = ["sudo", "kill", "-9", pid] # قتل قسري لكل PID
                        app.logger.info(f"Attempting to force kill OpenCanary PID {pid}: {' '.join(kill_command_force)}")
                        # استخدام check=False لأن kill -9 قد يفشل إذا انتهت العملية بالفعل
                        kill_result = subprocess.run(kill_command_force, check=False, capture_output=True, text=True)
                        if kill_result.returncode == 0:
                            app.logger.info(f"OpenCanary PID {pid} killed successfully.")
                        else:
                            # إذا كان returncode ليس 0، هذا يعني فشل. سجّل stderr
                            app.logger.warning(f"Failed to kill PID {pid}. stdout: {kill_result.stdout}, stderr: {kill_result.stderr}")
                    except Exception as kill_e:
                        app.logger.error(f"Error during individual kill for PID {pid}: {str(kill_e)}")
            else:
                app.logger.info("No active OpenCanary process found to kill.")
        except Exception as e:
            app.logger.error(f"Error during OpenCanary PID finding/killing attempt: {str(e)}")

        # إعطاء فرصة للنظام لتفريغ المنفذ بعد القتل القوي
        app.logger.info("Waiting 7 seconds for ports to free up...")
        time.sleep(7) 

        # 2. بدء Open Canary
        start_command = ['sudo', opencanaryd_path, '--start', '--uid=nobody', '--gid=nogroup']
        app.logger.info(f"Attempting to start OpenCanary: {' '.join(start_command)}")
        
        start_result = subprocess.run(start_command, check=False, capture_output=True, text=True)
        
        if start_result.returncode != 0:
            app.logger.error(f"OpenCanary start failed. stderr: {start_result.stderr}, stdout: {start_result.stdout}")
            return {"status": "error", "error": start_result.stderr or "OpenCanary failed to start."}
        else:
            app.logger.info(f"OpenCanary started successfully. stdout: {start_result.stdout}")
            return {"status": "success", "message": "OpenCanary process started."}

    except Exception as e:
        app.logger.error(f"Unexpected error during OpenCanary restart process (outer block): {str(e)}")
        return {"status": "error", "error": f"Unexpected Flask internal error: {str(e)}"}


# نقطة نهاية لعرض التنبيهات (Logs)
@app.route('/api/logs', methods=['GET'])
def get_logs():
    log_file_path = "/var/tmp/opencanary.log"
    parsed_logs = []
    try:
        with open(log_file_path, 'r') as f:
            for line in f:
                try:
                    log_entry = json.loads(line.strip())
                    # هنا يمكننا إضافة فلترة أو تحويل للبيانات إذا أردت
                    parsed_logs.append(log_entry)
                except json.JSONDecodeError:
                    app.logger.warning(f"Skipping non-JSON log line: {line.strip()}")
        # عكس ترتيب السجلات لعرض الأحدث أولاً
        return jsonify({"logs": parsed_logs[::-1]})
    except FileNotFoundError:
        app.logger.error(f"OpenCanary log file not found at {log_file_path}")
        return jsonify({"error": "OpenCanary log file not found"}), 404
    except Exception as e:
        app.logger.error(f"Error reading or processing log file: {e}")
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    initialize_configs() # استدعاء دالة التهيئة هنا
    app.run(debug=True, host='0.0.0.0', port=5000)
