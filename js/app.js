import { db } from './db.js';

// Configuration
const PAGE_SIZE = 50;

// State
let currentPage = 0;
let totalItems = 0;
let currentItems = [];
let selectedId = null;

// Initialize
// Initialize
window.addEventListener('DOMContentLoaded', () => {
    window.app.init();
});

// Removed legacy refreshStats


const CATEGORIES = [
    { id: "dining", name: "Dining & Food", parent_id: null },
    { id: "shopping", name: "Shopping & Retail", parent_id: null },
    { id: "travel", name: "Travel & Transport", parent_id: null },
    { id: "entertainment", name: "Entertainment", parent_id: null },
    { id: "healthcare", name: "Healthcare & Wellness", parent_id: null },
    { id: "bills", name: "Bills & Utilities", parent_id: null },
    { id: "financial", name: "Financial Services", parent_id: null },
    { id: "education", name: "Education", parent_id: null },
    { id: "personal-care", name: "Personal Care", parent_id: null },
    { id: "home", name: "Home & Living", parent_id: null },
    { id: "others", name: "Others", parent_id: null },
    { id: "dining-delivery", name: "Food Delivery", parent_id: "dining" },
    { id: "dining-restaurants", name: "Restaurants", parent_id: "dining" },
    { id: "dining-groceries", name: "Groceries", parent_id: "dining" },
    { id: "shopping-ecommerce", name: "E-commerce", parent_id: "shopping" },
    { id: "shopping-jewellery", name: "Jewellery & Accessories", parent_id: "shopping" },
    { id: "shopping-electronics", name: "Electronics & Gadgets", parent_id: "shopping" },
    { id: "shopping-fashion", name: "Fashion & Apparel", parent_id: "shopping" },
    { id: "travel-flight", name: "Flight Bookings", parent_id: "travel" },
    { id: "travel-cab", name: "Cab & Ride Sharing", parent_id: "travel" },
    { id: "travel-hotel", name: "Hotel Bookings", parent_id: "travel" },
    { id: "travel-fuel", name: "Fuel & Petrol", parent_id: "travel" },
    { id: "travel-parking", name: "Parking & Tolls", parent_id: "travel" },
    { id: "bills-electricity", name: "Electricity", parent_id: "bills" },
    { id: "bills-mobile", name: "Mobile Recharge", parent_id: "bills" },
    { id: "bills-broadband", name: "Broadband & Internet", parent_id: "bills" },
    { id: "bills-water", name: "Water Bill", parent_id: "bills" },
    { id: "bills-gas", name: "Gas Bill", parent_id: "bills" },
    { id: "financial-wallet", name: "Wallet Loading", parent_id: "financial" },
    { id: "financial-transfer", name: "Money Transfers", parent_id: "financial" },
    { id: "financial-emi", name: "EMI Payments", parent_id: "financial" },
    { id: "financial-insurance", name: "Insurance", parent_id: "financial" },
    { id: "financial-investment", name: "Investments & SIP", parent_id: "financial" },
    { id: "entertainment-ott", name: "OTT Subscriptions", parent_id: "entertainment" },
    { id: "entertainment-movies", name: "Movies & Cinema", parent_id: "entertainment" },
    { id: "entertainment-gaming", name: "Gaming", parent_id: "entertainment" },
    { id: "healthcare-pharmacy", name: "Pharmacy & Medicine", parent_id: "healthcare" },
    { id: "healthcare-fitness", name: "Gym & Fitness", parent_id: "healthcare" },
    { id: "personal-care-salon", name: "Salon & Spa", parent_id: "personal-care" },
    { id: "home-furniture", name: "Furniture", parent_id: "home" },
    { id: "home-appliances", name: "Home Appliances", parent_id: "home" },
    { id: "education-online", name: "Online Courses", parent_id: "education" },
    { id: "education-school", name: "School Fees", parent_id: "education" }
];

const TAGS = ["alert", "atm", "balance", "bill-payment", "card-swipe", "card-update", "cashback", "charge", "cheque", "complete-fields", "confirmation", "contra", "critical", "debit", "dining", "document-expiry", "emi", "emi-converted", "emi-offer", "expense", "failed", "fd", "fund-block", "hdfc", "income", "info", "info-only", "interest", "investment", "kyc", "lien", "limit-update", "loan", "mandate", "maturity", "metadata", "multiline", "orphaned", "overdue", "p2p", "parent-linking", "payment-due", "pin-error", "points", "pos", "promotional", "recharge", "refund", "reminder", "renewal", "reversed", "rewards", "security", "server-error", "si", "sip", "smartbuy", "statement", "status-test", "subscription", "transfer", "unconfirmed", "upcoming-debit", "upi", "utility"];

// Global State for Tags
let currentTags = [];

// Global App Object
window.app = {
    async init() {
        console.log('App Initializing...');
        await db.init();
        this.initCategories();
        this.initTags();
        this.bindEvents();
        this.refreshList();
    },

    initCategories() {
        const select = document.getElementById('inp-category');
        select.innerHTML = '<option value="N/A">N/A</option>';

        // 1. Get Parents
        const parents = CATEGORIES.filter(c => !c.parent_id);

        parents.forEach(p => {
            // Add Parent
            const pOption = document.createElement('option');
            pOption.value = p.id;
            pOption.textContent = p.name; // Keep parent Selectable
            pOption.style.fontWeight = 'bold';
            select.appendChild(pOption);

            // Add Children
            const children = CATEGORIES.filter(c => c.parent_id === p.id);
            children.forEach(c => {
                const cOption = document.createElement('option');
                cOption.value = c.id;
                cOption.textContent = `  ↳ ${c.name}`; // Indent
                select.appendChild(cOption);
            });
        });
    },

    initTags() {
        const select = document.getElementById('inp-tags-select');
        select.innerHTML = '<option value="">-- Select Tag --</option>';
        TAGS.forEach(tag => {
            const opt = document.createElement('option');
            opt.value = tag;
            opt.textContent = tag;
            select.appendChild(opt);
        });
    },

    addTagFromSelect() {
        const select = document.getElementById('inp-tags-select');
        const tag = select.value;
        if (tag && !currentTags.includes(tag)) {
            currentTags.push(tag);
            this.renderTags();
        }
        select.value = ''; // Reset
    },

    removeTag(tag) {
        currentTags = currentTags.filter(t => t !== tag);
        this.renderTags();
    },

    renderTags() {
        const container = document.getElementById('tags-container');
        container.innerHTML = '';
        currentTags.forEach(tag => {
            const span = document.createElement('span');
            span.className = 'bg-indigo-100 text-indigo-700 px-2 py-1 rounded text-xs font-bold flex items-center gap-1';
            span.innerHTML = `
                ${tag}
                <button onclick="app.removeTag('${tag}')" class="hover:text-red-500 text-indigo-400 font-bold ml-1">×</button>
            `;
            container.appendChild(span);
        });
    },

    bindEvents() {
        document.getElementById('file-upload').addEventListener('change', (e) => this.handleFileUpload(e));

        // Keybindings
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 's') {
                e.preventDefault();
                this.saveItem();
            }
            if (e.ctrlKey && e.key === 'k') {
                e.preventDefault();
                this.skipItem();
            }
        });
    },

    async handleFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const json = JSON.parse(e.target.result);

                let data = [];
                if (Array.isArray(json)) {
                    data = json;
                } else if (Array.isArray(json.messages)) {
                    data = json.messages;
                } else if (Array.isArray(json.samples)) {
                    data = json.samples;
                } else if (Array.isArray(json.test_cases)) {
                    // Map test_cases input to expected structure if needed, or just take them
                    // Test cases usually have { input: { body, sender... } }
                    // Our app expects item.sender or item.original.sender
                    // Let's normalize later. For now just grab the array.
                    data = json.test_cases.map(tc => tc.input ? { ...tc.input, ...tc } : tc);
                } else {
                    throw new Error("JSON must contain an array, or 'messages', 'samples', or 'test_cases' list.");
                }

                // Add Unique DB ID if not present + Unique ID for Export
                const processed = data.map(item => {
                    // Normalize: If item has 'input' key (from some exports), flatten it or stick to standard
                    const sms = item.input || item.original || item;

                    return {
                        original: sms, // Keep the raw SMS data in 'original'
                        timestamp: sms.timestamp || Date.now(),
                        manual_id: item.manual_id || item.id || `hash_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                        // Preserve label if re-importing
                        ...(item.label ? { label: item.label, status: 'done' } : { label: {}, status: 'new' })
                    };
                });

                await db.importData(processed);
                this.refreshList();
                alert(`Imported ${processed.length} messages.`);
            } catch (err) {
                console.error(err);
                alert(`Import Failed: ${err.message}`);
            }
        };
        reader.readAsText(file);
    },

    // ... (rest of simple methods)

    async refreshList() {
        const count = await db.countItems();
        const stats = await db.getStats();

        const total = count;
        const done = stats.done || 0;
        const skipped = stats.skipped || 0;

        document.getElementById('stats-counter').textContent = `${done} / ${total} Done (${skipped} Skipped)`;

        // Load Page
        await loadPage(currentPage);
        document.getElementById('page-indicator').textContent = `Page ${currentPage + 1}`;
    },

    prevPage() {
        if (currentPage > 0) {
            currentPage--;
            this.refreshList();
        }
    },

    nextPage() {
        currentPage++;
        this.refreshList();
    },

    async selectItem(id) {
        selectedId = id;
        const item = await db.getItem(id);
        if (item) {
            renderEditor(item);
            // Highlight list item
            document.querySelectorAll('.sms-item').forEach(el => el.classList.remove('bg-indigo-50', 'border-indigo-500'));
            const el = document.getElementById(`item-${id}`);
            if (el) {
                el.classList.add('bg-indigo-50', 'border-indigo-500');
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }
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
            document.getElementById('inp-category').value = 'others'; // Default
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

        const item = currentItems.find(i => i.id === selectedId);
        const original = item.original || {};

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
                is_otp: val('inp-intent') === 'OTP',
                upi_ref: val('inp-upi'),
                date_extracted: val('inp-date-ext')
            },
            categorization: {
                category_id: val('inp-category'),
                // Match Method REMOVED by user request
                matched_keyword: val('inp-match-key'),
                confidence: 1.0
            },
            account_resolution: {
                bank_name: val('inp-bank'),
                account_last_4: val('inp-acc'),
                account_type: val('inp-acc-type')
            },
            transaction_fields: {
                parent_transaction_id: original.manual_id || null, // The Unique ID
                amount: floatVal('inp-amount'),
                status: val('inp-status'),
                type: val('inp-type'),
                reward_points: floatVal('inp-rewards'),
                is_hidden: document.getElementById('inp-hidden').checked,
                currency: val('inp-currency'),
                timestamp: original.timestamp,
                notes: val('inp-notes'),
                tags: currentTags // Array of strings
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

        const exportJson = allItems.map(item => {
            return {
                id: item.original.manual_id || `TC_MANUAL_${item.id}`,
                input: item.original,
                ... (item.label || { status: 'UNLABELED' })
            };
        });

        const blob = new Blob([JSON.stringify(exportJson, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `sms_labels_export_v1.4_${new Date().toISOString().slice(0, 10)}.json`;
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

    // refreshStats(); // Handled by app.refreshList
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
    document.getElementById('inp-match-key').value = cat.matched_keyword || '';

    document.getElementById('inp-type').value = flatType;
    document.getElementById('inp-status').value = flatStatus;
    document.getElementById('inp-rewards').value = tx.reward_points || '';
    document.getElementById('inp-currency').value = tx.currency || 'INR';
    document.getElementById('inp-notes').value = tx.notes || '';
    document.getElementById('inp-hidden').checked = !!tx.is_hidden;

    // Tags
    currentTags = tx.tags || [];
    // If migrating from 'input.tags', consider checking item.original.tags (but usually we label fresh)
    if (currentTags.length === 0 && item.original.tags) {
        // Pre-fill from existing tags if any (optional feature, maybe useful)
        // currentTags = [...item.original.tags]; 
    }
    app.renderTags();
}
