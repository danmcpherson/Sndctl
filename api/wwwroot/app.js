/**
 * Simple test application for Raspberry Pi environment
 */

const API_BASE_URL = '/api';

/**
 * Fetch all sample items from the API
 * @returns {Promise<Array>} Array of sample items
 */
async function fetchItems() {
    const response = await fetch(`${API_BASE_URL}/sample`);
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
}

/**
 * Create a new sample item
 * @param {Object} item - The item to create
 * @returns {Promise<Object>} The created item
 */
async function createItem(item) {
    const response = await fetch(`${API_BASE_URL}/sample`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(item)
    });
    
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    return await response.json();
}

/**
 * Display items in the UI
 * @param {Array} items - Array of items to display
 */
function displayItems(items) {
    const container = document.getElementById('items-container');
    
    if (items.length === 0) {
        container.innerHTML = '<p class="loading">No items found. Add one below!</p>';
        return;
    }
    
    const list = document.createElement('ul');
    list.className = 'item-list';
    
    items.forEach(item => {
        const li = document.createElement('li');
        li.className = 'item';
        li.innerHTML = `
            <div class="item-name">${escapeHtml(item.name)}</div>
            <div class="item-desc">${escapeHtml(item.description || 'No description')}</div>
        `;
        list.appendChild(li);
    });
    
    container.innerHTML = '';
    container.appendChild(list);
}

/**
 * Load and display all items
 */
async function loadItems() {
    try {
        const items = await fetchItems();
        displayItems(items);
        updateStatus(true);
    } catch (error) {
        console.error('Error loading items:', error);
        document.getElementById('items-container').innerHTML = 
            '<div class="error-message">Failed to load items. Is the API running?</div>';
        updateStatus(false);
    }
}

/**
 * Update connection status indicator
 * @param {boolean} connected - Whether the connection is successful
 */
function updateStatus(connected) {
    const statusEl = document.getElementById('status');
    if (connected) {
        statusEl.textContent = '✓ Connected to API';
        statusEl.className = 'status connected';
    } else {
        statusEl.textContent = '✗ API Connection Failed';
        statusEl.className = 'status error';
    }
}

/**
 * Show error message in the form
 * @param {string} message - Error message to display
 */
function showError(message) {
    const errorContainer = document.getElementById('error-container');
    errorContainer.innerHTML = `<div class="error-message">${escapeHtml(message)}</div>`;
    setTimeout(() => {
        errorContainer.innerHTML = '';
    }, 5000);
}

/**
 * Escape HTML to prevent XSS
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Initialize the application
 */
function init() {
    // Load items on page load
    loadItems();
    
    // Handle form submission
    const form = document.getElementById('add-item-form');
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const submitButton = form.querySelector('button[type="submit"]');
        submitButton.disabled = true;
        submitButton.textContent = 'Adding...';
        
        try {
            const formData = new FormData(form);
            const item = {
                name: formData.get('name'),
                description: formData.get('description') || null
            };
            
            await createItem(item);
            form.reset();
            await loadItems();
        } catch (error) {
            console.error('Error creating item:', error);
            showError('Failed to add item. Please try again.');
        } finally {
            submitButton.disabled = false;
            submitButton.textContent = 'Add Item';
        }
    });
}

// Start the app when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
