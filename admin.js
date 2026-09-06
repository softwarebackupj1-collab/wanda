// admin.js
document.addEventListener('DOMContentLoaded', () => {


    const addItemForm = document.getElementById('add-item-form');

    // Load initial items if we are on the items page
    if (document.getElementById('items-table')) {
        renderItemsTable();
        if (typeof renderOutstandingBalances === 'function') renderOutstandingBalances();
    }

    if (addItemForm) {
        addItemForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const input = document.getElementById('item-name');
            const itemName = input.value.trim();

            if (itemName) {
                window.Store.addItem(itemName);
                input.value = '';
                if (document.getElementById('items-table')) {
                    renderItemsTable();
                    if (typeof renderOutstandingBalances === 'function') renderOutstandingBalances();
                }
                if (window.populateStockItemSelect) window.populateStockItemSelect();
            }
        });
    }

    // Backup and Restore Logic
    const btnExport = document.getElementById('btn-export-data');
    const btnImport = document.getElementById('btn-import-data');
    const fileInput = document.getElementById('import-data-file');

    if (btnExport) {
        btnExport.addEventListener('click', () => {
            const data = {};
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key.startsWith('inventory_') || key.startsWith('sm_')) { // Export stockmaster keys
                    data[key] = localStorage.getItem(key);
                }
            }
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `StockMaster_Backup_${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        });
    }

    if (btnImport && fileInput) {
        btnImport.addEventListener('click', () => {
            fileInput.click();
        });

        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const data = JSON.parse(event.target.result);
                    if (confirm('Warning: This will overwrite your existing data. Are you sure you want to proceed?')) {
                        for (const key in data) {
                            if (key.startsWith('inventory_') || key.startsWith('sm_')) {
                                localStorage.setItem(key, data[key]);
                            }
                        }
                        alert('Data restored successfully! The page will now reload.');
                        location.reload();
                    }
                } catch (err) {
                    alert('Invalid backup file. Please select a valid JSON backup.');
                }
                fileInput.value = ''; // Reset input
            };
            reader.readAsText(file);
        });
    }
});

function renderItemsTable() {
    const items = window.Store.getItems();
    const tbody = document.querySelector('#items-table tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const transactions = window.Store.getTransactions();

    if (items.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center;">No items added yet.</td></tr>';
        return;
    }

    const itemTotals = {};
    let overallIn = 0;
    let overallOut = 0;
    let overallRem = 0;

    let overallProfit = 0;
    let weekProfit = 0;
    let monthProfit = 0;

    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    items.forEach(item => {
        itemTotals[item.id] = { in: 0, out: 0 };
    });

    // 1. Calculate Average Cost for each item based on all "Stock In" transactions
    const itemCosts = {};
    transactions.forEach(tx => {
        if (tx.type === 'in') {
            const txItems = tx.items || [tx];
            txItems.forEach(item => {
                const id = item.itemId;
                if (!itemCosts[id]) itemCosts[id] = { val: 0, kg: 0 };
                itemCosts[id].val += parseFloat(item.totalAmount) || 0;
                itemCosts[id].kg += parseFloat(item.totalKg) || 0;
            });
        }
    });

    const avgCostPerKg = {};
    for (const id in itemCosts) {
        if (itemCosts[id].kg > 0) {
            avgCostPerKg[id] = itemCosts[id].val / itemCosts[id].kg;
        }
    }

    // 2. Iterate transactions to calculate totals and profit
    transactions.forEach(tx => {
        if (tx.type === 'in') {
            const txItems = tx.items || [tx];
            txItems.forEach(item => {
                overallIn += parseFloat(item.totalKg) || 0;
                if (itemTotals[item.itemId]) itemTotals[item.itemId].in += parseFloat(item.totalKg) || 0;
            });
        } else if (tx.type === 'out') {
            const txItems = tx.items || [tx];
            txItems.forEach(item => {
                overallOut += parseFloat(item.totalKg) || 0;
                if (itemTotals[item.itemId]) itemTotals[item.itemId].out += parseFloat(item.totalKg) || 0;
            });
        }

        // Profit Calculation
        const txDate = new Date(tx.date);
        let profitContribution = 0;

        if (tx.type === 'out') {
            // Total value of this sale
            profitContribution = parseFloat(tx.totalAmount) || 0;
        } else if (tx.type === 'in') {
            // Total value of this purchase
            profitContribution = -(parseFloat(tx.totalAmount) || 0);
        } else {
            // Payments do not affect Accrual Profit (Sales - Purchases)
            profitContribution = 0;
        }

        overallProfit += profitContribution;
        if (txDate >= oneWeekAgo) weekProfit += profitContribution;
        if (txDate >= oneMonthAgo) monthProfit += profitContribution;
    });

    // Calculate overallRem (Accounts Receivable) based on customer balances
    const balancesForRem = {};
    transactions.forEach(tx => {
        if (!tx.person) return;
        if (balancesForRem[tx.person] === undefined) balancesForRem[tx.person] = 0;
        
        const totalAmt = parseFloat(tx.totalAmount) || 0;
        const paidAmt = parseFloat(tx.paidAmount) || 0;
        
        if (tx.type === 'out') {
            balancesForRem[tx.person] += totalAmt;
            balancesForRem[tx.person] -= paidAmt;
        } else if (tx.type === 'in') {
            balancesForRem[tx.person] -= totalAmt;
            balancesForRem[tx.person] += paidAmt;
        } else if (tx.type === 'payment-in' || tx.type === 'payment' || tx.type === 'payment-out') {
            if (tx.type === 'payment-out') {
                balancesForRem[tx.person] += totalAmt;
                balancesForRem[tx.person] += paidAmt;
            } else {
                balancesForRem[tx.person] += totalAmt;
                balancesForRem[tx.person] -= paidAmt;
            }
        }
    });

    overallRem = 0;
    let overallPayables = 0;
    
    for (const person in balancesForRem) {
        let bal = balancesForRem[person];
        
        // ONLY sum positive balances (Receivables / money customers owe)
        if (bal > 0.01) {
            overallRem += bal;
        } else if (bal < -0.01) {
            // Negative balance means we owe them (Payable)
            overallPayables += Math.abs(bal);
        }
    }

    // Update Dashboard Cards
    const elItems = document.getElementById('admin-stat-items');
    const elIn = document.getElementById('admin-stat-in');
    const elOut = document.getElementById('admin-stat-out');
    const elRem = document.getElementById('admin-stat-rem');
    const elPayables = document.getElementById('admin-stat-payables');

    const elProfitWeek = document.getElementById('admin-stat-profit-week');
    const elProfitMonth = document.getElementById('admin-stat-profit-month');
    const elProfitOverall = document.getElementById('admin-stat-profit-overall');

    if (elItems) elItems.textContent = items.length;
    if (elIn) elIn.textContent = overallIn.toFixed(2);
    if (elOut) elOut.textContent = overallOut.toFixed(2);
    if (elRem) elRem.textContent = overallRem.toFixed(2);
    if (elPayables) elPayables.textContent = overallPayables.toFixed(2);

    if (elProfitWeek) elProfitWeek.textContent = weekProfit.toFixed(2);
    if (elProfitMonth) elProfitMonth.textContent = monthProfit.toFixed(2);
    if (elProfitOverall) elProfitOverall.textContent = overallProfit.toFixed(2);

    items.forEach((item, index) => {
        const stats = itemTotals[item.id];
        const currentStock = stats.in - stats.out;

        // Find common unit for display (fallback to Kg if mixed)
        let displayUnit = 'Kg';
        const itemTxs = transactions.filter(t => t.itemId === item.id);
        if (itemTxs.length > 0) {
            const firstUnit = itemTxs[0].unit;
            const allSame = itemTxs.every(t => t.unit === firstUnit);
            if (allSame) {
                if (firstUnit === 'amount') displayUnit = 'Pcs';
                else if (firstUnit === 'ltr' || firstUnit === 'ml') displayUnit = 'Liters';
            } else {
                displayUnit = 'Mixed';
            }
        }

        const tr = document.createElement('tr');

        const tdName = document.createElement('td');
        tdName.textContent = `${index + 1} - ${item.name}`;

        const tdIn = document.createElement('td');
        tdIn.innerHTML = `<span style="color: var(--success); font-weight: 500;">${stats.in.toFixed(2)}</span> <small style="color: var(--text-secondary);">${displayUnit}</small>`;

        const tdOut = document.createElement('td');
        tdOut.innerHTML = `<span style="color: var(--danger); font-weight: 500;">${stats.out.toFixed(2)}</span> <small style="color: var(--text-secondary);">${displayUnit}</small>`;

        const tdCurrent = document.createElement('td');
        tdCurrent.innerHTML = `<strong>${currentStock.toFixed(2)}</strong> <small style="color: var(--text-secondary);">${displayUnit}</small>`;

        const tdAction = document.createElement('td');

        const btnEdit = document.createElement('button');
        btnEdit.className = 'action-btn edit';
        btnEdit.innerHTML = "<i class='bx bx-edit'></i>";
        btnEdit.title = "Edit Item";
        btnEdit.style.marginRight = "8px";
        btnEdit.onclick = () => {
            showEditModal(item, (newName) => {
                window.Store.updateItem(item.id, newName);
                renderItemsTable();
                if (window.populateStockItemSelect) window.populateStockItemSelect();
            });
        };

        const btnDelete = document.createElement('button');
        btnDelete.className = 'action-btn del';
        btnDelete.innerHTML = "<i class='bx bx-trash'></i>";
        btnDelete.title = "Delete Item";
        btnDelete.onclick = () => {
            if (confirm(`Are you sure you want to delete "${item.name}"?`)) {
                window.Store.deleteItem(item.id);
                renderItemsTable();
                if (window.populateStockItemSelect) window.populateStockItemSelect();
            }
        };

        tdAction.appendChild(btnEdit);
        tdAction.appendChild(btnDelete);
        tr.appendChild(tdName);
        tr.appendChild(tdIn);
        tr.appendChild(tdOut);
        tr.appendChild(tdCurrent);
        tr.appendChild(tdAction);
        tbody.appendChild(tr);
    });
}

function showEditModal(item, onConfirm) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    const content = document.createElement('div');
    content.className = 'modal-content';

    const title = document.createElement('div');
    title.className = 'modal-title';
    title.textContent = `Edit Item`;

    const label = document.createElement('div');
    label.style.marginBottom = '8px';
    label.style.color = 'var(--text-secondary)';
    label.style.fontSize = '0.9rem';
    label.textContent = `Enter new name for "${item.name}":`;

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'modal-input';
    input.value = item.name;

    const actions = document.createElement('div');
    actions.className = 'modal-actions';

    const btnCancel = document.createElement('button');
    btnCancel.className = 'modal-btn cancel';
    btnCancel.textContent = 'Cancel';

    const btnConfirm = document.createElement('button');
    btnConfirm.className = 'modal-btn confirm';
    btnConfirm.textContent = 'OK';

    actions.appendChild(btnCancel);
    actions.appendChild(btnConfirm);

    content.appendChild(title);
    content.appendChild(label);
    content.appendChild(input);
    content.appendChild(actions);
    overlay.appendChild(content);

    document.body.appendChild(overlay);

    input.focus();
    input.select();

    const closeModal = () => {
        if (document.body.contains(overlay)) {
            document.body.removeChild(overlay);
        }
    };

    btnCancel.onclick = closeModal;
    overlay.onmousedown = (e) => {
        if (e.target === overlay) closeModal();
    };

    const handleConfirm = () => {
        const newName = input.value;
        if (newName && newName.trim() !== '' && newName !== item.name) {
            onConfirm(newName.trim());
        }
        closeModal();
    };

    btnConfirm.onclick = handleConfirm;
    input.onkeydown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleConfirm();
        }
        if (e.key === 'Escape') closeModal();
    };
}

let currentBalanceSearchQuery = '';

document.addEventListener('DOMContentLoaded', () => {
    const balSearch = document.getElementById('admin-balance-search');
    if (balSearch) {
        balSearch.addEventListener('input', (e) => {
            currentBalanceSearchQuery = e.target.value.toLowerCase();
            renderOutstandingBalances();
        });
    }
});

function renderOutstandingBalances() {
    const transactions = window.Store.getTransactions();
    const tbody = document.querySelector('#outstanding-balances-table tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const balances = {};
    window._paidTotals = {};
    const personTypes = {};

    transactions.forEach(tx => {
        if (!tx.person) return;
        if (balances[tx.person] === undefined) balances[tx.person] = 0;
        if (!personTypes[tx.person]) personTypes[tx.person] = { in: 0, out: 0 };
        
        const totalAmt = parseFloat(tx.totalAmount) || 0;
        const paidAmt = parseFloat(tx.paidAmount) || 0;
        
        // NetBalance logic: Positive means they owe us (Receivable), Negative means we owe them (Payable)
        if (tx.type === 'out') {
            // Sale: They owe us for the stock (totalAmt), but their payment reduces their debt (paidAmt)
            balances[tx.person] += totalAmt;
            balances[tx.person] -= paidAmt;
            personTypes[tx.person].out += totalAmt;
        } else if (tx.type === 'in') {
            // Purchase: We owe them for the stock (totalAmt), but our payment reduces our debt (paidAmt)
            balances[tx.person] -= totalAmt;
            balances[tx.person] += paidAmt;
            personTypes[tx.person].in += totalAmt;
        } else if (tx.type === 'payment-in' || tx.type === 'payment' || tx.type === 'payment-out') {
            // For payments, totalAmt stores any manual adjustment made to the ledger.
            if (tx.type === 'payment-out') {
                balances[tx.person] += totalAmt;
                balances[tx.person] += paidAmt; // We gave money, so they owe us
            } else {
                balances[tx.person] += totalAmt;
                balances[tx.person] -= paidAmt; // They gave money, so they owe us less
            }
        }
        
        if (!window._paidTotals) window._paidTotals = {};
        if (!window._paidTotals[tx.person]) window._paidTotals[tx.person] = 0;
        window._paidTotals[tx.person] += paidAmt;
    });

    const personsList = window.Store.getPersons();

    // Removed FORCE_RECEIVABLES override so balances are strictly mathematical

    let personsWithBalance = Object.entries(balances)
        .filter(([person, bal]) => {
            return bal > 0.01; // Positive balance means they owe us (Receivable)
        })
        .map(([person, bal]) => {
            const index = personsList.findIndex(p => p.name === person);
            const code = index !== -1 ? (index + 1).toString() : '';
            return { person, bal, code, paid: window._paidTotals[person] || 0 };
        });

    if (currentBalanceSearchQuery) {
        personsWithBalance = personsWithBalance.filter(item => {
            return item.person.toLowerCase().includes(currentBalanceSearchQuery) ||
                item.code.includes(currentBalanceSearchQuery);
        });
    }

    personsWithBalance.sort((a, b) => b.bal - a.bal);

    if (personsWithBalance.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-secondary);">No outstanding balances.</td></tr>';
    } else {
        personsWithBalance.forEach(item => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${item.code ? item.code + ' - ' : ''}${item.person}</strong></td>
                <td style="color: var(--success); font-weight: 700;">${item.paid.toFixed(2)}</td>
                <td style="color: var(--danger); font-weight: 700;">${item.bal.toFixed(2)}</td>
                <td>
                    <a href="invoices.html?person=${encodeURIComponent(item.person)}" class="btn btn-secondary" style="padding: 4px 12px; font-size: 12px; text-decoration: none; border-radius: 4px;">View</a>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    // Render Payables
    const ptbody = document.querySelector('#payables-table tbody');
    if (!ptbody) return;
    ptbody.innerHTML = '';
    
    let payablesSearchQuery = '';
    const paySearch = document.getElementById('admin-payable-search');
    if (paySearch) payablesSearchQuery = paySearch.value.toLowerCase();

    let payablesList = Object.entries(balances)
        .filter(([person, bal]) => {
            return bal < -0.01; // Negative balance means we owe them (Payable)
        })
        .map(([person, bal]) => {
            const index = personsList.findIndex(p => p.name === person);
            const code = index !== -1 ? (index + 1).toString() : '';
            return { person, bal: Math.abs(bal), code, paid: window._paidTotals[person] || 0 };
        });

    if (payablesSearchQuery) {
        payablesList = payablesList.filter(item => {
            return item.person.toLowerCase().includes(payablesSearchQuery) ||
                item.code.includes(payablesSearchQuery);
        });
    }

    payablesList.sort((a, b) => b.bal - a.bal);

    if (payablesList.length === 0) {
        ptbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-secondary);">No payables.</td></tr>';
    } else {
        payablesList.forEach(item => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${item.code ? item.code + ' - ' : ''}${item.person}</strong></td>
                <td style="color: var(--success); font-weight: 700;">${item.paid.toFixed(2)}</td>
                <td style="color: var(--danger); font-weight: 700;">${item.bal.toFixed(2)}</td>
                <td>
                    <a href="invoices.html?person=${encodeURIComponent(item.person)}" class="btn btn-secondary" style="padding: 4px 12px; font-size: 12px; text-decoration: none; border-radius: 4px;">View</a>
                </td>
            `;
            ptbody.appendChild(tr);
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const paySearch = document.getElementById('admin-payable-search');
    if (paySearch) {
        paySearch.addEventListener('input', () => {
            renderOutstandingBalances();
        });
    }
});
