// app.js - Core logic for the Daily Supplement & Medication Checklist (Enhanced)

document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const startDayBtn = document.getElementById('startDayBtn');
    const resetDayBtn = document.getElementById('resetDayBtn');
    const settingsBtn = document.getElementById('settingsBtn');
    const themeToggleBtn = document.getElementById('themeToggleBtn');
    const checklistUL = document.getElementById('checklist');
    const wakeTimeInput = document.getElementById('wakeTimeInput');
    const timePickerModal = document.getElementById('timePickerModal');
    const confirmTimePickBtn = document.getElementById('confirmTimePick');
    const cancelTimePickBtn = document.getElementById('cancelTimePick');
    const pastDueModal = document.getElementById('pastDueModal');
    const pastDueTaskListUL = document.getElementById('pastDueTaskList');
    const checkAllPastDueBtn = document.getElementById('checkAllPastDue');
    const closePastDueModalBtn = document.getElementById('closePastDueModal');
    const settingsModal = document.getElementById('settingsModal');
    const tasksSettingsListUL = document.getElementById('tasksSettingsList');
    const addNewTaskBtn = document.getElementById('addNewTaskBtn');
    const saveSettingsBtn = document.getElementById('saveSettings');
    const cancelSettingsBtn = document.getElementById('cancelSettings');
    const requestNotificationPermissionBtn = document.getElementById('requestNotificationPermissionBtn');
    const notificationStatusP = document.getElementById('notificationStatus');
    const wakeTimeDisplayContainer = document.getElementById('wakeTimeDisplayContainer');
    const wakeTimeDisplaySpan = document.getElementById('wakeTimeDisplay');
    const infoMessageDiv = document.getElementById('infoMessage');
    const currentYearSpan = document.getElementById('currentYear');

    // --- App State ---
    let wakeTime = null; // Epoch ms
    let tasks = []; // Array of { id, label, offset (minutes), notificationTimeoutId }
    let taskStatus = {}; // { taskId: boolean (true if done) }
    let activeModal = null; // To manage currently open modal for focus trapping
    let lastFocusedElement = null; // To restore focus when modal closes

    // --- Constants ---
    const DEFAULT_TASKS = [
        { id: 'task_default_1', label: 'Take Vitamin D', offset: 0 },
        { id: 'task_default_2', label: 'Morning Hydration (500ml Water)', offset: 5 },
        { id: 'task_default_3', label: 'Breakfast & Probiotics', offset: 30 },
        { id: 'task_default_4', label: 'Mid-morning Magnesium', offset: 180 },
        { id: 'task_default_5', label: 'Evening Omega-3', offset: 720 }
    ];
    const LOCAL_STORAGE_KEYS = {
        theme: 'dailyChecklistTheme',
        tasks: 'dailyChecklistTasks',
        wakeTime: 'dailyChecklistWakeTime',
        taskStatus: 'dailyChecklistTaskStatus',
        taskStatusDate: 'dailyChecklistTaskStatusDate'
    };

    // --- Initialization ---
    function init() {
        // Load initial state
        loadTheme();
        loadTasksFromStorage();
        loadWakeTime();
        loadTaskStatus();

        // Render UI
        renderChecklist();
        updateControlsVisibility();
        updateNotificationStatusDisplay();
        if(currentYearSpan) currentYearSpan.textContent = new Date().getFullYear();


        // Register Service Worker
        registerServiceWorker();
        
        // Automatic checks
        checkAutoReset();

        // Attach Event Listeners
        setupEventListeners();
    }

    // --- Event Listener Setup ---
    function setupEventListeners() {
        startDayBtn.addEventListener('click', () => openModal(timePickerModal, startDayBtn));
        resetDayBtn.addEventListener('click', handleResetDay);
        settingsBtn.addEventListener('click', () => openModal(settingsModal, settingsBtn));
        themeToggleBtn.addEventListener('click', toggleTheme);

        // Modals
        confirmTimePickBtn.addEventListener('click', handleConfirmTimePick);
        cancelTimePickBtn.addEventListener('click', () => closeModal(timePickerModal));
        
        closePastDueModalBtn.addEventListener('click', handleClosePastDueModal);
        checkAllPastDueBtn.addEventListener('click', handleCheckAllPastDue);
        
        addNewTaskBtn.addEventListener('click', handleAddNewTaskSetting);
        saveSettingsBtn.addEventListener('click', handleSaveSettings);
        cancelSettingsBtn.addEventListener('click', () => {
            loadTasksFromStorage(); // Revert unsaved changes
            closeModal(settingsModal);
        });
        
        requestNotificationPermissionBtn.addEventListener('click', requestNotifications);

        // Event Delegation for dynamic content
        checklistUL.addEventListener('click', handleChecklistClick);
        tasksSettingsListUL.addEventListener('click', handleSettingsListClick);
        pastDueTaskListUL.addEventListener('change', handlePastDueItemChange);


        // Global listeners
        document.addEventListener('keydown', handleGlobalKeyDown);
    }
    
    // --- Service Worker & Notifications ---
    // (Section for SW registration, notification requests, scheduling, clearing)
    async function registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            try {
                const registration = await navigator.serviceWorker.register('sw.js');
                console.log('Service Worker registered with scope:', registration.scope);
                if (wakeTime && Notification.permission === 'granted') {
                     // If SW activates after day started, ensure notifications are (re)scheduled
                    scheduleAllNotifications();
                }
            } catch (error) {
                console.error('Service Worker registration failed:', error);
                showInfoMessage('Offline features might be limited. Could not register service worker.', 'error');
            }
        } else {
            showInfoMessage('Service Workers not supported. Offline features and notifications will not be available.', 'warning');
        }
    }

    async function requestNotifications() {
        if (!('Notification' in window) || !navigator.serviceWorker) {
            showInfoMessage('Notifications are not supported in this browser.', 'warning');
            updateNotificationStatusDisplay('Not supported');
            return;
        }

        const currentPermission = Notification.permission;
        if (currentPermission === 'granted') {
            updateNotificationStatusDisplay('Granted');
            // new Notification('Test: Notifications are already enabled!');
            if (wakeTime) scheduleAllNotifications();
        } else if (currentPermission !== 'denied') {
            const permission = await Notification.requestPermission();
            updateNotificationStatusDisplay(permission);
            if (permission === 'granted') {
                // new Notification('Test: Notifications enabled successfully!');
                if (wakeTime) scheduleAllNotifications();
            } else {
                showInfoMessage('Notifications permission was not granted. Reminders will not be shown.', 'info');
            }
        } else { // Denied
            updateNotificationStatusDisplay('Denied');
            showInfoMessage('Notifications are denied. To enable, please check your browser settings for this site.', 'warning');
        }
    }
    
    function updateNotificationStatusDisplay(status) {
        const displayStatus = status || Notification.permission || 'default';
        notificationStatusP.textContent = `Status: ${displayStatus.charAt(0).toUpperCase() + displayStatus.slice(1)}`;
        if (displayStatus === "granted") {
            requestNotificationPermissionBtn.classList.add('hidden');
        } else {
            requestNotificationPermissionBtn.classList.remove('hidden');
        }
    }

    function scheduleNotification(task) {
        if (!wakeTime || Notification.permission !== 'granted' || !('serviceWorker' in navigator) || taskStatus[task.id]) {
            return; // Don't schedule if no wake time, no permission, no SW, or task already done
        }

        const now = Date.now();
        const notificationTime = wakeTime + (task.offset * 60 * 1000);

        if (notificationTime > now) {
            const delay = notificationTime - now;
            console.log(`Scheduling notification for "${task.label}" in ${Math.round(delay / 1000 / 60)} minutes (ID: ${task.id}).`);

            // Clear existing timeout for this task if any (using stored ID on task object)
            if (task.notificationTimeoutId) clearTimeout(task.notificationTimeoutId);
            
            task.notificationTimeoutId = setTimeout(async () => {
                if (!taskStatus[task.id]) { // Double check status before showing
                    try {
                        const registration = await navigator.serviceWorker.ready;
                        registration.showNotification('Task Reminder', {
                            body: `Time for: ${task.label}`,
                            icon: 'icon-192.svg',
                            tag: task.id, // Important: groups notifications, replaces if already one with same tag
                            renotify: true, // If a notification with the same tag is replaced, re-alert the user
                            data: { taskId: task.id } // Pass data to SW notificationclick handler
                        });
                        console.log(`Notification shown for ${task.label}`);
                    } catch (err) {
                        console.error('Error showing notification via Service Worker:', err);
                    }
                }
                delete task.notificationTimeoutId; // Clean up after firing or if task was done
            }, delay);
        } else {
            // If task time is in the past and not done, it should be handled by past-due logic, not scheduled.
            if (task.notificationTimeoutId) { // Clear any stray timeout if task time is now past
                clearTimeout(task.notificationTimeoutId);
                delete task.notificationTimeoutId;
            }
        }
    }

    function scheduleAllNotifications() {
        if (!wakeTime || Notification.permission !== 'granted') return;
        console.log("Attempting to schedule all notifications...");
        tasks.forEach(task => scheduleNotification(task));
    }

    function clearSpecificNotification(taskId) {
        const task = tasks.find(t => t.id === taskId);
        if (task && task.notificationTimeoutId) {
            clearTimeout(task.notificationTimeoutId);
            delete task.notificationTimeoutId;
            console.log(`Cleared scheduled notification for task: ${task.label}`);
        }
    }
    
    function clearAllScheduledNotifications() {
        tasks.forEach(task => {
            if (task.notificationTimeoutId) {
                clearTimeout(task.notificationTimeoutId);
                delete task.notificationTimeoutId;
            }
        });
        console.log("Cleared all scheduled notifications from app.js timeouts.");
        // Note: This doesn't clear notifications ALREADY SHOWN by the SW, only pending setTimeouts.
        // To clear active SW notifications, you'd need SW communication or rely on tags.
    }

    // --- Theme Management ---
    function loadTheme() {
        const storedTheme = localStorage.getItem(LOCAL_STORAGE_KEYS.theme);
        if (storedTheme === 'dark' || (!storedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
            document.documentElement.classList.add('dark');
            themeToggleBtn.textContent = 'Light Mode';
        } else {
            document.documentElement.classList.remove('dark');
            themeToggleBtn.textContent = 'Dark Mode';
        }
    }

    function toggleTheme() {
        const isDark = document.documentElement.classList.toggle('dark');
        localStorage.setItem(LOCAL_STORAGE_KEYS.theme, isDark ? 'dark' : 'light');
        themeToggleBtn.textContent = isDark ? 'Light Mode' : 'Dark Mode';
    }

    // --- Data Persistence (localStorage) ---
    function loadTasksFromStorage() {
        try {
            const storedTasks = localStorage.getItem(LOCAL_STORAGE_KEYS.tasks);
            tasks = storedTasks ? JSON.parse(storedTasks) : [...DEFAULT_TASKS.map(t => ({...t}))];
            if (!storedTasks) saveTasksToStorage(); // Save defaults if nothing was stored
        } catch (e) {
            console.error("Error loading tasks from localStorage:", e);
            tasks = [...DEFAULT_TASKS.map(t => ({...t}))]; // Fallback to defaults
            showInfoMessage("Could not load saved tasks. Using defaults.", "error");
        }
    }

    function saveTasksToStorage() {
        try {
            localStorage.setItem(LOCAL_STORAGE_KEYS.tasks, JSON.stringify(tasks));
        } catch (e) {
            console.error("Error saving tasks to localStorage:", e);
            showInfoMessage("Could not save tasks. Changes might be lost.", "error");
        }
    }

    function loadWakeTime() {
        const storedWakeTime = localStorage.getItem(LOCAL_STORAGE_KEYS.wakeTime);
        if (storedWakeTime) {
            wakeTime = parseInt(storedWakeTime, 10);
            updateWakeTimeDisplay();
        }
    }

    function saveWakeTime() {
        if (wakeTime) {
            localStorage.setItem(LOCAL_STORAGE_KEYS.wakeTime, wakeTime.toString());
        } else {
            localStorage.removeItem(LOCAL_STORAGE_KEYS.wakeTime);
        }
        updateWakeTimeDisplay();
    }
    
    function updateWakeTimeDisplay() {
        if (wakeTime) {
            wakeTimeDisplaySpan.textContent = new Date(wakeTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            wakeTimeDisplayContainer.classList.remove('hidden');
        } else {
            wakeTimeDisplaySpan.textContent = 'Not Set';
            wakeTimeDisplayContainer.classList.add('hidden');
        }
    }

    function loadTaskStatus() {
        try {
            const storedStatus = localStorage.getItem(LOCAL_STORAGE_KEYS.taskStatus);
            taskStatus = storedStatus ? JSON.parse(storedStatus) : {};
        } catch (e) {
            console.error("Error loading task status from localStorage:", e);
            taskStatus = {};
            showInfoMessage("Could not load task statuses.", "error");
        }
    }

    function saveTaskStatus() {
         try {
            localStorage.setItem(LOCAL_STORAGE_KEYS.taskStatus, JSON.stringify(taskStatus));
        } catch (e) {
            console.error("Error saving task status to localStorage:", e);
            showInfoMessage("Could not save task progress.", "error");
        }
    }

    // --- UI Rendering & Updates ---
    function renderChecklist() {
        checklistUL.innerHTML = ''; // Clear existing items
        if (!wakeTime) {
            checklistUL.innerHTML = `<li class="p-3 bg-gray-50 dark:bg-gray-700 rounded-md text-center text-gray-500 dark:text-gray-400">Set your wake-up time to see today's tasks.</li>`;
            return;
        }

        if (tasks.length === 0) {
            checklistUL.innerHTML = `<li class="p-3 bg-gray-50 dark:bg-gray-700 rounded-md text-center text-gray-500 dark:text-gray-400">No tasks configured. Go to Settings to add tasks.</li>`;
            return;
        }
        
        const sortedTasks = [...tasks].sort((a, b) => a.offset - b.offset);

        sortedTasks.forEach(task => {
            const isDone = taskStatus[task.id] || false;
            const li = document.createElement('li');
            li.className = `task-item flex items-center justify-between p-3.5 rounded-lg shadow cursor-pointer transition-all duration-200 ease-in-out ${isDone ? 'done bg-green-100 dark:bg-green-800 opacity-70' : 'bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600'}`;
            li.dataset.taskId = task.id;

            const taskTime = new Date(wakeTime + task.offset * 60000);
            const formattedTime = taskTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            li.innerHTML = `
                <div class="flex items-center">
                    <input type="checkbox" id="task-cb-${task.id}" class="mr-3 h-5 w-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500 dark:bg-gray-600 dark:border-gray-500 dark:focus:ring-blue-400 dark:checked:bg-blue-500" ${isDone ? 'checked' : ''} aria-labelledby="task-label-${task.id}">
                    <label id="task-label-${task.id}" for="task-cb-${task.id}" class="text-gray-800 dark:text-gray-200 ${isDone ? 'line-through text-gray-500 dark:text-gray-400' : ''}">${task.label}</label>
                </div>
                <span class="text-sm font-medium text-blue-600 dark:text-blue-400">${formattedTime}</span>
            `;
            checklistUL.appendChild(li);
        });
    }

    function updateControlsVisibility() {
        if (wakeTime) {
            startDayBtn.classList.add('hidden');
            resetDayBtn.classList.remove('hidden');
        } else {
            startDayBtn.classList.remove('hidden');
            resetDayBtn.classList.add('hidden');
        }
    }
    
    function showInfoMessage(message, type = 'info', duration = 5000) {
        infoMessageDiv.textContent = message;
        // Reset classes
        infoMessageDiv.className = 'mb-4 p-3 rounded-lg text-center'; // Base classes
        
        switch (type) {
            case 'success':
                infoMessageDiv.classList.add('bg-green-100', 'dark:bg-green-800', 'border', 'border-green-300', 'dark:border-green-600', 'text-green-700', 'dark:text-green-200');
                break;
            case 'warning':
                infoMessageDiv.classList.add('bg-yellow-100', 'dark:bg-yellow-800', 'border', 'border-yellow-300', 'dark:border-yellow-600', 'text-yellow-700', 'dark:text-yellow-200');
                break;
            case 'error':
                infoMessageDiv.classList.add('bg-red-100', 'dark:bg-red-800', 'border', 'border-red-300', 'dark:border-red-600', 'text-red-700', 'dark:text-red-200');
                break;
            default: // info
                infoMessageDiv.classList.add('bg-blue-100', 'dark:bg-blue-900', 'border', 'border-blue-300', 'dark:border-blue-700', 'text-blue-700', 'dark:text-blue-300');
        }
        infoMessageDiv.classList.remove('hidden');
        
        // Clear previous timeout if any
        if (infoMessageDiv.timeoutId) clearTimeout(infoMessageDiv.timeoutId);

        if (duration > 0) {
            infoMessageDiv.timeoutId = setTimeout(() => {
                infoMessageDiv.classList.add('hidden');
            }, duration);
        }
    }

    // --- Modal Management & Accessibility ---
    function openModal(modalElement, openerElement) {
        lastFocusedElement = openerElement || document.activeElement; // Store who opened the modal
        modalElement.classList.add('active');
        activeModal = modalElement;
        // Focus the first focusable element in the modal
        const focusableElements = modalElement.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (focusableElements.length > 0) {
            focusableElements[0].focus();
        }
        // Specific actions for certain modals
        if (modalElement === timePickerModal) {
            const now = new Date();
            let defaultTime = now.toTimeString().substring(0, 5);
            if (wakeTime) {
                const wakeDate = new Date(wakeTime);
                if (wakeDate.toDateString() === now.toDateString()) {
                    defaultTime = wakeDate.toTimeString().substring(0, 5);
                }
            }
            wakeTimeInput.value = defaultTime;
        } else if (modalElement === settingsModal) {
            renderTasksForSettings();
            updateNotificationStatusDisplay();
        }
    }

    function closeModal(modalElement) {
        modalElement.classList.remove('active');
        activeModal = null;
        if (lastFocusedElement) {
            lastFocusedElement.focus(); // Return focus to the element that opened the modal
            lastFocusedElement = null;
        }
    }

    function handleGlobalKeyDown(event) {
        if (event.key === 'Escape' && activeModal) {
            closeModal(activeModal);
        }
        // Basic focus trapping within active modal (can be more robust)
        if (event.key === 'Tab' && activeModal) {
            const focusableElements = Array.from(activeModal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')).filter(el => el.offsetParent !== null);
            if (focusableElements.length === 0) return;

            const firstElement = focusableElements[0];
            const lastElement = focusableElements[focusableElements.length - 1];

            if (event.shiftKey) { // Shift + Tab
                if (document.activeElement === firstElement) {
                    lastElement.focus();
                    event.preventDefault();
                }
            } else { // Tab
                if (document.activeElement === lastElement) {
                    firstElement.focus();
                    event.preventDefault();
                }
            }
        }
    }
    
    // --- Event Handlers & Core Logic ---
    // (Handlers for buttons, list interactions, time changes, etc.)

    function handleConfirmTimePick() {
        const timeValue = wakeTimeInput.value;
        if (!timeValue) {
            showInfoMessage('Please select a valid time.', 'warning', 3000);
            wakeTimeInput.focus();
            return;
        }
        const [hours, minutes] = timeValue.split(':').map(Number);
        const today = new Date();
        today.setHours(hours, minutes, 0, 0);
        
        const newWakeTime = today.getTime();

        if (wakeTime) {
            const oldWakeDate = new Date(wakeTime);
            if (oldWakeDate.toDateString() === today.toDateString() && Math.abs(newWakeTime - wakeTime) > 60000) {
                if (!confirm("You've already set a wake time for today. Changing it will reset today's task statuses. Continue?")) {
                    closeModal(timePickerModal);
                    return;
                }
                taskStatus = {}; // Reset status for the day
                localStorage.setItem(LOCAL_STORAGE_KEYS.taskStatusDate, today.toDateString());
            }
        }
        
        wakeTime = newWakeTime;
        saveWakeTime();
        updateControlsVisibility();
        closeModal(timePickerModal);
        
        const todayDateStr = new Date().toDateString();
        const lastStatusDate = localStorage.getItem(LOCAL_STORAGE_KEYS.taskStatusDate);
        if (lastStatusDate !== todayDateStr) {
            taskStatus = {};
            localStorage.setItem(LOCAL_STORAGE_KEYS.taskStatusDate, todayDateStr);
        }
        saveTaskStatus(); // Save potentially cleared or existing status

        renderChecklist();
        handlePastDueTasks(); // This will open modal if needed
        scheduleAllNotifications();
        showInfoMessage(`Day started at ${new Date(wakeTime).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}. Let's go!`, 'success');
    }

    function handleResetDay() {
        if (confirm('Are you sure you want to reset the day? This clears wake time and all task progress for today.')) {
            wakeTime = null;
            taskStatus = {};
            saveWakeTime();
            saveTaskStatus();
            localStorage.removeItem(LOCAL_STORAGE_KEYS.taskStatusDate);
            updateControlsVisibility();
            renderChecklist();
            clearAllScheduledNotifications();
            updateWakeTimeDisplay();
            showInfoMessage('Day has been reset. Set a new wake time when ready.', 'info');
        }
    }

    function checkAutoReset() {
        if (!wakeTime) return;
        const now = new Date();
        const wakeDate = new Date(wakeTime);
        
        if (now.toDateString() !== wakeDate.toDateString()) {
            const diffHours = (now.getTime() - wakeTime) / (1000 * 60 * 60);
            if (diffHours >= 20) { // Reset if more than 20 hours passed (catches overnight scenarios)
                console.log("Auto-resetting day: Wake time is from a previous day or significantly old.");
                showInfoMessage("Auto-reset: Previous day's schedule cleared. Set a new wake time.", "info", 7000);
                handleResetDayInternal();
            }
        }
    }
    
    function handleResetDayInternal() { // No confirmation reset
        wakeTime = null;
        taskStatus = {};
        saveWakeTime();
        saveTaskStatus();
        localStorage.removeItem(LOCAL_STORAGE_KEYS.taskStatusDate);
        updateControlsVisibility();
        renderChecklist();
        clearAllScheduledNotifications();
        updateWakeTimeDisplay();
    }

    function handlePastDueTasks() {
        if (!wakeTime) return;
        const now = Date.now();
        const pastDueUncheckedTasks = tasks.filter(task => {
            const taskAbsoluteTime = wakeTime + task.offset * 60000;
            return taskAbsoluteTime < now && !taskStatus[task.id];
        });

        if (pastDueUncheckedTasks.length > 0) {
            pastDueTaskListUL.innerHTML = ''; // Clear previous
            pastDueUncheckedTasks.sort((a,b) => a.offset - b.offset).forEach(task => {
                const li = document.createElement('li');
                li.className = 'flex items-center justify-between p-2.5 bg-gray-100 dark:bg-gray-600 rounded-md shadow-sm';
                const taskTime = new Date(wakeTime + task.offset * 60000);
                const formattedTime = taskTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                li.innerHTML = `
                    <label for="pastdue-cb-${task.id}" class="flex-grow text-gray-700 dark:text-gray-300 cursor-pointer">
                        <input type="checkbox" id="pastdue-cb-${task.id}" data-task-id="${task.id}" class="mr-2 h-4 w-4 text-red-600 border-gray-300 rounded focus:ring-red-500 dark:focus:ring-red-400 dark:checked:bg-red-500">
                        ${task.label} (Due: ${formattedTime})
                    </label>
                `;
                pastDueTaskListUL.appendChild(li);
            });
            openModal(pastDueModal, null); // Open without specific opener, focus will go to first element
        }
    }
    
    function handleCheckAllPastDue() {
        const checkboxes = pastDueTaskListUL.querySelectorAll('input[type="checkbox"]');
        checkboxes.forEach(checkbox => {
            checkbox.checked = true;
            const taskId = checkbox.dataset.taskId;
            if (taskId) taskStatus[taskId] = true;
        });
        saveTaskStatus();
        renderChecklist();
        scheduleAllNotifications(); // Reschedule, considering these are now done
        closeModal(pastDueModal);
        showInfoMessage('Marked all past due tasks as done.', 'success');
    }

    function handleClosePastDueModal() {
        // Status is already updated by individual checkboxes via handlePastDueItemChange
        saveTaskStatus(); // Ensure any last-minute changes are saved
        renderChecklist();
        scheduleAllNotifications();
        closeModal(pastDueModal);
    }

    function handlePastDueItemChange(event) {
        const checkbox = event.target.closest('input[type="checkbox"]');
        if (checkbox && checkbox.dataset.taskId) {
            const taskId = checkbox.dataset.taskId;
            taskStatus[taskId] = checkbox.checked;
            // Immediate save can be done here, or on modal close.
            // saveTaskStatus(); // Optional: save on each check
            // renderChecklist(); // Optional: re-render main list immediately
        }
    }
    
    // --- Settings Modal Logic ---
    function renderTasksForSettings() {
        tasksSettingsListUL.innerHTML = '';
        if (tasks.length === 0) {
            tasksSettingsListUL.innerHTML = `<p class="text-gray-500 dark:text-gray-400 text-sm p-2">No tasks configured. Click "Add New Task" below.</p>`;
        }
        tasks.forEach((task) => {
            const li = document.createElement('li');
            // Store task.id on the li element for easier access during save/delete
            li.dataset.taskId = task.id; 
            li.className = 'flex flex-col sm:flex-row items-center sm:space-x-2 space-y-2 sm:space-y-0 p-3 border border-gray-200 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 shadow-sm';
            li.innerHTML = `
                <input type="text" value="${task.label}" placeholder="Task Label (e.g., Morning Vitamins)" data-field="label" class="flex-grow p-2 border border-gray-300 dark:border-gray-500 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 w-full" aria-label="Task label">
                <input type="number" value="${task.offset}" placeholder="Offset (min)" data-field="offset" class="w-full sm:w-32 p-2 border border-gray-300 dark:border-gray-500 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" aria-label="Task offset in minutes from wake up" min="0">
                <button data-action="remove" class="remove-task-btn bg-red-500 hover:bg-red-600 text-white font-semibold py-2 px-3 rounded-md text-xs w-full sm:w-auto" aria-label="Remove this task">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 inline-block" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd" /></svg>
                </Remove>
            `;
            tasksSettingsListUL.appendChild(li);
        });
    }

    function handleAddNewTaskSetting() {
        const newId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        // Add to the tasks array in memory first, then re-render settings
        tasks.push({ id: newId, label: '', offset: 0 });
        renderTasksForSettings();
        // Focus the new task's label input
        const newInputs = tasksSettingsListUL.querySelector(`li[data-task-id="${newId}"] input[data-field="label"]`);
        if (newInputs) newInputs.focus();
    }

    function handleSettingsListClick(event) {
        const button = event.target.closest('button[data-action="remove"]');
        if (button) {
            const li = button.closest('li[data-task-id]');
            const taskIdToRemove = li.dataset.taskId;
            // Remove from the in-memory tasks array
            tasks = tasks.filter(task => task.id !== taskIdToRemove);
            // Re-render the settings list
            renderTasksForSettings();
        }
        // Input changes are handled by handleSaveSettings by reading all values
    }

    function handleSaveSettings() {
        const updatedTasks = [];
        const taskSettingItems = tasksSettingsListUL.querySelectorAll('li[data-task-id]');
        
        taskSettingItems.forEach(item => {
            const id = item.dataset.taskId;
            const labelInput = item.querySelector('input[data-field="label"]');
            const offsetInput = item.querySelector('input[data-field="offset"]');

            const label = labelInput.value.trim();
            const offset = parseInt(offsetInput.value, 10);

            if (label === "") {
                showInfoMessage(`Task with ID ${id} was not saved because its label was empty.`, 'warning', 4000);
                return; // Skip tasks with empty labels
            }
            if (isNaN(offset) || offset < 0) {
                 showInfoMessage(`Task "${label}" has an invalid offset. Please use a non-negative number. Not saved.`, 'warning', 4000);
                 return; // Skip tasks with invalid offsets
            }

            updatedTasks.push({ id, label, offset });
        });

        tasks = updatedTasks; // Replace current tasks
        saveTasksToStorage();
        closeModal(settingsModal);
        renderChecklist(); 
        if (wakeTime) {
            clearAllScheduledNotifications(); // Clear old ones
            scheduleAllNotifications();     // Schedule with new task set
        }
        showInfoMessage('Settings saved successfully!', 'success');
    }
    
    // --- Checklist Item Click Handler (Event Delegation) ---
    function handleChecklistClick(event) {
        const taskItem = event.target.closest('.task-item');
        if (!taskItem) return;

        const taskId = taskItem.dataset.taskId;
        const checkbox = taskItem.querySelector('input[type="checkbox"]');
        
        // If click is not directly on checkbox, toggle its state and then the status
        if (event.target !== checkbox) {
            checkbox.checked = !checkbox.checked;
        }
        taskStatus[taskId] = checkbox.checked;

        saveTaskStatus();
        renderChecklist(); // Re-render to update styles

        if (taskStatus[taskId]) { // Task marked done
            clearSpecificNotification(taskId);
        } else { // Task marked undone
            const task = tasks.find(t => t.id === taskId);
            if (task) scheduleNotification(task);
        }
    }

    // --- Start the app ---
    init();
});
