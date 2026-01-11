/**
 * API Client for communicating with the backend
 */
class ApiClient {
    constructor(baseUrl = '') {
        this.baseUrl = baseUrl;
    }

    /**
     * Makes an HTTP request
     */
    async request(url, options = {}) {
        const response = await fetch(`${this.baseUrl}${url}`, {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...options
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ message: 'Request failed' }));
            throw new Error(error.message || `HTTP ${response.status}`);
        }

        return response.json();
    }

    // Sonos Server Management
    async getServerStatus() {
        return this.request('/api/sonos/status');
    }

    async startServer() {
        return this.request('/api/sonos/start', { method: 'POST' });
    }

    async stopServer() {
        return this.request('/api/sonos/stop', { method: 'POST' });
    }

    // Speakers
    async getSpeakers() {
        return this.request('/api/sonos/speakers');
    }

    async rediscoverSpeakers() {
        return this.request('/api/sonos/rediscover', { method: 'POST' });
    }

    async getSpeakerInfo(speakerName) {
        return this.request(`/api/sonos/speakers/${encodeURIComponent(speakerName)}`);
    }

    // Playback Control
    async executeCommand(speaker, action, args = []) {
        return this.request('/api/sonos/command', {
            method: 'POST',
            body: JSON.stringify({ speaker, action, args })
        });
    }

    async playPause(speakerName) {
        return this.request(`/api/sonos/speakers/${encodeURIComponent(speakerName)}/playpause`, {
            method: 'POST'
        });
    }

    async next(speakerName) {
        return this.request(`/api/sonos/speakers/${encodeURIComponent(speakerName)}/next`, {
            method: 'POST'
        });
    }

    async previous(speakerName) {
        return this.request(`/api/sonos/speakers/${encodeURIComponent(speakerName)}/previous`, {
            method: 'POST'
        });
    }

    async setVolume(speakerName, volume) {
        return this.request(`/api/sonos/speakers/${encodeURIComponent(speakerName)}/volume/${volume}`, {
            method: 'POST'
        });
    }

    async getVolume(speakerName) {
        return this.request(`/api/sonos/speakers/${encodeURIComponent(speakerName)}/volume`);
    }

    async toggleMute(speakerName) {
        return this.request(`/api/sonos/speakers/${encodeURIComponent(speakerName)}/mute`, {
            method: 'POST'
        });
    }

    async getCurrentTrack(speakerName) {
        return this.request(`/api/sonos/speakers/${encodeURIComponent(speakerName)}/track`);
    }

    // ========================================
    // Phase 2: Enhanced Playback & Grouping
    // ========================================

    async getGroups() {
        return this.request('/api/sonos/groups');
    }

    async groupSpeaker(speakerName, coordinatorName) {
        return this.request(`/api/sonos/speakers/${encodeURIComponent(speakerName)}/group/${encodeURIComponent(coordinatorName)}`, {
            method: 'POST'
        });
    }

    async ungroupSpeaker(speakerName) {
        return this.request(`/api/sonos/speakers/${encodeURIComponent(speakerName)}/ungroup`, {
            method: 'POST'
        });
    }

    async partyMode(speakerName) {
        return this.request(`/api/sonos/speakers/${encodeURIComponent(speakerName)}/party`, {
            method: 'POST'
        });
    }

    async ungroupAll(speakerName) {
        return this.request(`/api/sonos/speakers/${encodeURIComponent(speakerName)}/ungroup-all`, {
            method: 'POST'
        });
    }

    async setGroupVolume(speakerName, volume) {
        return this.request(`/api/sonos/speakers/${encodeURIComponent(speakerName)}/group-volume/${volume}`, {
            method: 'POST'
        });
    }

    async transferPlayback(speakerName, targetSpeaker) {
        return this.request(`/api/sonos/speakers/${encodeURIComponent(speakerName)}/transfer/${encodeURIComponent(targetSpeaker)}`, {
            method: 'POST'
        });
    }

    async getShuffle(speakerName) {
        return this.request(`/api/sonos/speakers/${encodeURIComponent(speakerName)}/shuffle`);
    }

    async setShuffle(speakerName, state) {
        return this.request(`/api/sonos/speakers/${encodeURIComponent(speakerName)}/shuffle/${state}`, {
            method: 'POST'
        });
    }

    async getRepeat(speakerName) {
        return this.request(`/api/sonos/speakers/${encodeURIComponent(speakerName)}/repeat`);
    }

    async setRepeat(speakerName, mode) {
        return this.request(`/api/sonos/speakers/${encodeURIComponent(speakerName)}/repeat/${mode}`, {
            method: 'POST'
        });
    }

    async getCrossfade(speakerName) {
        return this.request(`/api/sonos/speakers/${encodeURIComponent(speakerName)}/crossfade`);
    }

    async setCrossfade(speakerName, state) {
        return this.request(`/api/sonos/speakers/${encodeURIComponent(speakerName)}/crossfade/${state}`, {
            method: 'POST'
        });
    }

    async getSleepTimer(speakerName) {
        return this.request(`/api/sonos/speakers/${encodeURIComponent(speakerName)}/sleep`);
    }

    async setSleepTimer(speakerName, duration) {
        return this.request(`/api/sonos/speakers/${encodeURIComponent(speakerName)}/sleep/${encodeURIComponent(duration)}`, {
            method: 'POST'
        });
    }

    async cancelSleepTimer(speakerName) {
        return this.request(`/api/sonos/speakers/${encodeURIComponent(speakerName)}/sleep`, {
            method: 'DELETE'
        });
    }

    async seek(speakerName, position) {
        return this.request(`/api/sonos/speakers/${encodeURIComponent(speakerName)}/seek/${encodeURIComponent(position)}`, {
            method: 'POST'
        });
    }

    // ========================================
    // Phase 3: Favorites and Playlists
    // ========================================

    async getFavorites() {
        return this.request('/api/sonos/favorites');
    }

    async playFavorite(speakerName, favoriteName) {
        return this.request(`/api/sonos/speakers/${encodeURIComponent(speakerName)}/play-favorite/${encodeURIComponent(favoriteName)}`, {
            method: 'POST'
        });
    }

    async playFavoriteByNumber(speakerName, number) {
        return this.request(`/api/sonos/speakers/${encodeURIComponent(speakerName)}/play-favorite-number/${number}`, {
            method: 'POST'
        });
    }

    async getPlaylists() {
        return this.request('/api/sonos/playlists');
    }

    async getPlaylistTracks(playlistName) {
        return this.request(`/api/sonos/playlists/${encodeURIComponent(playlistName)}/tracks`);
    }

    async getRadioStations() {
        return this.request('/api/sonos/radio-stations');
    }

    async playRadioStation(speakerName, stationName) {
        return this.request(`/api/sonos/speakers/${encodeURIComponent(speakerName)}/play-radio/${encodeURIComponent(stationName)}`, {
            method: 'POST'
        });
    }

    // ========================================
    // Phase 4: Queue Management
    // ========================================

    async getQueue(speakerName) {
        return this.request(`/api/sonos/speakers/${encodeURIComponent(speakerName)}/queue`);
    }

    async getQueueLength(speakerName) {
        return this.request(`/api/sonos/speakers/${encodeURIComponent(speakerName)}/queue/length`);
    }

    async getQueuePosition(speakerName) {
        return this.request(`/api/sonos/speakers/${encodeURIComponent(speakerName)}/queue/position`);
    }

    async playFromQueue(speakerName, trackNumber) {
        return this.request(`/api/sonos/speakers/${encodeURIComponent(speakerName)}/queue/play/${trackNumber}`, {
            method: 'POST'
        });
    }

    async clearQueue(speakerName) {
        return this.request(`/api/sonos/speakers/${encodeURIComponent(speakerName)}/queue`, {
            method: 'DELETE'
        });
    }

    async removeFromQueue(speakerName, trackNumber) {
        return this.request(`/api/sonos/speakers/${encodeURIComponent(speakerName)}/queue/${trackNumber}`, {
            method: 'DELETE'
        });
    }

    async addFavoriteToQueue(speakerName, favoriteName) {
        return this.request(`/api/sonos/speakers/${encodeURIComponent(speakerName)}/queue/add-favorite/${encodeURIComponent(favoriteName)}`, {
            method: 'POST'
        });
    }

    async addPlaylistToQueue(speakerName, playlistName) {
        return this.request(`/api/sonos/speakers/${encodeURIComponent(speakerName)}/queue/add-playlist/${encodeURIComponent(playlistName)}`, {
            method: 'POST'
        });
    }

    async playQueue(speakerName) {
        return this.request(`/api/sonos/speakers/${encodeURIComponent(speakerName)}/queue/play`, {
            method: 'POST'
        });
    }

    async addShareLinkToQueue(speakerName, url) {
        return this.request(`/api/sonos/speakers/${encodeURIComponent(speakerName)}/queue/add-sharelink`, {
            method: 'POST',
            body: JSON.stringify({ url })
        });
    }

    async saveQueueAsPlaylist(speakerName, playlistName) {
        return this.request(`/api/sonos/speakers/${encodeURIComponent(speakerName)}/queue/save/${encodeURIComponent(playlistName)}`, {
            method: 'POST'
        });
    }

    // Macros
    async getMacros() {
        return this.request('/api/macro');
    }

    async getMacro(name) {
        return this.request(`/api/macro/${encodeURIComponent(name)}`);
    }

    async saveMacro(macro) {
        return this.request('/api/macro', {
            method: 'POST',
            body: JSON.stringify(macro)
        });
    }

    async deleteMacro(name) {
        return this.request(`/api/macro/${encodeURIComponent(name)}`, {
            method: 'DELETE'
        });
    }

    async duplicateMacro(name) {
        return this.request(`/api/macro/${encodeURIComponent(name)}/duplicate`, {
            method: 'POST'
        });
    }

    async executeMacro(macroName, args = []) {
        return this.request('/api/macro/execute', {
            method: 'POST',
            body: JSON.stringify({ macroName, arguments: args })
        });
    }

    async reloadMacros() {
        return this.request('/api/macro/reload', {
            method: 'POST'
        });
    }

    /**
     * Exports macros file - triggers download
     */
    async exportMacros() {
        const response = await fetch(`${this.baseUrl}/api/macro/export`);
        if (!response.ok) {
            throw new Error('Failed to export macros');
        }
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'macros.txt';
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
    }

    /**
     * Imports macros from a file
     */
    async importMacros(file, merge = false) {
        const formData = new FormData();
        formData.append('file', file);
        
        const response = await fetch(`${this.baseUrl}/api/macro/import?merge=${merge}`, {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Failed to import macros');
        }
        
        return response.json();
    }
}

// Export a singleton instance
const api = new ApiClient();
