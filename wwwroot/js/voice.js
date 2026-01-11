/**
 * Voice Assistant Module for Sound Control
 * Uses OpenAI Realtime API for voice-controlled Sonos interaction
 */
window.voiceAssistant = {
    // State
    isConnected: false,
    isListening: false,
    isProcessing: false,
    isSpeaking: false,
    
    // WebSocket and Audio
    ws: null,
    audioContext: null,
    mediaStream: null,
    mediaRecorder: null,
    audioQueue: [],
    isPlayingAudio: false,
    
    // Configuration
    sampleRate: 24000,
    
    /**
     * Initialize the voice assistant
     */
    async init() {
        console.log('Initializing Voice Assistant');
        
        // Load saved voice preference
        this.selectedVoice = localStorage.getItem('voiceAssistant.voice') || 'verse';
        const voiceSelect = document.getElementById('voice-select');
        if (voiceSelect) {
            voiceSelect.value = this.selectedVoice;
        }
        
        // Check if voice is configured
        await this.checkStatus();
        
        // Set up audio context on first user interaction
        document.getElementById('voice-button')?.addEventListener('click', () => {
            if (!this.audioContext) {
                this.initAudioContext();
            }
        }, { once: true });
    },

    /**
     * Check if voice control is configured
     */
    async checkStatus() {
        try {
            const response = await fetch('/api/voice/status');
            
            // Check if response is OK and is JSON before parsing
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                throw new Error('Response is not JSON - API endpoint may not exist');
            }
            
            const status = await response.json();
            
            const banner = document.getElementById('voice-status-banner');
            const setupPanel = document.getElementById('voice-setup');
            const settingsPanel = document.getElementById('voice-settings');
            const settingsOverlay = document.getElementById('voice-settings-overlay');
            const settingsBtn = document.getElementById('voice-settings-btn');
            const conversationPanel = document.getElementById('voice-conversation');
            const controlsPanel = document.querySelector('.voice-controls');
            const voiceButton = document.getElementById('voice-button');
            
            if (!status.configured) {
                // Show setup UI, hide main interface
                banner?.classList.add('hidden'); // Hide banner, show setup panel instead
                setupPanel?.classList.remove('hidden');
                settingsPanel?.classList.add('hidden');
                settingsOverlay?.classList.add('hidden');
                settingsBtn?.classList.add('hidden');
                conversationPanel?.classList.add('hidden');
                if (controlsPanel) controlsPanel.style.display = 'none';
                voiceButton?.classList.add('disabled');
            } else {
                // Show main interface (settings panel starts hidden but button is visible)
                banner?.classList.add('hidden');
                setupPanel?.classList.add('hidden');
                settingsPanel?.classList.add('hidden'); // Panel starts hidden
                settingsOverlay?.classList.add('hidden');
                settingsBtn?.classList.remove('hidden'); // Show the toggle button
                conversationPanel?.classList.remove('hidden');
                if (controlsPanel) controlsPanel.style.display = '';
                voiceButton?.classList.remove('disabled');
            }
            
            return status.configured;
        } catch (error) {
            console.error('Failed to check voice status:', error);
            
            // On error, show setup panel so user can configure API key
            const setupPanel = document.getElementById('voice-setup');
            const settingsPanel = document.getElementById('voice-settings');
            const settingsOverlay = document.getElementById('voice-settings-overlay');
            const settingsBtn = document.getElementById('voice-settings-btn');
            const conversationPanel = document.getElementById('voice-conversation');
            const controlsPanel = document.querySelector('.voice-controls');
            const voiceButton = document.getElementById('voice-button');
            
            setupPanel?.classList.remove('hidden');
            settingsPanel?.classList.add('hidden');
            settingsOverlay?.classList.add('hidden');
            settingsBtn?.classList.add('hidden');
            conversationPanel?.classList.add('hidden');
            if (controlsPanel) controlsPanel.style.display = 'none';
            voiceButton?.classList.add('disabled');
            
            return false;
        }
    },
    
    /**
     * Save API key to backend
     */
    async saveApiKey() {
        const input = document.getElementById('openai-api-key');
        const button = document.getElementById('save-api-key-btn');
        const apiKey = input?.value?.trim();
        
        if (!apiKey) {
            this.showError('Please enter an API key');
            return;
        }
        
        if (!apiKey.startsWith('sk-')) {
            this.showError('Invalid API key format. Keys start with "sk-"');
            return;
        }
        
        // Disable button during save
        if (button) {
            button.disabled = true;
            button.textContent = 'Saving...';
        }
        
        try {
            const response = await fetch('/api/voice/apikey', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ apiKey })
            });
            
            const result = await response.json();
            
            if (!response.ok) {
                throw new Error(result.error || 'Failed to save API key');
            }
            
            // Clear input and refresh status
            if (input) input.value = '';
            await this.checkStatus();
            
        } catch (error) {
            console.error('Failed to save API key:', error);
            this.showError(error.message);
        } finally {
            if (button) {
                button.disabled = false;
                button.textContent = 'Save Key';
            }
        }
    },
    
    /**
     * Save voice preference
     */
    saveVoicePreference() {
        const voiceSelect = document.getElementById('voice-select');
        if (voiceSelect) {
            this.selectedVoice = voiceSelect.value;
            localStorage.setItem('voiceAssistant.voice', this.selectedVoice);
            console.log('Voice preference saved:', this.selectedVoice);
        }
    },
    
    /**
     * Toggle settings panel visibility
     */
    toggleSettings() {
        const settingsPanel = document.getElementById('voice-settings');
        const overlay = document.getElementById('voice-settings-overlay');
        
        if (settingsPanel && overlay) {
            const isHidden = settingsPanel.classList.contains('hidden');
            if (isHidden) {
                settingsPanel.classList.remove('hidden');
                overlay.classList.remove('hidden');
            } else {
                settingsPanel.classList.add('hidden');
                overlay.classList.add('hidden');
            }
        }
    },

    /**
     * Initialize Web Audio API context
     */
    initAudioContext() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate: this.sampleRate
            });
            console.log('Audio context initialized, sample rate:', this.audioContext.sampleRate);
        } catch (error) {
            console.error('Failed to initialize audio context:', error);
            this.showError('Audio not supported on this device');
        }
    },

    /**
     * Toggle listening state
     */
    async toggleListening() {
        // Debounce - prevent double-clicks
        if (this._toggleDebounce) {
            console.log('Toggle debounced');
            return;
        }
        this._toggleDebounce = true;
        setTimeout(() => { this._toggleDebounce = false; }, 1000);
        
        console.log('toggleListening called, isListening:', this.isListening, 'isConnected:', this.isConnected);
        if (this.isListening || this.isConnected) {
            await this.stopListening();
        } else {
            await this.startListening();
        }
    },

    /**
     * Start listening for voice input
     */
    async startListening() {
        const button = document.getElementById('voice-button');
        const stateText = document.getElementById('voice-state');
        
        try {
            // Check if we're in a secure context (HTTPS or localhost)
            if (!window.isSecureContext) {
                this.showError('Voice control requires HTTPS. Please access this site via HTTPS.');
                console.error('Voice control requires a secure context (HTTPS)');
                return;
            }
            
            // Check if mediaDevices API is available
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                this.showError('Microphone access not available. Please use HTTPS or a modern browser.');
                console.error('navigator.mediaDevices.getUserMedia not available');
                return;
            }
            
            // Check configuration first
            const configured = await this.checkStatus();
            if (!configured) {
                this.showError('Voice control not configured. Add OpenAI API key to settings.');
                return;
            }

            this.updateState('connecting');
            
            // Request microphone permission
            this.mediaStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    sampleRate: this.sampleRate,
                    channelCount: 1,
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });
            
            // Log microphone info
            const audioTrack = this.mediaStream.getAudioTracks()[0];
            console.log('Microphone:', audioTrack.label);
            console.log('Microphone settings:', audioTrack.getSettings());

            // Initialize audio context if needed
            if (!this.audioContext) {
                this.initAudioContext();
            }
            
            // Resume audio context (required after user gesture)
            if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }

            // Get ephemeral token and connect
            await this.connect();
            
        } catch (error) {
            console.error('Failed to start listening:', error);
            
            if (error.name === 'NotAllowedError') {
                this.showError('Microphone permission denied');
            } else {
                this.showError('Failed to start: ' + error.message);
            }
            
            this.updateState('idle');
        }
    },

    /**
     * Connect to OpenAI Realtime API
     */
    async connect() {
        try {
            // Get ephemeral session token from our backend with selected voice
            const voice = this.selectedVoice || 'verse';
            const response = await fetch(`/api/voice/session?voice=${encodeURIComponent(voice)}`, { method: 'POST' });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Failed to create session');
            }
            
            const session = await response.json();
            const ephemeralKey = session.client_secret?.value;
            
            if (!ephemeralKey) {
                throw new Error('No ephemeral key received');
            }

            // Connect to OpenAI Realtime API
            const wsUrl = 'wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17';
            this.ws = new WebSocket(wsUrl, [
                'realtime',
                `openai-insecure-api-key.${ephemeralKey}`,
                'openai-beta.realtime-v1'
            ]);

            this.ws.onopen = () => this.onWebSocketOpen();
            this.ws.onmessage = (event) => this.onWebSocketMessage(event);
            this.ws.onerror = (error) => this.onWebSocketError(error);
            this.ws.onclose = (event) => this.onWebSocketClose(event);
            
        } catch (error) {
            console.error('Failed to connect:', error);
            this.showError('Connection failed: ' + error.message);
            this.cleanup();
            this.updateState('idle');
        }
    },

    /**
     * WebSocket opened
     */
    onWebSocketOpen() {
        console.log('Connected to OpenAI Realtime API');
        this.isConnected = true;
        this.isListening = true;
        this.updateState('listening');
        
        // Start sending audio
        this.startAudioCapture();
        
        // Add welcome message
        this.addMessage('assistant', 'I\'m listening. How can I help with your Sonos system?');
    },

    /**
     * Handle WebSocket messages
     */
    async onWebSocketMessage(event) {
        try {
            const message = JSON.parse(event.data);
            
            // Log all non-audio messages for debugging
            if (message.type !== 'response.audio.delta') {
                console.log('Received:', message.type, message);
            }
            
            switch (message.type) {
                case 'session.created':
                case 'session.updated':
                    console.log('Session ready');
                    break;
                    
                case 'input_audio_buffer.speech_started':
                    this.updateState('hearing');
                    this.stopAudioPlayback();
                    // Create a placeholder for the user message that will be filled when transcription completes
                    this._pendingUserMessageId = 'user-' + Date.now();
                    this.addMessage('user', '...', this._pendingUserMessageId);
                    break;
                    
                case 'input_audio_buffer.speech_stopped':
                    this.updateState('processing');
                    break;
                    
                case 'conversation.item.input_audio_transcription.completed':
                    if (message.transcript) {
                        // Update the pending user message instead of creating a new one
                        if (this._pendingUserMessageId) {
                            const pendingEl = document.querySelector(`[data-response-id="${this._pendingUserMessageId}"]`);
                            if (pendingEl) {
                                const textEl = pendingEl.querySelector('.message-text');
                                if (textEl) textEl.textContent = message.transcript;
                                pendingEl.classList.remove('streaming');
                            }
                            this._pendingUserMessageId = null;
                        } else {
                            this.addMessage('user', message.transcript);
                        }
                    }
                    break;
                    
                case 'response.audio.delta':
                    this.handleAudioDelta(message.delta);
                    break;
                    
                case 'response.audio.done':
                    // Audio complete for this response
                    break;
                    
                case 'response.audio_transcript.delta':
                    this.handleTranscriptDelta(message.delta, message.response_id);
                    break;
                    
                case 'response.audio_transcript.done':
                    this.finalizeTranscript(message.response_id);
                    break;
                    
                case 'response.function_call_arguments.done':
                    await this.handleFunctionCall(message);
                    break;
                    
                case 'response.done':
                    this.onResponseDone(message);
                    break;
                    
                case 'error':
                    console.error('API Error:', message.error);
                    this.showError(message.error?.message || 'An error occurred');
                    break;
            }
        } catch (error) {
            console.error('Failed to handle message:', error);
        }
    },

    /**
     * Handle audio delta from response
     */
    handleAudioDelta(base64Audio) {
        if (!base64Audio) return;
        
        this.isSpeaking = true;
        this.updateState('speaking');
        
        // Decode base64 to audio data
        const audioData = this.base64ToArrayBuffer(base64Audio);
        this.audioQueue.push(audioData);
        
        // Start playback if not already playing
        if (!this.isPlayingAudio) {
            this.playAudioQueue();
        }
    },

    /**
     * Play queued audio
     */
    async playAudioQueue() {
        if (this.isPlayingAudio || this.audioQueue.length === 0) return;
        
        this.isPlayingAudio = true;
        
        while (this.audioQueue.length > 0) {
            const audioData = this.audioQueue.shift();
            await this.playAudioChunk(audioData);
        }
        
        this.isPlayingAudio = false;
        this.isSpeaking = false;
        
        if (this.isListening) {
            this.updateState('listening');
        }
    },

    /**
     * Play a single audio chunk
     */
    async playAudioChunk(arrayBuffer) {
        return new Promise((resolve) => {
            try {
                // Convert raw PCM to audio buffer
                const pcm16 = new Int16Array(arrayBuffer);
                const float32 = new Float32Array(pcm16.length);
                
                for (let i = 0; i < pcm16.length; i++) {
                    float32[i] = pcm16[i] / 32768;
                }
                
                const audioBuffer = this.audioContext.createBuffer(1, float32.length, this.sampleRate);
                audioBuffer.getChannelData(0).set(float32);
                
                const source = this.audioContext.createBufferSource();
                source.buffer = audioBuffer;
                source.connect(this.audioContext.destination);
                source.onended = resolve;
                source.start();
            } catch (error) {
                console.error('Failed to play audio chunk:', error);
                resolve();
            }
        });
    },

    /**
     * Stop audio playback
     */
    stopAudioPlayback() {
        this.audioQueue = [];
        this.isPlayingAudio = false;
        this.isSpeaking = false;
    },

    /**
     * Handle transcript delta (streaming text)
     */
    handleTranscriptDelta(delta, responseId) {
        if (!delta) return;
        
        let messageEl = document.querySelector(`[data-response-id="${responseId}"]`);
        
        if (!messageEl) {
            messageEl = this.addMessage('assistant', '', responseId);
        }
        
        const textEl = messageEl.querySelector('.message-text');
        if (textEl) {
            textEl.textContent += delta;
        }
    },

    /**
     * Finalize transcript
     */
    finalizeTranscript(responseId) {
        const messageEl = document.querySelector(`[data-response-id="${responseId}"]`);
        if (messageEl) {
            messageEl.classList.remove('streaming');
        }
    },

    /**
     * Handle function call from AI
     */
    async handleFunctionCall(message) {
        const functionName = message.name;
        const callId = message.call_id;
        let args = {};
        
        try {
            args = JSON.parse(message.arguments || '{}');
        } catch (e) {
            console.error('Failed to parse function arguments:', e);
        }
        
        console.log('Function call:', functionName, args);
        
        // Show function execution in UI
        this.addFunctionCall(functionName, args);
        
        // Execute the function
        const result = await this.executeFunction(functionName, args);
        
        // Send result back to the API
        this.sendFunctionResult(callId, result);
    },

    /**
     * Execute a Sonos function via our API
     */
    async executeFunction(name, args) {
        try {
            let endpoint = '';
            let method = 'GET';
            let body = null;
            
            // Map function names to API endpoints
            switch (name) {
                // Speaker Discovery
                case 'list_speakers':
                    endpoint = '/api/sonos/speakers';
                    break;
                case 'get_speaker_info':
                    endpoint = `/api/sonos/speakers/${encodeURIComponent(args.speaker)}`;
                    break;
                    
                // Playback Control
                case 'play_pause':
                    endpoint = `/api/sonos/speakers/${encodeURIComponent(args.speaker)}/playpause`;
                    method = 'POST';
                    break;
                case 'next_track':
                    endpoint = `/api/sonos/speakers/${encodeURIComponent(args.speaker)}/next`;
                    method = 'POST';
                    break;
                case 'previous_track':
                    endpoint = `/api/sonos/speakers/${encodeURIComponent(args.speaker)}/previous`;
                    method = 'POST';
                    break;
                case 'get_current_track':
                    endpoint = `/api/sonos/speakers/${encodeURIComponent(args.speaker)}/track`;
                    break;
                    
                // Volume Control
                case 'get_volume':
                    endpoint = `/api/sonos/speakers/${encodeURIComponent(args.speaker)}/volume`;
                    break;
                case 'set_volume':
                    endpoint = `/api/sonos/speakers/${encodeURIComponent(args.speaker)}/volume/${args.volume}`;
                    method = 'POST';
                    break;
                case 'toggle_mute':
                    endpoint = `/api/sonos/speakers/${encodeURIComponent(args.speaker)}/mute`;
                    method = 'POST';
                    break;
                    
                // Grouping
                case 'get_groups':
                    endpoint = '/api/sonos/groups';
                    break;
                case 'group_speakers':
                    endpoint = `/api/sonos/speakers/${encodeURIComponent(args.speaker)}/group/${encodeURIComponent(args.coordinator)}`;
                    method = 'POST';
                    break;
                case 'ungroup_speaker':
                    endpoint = `/api/sonos/speakers/${encodeURIComponent(args.speaker)}/ungroup`;
                    method = 'POST';
                    break;
                case 'party_mode':
                    endpoint = `/api/sonos/speakers/${encodeURIComponent(args.speaker)}/party`;
                    method = 'POST';
                    break;
                case 'ungroup_all':
                    endpoint = `/api/sonos/speakers/${encodeURIComponent(args.speaker)}/ungroup-all`;
                    method = 'POST';
                    break;
                case 'set_group_volume':
                    endpoint = `/api/sonos/speakers/${encodeURIComponent(args.speaker)}/group-volume/${args.volume}`;
                    method = 'POST';
                    break;
                    
                // Playback Modes
                case 'set_shuffle':
                    endpoint = `/api/sonos/speakers/${encodeURIComponent(args.speaker)}/shuffle/${args.enabled ? 'on' : 'off'}`;
                    method = 'POST';
                    break;
                case 'set_repeat':
                    endpoint = `/api/sonos/speakers/${encodeURIComponent(args.speaker)}/repeat/${args.mode}`;
                    method = 'POST';
                    break;
                case 'set_sleep_timer':
                    if (args.minutes === 0) {
                        endpoint = `/api/sonos/speakers/${encodeURIComponent(args.speaker)}/sleep`;
                        method = 'DELETE';
                    } else {
                        endpoint = `/api/sonos/speakers/${encodeURIComponent(args.speaker)}/sleep/${args.minutes}m`;
                        method = 'POST';
                    }
                    break;
                    
                // Favorites & Playlists
                case 'list_favorites':
                    endpoint = '/api/sonos/favorites';
                    break;
                case 'play_favorite':
                    endpoint = `/api/sonos/speakers/${encodeURIComponent(args.speaker)}/play-favorite/${encodeURIComponent(args.favorite_name)}`;
                    method = 'POST';
                    break;
                case 'list_playlists':
                    endpoint = '/api/sonos/playlists';
                    break;
                case 'list_radio_stations':
                    endpoint = '/api/sonos/radio-stations';
                    break;
                case 'play_radio':
                    endpoint = `/api/sonos/speakers/${encodeURIComponent(args.speaker)}/play-radio/${encodeURIComponent(args.station_name)}`;
                    method = 'POST';
                    break;
                    
                // Queue Management
                case 'get_queue':
                    endpoint = `/api/sonos/speakers/${encodeURIComponent(args.speaker)}/queue`;
                    break;
                case 'clear_queue':
                    endpoint = `/api/sonos/speakers/${encodeURIComponent(args.speaker)}/queue`;
                    method = 'DELETE';
                    break;
                case 'play_from_queue':
                    endpoint = `/api/sonos/speakers/${encodeURIComponent(args.speaker)}/queue/play/${args.track_number}`;
                    method = 'POST';
                    break;
                case 'add_favorite_to_queue':
                    endpoint = `/api/sonos/speakers/${encodeURIComponent(args.speaker)}/queue/add-favorite/${encodeURIComponent(args.favorite_name)}`;
                    method = 'POST';
                    break;
                case 'add_playlist_to_queue':
                    endpoint = `/api/sonos/speakers/${encodeURIComponent(args.speaker)}/queue/add-playlist/${encodeURIComponent(args.playlist_name)}`;
                    method = 'POST';
                    break;
                    
                // Macros
                case 'list_macros':
                    endpoint = '/api/macro';
                    break;
                case 'get_macro':
                    endpoint = `/api/macro/${encodeURIComponent(args.name)}`;
                    break;
                case 'run_macro':
                    endpoint = '/api/macro/execute';
                    method = 'POST';
                    body = JSON.stringify({
                        macroName: args.name,
                        arguments: args.arguments || []
                    });
                    break;
                    
                default:
                    return { error: `Unknown function: ${name}` };
            }
            
            const options = { method };
            if (body) {
                options.body = body;
                options.headers = { 'Content-Type': 'application/json' };
            }
            
            const response = await fetch(endpoint, options);
            const result = await response.json();
            
            return result;
            
        } catch (error) {
            console.error('Function execution error:', error);
            return { error: error.message };
        }
    },

    /**
     * Send function result back to the API
     */
    sendFunctionResult(callId, result) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        
        // Add the function result to the conversation
        this.ws.send(JSON.stringify({
            type: 'conversation.item.create',
            item: {
                type: 'function_call_output',
                call_id: callId,
                output: JSON.stringify(result)
            }
        }));
        
        // Request a response
        this.ws.send(JSON.stringify({
            type: 'response.create'
        }));
    },

    /**
     * Response completed
     */
    onResponseDone(message) {
        if (this.isListening) {
            this.updateState('listening');
        }
    },

    /**
     * WebSocket error
     */
    onWebSocketError(error) {
        console.error('WebSocket error:', error);
        this.showError('Connection error');
    },

    /**
     * WebSocket closed
     */
    onWebSocketClose(event) {
        console.log('WebSocket closed, code:', event?.code, 'reason:', event?.reason);
        this.isConnected = false;
        this.isListening = false;
        this.cleanup();
        this.updateState('idle');
    },

    /**
     * Start capturing audio from microphone
     */
    startAudioCapture() {
        if (!this.mediaStream || !this.audioContext) {
            console.error('Missing mediaStream or audioContext');
            return;
        }
        
        console.log('Starting audio capture, sample rate:', this.audioContext.sampleRate);
        
        const source = this.audioContext.createMediaStreamSource(this.mediaStream);
        const processor = this.audioContext.createScriptProcessor(4096, 1, 1);
        
        let audioChunkCount = 0;
        
        processor.onaudioprocess = (e) => {
            if (!this.isListening || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
            
            const inputData = e.inputBuffer.getChannelData(0);
            
            // Check if we're getting actual audio (not silence)
            const maxVal = Math.max(...inputData.map(Math.abs));
            if (audioChunkCount === 0 || audioChunkCount % 100 === 0) {
                console.log(`Audio chunk ${audioChunkCount}, max level: ${maxVal.toFixed(4)}`);
            }
            audioChunkCount++;
            
            // Resample if needed (browser might not give us 24kHz)
            const resampled = this.resampleAudio(inputData, this.audioContext.sampleRate, this.sampleRate);
            
            // Convert to PCM16
            const pcm16 = new Int16Array(resampled.length);
            for (let i = 0; i < resampled.length; i++) {
                const s = Math.max(-1, Math.min(1, resampled[i]));
                pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
            }
            
            // Send as base64
            const base64 = this.arrayBufferToBase64(pcm16.buffer);
            this.ws.send(JSON.stringify({
                type: 'input_audio_buffer.append',
                audio: base64
            }));
        };
        
        source.connect(processor);
        // Connect to destination (required for ScriptProcessor to work)
        // Use a gain node set to 0 to prevent feedback
        const silentGain = this.audioContext.createGain();
        silentGain.gain.value = 0;
        processor.connect(silentGain);
        silentGain.connect(this.audioContext.destination);
        
        this.audioProcessor = processor;
        this.audioSource = source;
        this.silentGain = silentGain;
        
        console.log('Audio capture started');
    },

    /**
     * Stop listening
     */
    async stopListening() {
        console.log('stopListening called');
        console.trace('stopListening stack trace');
        this.isListening = false;
        
        // Close WebSocket
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        
        this.cleanup();
        this.updateState('idle');
    },

    /**
     * Clean up resources
     */
    cleanup() {
        console.log('Cleaning up voice resources');
        console.trace('cleanup stack trace');
        
        // Stop audio processing
        if (this.audioProcessor) {
            this.audioProcessor.disconnect();
            this.audioProcessor = null;
        }
        if (this.audioSource) {
            this.audioSource.disconnect();
            this.audioSource = null;
        }
        if (this.silentGain) {
            this.silentGain.disconnect();
            this.silentGain = null;
        }
        
        // Stop media stream
        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(track => track.stop());
            this.mediaStream = null;
        }
        
        // Clear audio queue
        this.audioQueue = [];
        this.isPlayingAudio = false;
        this.isSpeaking = false;
        this.isConnected = false;
    },

    /**
     * Update UI state
     */
    updateState(state) {
        const button = document.getElementById('voice-button');
        const stateText = document.getElementById('voice-state');
        const visualizer = document.getElementById('voice-visualizer');
        const micIcon = button?.querySelector('.voice-mic-icon');
        const stopIcon = button?.querySelector('.voice-stop-icon');
        
        // Remove all state classes
        button?.classList.remove('connecting', 'listening', 'hearing', 'processing', 'speaking');
        visualizer?.classList.remove('active', 'hearing', 'speaking');
        
        switch (state) {
            case 'idle':
                if (stateText) stateText.textContent = 'Tap to speak';
                micIcon?.classList.remove('hidden');
                stopIcon?.classList.add('hidden');
                break;
                
            case 'connecting':
                button?.classList.add('connecting');
                if (stateText) stateText.textContent = 'Connecting...';
                break;
                
            case 'listening':
                button?.classList.add('listening');
                visualizer?.classList.add('active');
                if (stateText) stateText.textContent = 'Listening...';
                micIcon?.classList.add('hidden');
                stopIcon?.classList.remove('hidden');
                break;
                
            case 'hearing':
                button?.classList.add('hearing');
                visualizer?.classList.add('active', 'hearing');
                if (stateText) stateText.textContent = 'Hearing you...';
                break;
                
            case 'processing':
                button?.classList.add('processing');
                if (stateText) stateText.textContent = 'Thinking...';
                break;
                
            case 'speaking':
                button?.classList.add('speaking');
                visualizer?.classList.add('active', 'speaking');
                if (stateText) stateText.textContent = 'Speaking...';
                break;
        }
    },

    /**
     * Add a message to the conversation
     */
    addMessage(role, text, responseId = null) {
        const conversation = document.getElementById('voice-conversation');
        if (!conversation) return null;
        
        // Hide welcome message
        const welcome = conversation.querySelector('.voice-welcome');
        if (welcome) welcome.style.display = 'none';
        
        const messageEl = document.createElement('div');
        messageEl.className = `voice-message ${role}`;
        if (responseId) {
            messageEl.dataset.responseId = responseId;
            messageEl.classList.add('streaming');
        }
        
        messageEl.innerHTML = `
            <div class="message-avatar">
                ${role === 'user' ? '👤' : '🔊'}
            </div>
            <div class="message-content">
                <div class="message-text">${this.escapeHtml(text)}</div>
            </div>
        `;
        
        conversation.appendChild(messageEl);
        conversation.scrollTop = conversation.scrollHeight;
        
        return messageEl;
    },

    /**
     * Add a function call indicator to the conversation
     */
    addFunctionCall(name, args) {
        const conversation = document.getElementById('voice-conversation');
        if (!conversation) return;
        
        const messageEl = document.createElement('div');
        messageEl.className = 'voice-message function-call';
        
        // Format args nicely
        const argsStr = Object.entries(args)
            .map(([k, v]) => `${k}: ${v}`)
            .join(', ');
        
        messageEl.innerHTML = `
            <div class="message-avatar">⚡</div>
            <div class="message-content">
                <div class="function-name">${this.formatFunctionName(name)}</div>
                ${argsStr ? `<div class="function-args">${this.escapeHtml(argsStr)}</div>` : ''}
            </div>
        `;
        
        conversation.appendChild(messageEl);
        conversation.scrollTop = conversation.scrollHeight;
    },

    /**
     * Format function name for display
     */
    formatFunctionName(name) {
        return name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    },

    /**
     * Show error toast
     */
    showError(message) {
        if (typeof mobileApp !== 'undefined' && mobileApp.showToast) {
            mobileApp.showToast(message, 'error');
        } else {
            console.error(message);
        }
    },

    /**
     * Utility: Escape HTML
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    /**
     * Utility: Base64 to ArrayBuffer
     */
    base64ToArrayBuffer(base64) {
        const binaryString = atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes.buffer;
    },

    /**
     * Utility: ArrayBuffer to Base64
     */
    arrayBufferToBase64(buffer) {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    },

    /**
     * Utility: Resample audio
     */
    resampleAudio(inputData, inputSampleRate, outputSampleRate) {
        if (inputSampleRate === outputSampleRate) {
            return inputData;
        }
        
        const ratio = inputSampleRate / outputSampleRate;
        const outputLength = Math.round(inputData.length / ratio);
        const output = new Float32Array(outputLength);
        
        for (let i = 0; i < outputLength; i++) {
            const srcIndex = i * ratio;
            const srcIndexFloor = Math.floor(srcIndex);
            const srcIndexCeil = Math.min(srcIndexFloor + 1, inputData.length - 1);
            const t = srcIndex - srcIndexFloor;
            output[i] = inputData[srcIndexFloor] * (1 - t) + inputData[srcIndexCeil] * t;
        }
        
        return output;
    }
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    voiceAssistant.init();
});
