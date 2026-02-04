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
        // Regex heuristics
        const body = document.getElementById('p-body').textContent;
        const sender = document.getElementById('p-sender').textContent;

        // 1. Amount
        const amtMatch = body.match(/(?:Rs\.?|INR)\s*([\d,]+\.?\d*)/i);
        if (amtMatch) {
            document.getElementById('inp-amount').value = amtMatch[1].replace(/,/g, '');
        }

        // 2. Account
        const accMatch = body.match(/(?:x+|X+|\*+)(\d{4})/);
        if (accMatch) document.getElementById('inp-acc').value = accMatch[1];

        // 3. Bank Name (Basic Sender Map)
        if (sender.includes('HDFC')) document.getElementById('inp-bank').value = 'HDFC';
        else if (sender.includes('ICICI')) document.getElementById('inp-bank').value = 'ICICI';
        else if (sender.includes('SBI')) document.getElementById('inp-bank').value = 'SBI';
        else if (sender.includes('AXIS')) document.getElementById('inp-bank').value = 'AXIS';

        // 4. Merchant Guess
        // Simple 'at MERCHANT' or 'to MERCHANT'
        const merchMatch = body.match(/(?:at|to|from)\s+([A-Z0-9\s]+?)(?:\s+(?:on|via|ref)|$)/i);
        if (merchMatch) {
            let m = merchMatch[1].trim();
            if (m.length > 25) m = m.substring(0, 25);
            document.getElementById('inp-merch-raw').value = m;
            document.getElementById('inp-merch-clean').value = m.toLowerCase();
            document.getElementById('inp-match-key').value = m.toLowerCase();
            document.getElementById('inp-match-method').value = 'WORD_MATCH';
            document.getElementById('inp-category').value = 'misc'; // Default
        }

        // 5. Intent/Status Guess
        if (/otp|code/i.test(body)) {
            document.getElementById('inp-intent').value = 'OTP';
            document.getElementById('inp-status').value = 'PENDING_OTP';
        } else if (/debited/i.test(body)) {
            document.getElementById('inp-intent').value = 'TRANSACTION';
            document.getElementById('inp-type').value = 'EXPENSE';
            document.getElementById('inp-status').value = 'COMPLETED';
        } else if (/credited/i.test(body)) {
            document.getElementById('inp-intent').value = 'TRANSACTION';
            document.getElementById('inp-type').value = 'INCOME';
            document.getElementById('inp-status').value = 'COMPLETED';
        }
    },

    async saveItem() {
        if (!selectedId) return;

        // Construct the Nested Schema Object
        const labelData = {
            parsing: {
                intent: val('inp-intent'),
                amount: floatVal('inp-amount'),
                merchant_raw: val('inp-merch-raw'),
                merchant_cleaned: val('inp-merch-clean'),
                account_digits: val('inp-acc'),
                transaction_type: val('inp-type'),
                balance_available: floatVal('inp-balance'),
                // We don't have is_otp input, derive from intent
                is_otp: val('inp-intent') === 'OTP',
                upi_ref: val('inp-upi'),
                date_extracted: val('inp-date-ext')
            },
            categorization: {
                category_id: val('inp-category'),
                match_method: val('inp-match-method'),
                matched_keyword: val('inp-match-key'),
                // default values we can't fully guess yet
                confidence: 1.0
            },
            account_resolution: {
                bank_name: val('inp-bank'),
                account_last_4: val('inp-acc'),
                account_type: val('inp-acc-type')
            },
            transaction_fields: {
                amount: floatVal('inp-amount'),
                status: val('inp-status'),
                type: val('inp-type'),
                reward_points: floatVal('inp-rewards'),
                is_hidden: document.getElementById('inp-hidden').checked,
                currency: 'INR',
                timestamp: currentItems.find(i => i.id === selectedId).original.timestamp
            },
            meta: {
                labeled_at: Date.now()
            }
        };

        await db.updateItem(selectedId, {
            label: labelData,
            status: 'done'
        });

        const el = document.getElementById(`item-${selectedId}`);
        if (el) el.classList.add('done');
        this.nextItemInPage();
    },

    async skipItem() {
        if (!selectedId) return;
        await db.updateItem(selectedId, { status: 'skipped' });
        const el = document.getElementById(`item-${selectedId}`);
        if (el) {
            el.classList.add('done');
            el.style.opacity = '0.3';
        }
        this.nextItemInPage();
    },

    nextItemInPage() {
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

        // Transform to Schema for Export
        const exportJson = allItems.map(item => {
            // Reconstruct the JSON structure user wants
            // The 'label' object is already structured in saveItem to match `expected`
            // But we should wrap it nicely.

            // If item is 'new' or 'skipped', label might be empty.
            // If 'done', label checks out.

            return {
                id: `TC_MANUAL_${item.id}`,
                input: item.original,
                // If we have a label, spread it (it contains parsing, cat, etc.)
                // If not, put null or basic
                ... (item.label || { status: 'UNLABELED' })
            };
        });

        const blob = new Blob([JSON.stringify(exportJson, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `sms_labels_export_v1.2_${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
    }
};

// Helper: Get Value
function val(id) {
    const el = document.getElementById(id);
    return el ? el.value : null;
}
function floatVal(id) {
    const v = val(id);
    return v ? parseFloat(v) : null;
}

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

    // Form Values
    // Check if we have the NEW nested structure (label.parsing) or OLD flat structure
    const L = item.label || {};
    const parsing = L.parsing || {};
    const cat = L.categorization || {};
    const acc = L.account_resolution || {};
    const tx = L.transaction_fields || {};

    // Flat mapping fallback (if migrating from v1.0 data)
    const flatIntent = L.intent || parsing.intent || 'N/A';
    const flatAmount = L.amount || parsing.amount || '';
    const flatAcc = L.account_digits || parsing.account_digits || '';
    const flatMerchClean = L.merchant_cleaned || parsing.merchant_cleaned || '';
    const flatType = L.transaction_type || tx.type || 'N/A';
    const flatStatus = L.transaction_status || tx.status || 'N/A';

    // Populate Fields
    document.getElementById('inp-intent').value = flatIntent;
    document.getElementById('inp-amount').value = flatAmount;
    document.getElementById('inp-balance').value = parsing.balance_available || '';
    document.getElementById('inp-merch-raw').value = parsing.merchant_raw || '';
    document.getElementById('inp-merch-clean').value = flatMerchClean;
    document.getElementById('inp-upi').value = parsing.upi_ref || '';
    document.getElementById('inp-date-ext').value = parsing.date_extracted || '';

    document.getElementById('inp-bank').value = acc.bank_name || '';
    document.getElementById('inp-acc').value = flatAcc; // Shared
    document.getElementById('inp-acc-type').value = acc.account_type || 'N/A';

    document.getElementById('inp-category').value = cat.category_id || 'N/A';
    document.getElementById('inp-match-method').value = cat.match_method || 'N/A';
    document.getElementById('inp-match-key').value = cat.matched_keyword || '';

    document.getElementById('inp-type').value = flatType;
    document.getElementById('inp-status').value = flatStatus;
    document.getElementById('inp-rewards').value = tx.reward_points || '';
    document.getElementById('inp-hidden').checked = !!tx.is_hidden;
}
