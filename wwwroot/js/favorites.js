/**
 * Favorites and Playlists Management Module
 */
window.favorites = {
    currentFavorites: [],
    currentPlaylists: [],
    currentRadioStations: [],
    selectedSpeaker: null,
    isLoadingFavorites: false,
    isLoadingPlaylists: false,
    isLoadingRadio: false,
    speakerDropdown: null,

    /**
     * Initializes the favorites module
     */
    async init() {
        this.speakerDropdown = new SearchableDropdown('favorites-speaker-select');
        this.setupEventListeners();
    },

    /**
     * Sets up event listeners for favorites tab
     */
    setupEventListeners() {
        // Sub-tab navigation within favorites
        document.querySelectorAll('.favorites-sub-tab').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const subTab = e.target.dataset.subtab;
                this.switchSubTab(subTab);
            });
        });
    },

    /**
     * Switches between favorites sub-tabs
     * @param {string} subTab - The sub-tab to switch to
     */
    switchSubTab(subTab) {
        document.querySelectorAll('.favorites-sub-tab').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.subtab === subTab);
        });
        document.querySelectorAll('.favorites-sub-content').forEach(content => {
            content.classList.toggle('active', content.id === `${subTab}-content`);
        });

        // Load content for the selected sub-tab
        switch (subTab) {
            case 'sonos-favorites':
                this.loadFavorites();
                break;
            case 'playlists':
                this.loadPlaylists();
                break;
            case 'radio':
                this.loadRadioStations();
                break;
        }
    },

    /**
     * Loads Sonos favorites
     */
    async loadFavorites() {
        // Prevent concurrent loads
        if (this.isLoadingFavorites) {
            return;
        }
        this.isLoadingFavorites = true;

        const container = document.getElementById('favorites-grid');
        container.innerHTML = '<div class="loading-message"><div class="spinner"></div><p>Loading favorites...</p></div>';

        try {
            const response = await api.getFavorites();
            console.debug('Favorites API response:', response);
            
            // Check if we got a valid response with the expected structure
            if (!response || typeof response !== 'object') {
                throw new Error('Invalid response from server');
            }
            
            this.currentFavorites = response.favorites || [];

            // If empty but exitCode indicates success, might be a timing issue - retry once
            if (this.currentFavorites.length === 0 && response.exitCode === 0 && response.raw && response.raw.trim()) {
                console.debug('Got empty favorites but raw data exists, retrying...');
                await new Promise(resolve => setTimeout(resolve, 500));
                const retryResponse = await api.getFavorites();
                this.currentFavorites = retryResponse.favorites || [];
            }

            if (this.currentFavorites.length === 0) {
                container.innerHTML = `
                    <div class="info-message">
                        <p>No favorites found. Add favorites using the Sonos app.</p>
                    </div>
                `;
                return;
            }

            container.innerHTML = '';
            this.currentFavorites.forEach(fav => {
                const card = this.createFavoriteCard(fav);
                container.appendChild(card);
            });
        } catch (error) {
            console.error('Failed to load favorites:', error);
            container.innerHTML = `
                <div class="info-message error">
                    <p class="js-favorites-load-error"></p>
                </div>
            `;
            const errEl = container.querySelector('.js-favorites-load-error');
            if (errEl) {
                errEl.textContent = `Error loading favorites: ${error?.message ?? String(error)}`;
            }
        } finally {
            this.isLoadingFavorites = false;
        }
    },

    /**
     * Creates a favorite card element
     * @param {Object} favorite - The favorite object
     * @returns {HTMLElement}
     */
    createFavoriteCard(favorite) {
        const card = document.createElement('div');
        card.className = 'favorite-card';
        card.dataset.number = favorite.number;
        card.dataset.name = favorite.name;

        card.innerHTML = `
            <div class="favorite-icon">♫</div>
            <div class="favorite-info">
                <div class="favorite-name"></div>
                <div class="favorite-number"></div>
            </div>
            <button class="btn btn-primary btn-sm favorite-play-btn" title="Play on selected speaker">
                ▶
            </button>
        `;

        const nameEl = card.querySelector('.favorite-name');
        if (nameEl) nameEl.textContent = toDisplayString(favorite.name);
        const numberEl = card.querySelector('.favorite-number');
        if (numberEl) numberEl.textContent = `#${toDisplayString(favorite.number)}`;

        card.querySelector('.favorite-play-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            this.playFavorite(favorite);
        });

        card.addEventListener('click', () => {
            this.showFavoriteOptions(favorite);
        });

        return card;
    },

    /**
     * Plays a favorite on the selected speaker
     * @param {Object} favorite - The favorite to play
     */
    async playFavorite(favorite) {
        const speaker = this.getSelectedSpeaker();
        if (!speaker) {
            showToast('Please select a speaker first', 'warning');
            return;
        }

        try {
            const response = await api.playFavoriteByNumber(speaker, favorite.number);
            
            // Check if soco-cli returned an error
            if (response.exitCode !== 0 || response.errorMsg) {
                const errorMsg = response.errorMsg || 'Unknown error';
                // Provide user-friendly error messages for common issues
                if (errorMsg.includes('UPnP Error 714') || errorMsg.includes('UPnP Error 800')) {
                    showToast(`Cannot play "${favorite.name}" - this favorite type is not supported via the API`, 'error');
                } else {
                    showToast(`Failed to play: ${errorMsg}`, 'error');
                }
                return;
            }
            
            showToast(`Playing "${favorite.name}" on ${speaker}`, 'success');
        } catch (error) {
            showToast(`Failed to play favorite: ${error.message}`, 'error');
        }
    },

    /**
     * Shows options for a favorite (add to queue, etc.)
     * @param {Object} favorite - The favorite
     */
    showFavoriteOptions(favorite) {
        const speaker = this.getSelectedSpeaker();
        
        const modal = document.createElement('div');
        modal.className = 'modal active';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 400px;">
                <div class="modal-header">
                    <h3 class="js-favorite-title"></h3>
                    <button class="modal-close">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="favorite-actions-list">
                        <button class="btn btn-primary btn-block" id="fav-action-play">
                            ▶ Play Now
                        </button>
                        <button class="btn btn-secondary btn-block" id="fav-action-queue">
                            + Add to Queue
                        </button>
                    </div>
                    ${!speaker ? '<p class="form-hint" style="margin-top: 16px;">Select a speaker from the dropdown above to play.</p>' : ''}
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const titleEl = modal.querySelector('.js-favorite-title');
        if (titleEl) titleEl.textContent = toDisplayString(favorite.name);

        modal.querySelector('.modal-close').addEventListener('click', () => modal.remove());
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });

        modal.querySelector('#fav-action-play').addEventListener('click', async () => {
            modal.remove();
            await this.playFavorite(favorite);
        });

        modal.querySelector('#fav-action-queue').addEventListener('click', async () => {
            modal.remove();
            await this.addFavoriteToQueue(favorite);
        });
    },

    /**
     * Adds a favorite to the queue
     * @param {Object} favorite - The favorite to add
     */
    async addFavoriteToQueue(favorite) {
        const speaker = this.getSelectedSpeaker();
        if (!speaker) {
            showToast('Please select a speaker first', 'warning');
            return;
        }

        try {
            await api.addFavoriteToQueue(speaker, favorite.name);
            showToast(`Added "${favorite.name}" to queue`, 'success');
        } catch (error) {
            showToast(`Failed to add to queue: ${error.message}`, 'error');
        }
    },

    /**
     * Loads Sonos playlists
     */
    async loadPlaylists() {
        // Prevent concurrent loads
        if (this.isLoadingPlaylists) {
            return;
        }
        this.isLoadingPlaylists = true;

        const container = document.getElementById('playlists-grid');
        container.innerHTML = '<div class="loading-message"><div class="spinner"></div><p>Loading playlists...</p></div>';

        try {
            const response = await api.getPlaylists();
            console.debug('Playlists API response:', response);
            
            // Check if we got a valid response with the expected structure
            if (!response || typeof response !== 'object') {
                throw new Error('Invalid response from server');
            }
            
            this.currentPlaylists = response.playlists || [];

            // If empty but exitCode indicates success, might be a timing issue - retry once
            if (this.currentPlaylists.length === 0 && response.exitCode === 0 && response.raw && response.raw.trim()) {
                console.debug('Got empty playlists but raw data exists, retrying...');
                await new Promise(resolve => setTimeout(resolve, 500));
                const retryResponse = await api.getPlaylists();
                this.currentPlaylists = retryResponse.playlists || [];
            }

            if (this.currentPlaylists.length === 0) {
                container.innerHTML = `
                    <div class="info-message">
                        <p>No playlists found. Create playlists using the Sonos app.</p>
                    </div>
                `;
                return;
            }

            container.innerHTML = '';
            this.currentPlaylists.forEach(playlist => {
                const card = this.createPlaylistCard(playlist);
                container.appendChild(card);
            });
        } catch (error) {
            console.error('Failed to load playlists:', error);
            container.innerHTML = `
                <div class="info-message error">
                    <p class="js-playlists-load-error"></p>
                </div>
            `;
            const errEl = container.querySelector('.js-playlists-load-error');
            if (errEl) {
                errEl.textContent = `Error loading playlists: ${error?.message ?? String(error)}`;
            }
        } finally {
            this.isLoadingPlaylists = false;
        }
    },

    /**
     * Creates a playlist card element
     * @param {Object} playlist - The playlist object
     * @returns {HTMLElement}
     */
    createPlaylistCard(playlist) {
        const card = document.createElement('div');
        card.className = 'playlist-card';
        card.dataset.name = playlist.name;

        card.innerHTML = `
            <div class="playlist-icon">☰</div>
            <div class="playlist-info">
                <div class="playlist-name"></div>
            </div>
            <div class="playlist-actions">
                <button class="btn btn-icon btn-sm" title="Add to queue" data-action="queue">+</button>
                <button class="btn btn-icon btn-sm" title="View tracks" data-action="view">⋯</button>
            </div>
        `;

        const nameEl = card.querySelector('.playlist-name');
        if (nameEl) nameEl.textContent = toDisplayString(playlist.name);

        card.querySelector('[data-action="queue"]').addEventListener('click', (e) => {
            e.stopPropagation();
            this.addPlaylistToQueue(playlist);
        });

        card.querySelector('[data-action="view"]').addEventListener('click', (e) => {
            e.stopPropagation();
            this.viewPlaylistTracks(playlist);
        });

        return card;
    },

    /**
     * Adds a playlist to the queue
     * @param {Object} playlist - The playlist to add
     */
    async addPlaylistToQueue(playlist) {
        const speaker = this.getSelectedSpeaker();
        if (!speaker) {
            showToast('Please select a speaker first', 'warning');
            return;
        }

        try {
            await api.addPlaylistToQueue(speaker, playlist.name);
            showToast(`Added "${playlist.name}" to queue`, 'success');
            
            // Ask if user wants to play the queue
            this.showPlayQueuePrompt(speaker, playlist.name);
        } catch (error) {
            showToast(`Failed to add playlist: ${error.message}`, 'error');
        }
    },

    /**
     * Shows a prompt to play the queue after adding content
     * @param {string} speaker - The speaker name
     * @param {string} contentName - Name of the content that was added
     */
    showPlayQueuePrompt(speaker, contentName) {
        const modal = document.createElement('div');
        modal.className = 'modal active';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 400px;">
                <div class="modal-header">
                    <h3>Play Queue?</h3>
                    <button class="modal-close">&times;</button>
                </div>
                <div class="modal-body">
                    <p>"${contentName}" has been added to the queue.</p>
                    <p>Would you like to start playing?</p>
                    <div class="modal-actions" style="margin-top: 16px; display: flex; gap: 8px;">
                        <button class="btn btn-primary" id="play-queue-btn">▶ Play Now</button>
                        <button class="btn btn-secondary" id="dismiss-btn">Not Now</button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const closeModal = () => modal.remove();

        modal.querySelector('.modal-close').addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });

        modal.querySelector('#dismiss-btn').addEventListener('click', closeModal);

        modal.querySelector('#play-queue-btn').addEventListener('click', async () => {
            closeModal();
            try {
                await api.playQueue(speaker);
                showToast(`Playing queue on ${speaker}`, 'success');
            } catch (error) {
                showToast(`Failed to play queue: ${error.message}`, 'error');
            }
        });
    },

    /**
     * Views tracks in a playlist
     * @param {Object} playlist - The playlist to view
     */
    async viewPlaylistTracks(playlist) {
        const modal = document.createElement('div');
        modal.className = 'modal active';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3 class="js-playlist-title"></h3>
                    <button class="modal-close">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="loading-message"><div class="spinner"></div><p>Loading tracks...</p></div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const titleEl = modal.querySelector('.js-playlist-title');
        if (titleEl) titleEl.textContent = toDisplayString(playlist.name);

        modal.querySelector('.modal-close').addEventListener('click', () => modal.remove());
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });

        try {
            const response = await api.getPlaylistTracks(playlist.name);
            const tracks = response.tracks || [];

            const body = modal.querySelector('.modal-body');
            if (tracks.length === 0) {
                body.innerHTML = '<p>No tracks in this playlist.</p>';
            } else {
                body.innerHTML = '<div class="playlist-tracks-list"></div>';
                const list = body.querySelector('.playlist-tracks-list');
                for (const track of tracks) {
                    const row = document.createElement('div');
                    row.className = 'playlist-track';

                    const num = document.createElement('span');
                    num.className = 'track-number';
                    num.textContent = toDisplayString(track.number);

                    const name = document.createElement('span');
                    name.className = 'track-name';
                    name.textContent = toDisplayString(track.name);

                    row.appendChild(num);
                    row.appendChild(name);
                    list.appendChild(row);
                }
            }
        } catch (error) {
            const body = modal.querySelector('.modal-body');
            if (body) {
                body.innerHTML = '<p class="error js-playlist-tracks-error"></p>';
                const errEl = body.querySelector('.js-playlist-tracks-error');
                if (errEl) {
                    errEl.textContent = `Failed to load tracks: ${error?.message ?? String(error)}`;
                }
            }
        }
    },

    /**
     * Loads TuneIn radio stations
     */
    async loadRadioStations() {
        // Prevent concurrent loads
        if (this.isLoadingRadio) {
            return;
        }
        this.isLoadingRadio = true;

        const container = document.getElementById('radio-grid');
        container.innerHTML = '<div class="loading-message"><div class="spinner"></div><p>Loading radio stations...</p></div>';

        try {
            const response = await api.getRadioStations();
            console.debug('Radio stations API response:', response);
            
            // Check if we got a valid response with the expected structure
            if (!response || typeof response !== 'object') {
                throw new Error('Invalid response from server');
            }
            
            this.currentRadioStations = response.stations || [];

            // If empty but exitCode indicates success, might be a timing issue - retry once
            if (this.currentRadioStations.length === 0 && response.exitCode === 0 && response.raw && response.raw.trim()) {
                console.debug('Got empty radio stations but raw data exists, retrying...');
                await new Promise(resolve => setTimeout(resolve, 500));
                const retryResponse = await api.getRadioStations();
                this.currentRadioStations = retryResponse.stations || [];
            }

            if (this.currentRadioStations.length === 0) {
                container.innerHTML = `
                    <div class="info-message">
                        <p>No radio stations found. Add stations to "My Radio Stations" in TuneIn.</p>
                    </div>
                `;
                return;
            }

            container.innerHTML = '';
            this.currentRadioStations.forEach(station => {
                const card = this.createRadioCard(station);
                container.appendChild(card);
            });
        } catch (error) {
            console.error('Failed to load radio stations:', error);
            container.innerHTML = `
                <div class="info-message error">
                    <p class="js-radio-load-error"></p>
                </div>
            `;
            const errEl = container.querySelector('.js-radio-load-error');
            if (errEl) {
                errEl.textContent = `Error loading radio stations: ${error?.message ?? String(error)}`;
            }
        } finally {
            this.isLoadingRadio = false;
        }
    },

    /**
     * Creates a radio station card element
     * @param {Object} station - The station object
     * @returns {HTMLElement}
     */
    createRadioCard(station) {
        const card = document.createElement('div');
        card.className = 'radio-card';
        card.dataset.name = station.name;

        card.innerHTML = `
            <div class="radio-icon">📻</div>
            <div class="radio-info">
                <div class="radio-name"></div>
            </div>
            <button class="btn btn-primary btn-sm radio-play-btn" title="Play">
                ▶
            </button>
        `;

        const nameEl = card.querySelector('.radio-name');
        if (nameEl) nameEl.textContent = toDisplayString(station.name);

        card.querySelector('.radio-play-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            this.playRadioStation(station);
        });

        return card;
    },

    /**
     * Plays a radio station
     * @param {Object} station - The station to play
     */
    async playRadioStation(station) {
        const speaker = this.getSelectedSpeaker();
        if (!speaker) {
            showToast('Please select a speaker first', 'warning');
            return;
        }

        try {
            await api.playRadioStation(speaker, station.name);
            showToast(`Playing "${station.name}" on ${speaker}`, 'success');
        } catch (error) {
            showToast(`Failed to play station: ${error.message}`, 'error');
        }
    },

    /**
     * Gets the currently selected speaker from dropdown
     * @returns {string|null}
     */
    getSelectedSpeaker() {
        if (this.speakerDropdown) {
            const value = this.speakerDropdown.getValue();
            if (value) return value;
        }
        return speakers.currentSpeakers.length > 0 ? speakers.currentSpeakers[0] : null;
    },

    /**
     * Updates the speaker dropdown with available speakers
     */
    updateSpeakerSelector() {
        if (!this.speakerDropdown) return;

        const options = speakers.currentSpeakers.map(name => ({
            value: name,
            label: name
        }));
        
        this.speakerDropdown.setOptions(options);

        // Auto-select first speaker if none selected
        const currentValue = this.speakerDropdown.getValue();
        if (!currentValue && speakers.currentSpeakers.length > 0) {
            this.speakerDropdown.setValue(speakers.currentSpeakers[0]);
        }
    }
};
