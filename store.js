// store.js
const StorageKey = {
    ITEMS: 'inventory_items',
    TRANSACTIONS: 'inventory_transactions',
    PERSONS: 'inventory_persons'
};

class Store {
    static getItems() {
        const items = localStorage.getItem(StorageKey.ITEMS);
        return items ? JSON.parse(items) : [];
    }

    static saveItems(items) {
        localStorage.setItem(StorageKey.ITEMS, JSON.stringify(items));
        if (window.syncToSupabase) window.syncToSupabase();
    }

    static addItem(name) {
        const items = this.getItems();
        const newItem = {
            id: Date.now().toString(),
            name: name
        };
        items.push(newItem);
        this.saveItems(items);
        return newItem;
    }

    static deleteItem(id) {
        let items = this.getItems();
        items = items.filter(item => item.id !== id);
        this.saveItems(items);
    }

    static updateItem(id, newName) {
        const items = this.getItems();
        const item = items.find(i => i.id === id);
        if (item) {
            item.name = newName;
            this.saveItems(items);
            
            // Update item name in existing transactions
            let txs = this.getTransactions();
            let txsUpdated = false;
            txs.forEach(tx => {
                if (tx.itemId === id) {
                    tx.itemName = newName;
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
        if (persons) return JSON.parse(persons);
        
        const txs = this.getTransactions();
        const uniqueNames = [...new Set(txs.map(t => t.person).filter(p => p))];
        const newPersonsList = uniqueNames.map((name, idx) => ({
            id: Date.now().toString() + '-' + idx,
            name: name
        }));
        this.savePersons(newPersonsList);
        return newPersonsList;
    }

    static savePersons(persons) {
        localStorage.setItem(StorageKey.PERSONS, JSON.stringify(persons));
        if (window.syncToSupabase) window.syncToSupabase();
    }

    static addPerson(name) {
        const persons = this.getPersons();
        const exists = persons.find(p => p.name.toLowerCase() === name.toLowerCase());
        if (exists) return exists;

        const newPerson = {
            id: Date.now().toString(),
            name: name
        };
        persons.push(newPerson);
        this.savePersons(persons);
        return newPerson;
    }

    static getTransactions() {
        const txs = localStorage.getItem(StorageKey.TRANSACTIONS);
        return txs ? JSON.parse(txs) : [];
    }

    static saveTransactions(transactions) {
        localStorage.setItem(StorageKey.TRANSACTIONS, JSON.stringify(transactions));
        if (window.syncToSupabase) window.syncToSupabase();
    }

    static addTransaction(tx) {
        const txs = this.getTransactions();
        tx.id = 'TXN-' + Math.floor(Math.random() * 1000000);
        tx.date = tx.date || new Date().toISOString();
        txs.unshift(tx); // Add to beginning
        this.saveTransactions(txs);
        return tx;
    }

    static updateTransaction(id, updatedTx) {
        let txs = this.getTransactions();
        const index = txs.findIndex(tx => tx.id === id);
        if (index !== -1) {
            // Preserve the original date and ID, update the rest
            updatedTx.id = id;
            updatedTx.date = txs[index].date;
            txs[index] = updatedTx;
            this.saveTransactions(txs);
        }
    }

    static deleteTransaction(id) {
        let txs = this.getTransactions();
        txs = txs.filter(tx => tx.id !== id);
        this.saveTransactions(txs);
    }
}

// Make Store available globally
window.Store = Store;
