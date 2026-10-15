// supabase-sync.js - Multi-Laptop Realtime & Local-First Supabase Sync Engine
// Designed for multi-device deployments (e.g. hosted on Vercel across multiple store/office laptops)
// Logic:
// 1. Data is ALWAYS saved immediately and safely on the laptop (localStorage + local vault).
// 2. Background sync checks if local data is new or modified compared to Supabase.
// 3. Old data in Supabase is NEVER deleted - every remote transaction, item, and person is preserved.
// 4. Supabase Realtime & Heartbeat automatically syncs changes across all connected laptops in real-time.
// 5. Cross-tab storage listeners sync multiple browser tabs on the same laptop.

(function () {
    let syncTimeout = null;
    let isSyncing = false;
    let realtimeChannel = null;

    // Device Identification for Multi-Laptop Tracking
    window.getDeviceId = function () {
        let id = localStorage.getItem('sm_device_id');
        if (!id) {
            id = 'Laptop-' + Math.random().toString(36).substr(2, 5).toUpperCase();
            localStorage.setItem('sm_device_id', id);
        }
        return id;
    };

    window.getDeviceName = function () {
        return localStorage.getItem('sm_device_name') || window.getDeviceId();
    };

    window.setDeviceName = function (name) {
        if (!name || !name.trim()) return;
        localStorage.setItem('sm_device_name', name.trim());
        window.updateSyncStatus();
    };

    // Helper: Safely parse JSON with fallback
    function safeParse(json, fallback) {
        if (!json) return fallback;
        if (typeof json === 'object') return json;
        try {
            return JSON.parse(json);
        } catch (e) {
            return fallback;
        }
    }

    // Helper: Check if two transactions have identical meaningful data
    function areTransactionsEqual(a, b) {
        if (!a || !b) return false;
        if (a.id !== b.id) return false;
        if (a.totalAmount !== b.totalAmount) return false;
        if (a.paidAmount !== b.paidAmount) return false;
        if (a.remainingAmount !== b.remainingAmount) return false;
        if (a.person !== b.person) return false;
        if (a.type !== b.type) return false;
        if (a.date !== b.date) return false;
        return true;
    }

    // Read all relevant data currently stored on this laptop
    function getLaptopData() {
        return {
            transactions: safeParse(localStorage.getItem('inventory_transactions'), []),
            items: safeParse(localStorage.getItem('inventory_items'), []),
            persons: safeParse(localStorage.getItem('inventory_persons'), []),
            deletedTxs: safeParse(localStorage.getItem('inventory_deleted_txs'), []),
            deletedItems: safeParse(localStorage.getItem('inventory_deleted_items'), [])
        };
    }

    // Check if the laptop has new or updated data that is not in Supabase yet
    window.checkNewData = function (remoteData) {
        const local = getLaptopData();
        const remoteTx = safeParse(remoteData ? remoteData['inventory_transactions'] : null, []);
        const remoteItems = safeParse(remoteData ? remoteData['inventory_items'] : null, []);
        const remotePersons = safeParse(remoteData ? remoteData['inventory_persons'] : null, []);

        const remoteTxMap = new Map();
        remoteTx.forEach(t => { if (t && t.id) remoteTxMap.set(t.id, t); });

        const remoteItemMap = new Map();
        const remoteItemNameMap = new Map();
        remoteItems.forEach(i => {
            if (i && i.id) remoteItemMap.set(i.id, i);
            if (i && i.name) remoteItemNameMap.set(i.name.toLowerCase().trim(), i);
        });

        const remotePersonMap = new Map();
        remotePersons.forEach(p => {
            if (p && p.name) remotePersonMap.set(p.name.toLowerCase().trim(), p);
        });

        // 1. Transactions check
        const newTransactions = [];
        const modifiedTransactions = [];
        local.transactions.forEach(ltx => {
            if (!ltx || !ltx.id) return;
            if (!remoteTxMap.has(ltx.id)) {
                newTransactions.push(ltx);
            } else {
                const rtx = remoteTxMap.get(ltx.id);
                if (!areTransactionsEqual(ltx, rtx)) {
                    modifiedTransactions.push(ltx);
                }
            }
        });

        // 2. Items check
        const newItems = local.items.filter(li => {
            if (!li || !li.name) return false;
            const hasId = li.id && remoteItemMap.has(li.id);
            const hasName = remoteItemNameMap.has(li.name.toLowerCase().trim());
            return !hasId && !hasName;
        });

        // 3. Persons check
        const newPersons = local.persons.filter(lp => {
            if (!lp || !lp.name) return false;
            return !remotePersonMap.has(lp.name.toLowerCase().trim());
        });

        // 4. Check if remote has records that this laptop is missing (created on another laptop)
        const localTxMap = new Map(local.transactions.map(t => [t.id, t]));
        const missingFromLaptopTx = remoteTx.filter(rtx => rtx && rtx.id && !localTxMap.has(rtx.id));
        const missingFromLaptopItems = remoteItems.filter(ri => ri && ri.name && !local.items.some(li => li.name.toLowerCase().trim() === ri.name.toLowerCase().trim()));
        const missingFromLaptopPersons = remotePersons.filter(rp => rp && rp.name && !local.persons.some(lp => lp.name.toLowerCase().trim() === rp.name.toLowerCase().trim()));

        const hasLocalNewData = (
            newTransactions.length > 0 ||
            modifiedTransactions.length > 0 ||
            newItems.length > 0 ||
            newPersons.length > 0 ||
            localStorage.getItem('unsynced_changes') === 'true'
        );

        const hasRemoteMissingData = (
            missingFromLaptopTx.length > 0 ||
            missingFromLaptopItems.length > 0 ||
            missingFromLaptopPersons.length > 0
        );

        let summary = [];
        if (newTransactions.length > 0) summary.push(`${newTransactions.length} new invoice(s)`);
        if (modifiedTransactions.length > 0) summary.push(`${modifiedTransactions.length} updated invoice(s)`);
        if (newItems.length > 0) summary.push(`${newItems.length} new item(s)`);
        if (newPersons.length > 0) summary.push(`${newPersons.length} new person(s)`);

        return {
            hasNewData: hasLocalNewData,
            newTransactions,
            modifiedTransactions,
            newItems,
            newPersons,
            summary: summary.join(', ') || 'No changes',
            hasRemoteMissingData,
            missingFromLaptop: {
                transactions: missingFromLaptopTx,
                items: missingFromLaptopItems,
                persons: missingFromLaptopPersons
            }
        };
    };

    // Non-destructive safe merger: Preserves 100% of old remote data and merges local data
    window.mergeWithoutDeleting = function (remoteData, localData) {
        const remoteTx = safeParse(remoteData ? remoteData['inventory_transactions'] : null, []);
        const remoteItems = safeParse(remoteData ? remoteData['inventory_items'] : null, []);
        const remotePersons = safeParse(remoteData ? remoteData['inventory_persons'] : null, []);

        const localTx = localData.transactions || [];
        const localItems = localData.items || [];
        const localPersons = localData.persons || [];

        // --- MERGE TRANSACTIONS (NEVER delete any remote transaction) ---
        const txMap = new Map();
        // 1. Keep ALL remote transactions (old data is 100% preserved)
        remoteTx.forEach(tx => {
            if (tx && tx.id) {
                txMap.set(tx.id, tx);
            }
        });
        // 2. Add or update with local transactions
        localTx.forEach(tx => {
            if (tx && tx.id) {
                if (!txMap.has(tx.id)) {
                    // New transaction from this laptop
                    txMap.set(tx.id, { ...tx, _synced: true });
                } else {
                    // Existing transaction - keep whichever has newest updatedAt or date
                    const existing = txMap.get(tx.id);
                    const localTime = new Date(tx.updatedAt || tx.date).getTime();
                    const remoteTime = new Date(existing.updatedAt || existing.date).getTime();
                    if (localTime >= remoteTime) {
                        txMap.set(tx.id, { ...tx, _synced: true });
                    }
                }
            }
        });
        const mergedTransactions = Array.from(txMap.values()).sort((a, b) => new Date(b.date) - new Date(a.date));

        // --- MERGE ITEMS (NEVER delete any remote item) ---
        const itemMap = new Map();
        const itemNameMap = new Map();
        remoteItems.forEach(item => {
            if (item && item.id) {
                itemMap.set(item.id, item);
                if (item.name) itemNameMap.set(item.name.toLowerCase().trim(), item.id);
            }
        });
        localItems.forEach(item => {
            if (item && item.id) {
                const nameKey = item.name ? item.name.toLowerCase().trim() : '';
                if (!itemMap.has(item.id) && (!nameKey || !itemNameMap.has(nameKey))) {
                    itemMap.set(item.id, item);
                    if (nameKey) itemNameMap.set(nameKey, item.id);
                } else if (itemMap.has(item.id)) {
                    // Keep updated item name if present
                    itemMap.set(item.id, item);
                }
            }
        });
        const mergedItems = Array.from(itemMap.values());

        // --- MERGE PERSONS (NEVER delete any remote person) ---
        const personMap = new Map();
        remotePersons.forEach(person => {
            if (person && person.name) {
                personMap.set(person.name.toLowerCase().trim(), person);
            }
        });
        localPersons.forEach(person => {
            if (person && person.name) {
                const key = person.name.toLowerCase().trim();
                if (!personMap.has(key)) {
                    personMap.set(key, person);
                }
            }
        });
        const mergedPersons = Array.from(personMap.values());

        // CRITICAL INTEGRITY CHECK: Merged counts MUST NOT decrease compared to remote
        if (mergedTransactions.length < remoteTx.length) {
            throw new Error(`Integrity protection aborted: Merged transactions (${mergedTransactions.length}) is less than remote (${remoteTx.length}). Old data cannot be deleted.`);
        }
        if (mergedItems.length < remoteItems.length) {
            throw new Error(`Integrity protection aborted: Merged items (${mergedItems.length}) is less than remote (${remoteItems.length}). Old data cannot be deleted.`);
        }

        return {
            transactions: mergedTransactions,
            items: mergedItems,
            persons: mergedPersons
        };
    };

    // Smoothly refresh UI elements without disruptive page reload
    function refreshViews() {
        try {
            if (typeof window.renderInvoicesTable === 'function') window.renderInvoicesTable();
            if (typeof window.updateDashboard === 'function') window.updateDashboard();
            if (typeof window.populateStockItemSelect === 'function') window.populateStockItemSelect();
            if (typeof window.populatePersonSelect === 'function') window.populatePersonSelect();
            if (typeof window.renderItemsTable === 'function') window.renderItemsTable();
            if (typeof window.renderOutstandingBalances === 'function') window.renderOutstandingBalances();
        } catch (e) {
            console.warn("View refresh warning:", e);
        }
    }

    // Update the visual sync badge in the top navigation bar
    window.updateSyncStatus = function (status, message, details) {
        let badge = document.getElementById('sync-status-indicator');
        if (!badge) {
            badge = injectSyncBadge();
        }
        if (!badge) return;

        // Maintain current status if none passed
        if (!status) {
            status = badge.getAttribute('data-status') || 'synced';
        }
        badge.setAttribute('data-status', status);
        badge.className = `sync-status-pill sync-${status}`;

        const lang = localStorage.getItem('lang') || 'en';
        const isUrdu = lang === 'ur';
        const deviceName = window.getDeviceName();

        let iconHtml = '';
        let textHtml = '';

        if (status === 'synced') {
            iconHtml = "<i class='bx bx-check-circle sync-icon-synced'></i>";
            textHtml = message || (isUrdu ? 'تمام لیپ ٹاپ سنک شدہ' : 'Live Sync Active');
            badge.title = details || (isUrdu ? `${deviceName}: تمام لیپ ٹاپ اور کلاؤڈ میں ڈیٹا مکمل محفوظ ہے۔` : `${deviceName}: Fully synced with cloud. Changes will appear live on all laptops.`);
        } else if (status === 'local_saved') {
            iconHtml = "<i class='bx bx-laptop sync-icon-local'></i>";
            textHtml = message || (isUrdu ? 'لیپ ٹاپ میں محفوظ' : 'Saved on Laptop');
            badge.title = details || (isUrdu ? 'ڈیٹا اس لیپ ٹاپ پر محفوظ ہے۔ جلد کلاؤڈ میں خودکار بھیجا جائے گا۔' : 'Data is saved on this laptop. Will sync to other laptops shortly.');
        } else if (status === 'syncing') {
            iconHtml = "<i class='bx bx-loader-alt bx-spin sync-icon-syncing'></i>";
            textHtml = message || (isUrdu ? 'کلاؤڈ سے رابطہ...' : 'Syncing...');
            badge.title = details || 'Communicating with cloud database...';
        } else if (status === 'offline') {
            iconHtml = "<i class='bx bx-wifi-off sync-icon-offline'></i>";
            textHtml = message || (isUrdu ? 'آف لائن (لیپ ٹاپ محفوظ)' : 'Offline (Saved on Laptop)');
            badge.title = details || (isUrdu ? 'انٹرنیٹ بند ہے۔ تمام کام اس لیپ ٹاپ پر محفوظ ہے۔' : 'No internet connection. Everything is safely stored on this laptop.');
        } else if (status === 'error') {
            iconHtml = "<i class='bx bx-error-circle sync-icon-error'></i>";
            textHtml = message || (isUrdu ? 'سنک توقف (لیپ ٹاپ محفوظ)' : 'Sync Paused');
            badge.title = details || 'Safe mode: Data kept on this laptop. Click to retry.';
        }

        badge.innerHTML = `
            ${iconHtml}
            <span class="sync-text">${textHtml}</span>
            <span class="sync-device-tag" title="Click to rename device" onclick="event.stopPropagation(); window.promptDeviceName();">${deviceName}</span>
            <button class="sync-now-btn" title="${isUrdu ? 'ابھی سنک کریں' : 'Sync Now'}" onclick="event.stopPropagation(); window.syncToSupabase({ force: true, interactive: true });">
                <i class='bx bx-sync'></i>
            </button>
        `;
    };

    // Allow user to name their laptop (e.g., Shop Counter 1, Office Laptop)
    window.promptDeviceName = function () {
        const current = window.getDeviceName();
        const newName = prompt("Enter a name for this laptop (e.g. Shop Counter 1, Warehouse, Admin):", current);
        if (newName && newName.trim()) {
            window.setDeviceName(newName.trim());
        }
    };

    // Inject sync badge into header if not present
    function injectSyncBadge() {
        if (document.getElementById('sync-status-indicator')) {
            return document.getElementById('sync-status-indicator');
        }

        const topActions = document.querySelector('.top-actions');
        if (!topActions) return null;

        const badge = document.createElement('div');
        badge.id = 'sync-status-indicator';
        badge.className = 'sync-status-pill sync-synced';
        badge.onclick = () => window.syncToSupabase({ force: true, interactive: true });

        // Insert before right-side buttons in top-actions
        const rightContainer = topActions.querySelector('div[style*="margin-left: auto"]') || topActions.lastElementChild;
        if (rightContainer && rightContainer.parentNode === topActions) {
            topActions.insertBefore(badge, rightContainer);
        } else {
            topActions.appendChild(badge);
        }

        return badge;
    }

    // Schedule background sync (debounced, so laptop operations remain instant)
    window.scheduleSyncToSupabase = function (delayMs = 2500) {
        if (syncTimeout) {
            clearTimeout(syncTimeout);
        }

        // Show "Saved on Laptop" immediately
        window.updateSyncStatus('local_saved', 'Saved on Laptop', 'Data saved locally on this laptop. Broadcasting to cloud shortly...');

        syncTimeout = setTimeout(() => {
            syncTimeout = null;
            window.syncToSupabase();
        }, delayMs);
    };

    // PULL DATA FROM SUPABASE (Multi-Laptop Live Reception)
    window.pullFromSupabase = async (options = {}) => {
        if (!window.supabaseClient) return;

        const { data: sessionData } = await window.supabaseClient.auth.getSession();
        if (!sessionData || !sessionData.session) return;

        const email = sessionData.session.user.email;

        try {
            if (!options.isBackground) {
                window.updateSyncStatus('syncing', 'Checking cloud updates...');
            }

            const { data: remoteRow, error } = await window.supabaseClient
                .from('user_data')
                .select('data, updated_at')
                .eq('email', email)
                .single();

            if (error) {
                if (error.code === 'PGRST116') {
                    console.log("[Sync] First time account. Pushing initial local data to Supabase.");
                    window.syncToSupabase({ force: true });
                    return;
                }
                throw error;
            }

            if (remoteRow && remoteRow.data) {
                const remoteData = remoteRow.data;
                const localData = getLaptopData();

                // Non-destructive merge preserving ALL records across all laptops
                const merged = window.mergeWithoutDeleting(remoteData, localData);

                let dataChangedLocally = false;
                const mergedTxJson = JSON.stringify(merged.transactions);
                const mergedItemsJson = JSON.stringify(merged.items);
                const mergedPersonsJson = JSON.stringify(merged.persons);

                if (localStorage.getItem('inventory_transactions') !== mergedTxJson) {
                    localStorage.setItem('inventory_transactions', mergedTxJson);
                    dataChangedLocally = true;
                }
                if (localStorage.getItem('inventory_items') !== mergedItemsJson) {
                    localStorage.setItem('inventory_items', mergedItemsJson);
                    dataChangedLocally = true;
                }
                if (localStorage.getItem('inventory_persons') !== mergedPersonsJson) {
                    localStorage.setItem('inventory_persons', mergedPersonsJson);
                    dataChangedLocally = true;
                }

                // Merge any other config keys without deleting local ones
                for (const key in remoteData) {
                    if (!['inventory_transactions', 'inventory_items', 'inventory_persons', 'inventory_deleted_txs', 'inventory_deleted_items'].includes(key)) {
                        if (!localStorage.getItem(key) && remoteData[key]) {
                            localStorage.setItem(key, remoteData[key]);
                            dataChangedLocally = true;
                        }
                    }
                }

                localStorage.setItem('supabase_last_sync', Date.now().toString());

                // Check if this laptop also had offline records that remote didn't have
                const diff = window.checkNewData(remoteData);
                if (diff.hasNewData) {
                    console.log("[Sync] This laptop has offline records not in cloud. Uploading merged union to Supabase:", diff.summary);
                    await window.syncToSupabase({ force: true });
                } else {
                    window.updateSyncStatus('synced', 'Live Sync Active');
                }

                if (dataChangedLocally) {
                    console.log("[Sync] Received and merged updates from another laptop smoothly.");
                    refreshViews();
                }
            }
        } catch (error) {
            console.error("[Sync] Failed to pull from Supabase:", error);
            window.updateSyncStatus('local_saved', 'Saved on Laptop');
        }
    };

    // MAIN SYNC TO SUPABASE FUNCTION
    // Multi-Laptop Safe Pipeline:
    // 1. Data is saved in the laptop first.
    // 2. Checks if this laptop's data is new compared to Supabase.
    // 3. Merges and sends online without deleting ANY old data.
    // 4. Supabase Realtime alerts all other laptops.
    window.syncToSupabase = async (options = {}) => {
        if (isSyncing) {
            console.log("[Sync] Sync already in progress, queued.");
            return;
        }

        if (!navigator.onLine) {
            console.log("[Sync] Laptop is currently offline. Data remains safely stored on laptop.");
            window.updateSyncStatus('offline', 'Offline (Saved on Laptop)');
            return;
        }

        if (!window.supabaseClient) {
            window.updateSyncStatus('local_saved', 'Saved on Laptop');
            return;
        }

        const { data: sessionData } = await window.supabaseClient.auth.getSession();
        if (!sessionData || !sessionData.session) {
            window.updateSyncStatus('local_saved', 'Saved on Laptop (Login to sync)');
            return;
        }

        const email = sessionData.session.user.email;
        isSyncing = true;

        try {
            window.updateSyncStatus('syncing', 'Checking for new data...');

            // STEP 1: Pre-fetch remote cloud data first to verify and ensure NO old data is lost
            let remoteRow = null;
            try {
                const { data, error } = await window.supabaseClient
                    .from('user_data')
                    .select('data')
                    .eq('email', email)
                    .single();

                if (error) {
                    if (error.code === 'PGRST116') {
                        // First time: remote has no records yet
                        remoteRow = { data: {} };
                    } else {
                        throw error;
                    }
                } else {
                    remoteRow = data;
                }
            } catch (fetchError) {
                console.warn("[Sync] Could not read cloud data:", fetchError);
                // CRITICAL SAFETY SHIELD:
                // NEVER upload local data if we couldn't read remote data!
                // This prevents accidentally overwriting/deleting old records during connection glitches.
                window.updateSyncStatus('local_saved', 'Saved on Laptop (Cloud verification pending)');
                isSyncing = false;
                return;
            }

            const remoteData = (remoteRow && remoteRow.data) ? remoteRow.data : {};

            // STEP 2: Check if this laptop's data is new
            const diff = window.checkNewData(remoteData);
            console.log("[Sync] Diff analysis result:", diff);

            // If this laptop has NO new data, but remote has records from other laptops:
            if (!diff.hasNewData) {
                if (diff.hasRemoteMissingData) {
                    console.log("[Sync] Cloud has records from another laptop. Merging into this laptop...");
                    const merged = window.mergeWithoutDeleting(remoteData, getLaptopData());
                    localStorage.setItem('inventory_transactions', JSON.stringify(merged.transactions));
                    localStorage.setItem('inventory_items', JSON.stringify(merged.items));
                    localStorage.setItem('inventory_persons', JSON.stringify(merged.persons));
                    localStorage.removeItem('unsynced_changes');
                    localStorage.setItem('supabase_last_sync', Date.now().toString());
                    refreshViews();
                }
                localStorage.removeItem('unsynced_changes');
                window.updateSyncStatus('synced', 'Live Sync Active');
                isSyncing = false;
                return;
            }

            // STEP 3: Laptop HAS new data -> Merge non-destructively (never deleting old data)
            window.updateSyncStatus('syncing', `Uploading: ${diff.summary}...`);
            const localData = getLaptopData();
            const merged = window.mergeWithoutDeleting(remoteData, localData);

            // Update this laptop's storage with unified set
            const mergedTxJson = JSON.stringify(merged.transactions);
            const mergedItemsJson = JSON.stringify(merged.items);
            const mergedPersonsJson = JSON.stringify(merged.persons);

            localStorage.setItem('inventory_transactions', mergedTxJson);
            localStorage.setItem('inventory_items', mergedItemsJson);
            localStorage.setItem('inventory_persons', mergedPersonsJson);

            // Construct payload to upload: preserves remote keys + adds local keys
            const uploadPayload = { ...remoteData };
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key.startsWith('inventory_') || key.startsWith('sm_')) {
                    uploadPayload[key] = localStorage.getItem(key);
                }
            }
            uploadPayload['inventory_transactions'] = mergedTxJson;
            uploadPayload['inventory_items'] = mergedItemsJson;
            uploadPayload['inventory_persons'] = mergedPersonsJson;
            uploadPayload['last_updated_by_device'] = window.getDeviceName();

            // STEP 4: Send the combined, safe dataset to Supabase
            const { error: upsertError } = await window.supabaseClient
                .from('user_data')
                .upsert({
                    email: email,
                    data: uploadPayload,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'email' });

            if (upsertError) throw upsertError;

            // STEP 5: Mark sync completed
            localStorage.setItem('supabase_last_sync', Date.now().toString());
            localStorage.removeItem('unsynced_changes');
            localStorage.removeItem('sm_pending_sync_time');

            console.log(`[Sync] SUCCESS! Uploaded safely to Supabase from ${window.getDeviceName()}. ${diff.summary}. Old data completely preserved.`);
            window.updateSyncStatus(
                'synced',
                'Live Sync Active',
                `Successfully synced! ${diff.summary}. All records preserved across all laptops.`
            );

            // Refresh UI in case new items were sorted or updated
            refreshViews();

            if (options.interactive) {
                alert(`Sync Successful!\n\nAll data is safely stored on this laptop and backed up to Supabase.\n${diff.summary}`);
            }

        } catch (error) {
            console.error("[Sync] Sync failed:", error);
            window.updateSyncStatus('local_saved', 'Saved on Laptop (Sync error, will retry)');
        } finally {
            isSyncing = false;
        }
    };

    // SET UP SUPABASE REALTIME LISTENER FOR MULTI-LAPTOP LIVE SYNC
    window.setupRealtimeSync = function (email) {
        if (!window.supabaseClient || !email) return;

        // Cleanup any old channel
        if (realtimeChannel) {
            window.supabaseClient.removeChannel(realtimeChannel);
            realtimeChannel = null;
        }

        const safeChannelName = 'live_sync_' + email.replace(/[^a-zA-Z0-9]/g, '_');
        realtimeChannel = window.supabaseClient
            .channel(safeChannelName)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'user_data',
                filter: `email=eq.${email}`
            }, (payload) => {
                console.log("[Multi-Laptop Sync] Live change detected on Supabase! Another laptop updated the database.");
                // Pull and merge updates in the background
                if (!isSyncing) {
                    window.pullFromSupabase({ isBackground: true });
                }
            })
            .subscribe((status) => {
                console.log("[Multi-Laptop Sync] Realtime channel status:", status);
            });
    };

    // Multi-Laptop Heartbeat & Polling fallback (every 20 seconds)
    // Ensures laptops sync even if WebSockets are blocked by firewall / hotel / mobile hotspot
    setInterval(async () => {
        if (!navigator.onLine || isSyncing || !window.supabaseClient) return;

        const hasUnsynced = localStorage.getItem('unsynced_changes') === 'true';
        if (hasUnsynced) {
            window.syncToSupabase();
            return;
        }

        // Lightweight check: check if updated_at in cloud is newer than this laptop's last sync
        try {
            const { data: sessionData } = await window.supabaseClient.auth.getSession();
            if (!sessionData?.session?.user?.email) return;

            const email = sessionData.session.user.email;
            const { data, error } = await window.supabaseClient
                .from('user_data')
                .select('updated_at')
                .eq('email', email)
                .single();

            if (!error && data && data.updated_at) {
                const cloudTime = new Date(data.updated_at).getTime();
                const localSyncTime = parseInt(localStorage.getItem('supabase_last_sync') || '0');
                if (cloudTime > localSyncTime) {
                    console.log("[Multi-Laptop Sync] Cloud updated by another laptop. Auto-pulling...");
                    window.pullFromSupabase({ isBackground: true });
                }
            }
        } catch (e) {
            // Quiet fallback
        }
    }, 20000);

    // Cross-Tab Listener for multiple tabs open on the same laptop
    window.addEventListener('storage', (event) => {
        if (event.key && event.key.startsWith('inventory_')) {
            console.log("[Cross-Tab Sync] Storage updated in another tab. Refreshing view.");
            refreshViews();
        }
    });

    // Auto-sync on network events:
    window.addEventListener('online', () => {
        console.log("[Sync] Laptop connected to internet. Triggering sync.");
        window.updateSyncStatus('syncing', 'Internet connected. Syncing...');
        window.syncToSupabase();
    });

    window.addEventListener('offline', () => {
        console.log("[Sync] Laptop went offline. Keeping all data on laptop.");
        window.updateSyncStatus('offline', 'Offline (Saved on Laptop)');
    });

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            const hasUnsynced = localStorage.getItem('unsynced_changes') === 'true';
            const lastSync = parseInt(localStorage.getItem('supabase_last_sync') || '0');
            const now = Date.now();
            if (hasUnsynced || (now - lastSync > 30000)) {
                window.syncToSupabase();
            }
        }
    });

    // Initial setup on page load
    document.addEventListener('DOMContentLoaded', async () => {
        injectSyncBadge();
        const hasUnsynced = localStorage.getItem('unsynced_changes') === 'true';
        if (!navigator.onLine) {
            window.updateSyncStatus('offline', 'Offline (Saved on Laptop)');
        } else if (hasUnsynced) {
            window.updateSyncStatus('local_saved', 'Saved on Laptop');
            window.scheduleSyncToSupabase(3000);
        } else {
            window.updateSyncStatus('synced', 'Live Sync Active');
        }

        // Initialize Realtime if session already exists
        if (window.supabaseClient) {
            try {
                const { data: { session } } = await window.supabaseClient.auth.getSession();
                if (session && session.user && session.user.email) {
                    window.setupRealtimeSync(session.user.email);
                }
            } catch (e) { }
        }
    });

})();
