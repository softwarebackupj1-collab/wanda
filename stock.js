// stock.js
document.addEventListener('DOMContentLoaded', () => {
    // Populate dropdown
    window.populateStockItemSelect = function(filterQuery = '') {
        const items = window.Store.getItems();
        const dataList = document.getElementById('stock-item-list');
        if (!dataList) return;
        
        dataList.innerHTML = '';
        const val = filterQuery.trim().toLowerCase();
        const isNum = /^\d+$/.test(val);

        items.forEach((item, index) => {
            const idStr = String(index + 1);
            const nameLower = item.name.toLowerCase();
            const fullStr = `${idStr} - ${item.name}`;
            
            let shouldInclude = false;
            if (!val) {
                shouldInclude = true;
            } else if (isNum) {
                if (idStr === val || nameLower.includes(val)) {
                    shouldInclude = true;
                }
            } else {
                if (fullStr.toLowerCase().includes(val)) {
                    shouldInclude = true;
                }
            }

            if (shouldInclude) {
                const option = document.createElement('option');
                option.value = fullStr;
                dataList.appendChild(option);
            }
        });
    };
    
    window.populatePersonSelect = function() {
        const persons = window.Store.getPersons();
        const dataList = document.getElementById('person-name-list');
        if (!dataList) return;
        
        dataList.innerHTML = '';
        persons.forEach((person, index) => {
            const option = document.createElement('option');
            option.value = `${index + 1} - ${person.name}`;
            dataList.appendChild(option);
        });
    };

    // Initial populate
    window.populateStockItemSelect();

    const stockItemInput = document.getElementById('stock-item');
    if (stockItemInput) {
        stockItemInput.addEventListener('input', function(e) {
            window.populateStockItemSelect(this.value);
        });
    }
    window.populatePersonSelect();

    window.currentCart = [];
    
    function setDefaultDate() {
        const dateInput = document.getElementById('transaction-date');
        if (dateInput) {
            const tzoffset = (new Date()).getTimezoneOffset() * 60000;
            const localISOTime = (new Date(Date.now() - tzoffset)).toISOString().split('T')[0];
            dateInput.value = localISOTime;
            
            const parts = localISOTime.split('-');
            if (parts.length === 3) {
                dateInput.setAttribute('data-date', `${parts[2]}/${parts[1]}/${parts[0]}`);
            }
        }
    }
    
    // Set default date on load
    setDefaultDate();

    const dateInput = document.getElementById('transaction-date');
    if (dateInput) {
        dateInput.addEventListener('change', function() {
            if (this.value) {
                const parts = this.value.split('-');
                if (parts.length === 3) {
                    this.setAttribute('data-date', `${parts[2]}/${parts[1]}/${parts[0]}`);
                }
            } else {
                this.setAttribute('data-date', '');
            }
        });
    }

    const txTypeSelect = document.getElementById('transaction-type');
    const amountPaidLabel = document.querySelector('label[for="amount-paid"]');
    const itemFieldsContainer = document.getElementById('item-fields-container');
    const cartTotalGroup = document.getElementById('cart-total').parentElement;

    if (txTypeSelect) {
        txTypeSelect.addEventListener('change', (e) => {
            const val = e.target.value;
            
            // Update labels based on context
            if (val === 'in') {
                amountPaidLabel.textContent = 'Amount Given';
                amountPaidLabel.setAttribute('data-i18n', 'label_given');
            } else if (val === 'out') {
                amountPaidLabel.textContent = 'Amount Received';
                amountPaidLabel.setAttribute('data-i18n', 'label_recv');
            } else if (val === 'payment-out') {
                amountPaidLabel.textContent = 'Amount Given';
                amountPaidLabel.setAttribute('data-i18n', 'label_given');
            } else if (val === 'payment-in') {
                amountPaidLabel.textContent = 'Amount Received';
                amountPaidLabel.setAttribute('data-i18n', 'label_recv');
            }

            if (typeof applyTranslations === 'function') {
                applyTranslations(localStorage.getItem('lang') || 'en');
            }

            // Hide/Show items section
            if (val.startsWith('payment-')) {
                if (itemFieldsContainer) itemFieldsContainer.style.display = 'none';
                if (cartTotalGroup) cartTotalGroup.style.display = 'none';
                
                // Clear cart
                window.currentCart = [];
                if (typeof window.renderCart === 'function') window.renderCart();
                
                // Reset financials
                document.getElementById('total-amount').value = '0.00';
            } else {
                if (itemFieldsContainer) itemFieldsContainer.style.display = '';
                if (cartTotalGroup) cartTotalGroup.style.display = '';
            }
        });
        
        // Trigger once on load to set initial state
        txTypeSelect.dispatchEvent(new Event('change'));
    }

    const itemSelect = document.getElementById('stock-item');
    const stockDisplay = document.getElementById('current-stock-display');
    const stockVal = document.getElementById('current-stock-val');

    window.updateCurrentStockDisplay = function() {
        const items = window.Store.getItems();
        const itemInputValue = itemSelect.value.trim();
        let itemId = null;

        if (itemInputValue) {
            const match = itemInputValue.match(/^(\d+)/);
            if (match) {
                const index = parseInt(match[1]) - 1;
                if (items[index]) itemId = items[index].id;
            } else {
                const foundItem = items.find(i => i.name.toLowerCase() === itemInputValue.toLowerCase());
                if (foundItem) itemId = foundItem.id;
            }
        }

        if (!itemId) {
            stockDisplay.style.display = 'none';
            return;
        }

        const transactions = window.Store.getTransactions();
        let totalIn = 0;
        let totalOut = 0;

        transactions.forEach(tx => {
            // Support both old and new schema
            const txItems = tx.items || [tx];
            txItems.forEach(txi => {
                if (txi.itemId === itemId) {
                    if (tx.type === 'in') totalIn += parseFloat(txi.totalKg) || 0;
                    else if (tx.type === 'out') totalOut += parseFloat(txi.totalKg) || 0;
                }
            });
        });

        const currentStock = totalIn - totalOut;
        stockVal.textContent = currentStock.toFixed(3);
        stockDisplay.style.display = 'flex';
    };

    itemSelect.addEventListener('input', window.updateCurrentStockDisplay);
    itemSelect.addEventListener('change', window.updateCurrentStockDisplay);

    const qtyInput = document.getElementById('transaction-qty');
    const unitSelect = document.getElementById('transaction-unit');
    const totalKgDisplay = document.getElementById('calc-total-kg');
    
    // Financials Logic
    const rateInput = document.getElementById('rate-per-kg');
    const itemTotalAmountSpan = document.getElementById('item-total-amount');

    function calculateTotalWeight() {
        const qty = parseFloat(qtyInput.value) || 0;
        const unit = unitSelect.value;
        let totalKg = 0;

        if (unit === 'mun') totalKg = qty * 40;
        else if (unit === 'kg') totalKg = qty;
        else if (unit === 'gram') totalKg = qty / 1000;
        else if (unit === 'pound') totalKg = qty * 0.15; // 1 Pound = 150 grams
        else if (unit === 'amount') totalKg = qty;
        else if (unit === 'bag50') totalKg = qty * 50;
        else if (unit === 'bag34') totalKg = qty * 34;
        else if (unit === 'tola') totalKg = qty * 0.01; // 1 Tola = 10 grams
        
        totalKgDisplay.textContent = totalKg.toFixed(3);
        updateUnitLabels();
        return totalKg;
    }

    function updateUnitLabels() {
        const unit = unitSelect.value;
        const currentStockUnit = document.getElementById('current-stock-unit');
        const calcUnitSuffix = document.getElementById('calc-unit-suffix');
        const rateUnitSuffix = document.getElementById('rate-unit-suffix');
        
        let displayUnit = '(Kg)';
        let perUnit = '(Per Kg)';

        if (unit === 'kg') { perUnit = '(Per Kg)'; }
        else if (unit === 'mun') { perUnit = '(Per Mun)'; }
        else if (unit === 'gram') { perUnit = '(Per Gram)'; }
        else if (unit === 'pound') { displayUnit = '(Pound)'; perUnit = '(Per Pound)'; }
        else if (unit === 'tola') { displayUnit = '(Tola)'; perUnit = '(Per Tola)'; }
        else if (unit === 'amount') { displayUnit = '(Pcs)'; perUnit = '(Per Pcs)'; }
        else if (unit === 'bag50') { displayUnit = '(Bag 50kg)'; perUnit = '(Per Bag 50kg)'; }
        else if (unit === 'bag34') { displayUnit = '(Bag 34kg)'; perUnit = '(Per Bag 34kg)'; }

        const lang = localStorage.getItem('lang') || 'en';
        if (lang === 'ur') {
            if (unit === 'amount') {
                displayUnit = '(تعداد)';
            } else if (unit === 'bag50') {
                displayUnit = '(بیگ 50kg)';
            } else if (unit === 'bag34') {
                displayUnit = '(بیگ 34kg)';
            } else if (unit === 'tola') {
                displayUnit = '(تولہ)';
            } else if (unit === 'pound') {
                displayUnit = '(پاؤنڈ)';
            } else {
                displayUnit = '(کلوگرام)';
            }

            if (unit === 'kg') { perUnit = '(فی کلوگرام)'; }
            else if (unit === 'mun') { perUnit = '(فی من)'; }
            else if (unit === 'gram') { perUnit = '(فی گرام)'; }
            else if (unit === 'pound') { perUnit = '(فی پاؤنڈ)'; }
            else if (unit === 'tola') { perUnit = '(فی تولہ)'; }
            else if (unit === 'amount') { perUnit = '(فی تعداد)'; }
            else if (unit === 'bag50') { perUnit = '(فی بیگ 50kg)'; }
            else if (unit === 'bag34') { perUnit = '(فی بیگ 34kg)'; }
        }

        if (currentStockUnit) currentStockUnit.textContent = displayUnit;
        if (calcUnitSuffix) calcUnitSuffix.textContent = displayUnit;
        if (rateUnitSuffix) rateUnitSuffix.textContent = perUnit;
    }

    function calculateFinancials() {
        calculateTotalWeight(); // Just to update display labels
        const qty = parseFloat(qtyInput.value) || 0;
        const rate = parseFloat(rateInput.value) || 0;
        const freightInput = document.getElementById('freight-charges');
        const freight = freightInput ? (parseFloat(freightInput.value) || 0) : 0;
        const totalAmount = (qty * rate) + freight;
        if (itemTotalAmountSpan) itemTotalAmountSpan.textContent = totalAmount.toFixed(2);
    }

    // Attach Event Listeners for Live Calculation
    const freightInputEl = document.getElementById('freight-charges');
    [qtyInput, rateInput, freightInputEl].forEach(input => {
        if(input) input.addEventListener('input', calculateFinancials);
    });
    if(unitSelect) {
        unitSelect.addEventListener('change', () => {
            calculateFinancials();
            updateUnitLabels();
            window.updateCurrentStockDisplay();
        });
    }

    const paymentMethodEl = document.getElementById('payment-method');
    const bankNameRow = document.getElementById('bank-name-row');
    if (paymentMethodEl) {
        paymentMethodEl.addEventListener('change', () => {
            if (paymentMethodEl.value === 'Bank Transfer') {
                if (bankNameRow) bankNameRow.style.display = 'flex';
            } else {
                if (bankNameRow) bankNameRow.style.display = 'none';
            }
        });
        paymentMethodEl.dispatchEvent(new Event('change'));
    }

    // Cart Logic
    const btnAddToCart = document.getElementById('btn-add-to-cart');
    const cartTableBody = document.querySelector('#cart-table tbody');
    const grandTotalInput = document.getElementById('total-amount');
    const paidInput = document.getElementById('amount-paid');
    const remainingInput = document.getElementById('amount-remaining');

    const cartTotalInput = document.getElementById('cart-total');
    const previousBalanceInput = document.getElementById('previous-balance');
    const personNameInput = document.getElementById('person-name');

    window.updateCheckoutFinancials = function(e) {
        let cartTotal = 0;
        window.currentCart.forEach(item => { cartTotal += parseFloat(item.totalAmount); });
        
        if (cartTotalInput) cartTotalInput.value = cartTotal.toFixed(2);

        // Get Previous Balance
        let prevBalance = 0;
        if (personNameInput && personNameInput.value.trim() !== '') {
            let pName = personNameInput.value.trim();
            const matchWithDash = pName.match(/^\d+\s*-\s*(.+)/);
            if (matchWithDash) {
                pName = matchWithDash[1].trim();
            }
            
            const transactions = window.Store.getTransactions();
            let netBalance = 0;
            transactions.forEach(t => {
                if (t.person === pName && t.id !== window.editingTxId) {
                    const totalAmt = parseFloat(t.totalAmount) || 0;
                    const paidAmt = parseFloat(t.paidAmount) || 0;
                    
                    if (t.type === 'out') {
                        netBalance += totalAmt;
                        netBalance -= paidAmt;
                    } else if (t.type === 'in') {
                        netBalance -= totalAmt;
                        netBalance += paidAmt;
                    } else if (t.type === 'payment-in' || t.type === 'payment' || t.type === 'payment-out') {
                        if (t.type === 'payment-out') {
                            netBalance += totalAmt;
                            netBalance += paidAmt; // We gave money, they owe us
                        } else {
                            netBalance += totalAmt;
                            netBalance -= paidAmt; // They gave money, we owe them
                        }
                    }
                }
            });
            prevBalance = netBalance;
        }

        const type = document.getElementById('transaction-type').value;

        // Contextual Display Logic for UI and Invoices
        let displayPrevBalance = prevBalance;

        if (previousBalanceInput) previousBalanceInput.value = displayPrevBalance.toFixed(2);

        let grandTotal = 0;
        if (type === 'in' || type === 'payment-out') {
            grandTotal = displayPrevBalance - cartTotal;
        } else {
            grandTotal = displayPrevBalance + cartTotal;
        }
        
        grandTotalInput.value = grandTotal.toFixed(2);

        const paid = parseFloat(paidInput.value) || 0;
        let remaining = 0;
        if (type === 'in' || type === 'payment-out') {
            remaining = grandTotal + paid;
        } else {
            remaining = grandTotal - paid;
        }
        remainingInput.value = remaining.toFixed(2);
    };

    if (personNameInput) {
        personNameInput.addEventListener('input', window.updateCheckoutFinancials);
        personNameInput.addEventListener('change', window.updateCheckoutFinancials);
    }

    if (paidInput) paidInput.addEventListener('input', window.updateCheckoutFinancials);

    window.renderCart = function() {
        cartTableBody.innerHTML = '';
        if (window.currentCart.length === 0) {
            const lang = localStorage.getItem('lang') || 'en';
            const msg = lang === 'ur' ? 'فہرست خالی ہے۔ اوپر آئٹمز شامل کریں۔' : 'No items added yet. Add items above.';
            cartTableBody.innerHTML = `<tr id="cart-empty-row"><td colspan="5" style="text-align: center; padding: 24px; color: var(--text-secondary);">${msg}</td></tr>`;
        } else {
            window.currentCart.forEach((item, index) => {
                let displayUnit = item.unit;
                if (localStorage.getItem('lang') === 'ur') {
                    if (displayUnit === 'amount') displayUnit = 'تعداد';
                    else if (displayUnit === 'kg') displayUnit = 'کلو';
                    else if (displayUnit === 'mun') displayUnit = 'من';
                    else if (displayUnit === 'pound') displayUnit = 'پاؤنڈ';
                    else if (displayUnit === 'tola') displayUnit = 'تولہ';
                    else if (displayUnit === 'bag') displayUnit = 'بوری';
                }

                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${item.itemName}</td>
                    <td>${item.qty} <small>${displayUnit}</small></td>
                    <td>${item.ratePerUnit || item.ratePerKg || 0}</td>
                    <td>${item.totalAmount.toFixed(2)}</td>
                    <td>
                        <button type="button" class="action-btn del" onclick="window.removeFromCart(${index})">
                            <i class='bx bx-trash'></i>
                        </button>
                    </td>
                `;
                cartTableBody.appendChild(tr);
            });
        }
        window.updateCheckoutFinancials();
    };

    window.removeFromCart = function(index) {
        window.currentCart.splice(index, 1);
        window.renderCart();
    };

    if (btnAddToCart) {
        btnAddToCart.addEventListener('click', () => {
            const txType = document.getElementById('transaction-type').value;
            if (!txType) {
                const lang = localStorage.getItem('lang') || 'en';
                alert(lang === 'ur' ? "براہ کرم پہلے ٹرانزیکشن کی قسم (اسٹاک آمد یا روانگی) منتخب کریں۔" : "Please select Transaction Type (Stock In or Stock Out) first.");
                return;
            }

            const itemInputValue = itemSelect.value.trim();
            const items = window.Store.getItems();
            let itemId = null;
            let itemName = 'Unknown Item';

            if (itemInputValue) {
                const match = itemInputValue.match(/^(\d+)/);
                if (match) {
                    const index = parseInt(match[1]) - 1;
                    if (items[index]) {
                        itemId = items[index].id;
                        itemName = items[index].name;
                    }
                } else {
                    const foundItem = items.find(i => i.name.toLowerCase() === itemInputValue.toLowerCase());
                    if (foundItem) {
                        itemId = foundItem.id;
                        itemName = foundItem.name;
                    }
                }
            }

            const freightInput = document.getElementById('freight-charges');
            const freight = freightInput ? (parseFloat(freightInput.value) || 0) : 0;

            if (!itemId) {
                if (!itemInputValue && freight > 0) {
                    itemId = 'FREIGHT-CHARGE';
                    const lang = localStorage.getItem('lang') || 'en';
                    itemName = lang === 'ur' ? 'فریٹ چارجز' : 'Freight Charges';
                } else {
                    alert("Please select a valid item from the list.");
                    return;
                }
            }

            let qty = parseFloat(qtyInput.value) || 0;
            let unit = unitSelect.value;
            const rate = parseFloat(rateInput.value) || 0;
            const totalKg = calculateTotalWeight();
            
            if (itemId === 'FREIGHT-CHARGE') {
                qty = 1;
                unit = 'amount';
            } else if (totalKg <= 0) {
                alert("Quantity must be greater than 0.");
                return;
            }

            let mun = 0, kg = 0, grams = 0, pound = 0, tola = 0, bag = 0, bag50 = 0, bag34 = 0;
            if (unit === 'mun') mun = qty;
            else if (unit === 'kg') kg = qty;
            else if (unit === 'gram') grams = qty;
            else if (unit === 'pound') pound = qty;
            else if (unit === 'tola') tola = qty;
            else if (unit === 'bag') bag = qty;
            else if (unit === 'bag50') bag50 = qty;
            else if (unit === 'bag34') bag34 = qty;

            const totalAmount = (qty * rate) + freight;

            const cartItem = {
                itemId,
                itemName,
                qty,
                unit,
                weight: { mun, kg, grams, pound, tola, bag, bag50, bag34 },
                totalKg,
                ratePerUnit: rate,
                freight: freight,
                totalAmount
            };

            window.currentCart.push(cartItem);
            window.renderCart();

            // Clear inputs for next item
            itemSelect.value = '';
            qtyInput.value = '';
            rateInput.value = '';
            if (freightInput) freightInput.value = '0';
            calculateFinancials();
            window.updateCurrentStockDisplay();
        });
    }

    // Form Submission
    const stockForm = document.getElementById('stock-form');
    stockForm.addEventListener('submit', (e) => {
        e.preventDefault();

        const type = document.getElementById('transaction-type').value;

        if (!type.startsWith('payment-') && window.currentCart.length === 0) {
            alert("Please add at least one item to the list before saving.");
            return;
        }

        const personInputValue = document.getElementById('person-name').value.trim();
        
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

        // Add person to registry if new
        window.Store.addPerson(personName);
        window.populatePersonSelect();

        const grandTotal = parseFloat(grandTotalInput.value) || 0;
        
        let cartTotal = 0;
        window.currentCart.forEach(item => { cartTotal += parseFloat(item.totalAmount); });

        const previousBalanceInput = document.getElementById('previous-balance');
        const prevBalance = previousBalanceInput ? (parseFloat(previousBalanceInput.value) || 0) : 0;

        const paid = parseFloat(paidInput.value) || 0;
        const remaining = grandTotal - paid;

        const dateInput = document.getElementById('transaction-date');
        const customDate = dateInput && dateInput.value ? new Date(dateInput.value) : null;
        if (customDate) {
            // Keep current time, just set date
            const now = new Date();
            customDate.setHours(now.getHours(), now.getMinutes(), now.getSeconds());
        }

        // Construct multi-item transaction
        const paymentMethodEl = document.getElementById('payment-method');
        const paymentMethod = paymentMethodEl ? paymentMethodEl.value : 'Cash';
        const bankNameInput = document.getElementById('bank-name');
        const bankName = (paymentMethod === 'Bank Transfer' && bankNameInput) ? bankNameInput.value.trim() : '';

        const tx = {
            type: type,
            person: personName,
            items: window.currentCart, // Store the array of items
            totalAmount: cartTotal,      // Strict cart total so global math doesn't double count!
            previousBalance: prevBalance, // Saved so invoice generation knows about it
            grandTotal: grandTotal,       // Saved for easy access
            paidAmount: paid,
            remainingAmount: remaining,
            paymentMethod: paymentMethod,
            bankName: bankName,
            date: customDate ? customDate.toISOString() : new Date().toISOString()
        };

        // For backward compatibility on simple views, set top level itemName to a summary
        const itemNames = window.currentCart.map(i => i.itemName);
        tx.itemName = itemNames.length > 2 ? `${itemNames.slice(0,2).join(', ')}... (+${itemNames.length-2} more)` : itemNames.join(', ');
        // Set top level itemId to the first item just in case
        tx.itemId = window.currentCart[0].itemId; 
        
        // Sum totalKg for backward compatibility
        tx.totalKg = window.currentCart.reduce((sum, i) => sum + i.totalKg, 0);

        if (window.editingTxId) {
            window.Store.updateTransaction(window.editingTxId, tx);
            alert(`Transaction updated successfully!`);
            window.editingTxId = null;
            
            // Restore button text
            const submitBtn = document.querySelector('#stock-form button[type="submit"]');
            if (submitBtn) {
                const lang = localStorage.getItem('lang') || 'en';
                submitBtn.innerHTML = lang === 'ur' ? 'ٹرانزیکشن محفوظ کریں' : 'Save Transaction';
            }
        } else {
            window.Store.addTransaction(tx);
            alert(`Transaction saved successfully!`);
        }
        
        // Reset form
        stockForm.reset();
        setDefaultDate();
        window.currentCart = [];
        window.renderCart();
        window.updateCurrentStockDisplay();
        if (paymentMethodEl) paymentMethodEl.dispatchEvent(new Event('change'));

        if (typeof updateDashboard === 'function') updateDashboard();
        if (typeof renderInvoicesTable === 'function') renderInvoicesTable();
    });

    // Check for editing state from invoices page
    const editingTxId = sessionStorage.getItem('editingTxId');
    if (editingTxId) {
        sessionStorage.removeItem('editingTxId');
        
        const transactions = window.Store.getTransactions();
        const tx = transactions.find(t => t.id === editingTxId);
        
        if (tx) {
            window.editingTxId = editingTxId;
            window.currentCart = tx.items || [tx];
            
            document.getElementById('transaction-type').value = tx.type;
            document.getElementById('person-name').value = tx.person;
            
            const paidInput = document.getElementById('amount-paid');
            if (paidInput) {
                paidInput.value = parseFloat(tx.paidAmount).toFixed(2);
            }

            const paymentMethodEl = document.getElementById('payment-method');
            if (paymentMethodEl && tx.paymentMethod) {
                paymentMethodEl.value = tx.paymentMethod;
                paymentMethodEl.dispatchEvent(new Event('change'));
            }
            const bankNameInput = document.getElementById('bank-name');
            if (bankNameInput && tx.bankName) {
                bankNameInput.value = tx.bankName;
            }
            
            const dateInput = document.getElementById('transaction-date');
            if (dateInput && tx.date) {
                // format YYYY-MM-DD
                const d = new Date(tx.date);
                const isoDate = d.toISOString().split('T')[0];
                dateInput.value = isoDate;
                
                const parts = isoDate.split('-');
                if (parts.length === 3) {
                    dateInput.setAttribute('data-date', `${parts[2]}/${parts[1]}/${parts[0]}`);
                }
            }
            
            if (typeof window.renderCart === 'function') {
                window.renderCart();
            }
            
            const submitBtn = document.querySelector('#stock-form button[type="submit"]');
            if (submitBtn) {
                const lang = localStorage.getItem('lang') || 'en';
                submitBtn.innerHTML = lang === 'ur' ? '<i class="bx bx-save"></i> ٹرانزیکشن اپ ڈیٹ کریں' : '<i class="bx bx-save"></i> Update Transaction';
            }
        }
    }
});
