/**
 * Voice Assistant Module for Sound Control
 * Uses OpenAI Realtime API for voice-controlled Sonos interaction
 * 
 * Safari PWA Notes:
 * - Audio context must be created/resumed from user gesture
 * - MediaStream tracks can end unexpectedly in PWA mode
 * - Audio context can become "interrupted" (calls, Siri, etc.)
 * - We create fresh audio context on each listening session for reliability
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
    
    // Voice Activity Detection (VAD) settings
    vadEnabled: true,
    vadSensitivity: 0.015, // RMS threshold (0.001-0.1, higher = less sensitive)
    vadSmoothingWindow: 3, // Number of frames to smooth over
    vadEnergyHistory: [],
    vadSpeechFrames: 0,
    vadSilenceFrames: 0,
    vadMinSpeechFrames: 3, // Minimum consecutive frames to start sending
    vadMinSilenceFrames: 5, // Minimum consecutive frames to stop sending
    vadIsSpeaking: false,
    
    // Detect if running as PWA (standalone mode)
    isPWA: window.matchMedia('(display-mode: standalone)').matches || 
           window.navigator.standalone === true,
    
    /**
     * Initialize the voice assistant
     */
    async init() {
        console.log('Initializing Voice Assistant');
        console.log('Running as PWA:', this.isPWA);
        console.log('User Agent:', navigator.userAgent);
        
        // Load saved voice preference
        this.selectedVoice = localStorage.getItem('voiceAssistant.voice') || 'verse';
        const voiceSelect = document.getElementById('voice-select');
        if (voiceSelect) {
            voiceSelect.value = this.selectedVoice;
        }
        
        // Load saved VAD sensitivity
        const savedSensitivity = localStorage.getItem('voiceAssistant.vadSensitivity');
        if (savedSensitivity) {
            this.vadSensitivity = parseFloat(savedSensitivity);
        }
        const sensitivitySlider = document.getElementById('vad-sensitivity');
        const sensitivityValue = document.getElementById('vad-value');
        if (sensitivitySlider) {
            const sliderValue = this.vadSensitivity * 1000; // Scale for slider (0-100)
            sensitivitySlider.value = sliderValue;
            if (sensitivityValue) {
                sensitivityValue.textContent = Math.round(sliderValue);
            }
        }
        
        // Check if voice is configured
        await this.checkStatus();
        
        // Handle visibility changes (Safari PWA may suspend resources when hidden)
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible' && this.isListening) {
                console.log('App became visible while listening - checking audio state');
                this.checkAudioHealth();
            }
        });
        
        // Handle page show/hide for PWA (bfcache)
        window.addEventListener('pageshow', (event) => {
            if (event.persisted) {
                console.log('Page restored from bfcache');
                // Audio context may need refresh after bfcache restore
                if (this.audioContext && this.audioContext.state !== 'running') {
                    console.log('Audio context needs refresh after bfcache restore');
                }
            }
        });
    },
    
    /**
     * Check health of audio capture (for Safari PWA reliability)
     */
    checkAudioHealth() {
        if (!this.isListening) return;
        
        // Check media stream
        if (this.mediaStream) {
            const tracks = this.mediaStream.getAudioTracks();
            if (tracks.length === 0 || tracks[0].readyState !== 'live') {
                console.warn('Audio track is no longer live');
                this.showError('Microphone stopped. Tap to try again.');
                this.stopListening();
                return;
            }
        }
        
        // Check audio context
        if (this.audioContext && this.audioContext.state !== 'running') {
            console.warn('Audio context is not running:', this.audioContext.state);
            this.audioContext.resume().catch(e => {
                console.error('Failed to resume audio context:', e);
            });
        }
    },

    /**
     * Check if voice control is configured
     */
    async checkStatus() {
        console.log('Voice: Checking status...');
        try {
            const response = await fetch('/api/voice/status');
            console.log('Voice: Status response received, status:', response.status);
            
            // Check if response is OK and is JSON before parsing
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                throw new Error('Response is not JSON - API endpoint may not exist');
            }
            
            const status = await response.json();
            
            // Log the server response for debugging
            console.log('Voice status response:', status);
            
            // Store the status for later use
            this.configMode = status.mode || 'none';
            this.voiceEnabled = status.enabled || false;
            this.subscribeUrl = status.subscribeUrl || 'https://sndctl.app/app/subscribe';
            
            const banner = document.getElementById('voice-status-banner');
            const setupPanel = document.getElementById('voice-setup');
            const settingsPanel = document.getElementById('voice-settings');
            const settingsOverlay = document.getElementById('voice-settings-overlay');
            const settingsBtn = document.getElementById('voice-settings-btn');
            const conversationPanel = document.getElementById('voice-conversation');
            const controlsPanel = document.querySelector('.voice-controls');
            const voiceButton = document.getElementById('voice-button');
            const serverModeIndicator = document.getElementById('voice-server-mode');
            const subscribePanel = document.getElementById('voice-subscribe');
            const disabledPanel = document.getElementById('voice-disabled');
            
            // Log element availability for debugging
            console.log('Voice UI elements:', {
                conversationPanel: !!conversationPanel,
                controlsPanel: !!controlsPanel,
                voiceButton: !!voiceButton,
                disabledPanel: !!disabledPanel,
                settingsBtn: !!settingsBtn
            });
            
            // Hide all optional panels first
            banner?.classList.add('hidden');
            setupPanel?.classList.add('hidden');
            settingsPanel?.classList.add('hidden');
            settingsOverlay?.classList.add('hidden');
            settingsBtn?.classList.add('hidden');
            subscribePanel?.classList.add('hidden');
            serverModeIndicator?.classList.add('hidden');
            disabledPanel?.classList.remove('visible');
            
            if (!status.configured) {
                console.log('Voice: Not configured - showing disabled state');
                // Not configured - show disabled state
                conversationPanel?.classList.add('hidden');
                if (controlsPanel) controlsPanel.style.display = 'none';
                voiceButton?.classList.add('disabled');
                disabledPanel?.classList.add('visible');
            } else if (!status.enabled) {
                console.log('Voice: Configured but not enabled - showing subscribe panel');
                // Configured but not subscribed - show subscribe prompt
                conversationPanel?.classList.add('hidden');
                if (controlsPanel) controlsPanel.style.display = 'none';
                voiceButton?.classList.add('disabled');
                
                // Show subscribe panel
                if (subscribePanel) {
                    subscribePanel.classList.remove('hidden');
                    const subscribeLink = subscribePanel.querySelector('a');
                    if (subscribeLink) {
                        subscribeLink.href = status.subscribeUrl || 'https://sndctl.app/app/subscribe';
                    }
                    const subscribeMessage = subscribePanel.querySelector('.subscribe-message');
                    if (subscribeMessage) {
                        subscribeMessage.textContent = status.message || 'Subscribe to enable voice control';
                    }
                }
            } else {
                console.log('Voice: Configured and enabled - showing main interface');
                // Configured and enabled - show main interface
                conversationPanel?.classList.remove('hidden');
                if (controlsPanel) controlsPanel.style.display = '';
                voiceButton?.classList.remove('disabled');
                settingsBtn?.classList.remove('hidden');
                
                // Show server mode indicator if connected via server
                if (status.mode === 'server' && serverModeIndicator) {
                    serverModeIndicator.classList.remove('hidden');
                    serverModeIndicator.textContent = `Connected to ${status.serverUrl || 'server'}`;
                }
            }
            
            return status.enabled;
        } catch (error) {
            console.error('Failed to check voice status:', error);
            
            // On error, show disabled state
            const setupPanel = document.getElementById('voice-setup');
            const settingsPanel = document.getElementById('voice-settings');
            const settingsOverlay = document.getElementById('voice-settings-overlay');
            const settingsBtn = document.getElementById('voice-settings-btn');
            const conversationPanel = document.getElementById('voice-conversation');
            const controlsPanel = document.querySelector('.voice-controls');
            const voiceButton = document.getElementById('voice-button');
            const subscribePanel = document.getElementById('voice-subscribe');
            const disabledPanel = document.getElementById('voice-disabled');
            
            setupPanel?.classList.add('hidden');
            settingsPanel?.classList.add('hidden');
            settingsOverlay?.classList.add('hidden');
            settingsBtn?.classList.add('hidden');
            subscribePanel?.classList.add('hidden');
            conversationPanel?.classList.add('hidden');
            if (controlsPanel) controlsPanel.style.display = 'none';
            voiceButton?.classList.add('disabled');
            disabledPanel?.classList.add('visible');
            
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
     * Update VAD sensitivity
     */
    updateVadSensitivity(value) {
        this.vadSensitivity = value / 1000; // Scale from slider (0-100) to actual value
        localStorage.setItem('voiceAssistant.vadSensitivity', this.vadSensitivity.toString());
        console.log('VAD sensitivity updated:', this.vadSensitivity);
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
     * Safari/iOS PWA requires special handling for audio context
     */
    initAudioContext() {
        try {
            // Close any existing context first (important for PWA reliability)
            if (this.audioContext) {
                try {
                    this.audioContext.close();
                } catch (e) {
                    console.log('Could not close existing audio context:', e);
                }
                this.audioContext = null;
            }
            
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate: this.sampleRate
            });
            console.log('Audio context initialized, sample rate:', this.audioContext.sampleRate, 'state:', this.audioContext.state);
            
            // Handle iOS/Safari audio context interruptions (calls, Siri, etc.)
            this.audioContext.onstatechange = () => {
                console.log('AudioContext state changed:', this.audioContext.state);
                if (this.audioContext.state === 'interrupted') {
                    console.log('Audio context interrupted - will attempt resume on next user interaction');
                }
            };
            
        } catch (error) {
            console.error('Failed to initialize audio context:', error);
            this.showError('Audio not supported on this device');
        }
    },
    
    /**
     * Ensure audio context is in a usable state
     * Safari PWA may suspend/interrupt audio context unpredictably
     */
    async ensureAudioContextReady() {
        if (!this.audioContext) {
            this.initAudioContext();
        }
        
        // Handle various audio context states
        if (this.audioContext.state === 'suspended' || this.audioContext.state === 'interrupted') {
            console.log('Resuming audio context from state:', this.audioContext.state);
            try {
                await this.audioContext.resume();
                console.log('Audio context resumed, new state:', this.audioContext.state);
            } catch (error) {
                console.error('Failed to resume audio context:', error);
                // In PWA mode, we may need to recreate the context entirely
                this.initAudioContext();
                if (this.audioContext.state === 'suspended') {
                    await this.audioContext.resume();
                }
            }
        }
        
        // Final check
        if (this.audioContext.state !== 'running') {
            console.warn('Audio context is not running, state:', this.audioContext.state);
        }
        
        return this.audioContext.state === 'running';
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
            
            // Initialize audio context BEFORE requesting microphone (important for Safari PWA)
            // This ensures the audio context is created from a user gesture
            this.initAudioContext();
            
            // Resume audio context immediately (must be from user gesture)
            const audioReady = await this.ensureAudioContextReady();
            if (!audioReady) {
                console.warn('Audio context not fully ready, continuing anyway...');
            }
            
            // Clean up any existing media stream first (Safari PWA can have stale streams)
            if (this.mediaStream) {
                console.log('Cleaning up existing media stream before new request');
                this.mediaStream.getTracks().forEach(track => track.stop());
                this.mediaStream = null;
            }
            
            // Request microphone permission with constraints optimized for Safari PWA
            // Using simpler constraints for better Safari compatibility
            const constraints = {
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            };
            
            console.log('Requesting microphone with constraints:', constraints);
            this.mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
            
            // Verify we got a valid stream with active tracks
            const audioTracks = this.mediaStream.getAudioTracks();
            if (audioTracks.length === 0) {
                throw new Error('No audio tracks available from microphone');
            }
            
            const audioTrack = audioTracks[0];
            console.log('Microphone:', audioTrack.label);
            console.log('Microphone enabled:', audioTrack.enabled);
            console.log('Microphone readyState:', audioTrack.readyState);
            console.log('Microphone settings:', audioTrack.getSettings());
            
            // Check if track is live (Safari PWA issue)
            if (audioTrack.readyState !== 'live') {
                console.error('Audio track is not live, state:', audioTrack.readyState);
                throw new Error('Microphone track is not active. Please try again.');
            }
            
            // Monitor track ending (Safari PWA may end tracks unexpectedly)
            audioTrack.onended = () => {
                console.warn('Audio track ended unexpectedly');
                if (this.isListening) {
                    this.showError('Microphone stopped unexpectedly. Tap to try again.');
                    this.stopListening();
                }
            };
            
            audioTrack.onmute = () => {
                console.warn('Audio track muted');
            };
            
            audioTrack.onunmute = () => {
                console.log('Audio track unmuted');
            };

            // Get ephemeral token and connect
            await this.connect();
            
        } catch (error) {
            console.error('Failed to start listening:', error);
            
            if (error.name === 'NotAllowedError') {
                this.showError('Microphone permission denied');
            } else if (error.name === 'NotFoundError') {
                this.showError('No microphone found');
            } else if (error.name === 'NotReadableError') {
                this.showError('Microphone is in use by another app');
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
    async onWebSocketOpen() {
        console.log('Connected to OpenAI Realtime API');
        this.isConnected = true;
        this.isListening = true;
        this.updateState('listening');
        
        // Verify audio context is still ready (Safari PWA may have issues)
        if (this.audioContext && this.audioContext.state !== 'running') {
            console.log('Audio context state before capture:', this.audioContext.state);
            try {
                await this.audioContext.resume();
                console.log('Audio context resumed, state:', this.audioContext.state);
            } catch (e) {
                console.error('Failed to resume audio context:', e);
            }
        }
        
        // Verify media stream is still active
        if (this.mediaStream) {
            const tracks = this.mediaStream.getAudioTracks();
            if (tracks.length > 0) {
                console.log('Audio track state before capture:', tracks[0].readyState);
                if (tracks[0].readyState !== 'live') {
                    console.error('Audio track is not live, cannot start capture');
                    this.showError('Microphone not ready. Please try again.');
                    this.stopListening();
                    return;
                }
            }
        }
        
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
                
                // Music Library
                case 'search_library':
                    const searchCategory = args.category || 'albums';
                    endpoint = `/api/library/${searchCategory}?search=${encodeURIComponent(args.query)}&max_items=10`;
                    break;
                case 'browse_library_artists':
                    endpoint = `/api/library/artists?max_items=${args.max_items || 20}`;
                    break;
                case 'browse_library_albums':
                    endpoint = `/api/library/albums?max_items=${args.max_items || 20}`;
                    break;
                case 'browse_library_tracks':
                    endpoint = `/api/library/tracks?max_items=${args.max_items || 20}`;
                    break;
                case 'browse_library_genres':
                    endpoint = `/api/library/genres?max_items=${args.max_items || 20}`;
                    break;
                case 'play_library_item':
                    // First search for the item, then play it
                    return await this.playLibraryItem(args.speaker, args.name, args.category || 'albums');
                    
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
     * Play a library item by searching for it first
     */
    async playLibraryItem(speaker, name, category = 'albums') {
        try {
            // Search for the item in the library
            const searchResponse = await fetch(
                `/api/library/${category}?search=${encodeURIComponent(name)}&max_items=5`
            );
            const searchResult = await searchResponse.json();
            
            if (!searchResult.items || searchResult.items.length === 0) {
                return { error: `Could not find "${name}" in ${category}` };
            }
            
            // Find best match (exact or first result)
            const nameLower = name.toLowerCase();
            let item = searchResult.items.find(i => 
                i.title?.toLowerCase() === nameLower
            ) || searchResult.items[0];
            
            if (!item.uri) {
                return { error: `Found "${item.title}" but it has no playable URI` };
            }
            
            // Play the item
            const playResponse = await fetch(
                `/api/sonos/speakers/${encodeURIComponent(speaker)}/play-uri`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ uri: item.uri })
                }
            );
            const playResult = await playResponse.json();
            
            if (playResult.success) {
                return { 
                    success: true, 
                    message: `Now playing "${item.title}" on ${speaker}`,
                    item: {
                        title: item.title,
                        artist: item.artist,
                        category: category
                    }
                };
            } else {
                return { error: 'Failed to play the item' };
            }
        } catch (error) {
            console.error('Error playing library item:', error);
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
     * Send a text command (typed input instead of voice)
     */
    async sendTextCommand() {
        const input = document.getElementById('voice-text-input');
        const text = input?.value?.trim();
        
        if (!text) return;
        
        // Clear input
        input.value = '';
        
        // Show what user typed in conversation
        this.addMessage('user', text);
        
        // If not connected, connect in text-only mode
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            this.updateState('Connecting...');
            this.textOnlyMode = true;  // Flag for text-only connection
            const connected = await this.connectForText();
            if (!connected) {
                this.showError('Failed to connect. Please try again.');
                this.textOnlyMode = false;
                return;
            }
            // Wait a moment for the WebSocket to be ready
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        // Send text as a conversation item
        this.ws.send(JSON.stringify({
            type: 'conversation.item.create',
            item: {
                type: 'message',
                role: 'user',
                content: [{
                    type: 'input_text',
                    text: text
                }]
            }
        }));
        
        // Request a response
        this.ws.send(JSON.stringify({
            type: 'response.create'
        }));
        
        this.updateState('Processing...');
    },

    /**
     * Connect to OpenAI Realtime API for text-only mode (no audio)
     */
    async connectForText() {
        return new Promise(async (resolve) => {
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

                this.ws.onopen = () => {
                    console.log('Connected to OpenAI Realtime API (text mode)');
                    this.isConnected = true;
                    this.updateState('Ready');
                    resolve(true);
                };
                this.ws.onmessage = (event) => this.onWebSocketMessage(event);
                this.ws.onerror = (error) => {
                    this.onWebSocketError(error);
                    resolve(false);
                };
                this.ws.onclose = (event) => this.onWebSocketClose(event);
                
            } catch (error) {
                console.error('Failed to connect:', error);
                this.showError('Connection failed: ' + error.message);
                this.cleanup();
                this.updateState('idle');
                resolve(false);
            }
        });
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
     * Uses ScriptProcessorNode for Safari compatibility (AudioWorklet has issues in Safari PWA)
     */
    startAudioCapture() {
        if (!this.mediaStream || !this.audioContext) {
            console.error('Missing mediaStream or audioContext');
            return;
        }
        
        // Verify media stream is still active (Safari PWA issue)
        const tracks = this.mediaStream.getAudioTracks();
        if (tracks.length === 0 || tracks[0].readyState !== 'live') {
            console.error('Media stream is not active, cannot start capture');
            this.showError('Microphone not ready. Please try again.');
            this.stopListening();
            return;
        }
        
        // Verify audio context is running
        if (this.audioContext.state !== 'running') {
            console.warn('Audio context state is not running:', this.audioContext.state);
            // Try to resume it
            this.audioContext.resume().then(() => {
                console.log('Audio context resumed to:', this.audioContext.state);
            }).catch(e => {
                console.error('Failed to resume audio context:', e);
            });
        }
        
        console.log('Starting audio capture');
        console.log('  Audio context sample rate:', this.audioContext.sampleRate);
        console.log('  Audio context state:', this.audioContext.state);
        console.log('  Media stream active:', this.mediaStream.active);
        console.log('  Audio track state:', tracks[0].readyState);
        
        try {
            const source = this.audioContext.createMediaStreamSource(this.mediaStream);
            
            // Use ScriptProcessorNode (deprecated but better Safari PWA support than AudioWorklet)
            // Buffer size of 4096 provides good balance of latency and reliability
            const processor = this.audioContext.createScriptProcessor(4096, 1, 1);
            
            let audioChunkCount = 0;
            let lastLogTime = Date.now();
            
            processor.onaudioprocess = (e) => {
                if (!this.isListening || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
                
                const inputData = e.inputBuffer.getChannelData(0);
                
                // Calculate RMS energy for voice activity detection
                const rmsEnergy = this.calculateRMS(inputData);
                
                // Voice activity detection
                const isSpeechDetected = this.vadEnabled ? this.detectVoiceActivity(rmsEnergy) : true;
                
                // Log audio levels periodically (every 2 seconds)
                const now = Date.now();
                if (now - lastLogTime > 2000) {
                    console.log(`Audio: RMS=${rmsEnergy.toFixed(4)}, Threshold=${this.vadSensitivity.toFixed(4)}, Speech=${isSpeechDetected}, Frames=${this.vadSpeechFrames}/${this.vadSilenceFrames}`);
                    lastLogTime = now;
                }
                audioChunkCount++;
                
                // Only send audio when speech is detected (or VAD is disabled)
                if (!isSpeechDetected) {
                    return;
                }
                
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
            
            // Connect to destination (required for ScriptProcessor to work in Safari)
            // Use a gain node set to 0 to prevent feedback/echo
            const silentGain = this.audioContext.createGain();
            silentGain.gain.value = 0;
            processor.connect(silentGain);
            silentGain.connect(this.audioContext.destination);
            
            this.audioProcessor = processor;
            this.audioSource = source;
            this.silentGain = silentGain;
            
            console.log('Audio capture started successfully');
        } catch (error) {
            console.error('Failed to start audio capture:', error);
            this.showError('Failed to capture audio: ' + error.message);
            this.stopListening();
        }
    },

    /**
     * Calculate RMS (Root Mean Square) energy of audio signal
     * @param {Float32Array} audioData - Audio samples
     * @returns {number} RMS energy value
     */
    calculateRMS(audioData) {
        let sum = 0;
        for (let i = 0; i < audioData.length; i++) {
            sum += audioData[i] * audioData[i];
        }
        return Math.sqrt(sum / audioData.length);
    },
    
    /**
     * Detect voice activity based on RMS energy with smoothing
     * @param {number} rmsEnergy - Current RMS energy
     * @returns {boolean} True if speech is detected
     */
    detectVoiceActivity(rmsEnergy) {
        // Add to energy history for smoothing
        this.vadEnergyHistory.push(rmsEnergy);
        if (this.vadEnergyHistory.length > this.vadSmoothingWindow) {
            this.vadEnergyHistory.shift();
        }
        
        // Calculate smoothed energy (average over window)
        const smoothedEnergy = this.vadEnergyHistory.reduce((a, b) => a + b, 0) / this.vadEnergyHistory.length;
        
        // Detect if current frame has speech
        const isSpeechFrame = smoothedEnergy > this.vadSensitivity;
        
        // Update speech/silence counters
        if (isSpeechFrame) {
            this.vadSpeechFrames++;
            this.vadSilenceFrames = 0;
        } else {
            this.vadSilenceFrames++;
            this.vadSpeechFrames = 0;
        }
        
        // State machine: require multiple consecutive frames to change state
        if (!this.vadIsSpeaking && this.vadSpeechFrames >= this.vadMinSpeechFrames) {
            // Start detecting speech
            this.vadIsSpeaking = true;
            console.log('VAD: Speech started (energy:', smoothedEnergy.toFixed(4), ')');
        } else if (this.vadIsSpeaking && this.vadSilenceFrames >= this.vadMinSilenceFrames) {
            // Stop detecting speech
            this.vadIsSpeaking = false;
            console.log('VAD: Speech ended (energy:', smoothedEnergy.toFixed(4), ')');
        }
        
        return this.vadIsSpeaking;
    },
    
    /**
     * Reset VAD state
     */
    resetVAD() {
        this.vadEnergyHistory = [];
        this.vadSpeechFrames = 0;
        this.vadSilenceFrames = 0;
        this.vadIsSpeaking = false;
    },

    /**
     * Stop listening
     */
    async stopListening() {
        console.log('stopListening called');
        this.isListening = false;
        this.resetVAD();
        
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
     * Thorough cleanup is important for Safari PWA reliability
     */
    cleanup() {
        console.log('Cleaning up voice resources');
        
        // Stop audio processing nodes
        if (this.audioProcessor) {
            try {
                this.audioProcessor.onaudioprocess = null; // Clear callback first
                this.audioProcessor.disconnect();
            } catch (e) {
                console.log('Error disconnecting processor:', e);
            }
            this.audioProcessor = null;
        }
        if (this.audioSource) {
            try {
                this.audioSource.disconnect();
            } catch (e) {
                console.log('Error disconnecting source:', e);
            }
            this.audioSource = null;
        }
        if (this.silentGain) {
            try {
                this.silentGain.disconnect();
            } catch (e) {
                console.log('Error disconnecting gain:', e);
            }
            this.silentGain = null;
        }
        
        // Stop media stream tracks
        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(track => {
                console.log('Stopping track:', track.label, track.readyState);
                track.onended = null; // Clear event handler
                track.onmute = null;
                track.onunmute = null;
                track.stop();
            });
            this.mediaStream = null;
        }
        
        // Close audio context (Safari PWA: fresh context per session is more reliable)
        if (this.audioContext) {
            try {
                // Don't close if we're still playing audio
                if (!this.isPlayingAudio) {
                    this.audioContext.close();
                    this.audioContext = null;
                }
            } catch (e) {
                console.log('Error closing audio context:', e);
            }
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
                if (stateText) stateText.textContent = '';
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
