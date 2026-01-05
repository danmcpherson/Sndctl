/**
 * Macro Management Module
 */

/**
 * Copies text to clipboard with fallback for non-secure contexts
 * @param {string} text - The text to copy to clipboard
 * @returns {Promise<void>}
 */
async function copyToClipboard(text) {
    // Try the modern Clipboard API first (requires secure context)
    if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return;
    }
    
    // Fallback for non-secure contexts (HTTP)
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-9999px';
    textArea.style.top = '-9999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    
    try {
        const successful = document.execCommand('copy');
        if (!successful) {
            throw new Error('Copy command failed');
        }
    } finally {
        document.body.removeChild(textArea);
    }
}

window.macros = {
    currentMacros: [],
    editingMacro: null,
    originalMacroName: null, // Track original name for rename detection
    actions: [], // Current actions in the builder
    dropdowns: {}, // Store dropdown instances

    // Available commands organized by category with their argument configurations
    commandCategories: {
        'Playback': {
            play: { label: 'Play', args: [] },
            pause: { label: 'Pause', args: [] },
            stop: { label: 'Stop', args: [] },
            pauseplay: { label: 'Play/Pause Toggle', args: [] },
            next: { label: 'Next Track', args: [] },
            previous: { label: 'Previous Track', args: [] },
            seek: { label: 'Seek To', args: [{ name: 'time', type: 'text', placeholder: '1:30 or 90s' }] },
            seek_forward: { label: 'Seek Forward', args: [{ name: 'time', type: 'text', placeholder: '30s or 1m' }] },
            seek_back: { label: 'Seek Back', args: [{ name: 'time', type: 'text', placeholder: '30s or 1m' }] },
        },
        'Volume': {
            volume: { label: 'Set Volume', args: [{ name: 'level', type: 'number', min: 0, max: 100, placeholder: '0-100' }] },
            relative_volume: { label: 'Adjust Volume (+/-)', args: [{ name: 'change', type: 'text', placeholder: '+10 or -10' }] },
            ramp: { label: 'Ramp to Volume', args: [{ name: 'target', type: 'number', min: 0, max: 100, placeholder: '0-100' }] },
            mute: { label: 'Mute', args: [{ name: 'state', type: 'select', options: ['on', 'off'] }] },
            group_volume: { label: 'Group Volume', args: [{ name: 'level', type: 'number', min: 0, max: 100, placeholder: '0-100' }] },
            group_relative_volume: { label: 'Group Volume (+/-)', args: [{ name: 'change', type: 'text', placeholder: '+10 or -10' }] },
            group_mute: { label: 'Group Mute', args: [{ name: 'state', type: 'select', options: ['on', 'off'] }] },
            group_volume_equalize: { label: 'Equalize Group Volume', args: [{ name: 'level', type: 'number', min: 0, max: 100, placeholder: '0-100' }] },
        },
        'EQ Settings': {
            bass: { label: 'Bass', args: [{ name: 'level', type: 'number', min: -10, max: 10, placeholder: '-10 to 10' }] },
            treble: { label: 'Treble', args: [{ name: 'level', type: 'number', min: -10, max: 10, placeholder: '-10 to 10' }] },
            balance: { label: 'Balance', args: [{ name: 'level', type: 'number', min: -100, max: 100, placeholder: '-100 to 100' }] },
            loudness: { label: 'Loudness', args: [{ name: 'state', type: 'select', options: ['on', 'off'] }] },
            night_mode: { label: 'Night Mode', args: [{ name: 'state', type: 'select', options: ['on', 'off'] }] },
            dialog_mode: { label: 'Dialog Mode', args: [{ name: 'state', type: 'select', options: ['on', 'off'] }] },
        },
        'Play Content': {
            play_favourite: { label: 'Play Favorite', args: [{ name: 'name', type: 'text', placeholder: 'Favorite name', quoted: true }] },
            play_favourite_number: { label: 'Play Favorite #', args: [{ name: 'number', type: 'number', placeholder: 'Favorite number' }] },
            play_uri: { label: 'Play URI/URL', args: [{ name: 'uri', type: 'text', placeholder: 'URI or URL' }, { name: 'title', type: 'text', placeholder: 'Title (optional)', optional: true }] },
            play_favourite_radio_station: { label: 'Play Radio Station', args: [{ name: 'name', type: 'text', placeholder: 'Station name', quoted: true }] },
            cue_favourite: { label: 'Cue Favorite (Silent)', args: [{ name: 'name', type: 'text', placeholder: 'Favorite name', quoted: true }] },
            sharelink: { label: 'Play Share Link', args: [{ name: 'url', type: 'text', placeholder: 'Spotify/Apple Music URL' }] },
            line_in: { label: 'Line In', args: [{ name: 'state', type: 'select', options: ['on', 'off'] }] },
            switch_to_tv: { label: 'Switch to TV', args: [] },
        },
        'Queue': {
            play_from_queue: { label: 'Play from Queue', args: [{ name: 'track', type: 'text', placeholder: 'Track #', default: '1', optional: true }] },
            clear_queue: { label: 'Clear Queue', args: [] },
            add_favourite_to_queue: { label: 'Add Favorite to Queue', args: [{ name: 'name', type: 'text', placeholder: 'Favorite name', quoted: true }] },
            add_playlist_to_queue: { label: 'Add Playlist to Queue', args: [{ name: 'name', type: 'text', placeholder: 'Playlist name', quoted: true }] },
            add_uri_to_queue: { label: 'Add URI to Queue', args: [{ name: 'uri', type: 'text', placeholder: 'URI' }] },
            add_sharelink_to_queue: { label: 'Add Share Link to Queue', args: [{ name: 'url', type: 'text', placeholder: 'Spotify/Apple Music URL' }] },
            remove_from_queue: { label: 'Remove from Queue', args: [{ name: 'track', type: 'text', placeholder: '# or range (1-5)' }] },
            remove_current_track_from_queue: { label: 'Remove Current Track', args: [] },
        },
        'Play Mode': {
            shuffle: { label: 'Shuffle', args: [{ name: 'state', type: 'select', options: ['on', 'off'] }] },
            repeat: { label: 'Repeat', args: [{ name: 'mode', type: 'select', options: ['off', 'one', 'all'] }] },
            cross_fade: { label: 'Crossfade', args: [{ name: 'state', type: 'select', options: ['on', 'off'] }] },
            play_mode: { label: 'Play Mode', args: [{ name: 'mode', type: 'select', options: ['NORMAL', 'REPEAT_ONE', 'REPEAT_ALL', 'SHUFFLE', 'SHUFFLE_REPEAT_ONE', 'SHUFFLE_NOREPEAT'] }] },
        },
        'Groups': {
            group: { label: 'Join Group', args: [{ name: 'speaker', type: 'text', placeholder: 'Coordinator speaker', quoted: true }] },
            ungroup: { label: 'Leave Group', args: [] },
            party_mode: { label: 'Party Mode (Group All)', args: [] },
            ungroup_all: { label: 'Ungroup All', args: [] },
            transfer_playback: { label: 'Transfer Playback', args: [{ name: 'speaker', type: 'text', placeholder: 'Target speaker', quoted: true }] },
        },
        'Sleep & Timers': {
            sleep: { label: 'Sleep Timer', args: [{ name: 'duration', type: 'text', placeholder: '15m, 1h, or off' }] },
            sleep_timer: { label: 'Sleep Timer', args: [{ name: 'duration', type: 'text', placeholder: '15m, 4h, or off' }] },
            sleep_at: { label: 'Sleep At Time', args: [{ name: 'time', type: 'text', placeholder: 'HH:MM (24hr)' }] },
        },
        'Wait & Control': {
            wait: { label: 'Wait/Delay', args: [{ name: 'duration', type: 'text', placeholder: '10s, 5m, 1h' }] },
            wait_until: { label: 'Wait Until Time', args: [{ name: 'time', type: 'text', placeholder: 'HH:MM (24hr)' }] },
            wait_start: { label: 'Wait for Playback Start', args: [] },
            wait_stop: { label: 'Wait for Playback Stop', args: [] },
            wait_end_track: { label: 'Wait for Track End', args: [] },
        },
        'Speaker Settings': {
            status_light: { label: 'Status Light', args: [{ name: 'state', type: 'select', options: ['on', 'off'] }] },
            buttons: { label: 'Buttons Enabled', args: [{ name: 'state', type: 'select', options: ['on', 'off'] }] },
        },
        'System': {
            pause_all: { label: 'Pause All Speakers', args: [] },
            stop_all: { label: 'Stop All Speakers', args: [] },
        },
    },

    // Flat commands map for quick lookup
    commands: {},

    /**
     * Loads macros file info and displays path
     */
    async loadFileInfo() {
        try {
            const response = await fetch(`${api.baseUrl}/api/macro/info`);
            if (response.ok) {
                const info = await response.json();
                const filePathSpan = document.getElementById('macros-file-path');
                if (filePathSpan && info.filePath) {
                    filePathSpan.textContent = info.filePath;
                }
            }
        } catch (error) {
            console.error('Failed to load macros file info:', error);
        }
    },

    /**
     * Toggles file info tooltip
     */
    toggleFileInfo() {
        const tooltip = document.getElementById('macros-file-tooltip');
        if (tooltip) {
            const isVisible = tooltip.style.display !== 'none';
            tooltip.style.display = isVisible ? 'none' : 'block';
        }
    },

    /**
     * Copies file path to clipboard
     */
    async copyFilePath() {
        const filePathSpan = document.getElementById('macros-file-path');
        if (filePathSpan && filePathSpan.textContent) {
            try {
                await copyToClipboard(filePathSpan.textContent);
                showToast('File path copied to clipboard', 'success');
            } catch (error) {
                showToast('Failed to copy file path', 'error');
            }
        }
    },

    /**
     * Initialize commands from categories
     */
    initCommands() {
        this.commands = {};
        for (const [category, cmds] of Object.entries(this.commandCategories)) {
            for (const [key, cmd] of Object.entries(cmds)) {
                this.commands[key] = { ...cmd, category };
            }
        }
    },

    /**
     * Loads all macros
     */
    async load() {
        this.initCommands();
        const list = document.getElementById('macros-list');
        list.innerHTML = '<div class="loading-message"><div class="spinner"></div><p>Loading macros...</p></div>';

        try {
            // Load macros file info
            this.loadFileInfo();
            
            const macroList = await api.getMacros();
            this.currentMacros = macroList;

            if (macroList.length === 0) {
                list.innerHTML = `
                    <div class="info-message">
                        <p>No macros yet. Create your first macro to automate your Sonos system!</p>
                    </div>
                `;
                return;
            }

            list.innerHTML = '';
            macroList.forEach(macro => {
                const card = createMacroCard(macro);
                list.appendChild(card);
            });
        } catch (error) {
            console.error('Failed to load macros:', error);
            list.innerHTML = `
                <div class="info-message">
                    <p class="js-macros-load-error"></p>
                </div>
            `;
            const errEl = list.querySelector('.js-macros-load-error');
            if (errEl) {
                errEl.textContent = `Error loading macros: ${error?.message ?? String(error)}`;
            }
        }
    },

    /**
     * Opens the macro editor for creating a new macro
     */
    create() {
        this.initCommands();
        this.editingMacro = null;
        this.originalMacroName = null; // No original name for new macros
        this.actions = [];
        document.getElementById('modal-title').textContent = 'Create Macro';
        document.getElementById('macro-name').value = '';
        document.getElementById('macro-description').value = '';
        document.getElementById('macro-category').value = '';
        document.getElementById('macro-definition').value = '';
        document.getElementById('macro-name').disabled = false;
        this.renderActions();
        this.addAction(); // Start with one empty action
        toggleMacroModal(true);
    },

    /**
     * Opens the macro editor for editing an existing macro
     */
    async edit(macroName) {
        this.initCommands();
        try {
            const macro = await api.getMacro(macroName);
            this.editingMacro = macro;
            this.originalMacroName = macro.name; // Store original name for rename detection

            document.getElementById('modal-title').textContent = 'Edit Macro';
            document.getElementById('macro-name').value = macro.name;
            document.getElementById('macro-description').value = macro.description || '';
            document.getElementById('macro-category').value = macro.category || '';
            document.getElementById('macro-definition').value = macro.definition;
            document.getElementById('macro-name').disabled = false;

            // Parse existing definition into actions
            this.actions = this.parseDefinition(macro.definition);
            this.renderActions();

            toggleMacroModal(true);
        } catch (error) {
            showToast('Failed to load macro', 'error');
        }
    },

    /**
     * Parses a macro definition string into action objects
     */
    parseDefinition(definition) {
        if (!definition) return [];
        
        const actions = [];
        // Split only on colon delimiters surrounded by whitespace to avoid breaking URLs (e.g., https://)
        const parts = definition
            .split(/\s+:\s+/)
            .map(p => p.trim())
            .filter(p => p);
        
        for (const part of parts) {
            // Match: speaker command [args...]
            // Handle quoted arguments like "Morning Mix"
            const tokens = [];
            let current = '';
            let inQuotes = false;
            
            for (let i = 0; i < part.length; i++) {
                const char = part[i];
                if (char === '"') {
                    inQuotes = !inQuotes;
                } else if (char === ' ' && !inQuotes) {
                    if (current) {
                        tokens.push(current);
                        current = '';
                    }
                } else {
                    current += char;
                }
            }
            if (current) tokens.push(current);
            
            if (tokens.length >= 2) {
                const speaker = tokens[0];
                const command = tokens[1];
                const args = tokens.slice(2);
                
                actions.push({ speaker, command, args });
            } else if (tokens.length === 1) {
                // Commands without speaker (like 'wait')
                const command = tokens[0];
                actions.push({ speaker: '', command, args: [] });
            }
        }
        
        return actions;
    },

    /**
     * Syncs from the raw definition textarea back into the visual builder
     */
    syncFromDefinition() {
        const definition = document.getElementById('macro-definition').value;
        try {
            this.actions = this.parseDefinition(definition);
            this.renderActions();
        } catch (err) {
            console.error('Failed to parse macro definition:', err);
            showToast('Invalid macro definition. Please check formatting.', 'error');
        }
    },

    /**
     * Builds definition string from actions array
     */
    buildDefinition() {
        return this.actions
            .filter(a => a.command) // Only require command, speaker can be empty for wait/loop
            .map(action => {
                // Quote speaker name if it contains spaces
                let speakerPart = action.speaker;
                if (speakerPart && speakerPart.includes(' ') && !speakerPart.startsWith('"')) {
                    speakerPart = `"${speakerPart}"`;
                }
                
                let def = speakerPart ? `${speakerPart} ${action.command}` : action.command;
                if (action.args && action.args.length > 0) {
                    const cmdConfig = this.commands[action.command];
                    const formattedArgs = action.args.map((arg, i) => {
                        if (!arg) return '';
                        const argNeedsQuotes = /\s/.test(arg) && !arg.startsWith('"');
                        const shouldQuote = (cmdConfig && cmdConfig.args[i] && cmdConfig.args[i].quoted) || argNeedsQuotes;
                        return shouldQuote ? `"${arg}"` : arg;
                    }).filter(a => a);
                    if (formattedArgs.length > 0) {
                        def += ' ' + formattedArgs.join(' ');
                    }
                }
                return def;
            })
            .join(' : ');
    },

    /**
     * Adds a new action row
     */
    addAction() {
        this.actions.push({ speaker: '', command: '', args: [] });
        this.renderActions();
    },

    /**
     * Removes an action row
     */
    removeAction(index) {
        this.actions.splice(index, 1);
        this.renderActions();
        this.syncDefinition();
    },

    /**
     * Moves an action up in the list
     */
    moveActionUp(index) {
        if (index <= 0) return;
        const temp = this.actions[index];
        this.actions[index] = this.actions[index - 1];
        this.actions[index - 1] = temp;
        this.renderActions();
        this.syncDefinition();
    },

    /**
     * Moves an action down in the list
     */
    moveActionDown(index) {
        if (index >= this.actions.length - 1) return;
        const temp = this.actions[index];
        this.actions[index] = this.actions[index + 1];
        this.actions[index + 1] = temp;
        this.renderActions();
        this.syncDefinition();
    },

    /**
     * Duplicates an action
     */
    duplicateAction(index) {
        const action = this.actions[index];
        const copy = { 
            speaker: action.speaker, 
            command: action.command, 
            args: [...(action.args || [])] 
        };
        this.actions.splice(index + 1, 0, copy);
        this.renderActions();
        this.syncDefinition();
    },

    /**
     * Updates an action and re-renders if command changed
     */
    updateAction(index, field, value) {
        if (!this.actions[index]) return;
        
        if (field === 'command') {
            this.actions[index].command = value;
            this.actions[index].args = []; // Reset args when command changes
            this.renderActions();
        } else if (field === 'speaker') {
            this.actions[index].speaker = value;
        } else if (field.startsWith('arg_')) {
            const argIndex = parseInt(field.split('_')[1]);
            if (!this.actions[index].args) this.actions[index].args = [];
            // Clean Apple Music URLs when pasting share links
            if (value && value.includes('music.apple.com')) {
                value = this.cleanShareLinks(value);
            }
            this.actions[index].args[argIndex] = value;
        }
        
        this.syncDefinition();
    },

    /**
     * Cleans share links by removing Apple Music query parameters
     * @param {string} definition - The macro definition
     * @returns {string} The cleaned definition
     */
    cleanShareLinks(definition) {
        if (!definition) return definition;
        
        // Remove ?i= parameter from Apple Music URLs (track-specific parameter)
        // Example: https://music.apple.com/au/album/...?i=123456 -> https://music.apple.com/au/album/...
        return definition.replace(
            /(https:\/\/music\.apple\.com\/[^\s:]+)\?i=[0-9]+/gi,
            '$1'
        );
    },

    /**
     * Syncs the visual builder to the raw definition textarea
     */
    syncDefinition() {
        const def = this.buildDefinition();
        document.getElementById('macro-definition').value = def;
    },

    /**
     * Gets commands that don't require a speaker
     */
    getNoSpeakerCommands() {
        return ['wait', 'wait_until', 'loop', 'loop_for', 'loop_until', 'loop_to_start'];
    },

    /**
     * Renders the action builder UI
     */
    renderActions() {
        const container = document.getElementById('macro-actions-builder');
        
        // Build datalist options for speakers (allows typing or selecting)
        const speakerDatalistOptions = [
            '<option value="%1">',
            '<option value="%2">',
            '<option value="%3">',
            '<option value="%4">',
            '<option value="%5">',
            '<option value="_all_">',
            ...speakers.currentSpeakers.map(s => `<option value="${s}">`)
        ].join('');

        // Build datalist options for arguments that might use parameters
        const argDatalistOptions = [
            '<option value="%1">',
            '<option value="%2">',
            '<option value="%3">',
            '<option value="%4">',
            '<option value="%5">',
        ].join('');
        
        const noSpeakerCommands = this.getNoSpeakerCommands();

        container.innerHTML = this.actions.map((action, index) => {
            const cmdConfig = this.commands[action.command];
            const needsSpeaker = !noSpeakerCommands.includes(action.command);
            
            // Build argument inputs
            let argsHtml = '';
            if (cmdConfig && cmdConfig.args.length > 0) {
                argsHtml = cmdConfig.args.map((argDef, argIndex) => {
                    const value = action.args[argIndex] || argDef.default || '';
                    const optionalClass = argDef.optional ? 'optional' : '';
                    const argListId = `arg-list-${index}-${argIndex}`;
                    
                    // Determine if this argument should include speaker options
                    const isSpeakerArg = argDef.name === 'speaker' || 
                                        (argDef.placeholder?.toLowerCase().includes('speaker') && 
                                         !argDef.placeholder?.toLowerCase().includes('url'));
                    
                    // Check if this is a URL/URI field (don't show datalist for these)
                    const isUrlField = argDef.name?.toLowerCase().includes('url') || 
                                      argDef.name?.toLowerCase().includes('uri') ||
                                      argDef.placeholder?.toLowerCase().includes('url') ||
                                      argDef.placeholder?.toLowerCase().includes('uri');
                    
                    const datalistContent = isSpeakerArg ? speakerDatalistOptions : argDatalistOptions;
                    
                    if (isUrlField) {
                        // URL fields don't need a datalist dropdown
                        return `
                            <input type="text" class="form-control action-arg ${optionalClass}" 
                                   value="${value}"
                                   placeholder="${argDef.placeholder || ''}"
                                   onchange="macros.updateAction(${index}, 'arg_${argIndex}', this.value)">
                        `;
                    } else {
                        // Use SearchableDropdown for everything else (select, speaker, number, text)
                        return `
                            <div id="action-arg-${index}-${argIndex}" class="action-arg-container ${optionalClass}"></div>
                        `;
                    }
                }).join('');
            }

            // Speaker input with datalist (allows typing or selecting, supports quoted names)
            const speakerInput = needsSpeaker || !action.command ? `
                <div id="action-speaker-${index}" class="action-speaker-container"></div>
            ` : '<span class="no-speaker-badge">No speaker needed</span>';

            return `
                <div class="action-row" data-index="${index}">
                    <div class="action-row-main">
                        <span class="action-number">${index + 1}</span>
                        ${speakerInput}
                        <div id="action-command-${index}" class="action-command-container"></div>
                        <div class="action-args">
                            ${argsHtml}
                        </div>
                    </div>
                    <div class="action-row-controls">
                        <button type="button" class="btn-icon-sm btn-move" 
                                onclick="macros.moveActionUp(${index})" 
                                title="Move up"
                                ${index === 0 ? 'disabled' : ''}>↑</button>
                        <button type="button" class="btn-icon-sm btn-move" 
                                onclick="macros.moveActionDown(${index})" 
                                title="Move down"
                                ${index >= this.actions.length - 1 ? 'disabled' : ''}>↓</button>
                        <button type="button" class="btn-icon-sm btn-duplicate" 
                                onclick="macros.duplicateAction(${index})" 
                                title="Duplicate">⧉</button>
                        <button type="button" class="btn-icon-sm btn-remove" 
                                onclick="macros.removeAction(${index})" 
                                title="Remove"
                                ${this.actions.length <= 1 ? 'disabled' : ''}>✕</button>
                    </div>
                </div>
            `;
        }).join('');

        this.initializeDropdowns();
    },

    /**
     * Initializes custom dropdowns for actions
     */
    initializeDropdowns() {
        this.dropdowns = {};

        // Flatten command options for the dropdown
        const commandOptions = [];
        for (const [category, cmds] of Object.entries(this.commandCategories)) {
            for (const [key, cmd] of Object.entries(cmds)) {
                commandOptions.push({
                    value: key,
                    label: `${category}: ${cmd.label}`
                });
            }
        }

        this.actions.forEach((action, index) => {
            // Initialize Command Dropdown
            const cmdDropdown = new SearchableDropdown(`action-command-${index}`, commandOptions);
            cmdDropdown.placeholder = 'Select action...';
            if (action.command) {
                cmdDropdown.setValue(action.command);
            }
            cmdDropdown.onChange = (value) => {
                this.updateAction(index, 'command', value);
            };
            this.dropdowns[`command-${index}`] = cmdDropdown;

            // Initialize Speaker Dropdown
            const needsSpeaker = !this.getNoSpeakerCommands().includes(action.command);
            if (needsSpeaker || !action.command) {
                const speakerOptions = [
                    { value: '%1', label: '%1 (Parameter 1)' },
                    { value: '%2', label: '%2 (Parameter 2)' },
                    { value: '%3', label: '%3 (Parameter 3)' },
                    { value: '_all_', label: 'All Speakers' },
                    ...speakers.currentSpeakers.map(s => ({ value: s, label: s }))
                ];
                
                const speakerDropdown = new SearchableDropdown(`action-speaker-${index}`, speakerOptions, { allowCustom: true });
                speakerDropdown.placeholder = 'Speaker...';
                if (action.speaker) {
                    speakerDropdown.setValue(action.speaker);
                }
                speakerDropdown.onChange = (value) => {
                    this.updateAction(index, 'speaker', value);
                };
                this.dropdowns[`speaker-${index}`] = speakerDropdown;
            }

            // Initialize Argument Dropdowns
            const cmdConfig = this.commands[action.command];
            if (cmdConfig && cmdConfig.args.length > 0) {
                cmdConfig.args.forEach((argDef, argIndex) => {
                    const isSpeakerArg = argDef.name === 'speaker' || 
                                        (argDef.placeholder?.toLowerCase().includes('speaker') && 
                                         !argDef.placeholder?.toLowerCase().includes('url'));

                    const isUrlField = argDef.name?.toLowerCase().includes('url') || 
                                      argDef.name?.toLowerCase().includes('uri') ||
                                      argDef.placeholder?.toLowerCase().includes('url') ||
                                      argDef.placeholder?.toLowerCase().includes('uri');

                    if (!isUrlField) {
                        let argOptions = [];
                        let allowCustom = true;
                        
                        if (argDef.type === 'select') {
                            argOptions = argDef.options.map(opt => ({
                                value: opt,
                                label: opt
                            }));
                            allowCustom = false;
                        } else if (isSpeakerArg) {
                            argOptions = [
                                { value: '%1', label: '%1 (Parameter 1)' },
                                { value: '%2', label: '%2 (Parameter 2)' },
                                { value: '%3', label: '%3 (Parameter 3)' },
                                ...speakers.currentSpeakers.map(s => ({ value: s, label: s }))
                            ];
                        } else {
                            // For number/text, provide standard parameter options
                            argOptions = [
                                { value: '%1', label: '%1 (Parameter 1)' },
                                { value: '%2', label: '%2 (Parameter 2)' },
                                { value: '%3', label: '%3 (Parameter 3)' },
                                { value: '%4', label: '%4 (Parameter 4)' },
                                { value: '%5', label: '%5 (Parameter 5)' }
                            ];
                        }
                        
                        const argDropdown = new SearchableDropdown(`action-arg-${index}-${argIndex}`, argOptions, { allowCustom });
                        argDropdown.placeholder = argDef.placeholder || argDef.name;
                        const value = action.args[argIndex];
                        if (value) {
                            argDropdown.setValue(value);
                        }
                        argDropdown.onChange = (value) => {
                            this.updateAction(index, `arg_${argIndex}`, value);
                        };
                        this.dropdowns[`arg-${index}-${argIndex}`] = argDropdown;
                    }
                });
            }
        });
    },

    /**
     * Saves a macro (create or update)
     */
    async save(event) {
        event.preventDefault();

        const name = document.getElementById('macro-name').value.trim();
        const description = document.getElementById('macro-description').value.trim();
        const category = document.getElementById('macro-category').value.trim();
        
        // Build definition from actions
        this.syncDefinition();
        let definition = document.getElementById('macro-definition').value.trim();
        
        // Clean share links (remove Apple Music query parameters)
        definition = this.cleanShareLinks(definition);

        if (!name || !definition) {
            showToast('Name and at least one action are required', 'warning');
            return;
        }

        // Validate macro name
        if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
            showToast('Macro name can only contain letters, numbers, underscores, and dashes', 'warning');
            return;
        }

        const macro = {
            name,
            description: description || null,
            category: category || null,
            definition,
            isFavorite: this.editingMacro?.isFavorite || false,
            parameters: this.detectParameters(definition)
        };

        try {
            // Check if we're renaming an existing macro
            const isRenaming = this.originalMacroName && 
                              this.originalMacroName !== name;
            
            // If renaming, delete the old macro first
            if (isRenaming) {
                await api.deleteMacro(this.originalMacroName);
            }
            
            await api.saveMacro(macro);
            
            const message = isRenaming 
                ? `Macro renamed from '${this.originalMacroName}' to '${name}'` 
                : `Macro '${name}' saved successfully`;
            showToast(message, 'success');
            toggleMacroModal(false);
            await this.load();
        } catch (error) {
            showToast('Failed to save macro: ' + error.message, 'error');
        }
    },

    /**
     * Deletes a macro
     */
    async delete(macroName) {
        const confirmed = await showConfirmModal(
            `Are you sure you want to delete the macro '${macroName}'?`,
            'Delete Macro',
            'Delete'
        );
        
        if (!confirmed) {
            return;
        }

        try {
            await api.deleteMacro(macroName);
            showToast(`Macro '${macroName}' deleted`, 'success');
            await this.load();
        } catch (error) {
            showToast('Failed to delete macro', 'error');
        }
    },

    /**
     * Duplicates a macro
     */
    async duplicate(macroName) {
        try {
            showToast(`Duplicating macro '${macroName}'...`, 'success');
            const duplicateMacro = await api.duplicateMacro(macroName);
            showToast(`Macro duplicated as '${duplicateMacro.name}'`, 'success');
            await this.load();
        } catch (error) {
            showToast('Failed to duplicate macro: ' + error.message, 'error');
        }
    },

    /**
     * Executes a macro
     */
    async execute(macroName, args = []) {
        try {
            // If macro has parameters, prompt for them
            const macro = this.currentMacros.find(m => m.name === macroName);
            if (macro && macro.parameters && macro.parameters.length > 0 && args.length === 0) {
                // For now, we'll execute without args - future enhancement: parameter input dialog
                showToast('Parameter input coming soon. Executing with defaults...', 'warning');
            }

            showToast(`Executing macro '${macroName}'...`, 'success');
            const result = await api.executeMacro(macroName, args);
            
            console.log('Macro execution result:', result);
            showToast(`Macro '${macroName}' executed successfully`, 'success');
        } catch (error) {
            showToast(`Failed to execute macro: ${error.message}`, 'error');
        }
    },

    /**
     * Copies the URL to trigger a macro execution to clipboard
     */
    async copyUrl(macroName) {
        try {
            const baseUrl = window.location.origin;
            const url = `${baseUrl}/api/macro/execute/${encodeURIComponent(macroName)}`;
            
            await copyToClipboard(url);
            showToast('Macro URL copied to clipboard', 'success');
        } catch (error) {
            showToast(`Failed to copy URL: ${error.message}`, 'error');
        }
    },

    /**
     * Exports macros to a downloadable file
     */
    async export() {
        try {
            await api.exportMacros();
            showToast('Macros exported successfully', 'success');
        } catch (error) {
            showToast(`Failed to export macros: ${error.message}`, 'error');
        }
    },

    /**
     * Imports macros from a file
     */
    async import(file, merge = false) {
        try {
            const result = await api.importMacros(file, merge);
            showToast(result.message, 'success');
            await this.load(); // Reload the macros list
        } catch (error) {
            showToast(`Failed to import macros: ${error.message}`, 'error');
        }
    },

    /**
     * Shows import options dialog
     */
    showImportDialog() {
        const fileInput = document.getElementById('import-file-input');
        fileInput.click();
    },

    /**
     * Handles file selection for import
     */
    async handleImportFile(file) {
        if (!file) return;
        
        // Store the file and show the modal
        this.pendingImportFile = file;
        
        // Update filename in modal
        document.getElementById('import-filename').textContent = file.name;
        
        // Show the modal
        const modal = document.getElementById('import-modal');
        modal.classList.add('active');
    },

    /**
     * Closes the import modal
     */
    closeImportModal() {
        const modal = document.getElementById('import-modal');
        modal.classList.remove('active');
        this.pendingImportFile = null;
    },

    /**
     * Handles import with merge option
     */
    async handleImportMerge() {
        if (this.pendingImportFile) {
            const file = this.pendingImportFile;
            this.closeImportModal();
            await this.import(file, true);
        }
    },

    /**
     * Handles import with replace option
     */
    async handleImportReplace() {
        if (this.pendingImportFile) {
            const file = this.pendingImportFile;
            this.closeImportModal();
            await this.import(file, false);
        }
    },

    /**
     * Detects parameters (%1-%12) in a macro definition
     */
    detectParameters(definition) {
        const params = [];
        const regex = /%(\d+)/g;
        let match;

        while ((match = regex.exec(definition)) !== null) {
            const position = parseInt(match[1]);
            if (!params.find(p => p.position === position)) {
                params.push({
                    position,
                    name: `Parameter ${position}`,
                    description: null,
                    type: 'string',
                    defaultValue: null
                });
            }
        }

        return params.sort((a, b) => a.position - b.position);
    }
};
