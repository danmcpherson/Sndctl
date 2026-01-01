/**
 * Mobile App Module for Sonos Sound Hub
 * Optimized for iOS home screen app experience
 */
window.mobileApp = {
    currentTab: 'macros-tab',
    currentView: 'list',
    macros: [],
    speakers: [],
    speakerStates: {},
    updateInterval: null,
    isUpdating: false,
    batteryWarningDismissed: false,
    batteryWarningDismissedUntil: null,
    installPromptDismissed: false,

    /**
     * Initialize the mobile app
     */
    async init() {
        console.log('Initializing Sonos Sound Hub Mobile App');
        
        // Load saved preferences
        this.loadPreferences();
        
        // Check if should show install prompt
        this.checkInstallPrompt();
        
        // Load version info
        this.loadVersion();
        
        // Ensure server is running
        await this.ensureServerRunning();
        
        // Load initial data
        await Promise.all([
            this.loadMacros(),
            this.loadSpeakers()
        ]);
        
        // Start polling for speaker updates
        this.startPolling();
    },

    /**
     * Load saved user preferences from localStorage
     */
    loadPreferences() {
        try {
            const savedView = localStorage.getItem('sonos-hub-view');
            if (savedView === 'list' || savedView === 'tile') {
                this.currentView = savedView;
                this.applyViewPreference();
            }
            
            const installDismissed = localStorage.getItem('sonos-hub-install-dismissed');
            if (installDismissed) {
                this.installPromptDismissed = true;
            }
        } catch (e) {
            console.debug('Could not load preferences:', e);
        }
    },

    /**
     * Apply the current view preference to the UI
     */
    applyViewPreference() {
        const macrosList = document.getElementById('macros-list');
        const listBtn = document.querySelector('.view-toggle-btn[data-view="list"]');
        const tileBtn = document.querySelector('.view-toggle-btn[data-view="tile"]');
        
        if (macrosList) {
            macrosList.classList.toggle('tile-view', this.currentView === 'tile');
        }
        if (listBtn && tileBtn) {
            listBtn.classList.toggle('active', this.currentView === 'list');
            tileBtn.classList.toggle('active', this.currentView === 'tile');
        }
    },

    /**
     * Set the macros view (list or tile)
     * @param {string} view - 'list' or 'tile'
     */
    setView(view) {
        this.currentView = view;
        this.applyViewPreference();
        
        try {
            localStorage.setItem('sonos-hub-view', view);
        } catch (e) {
            console.debug('Could not save view preference:', e);
        }
    },

    /**
     * Check if we should show the install prompt
     */
    checkInstallPrompt() {
        // Don't show if already dismissed
        if (this.installPromptDismissed) return;
        
        // Don't show if already running as standalone app
        if (window.navigator.standalone === true) return;
        if (window.matchMedia('(display-mode: standalone)').matches) return;
        
        // Only show on iOS Safari
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
        const isSafari = /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent);
        
        if (isIOS && isSafari) {
            const prompt = document.getElementById('install-prompt');
            if (prompt) {
                prompt.classList.remove('hidden');
            }
        }
    },

    /**
     * Dismiss the install prompt
     */
    dismissInstallPrompt() {
        const prompt = document.getElementById('install-prompt');
        if (prompt) {
            prompt.classList.add('hidden');
        }
        this.installPromptDismissed = true;
        try {
            localStorage.setItem('sonos-hub-install-dismissed', 'true');
        } catch (e) {
            console.debug('Could not save install prompt state:', e);
        }
    },

    /**
     * Ensures the soco-cli server is running
     */
    async ensureServerRunning() {
        const statusIndicator = document.getElementById('status-indicator');
        try {
            const status = await api.getServerStatus();
            if (!status.isRunning) {
                await api.startServer();
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
            statusIndicator.classList.remove('error');
            statusIndicator.classList.add('connected');
        } catch (error) {
            console.error('Failed to start server:', error);
            statusIndicator.classList.remove('connected');
            statusIndicator.classList.add('error');
            this.showToast('Failed to connect to server', 'error');
        }
    },

    /**
     * Load and display the app version
     */
    async loadVersion() {
        try {
            const response = await fetch('/api/version');
            if (response.ok) {
                const data = await response.json();
                const versionEl = document.getElementById('app-version');
                if (versionEl && data.version) {
                    versionEl.textContent = `v${data.version}`;
                }
            }
        } catch (error) {
            console.debug('Could not load version:', error);
        }
    },

    /**
     * Switch between tabs
     * @param {string} tabId - The ID of the tab to switch to
     */
    switchTab(tabId) {
        // Update tab buttons
        document.querySelectorAll('.tab-button').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabId);
        });
        
        // Update tab content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.toggle('active', content.id === tabId);
        });
        
        this.currentTab = tabId;
        
        // Refresh data when switching tabs
        if (tabId === 'speakers-tab') {
            this.updateAllSpeakers();
        }
    },

    /**
     * Load all macros
     */
    async loadMacros() {
        const container = document.getElementById('macros-list');
        try {
            this.macros = await api.getMacros();
            this.renderMacros();
        } catch (error) {
            console.error('Failed to load macros:', error);
            container.innerHTML = `
                <div class="empty-state">
                    <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="12" y1="8" x2="12" y2="12"></line>
                        <line x1="12" y1="16" x2="12.01" y2="16"></line>
                    </svg>
                    <p class="empty-state-title">Failed to load macros</p>
                    <p class="empty-state-text">${error.message}</p>
                </div>
            `;
        }
    },

    /**
     * Render the macros list
     */
    renderMacros() {
        const container = document.getElementById('macros-list');
        
        if (this.macros.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polygon points="5 3 19 12 5 21 5 3"></polygon>
                    </svg>
                    <p class="empty-state-title">No macros found</p>
                    <p class="empty-state-text">Create macros in the main interface</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = this.macros.map(macro => `
            <div class="macro-item" data-macro="${this.escapeHtml(macro.name)}" onclick="mobileApp.runMacro('${this.escapeJs(macro.name)}')">
                <div class="macro-info">
                    <div class="macro-name">${this.escapeHtml(macro.name.replace(/_/g, ' '))}</div>
                    ${macro.description ? `<div class="macro-description">${this.escapeHtml(macro.description)}</div>` : ''}
                </div>
                <div class="macro-run-btn">
                    <svg class="play-icon" viewBox="0 0 24 24" fill="currentColor">
                        <polygon points="5 3 19 12 5 21 5 3"></polygon>
                    </svg>
                </div>
            </div>
        `).join('');
        
        // Apply view preference after rendering
        this.applyViewPreference();
    },

    /**
     * Run a macro
     * @param {string} name - The macro name
     */
    async runMacro(name) {
        const item = document.querySelector(`.macro-item[data-macro="${CSS.escape(name)}"]`);
        const btn = item?.querySelector('.macro-run-btn');
        
        if (item) {
            item.classList.add('running');
        }
        if (btn) {
            btn.innerHTML = `
                <svg class="spinner-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10" stroke-dasharray="32" stroke-dashoffset="10"></circle>
                </svg>
            `;
        }
        
        try {
            await api.executeMacro(name);
            this.showToast(`${name} executed`, 'success');
        } catch (error) {
            console.error('Failed to run macro:', error);
            this.showToast(`Failed: ${error.message}`, 'error');
        } finally {
            if (item) {
                item.classList.remove('running');
            }
            if (btn) {
                btn.innerHTML = `
                    <svg class="play-icon" viewBox="0 0 24 24" fill="currentColor">
                        <polygon points="5 3 19 12 5 21 5 3"></polygon>
                    </svg>
                `;
            }
        }
    },

    /**
     * Load all speakers
     */
    async loadSpeakers() {
        const container = document.getElementById('speakers-list');
        try {
            this.speakers = await api.getSpeakers();
            await this.updateAllSpeakers();
        } catch (error) {
            console.error('Failed to load speakers:', error);
            container.innerHTML = `
                <div class="empty-state">
                    <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="12" y1="8" x2="12" y2="12"></line>
                        <line x1="12" y1="16" x2="12.01" y2="16"></line>
                    </svg>
                    <p class="empty-state-title">Failed to load speakers</p>
                    <p class="empty-state-text">${error.message}</p>
                </div>
            `;
        }
    },

    /**
     * Update all speaker states
     */
    async updateAllSpeakers() {
        if (this.isUpdating || this.speakers.length === 0) return;
        this.isUpdating = true;
        
        try {
            const statePromises = this.speakers.map(async (speaker) => {
                try {
                    // getSpeakerInfo already includes volume
                    const info = await api.getSpeakerInfo(speaker).catch(() => null);
                    const volume = info?.volume ?? 0;
                    return { speaker, info, volume };
                } catch (error) {
                    console.error(`Failed to get info for ${speaker}:`, error);
                    return { speaker, info: null, volume: 0 };
                }
            });
            
            const states = await Promise.all(statePromises);
            states.forEach(({ speaker, info, volume }) => {
                this.speakerStates[speaker] = { info, volume };
            });
            
            this.renderSpeakers();
            this.checkBatteryWarnings();
        } catch (error) {
            console.error('Failed to update speakers:', error);
        } finally {
            this.isUpdating = false;
        }
    },

    /**
     * Render the speakers list
     */
    renderSpeakers() {
        const container = document.getElementById('speakers-list');
        
        if (this.speakers.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="4" y="2" width="16" height="20" rx="2" ry="2"></rect>
                        <circle cx="12" cy="14" r="4"></circle>
                        <line x1="12" y1="6" x2="12.01" y2="6"></line>
                    </svg>
                    <p class="empty-state-title">No speakers found</p>
                    <p class="empty-state-text">Make sure your Sonos speakers are online</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = this.speakers.map(speaker => {
            const state = this.speakerStates[speaker] || {};
            const info = state.info || {};
            const volume = info.volume ?? state.volume ?? 0;
            const isPlaying = info.playbackState === 'PLAYING';
            const trackTitle = info.currentTrack || 'No track';
            const groupInfo = info.groupName && info.groupName !== speaker 
                ? info.groupName 
                : null;
            
            return `
                <div class="speaker-card" data-speaker="${this.escapeHtml(speaker)}">
                    <div class="speaker-header">
                        <span class="speaker-name">
                            ${this.escapeHtml(speaker)}
                            ${groupInfo ? `<span class="group-badge"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>${this.escapeHtml(groupInfo)}</span>` : ''}
                        </span>
                        <span class="speaker-status ${isPlaying ? 'playing' : ''}">
                            ${isPlaying ? '● Playing' : '○ Stopped'}
                        </span>
                    </div>
                    
                    <div class="speaker-track-info">
                        <div class="track-title">${this.escapeHtml(trackTitle)}</div>
                    </div>
                    
                    <div class="speaker-controls">
                        <button class="control-btn" onclick="mobileApp.previousTrack('${this.escapeJs(speaker)}')" title="Previous">
                            <svg viewBox="0 0 24 24" fill="currentColor">
                                <polygon points="19 20 9 12 19 4 19 20"></polygon>
                                <line x1="5" y1="19" x2="5" y2="5" stroke="currentColor" stroke-width="2"></line>
                            </svg>
                        </button>
                        <button class="control-btn play-pause ${isPlaying ? 'playing' : ''}" 
                                onclick="mobileApp.togglePlayPause('${this.escapeJs(speaker)}')" 
                                aria-label="${isPlaying ? 'Pause' : 'Play'}">
                            ${isPlaying ? `
                                <svg class="pause-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                    <rect x="6" y="4" width="4" height="16" fill="currentColor"/>
                                    <rect x="14" y="4" width="4" height="16" fill="currentColor"/>
                                </svg>
                            ` : `
                                <svg class="play-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                    <polygon points="5 3 19 12 5 21 5 3" fill="currentColor"/>
                                </svg>
                            `}
                        </button>
                        <button class="control-btn" onclick="mobileApp.nextTrack('${this.escapeJs(speaker)}')" title="Next">
                            <svg viewBox="0 0 24 24" fill="currentColor">
                                <polygon points="5 4 15 12 5 20 5 4"></polygon>
                                <line x1="19" y1="5" x2="19" y2="19" stroke="currentColor" stroke-width="2"></line>
                            </svg>
                        </button>
                    </div>
                    
                    <div class="volume-control">
                        <svg class="volume-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                            <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                        </svg>
                        <input type="range" 
                               class="volume-slider" 
                               min="0" 
                               max="100" 
                               value="${volume}"
                               oninput="mobileApp.updateVolumeLabel('${this.escapeJs(speaker)}', this.value)"
                               onchange="mobileApp.setVolume('${this.escapeJs(speaker)}', this.value)">
                        <span class="volume-value" id="volume-${this.escapeHtml(speaker)}">${volume}%</span>
                    </div>
                </div>
            `;
        }).join('');
    },

    /**
     * Toggle play/pause for a speaker
     * @param {string} speaker - The speaker name
     */
    async togglePlayPause(speaker) {
        try {
            await api.playPause(speaker);
            // Quick update of just this speaker
            setTimeout(() => this.updateSpeakerState(speaker), 500);
        } catch (error) {
            console.error('Failed to toggle playback:', error);
            this.showToast('Playback failed', 'error');
        }
    },

    /**
     * Skip to next track
     * @param {string} speaker - The speaker name
     */
    async nextTrack(speaker) {
        try {
            await api.next(speaker);
            setTimeout(() => this.updateSpeakerState(speaker), 500);
        } catch (error) {
            console.error('Failed to skip track:', error);
            this.showToast('Skip failed', 'error');
        }
    },

    /**
     * Skip to previous track
     * @param {string} speaker - The speaker name
     */
    async previousTrack(speaker) {
        try {
            await api.previous(speaker);
            setTimeout(() => this.updateSpeakerState(speaker), 500);
        } catch (error) {
            console.error('Failed to go back:', error);
            this.showToast('Previous failed', 'error');
        }
    },

    /**
     * Update volume label during drag
     * @param {string} speaker - The speaker name
     * @param {number} value - The volume value
     */
    updateVolumeLabel(speaker, value) {
        const label = document.getElementById(`volume-${speaker}`);
        if (label) {
            label.textContent = `${value}%`;
        }
    },

    /**
     * Set volume for a speaker
     * @param {string} speaker - The speaker name
     * @param {number} volume - The volume level (0-100)
     */
    async setVolume(speaker, volume) {
        try {
            await api.setVolume(speaker, parseInt(volume, 10));
        } catch (error) {
            console.error('Failed to set volume:', error);
            this.showToast('Volume change failed', 'error');
        }
    },

    /**
     * Update a single speaker's state
     * @param {string} speaker - The speaker name
     */
    async updateSpeakerState(speaker) {
        try {
            // getSpeakerInfo already includes volume
            const info = await api.getSpeakerInfo(speaker).catch(() => null);
            const volume = info?.volume ?? 0;
            
            this.speakerStates[speaker] = { info, volume };
            this.renderSpeakers();
        } catch (error) {
            console.error(`Failed to update ${speaker}:`, error);
        }
    },

    /**
     * Start polling for speaker updates
     */
    startPolling() {
        // Update every 10 seconds when on speakers tab
        this.updateInterval = setInterval(() => {
            if (this.currentTab === 'speakers-tab' && !document.hidden) {
                this.updateAllSpeakers();
            }
        }, 10000);
        
        // Pause polling when page is hidden
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && this.currentTab === 'speakers-tab') {
                this.updateAllSpeakers();
            }
        });
    },

    /**
     * Show a toast notification
     * @param {string} message - The message to show
     * @param {string} type - The type: 'success' or 'error'
     */
    showToast(message, type = 'success') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast-mobile ${type}`;
        
        const icon = type === 'success' 
            ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>'
            : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>';
        
        toast.innerHTML = `${icon}<span>${this.escapeHtml(message)}</span>`;
        container.appendChild(toast);
        
        // Auto-remove after 2.5 seconds
        setTimeout(() => {
            toast.style.animation = 'fadeOut 0.3s ease forwards';
            setTimeout(() => toast.remove(), 300);
        }, 2500);
    },

    /**
     * Escape HTML to prevent XSS
     * @param {string} text - The text to escape
     * @returns {string} Escaped text
     */
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    /**
     * Escape text for use in JavaScript strings
     * @param {string} text - The text to escape
     * @returns {string} Escaped text
     */
    escapeJs(text) {
        if (!text) return '';
        return text.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"');
    },

    /**
     * Check battery levels and show warnings if needed
     */
    checkBatteryWarnings() {
        // If user dismissed warning, check if 5 minutes have passed
        if (this.batteryWarningDismissedUntil && Date.now() < this.batteryWarningDismissedUntil) {
            return;
        }
        this.batteryWarningDismissed = false;
        this.batteryWarningDismissedUntil = null;

        const warningBanner = document.getElementById('battery-warning');
        const warningText = document.getElementById('battery-warning-text');
        
        if (!warningBanner || !warningText) return;

        // Collect all speakers with low battery
        const lowBatterySpeakers = [];
        const criticalBatterySpeakers = [];

        for (const [speaker, state] of Object.entries(this.speakerStates)) {
            const batteryLevel = state.info?.batteryLevel;
            if (batteryLevel !== null && batteryLevel !== undefined) {
                if (batteryLevel < 5) {
                    criticalBatterySpeakers.push({ name: speaker, level: batteryLevel });
                } else if (batteryLevel < 20) {
                    lowBatterySpeakers.push({ name: speaker, level: batteryLevel });
                }
            }
        }

        // Show critical warnings first, then low battery warnings
        if (criticalBatterySpeakers.length > 0) {
            const speakerList = criticalBatterySpeakers
                .map(s => `${s.name} (${s.level}%)`)
                .join(', ');
            warningText.textContent = `Critical battery: ${speakerList}`;
            warningBanner.classList.remove('hidden');
            warningBanner.classList.add('critical');
        } else if (lowBatterySpeakers.length > 0) {
            const speakerList = lowBatterySpeakers
                .map(s => `${s.name} (${s.level}%)`)
                .join(', ');
            warningText.textContent = `Low battery: ${speakerList}`;
            warningBanner.classList.remove('hidden', 'critical');
        } else {
            warningBanner.classList.add('hidden');
            warningBanner.classList.remove('critical');
        }
    },

    /**
     * Dismiss the battery warning for 5 minutes
     */
    dismissBatteryWarning() {
        const warningBanner = document.getElementById('battery-warning');
        if (warningBanner) {
            warningBanner.classList.add('hidden');
        }
        this.batteryWarningDismissed = true;
        // Dismiss for 5 minutes
        this.batteryWarningDismissedUntil = Date.now() + (5 * 60 * 1000);
    }
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    mobileApp.init();
});
