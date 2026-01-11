/**
 * Reusable UI Components
 */

/**
 * Coerces a value to a safe display string.
 * @param {unknown} value
 * @returns {string}
 */
function toDisplayString(value) {
    if (value === null || value === undefined) return '';
    return String(value);
}

/**
 * Formats a macro name for display by replacing underscores with spaces.
 * @param {string} name - The macro name
 * @returns {string} The formatted display name
 */
function formatMacroName(name) {
    if (!name) return '';
    return String(name).replace(/_/g, ' ');
}

/**
 * Restrict toast types to known CSS classes.
 * @param {string} type
 * @returns {'success'|'error'|'warning'}
 */
function normalizeToastType(type) {
    const t = String(type || '').toLowerCase();
    if (t === 'error' || t === 'warning' || t === 'success') return t;
    return 'success';
}

/**
 * Best-effort CSS attribute value escape for querySelector.
 * Uses CSS.escape when available.
 * @param {unknown} value
 * @returns {string}
 */
function cssEscape(value) {
    const str = String(value ?? '');
    if (window.CSS && typeof window.CSS.escape === 'function') {
        return window.CSS.escape(str);
    }
    return str.replace(/[\\"']/g, '\\$&');
}

/**
 * Shows a toast notification.
 * @param {unknown} message
 * @param {'success'|'error'|'warning'|string} [type='success']
 */
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) {
        console.warn('Toast container not found');
        return;
    }

    const toastType = normalizeToastType(type);
    const toast = document.createElement('div');
    toast.className = `toast ${toastType}`;

    const msgEl = document.createElement('div');
    msgEl.className = 'toast-message';
    msgEl.textContent = toDisplayString(message);
    toast.appendChild(msgEl);

    container.appendChild(toast);

    // Fade out then remove
    toast.style.transition = 'opacity 0.3s ease';
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

/**
 * Updates the status indicator.
 * @param {boolean} isConnected
 * @param {string} [message]
 */
function updateStatus(isConnected, message = '') {
    const indicator = document.getElementById('status-indicator');
    if (!indicator) return;
    const statusText = indicator.querySelector('.status-text');
    if (!statusText) return;

    if (isConnected) {
        indicator.className = 'status-indicator connected';
        statusText.textContent = message || 'Connected';
    } else {
        indicator.className = 'status-indicator error';
        statusText.textContent = message || 'Disconnected';
    }
}

/**
 * Creates a speaker card element with enhanced controls
 */
function createSpeakerCard(speakerName) {
    const card = document.createElement('div');
    card.className = 'speaker-card';
    card.dataset.speaker = speakerName;
    
    card.innerHTML = `
        <div class="speaker-header">
            <div>
                <h3 class="speaker-name"></h3>
                <div class="speaker-group-info" style="display: none;"></div>
            </div>
            <span class="speaker-status stopped">Stopped</span>
        </div>
        
        <div class="speaker-track">
            <div class="track-title"></div>
            <div class="track-artist"></div>
        </div>
        
        <div class="speaker-controls">
            <button class="control-btn" data-action="previous" type="button" title="Previous">⏮︎</button>
            <button class="control-btn primary" data-action="playPause" type="button" title="Play/Pause">▶</button>
            <button class="control-btn" data-action="next" type="button" title="Next">⏭︎</button>
            <button class="control-btn" data-action="mute" type="button" title="Mute">◖</button>
        </div>
        
        <!-- Play Mode Controls (Phase 2) -->
        <div class="playmode-controls">
            <button class="control-btn small playmode-btn" data-control="shuffle" data-action="shuffle" type="button" title="Shuffle">
                <svg class="btn-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="16 3 21 3 21 8"></polyline>
                    <line x1="4" y1="20" x2="21" y2="3"></line>
                    <polyline points="21 16 21 21 16 21"></polyline>
                    <line x1="15" y1="15" x2="21" y2="21"></line>
                    <line x1="4" y1="4" x2="9" y2="9"></line>
                </svg>
            </button>
            <button class="control-btn small playmode-btn" data-control="repeat" data-action="repeat" type="button" title="Repeat">
                <svg class="btn-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="17 1 21 5 17 9"></polyline>
                    <path d="M3 11V9a4 4 0 0 1 4-4h14"></path>
                    <polyline points="7 23 3 19 7 15"></polyline>
                    <path d="M21 13v2a4 4 0 0 1-4 4H3"></path>
                </svg>
            </button>
            <button class="control-btn small" data-action="sleep" type="button" title="Sleep Timer">
                <svg class="btn-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <polyline points="12 6 12 12 16 14"></polyline>
                </svg>
            </button>
            <button class="control-btn small" data-action="group" type="button" title="Grouping">
                <svg class="btn-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="3" width="7" height="7"></rect>
                    <rect x="14" y="3" width="7" height="7"></rect>
                    <rect x="14" y="14" width="7" height="7"></rect>
                    <rect x="3" y="14" width="7" height="7"></rect>
                </svg>
            </button>
        </div>
        
        <div class="volume-control group-volume-control" style="display: none;">
            <div class="volume-label">
                <span class="volume-label-text">
                    <svg class="volume-label-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                        <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                        <path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
                    </svg>
                    Group
                </span>
                <span class="group-volume-value">--</span>
            </div>
            <input type="range" class="group-volume-slider" min="0" max="100" value="50" 
                     >
        </div>
        
        <div class="volume-control">
            <div class="volume-label">
                <span>Volume</span>
                <span class="volume-value">--</span>
            </div>
            <input type="range" class="volume-slider" min="0" max="100" value="50" 
                   >
        </div>
    `;

    // Set speaker name safely
    const nameEl = card.querySelector('.speaker-name');
    if (nameEl) {
        nameEl.textContent = toDisplayString(speakerName);
    }

    // Attach event handlers (avoids inline onclick and string interpolation)
    const actions = {
        previous: () => window.speakers?.previous?.(speakerName),
        playPause: () => window.speakers?.playPause?.(speakerName),
        next: () => window.speakers?.next?.(speakerName),
        mute: () => window.speakers?.toggleMute?.(speakerName),
        shuffle: () => window.speakers?.toggleShuffle?.(speakerName),
        repeat: () => window.speakers?.cycleRepeat?.(speakerName),
        sleep: () => window.speakers?.showSleepTimer?.(speakerName),
        group: () => window.speakers?.showGroupMenu?.(speakerName)
    };

    card.querySelectorAll('[data-action]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const action = btn.dataset.action;
            const fn = action ? actions[action] : null;
            if (typeof fn === 'function') fn();
        });
    });

    const volumeSlider = card.querySelector('.volume-slider');
    if (volumeSlider) {
        volumeSlider.addEventListener('input', (e) => {
            const value = Number(e.target.value);
            if (!Number.isFinite(value) || value < 0 || value > 100) return;
            window.speakers?.setVolume?.(speakerName, value);
        });
    }

    const groupVolumeSlider = card.querySelector('.group-volume-slider');
    if (groupVolumeSlider) {
        groupVolumeSlider.addEventListener('input', (e) => {
            const value = Number(e.target.value);
            if (!Number.isFinite(value) || value < 0 || value > 100) return;
            window.speakers?.setGroupVolume?.(speakerName, value);
        });
    }
    
    return card;
}

/**
 * Creates a macro card element
 */
function createMacroCard(macro) {
    const card = document.createElement('div');
    card.className = `macro-card ${macro.isFavorite ? 'favorite' : ''}`;
    card.dataset.macroName = macro.name;

    card.innerHTML = `
        <div class="macro-header">
            <div class="macro-header-content">
                <h3 class="macro-name"></h3>
                <span class="macro-category" style="display: none;"></span>
            </div>
            <button class="macro-copy-btn" type="button" title="Copy Macro Run Url">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
            </button>
        </div>
        <p class="macro-description" style="display: none;"></p>
        <small class="macro-parameters" style="color: var(--color-gray-600); display: none; margin-bottom: 8px;"></small>
        <div class="macro-definition"></div>
        <div class="macro-actions-bar">
            <button class="btn btn-primary btn-sm" type="button" data-action="run">Run</button>
            <button class="btn btn-secondary btn-sm" type="button" data-action="edit">Edit</button>
            <button class="btn btn-secondary btn-sm" type="button" data-action="duplicate">Duplicate</button>
            <button class="btn btn-secondary btn-sm" type="button" data-action="delete">Delete</button>
        </div>
    `;

    const nameEl = card.querySelector('.macro-name');
    if (nameEl) nameEl.textContent = formatMacroName(macro.name);

    const categoryEl = card.querySelector('.macro-category');
    if (categoryEl) {
        if (macro.category) {
            categoryEl.textContent = toDisplayString(macro.category);
            categoryEl.style.display = '';
        } else {
            categoryEl.style.display = 'none';
        }
    }

    const descriptionEl = card.querySelector('.macro-description');
    if (descriptionEl) {
        if (macro.description) {
            descriptionEl.textContent = toDisplayString(macro.description);
            descriptionEl.style.display = '';
        } else {
            descriptionEl.style.display = 'none';
        }
    }

    const paramsEl = card.querySelector('.macro-parameters');
    if (paramsEl) {
        const count = Array.isArray(macro.parameters) ? macro.parameters.length : 0;
        if (count > 0) {
            paramsEl.textContent = `Parameters: ${count}`;
            paramsEl.style.display = 'block';
        } else {
            paramsEl.style.display = 'none';
        }
    }

    const defEl = card.querySelector('.macro-definition');
    if (defEl) defEl.textContent = toDisplayString(macro.definition);

    const copyBtn = card.querySelector('.macro-copy-btn');
    copyBtn?.addEventListener('click', () => window.macros?.copyUrl?.(macro.name));

    card.querySelectorAll('[data-action]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const action = btn.dataset.action;
            if (action === 'run') window.macros?.execute?.(macro.name);
            if (action === 'edit') window.macros?.edit?.(macro.name);
            if (action === 'duplicate') window.macros?.duplicate?.(macro.name);
            if (action === 'delete') window.macros?.delete?.(macro.name);
        });
    });
    
    return card;
}

/**
 * Shows/hides the macro editor modal
 */
function toggleMacroModal(show) {
    const modal = document.getElementById('macro-editor-modal');
    if (!modal) return;
    if (show) {
        modal.classList.add('active');
    } else {
        modal.classList.remove('active');
    }
}

/**
 * Shows a confirmation modal and returns a promise
 * @param {string} message - The confirmation message
 * @param {string} title - The modal title (optional)
 * @param {string} confirmText - The confirm button text (optional)
 * @returns {Promise<boolean>} True if confirmed, false if cancelled
 */
function showConfirmModal(message, title = 'Confirm Action', confirmText = 'Confirm') {
    return new Promise((resolve) => {
        const modal = document.getElementById('confirm-modal');
        const titleEl = document.getElementById('confirm-modal-title');
        const messageEl = document.getElementById('confirm-modal-message');
        const confirmBtn = document.getElementById('confirm-modal-confirm-btn');

        if (!modal || !titleEl || !messageEl || !confirmBtn) {
            console.warn('Confirm modal elements not found');
            resolve(false);
            return;
        }
        
        titleEl.textContent = title;
        messageEl.textContent = toDisplayString(message);
        confirmBtn.textContent = confirmText;
        
        // Show modal
        modal.classList.add('active');
        
        // Handle confirm
        const handleConfirm = () => {
            cleanup();
            resolve(true);
        };
        
        // Handle cancel
        const handleCancel = () => {
            cleanup();
            resolve(false);
        };
        
        // Cleanup function
        const cleanup = () => {
            modal.classList.remove('active');
            confirmBtn.removeEventListener('click', handleConfirm);
            // Avoid dangling global handler if something calls it later
            window.hideConfirmModal = () => {};
        };
        
        // Set up event listeners
        confirmBtn.addEventListener('click', handleConfirm);
        
        // Store cancel handler globally so it can be called from onclick
        window.hideConfirmModal = handleCancel;
    });
}

/**
 * Tab navigation handler
 */
function setupTabNavigation() {
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabName = button.dataset.tab;
            
            // Update active states
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));
            
            button.classList.add('active');
            document.getElementById(`${tabName}-tab`).classList.add('active');
            
            // Trigger tab-specific actions
            console.log('Tab switched to:', tabName);
            switch(tabName) {
                case 'macros':
                    macros.load();
                    break;
                case 'favorites':
                    favorites.updateSpeakerSelector();
                    favorites.switchSubTab('sonos-favorites');
                    break;
                case 'queue':
                    console.log('Loading queue tab...');
                    queue.updateSpeakerSelector();
                    queue.load();
                    break;
            }
        });
    });
}

/**
 * Formats playback state for display
 */
function formatPlaybackState(state) {
    const stateMap = {
        'stopped': 'stopped',
        'paused': 'paused',
        'playing': 'playing',
        'in progress': 'playing',
        'transitioning': 'paused'
    };
    return stateMap[state?.toLowerCase()] || 'stopped';
}

/**
 * Truncates text with ellipsis
 */
function truncateText(text, maxLength = 50) {
    if (!text || text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
}

/**
 * Debounce function for volume sliders
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const context = this;
        const later = () => {
            clearTimeout(timeout);
            func.apply(context, args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Custom Searchable Dropdown Component
 */
class SearchableDropdown {
    constructor(containerId, options = [], config = {}) {
        this.container = document.getElementById(containerId);
        if (!this.container) return;
        
        this.options = options;
        this.value = null;
        this.onChange = null;
        this.placeholder = 'Select option...';
        this.allowCustom = config.allowCustom || false;
        
        this.render();
        this.attachEvents();
    }
    
    setOptions(options) {
        this.options = options;
        this.renderOptions();
    }
    
    setValue(value) {
        this.value = value;
        this.updateTrigger();
        this.updateSelectedOption();
    }
    
    getValue() {
        return this.value;
    }
    
    render() {
        this.container.classList.add('custom-select-container');
        const searchPlaceholder = this.allowCustom ? 'Search or type custom value...' : 'Search...';
        this.container.innerHTML = `
            <div class="custom-select-trigger" tabindex="0">
                <span>${this.placeholder}</span>
            </div>
            <div class="custom-select-dropdown">
                <div class="custom-select-search">
                    <input type="text" placeholder="${searchPlaceholder}">
                </div>
                <div class="custom-select-options"></div>
            </div>
        `;
        
        this.trigger = this.container.querySelector('.custom-select-trigger');
        this.dropdown = this.container.querySelector('.custom-select-dropdown');
        this.searchInput = this.container.querySelector('input');
        this.optionsContainer = this.container.querySelector('.custom-select-options');
        
        this.renderOptions();
    }
    
    renderOptions() {
        this.optionsContainer.innerHTML = '';

        if (!Array.isArray(this.options) || this.options.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'custom-select-empty';
            empty.textContent = 'No options available';
            this.optionsContainer.appendChild(empty);
            return;
        }

        for (const opt of this.options) {
            const optionEl = document.createElement('div');
            optionEl.className = 'custom-select-option';
            optionEl.dataset.value = String(opt?.value ?? '');
            optionEl.textContent = toDisplayString(opt?.label);
            this.optionsContainer.appendChild(optionEl);
        }

        this.updateSelectedOption();
    }
    
    updateTrigger() {
        const selectedOption = this.options.find(o => o.value === this.value);
        const span = this.trigger.querySelector('span');
        if (selectedOption) {
            span.textContent = selectedOption.label;
            span.style.color = 'var(--color-gray-900)';
        } else if (this.value) {
            // Display value even if not in options (for custom values)
            span.textContent = this.value;
            span.style.color = 'var(--color-gray-900)';
        } else {
            span.textContent = this.placeholder;
            span.style.color = 'var(--color-gray-500)';
        }
    }
    
    updateSelectedOption() {
        const current = this.value === null || this.value === undefined ? null : String(this.value);
        const options = this.optionsContainer.querySelectorAll('.custom-select-option');
        options.forEach(opt => {
            if (current !== null && opt.dataset.value === current) {
                opt.classList.add('selected');
            } else {
                opt.classList.remove('selected');
            }
        });
    }
    
    attachEvents() {
        // Toggle dropdown
        this.trigger.addEventListener('click', () => {
            this.toggleDropdown();
        });
        
        // Close when clicking outside
        document.addEventListener('click', (e) => {
            if (!this.container.contains(e.target)) {
                this.closeDropdown();
            }
        });
        
        // Search filter
        this.searchInput.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            const options = this.optionsContainer.querySelectorAll('.custom-select-option:not(.custom-select-option-custom)');
            let hasVisible = false;
            
            options.forEach(opt => {
                const text = opt.textContent.toLowerCase();
                if (text.includes(term)) {
                    opt.classList.remove('hidden');
                    hasVisible = true;
                } else {
                    opt.classList.add('hidden');
                }
            });

            // Handle custom value option
            if (this.allowCustom) {
                let customOption = this.optionsContainer.querySelector('.custom-select-option-custom');
                
                if (term) {
                    // Show custom option whenever user is typing (unless exact match exists)
                    const visibleOpts = Array.from(options).filter(opt => !opt.classList.contains('hidden'));
                    const exactMatch = visibleOpts.some(opt => opt.textContent.toLowerCase() === term);
                    
                    if (!exactMatch) {
                        if (!customOption) {
                            customOption = document.createElement('div');
                            customOption.className = 'custom-select-option custom-select-option-custom';
                            this.optionsContainer.prepend(customOption);
                        }
                        customOption.innerHTML = '';
                        const label = document.createElement('span');
                        label.style.fontWeight = '600';
                        label.textContent = '✨ Use custom value:';
                        customOption.appendChild(label);
                        customOption.appendChild(document.createTextNode(` "${e.target.value}"`));
                        customOption.dataset.value = String(e.target.value ?? '');
                        customOption.classList.remove('hidden');
                        hasVisible = true;
                    } else if (customOption) {
                        customOption.remove();
                    }
                } else if (customOption) {
                    customOption.remove();
                }
            }
            
            let emptyMsg = this.optionsContainer.querySelector('.custom-select-empty');
            if (!hasVisible) {
                if (!emptyMsg) {
                    emptyMsg = document.createElement('div');
                    emptyMsg.className = 'custom-select-empty';
                    emptyMsg.textContent = 'No matches found';
                    this.optionsContainer.appendChild(emptyMsg);
                }
            } else if (emptyMsg) {
                emptyMsg.remove();
            }
        });
        
        // Select option
        this.optionsContainer.addEventListener('click', (e) => {
            const option = e.target.closest('.custom-select-option');
            if (option) {
                const value = option.dataset.value;
                this.setValue(value);
                this.closeDropdown();
                if (this.onChange) {
                    this.onChange(value);
                }
            }
        });

        // Handle Enter key in search input
        this.searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const customOption = this.optionsContainer.querySelector('.custom-select-option-custom');
                const visibleOptions = Array.from(this.optionsContainer.querySelectorAll('.custom-select-option:not(.hidden):not(.custom-select-option-custom)'));
                
                if (visibleOptions.length === 1) {
                    // Select the single visible option
                    const value = visibleOptions[0].dataset.value;
                    this.setValue(value);
                    this.closeDropdown();
                    if (this.onChange) this.onChange(value);
                } else if (customOption && !customOption.classList.contains('hidden')) {
                    // Select custom option
                    const value = customOption.dataset.value;
                    this.setValue(value);
                    this.closeDropdown();
                    if (this.onChange) this.onChange(value);
                }
            }
        });
    }
    
    toggleDropdown() {
        const isOpen = this.dropdown.classList.contains('open');
        if (isOpen) {
            this.closeDropdown();
        } else {
            this.openDropdown();
        }
    }
    
    openDropdown() {
        // Position dropdown using fixed positioning to escape overflow clipping
        const triggerRect = this.trigger.getBoundingClientRect();
        this.dropdown.style.position = 'fixed';
        this.dropdown.style.top = `${triggerRect.bottom + 4}px`;
        this.dropdown.style.left = `${triggerRect.left}px`;
        this.dropdown.style.width = `${triggerRect.width}px`;
        
        this.dropdown.classList.add('open');
        this.trigger.classList.add('active');
        this.searchInput.value = '';
        this.searchInput.focus();
        
        // Reset filter
        const options = this.optionsContainer.querySelectorAll('.custom-select-option');
        options.forEach(opt => opt.classList.remove('hidden'));
        const emptyMsg = this.optionsContainer.querySelector('.custom-select-empty');
        if (emptyMsg && this.options.length > 0) emptyMsg.remove();
    }
    
    closeDropdown() {
        this.dropdown.classList.remove('open');
        this.trigger.classList.remove('active');
    }
}
