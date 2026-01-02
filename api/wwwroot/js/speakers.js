/**
 * Speaker Management Module
 */
window.speakers = {
    currentSpeakers: [],
    speakerGroups: {}, // Maps speaker names to their group info
    groupColors: {}, // Maps group coordinators to colors
    colorPalette: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'],
    colorIndex: 0,
    updateInterval: null,
    consecutiveErrors: 0,
    maxConsecutiveErrors: 3,
    isPolling: false,
    lastUpdateTime: null,

    /**
     * Initialize speakers
     */
    async init() {
        await this.ensureServerRunning();
        await this.discover();
    },

    /**
     * Ensures the soco-cli server is running
     */
    async ensureServerRunning() {
        try {
            const status = await api.getServerStatus();
            if (!status.isRunning) {
                updateStatus(false, 'Starting server...');
                await api.startServer();
                // Wait a bit for server to be fully ready
                await new Promise(resolve => setTimeout(resolve, 2000));
                updateStatus(true, 'Server started');
            } else {
                updateStatus(true, 'Connected');
            }
            this.consecutiveErrors = 0;
        } catch (error) {
            console.error('Failed to start server:', error);
            updateStatus(false, 'Server error');
            showToast('Failed to start Sonos server. Make sure soco-cli is installed.', 'error');
        }
    },

    /**
     * Discovers speakers on the network
     * @param {number} retryCount - Internal counter for automatic retries
     */
    async discover(retryCount = 0) {
        const grid = document.getElementById('speakers-grid');
        const maxRetries = 3;
        const retryDelayMs = 1500;
        
        grid.innerHTML = '<div class="loading-message"><div class="spinner"></div><p>Discovering speakers...</p></div>';
        updateStatus(false, 'Discovering...');

        try {
            const speakerNames = await api.getSpeakers();
            
            // If no speakers found and we haven't exceeded retries, automatically retry
            if (speakerNames.length === 0 && retryCount < maxRetries) {
                console.log(`No speakers found, retrying (${retryCount + 1}/${maxRetries})...`);
                grid.innerHTML = `<div class="loading-message"><div class="spinner"></div><p>Discovering speakers... (attempt ${retryCount + 2})</p></div>`;
                await new Promise(resolve => setTimeout(resolve, retryDelayMs));
                return this.discover(retryCount + 1);
            }
            
            this.currentSpeakers = speakerNames;
            this.renderDiscoveryResult(speakerNames, {
                toastMessage: `Found ${speakerNames.length} speaker${speakerNames.length !== 1 ? 's' : ''}`,
                retryAction: 'speakers.discover()'
            });
        } catch (error) {
            console.error('Failed to discover speakers:', error);
            
            // On error, also retry if we haven't exceeded retries
            if (retryCount < maxRetries) {
                console.log(`Discovery error, retrying (${retryCount + 1}/${maxRetries})...`);
                grid.innerHTML = `<div class="loading-message"><div class="spinner"></div><p>Discovering speakers... (attempt ${retryCount + 2})</p></div>`;
                await new Promise(resolve => setTimeout(resolve, retryDelayMs));
                return this.discover(retryCount + 1);
            }
            
            grid.innerHTML = `
                <div class="info-message">
                    <p class="js-speakers-discover-error"></p>
                    <button class="btn btn-primary" onclick="speakers.discover()">Try Again</button>
                </div>
            `;
            const errEl = grid.querySelector('.js-speakers-discover-error');
            if (errEl) {
                errEl.textContent = `Error discovering speakers: ${error?.message ?? String(error)}`;
            }
            updateStatus(false, 'Discovery failed');
            showToast('Failed to discover speakers', 'error');
        }
    },

    /**
     * Rediscover speakers and overwrite the local cache file.
     */
    async rediscover() {
        const grid = document.getElementById('speakers-grid');
        const rediscoverBtn = document.getElementById('rediscover-btn');
        
        const shouldRediscover = await showConfirmModal(
            'Rediscover speakers? This will overwrite the existing local speaker cache file.',
            'Rediscover Speakers',
            'Rediscover'
        );
        
        if (!shouldRediscover) {
            return;
        }

        this.setButtonLoading(rediscoverBtn, true, 'Rediscovering...');
        grid.innerHTML = '<div class="loading-message"><div class="spinner"></div><p>Rediscovering speakers...</p></div>';
        updateStatus(false, 'Rediscovering...');

        try {
            const speakerNames = await api.rediscoverSpeakers();
            this.currentSpeakers = speakerNames;
            this.renderDiscoveryResult(speakerNames, {
                toastMessage: `Rediscovered ${speakerNames.length} speaker${speakerNames.length !== 1 ? 's' : ''}`,
                retryAction: 'speakers.rediscover()',
                emptyMessage: 'No speakers were found during rediscovery. Check power and network, then try again.'
            });
        } catch (error) {
            console.error('Failed to rediscover speakers:', error);
            grid.innerHTML = `
                <div class="info-message">
                    <p class="js-speakers-rediscover-error"></p>
                    <button class="btn btn-primary" onclick="speakers.rediscover()">Try Again</button>
                </div>
            `;
            const errEl = grid.querySelector('.js-speakers-rediscover-error');
            if (errEl) {
                errEl.textContent = `Error rediscovering speakers: ${error?.message ?? String(error)}`;
            }
            updateStatus(false, 'Rediscovery failed');
            showToast('Failed to rediscover speakers', 'error');
        }
        finally {
            this.setButtonLoading(rediscoverBtn, false, 'Rediscover');
        }
    },

    /**
     * Render speaker grid and status after a discovery-style operation.
     * @param {string[]} speakerNames
     * @param {{toastMessage?: string, retryAction?: string, emptyMessage?: string}} options
     */
    renderDiscoveryResult(speakerNames, options = {}) {
        const grid = document.getElementById('speakers-grid');

        if (speakerNames.length === 0) {
            grid.innerHTML = `
                <div class="info-message">
                    <p>${options.emptyMessage || 'No speakers found. Make sure your Sonos speakers are powered on and connected to the network.'}</p>
                    <button class="btn btn-primary" onclick="${options.retryAction || 'speakers.discover()'}">Try Again</button>
                </div>
            `;
            updateStatus(false, 'No speakers');
            return;
        }

        grid.innerHTML = '';
        speakerNames.forEach(name => {
            const card = createSpeakerCard(name);
            grid.appendChild(card);
        });

        this.startUpdates();
        updateStatus(true, `${speakerNames.length} speaker${speakerNames.length > 1 ? 's' : ''}`);
        this.updateSpeakerSelectors();

        if (options.toastMessage) {
            showToast(options.toastMessage, 'success');
        }
    },

    /**
     * Toggle loading state on a button with inline spinner.
     * @param {HTMLButtonElement|null} button
     * @param {boolean} isLoading
     * @param {string} label
     */
    setButtonLoading(button, isLoading, label) {
        if (!button) return;

        if (isLoading) {
            button.dataset.originalContent = button.innerHTML;
            button.disabled = true;
            button.classList.add('is-loading');
            button.innerHTML = `<span class="button-spinner" aria-hidden="true"></span><span>${label}</span>`;
        } else {
            const original = button.dataset.originalContent;
            if (original) {
                button.innerHTML = original;
            } else {
                button.innerHTML = label;
            }
            button.disabled = false;
            button.classList.remove('is-loading');
        }
    },

    /**
     * Starts periodic updates for all speakers
     */
    startUpdates() {
        // Clear existing interval
        this.stopUpdates();

        // Initial update for all speakers
        this.updateAllSpeakers();
        
        // Update all speakers every 5 seconds
        this.updateInterval = setInterval(() => {
            this.updateAllSpeakers();
        }, 5000);
    },

    /**
     * Stops periodic updates
     */
    stopUpdates() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
    },

    /**
     * Updates all speakers sequentially to avoid overwhelming the API
     */
    async updateAllSpeakers() {
        if (this.isPolling || this.currentSpeakers.length === 0) {
            return;
        }

        this.isPolling = true;
        let hasError = false;

        for (const name of this.currentSpeakers) {
            try {
                await this.updateSpeakerInfo(name);
            } catch (error) {
                hasError = true;
                console.debug(`Failed to update speaker ${name}:`, error.message);
            }
        }

        // Update group info after updating speakers
        await this.updateGroupInfo();

        if (hasError) {
            this.consecutiveErrors++;
            if (this.consecutiveErrors >= this.maxConsecutiveErrors) {
                updateStatus(false, 'Connection issues');
                // Try to restart the server
                console.warn('Too many consecutive errors, attempting server reconnection...');
                try {
                    await this.ensureServerRunning();
                } catch (e) {
                    console.error('Failed to reconnect:', e);
                }
            }
        } else {
            this.consecutiveErrors = 0;
            this.lastUpdateTime = new Date();
            updateStatus(true, `${this.currentSpeakers.length} speaker${this.currentSpeakers.length > 1 ? 's' : ''}`);
        }

        this.isPolling = false;
    },

    /**
     * Updates info for a specific speaker
     */
    async updateSpeakerInfo(speakerName) {
        try {
            const info = await api.getSpeakerInfo(speakerName);
            const escaped = (window.CSS && typeof window.CSS.escape === 'function')
                ? window.CSS.escape(String(speakerName))
                : String(speakerName);
            const card = document.querySelector(`.speaker-card[data-speaker="${escaped}"]`);
            if (!card) return;

            // Handle offline state
            if (info.isOffline) {
                this.setCardOffline(card, true, info.errorMessage);
                return;
            } else {
                this.setCardOffline(card, false);
            }

            // Update status - only if we have valid playback state
            if (info.playbackState) {
                const status = card.querySelector('.speaker-status');
                const state = formatPlaybackState(info.playbackState);
                status.className = `speaker-status ${state}`;
                status.textContent = state.charAt(0).toUpperCase() + state.slice(1);

                // Update play/pause button
                const playPauseBtn = card.querySelector('.control-btn.primary');
                if (state === 'playing') {
                    playPauseBtn.textContent = '⏸';
                } else {
                    playPauseBtn.textContent = '▶';
                }
            }

            // Update track info - always update, show "No track playing" if empty
            const trackDiv = card.querySelector('.speaker-track');
            if (info.currentTrack && info.currentTrack.trim()) {
                const lines = info.currentTrack.split('\n');
                let title = '';
                let artist = '';
                
                // Parse soco-cli labeled format (e.g., "Title: Song Name", "Artist: Artist Name", "Channel: Station Name")
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
                
                // If we found labeled fields, use them
                if (title || artist) {
                    trackDiv.querySelector('.track-title').textContent = truncateText(title, 40);
                    trackDiv.querySelector('.track-artist').textContent = truncateText(artist, 40);
                } else {
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
                    
                    trackDiv.querySelector('.track-title').textContent = truncateText(title, 40);
                    trackDiv.querySelector('.track-artist').textContent = truncateText(artist, 40);
                }
            } else {
                trackDiv.querySelector('.track-title').textContent = '';
                trackDiv.querySelector('.track-artist').textContent = '';
            }

            // Update volume - only if we have a valid value
            if (info.volume !== null && info.volume !== undefined) {
                const volumeSlider = card.querySelector('.volume-slider');
                const volumeValue = card.querySelector('.volume-value');
                // Only update if the user isn't actively dragging the slider
                if (document.activeElement !== volumeSlider) {
                    volumeSlider.value = info.volume;
                }
                volumeValue.textContent = info.volume;
            }
        } catch (error) {
            // Silently ignore update errors to prevent UI disruption
            console.debug(`Failed to update speaker ${speakerName}:`, error.message);
        }
    },

    /**
     * Sets the offline state of a speaker card
     * @param {HTMLElement} card - The speaker card element
     * @param {boolean} isOffline - Whether the speaker is offline
     * @param {string} [errorMessage] - Optional error message to display
     */
    setCardOffline(card, isOffline, errorMessage = 'Speaker is offline') {
        if (isOffline) {
            card.classList.add('speaker-offline');
            
            // Update status badge
            const status = card.querySelector('.speaker-status');
            if (status) {
                status.className = 'speaker-status offline';
                status.textContent = 'Offline';
            }
            
            // Update track info to show offline message
            const trackDiv = card.querySelector('.speaker-track');
            if (trackDiv) {
                trackDiv.querySelector('.track-title').textContent = errorMessage;
                trackDiv.querySelector('.track-artist').textContent = 'Check power and network connection';
            }
            
            // Disable controls
            card.querySelectorAll('.control-btn').forEach(btn => {
                btn.disabled = true;
            });
            card.querySelectorAll('.volume-slider, .group-volume-slider').forEach(slider => {
                slider.disabled = true;
            });
        } else {
            card.classList.remove('speaker-offline');
            
            // Re-enable controls
            card.querySelectorAll('.control-btn').forEach(btn => {
                btn.disabled = false;
            });
            card.querySelectorAll('.volume-slider, .group-volume-slider').forEach(slider => {
                slider.disabled = false;
            });
        }
    },

    /**
     * Play/Pause toggle
     */
    async playPause(speakerName) {
        try {
            await api.playPause(speakerName);
            setTimeout(() => this.updateSpeakerInfo(speakerName), 500);
        } catch (error) {
            showToast('Failed to toggle playback', 'error');
        }
    },

    /**
     * Next track
     */
    async next(speakerName) {
        try {
            await api.next(speakerName);
            setTimeout(() => this.updateSpeakerInfo(speakerName), 500);
            showToast('Next track', 'success');
        } catch (error) {
            showToast('Failed to skip track', 'error');
        }
    },

    /**
     * Previous track
     */
    async previous(speakerName) {
        try {
            await api.previous(speakerName);
            setTimeout(() => this.updateSpeakerInfo(speakerName), 500);
            showToast('Previous track', 'success');
        } catch (error) {
            showToast('Failed to go to previous track', 'error');
        }
    },

    /**
     * Set volume (with debouncing)
     */
    setVolume: debounce(async function(speakerName, volume) {
        try {
            await api.setVolume(speakerName, volume);
            const escaped = (window.CSS && typeof window.CSS.escape === 'function')
                ? window.CSS.escape(String(speakerName))
                : String(speakerName);
            const card = document.querySelector(`.speaker-card[data-speaker="${escaped}"]`);
            if (card) {
                card.querySelector('.volume-value').textContent = volume;
            }
        } catch (error) {
            showToast('Failed to set volume', 'error');
        }
    }, 300),

    /**
     * Set group volume (with debouncing)
     */
    setGroupVolume: debounce(async function(speakerName, volume) {
        try {
            await api.setGroupVolume(speakerName, volume);
            const escaped = (window.CSS && typeof window.CSS.escape === 'function')
                ? window.CSS.escape(String(speakerName))
                : String(speakerName);
            const card = document.querySelector(`.speaker-card[data-speaker="${escaped}"]`);
            if (card) {
                card.querySelector('.group-volume-value').textContent = volume;
            }
            showToast(`Group volume set to ${volume}`, 'success');
        } catch (error) {
            showToast('Failed to set group volume', 'error');
        }
    }, 300),

    /**
     * Toggle mute
     */
    async toggleMute(speakerName) {
        try {
            await api.toggleMute(speakerName);
            setTimeout(() => this.updateSpeakerInfo(speakerName), 500);
            showToast('Mute toggled', 'success');
        } catch (error) {
            showToast('Failed to toggle mute', 'error');
        }
    },

    /**
     * Updates speaker selectors in favorites and queue tabs
     */
    updateSpeakerSelectors() {
        const selectors = ['favorites-speaker-select', 'queue-speaker-select'];
        
        selectors.forEach(id => {
            const selector = document.getElementById(id);
            if (!selector) return;

            const currentValue = selector.value;
            selector.innerHTML = this.currentSpeakers.map(name => 
                `<option value="${name}" ${name === currentValue ? 'selected' : ''}>${name}</option>`
            ).join('');

            // Select first speaker if none selected
            if (!currentValue && this.currentSpeakers.length > 0) {
                selector.value = this.currentSpeakers[0];
            }
        });

        // Also update the favorites and queue module selectors
        if (typeof favorites !== 'undefined') {
            favorites.updateSpeakerSelector();
        }
        if (typeof queue !== 'undefined') {
            queue.updateSpeakerSelector();
        }
    },

    // ========================================
    // Group Visualization
    // ========================================

    /**
     * Gets a color for a group coordinator
     */
    getGroupColor(coordinator) {
        if (!this.groupColors[coordinator]) {
            this.groupColors[coordinator] = this.colorPalette[this.colorIndex % this.colorPalette.length];
            this.colorIndex++;
        }
        return this.groupColors[coordinator];
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
                const color = this.getGroupColor(coordinator);
                
                // Mark coordinator
                groups[coordinator] = {
                    coordinator,
                    members: allMembers,
                    color,
                    isCoordinator: true
                };
                
                // Mark all members
                memberNames.forEach(member => {
                    groups[member] = {
                        coordinator,
                        members: allMembers,
                        color,
                        isCoordinator: false
                    };
                });
            }
        });
        
        return groups;
    },

    /**
     * Fetches and updates group information for all speakers
     */
    async updateGroupInfo() {
        try {
            const response = await api.getGroups();
            this.speakerGroups = this.parseGroupInfo(response.groups);
            
            // Update all speaker cards with group info
            this.currentSpeakers.forEach(name => {
                this.updateSpeakerGroupDisplay(name);
            });
        } catch (error) {
            console.debug('Failed to fetch group info:', error.message);
        }
    },

    /**
     * Updates the group display for a specific speaker card
     */
    updateSpeakerGroupDisplay(speakerName) {
        const escaped = (window.CSS && typeof window.CSS.escape === 'function')
            ? window.CSS.escape(String(speakerName))
            : String(speakerName);
        const card = document.querySelector(`.speaker-card[data-speaker="${escaped}"]`);
        if (!card) return;

        const groupInfo = this.speakerGroups[speakerName];
        const groupInfoDiv = card.querySelector('.speaker-group-info');
        
        if (groupInfo) {
            // Show group indicator
            card.classList.add('grouped');
            card.style.setProperty('--group-color', groupInfo.color);
            
            if (groupInfo.isCoordinator) {
                card.classList.add('group-coordinator');
                card.classList.remove('group-member');
                const otherMembers = groupInfo.members.filter(m => m !== speakerName);

                // Build DOM safely (speaker names should never be injected as HTML)
                groupInfoDiv.innerHTML = '';
                const badge = document.createElement('span');
                badge.className = 'group-badge coordinator';
                badge.style.backgroundColor = groupInfo.color;
                badge.textContent = '⬤ Group Leader';

                const members = document.createElement('span');
                members.className = 'group-members';
                members.textContent = `+ ${otherMembers.join(', ')}`;

                groupInfoDiv.appendChild(badge);
                groupInfoDiv.appendChild(document.createTextNode(' '));
                groupInfoDiv.appendChild(members);
                
                // Show all controls for coordinator
                card.querySelector('.speaker-track')?.style.removeProperty('display');
                card.querySelector('.speaker-controls')?.style.removeProperty('display');
                card.querySelector('.playmode-controls')?.style.removeProperty('display');
                
                // Show group volume control for coordinator
                const groupVolumeControl = card.querySelector('.group-volume-control');
                if (groupVolumeControl) {
                    groupVolumeControl.style.display = 'block';
                }
            } else {
                card.classList.add('group-member');
                card.classList.remove('group-coordinator');

                // Build DOM safely (speaker names should never be injected as HTML)
                groupInfoDiv.innerHTML = '';
                const badge = document.createElement('span');
                badge.className = 'group-badge member';
                badge.style.borderColor = groupInfo.color;
                badge.style.color = groupInfo.color;
                badge.textContent = `◯ Grouped with ${groupInfo.coordinator ?? ''}`;
                groupInfoDiv.appendChild(badge);
                
                // Hide playback controls for group members (they're controlled by the leader)
                const trackEl = card.querySelector('.speaker-track');
                if (trackEl) trackEl.style.display = 'none';

                const controlsEl = card.querySelector('.speaker-controls');
                if (controlsEl) controlsEl.style.display = 'none';

                const playmodeEl = card.querySelector('.playmode-controls');
                if (playmodeEl) playmodeEl.style.display = 'none';
            }
            groupInfoDiv.style.display = 'block';
        } else {
            // Not in a group - show all controls
            card.classList.remove('grouped', 'group-coordinator', 'group-member');
            card.style.removeProperty('--group-color');
            groupInfoDiv.style.display = 'none';
            groupInfoDiv.innerHTML = '';
            
            // Ensure all controls are visible when not grouped
            card.querySelector('.speaker-track')?.style.removeProperty('display');
            card.querySelector('.speaker-controls')?.style.removeProperty('display');
            card.querySelector('.playmode-controls')?.style.removeProperty('display');
            
            // Hide group volume control when not grouped
            const groupVolumeControl = card.querySelector('.group-volume-control');
            if (groupVolumeControl) {
                groupVolumeControl.style.display = 'none';
            }
        }
    },

    // ========================================
    // Phase 2: Enhanced Playback Controls
    // ========================================

    /**
     * Toggle shuffle mode
     */
    async toggleShuffle(speakerName) {
        try {
            const current = await api.getShuffle(speakerName);
            const newState = current.shuffle ? 'off' : 'on';
            await api.setShuffle(speakerName, newState);
            
            // Update button state
            const escaped = (window.CSS && typeof window.CSS.escape === 'function')
                ? window.CSS.escape(String(speakerName))
                : String(speakerName);
            const card = document.querySelector(`.speaker-card[data-speaker="${escaped}"]`);
            if (card) {
                const btn = card.querySelector('[data-control="shuffle"]');
                btn?.classList.toggle('active', newState === 'on');
            }
            
            showToast(`Shuffle ${newState}`, 'success');
        } catch (error) {
            showToast('Failed to toggle shuffle', 'error');
        }
    },

    /**
     * Cycle through repeat modes (off -> one -> all -> off)
     */
    async cycleRepeat(speakerName) {
        try {
            const current = await api.getRepeat(speakerName);
            const modes = ['off', 'one', 'all'];
            const currentIndex = modes.indexOf(current.repeat?.toLowerCase() || 'off');
            const nextMode = modes[(currentIndex + 1) % modes.length];
            
            await api.setRepeat(speakerName, nextMode);
            
            // Update button state
            const escaped = (window.CSS && typeof window.CSS.escape === 'function')
                ? window.CSS.escape(String(speakerName))
                : String(speakerName);
            const card = document.querySelector(`.speaker-card[data-speaker="${escaped}"]`);
            if (card) {
                const btn = card.querySelector('[data-control="repeat"]');
                btn?.classList.toggle('active', nextMode !== 'off');
                const icon = btn?.querySelector('.repeat-icon');
                if (icon) {
                    icon.textContent = nextMode === 'one' ? '⟳₁' : '⟳';
                }
            }
            
            showToast(`Repeat: ${nextMode}`, 'success');
        } catch (error) {
            showToast('Failed to change repeat mode', 'error');
        }
    },

    /**
     * Shows sleep timer dialog
     */
    showSleepTimer(speakerName) {
        const modal = document.createElement('div');
        modal.className = 'modal active';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 350px;">
                <div class="modal-header">
                    <h3>Sleep Timer</h3>
                    <button class="modal-close">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="sleep-timer-options">
                        <button class="btn btn-secondary btn-block" data-duration="15m">15 minutes</button>
                        <button class="btn btn-secondary btn-block" data-duration="30m">30 minutes</button>
                        <button class="btn btn-secondary btn-block" data-duration="45m">45 minutes</button>
                        <button class="btn btn-secondary btn-block" data-duration="1h">1 hour</button>
                        <button class="btn btn-secondary btn-block" data-duration="2h">2 hours</button>
                        <button class="btn btn-secondary btn-block" data-duration="off" style="margin-top: 16px;">Cancel Timer</button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        modal.querySelector('.modal-close').addEventListener('click', () => modal.remove());
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });

        modal.querySelectorAll('[data-duration]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const duration = btn.dataset.duration;
                try {
                    if (duration === 'off') {
                        await api.cancelSleepTimer(speakerName);
                        showToast('Sleep timer cancelled', 'success');
                    } else {
                        await api.setSleepTimer(speakerName, duration);
                        showToast(`Sleep timer set for ${btn.textContent}`, 'success');
                    }
                    modal.remove();
                } catch (error) {
                    showToast('Failed to set sleep timer', 'error');
                }
            });
        });
    },

    /**
     * Shows grouping menu
     */
    showGroupMenu(speakerName) {
        const otherSpeakers = this.currentSpeakers.filter(s => s !== speakerName);
        
        const modal = document.createElement('div');
        modal.className = 'modal active';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 400px;">
                <div class="modal-header">
                    <h3>Speaker Grouping</h3>
                    <button class="modal-close">&times;</button>
                </div>
                <div class="modal-body">
                    <p class="form-hint" style="margin-bottom: 16px;">Group "${speakerName}" with another speaker, or manage groups.</p>
                    
                    <div class="group-actions">
                        <h4 style="margin-bottom: 8px;">Join Group With:</h4>
                        ${otherSpeakers.map(s => `
                            <button class="btn btn-secondary btn-block group-with-btn" data-target="${s}">
                                ${s}
                            </button>
                        `).join('')}
                        
                        <hr style="margin: 16px 0;">
                        
                        <button class="btn btn-secondary btn-block" id="ungroup-btn">
                            Leave Current Group
                        </button>
                        <button class="btn btn-primary btn-block" id="party-mode-btn">
                            🎉 Party Mode (Group All)
                        </button>
                        <button class="btn btn-secondary btn-block" id="ungroup-all-btn">
                            Ungroup All Speakers
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        modal.querySelector('.modal-close').addEventListener('click', () => modal.remove());
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });

        // Group with specific speaker
        modal.querySelectorAll('.group-with-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const target = btn.dataset.target;
                try {
                    await api.groupSpeaker(speakerName, target);
                    showToast(`${speakerName} grouped with ${target}`, 'success');
                    modal.remove();
                    await this.updateGroupInfo();
                } catch (error) {
                    showToast('Failed to group speakers', 'error');
                }
            });
        });

        // Ungroup
        modal.querySelector('#ungroup-btn').addEventListener('click', async () => {
            try {
                await api.ungroupSpeaker(speakerName);
                showToast(`${speakerName} ungrouped`, 'success');
                modal.remove();
                await this.updateGroupInfo();
            } catch (error) {
                showToast('Failed to ungroup speaker', 'error');
            }
        });

        // Party mode
        modal.querySelector('#party-mode-btn').addEventListener('click', async () => {
            try {
                await api.partyMode(speakerName);
                showToast('Party mode activated!', 'success');
                modal.remove();
                await this.updateGroupInfo();
            } catch (error) {
                showToast('Failed to activate party mode', 'error');
            }
        });

        // Ungroup all
        modal.querySelector('#ungroup-all-btn').addEventListener('click', async () => {
            try {
                await api.ungroupAll(speakerName);
                showToast('All speakers ungrouped', 'success');
                modal.remove();
                // Reset group colors when all ungrouped
                this.groupColors = {};
                this.colorIndex = 0;
                await this.updateGroupInfo();
            } catch (error) {
                showToast('Failed to ungroup all speakers', 'error');
            }
        });
    }
};
