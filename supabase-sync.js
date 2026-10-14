// supabase-sync.js - Safe Two-Way Merging Engine

// Safe merger for transactions: combines local & remote, honors deleted IDs, sorts newest first
function mergeTransactions(localJson, remoteJson, deletedIds = []) {
    let local = [];
    let remote = [];
    try { local = localJson ? JSON.parse(localJson) : []; } catch (e) { local = []; }
    try { remote = remoteJson ? JSON.parse(remoteJson) : []; } catch (e) { remote = []; }

    const map = new Map();
    const deletedSet = new Set(deletedIds);

    // Add remote transactions (ignore if deleted)
    remote.forEach(tx => {
        if (tx && tx.id && !deletedSet.has(tx.id)) {
            map.set(tx.id, tx);
        }
    });

    // Add/overlay local transactions (ignore if deleted)
    local.forEach(tx => {
        if (tx && tx.id && !deletedSet.has(tx.id)) {
            map.set(tx.id, tx);
        }
    });

    const merged = Array.from(map.values()).sort((a, b) => new Date(b.date) - new Date(a.date));
    return JSON.stringify(merged);
}

// Safe merger for items
function mergeItems(localJson, remoteJson, deletedIds = []) {
    let local = [];
    let remote = [];
    try { local = localJson ? JSON.parse(localJson) : []; } catch (e) { local = []; }
    try { remote = remoteJson ? JSON.parse(remoteJson) : []; } catch (e) { remote = []; }

    const map = new Map();
    const deletedSet = new Set(deletedIds);

    remote.forEach(item => {
        if (item && item.id && !deletedSet.has(item.id)) {
            map.set(item.id, item);
        }
    });
    local.forEach(item => {
        if (item && item.id && !deletedSet.has(item.id)) {
            map.set(item.id, item);
        }
    });

    return JSON.stringify(Array.from(map.values()));
}

// Safe merger for persons
function mergePersons(localJson, remoteJson) {
    let local = [];
    let remote = [];
    try { local = localJson ? JSON.parse(localJson) : []; } catch (e) { local = []; }
    try { remote = remoteJson ? JSON.parse(remoteJson) : []; } catch (e) { remote = []; }

    const map = new Map();
    remote.forEach(p => {
        if (p && p.name) map.set(p.name.toLowerCase().trim(), p);
    });
    local.forEach(p => {
        if (p && p.name) map.set(p.name.toLowerCase().trim(), p);
    });

    return JSON.stringify(Array.from(map.values()));
}

// Function to pull data from Supabase
window.pullFromSupabase = async () => {
    if (!window.supabaseClient) return;

    const { data: sessionData } = await window.supabaseClient.auth.getSession();
    if (!sessionData || !sessionData.session) return;

    const email = sessionData.session.user.email;

    try {
        const { data, error } = await window.supabaseClient
            .from('user_data')
            .select('data')
            .eq('email', email)
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                console.log("No Supabase backup found. Pushing current data.");
                window.syncToSupabase();
                return;
            }
            throw error;
        }

        if (data && data.data) {
            const remoteData = data.data;

            // Merge deleted transaction IDs
            const localDeletedTxs = JSON.parse(localStorage.getItem('inventory_deleted_txs') || '[]');
            const remoteDeletedTxs = JSON.parse(remoteData['inventory_deleted_txs'] || '[]');
            const allDeletedTxs = Array.from(new Set([...localDeletedTxs, ...remoteDeletedTxs]));

            // Merge deleted item IDs
            const localDeletedItems = JSON.parse(localStorage.getItem('inventory_deleted_items') || '[]');
            const remoteDeletedItems = JSON.parse(remoteData['inventory_deleted_items'] || '[]');
            const allDeletedItems = Array.from(new Set([...localDeletedItems, ...remoteDeletedItems]));

            // Smart-merge core datasets
            const mergedTx = mergeTransactions(
                localStorage.getItem('inventory_transactions'),
                remoteData['inventory_transactions'],
                allDeletedTxs
            );

            const mergedItems = mergeItems(
                localStorage.getItem('inventory_items'),
                remoteData['inventory_items'],
                allDeletedItems
            );

            const mergedPersons = mergePersons(
                localStorage.getItem('inventory_persons'),
                remoteData['inventory_persons']
            );

            let dataChanged = false;

            if (localStorage.getItem('inventory_transactions') !== mergedTx) {
                localStorage.setItem('inventory_transactions', mergedTx);
                dataChanged = true;
            }
            if (localStorage.getItem('inventory_items') !== mergedItems) {
                localStorage.setItem('inventory_items', mergedItems);
                dataChanged = true;
            }
            if (localStorage.getItem('inventory_persons') !== mergedPersons) {
                localStorage.setItem('inventory_persons', mergedPersons);
                dataChanged = true;
            }

            localStorage.setItem('inventory_deleted_txs', JSON.stringify(allDeletedTxs));
            localStorage.setItem('inventory_deleted_items', JSON.stringify(allDeletedItems));

            // Merge any remaining configuration keys
            for (const key in remoteData) {
                if (!['inventory_transactions', 'inventory_items', 'inventory_persons', 'inventory_deleted_txs', 'inventory_deleted_items'].includes(key)) {
                    if (!localStorage.getItem(key) && remoteData[key]) {
                        localStorage.setItem(key, remoteData[key]);
                        dataChanged = true;
                    }
                }
            }

            localStorage.setItem('supabase_last_sync', Date.now().toString());

            // If local had transactions that remote didn't have, push the merged union back
            const remoteTxList = remoteData['inventory_transactions'] ? JSON.parse(remoteData['inventory_transactions']) : [];
            const mergedTxList = JSON.parse(mergedTx);
            if (mergedTxList.length > remoteTxList.length) {
                console.log("Local has additional records. Syncing merged database back to cloud.");
                window.syncToSupabase();
            }

            if (dataChanged) {
                console.log("Data updated from cloud. Reloading view.");
                location.reload();
            }
        }
    } catch (error) {
        console.error("Failed to pull from Supabase:", error);
    }
};

// Function to push data to Supabase (with pre-merge safety)
window.syncToSupabase = async () => {
    if (!window.supabaseClient) return;

    const { data: sessionData } = await window.supabaseClient.auth.getSession();
    if (!sessionData || !sessionData.session) return;

    const email = sessionData.session.user.email;

    // First fetch remote data to merge before uploading
    let mergedTxJson = localStorage.getItem('inventory_transactions');
    let mergedItemsJson = localStorage.getItem('inventory_items');
    let mergedPersonsJson = localStorage.getItem('inventory_persons');
    let allDeletedTxs = JSON.parse(localStorage.getItem('inventory_deleted_txs') || '[]');
    let allDeletedItems = JSON.parse(localStorage.getItem('inventory_deleted_items') || '[]');

    try {
        const { data: remoteRow } = await window.supabaseClient
            .from('user_data')
            .select('data')
            .eq('email', email)
            .single();

        if (remoteRow && remoteRow.data) {
            const remoteData = remoteRow.data;
            const remoteDeletedTxs = JSON.parse(remoteData['inventory_deleted_txs'] || '[]');
            allDeletedTxs = Array.from(new Set([...allDeletedTxs, ...remoteDeletedTxs]));

            const remoteDeletedItems = JSON.parse(remoteData['inventory_deleted_items'] || '[]');
            allDeletedItems = Array.from(new Set([...allDeletedItems, ...remoteDeletedItems]));

            mergedTxJson = mergeTransactions(mergedTxJson, remoteData['inventory_transactions'], allDeletedTxs);
            mergedItemsJson = mergeItems(mergedItemsJson, remoteData['inventory_items'], allDeletedItems);
            mergedPersonsJson = mergePersons(mergedPersonsJson, remoteData['inventory_persons']);

            localStorage.setItem('inventory_transactions', mergedTxJson);
            localStorage.setItem('inventory_items', mergedItemsJson);
            localStorage.setItem('inventory_persons', mergedPersonsJson);
            localStorage.setItem('inventory_deleted_txs', JSON.stringify(allDeletedTxs));
            localStorage.setItem('inventory_deleted_items', JSON.stringify(allDeletedItems));
        }
    } catch (e) {
        console.warn("Could not pre-fetch remote data before sync, proceeding with local:", e);
    }

    const data = {};
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key.startsWith('inventory_') || key.startsWith('sm_')) {
            data[key] = localStorage.getItem(key);
        }
    }

    try {
        const { error } = await window.supabaseClient
            .from('user_data')
            .upsert({ email: email, data: data, updated_at: new Date().toISOString() }, { onConflict: 'email' });

        if (error) throw error;

        localStorage.setItem('supabase_last_sync', Date.now().toString());
        localStorage.removeItem('unsynced_changes');
        console.log("Successfully synced to Supabase!");
    } catch (error) {
        console.error("Failed to sync to Supabase:", error);
    }
};
