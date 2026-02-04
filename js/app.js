import { db } from './db.js';

// Configuration
const PAGE_SIZE = 50;

// State
let currentPage = 0;
let totalItems = 0;
let currentItems = [];
let selectedId = null;

// Initialize
window.addEventListener('DOMContentLoaded', async () => {
    await db.init();
    await refreshStats();
    loadPage(0);

    // Shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 's') {
            e.preventDefault();
            app.saveItem();
        }
        if (e.ctrlKey && e.key === 'k') {
            e.preventDefault();
            app.skipItem();
        }
    });

    // File Upload Listener
    document.getElementById('file-upload').addEventListener('change', handleFileUpload);
});

async function refreshStats() {
    totalItems = await db.getCount();
    document.getElementById('stats-counter').textContent = `Total: ${totalItems}`;

    // Update pagination buttons
    const maxPage = Math.ceil(totalItems / PAGE_SIZE) - 1;
    document.querySelector('button[onclick="app.nextPage()"]').disabled = currentPage >= maxPage;
    document.querySelector('button[onclick="app.prevPage()"]').disabled = currentPage <= 0;
    document.getElementById('page-indicator').textContent = `Page ${currentPage + 1} of ${maxPage + 1 || 1}`;
}

async function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
        try {
            const json = JSON.parse(event.target.result);

            let itemsToImport = [];

            // Case A: Flat Array (Legacy)
            if (Array.isArray(json)) {
                itemsToImport = json;
            }
            // Case B: Wrapped Object (Project A Export)
            else if (json.samples && Array.isArray(json.samples)) {
                itemsToImport = json.samples;
            }
            else {
                throw new Error('JSON must be an array or have a "samples" array.');
            }

            // Convert to internal format: { original: sms, label: {}, status: 'new' }
            const payload = itemsToImport.map(sms => ({
                original: sms,
                label: {},
                status: 'new'
            }));

            if (confirm(`Import ${payload.length} messages? This will CLEAR existing data.`)) {
                await db.clearAll();
                await db.importBulk(payload);
                alert('Import Successful!');
                location.reload();
            }
        } catch (err) {
            console.error(err);
            alert(`Invalid JSON file: ${err.message}`);
        }
    };
    reader.readAsText(file);
}

// Global App Object
window.app = {
    async prevPage() {
        if (currentPage > 0) {
            currentPage--;
            loadPage(currentPage);
        }
    },

    async nextPage() {
        currentPage++;
        loadPage(currentPage);
    },

    async selectItem(id) {
        selectedId = id;

        // Highlight in List
        document.querySelectorAll('.sms-item').forEach(el => el.classList.remove('selected', 'current'));
        const el = document.getElementById(`item-${id}`);
        if (el) el.classList.add('selected', 'current');

        // Load Data
        const item = await db.getItem(id);
        if (!item) return;

        renderEditor(item);
    },

    autoFill() {
        // Regex heuristics for auto-fill based on body
        const body = document.getElementById('p-body').textContent;

        // 1. Amount ( Rs 123.45 )
        const amtMatch = body.match(/(?:Rs\.?|INR)\s*([\d,]+\.?\d*)/i);
        if (amtMatch) {
            document.getElementById('inp-amount').value = amtMatch[1].replace(/,/g, '');
        }

        // 2. Account ( xx1234 )
        const accMatch = body.match(/(?:x+|X+|\*+)(\d{4})/);
        if (accMatch) {
            document.getElementById('inp-acc').value = accMatch[1];
        }

        // 3. Merchant (at AMAZON) - very basic heuristic
        const merchMatch = body.match(/(?:at|to|from)\s+([A-Z0-9\s]+?)(?:\s+(?:on|via|ref)|$)/i);
        if (merchMatch) {
            let m = merchMatch[1].trim();
            if (m.length > 20) m = m.substring(0, 20); // Safety cap
            document.getElementById('inp-merchant').value = m;
        }

        // 4. Intent Guessing
        if (/otp|code/i.test(body)) document.getElementById('inp-intent').value = 'OTP';
        else if (/debited/i.test(body)) {
            document.getElementById('inp-intent').value = 'TRANSACTION';
            document.getElementById('inp-type').value = 'EXPENSE';
        }
        else if (/credited/i.test(body)) {
            document.getElementById('inp-intent').value = 'TRANSACTION';
            document.getElementById('inp-type').value = 'INCOME';
        }
    },

    async saveItem() {
        if (!selectedId) return;

        const labelData = {
            intent: document.getElementById('inp-intent').value,
            amount: parseFloat(document.getElementById('inp-amount').value) || null,
            account_digits: document.getElementById('inp-acc').value,
            merchant_cleaned: document.getElementById('inp-merchant').value,
            transaction_type: document.getElementById('inp-type').value,
            transaction_status: document.getElementById('inp-status').value,
            // Add timestamp of edit
            labeled_at: Date.now()
        };

        await db.updateItem(selectedId, {
            label: labelData,
            status: 'done'
        });

        // Mark visual as done
        const el = document.getElementById(`item-${selectedId}`);
        if (el) el.classList.add('done');

        // Auto-advance
        this.nextItemInPage();
    },

    async skipItem() {
        if (!selectedId) return;
        await db.updateItem(selectedId, { status: 'skipped' });

        // Mark visual
        const el = document.getElementById(`item-${selectedId}`);
        if (el) {
            el.classList.add('done');
            el.style.opacity = '0.3';
        }

        this.nextItemInPage();
    },

    nextItemInPage() {
        // Find next Sibling ID
        const currentEl = document.getElementById(`item-${selectedId}`);
        const nextEl = currentEl.nextElementSibling;
        if (nextEl) {
            const nextId = parseInt(nextEl.id.replace('item-', ''));
            this.selectItem(nextId);
        } else {
            alert('End of Page. Go to next page ->');
        }
    },

    async exportData() {
        const allItems = await db.getAllExport();

        // Transform to Schema
        const exportJson = allItems.map(item => {
            // Merge Label with basic Structure
            // This structure mimics `expected` block in Master JSON
            return {
                input: item.original,
                expected_label: item.label,
                status: item.status
            };
        });

        const blob = new Blob([JSON.stringify(exportJson, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `sms_labels_export_${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
    }
};

async function loadPage(pageIndex) {
    const listEl = document.getElementById('sms-list');
    listEl.innerHTML = '<div class="p-4 text-center">Loading...</div>';

    currentItems = await db.getPage(pageIndex, PAGE_SIZE);

    listEl.innerHTML = '';

    if (currentItems.length === 0) {
        listEl.innerHTML = '<div class="p-4 text-center text-slate-400">Page Empty</div>';
        return;
    }

    currentItems.forEach(item => {
        const div = document.createElement('div');
        div.id = `item-${item.id}`;
        div.className = `sms-item p-3 border-b border-slate-100 hover:bg-slate-50 cursor-pointer ${item.status === 'done' ? 'done' : ''} ${item.status === 'skipped' ? 'text-slate-300' : ''}`;
        div.onclick = () => app.selectItem(item.id);

        const sender = item.original.sender || 'UNKNOWN';
        const bodySnippet = (item.original.body || '').substring(0, 45) + '...';

        div.innerHTML = `
            <div class="flex justify-between mb-1">
                <span class="font-bold text-xs text-indigo-700">${sender}</span>
                <span class="text-xs text-slate-400">#${item.id}</span>
            </div>
            <div class="text-xs text-slate-600 font-mono">${bodySnippet}</div>
        `;
        listEl.appendChild(div);
    });

    refreshStats();
}

function renderEditor(item) {
    document.getElementById('empty-state').classList.add('hidden');
    document.getElementById('editor-container').classList.remove('hidden');

    // Preview
    document.getElementById('p-sender').textContent = item.original.sender;
    document.getElementById('p-date').textContent = new Date(item.original.timestamp).toLocaleString();
    document.getElementById('p-body').textContent = item.original.body;

    // Form Values (Load existing or default)
    const label = item.label || {};

    document.getElementById('inp-intent').value = label.intent || 'N/A';
    document.getElementById('inp-amount').value = label.amount || '';
    document.getElementById('inp-acc').value = label.account_digits || '';
    document.getElementById('inp-merchant').value = label.merchant_cleaned || '';
    document.getElementById('inp-type').value = label.transaction_type || 'N/A';
    document.getElementById('inp-status').value = label.transaction_status || 'N/A';
}
