// app.js
document.addEventListener('DOMContentLoaded', () => {
    // Theme Logic
    const themeToggleBtn = document.getElementById('theme-toggle');
    const themeIcon = themeToggleBtn.querySelector('i');
    const savedTheme = localStorage.getItem('theme') || 'dark';

    if (savedTheme === 'light') {
        document.body.classList.add('light-theme');
        themeIcon.classList.replace('bx-sun', 'bx-moon');
    }

    themeToggleBtn.addEventListener('click', () => {
        document.body.classList.toggle('light-theme');
        if (document.body.classList.contains('light-theme')) {
            localStorage.setItem('theme', 'light');
            themeIcon.classList.replace('bx-sun', 'bx-moon');
        } else {
            localStorage.setItem('theme', 'dark');
            themeIcon.classList.replace('bx-moon', 'bx-sun');
        }
    });

    // Language Logic
    const langToggleBtn = document.getElementById('lang-toggle');
    let currentLang = localStorage.getItem('lang') || 'en';

    function applyTranslations(lang) {
        if (!window.Translations || !window.Translations[lang]) return;
        const dict = window.Translations[lang];

        // Translate text contents
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (dict[key]) {
                el.textContent = dict[key];
            }
        });

        // Translate placeholders
        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            const key = el.getAttribute('data-i18n-placeholder');
            if (dict[key]) {
                el.placeholder = dict[key];
            }
        });

        // Update body direction and font based on language
        if (lang === 'ur') {
            document.body.setAttribute('dir', 'rtl');
            document.body.style.fontFamily = "'Jameel Noori Nastaleeq', 'Inter', sans-serif";
            langToggleBtn.textContent = 'EN';
        } else {
            document.body.removeAttribute('dir');
            document.body.style.fontFamily = "'Inter', sans-serif";
            langToggleBtn.textContent = 'اردو';
        }

        if (typeof updateDashboard === 'function') updateDashboard();
    }

    // Apply initial translations
    applyTranslations(currentLang);

    langToggleBtn.addEventListener('click', () => {
        currentLang = currentLang === 'en' ? 'ur' : 'en';
        localStorage.setItem('lang', currentLang);
        applyTranslations(currentLang);
    });

    // Initialize All Sections
    updateDashboard();
    if (window.populateStockItemSelect) window.populateStockItemSelect();
    if (window.renderInvoices) window.renderInvoices();
    if (window.renderAdminItems) window.renderAdminItems();

    // Dashboard Search Event Listeners
    const dashSearchItem = document.getElementById('stock-item');
    const dashSearchPerson = document.getElementById('person-name');
    if (dashSearchItem) {
        dashSearchItem.addEventListener('input', (e) => {
            if (e.target.value.trim().toLowerCase() === '/admin') {
                window.location.href = 'admin.html';
                return;
            }
            updateDashboard();
        });
    }
    if (dashSearchPerson) {
        dashSearchPerson.addEventListener('input', (e) => {
            if (e.target.value.trim().toLowerCase() === '/admin') {
                window.location.href = 'admin.html';
                return;
            }
            updateDashboard();
        });
    }

    // Global Key Listener for "/admin" shortcut
    let keyBuffer = '';
    document.addEventListener('keydown', (e) => {
        if (e.key.length === 1) {
            keyBuffer += e.key;
            if (keyBuffer.length > 10) {
                keyBuffer = keyBuffer.slice(-10);
            }
            if (keyBuffer.endsWith('/admin')) {
                window.location.href = 'admin.html';
            }
        }
    });

    // Global Keyboard Navigation (Arrow Keys)
    document.addEventListener('keydown', (e) => {
        if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;

        const focusableElements = Array.from(document.querySelectorAll('input:not([disabled]):not([readonly]), select:not([disabled]), button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'))
            .filter(el => el.offsetWidth > 0 && el.offsetHeight > 0) // visible only
            .filter(el => !el.closest('.top-actions')); // exclude top header buttons

        const activeEl = document.activeElement;
        let currentIndex = focusableElements.indexOf(activeEl);

        // If inside an input, check boundaries so we don't break text editing
        if (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA') {
            try {
                if (e.key === 'ArrowLeft' && activeEl.selectionStart > 0) return;
                if (e.key === 'ArrowRight' && activeEl.selectionEnd < activeEl.value.length) return;
            } catch (err) {
                // Fallback
            }
        }

        // For select dropdowns, allow Left/Right to navigate away (Up/Down are native and ignored by this script now)
        if (activeEl.tagName === 'SELECT') {
            // we don't return here, we let Left/Right jump focus
        }

        if (currentIndex === -1) currentIndex = 0; // If nothing focused, start at 0

        let nextIndex = currentIndex;
        if (e.key === 'ArrowRight') {
            nextIndex = currentIndex + 1;
            if (nextIndex >= focusableElements.length) nextIndex = 0; // Wrap around
        } else if (e.key === 'ArrowLeft') {
            nextIndex = currentIndex - 1;
            if (nextIndex < 0) nextIndex = focusableElements.length - 1; // Wrap around
        }

        if (nextIndex !== currentIndex && focusableElements[nextIndex]) {
            e.preventDefault(); // Prevent page scrolling
            const targetEl = focusableElements[nextIndex];
            targetEl.focus();

            // Highlight all text so the cursor doesn't get stuck in the middle of the text
            if ((targetEl.tagName === 'INPUT' || targetEl.tagName === 'TEXTAREA') && typeof targetEl.select === 'function') {
                try {
                    targetEl.select();
                } catch (err) {
                    // Ignore for inputs that don't support selection
                }
            }
        }
    });

    // Global listener for date inputs to support DD/MM/YYYY display format
    function updateDateDisplay(input) {
        if (input.value) {
            const parts = input.value.split('-');
            if (parts.length === 3) {
                input.setAttribute('data-date', `${parts[2]}/${parts[1]}/${parts[0]}`);
            }
        } else {
            input.setAttribute('data-date', '');
        }
    }
    
    document.addEventListener('change', (e) => {
        if (e.target && e.target.tagName === 'INPUT' && e.target.type === 'date') {
            updateDateDisplay(e.target);
        }
    });
    
    // Initialize any existing date inputs on load
    document.querySelectorAll('input[type="date"]').forEach(updateDateDisplay);

    // Initialize Dashboard
    updateDashboard();

    // Payment Modal Logic
    const paymentModalBtn = document.getElementById('payment-modal-btn');
    const paymentModal = document.getElementById('payment-modal');
    const cancelPaymentBtn = document.getElementById('cancel-payment-btn');
    const paymentForm = document.getElementById('payment-form');
    const paymentPersonInput = document.getElementById('payment-person');
    const paymentTotalRemaining = document.getElementById('payment-total-remaining');
    const paymentAmount = document.getElementById('payment-amount');
    const paymentNewRemaining = document.getElementById('payment-new-remaining');
    const btnDownloadApp = document.getElementById('btn-download-app');

    if (btnDownloadApp) {
        btnDownloadApp.addEventListener('click', (e) => {
            e.preventDefault();
            let currentPath = window.location.pathname;
            if (currentPath.startsWith('/')) {
                currentPath = currentPath.substring(1);
            }

            currentPath = decodeURI(currentPath); // Handle spaces in URL
            currentPath = currentPath.replace(/\//g, '\\');
            const sourceDir = currentPath.substring(0, currentPath.lastIndexOf('\\'));

            const batContent = `@echo off
echo Installing StockMaster App...
set "SOURCE_DIR=${sourceDir}"
set "TARGET_DIR=%USERPROFILE%\\StockMaster"

echo Creating application folder...
mkdir "%TARGET_DIR%" 2>nul

echo Copying files to %TARGET_DIR%...
xcopy /E /I /Y "%SOURCE_DIR%" "%TARGET_DIR%" >nul

echo Creating Desktop Shortcut...
set "URI_PATH=%TARGET_DIR%\\index.html"
set "URI_PATH=%URI_PATH:\\=/%"
set "PS_SCRIPT=%TEMP%\\create_shortcut.ps1"
echo $WshShell = New-Object -comObject WScript.Shell > "%PS_SCRIPT%"
echo $Shortcut = $WshShell.CreateShortcut("$env:USERPROFILE\\Desktop\\StockMaster.lnk") >> "%PS_SCRIPT%"
echo $Shortcut.TargetPath = "msedge.exe" >> "%PS_SCRIPT%"
echo $Shortcut.Arguments = "--app=""file:///%URI_PATH%""" >> "%PS_SCRIPT%"
echo $Shortcut.Save() >> "%PS_SCRIPT%"

powershell -ExecutionPolicy Bypass -NoProfile -File "%PS_SCRIPT%"
del "%PS_SCRIPT%"

echo.
echo Install complete! The app has been copied to %TARGET_DIR%.
echo A shortcut has been created on your Desktop.
pause
`;
            const blob = new Blob([batContent], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'Install_StockMaster.bat';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        });
    }

    window.populatePaymentPersonSelect = function () {
        const persons = window.Store.getPersons();
        const dataList = document.getElementById('payment-person-list');
        if (!dataList) return;

        dataList.innerHTML = '';
        persons.forEach((person, index) => {
            const option = document.createElement('option');
            option.value = `${index + 1} - ${person.name}`;
            dataList.appendChild(option);
        });
    };

    const modalPaymentMethodEl = document.getElementById('modal-payment-method');
    const modalBankNameGroup = document.getElementById('modal-bank-name-group');
    if (modalPaymentMethodEl) {
        modalPaymentMethodEl.addEventListener('change', () => {
            if (modalPaymentMethodEl.value === 'Bank Transfer') {
                if (modalBankNameGroup) modalBankNameGroup.style.display = 'block';
            } else {
                if (modalBankNameGroup) modalBankNameGroup.style.display = 'none';
            }
        });
    }

    if (paymentModalBtn) {
        paymentModalBtn.addEventListener('click', () => {
            window.populatePaymentPersonSelect();
            paymentForm.reset();
            paymentTotalRemaining.value = '';
            paymentAmount.value = '';
            paymentNewRemaining.value = '';
            if (modalPaymentMethodEl) modalPaymentMethodEl.dispatchEvent(new Event('change'));

            const historyContainer = document.getElementById('payment-person-history');
            if (historyContainer) historyContainer.style.display = 'none';

            paymentModal.style.display = 'flex';
        });
    }

    if (cancelPaymentBtn) {
        cancelPaymentBtn.addEventListener('click', () => {
            paymentModal.style.display = 'none';
        });
    }

    function calculatePaymentBalances() {
        const personInputValue = paymentPersonInput.value.trim();
        let personName = personInputValue;
        const persons = window.Store.getPersons();

        if (personInputValue) {
            const matchNumOnly = personInputValue.match(/^(\d+)$/);
            const matchWithDash = personInputValue.match(/^(\d+)\s*-\s*(.+)/);

            if (matchNumOnly) {
                const index = parseInt(matchNumOnly[1]) - 1;
                if (persons[index]) personName = persons[index].name;
            } else if (matchWithDash) {
                const index = parseInt(matchWithDash[1]) - 1;
                if (persons[index]) {
                    personName = persons[index].name;
                } else {
                    personName = matchWithDash[2].trim();
                }
            }
        }

        // Calculate total remaining and build history table
        const transactions = window.Store.getTransactions();
        let totalRemaining = 0;

        const historyContainer = document.getElementById('payment-person-history');
        const historyTbody = document.getElementById('payment-history-tbody');
        if (historyTbody) historyTbody.innerHTML = '';

        let hasHistory = false;

        if (personName) {
            // Sort transactions by date descending for the history view
            const personTx = transactions.filter(tx => tx.person === personName).sort((a, b) => new Date(b.date) - new Date(a.date));

            personTx.forEach(tx => {
                const totalAmt = parseFloat(tx.totalAmount) || 0;
                const paidAmt = parseFloat(tx.paidAmount) || 0;

                if (tx.type === 'out') {
                    totalRemaining += (totalAmt - paidAmt);
                } else if (tx.type === 'in') {
                    totalRemaining -= (totalAmt - paidAmt);
                } else if (tx.type === 'payment-out') {
                    totalRemaining += (totalAmt + paidAmt);
                } else {
                    totalRemaining += (totalAmt - paidAmt);
                }

                if (historyTbody) {
                    hasHistory = true;
                    const dateObj = new Date(tx.date);
                    const dateStr = dateObj.toLocaleDateString();

                    const tr = document.createElement('tr');
                    tr.style.borderBottom = '1px solid var(--border)';
                    tr.innerHTML = `
                        <td style="padding: 6px 4px;">${dateStr}</td>
                        <td style="padding: 6px 4px;">${tx.itemName || 'Payment'}</td>
                        <td style="padding: 6px 4px;">${totalAmt.toFixed(2)}</td>
                        <td style="padding: 6px 4px;">${paidAmt.toFixed(2)}</td>
                    `;
                    historyTbody.appendChild(tr);
                }
            });
        }

        if (historyContainer) {
            historyContainer.style.display = hasHistory ? 'block' : 'none';
        }

        paymentTotalRemaining.value = totalRemaining.toFixed(2);

        const paid = parseFloat(paymentAmount.value) || 0;
        const newRemaining = totalRemaining < 0 ? (totalRemaining + paid) : (totalRemaining - paid);
        paymentNewRemaining.value = newRemaining.toFixed(2);
    }

    if (paymentPersonInput) {
        paymentPersonInput.addEventListener('input', calculatePaymentBalances);
        paymentPersonInput.addEventListener('change', calculatePaymentBalances);
    }

    if (paymentAmount) {
        paymentAmount.addEventListener('input', calculatePaymentBalances);
    }

    if (paymentForm) {
        paymentForm.addEventListener('submit', (e) => {
            e.preventDefault();

            const personInputValue = paymentPersonInput.value.trim();
            let personName = personInputValue;
            const persons = window.Store.getPersons();

            if (personInputValue) {
                const matchNumOnly = personInputValue.match(/^(\d+)$/);
                const matchWithDash = personInputValue.match(/^(\d+)\s*-\s*(.+)/);

                if (matchNumOnly) {
                    const index = parseInt(matchNumOnly[1]) - 1;
                    if (persons[index]) personName = persons[index].name;
                } else if (matchWithDash) {
                    const index = parseInt(matchWithDash[1]) - 1;
                    if (persons[index]) {
                        personName = persons[index].name;
                    } else {
                        personName = matchWithDash[2].trim();
                    }
                }
            }

            if (!personName) {
                alert("Please enter a person name.");
                return;
            }

            // Add person if new
            window.Store.addPerson(personName);
            if (window.populatePersonSelect) window.populatePersonSelect();
            window.populatePaymentPersonSelect();

            const paid = parseFloat(paymentAmount.value) || 0;
            const newRemaining = parseFloat(paymentNewRemaining.value) || 0;
            const currentBalance = parseFloat(paymentTotalRemaining.value) || 0;

            // Calculate the adjustment needed to reach the desired new remaining balance
            let txType = 'payment';
            if (currentBalance < 0) {
                txType = 'payment-out';
            }

            const adjustment = newRemaining - currentBalance + (txType === 'payment-out' ? -paid : paid);

            const modalPaymentMethodEl = document.getElementById('modal-payment-method');
            const paymentMethod = modalPaymentMethodEl ? modalPaymentMethodEl.value : 'Cash';
            const modalBankNameInput = document.getElementById('modal-bank-name');
            const bankName = (paymentMethod === 'Bank Transfer' && modalBankNameInput) ? modalBankNameInput.value.trim() : '';

            const tx = {
                type: txType,
                person: personName,
                itemId: null,
                itemName: 'Ledger Adjustment / Payment',
                unit: '-',
                weight: { mun: 0, kg: 0, grams: 0, pound: 0, tola: 0 },
                totalKg: 0,
                ratePerUnit: 0,
                ratePerKg: 0,
                totalAmount: adjustment,
                previousBalance: currentBalance,
                grandTotal: currentBalance + (txType === 'payment-out' ? -adjustment : adjustment),
                paidAmount: paid,
                remainingAmount: newRemaining,
                paymentMethod: paymentMethod,
                bankName: bankName,
                date: new Date().toISOString()
            };

            window.Store.addTransaction(tx);

            alert('Payment saved successfully!');
            paymentModal.style.display = 'none';
            updateDashboard();
            if (typeof renderInvoicesTable === 'function') {
                renderInvoicesTable();
            }
        });
    }
});

// Dashboard Logic
function updateDashboard() {
    const items = window.Store.getItems();
    let transactions = window.Store.getTransactions();

    const itemQuery = document.getElementById('stock-item')?.value.toLowerCase().trim() || '';
    const personQuery = document.getElementById('person-name')?.value.toLowerCase().trim() || '';

    if (itemQuery || personQuery) {
        transactions = transactions.filter(tx => {
            let matchItem = true;
            let matchPerson = true;

            if (itemQuery) {
                const txItems = tx.items || [tx];
                matchItem = txItems.some(txi => {
                    const itemObj = items.find(i => i.id === txi.itemId);
                    const itemIndex = items.findIndex(i => i.id === txi.itemId);
                    const idStr = String(itemIndex + 1);
                    const nameLower = itemObj ? itemObj.name.toLowerCase() : (txi.itemName || '').toLowerCase();
                    const searchStr = itemObj ? `${idStr} - ${itemObj.name}`.toLowerCase() : (txi.itemName || '').toLowerCase();

                    const isNum = /^\d+$/.test(itemQuery);
                    if (isNum) {
                        return (idStr === itemQuery || nameLower.includes(itemQuery));
                    } else {
                        return searchStr.includes(itemQuery);
                    }
                });
            }

            if (personQuery) {
                const persons = window.Store.getPersons();
                const personObj = persons.find(p => p.name === tx.person);
                const personIndex = persons.findIndex(p => p.name === tx.person);
                const searchStr = personObj ? `${personIndex + 1} - ${personObj.name}`.toLowerCase() : (tx.person || '').toLowerCase();
                matchPerson = searchStr.includes(personQuery);
            }

            return matchItem && matchPerson;
        });
    }

    const statItems = document.getElementById('stat-total-items');
    if (statItems) statItems.textContent = items.length;

    let totalIn = 0;
    let totalOut = 0;
    let totalRemaining = 0;

    transactions.forEach(tx => {
        if (tx.type === 'in') {
            totalIn += parseFloat(tx.totalKg) || 0;
        } else if (tx.type === 'out') {
            totalOut += parseFloat(tx.totalKg) || 0;
        }
        const tAmt = parseFloat(tx.totalAmount) || 0;
        const pAmt = parseFloat(tx.paidAmount) || 0;

        if (tx.type === 'out') {
            totalRemaining += (tAmt - pAmt);
        } else if (tx.type === 'in') {
            totalRemaining -= (tAmt - pAmt);
        } else if (tx.type === 'payment-out') {
            totalRemaining += (tAmt + pAmt);
        } else {
            totalRemaining += (tAmt - pAmt);
        }
    });

    const statIn = document.getElementById('stat-total-in');
    const statOut = document.getElementById('stat-total-out');
    const statRemaining = document.getElementById('stat-total-remaining');

    if (statIn) statIn.textContent = totalIn.toFixed(2);
    if (statOut) statOut.textContent = totalOut.toFixed(2);
    if (statRemaining) statRemaining.textContent = totalRemaining.toFixed(2);

    // Calculate common unit for dashboard titles
    let commonUnit = 'Kg';
    if (transactions.length > 0) {
        let firstNormalizedUnit = 'Kg';
        if (transactions[0].unit === 'amount') firstNormalizedUnit = 'Pcs';
        else if (transactions[0].unit === 'ltr' || transactions[0].unit === 'ml') firstNormalizedUnit = 'Liters';

        const allSame = transactions.every(tx => {
            let u = 'Kg';
            if (tx.unit === 'amount') u = 'Pcs';
            else if (tx.unit === 'ltr' || tx.unit === 'ml') u = 'Liters';
            return u === firstNormalizedUnit;
        });

        if (allSame) commonUnit = firstNormalizedUnit;
        else commonUnit = 'Mixed Units';
    }

    const lang = localStorage.getItem('lang') || 'en';
    let translatedUnit = commonUnit;
    let translatedIn = "Total Stock In";
    let translatedOut = "Total Stock Out";

    if (lang === 'ur') {
        if (commonUnit === 'Kg') translatedUnit = 'کلوگرام';
        else if (commonUnit === 'Liters') translatedUnit = 'لیٹر';
        else if (commonUnit === 'Pcs') translatedUnit = 'تعداد';

        translatedIn = "کل اسٹاک آمد";
        translatedOut = "کل اسٹاک روانگی";
    }

    const unitSuffix = commonUnit === 'Mixed Units' ? '' : ` (${translatedUnit})`;
    const dashInTitle = document.getElementById('dash-stat-in-title');
    const dashOutTitle = document.getElementById('dash-stat-out-title');
    if (dashInTitle) dashInTitle.textContent = translatedIn + unitSuffix;
    if (dashOutTitle) dashOutTitle.textContent = translatedOut + unitSuffix;

    renderItemSummary(items, transactions, itemQuery, personQuery);
    checkRecentInvoice(transactions);
}

function checkRecentInvoice(transactions) {
    const container = document.getElementById('recent-invoice-container');
    if (!container) return;

    if (!transactions || transactions.length === 0) {
        container.style.display = 'none';
        return;
    }

    // Get the most recent transaction
    const latestTx = transactions[0];

    // Check if user has already opened this specific invoice
    if (localStorage.getItem('dismissedInvoice') === latestTx.id) {
        container.style.display = 'none';
        return;
    }

    const txDate = new Date(latestTx.date);
    const now = new Date();
    const diffMs = now - txDate;
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins <= 15) {
        const lang = localStorage.getItem('lang') || 'en';
        const title = lang === 'ur' ? 'حالیہ ٹرانزیکشن (پچھلے 15 منٹ)' : 'Recent Transaction (Last 15 Mins)';
        const btnOpen = lang === 'ur' ? 'انوائس کھولیں' : 'Open Invoice';

        container.innerHTML = `
            <div class="glass-panel" style="background: rgba(16, 185, 129, 0.05); border-left: 4px solid var(--success); padding: 16px 20px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
                <div>
                    <h3 style="margin: 0 0 4px 0; font-size: 1rem; color: var(--success); display: flex; align-items: center; gap: 6px;">
                        <i class='bx bx-check-circle'></i> ${title}
                    </h3>
                    <p style="margin: 0; color: var(--text-secondary); font-size: 0.9rem;">
                        <strong>${latestTx.person || 'N/A'}</strong> - ${latestTx.itemName} 
                        <span style="margin: 0 8px;">|</span> Amount: <strong>${parseFloat(latestTx.totalAmount).toFixed(2)}</strong>
                    </p>
                </div>
                <div style="display: flex; gap: 10px;">
                    <button class="btn btn-secondary" onclick="printAndRedirect('${latestTx.id}')" style="padding: 6px 12px; font-size: 0.9rem;">
                        <i class='bx bx-receipt'></i> ${btnOpen}
                    </button>
                </div>
            </div>
        `;
        container.style.display = 'block';

        // Auto hide after the 15th minute passes (timeout = (15 - diffMins) * 60 * 1000)
        // Set a timeout to re-check
        setTimeout(() => checkRecentInvoice(window.Store.getTransactions()), 60000);
    } else {
        container.style.display = 'none';
    }
}

window.printAndRedirect = function (txId) {
    // Save to localStorage so it doesn't show up again
    localStorage.setItem('dismissedInvoice', txId);
    // Redirect to invoice page with print instruction
    window.location.href = 'invoices.html?print=' + txId;
};

function renderItemSummary(items, transactions, itemQuery, personQuery) {
    const tbody = document.querySelector('#item-summary-table tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (items.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center;">No items found</td></tr>';
        return;
    }

    if (!itemQuery && !personQuery) {
        const lang = localStorage.getItem('lang') || 'en';
        const msg = lang === 'ur' ? 'اسٹاک کی تفصیل دیکھنے کے لیے آئٹم یا شخص تلاش کریں' : 'Search for an item or person to view stock summary';
        tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-secondary);">${msg}</td></tr>`;
        return;
    }

    // Calculate totals per item
    const itemTotals = {};
    items.forEach((item, index) => {
        itemTotals[item.id] = { name: `${index + 1} - ${item.name}`, in: 0, out: 0, show: true };

        if (itemQuery) {
            const idStr = String(index + 1);
            const nameLower = item.name.toLowerCase();
            const isNum = /^\d+$/.test(itemQuery);

            if (isNum) {
                if (idStr !== itemQuery && !nameLower.includes(itemQuery)) {
                    itemTotals[item.id].show = false;
                }
            } else {
                if (!itemTotals[item.id].name.toLowerCase().includes(itemQuery)) {
                    itemTotals[item.id].show = false;
                }
            }
        }
    });

    transactions.forEach(tx => {
        const txItems = tx.items || [tx];
        txItems.forEach(txi => {
            if (itemTotals[txi.itemId]) {
                if (tx.type === 'in') {
                    itemTotals[txi.itemId].in += parseFloat(txi.totalKg) || 0;
                } else if (tx.type === 'out') {
                    itemTotals[txi.itemId].out += parseFloat(txi.totalKg) || 0;
                }
            }
        });
    });

    let renderedCount = 0;
    items.forEach(item => {
        const stats = itemTotals[item.id];
        if (!stats.show) return;

        // If searching by person, only show items that person has activity for
        if (personQuery && stats.in === 0 && stats.out === 0) return;

        renderedCount++;
        const currentStock = stats.in - stats.out;

        let displayUnit = stats.unit || 'Kg';
        if (localStorage.getItem('lang') === 'ur') {
            if (displayUnit === 'Pcs') displayUnit = 'تعداد';
            else if (displayUnit === 'Liters') displayUnit = 'لیٹر';
            else displayUnit = 'کلوگرام';
        }

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="font-weight: 600;">${stats.name}</td>
            <td style="color: var(--accent);">${stats.in.toFixed(3)} <small>${displayUnit}</small></td>
            <td style="color: #3b82f6;">${stats.out.toFixed(3)} <small>${displayUnit}</small></td>
            <td style="font-weight: 700;">${currentStock.toFixed(3)} <small>${displayUnit}</small></td>
        `;
        tbody.appendChild(tr);
    });

    if (renderedCount === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center;">No matching items</td></tr>';
    }
}
