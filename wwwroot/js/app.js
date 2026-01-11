/**
 * Main Application Controller
 */

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
    console.log('Sound Control initialized');

    // Load version info
    loadVersion();

    // Setup tab navigation
    setupTabNavigation();

    // Setup event listeners
    setupEventListeners();

    // Initialize modules
    await speakers.init();
    favorites.init();
    queue.init();
});

/**
 * Load and display the app version
 */
async function loadVersion() {
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
}

/**
 * Tests the connection to the soco-cli server
 */
async function testConnection() {
    const indicator = document.getElementById('status-indicator');
    const statusText = indicator.querySelector('.status-text');
    
    statusText.textContent = 'Testing...';
    indicator.className = 'status-indicator';

    try {
        const status = await api.getServerStatus();
        
        if (status.isRunning) {
            // Try to get speakers to confirm full connectivity
            const speakerList = await api.getSpeakers();
            indicator.className = 'status-indicator connected';
            statusText.textContent = `${speakerList.length} speaker${speakerList.length !== 1 ? 's' : ''}`;
            showToast('Connection successful', 'success');
        } else {
            indicator.className = 'status-indicator error';
            statusText.textContent = 'Server not running';
            showToast('Server is not running. Click Discover to start.', 'warning');
        }
    } catch (error) {
        indicator.className = 'status-indicator error';
        statusText.textContent = 'Connection failed';
        showToast(`Connection test failed: ${error.message}`, 'error');
    }
}

/**
 * Setup all event listeners
 */
function setupEventListeners() {
    // Discover speakers button
    document.getElementById('discover-btn').addEventListener('click', async () => {
        await speakers.discover();
    });

    // New macro button
    document.getElementById('new-macro-btn').addEventListener('click', () => {
        macros.create();
    });

    // Macro modal close button
    document.getElementById('close-modal').addEventListener('click', () => {
        toggleMacroModal(false);
    });

    // Cancel macro button
    document.getElementById('cancel-macro-btn').addEventListener('click', () => {
        toggleMacroModal(false);
    });

    // Macro form submit
    document.getElementById('macro-form').addEventListener('submit', async (e) => {
        await macros.save(e);
    });

    // Export macros button
    document.getElementById('export-macros-btn').addEventListener('click', async () => {
        await macros.export();
    });

    // Import macros button
    document.getElementById('import-macros-btn').addEventListener('click', () => {
        macros.showImportDialog();
    });

    // Macros file info button
    const macrosInfoBtn = document.getElementById('macros-file-info-btn');
    if (macrosInfoBtn) {
        macrosInfoBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            macros.toggleFileInfo();
        });
    }

    // Copy file path button
    const copyPathBtn = document.getElementById('copy-file-path-btn');
    if (copyPathBtn) {
        copyPathBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            macros.copyFilePath();
        });
    }

    // Close tooltip when clicking outside
    document.addEventListener('click', (e) => {
        const tooltip = document.getElementById('macros-file-tooltip');
        const infoBtn = document.getElementById('macros-file-info-btn');
        if (tooltip && infoBtn && !tooltip.contains(e.target) && !infoBtn.contains(e.target)) {
            tooltip.style.display = 'none';
        }
    });

    // Import file input change handler
    document.getElementById('import-file-input').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) {
            await macros.handleImportFile(file);
            e.target.value = ''; // Reset input so same file can be selected again
        }
    });

    // Import modal event listeners
    document.getElementById('close-import-modal').addEventListener('click', () => {
        macros.closeImportModal();
    });

    document.getElementById('import-merge-btn').addEventListener('click', () => {
        macros.handleImportMerge();
    });

    document.getElementById('import-replace-btn').addEventListener('click', () => {
        macros.handleImportReplace();
    });

    // Close import modal when clicking outside
    document.getElementById('import-modal').addEventListener('click', (e) => {
        if (e.target.id === 'import-modal') {
            macros.closeImportModal();
        }
    });

    // Close modal when clicking outside
    document.getElementById('macro-editor-modal').addEventListener('click', (e) => {
        if (e.target.id === 'macro-editor-modal') {
            toggleMacroModal(false);
        }
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        // ESC to close modal
        if (e.key === 'Escape') {
            const macroModal = document.getElementById('macro-editor-modal');
            const importModal = document.getElementById('import-modal');
            
            if (importModal.classList.contains('active')) {
                macros.closeImportModal();
            } else if (macroModal.classList.contains('active')) {
                toggleMacroModal(false);
            }
        }

        // Ctrl/Cmd + N for new macro (when on macros tab)
        if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
            const macrosTab = document.getElementById('macros-tab');
            if (macrosTab.classList.contains('active')) {
                e.preventDefault();
                macros.create();
            }
        }

        // Ctrl/Cmd + R to refresh speakers
        if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
            const speakersTab = document.getElementById('speakers-tab');
            if (speakersTab.classList.contains('active')) {
                e.preventDefault();
                speakers.discover();
            }
        }
    });

    // Tab change listener to load content
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const tabName = btn.dataset.tab;
            // Content loading is now handled in setupTabNavigation()
        });
    });

    // Favorites speaker selector change
    document.getElementById('favorites-speaker-select')?.addEventListener('change', () => {
        // Speaker selection changed - content will reload when user interacts
    });

    // Queue speaker selector change
    document.getElementById('queue-speaker-select')?.addEventListener('change', () => {
        queue.load();
    });

    // Note: Favorites sub-tab navigation is handled in favorites.setupEventListeners()
}

// Global error handler
window.addEventListener('error', (e) => {
    console.error('Global error:', e.error);
});

window.addEventListener('unhandledrejection', (e) => {
    console.error('Unhandled promise rejection:', e.reason);
});
