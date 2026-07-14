/* NAZAR Premium Accessibility App - Direct Frontend Web App Javascript */

document.addEventListener('DOMContentLoaded', () => {
    // State management
    const state = {
        currentTab: 'home',
        assistantActive: false,
        darkModeEnabled: false
    };

    // Camera video stream variable
    let cameraStream = null;

    // DOM Elements
    const body = document.body;
    const navItems = document.querySelectorAll('.nav-item');
    const screenPanels = document.querySelectorAll('.screen-panel');
    
    // Home elements
    const startAssistantBtn = document.getElementById('start-assistant-btn');
    const assistantOrb = document.getElementById('assistant-orb');
    const assistantGlow = document.getElementById('assistant-glow');
    const assistantText = document.getElementById('assistant-text');
    const actionScan = document.getElementById('action-scan');
    const actionSos = document.getElementById('action-sos');
    const actionActivity = document.getElementById('action-activity');

    // Camera elements
    const micBtn = document.getElementById('mic-btn');
    const scanStatusText = document.getElementById('scan-status-text');

    // Settings elements
    const toggleDarkMode = document.getElementById('toggle-dark-mode');

    // Overlays
    const sosModal = document.getElementById('sos-modal');
    const cancelSosBtn = document.getElementById('cancel-sos');
    const confirmSosBtn = document.getElementById('confirm-sos');
    const drawerOverlay = document.getElementById('drawer-overlay');
    const drawerContent = document.getElementById('drawer-content');
    const drawerCloseBtn = document.getElementById('drawer-close');
    const notificationBtn = document.getElementById('notification-btn');

    // --- MediaDevices Live Camera Streaming ---
    async function startCamera() {
        const video = document.getElementById('camera-stream');
        const fallback = document.getElementById('camera-fallback-img');
        if (!video) return;

        try {
            // Request facingMode: environment for mobile back cameras
            cameraStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment' }
            });
            video.srcObject = cameraStream;
            video.style.display = 'block';
            if (fallback) fallback.style.display = 'none';
        } catch (err) {
            console.warn("Camera stream denied or unavailable. Fallback to mock background.", err);
            video.style.display = 'none';
            if (fallback) fallback.style.display = 'block';
        }
    }

    function stopCamera() {
        const video = document.getElementById('camera-stream');
        const fallback = document.getElementById('camera-fallback-img');
        if (cameraStream) {
            cameraStream.getTracks().forEach(track => track.stop());
            cameraStream = null;
        }
        if (video) {
            video.srcObject = null;
            video.style.display = 'none';
        }
        if (fallback) fallback.style.display = 'block';
    }

    // --- Tab Switcher Navigation ---
    function switchTab(tabId) {
        state.currentTab = tabId;
        
        // Handle camera stream toggling depending on active tab
        if (tabId === 'camera') {
            startCamera();
        } else {
            stopCamera();
        }
        
        // Navigation button highlights
        navItems.forEach(item => {
            if (item.getAttribute('data-target') === tabId) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });

        // View swaps
        screenPanels.forEach(panel => {
            if (panel.id === `${tabId}-panel`) {
                panel.classList.add('active-panel');
            } else {
                panel.classList.remove('active-panel');
            }
        });
    }

    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const target = item.getAttribute('data-target');
            switchTab(target);
        });
    });

    // --- Dark Mode State Sync ---
    function setDarkMode(enabled) {
        state.darkModeEnabled = enabled;
        if (enabled) {
            body.classList.add('dark-mode');
        } else {
            body.classList.remove('dark-mode');
        }
        
        // Persist theme selection
        localStorage.setItem('nazar-dark-mode', enabled ? 'true' : 'false');
        if (toggleDarkMode) toggleDarkMode.checked = enabled;
    }

    // Initialize theme from cache
    const cachedTheme = localStorage.getItem('nazar-dark-mode');
    if (cachedTheme === 'true') {
        setDarkMode(true);
    }

    if (toggleDarkMode) {
        toggleDarkMode.addEventListener('change', (e) => {
            setDarkMode(e.target.checked);
        });
    }

    // --- AI Assistant Hero Toggle ---
    if (startAssistantBtn) {
        startAssistantBtn.addEventListener('click', () => {
            state.assistantActive = !state.assistantActive;
            
            if (state.assistantActive) {
                // Activate visual highlights
                startAssistantBtn.innerHTML = `
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                    </svg> Stop Assistant
                `;
                startAssistantBtn.style.backgroundColor = 'var(--danger)';
                startAssistantBtn.style.boxShadow = '0 8px 24px rgba(239, 68, 68, 0.25)';
                
                // Accelerate Orb animation speed
                if (assistantOrb) assistantOrb.style.animation = 'orbFloat 2.5s infinite ease-in-out, orbPulse 1.2s infinite ease-in-out';
                if (assistantGlow) assistantGlow.style.background = 'radial-gradient(circle, rgba(59, 130, 246, 0.75) 0%, rgba(37, 99, 235, 0.25) 50%, rgba(37, 99, 235, 0) 70%)';
                
                assistantText.innerText = "Monitoring surrounding path actively...";
            } else {
                // Restore standard layouts
                startAssistantBtn.innerHTML = `
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg> Start Assistant
                `;
                startAssistantBtn.style.backgroundColor = 'var(--primary)';
                startAssistantBtn.style.boxShadow = 'var(--shadow-glow)';
                
                if (assistantOrb) assistantOrb.style.animation = 'orbFloat 5s infinite ease-in-out';
                if (assistantGlow) assistantGlow.style.background = 'radial-gradient(circle, rgba(59, 130, 246, 0.4) 0%, rgba(37, 99, 235, 0.1) 50%, rgba(37, 99, 235, 0) 70%)';
                
                assistantText.innerText = "Ready whenever you need assistance.";
            }
        });
    }

    // --- Quick Action Triggers ---
    if (actionScan) {
        actionScan.addEventListener('click', () => {
            switchTab('camera');
        });
    }

    if (actionSos) {
        actionSos.addEventListener('click', () => {
            sosModal.classList.add('modal-active');
        });
    }

    if (actionActivity) {
        actionActivity.addEventListener('click', () => {
            drawerOverlay.classList.add('drawer-active');
            drawerContent.style.transform = 'translateY(0)';
        });
    }

    // Camera Mic Toggle
    if (micBtn) {
        micBtn.addEventListener('click', () => {
            micBtn.classList.toggle('active');
            if (micBtn.classList.contains('active')) {
                micBtn.style.backgroundColor = 'var(--danger)';
                scanStatusText.innerText = "Listening...";
            } else {
                micBtn.style.backgroundColor = 'var(--primary)';
                scanStatusText.innerText = "Scanning surroundings...";
            }
        });
    }

    // --- SOS Dialog Handlers ---
    if (cancelSosBtn) {
        cancelSosBtn.addEventListener('click', () => {
            sosModal.classList.remove('modal-active');
        });
    }

    if (confirmSosBtn) {
        confirmSosBtn.addEventListener('click', () => {
            confirmSosBtn.innerText = "SOS Dispatched!";
            confirmSosBtn.style.backgroundColor = 'var(--success)';
            setTimeout(() => {
                sosModal.classList.remove('modal-active');
                confirmSosBtn.innerText = "Trigger SOS (5)";
                confirmSosBtn.style.backgroundColor = 'var(--danger)';
            }, 1500);
        });
    }

    // --- Drawer Close Handlers ---
    function closeActivityDrawer() {
        drawerOverlay.classList.remove('drawer-active');
        drawerContent.style.transform = 'translateY(100%)';
    }

    if (drawerCloseBtn) drawerCloseBtn.addEventListener('click', closeActivityDrawer);
    if (drawerOverlay) drawerOverlay.addEventListener('click', closeActivityDrawer);
    if (notificationBtn) {
        notificationBtn.addEventListener('click', () => {
            drawerOverlay.classList.add('drawer-active');
            drawerContent.style.transform = 'translateY(0)';
        });
    }
});
