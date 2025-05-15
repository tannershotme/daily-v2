// app.js - Core logic for Daily Checklist (UI/UX Revamp)

document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const startDayBtn = document.getElementById('startDayBtn');
    const resetDayBtn = document.getElementById('resetDayBtn');
    const editTasksBtn = document.getElementById('editTasksBtn'); // New
    const settingsBtn = document.getElementById('settingsBtn'); // Purpose changed
    
    const checklistUL = document.getElementById('checklist');
    const wakeTimeInput = document.getElementById('wakeTimeInput');
    const timePickerModal = document.getElementById('timePickerModal');
    const confirmTimePickBtn = document.getElementById('confirmTimePick');
    const cancelTimePickBtn = document.getElementById('cancelTimePick');
    
    const pastDueModal = document.getElementById('pastDueModal');
    const pastDueTaskListUL = document.getElementById('pastDueTaskList');
    const checkAllPastDueBtn = document.getElementById('checkAllPastDue');
    const closePastDueModalBtn = document.getElementById('closePastDueModal');

    // Task Management Modal Elements
    const taskManagementModal = document.getElementById('taskManagementModal');
    const tasksSettingsListUL_TM = document.getElementById('tasksSettingsList'); // Renamed for clarity
    const addNewTaskBtn_TM = document.getElementById('addNewTaskBtnTM');
    const saveTaskManagementBtn = document.getElementById('saveTaskManagement');
    const cancelTaskManagementBtn = document.getElementById('cancelTaskManagement');

    // App Settings Modal Elements
    const settingsModal = document.getElementById('settingsModal'); // This is now App Settings
    const themeToggleSwitch = document.getElementById('themeToggleSwitch');
    const requestNotificationPermissionBtn = document.getElementById('requestNotificationPermissionBtn');
    const notificationStatusP = document.getElementById('notificationStatus');
    const closeSettingsBtn = document.getElementById('closeSettings');

    const wakeTimeDisplayContainer = document.getElementById('wakeTimeDisplayContainer');
    const wakeTimeDisplaySpan = document.getElementById('wakeTimeDisplay');
    const infoMessageDiv = document.getElementById('infoMessage');
    const currentYearSpan = document.getElementById('currentYear');
    const themeMetaTag = document.querySelector('meta[name="theme-color"]');


    // --- App State ---
    let wakeTime = null; // Epoch ms
    let tasks = []; // Array of { id, label, offset (total minutes), notificationTimeoutId }
    let taskStatus = {}; // { taskId: boolean (true if done) }
    let activeModal = null; 
    let lastFocusedElement = null;

    // --- Constants ---
    const DEFAULT_TASKS = [
        { id: 'task_def_1', label: 'Take Vitamin D & K2', offset: 0 }, // At wake up
        { id: 'task_def_2', label: 'Hydrate: 500ml Water + Electrolytes', offset: 5 },
        { id: 'task_def_3', label: 'Breakfast & Probiotics', offset: 30 },
        { id: 'task_def_4', label: 'Mid-morning: Magnesium Glycinate', offset: 180 }, // 3 hours
        { id: 'task_def_5', label: 'Evening: Omega-3 Fish Oil', offset: 720 } // 12 hours
    ];
    const LOCAL_STORAGE_KEYS = {
        theme: 'dailyChecklistTheme',
        tasks: 'dailyChecklistTasks_v2', // Increment version if structure changes significantly
        wakeTime: 'dailyChecklistWakeTime',
        taskStatus: 'dailyChecklistTaskStatus',
        taskStatusDate: 'dailyChecklistTaskStatusDate'
    };

    // --- Initialization ---
    function init() {
        loadTheme(); // Load theme early
        loadTasksFromStorage();
        loadWakeTime();
        loadTaskStatus();

        renderChecklist();
        updateControlsVisibility();
        updateNotificationStatusDisplay();
        if(currentYearSpan) currentYearSpan.textContent = new Date().getFullYear();

        registerServiceWorker();
        checkAutoReset();
        setupEventListeners();
    }

    function setupEventListeners() {
        startDayBtn.addEventListener('click', () => openModal(timePickerModal, startDayBtn));
        resetDayBtn.addEventListener('click', handleResetDay);
        editTasksBtn.addEventListener('click', () => openModal(taskManagementModal, editTasksBtn));
        settingsBtn.addEventListener('click', () => openModal(settingsModal, settingsBtn));

        // Time Picker Modal
        confirmTimePickBtn.addEventListener('click', handleConfirmTimePick);
        cancelTimePickBtn.addEventListener('click', () => closeModal(timePickerModal));
        
        // Past Due Modal
        closePastDueModalBtn.addEventListener('click', handleClosePastDueModal);
        checkAllPastDueBtn.addEventListener('click', handleCheckAllPastDue);
        
        // Task Management Modal
        addNewTaskBtn_TM.addEventListener('click', handleAddNewTask_TM);
        saveTaskManagementBtn.addEventListener('click', handleSaveTaskManagement);
        cancelTaskManagementBtn.addEventListener('click', () => {
            loadTasksFromStorage(); // Revert unsaved changes
            closeModal(taskManagementModal);
        });
        tasksSettingsListUL_TM.addEventListener('click', handleTaskListActions_TM); // For remove buttons

        // App Settings Modal
        themeToggleSwitch.addEventListener('click', toggleTheme);
        requestNotificationPermissionBtn.addEventListener('click', requestNotifications);
        closeSettingsBtn.addEventListener('click', () => closeModal(settingsModal));
        
        // Event Delegation for main checklist and past due list
        checklistUL.addEventListener('click', handleChecklistClick);
        pastDueTaskListUL.addEventListener('change', handlePastDueItemChange);

        document.addEventListener('keydown', handleGlobalKeyDown);
    }
    
    // --- Theme Management ---
    function loadTheme() {
        const storedTheme = localStorage.getItem(LOCAL_STORAGE_KEYS.theme);
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        const isDark = storedTheme === 'dark' || (!storedTheme && prefersDark);

        document.documentElement.classList.toggle('dark', isDark);
        if (themeToggleSwitch) themeToggleSwitch.setAttribute('aria-checked', isDark.toString());
        if (themeMetaTag) themeMetaTag.setAttribute('content', isDark ? '#111827' : '#FFFFFF'); // gray-900 or white
        
        // Ensure body classes are correct for initial load if not handled by inline script
        document.body.classList.toggle('bg-white', !isDark);
        document.body.classList.toggle('text-gray-900', !isDark);
        document.body.classList.toggle('dark:bg-gray-900', isDark);
        document.body.classList.toggle('dark:text-gray-100', isDark);
    }

    function toggleTheme() {
        const isDark = document.documentElement.classList.toggle('dark');
        localStorage.setItem(LOCAL_STORAGE_KEYS.theme, isDark ? 'dark' : 'light');
        if (themeToggleSwitch) themeToggleSwitch.setAttribute('aria-checked', isDark.toString());
        if (themeMetaTag) themeMetaTag.setAttribute('content', isDark ? '#111827' : '#FFFFFF');

        // Explicitly set body classes for transition
        document.body.style.transition = 'background-color 0.3s ease, color 0.3s ease';
        if (isDark) {
            document.body.classList.remove('bg-white', 'text-gray-900');
            document.body.classList.add('dark:bg-gray-900', 'dark:text-gray-100');
        } else {
            document.body.classList.remove('dark:bg-gray-900', 'dark:text-gray-100');
            document.body.classList.add('bg-white', 'text-gray-900');
        }
        // Remove explicit style after transition to allow Tailwind to manage
        setTimeout(() => { document.body.style.transition = ''; }, 300);
    }
    
    // --- Service Worker & Notifications (Largely unchanged, ensure correct function calls) ---
    async function registerServiceWorker() { /* ... same as v2 ... */ 
        if ('serviceWorker' in navigator) {
            try {
                const registration = await navigator.serviceWorker.register('sw.js');
                console.log('Service Worker registered with scope:', registration.scope);
                if (wakeTime && Notification.permission === 'granted') {
                    scheduleAllNotifications();
                }
            } catch (error) {
                console.error('Service Worker registration failed:', error);
                showInfoMessage('Offline features might be limited.', 'error');
            }
        } else {
            showInfoMessage('Service Workers not supported. Offline features and notifications will not be available.', 'warning');
        }
    }
    async function requestNotifications() { /* ... same as v2, ensure showInfoMessage is used ... */ 
        if (!('Notification' in window) || !navigator.serviceWorker) {
            showInfoMessage('Notifications are not supported in this browser.', 'warning');
            updateNotificationStatusDisplay('Not supported');
            return;
        }
        const currentPermission = Notification.permission;
        if (currentPermission === 'granted') {
            updateNotificationStatusDisplay('Granted');
            if (wakeTime) scheduleAllNotifications();
        } else if (currentPermission !== 'denied') {
            const permission = await Notification.requestPermission();
            updateNotificationStatusDisplay(permission); // This will update the text
            if (permission === 'granted') {
                if (wakeTime) scheduleAllNotifications();
            } else {
                showInfoMessage('Notifications permission was not granted.', 'info');
            }
        } else { 
            updateNotificationStatusDisplay('Denied');
            showInfoMessage('Notifications are denied. Please enable them in browser settings.', 'warning');
        }
    }
    function updateNotificationStatusDisplay(status) { /* ... same as v2 ... */ 
        const displayStatus = status || Notification.permission || 'default';
        notificationStatusP.textContent = `Status: ${displayStatus.charAt(0).toUpperCase() + displayStatus.slice(1)}`;
        if (displayStatus === "granted" || displayStatus === "Denied") { // Denied also means user acted
            requestNotificationPermissionBtn.classList.add('hidden');
        } else {
            requestNotificationPermissionBtn.classList.remove('hidden');
        }
    }
    function scheduleNotification(task) { /* ... same as v2 ... */ 
        if (!wakeTime || Notification.permission !== 'granted' || !('serviceWorker' in navigator) || taskStatus[task.id]) {
            return; 
        }
        const now = Date.now();
        const notificationTime = wakeTime + (task.offset * 60 * 1000);
        if (notificationTime > now) {
            const delay = notificationTime - now;
            if (task.notificationTimeoutId) clearTimeout(task.notificationTimeoutId);
            task.notificationTimeoutId = setTimeout(async () => {
                if (!taskStatus[task.id]) { 
                    try {
                        const registration = await navigator.serviceWorker.ready;
                        registration.showNotification('Task Reminder', {
                            body: `Time for: ${task.label}`, icon: 'icon-192.svg', tag: task.id, renotify: true, data: { taskId: task.id }
                        });
                    } catch (err) { console.error('Error showing SW notification:', err); }
                }
                delete task.notificationTimeoutId; 
            }, delay);
        } else {
            if (task.notificationTimeoutId) { clearTimeout(task.notificationTimeoutId); delete task.notificationTimeoutId; }
        }
    }
    function scheduleAllNotifications() { /* ... same as v2 ... */ 
        if (!wakeTime || Notification.permission !== 'granted') return;
        tasks.forEach(task => scheduleNotification(task));
    }
    function clearSpecificNotification(taskId) { /* ... same as v2 ... */ 
        const task = tasks.find(t => t.id === taskId);
        if (task && task.notificationTimeoutId) {
            clearTimeout(task.notificationTimeoutId);
            delete task.notificationTimeoutId;
        }
    }
    function clearAllScheduledNotifications() { /* ... same as v2 ... */
        tasks.forEach(task => {
            if (task.notificationTimeoutId) {
                clearTimeout(task.notificationTimeoutId);
                delete task.notificationTimeoutId;
            }
        });
        console.log("Cleared all app.js scheduled notifications.");
     }

    // --- Data Persistence ---
    function loadTasksFromStorage() { /* ... same as v2, using new LOCAL_STORAGE_KEYS.tasks ... */ 
        try {
            const storedTasks = localStorage.getItem(LOCAL_STORAGE_KEYS.tasks);
            tasks = storedTasks ? JSON.parse(storedTasks) : [...DEFAULT_TASKS.map(t => ({...t}))];
            if (!storedTasks) saveTasksToStorage();
        } catch (e) {
            console.error("Error loading tasks:", e); tasks = [...DEFAULT_TASKS.map(t => ({...t}))];
            showInfoMessage("Could not load saved tasks. Using defaults.", "error");
        }
    }
    function saveTasksToStorage() { /* ... same as v2 ... */ 
        try { localStorage.setItem(LOCAL_STORAGE_KEYS.tasks, JSON.stringify(tasks)); }
        catch (e) { console.error("Error saving tasks:", e); showInfoMessage("Could not save tasks.", "error");}
    }
    function loadWakeTime() { /* ... same as v2 ... */ 
        const storedWakeTime = localStorage.getItem(LOCAL_STORAGE_KEYS.wakeTime);
        if (storedWakeTime) { wakeTime = parseInt(storedWakeTime, 10); updateWakeTimeDisplay(); }
    }
    function saveWakeTime() { /* ... same as v2 ... */ 
        if (wakeTime) { localStorage.setItem(LOCAL_STORAGE_KEYS.wakeTime, wakeTime.toString()); }
        else { localStorage.removeItem(LOCAL_STORAGE_KEYS.wakeTime); }
        updateWakeTimeDisplay();
    }
    function updateWakeTimeDisplay() { /* ... same as v2 ... */ 
        if (wakeTime) {
            wakeTimeDisplaySpan.textContent = new Date(wakeTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            wakeTimeDisplayContainer.classList.remove('hidden');
        } else {
            wakeTimeDisplaySpan.textContent = 'Not Set';
            wakeTimeDisplayContainer.classList.add('hidden');
        }
    }
    function loadTaskStatus() { /* ... same as v2 ... */ 
        try {
            const storedStatus = localStorage.getItem(LOCAL_STORAGE_KEYS.taskStatus);
            taskStatus = storedStatus ? JSON.parse(storedStatus) : {};
        } catch (e) { console.error("Error loading task status:", e); taskStatus = {}; showInfoMessage("Could not load task statuses.", "error");}
    }
    function saveTaskStatus() { /* ... same as v2 ... */ 
        try { localStorage.setItem(LOCAL_STORAGE_KEYS.taskStatus, JSON.stringify(taskStatus));}
        catch(e) { console.error("Error saving task status:", e); showInfoMessage("Could not save task progress.", "error");}
    }

    // --- UI Rendering & Updates ---
    function renderChecklist() { /* ... same as v2, ensure dark mode text colors are good ... */ 
        checklistUL.innerHTML = ''; 
        if (!wakeTime) {
            checklistUL.innerHTML = `<li class="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-md text-center text-gray-500 dark:text-gray-400">Set your wake-up time to see today's tasks.</li>`;
            return;
        }
        if (tasks.length === 0) {
            checklistUL.innerHTML = `<li class="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-md text-center text-gray-500 dark:text-gray-400">No tasks configured. Go to "Manage Tasks" to add some.</li>`;
            return;
        }
        const sortedTasks = [...tasks].sort((a, b) => a.offset - b.offset);
        sortedTasks.forEach(task => {
            const isDone = taskStatus[task.id] || false;
            const li = document.createElement('li');
            li.className = `task-item flex items-center justify-between p-3.5 rounded-lg shadow-sm cursor-pointer transition-all duration-150 ease-in-out ${isDone ? 'done bg-green-100 dark:bg-green-700/30 ' : 'bg-gray-50 dark:bg-gray-700/60 hover:bg-gray-100 dark:hover:bg-gray-600/80'}`;
            li.dataset.taskId = task.id;
            const taskTime = new Date(wakeTime + task.offset * 60000);
            const formattedTime = taskTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            li.innerHTML = `
                <div class="flex items-center">
                    <input type="checkbox" id="task-cb-${task.id}" class="mr-3 h-5 w-5 text-blue-600 border-gray-300 dark:border-gray-500 rounded focus:ring-blue-500 dark:focus:ring-blue-400 dark:checked:bg-blue-500 dark:bg-gray-600" ${isDone ? 'checked' : ''} aria-labelledby="task-label-${task.id}">
                    <label id="task-label-${task.id}" for="task-cb-${task.id}" class="task-label text-gray-800 dark:text-gray-200 ${isDone ? 'text-gray-500 dark:text-gray-400' : ''}">${task.label}</label>
                </div>
                <span class="text-sm font-medium text-blue-600 dark:text-blue-400">${formattedTime}</span>
            `;
            checklistUL.appendChild(li);
        });
    }
    function updateControlsVisibility() { /* ... same as v2 ... */ 
        if (wakeTime) { startDayBtn.classList.add('hidden'); resetDayBtn.classList.remove('hidden'); }
        else { startDayBtn.classList.remove('hidden'); resetDayBtn.classList.add('hidden'); }
    }
    function showInfoMessage(message, type = 'info', duration = 5000) { /* ... same as v2 ... */ 
        infoMessageDiv.textContent = message;
        infoMessageDiv.className = 'mb-4 p-3 rounded-lg text-center transition-opacity duration-300 opacity-0'; 
        
        const typeClasses = {
            success: 'bg-green-100 dark:bg-green-800/80 border border-green-300 dark:border-green-600 text-green-700 dark:text-green-200',
            warning: 'bg-yellow-100 dark:bg-yellow-700/80 border border-yellow-300 dark:border-yellow-500 text-yellow-700 dark:text-yellow-200',
            error: 'bg-red-100 dark:bg-red-700/80 border border-red-300 dark:border-red-500 text-red-700 dark:text-red-200',
            info: 'bg-blue-100 dark:bg-blue-800/80 border border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300'
        };
        infoMessageDiv.classList.add(...(typeClasses[type] || typeClasses.info).split(' '));
        infoMessageDiv.classList.remove('hidden');
        setTimeout(() => infoMessageDiv.classList.remove('opacity-0'), 50); // For fade in
        
        if (infoMessageDiv.timeoutId) clearTimeout(infoMessageDiv.timeoutId);
        if (duration > 0) {
            infoMessageDiv.timeoutId = setTimeout(() => {
                infoMessageDiv.classList.add('opacity-0');
                setTimeout(() => infoMessageDiv.classList.add('hidden'), 300); // Wait for fade out
            }, duration);
        }
    }

    // --- Modal Management ---
    function openModal(modalElement, openerElement) { /* ... same as v2, with specific logic for new modals ... */ 
        lastFocusedElement = openerElement || document.activeElement; 
        modalElement.classList.add('active');
        activeModal = modalElement;
        const focusableElements = modalElement.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (focusableElements.length > 0) focusableElements[0].focus();

        if (modalElement === timePickerModal) {
            const now = new Date();
            let defaultTime = now.toTimeString().substring(0, 5);
            if (wakeTime) {
                const wakeDate = new Date(wakeTime);
                if (wakeDate.toDateString() === now.toDateString()) defaultTime = wakeDate.toTimeString().substring(0, 5);
            }
            wakeTimeInput.value = defaultTime;
        } else if (modalElement === taskManagementModal) {
            renderTasksForManagement();
        } else if (modalElement === settingsModal) {
            // Theme switch already reflects state due to loadTheme() and direct manipulation
            updateNotificationStatusDisplay();
        }
    }
    function closeModal(modalElement) { /* ... same as v2 ... */ 
        modalElement.classList.remove('active');
        activeModal = null;
        if (lastFocusedElement) { lastFocusedElement.focus(); lastFocusedElement = null; }
    }
    function handleGlobalKeyDown(event) { /* ... same as v2 ... */ 
        if (event.key === 'Escape' && activeModal) closeModal(activeModal);
        if (event.key === 'Tab' && activeModal) {
            const focusable = Array.from(activeModal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')).filter(el => el.offsetParent !== null);
            if (focusable.length === 0) return;
            const first = focusable[0], last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) { last.focus(); event.preventDefault(); }
            else if (!event.shiftKey && document.activeElement === last) { first.focus(); event.preventDefault(); }
        }
    }
    
    // --- Core Logic Handlers (Time, Reset, Past Due) ---
    function handleConfirmTimePick() { /* ... same as v2 ... */ 
        const timeValue = wakeTimeInput.value;
        if (!timeValue) { showInfoMessage('Please select a valid time.', 'warning', 3000); wakeTimeInput.focus(); return; }
        const [hours, minutes] = timeValue.split(':').map(Number);
        const today = new Date(); today.setHours(hours, minutes, 0, 0);
        const newWakeTime = today.getTime();
        if (wakeTime) {
            const oldWakeDate = new Date(wakeTime);
            if (oldWakeDate.toDateString() === today.toDateString() && Math.abs(newWakeTime - wakeTime) > 60000) {
                if (!confirm("Changing wake time for today will reset task statuses. Continue?")) { closeModal(timePickerModal); return; }
                taskStatus = {}; localStorage.setItem(LOCAL_STORAGE_KEYS.taskStatusDate, today.toDateString());
            }
        }
        wakeTime = newWakeTime; saveWakeTime(); updateControlsVisibility(); closeModal(timePickerModal);
        const todayDateStr = new Date().toDateString();
        const lastStatusDate = localStorage.getItem(LOCAL_STORAGE_KEYS.taskStatusDate);
        if (lastStatusDate !== todayDateStr) { taskStatus = {}; localStorage.setItem(LOCAL_STORAGE_KEYS.taskStatusDate, todayDateStr); }
        saveTaskStatus(); renderChecklist(); handlePastDueTasks(); scheduleAllNotifications();
        showInfoMessage(`Day started at ${new Date(wakeTime).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}.`, 'success');
    }
    function handleResetDay() { /* ... same as v2 ... */ 
        if (confirm('Reset day? This clears wake time and task progress.')) {
            wakeTime = null; taskStatus = {}; saveWakeTime(); saveTaskStatus();
            localStorage.removeItem(LOCAL_STORAGE_KEYS.taskStatusDate);
            updateControlsVisibility(); renderChecklist(); clearAllScheduledNotifications(); updateWakeTimeDisplay();
            showInfoMessage('Day has been reset.', 'info');
        }
    }
    function checkAutoReset() { /* ... same as v2 ... */ 
        if (!wakeTime) return; const now = new Date(); const wakeDate = new Date(wakeTime);
        if (now.toDateString() !== wakeDate.toDateString()) {
            const diffHours = (now.getTime() - wakeTime) / (1000 * 60 * 60);
            if (diffHours >= 20) { // Reset if more than 20 hours passed
                showInfoMessage("Auto-reset: Previous day's schedule cleared.", "info", 7000);
                handleResetDayInternal();
            }
        }
    }
    function handleResetDayInternal() { /* ... same as v2 ... */ 
        wakeTime = null; taskStatus = {}; saveWakeTime(); saveTaskStatus(); localStorage.removeItem(LOCAL_STORAGE_KEYS.taskStatusDate);
        updateControlsVisibility(); renderChecklist(); clearAllScheduledNotifications(); updateWakeTimeDisplay();
    }
    function handlePastDueTasks() { /* ... same as v2 ... */ 
        if (!wakeTime) return; const now = Date.now();
        const pastDueUncheckedTasks = tasks.filter(task => (wakeTime + task.offset * 60000 < now && !taskStatus[task.id]));
        if (pastDueUncheckedTasks.length > 0) {
            pastDueTaskListUL.innerHTML = ''; 
            pastDueUncheckedTasks.sort((a,b) => a.offset - b.offset).forEach(task => {
                const li = document.createElement('li');
                li.className = 'flex items-center justify-between p-2.5 bg-gray-100 dark:bg-gray-700 rounded-md shadow-sm';
                const taskTime = new Date(wakeTime + task.offset * 60000);
                const formattedTime = taskTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                li.innerHTML = `
                    <label for="pastdue-cb-${task.id}" class="flex-grow text-gray-700 dark:text-gray-300 cursor-pointer">
                        <input type="checkbox" id="pastdue-cb-${task.id}" data-task-id="${task.id}" class="mr-2 h-4 w-4 text-red-600 border-gray-300 dark:border-gray-500 rounded focus:ring-red-500 dark:focus:ring-red-400 dark:checked:bg-red-500 dark:bg-gray-600">
                        ${task.label} (Due: ${formattedTime})
                    </label>`;
                pastDueTaskListUL.appendChild(li);
            });
            openModal(pastDueModal, null); 
        }
    }
    function handleCheckAllPastDue() { /* ... same as v2 ... */ 
        pastDueTaskListUL.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            cb.checked = true; if (cb.dataset.taskId) taskStatus[cb.dataset.taskId] = true;
        });
        saveTaskStatus(); renderChecklist(); scheduleAllNotifications(); closeModal(pastDueModal);
        showInfoMessage('Marked past due tasks as done.', 'success');
    }
    function handleClosePastDueModal() { /* ... same as v2 ... */ 
        saveTaskStatus(); renderChecklist(); scheduleAllNotifications(); closeModal(pastDueModal);
    }
    function handlePastDueItemChange(event) { /* ... same as v2 ... */ 
        const cb = event.target.closest('input[type="checkbox"]');
        if (cb && cb.dataset.taskId) taskStatus[cb.dataset.taskId] = cb.checked;
    }
    
    // --- Task Management Modal Logic (New/Revised) ---
    function renderTasksForManagement() {
        tasksSettingsListUL_TM.innerHTML = '';
        if (tasks.length === 0) {
            tasksSettingsListUL_TM.innerHTML = `<p class="text-gray-500 dark:text-gray-400 text-sm p-2 text-center">No tasks yet. Click "Add New Task" to begin.</p>`;
        }
        tasks.forEach((task) => {
            const li = document.createElement('li');
            li.dataset.taskId = task.id; 
            li.className = 'p-3 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-700/50 shadow-sm space-y-2';
            
            const offsetHours = Math.floor(task.offset / 60);
            const offsetMinutes = task.offset % 60;

            li.innerHTML = `
                <div>
                    <label for="label-tm-${task.id}" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Task Description</label>
                    <input type="text" id="label-tm-${task.id}" value="${task.label}" placeholder="e.g., Morning Vitamins" data-field="label" class="input-field w-full bg-white dark:bg-gray-600">
                </div>
                <div class="text-sm font-medium text-gray-700 dark:text-gray-300">Time After Wake Up:</div>
                <div class="flex items-center space-x-2">
                    <div>
                        <label for="offset-h-tm-${task.id}" class="block text-xs text-gray-500 dark:text-gray-400">Hours</label>
                        <input type="number" id="offset-h-tm-${task.id}" value="${offsetHours}" data-field="offsetHours" min="0" max="23" class="input-field w-20 text-center bg-white dark:bg-gray-600">
                    </div>
                    <span class="pt-4 text-gray-700 dark:text-gray-300">:</span>
                    <div>
                        <label for="offset-m-tm-${task.id}" class="block text-xs text-gray-500 dark:text-gray-400">Minutes</label>
                        <input type="number" id="offset-m-tm-${task.id}" value="${offsetMinutes}" data-field="offsetMinutes" min="0" max="59" step="5" class="input-field w-20 text-center bg-white dark:bg-gray-600">
                    </div>
                    <button data-action="remove" aria-label="Remove task ${task.label}" class="ml-auto self-end remove-task-btn bg-red-500 hover:bg-red-600 text-white p-2 rounded-md text-xs">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd" /></svg>
                    </button>
                </div>
            `;
            tasksSettingsListUL_TM.appendChild(li);
        });
    }

    function handleAddNewTask_TM() {
        const newId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        tasks.push({ id: newId, label: '', offset: 0 }); // Add to memory
        renderTasksForManagement(); // Re-render the list
        const newLabelInput = tasksSettingsListUL_TM.querySelector(`li[data-task-id="${newId}"] input[data-field="label"]`);
        if (newLabelInput) newLabelInput.focus();
    }
    
    function handleTaskListActions_TM(event) {
        const removeButton = event.target.closest('button[data-action="remove"]');
        if (removeButton) {
            const li = removeButton.closest('li[data-task-id]');
            const taskIdToRemove = li.dataset.taskId;
            tasks = tasks.filter(task => task.id !== taskIdToRemove); // Remove from memory
            renderTasksForManagement(); // Re-render
        }
    }

    function handleSaveTaskManagement() {
        const updatedTasks = [];
        const taskItems = tasksSettingsListUL_TM.querySelectorAll('li[data-task-id]');
        let allValid = true;

        taskItems.forEach(item => {
            const id = item.dataset.taskId;
            const labelInput = item.querySelector('input[data-field="label"]');
            const offsetHoursInput = item.querySelector('input[data-field="offsetHours"]');
            const offsetMinutesInput = item.querySelector('input[data-field="offsetMinutes"]');

            const label = labelInput.value.trim();
            const hours = parseInt(offsetHoursInput.value, 10) || 0;
            const minutes = parseInt(offsetMinutesInput.value, 10) || 0;

            if (label === "") {
                showInfoMessage(`A task was not saved because its label was empty. Please provide a description.`, 'warning', 4000);
                labelInput.focus();
                allValid = false;
                return; 
            }
            if (isNaN(hours) || hours < 0 || isNaN(minutes) || minutes < 0 || minutes > 59) {
                 showInfoMessage(`Task "${label}" has an invalid time offset. Hours and minutes must be valid numbers.`, 'warning', 4000);
                 allValid = false;
                 (isNaN(hours) || hours < 0 ? offsetHoursInput : offsetMinutesInput).focus();
                 return;
            }
            const totalOffsetMinutes = (hours * 60) + minutes;
            updatedTasks.push({ id, label, offset: totalOffsetMinutes });
        });

        if (!allValid) return; // Don't save if there were validation errors

        tasks = updatedTasks; 
        saveTasksToStorage();
        closeModal(taskManagementModal);
        renderChecklist(); 
        if (wakeTime) {
            clearAllScheduledNotifications(); 
            scheduleAllNotifications();     
        }
        showInfoMessage('Tasks updated successfully!', 'success');
    }
    
    // --- Checklist Item Click Handler ---
    function handleChecklistClick(event) { /* ... same as v2 ... */ 
        const taskItem = event.target.closest('.task-item');
        if (!taskItem) return;
        const taskId = taskItem.dataset.taskId;
        const checkbox = taskItem.querySelector('input[type="checkbox"]');
        if (event.target !== checkbox) checkbox.checked = !checkbox.checked;
        taskStatus[taskId] = checkbox.checked;
        saveTaskStatus(); renderChecklist();
        if (taskStatus[taskId]) clearSpecificNotification(taskId);
        else { const task = tasks.find(t => t.id === taskId); if (task) scheduleNotification(task); }
    }

    // --- Start the app ---
    init();
});
