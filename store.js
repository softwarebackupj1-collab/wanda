// store.js - Local-First Storage Layer
const StorageKey = {
    ITEMS: 'inventory_items',
    TRANSACTIONS: 'inventory_transactions',
    PERSONS: 'inventory_persons',
    LOCAL_VAULT: 'sm_local_transactions_vault'
};

class Store {
    // Notify the sync engine that local data has changed on the laptop
    static notifyChange() {
        localStorage.setItem('unsynced_changes', 'true');
        localStorage.setItem('sm_pending_sync_time', Date.now().toString());

        // Update UI indicator immediately so user sees "Saved on Laptop"
        if (window.updateSyncStatus) {
            window.updateSyncStatus('local_saved', 'Saved on Laptop');
        }

        // Schedule background sync to Supabase (debounced)
        if (window.scheduleSyncToSupabase) {
            window.scheduleSyncToSupabase();
        } else if (window.syncToSupabase) {
            window.syncToSupabase();
        }
    }

    // Save transaction to local immutable laptop vault to prevent any data loss
    static backupToLocalVault(tx) {
        if (!tx || !tx.id) return;
        try {
            const vaultJson = localStorage.getItem(StorageKey.LOCAL_VAULT);
            const vault = vaultJson ? JSON.parse(vaultJson) : [];
            const existingIndex = vault.findIndex(t => t.id === tx.id);
            if (existingIndex === -1) {
                vault.push(tx);
            } else {
                vault[existingIndex] = tx;
            }
            localStorage.setItem(StorageKey.LOCAL_VAULT, JSON.stringify(vault));
        } catch (e) {
            console.warn("Could not save to local vault:", e);
        }
    }

    static getItems() {
        const items = localStorage.getItem(StorageKey.ITEMS);
        return items ? JSON.parse(items) : [];
    }

    static saveItems(items) {
        // 1. First, save immediately to the laptop
        localStorage.setItem(StorageKey.ITEMS, JSON.stringify(items));
        // 2. Later, notify sync engine to sync online
        this.notifyChange();
    }

    static addItem(name) {
        const items = this.getItems();
        const now = new Date().toISOString();
        const newItem = {
            id: Date.now().toString() + '-' + Math.floor(1000 + Math.random() * 9000),
            name: name,
            createdAt: now,
            updatedAt: now,
            _synced: false
        };
        items.push(newItem);
        this.saveItems(items);
        return newItem;
    }

    static deleteItem(id) {
        let items = this.getItems();
        items = items.filter(item => item.id !== id);
        let deleted = JSON.parse(localStorage.getItem('inventory_deleted_items') || '[]');
        if (!deleted.includes(id)) {
            deleted.push(id);
            localStorage.setItem('inventory_deleted_items', JSON.stringify(deleted));
        }
        this.saveItems(items);
    }

    static updateItem(id, newName) {
        const items = this.getItems();
        const item = items.find(i => i.id === id);
        if (item) {
            item.name = newName;
            item.updatedAt = new Date().toISOString();
            item._synced = false;
            this.saveItems(items);

            // Update item name in existing transactions
            let txs = this.getTransactions();
            let txsUpdated = false;
            txs.forEach(tx => {
                if (tx.itemId === id) {
                    tx.itemName = newName;
                    tx.updatedAt = new Date().toISOString();
                    tx._synced = false;
                    txsUpdated = true;
                }
            });
            if (txsUpdated) {
                this.saveTransactions(txs);
            }
        }
    }

    static getPersons() {
        const persons = localStorage.getItem(StorageKey.PERSONS);
        let personsList = persons ? JSON.parse(persons) : [];

        const txs = this.getTransactions();

        // Find the oldest transaction date for each person to sort them chronologically
        const firstSeen = {};
        for (let i = txs.length - 1; i >= 0; i--) {
            const tx = txs[i];
            if (tx.person && !firstSeen[tx.person.toLowerCase()]) {
                firstSeen[tx.person.toLowerCase()] = new Date(tx.date).getTime();
            }
        }

        // Reverse txs so oldest are first when discovering unique names
        const uniqueNames = [...new Set([...txs].reverse().map(t => t.person).filter(p => p))];

        let changed = false;
        uniqueNames.forEach(name => {
            if (!personsList.find(p => p.name.toLowerCase() === name.toLowerCase())) {
                const now = new Date().toISOString();
                personsList.push({
                    id: Date.now().toString() + '-' + Math.random().toString(36).substr(2, 9),
                    name: name,
                    createdAt: now,
                    updatedAt: now,
                    _synced: false
                });
                changed = true;
            }
        });

        const originalOrder = personsList.map(p => p.id).join(',');

        // Always ensure personsList is sorted chronologically
        personsList.sort((a, b) => {
            const timeA = firstSeen[a.name.toLowerCase()] || parseInt(a.id) || 0;
            const timeB = firstSeen[b.name.toLowerCase()] || parseInt(b.id) || 0;
            return timeA - timeB;
        });

        const newOrder = personsList.map(p => p.id).join(',');
        if (originalOrder !== newOrder) {
            changed = true;
        }

        // Save if we found new persons from transactions, or if order changed, or no stored list (and it has items)
        if (changed || (!persons && personsList.length > 0)) {
            this.savePersons(personsList);
        } else if (!persons) {
            localStorage.setItem(StorageKey.PERSONS, JSON.stringify(personsList));
        }

        return personsList;
    }

    static savePersons(persons) {
        // 1. Save immediately to laptop
        localStorage.setItem(StorageKey.PERSONS, JSON.stringify(persons));
        // 2. Notify sync engine
        this.notifyChange();
    }

    static addPerson(name) {
        const persons = this.getPersons();
        const exists = persons.find(p => p.name.toLowerCase() === name.toLowerCase());
        if (exists) return exists;

        const now = new Date().toISOString();
        const newPerson = {
            id: Date.now().toString() + '-' + Math.floor(1000 + Math.random() * 9000),
            name: name,
            createdAt: now,
            updatedAt: now,
            _synced: false
        };
        persons.push(newPerson);
        this.savePersons(persons);
        return newPerson;
    }

    static getTransactions() {
        const txs = localStorage.getItem(StorageKey.TRANSACTIONS);
        const list = txs ? JSON.parse(txs) : [];
        return list.sort((a, b) => new Date(b.date) - new Date(a.date));
    }

    static saveTransactions(transactions) {
        // 1. Always keep ordered by date descending
        const sorted = (transactions || []).sort((a, b) => new Date(b.date) - new Date(a.date));

        // 2. Save directly to laptop localStorage first
        localStorage.setItem(StorageKey.TRANSACTIONS, JSON.stringify(sorted));

        // 3. Backup newly added items to laptop immutable vault
        sorted.slice(0, 10).forEach(t => this.backupToLocalVault(t));

        // 4. Notify sync engine to later push new data online
        this.notifyChange();
    }

    static addTransaction(tx) {
        const txs = this.getTransactions();
        const now = new Date().toISOString();

        // Generate robust unique ID (date timestamp + random digit)
        if (!tx.id) {
            tx.id = 'TXN-' + Date.now().toString().slice(-6) + Math.floor(1000 + Math.random() * 9000);
        }
        tx.date = tx.date || now;
        tx.createdAt = tx.createdAt || tx.date || now;
        tx.updatedAt = now;
        tx.deviceId = tx.deviceId || (window.getDeviceId ? window.getDeviceId() : 'laptop');
        tx.deviceName = tx.deviceName || (window.getDeviceName ? window.getDeviceName() : 'Laptop');
        tx._synced = false;

        txs.unshift(tx); // Add to beginning
        this.saveTransactions(txs);
        return tx;
    }

    static updateTransaction(id, updatedTx) {
        let txs = this.getTransactions();
        const index = txs.findIndex(tx => tx.id === id);
        if (index !== -1) {
            // Preserve the original date, ID, createdAt; update updatedAt
            const orig = txs[index];
            updatedTx.id = id;
            updatedTx.date = orig.date;
            updatedTx.createdAt = orig.createdAt || orig.date;
            updatedTx.updatedAt = new Date().toISOString();
            updatedTx.deviceId = orig.deviceId || (window.getDeviceId ? window.getDeviceId() : 'laptop');
            updatedTx.deviceName = orig.deviceName || (window.getDeviceName ? window.getDeviceName() : 'Laptop');
            updatedTx._synced = false;

            txs[index] = updatedTx;
            this.saveTransactions(txs);
        }
    }

    static deleteTransaction(id) {
        let txs = this.getTransactions();
        txs = txs.filter(tx => tx.id !== id);

        let deleted = JSON.parse(localStorage.getItem('inventory_deleted_txs') || '[]');
        if (!deleted.includes(id)) {
            deleted.push(id);
            localStorage.setItem('inventory_deleted_txs', JSON.stringify(deleted));
        }

        this.saveTransactions(txs);
    }
}

// Make Store available globally
window.Store = Store;
