/**
 * Mobile App Module for Sonos Sound Hub
 * Optimized for iOS home screen app experience
 */
window.mobileApp = {
    currentTab: 'macros-tab',
    currentView: 'tile',
    macros: [],
    speakers: [],
    speakerStates: {},
    speakerGroups: {},  // Maps speaker names to their group info
    expandedVolumePanels: new Set(),  // Tracks which speaker panels have individual volumes expanded
    updateInterval: null,
    versionCheckInterval: null,
    currentVersion: null,
    isUpdating: false,
    isPollingPaused: false,
    pollPauseTimeout: null,
    batteryWarningDismissed: false,
    batteryWarningDismissedUntil: null,
    installPromptDismissed: false,

    /**
     * Initialize the mobile app
     */
    async init() {
        console.log('Initializing Sonos Sound Hub Mobile App');
        
        // Fix iOS scroll freeze at boundaries
        this.setupIOSScrollFix();
        
        // Load saved preferences
        this.loadPreferences();
        
        // Check if should show install prompt
        this.checkInstallPrompt();
        
        // Load version info
        await this.loadVersion();
        this.startVersionWatcher();
        
        // Ensure server is running
        await this.ensureServerRunning();
        
        // Load initial data
        await Promise.all([
            this.loadMacros(),
            this.loadSpeakers()
        ]);
        
        // Initialize voice assistant if available
        if (typeof voiceAssistant !== 'undefined') {
            voiceAssistant.init();
        }
        
        // Start polling for speaker updates
        this.startPolling();
    },

    /**
     * Fix iOS scroll freeze when overscrolling at boundaries
     * iOS locks scrolling during rubber-band bounce animation
     */
    setupIOSScrollFix() {
        const scrollContainer = document.querySelector('.app-content');
        if (!scrollContainer) return;

        let lastY = 0;

        scrollContainer.addEventListener('touchstart', (e) => {
            lastY = e.touches[0].clientY;
        }, { passive: true });

        scrollContainer.addEventListener('touchmove', (e) => {
            const currentY = e.touches[0].clientY;
            const scrollTop = scrollContainer.scrollTop;
            const scrollHeight = scrollContainer.scrollHeight;
            const clientHeight = scrollContainer.clientHeight;
            const isAtTop = scrollTop <= 0;
            const isAtBottom = scrollTop + clientHeight >= scrollHeight;
            const isScrollingUp = currentY > lastY;
            const isScrollingDown = currentY < lastY;

            // Prevent overscroll at boundaries to avoid iOS freeze
            if ((isAtTop && isScrollingUp) || (isAtBottom && isScrollingDown)) {
                e.preventDefault();
            }

            lastY = currentY;
        }, { passive: false });
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
            const version = await this.fetchVersion();
            if (version) {
                this.currentVersion = this.currentVersion || version;
                const versionEl = document.getElementById('app-version');
                if (versionEl) {
                    versionEl.textContent = `v${version}`;
                }
            }
        } catch (error) {
            console.debug('Could not load version:', error);
        }
    },

    async fetchVersion() {
        const response = await fetch('/api/version', { cache: 'no-store' });
        if (!response.ok) return null;
        const data = await response.json();
        return data.version || null;
    },

    startVersionWatcher() {
        if (this.versionCheckInterval) {
            clearInterval(this.versionCheckInterval);
        }
        this.versionCheckInterval = setInterval(() => this.checkForUpdate(), 60000);
    },

    async checkForUpdate() {
        try {
            const latest = await this.fetchVersion();
            if (!latest || !this.currentVersion) return;
            if (latest !== this.currentVersion) {
                this.showToast('Update available, reloading…', 'success');
                setTimeout(() => window.location.reload(), 800);
            }
        } catch (error) {
            console.debug('Version check failed:', error);
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
    /**
     * Updates all speakers sequentially to avoid overwhelming the soco-cli API
     * (matches desktop behavior - soco-cli doesn't handle concurrent requests well)
     */
    async updateAllSpeakers() {
        if (this.isUpdating) return;
        
        // If no speakers yet, try to discover them (polling will retry every 5 sec)
        if (this.speakers.length === 0) {
            try {
                this.speakers = await api.getSpeakers();
                if (this.speakers.length === 0) {
                    // Still no speakers - show loading state, polling will retry
                    this.renderSpeakersLoading();
                    return;
                }
            } catch (error) {
                console.error('Failed to discover speakers:', error);
                this.renderSpeakersLoading();
                return;
            }
        }
        
        this.isUpdating = true;
        console.log('[MobileApp] updateAllSpeakers started, speakers:', this.speakers);
        
        try {
            // Sequential requests - soco-cli can't handle parallel requests properly
            for (const speaker of this.speakers) {
                try {
                    const info = await api.getSpeakerInfo(speaker);
                    console.log(`[MobileApp] Raw API response for "${speaker}":`, JSON.stringify(info, null, 2));
                    const volume = info?.volume ?? 0;
                    this.speakerStates[speaker] = { info, volume };
                } catch (error) {
                    console.error(`Failed to get info for ${speaker}:`, error);
                    this.speakerStates[speaker] = { info: null, volume: 0 };
                }
            }
            
            console.log('[MobileApp] All speaker states collected');
            
            // Fetch group info (like desktop)
            await this.updateGroupInfo();
            
            this.renderSpeakers();
            this.checkBatteryWarnings();
        } catch (error) {
            console.error('Failed to update speakers:', error);
        } finally {
            this.isUpdating = false;
        }
    },

    /**
     * Render a loading state while searching for speakers
     */
    renderSpeakersLoading() {
        const container = document.getElementById('speakers-list');
        container.innerHTML = `
            <div class="loading-message-mobile">
                <div class="spinner-mobile"></div>
                <p>Searching for speakers...</p>
            </div>
        `;
    },

    /**
     * Render the speakers list with grouping and sorting
     */
    renderSpeakers() {
        const container = document.getElementById('speakers-list');
        
        // Save which individual volume panels are currently expanded before re-rendering
        container.querySelectorAll('details.individual-volumes-expandable[open]').forEach(details => {
            const speakerCard = details.closest('.speaker-card');
            if (speakerCard) {
                const speakerName = speakerCard.dataset.speaker;
                if (speakerName) {
                    this.expandedVolumePanels.add(speakerName);
                }
            }
        });
        
        // Also remove panels that were manually closed
        container.querySelectorAll('details.individual-volumes-expandable:not([open])').forEach(details => {
            const speakerCard = details.closest('.speaker-card');
            if (speakerCard) {
                const speakerName = speakerCard.dataset.speaker;
                if (speakerName) {
                    this.expandedVolumePanels.delete(speakerName);
                }
            }
        });
        
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
        
        // Build panels: grouped speakers become one panel, ungrouped speakers are individual
        const panels = this.buildSpeakerPanels();
        
        // Sort panels: playing first, then paused, then stopped
        // Within each state, sort alphabetically by coordinator name for consistency
        panels.sort((a, b) => {
            const stateOrder = { 'playing': 0, 'paused': 1, 'stopped': 2 };
            const aOrder = stateOrder[a.playbackState] ?? 2;
            const bOrder = stateOrder[b.playbackState] ?? 2;
            if (aOrder !== bOrder) {
                return aOrder - bOrder;
            }
            // Same state - sort alphabetically
            return a.coordinator.localeCompare(b.coordinator);
        });
        
        console.log('[MobileApp] Sorted panels:', panels.map(p => ({ 
            coordinator: p.coordinator, 
            state: p.playbackState,
            stateOrder: { 'playing': 0, 'paused': 1, 'stopped': 2 }[p.playbackState] ?? 2
        })));
        
        container.innerHTML = panels.map(panel => this.renderPanel(panel)).join('');
        
        // Restore expanded state for individual volume panels
        this.expandedVolumePanels.forEach(speakerName => {
            const speakerCard = container.querySelector(`.speaker-card[data-speaker="${CSS.escape(speakerName)}"]`);
            if (speakerCard) {
                const details = speakerCard.querySelector('details.individual-volumes-expandable');
                if (details) {
                    details.open = true;
                }
            }
        });
    },

    /**
     * Build speaker panels - grouped speakers become one panel
     */
    buildSpeakerPanels() {
        const panels = [];
        const processedSpeakers = new Set();
        
        for (const speaker of this.speakers) {
            if (processedSpeakers.has(speaker)) continue;
            
            const groupInfo = this.speakerGroups[speaker];
            
            if (groupInfo && groupInfo.members && groupInfo.members.length > 1) {
                // This speaker is in a group - create a group panel
                const coordinator = groupInfo.coordinator;
                const members = groupInfo.members;
                
                // Mark all members as processed
                members.forEach(m => processedSpeakers.add(m));
                
                // Get coordinator's state for the panel
                const coordState = this.speakerStates[coordinator] || {};
                const coordInfo = coordState.info || {};
                const playbackState = this.formatPlaybackState(coordInfo.playbackState);
                const trackInfo = this.sanitizeTrackInfo(coordInfo.currentTrack);
                
                panels.push({
                    type: 'group',
                    coordinator: coordinator,
                    members: members,
                    playbackState: playbackState,
                    trackInfo: trackInfo,
                    volume: coordInfo.volume ?? 0
                });
            } else {
                // Ungrouped speaker - individual panel
                processedSpeakers.add(speaker);
                
                const state = this.speakerStates[speaker] || {};
                const info = state.info || {};
                const playbackState = this.formatPlaybackState(info.playbackState);
                const trackInfo = this.sanitizeTrackInfo(info.currentTrack);
                
                panels.push({
                    type: 'single',
                    coordinator: speaker,
                    members: [speaker],
                    playbackState: playbackState,
                    trackInfo: trackInfo,
                    volume: info.volume ?? 0
                });
            }
        }
        
        return panels;
    },

    /**
     * Render a single panel (grouped or individual)
     */
    renderPanel(panel) {
        const isPlaying = panel.playbackState === 'playing';
        const isPaused = panel.playbackState === 'paused';
        const statusClass = isPlaying ? 'playing' : (isPaused ? 'paused' : '');
        const statusText = panel.playbackState.charAt(0).toUpperCase() + panel.playbackState.slice(1);
        const statusIcon = isPlaying ? '●' : (isPaused ? '◐' : '○');
        
        const isGroup = panel.type === 'group';
        const otherMembers = panel.members.filter(m => m !== panel.coordinator);
        
        // Build display name: "A + B" for 2, "A + 2 more" for 3+
        let displayName = panel.coordinator;
        let membersDisplay = '';
        if (isGroup && otherMembers.length > 0) {
            if (otherMembers.length === 1) {
                displayName = `${panel.coordinator} + ${otherMembers[0]}`;
            } else {
                displayName = `${panel.coordinator} + ${otherMembers.length} more`;
            }
            // Always show the member chips for groups
            membersDisplay = `
                <div class="group-members-display">
                    ${panel.members.map(m => `<span class="member-chip">${this.escapeHtml(m)}</span>`).join('')}
                </div>
            `;
        }
        
        // Calculate average group volume for group volume control
        let groupVolumeControl = '';
        if (isGroup) {
            const volumes = panel.members.map(m => {
                const state = this.speakerStates[m] || {};
                return state.info?.volume ?? 0;
            });
            const avgVolume = Math.round(volumes.reduce((a, b) => a + b, 0) / volumes.length);
            
            groupVolumeControl = `
                <div class="volume-control group-volume">
                    <span class="volume-member-name">Group</span>
                    <svg class="volume-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                        <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                        <path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
                    </svg>
                    <input type="range" 
                           class="volume-slider" 
                           min="0" 
                           max="100" 
                           value="${avgVolume}"
                           oninput="mobileApp.updateGroupVolumeLabel('${this.escapeJs(panel.coordinator)}', this.value)"
                           onchange="mobileApp.setGroupVolume('${this.escapeJs(panel.coordinator)}', this.value)">
                    <span class="volume-value" id="group-volume-${this.escapeHtml(panel.coordinator)}">${avgVolume}%</span>
                </div>
            `;
        }
        
        // Individual volume controls for each member (expandable for groups)
        let volumeControlsHtml = '';
        if (isGroup) {
            const individualControls = panel.members.map(member => {
                const state = this.speakerStates[member] || {};
                const info = state.info || {};
                const volume = info.volume ?? 0;
                
                return `
                    <div class="volume-control">
                        <span class="volume-member-name">${this.escapeHtml(member)}</span>
                        <svg class="volume-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                            <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                        </svg>
                        <input type="range" 
                               class="volume-slider" 
                               min="0" 
                               max="100" 
                               value="${volume}"
                               oninput="mobileApp.updateVolumeLabel('${this.escapeJs(member)}', this.value)"
                               onchange="mobileApp.setVolume('${this.escapeJs(member)}', this.value)">
                        <span class="volume-value" id="volume-${this.escapeHtml(member)}">${volume}%</span>
                    </div>
                `;
            }).join('');
            
            volumeControlsHtml = `
                <details class="individual-volumes-expandable">
                    <summary class="individual-volumes-summary">
                        <svg class="expand-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="6 9 12 15 18 9"></polyline>
                        </svg>
                        Individual volumes
                    </summary>
                    <div class="individual-volumes-content">
                        ${individualControls}
                    </div>
                </details>
            `;
        } else {
            // Single speaker - just show volume control directly
            const state = this.speakerStates[panel.coordinator] || {};
            const info = state.info || {};
            const volume = info.volume ?? 0;
            
            volumeControlsHtml = `
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
                           oninput="mobileApp.updateVolumeLabel('${this.escapeJs(panel.coordinator)}', this.value)"
                           onchange="mobileApp.setVolume('${this.escapeJs(panel.coordinator)}', this.value)">
                    <span class="volume-value" id="volume-${this.escapeHtml(panel.coordinator)}">${volume}%</span>
                </div>
            `;
        }
        
        return `
            <div class="speaker-card ${isGroup ? 'grouped-panel' : ''}" data-speaker="${this.escapeHtml(panel.coordinator)}">
                <div class="speaker-header">
                    <span class="speaker-name">
                        ${this.escapeHtml(displayName)}
                    </span>
                    <span class="speaker-status ${statusClass}">
                        ${statusIcon} ${statusText}
                    </span>
                </div>
                
                ${membersDisplay}
                
                ${panel.trackInfo.title || panel.trackInfo.artist ? `
                <div class="speaker-track-info">
                    ${panel.trackInfo.title ? `<div class="track-title">${this.escapeHtml(panel.trackInfo.title)}</div>` : ''}
                    ${panel.trackInfo.artist ? `<div class="track-artist">${this.escapeHtml(panel.trackInfo.artist)}</div>` : ''}
                </div>
                ` : ''}
                
                <div class="speaker-controls">
                    <button class="control-btn" onclick="mobileApp.previousTrack('${this.escapeJs(panel.coordinator)}')" title="Previous">
                        <svg viewBox="0 0 24 24" fill="currentColor">
                            <polygon points="19 20 9 12 19 4 19 20"></polygon>
                            <line x1="5" y1="19" x2="5" y2="5" stroke="currentColor" stroke-width="2"></line>
                        </svg>
                    </button>
                    <button class="control-btn play-pause ${isPlaying ? 'playing' : ''}" 
                            onclick="mobileApp.togglePlayPause('${this.escapeJs(panel.coordinator)}')" 
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
                    <button class="control-btn" onclick="mobileApp.nextTrack('${this.escapeJs(panel.coordinator)}')" title="Next">
                        <svg viewBox="0 0 24 24" fill="currentColor">
                            <polygon points="5 4 15 12 5 20 5 4"></polygon>
                            <line x1="19" y1="5" x2="19" y2="19" stroke="currentColor" stroke-width="2"></line>
                        </svg>
                    </button>
                </div>
                
                ${groupVolumeControl}
                ${volumeControlsHtml}
            </div>
        `;
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
     * Update volume label during drag (also stores value to prevent jump-back on re-render)
     * @param {string} speaker - The speaker name
     * @param {number} value - The volume value
     */
    updateVolumeLabel(speaker, value) {
        const label = document.getElementById(`volume-${speaker}`);
        if (label) {
            label.textContent = `${value}%`;
        }
        // Optimistic update: store the value immediately so re-renders don't reset the slider
        if (this.speakerStates[speaker]) {
            if (!this.speakerStates[speaker].info) {
                this.speakerStates[speaker].info = {};
            }
            this.speakerStates[speaker].info.volume = parseInt(value, 10);
            this.speakerStates[speaker].volume = parseInt(value, 10);
        }
        // Pause polling during volume adjustment to avoid conflicts
        this.pausePollingBriefly();
    },

    /**
     * Temporarily pause polling to avoid conflicts during user interactions
     */
    pausePollingBriefly() {
        // Clear any existing pause timeout
        if (this.pollPauseTimeout) {
            clearTimeout(this.pollPauseTimeout);
        }
        // Mark as paused
        this.isPollingPaused = true;
        // Resume after 3 seconds of no interaction
        this.pollPauseTimeout = setTimeout(() => {
            this.isPollingPaused = false;
        }, 3000);
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
            // On error, refresh to get the actual value
            this.updateSpeakerState(speaker);
        }
    },

    /**
     * Update group volume label during drag (also stores values to prevent jump-back on re-render)
     * @param {string} coordinator - The group coordinator speaker name
     * @param {number} value - The volume value
     */
    updateGroupVolumeLabel(coordinator, value) {
        const label = document.getElementById(`group-volume-${coordinator}`);
        if (label) {
            label.textContent = `${value}%`;
        }
        // Optimistic update for all members in the group
        const groupInfo = this.speakerGroups[coordinator];
        if (groupInfo && groupInfo.members) {
            groupInfo.members.forEach(member => {
                if (this.speakerStates[member]) {
                    if (!this.speakerStates[member].info) {
                        this.speakerStates[member].info = {};
                    }
                    this.speakerStates[member].info.volume = parseInt(value, 10);
                    this.speakerStates[member].volume = parseInt(value, 10);
                }
                // Also update the individual volume labels in the UI
                this.updateVolumeLabel(member, value);
            });
        }
        // Pause polling during volume adjustment
        this.pausePollingBriefly();
    },

    /**
     * Set volume for all speakers in a group
     * @param {string} coordinator - The group coordinator speaker name
     * @param {number} volume - The volume level (0-100)
     */
    async setGroupVolume(coordinator, volume) {
        try {
            await api.setGroupVolume(coordinator, parseInt(volume, 10));
            // Update individual volume labels to reflect change
            const groupInfo = this.speakerGroups[coordinator];
            if (groupInfo && groupInfo.members) {
                groupInfo.members.forEach(member => {
                    this.updateVolumeLabel(member, volume);
                });
            }
        } catch (error) {
            console.error('Failed to set group volume:', error);
            this.showToast('Group volume change failed', 'error');
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
        // Update every 5 seconds when on speakers tab (matches desktop)
        this.updateInterval = setInterval(() => {
            if (this.currentTab === 'speakers-tab' && !document.hidden && !this.isPollingPaused) {
                this.updateAllSpeakers();
            }
        }, 5000);
        
        // Pause polling when page is hidden
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && this.currentTab === 'speakers-tab') {
                this.updateAllSpeakers();
            }
        });
    },

    /**
     * Fetches and updates group information for all speakers
     */
    async updateGroupInfo() {
        try {
            const response = await api.getGroups();
            this.speakerGroups = this.parseGroupInfo(response.groups);
            console.log('[MobileApp] Group info updated:', this.speakerGroups);
        } catch (error) {
            console.debug('Failed to fetch group info:', error.message);
        }
    },

    /**
     * Parses group info from soco-cli output
     * Format: "CoordinatorName: Member1, Member2" or "SpeakerName:" (no group)
     */
    parseGroupInfo(groupsText) {
        const groups = {};
        if (!groupsText) return groups;

        const lines = groupsText.split('\n').filter(line => line.trim());
        
        lines.forEach(line => {
            // Format is "CoordinatorName: Member1, Member2" or "SpeakerName:" for ungrouped
            const colonIndex = line.indexOf(':');
            if (colonIndex === -1) return;
            
            const coordinator = line.substring(0, colonIndex).trim();
            const membersStr = line.substring(colonIndex + 1).trim();
            
            // If no members after colon, speaker is not grouped
            if (!membersStr) return;
            
            // Parse members (comma-separated)
            const memberNames = membersStr.split(',').map(s => s.trim()).filter(s => s);
            
            // Only track if there are actual group members
            if (memberNames.length > 0) {
                const allMembers = [coordinator, ...memberNames];
                
                // Mark coordinator
                groups[coordinator] = {
                    coordinator,
                    members: allMembers,
                    isCoordinator: true
                };
                
                // Mark all members
                memberNames.forEach(member => {
                    groups[member] = {
                        coordinator,
                        members: allMembers,
                        isCoordinator: false
                    };
                });
            }
        });
        
        return groups;
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
     * Formats playback state for display (matches desktop logic)
     * @param {string} state - The raw playback state
     * @returns {string} Normalized state: 'stopped', 'paused', or 'playing'
     */
    formatPlaybackState(state) {
        const stateMap = {
            'stopped': 'stopped',
            'paused': 'paused',
            'playing': 'playing',
            'in progress': 'playing',
            'transitioning': 'paused'
        };
        return stateMap[state?.toLowerCase()] || 'stopped';
    },

    /**
     * Sanitizes track info from soco-cli (matches desktop logic)
     * @param {string} trackInfo - The raw track info string
     * @returns {{title: string, artist: string}} Sanitized track info
     */
    sanitizeTrackInfo(trackInfo) {
        if (!trackInfo || !trackInfo.trim()) {
            return { title: '', artist: '' };
        }

        let title = '';
        let artist = '';

        // Parse soco-cli labeled format (e.g., "Title: Song Name", "Artist: Artist Name", "Channel: Station Name")
        const lines = trackInfo.split('\n');
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.toLowerCase().startsWith('title:')) {
                title = trimmed.substring(6).trim();
            } else if (trimmed.toLowerCase().startsWith('artist:')) {
                artist = trimmed.substring(7).trim();
            } else if (trimmed.toLowerCase().startsWith('channel:')) {
                // Channel is used for radio stations/playlists - use as title if no title found
                if (!title) {
                    title = trimmed.substring(8).trim();
                }
            }
        }

        // If we found labeled fields, return them
        if (title || artist) {
            return { 
                title: title, 
                artist: artist 
            };
        }

        // Fallback: try simple line-based parsing for other formats
        title = lines[0]?.trim() || '';
        artist = lines[1]?.trim() || '';

        // Handle soco-cli messages that aren't actual track info
        const noTrackIndicators = [
            'playback is in progress',
            'playback is stopped',
            'no track',
            'not available',
            'unknown'
        ];

        const titleLower = title.toLowerCase();
        const artistLower = artist.toLowerCase();

        // If title looks like a status message, try to use artist as title
        if (!title || noTrackIndicators.some(ind => titleLower.includes(ind))) {
            if (artist && !noTrackIndicators.some(ind => artistLower.includes(ind))) {
                title = artist;
                artist = '';
            } else {
                // Don't display anything when stopped
                title = '';
                artist = '';
            }
        }

        // If artist is just a status message, clear it
        if (noTrackIndicators.some(ind => artistLower.includes(ind))) {
            artist = '';
        }

        return { title, artist };
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
