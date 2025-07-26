// IMPORTANT: This frontend code now expects to fetch data from a local backend API.
// You must create a server that connects to your MongoDB and exposes an endpoint.
// Example API URL: http://localhost:3000/api/consign_tracker
// Your MongoDB database name: consign_tracker_db
// Your MongoDB collection name: consign_tracker

// Constants for API URL, items per page, and global state variables
const apiUrl = "https://consigntracker-db.jtdigital.cc/api/consign_tracker"; // <-- IMPORTANT: This must point to your local backend API
const itemsPerPage = 5;
let currentPage = 1;
let allData = [];
let processedData = [];
let filteredData = [];
let lastDisplayedData = [];
let currentSortColumn = null;
let currentSortDirection = 'asc';
let lastClickedConsignmentOrder = null;

let allMatchedSuggestions = [];
let currentSuggestionOffset = 0;

const searchInput = document.getElementById('searchInput');
const clearSearchButton = document.getElementById('clearSearchButton');
const exportButton = document.getElementById('exportButton');
const exportDropdown = document.getElementById('exportDropdown');
const exportHtmlOption = document.getElementById('exportHtmlOption');
const invoiceTableBody = document.getElementById('invoiceTableBody');

const messageBox = document.getElementById('messageBox');
const quantitySummaryPanel = document.getElementById('quantitySummaryPanel');
const overallSummaryDiv = document.getElementById('overallSummary');
const consignmentSummaryList = document.getElementById('consignmentSummaryList');
const suggestionsList = document.getElementById('suggestionsList');
const sortableTableHeaders = document.querySelectorAll('#invoiceTable th.sortable');
const tableContainer = document.getElementById('tableContainer');
const paginationContainer = document.getElementById('paginationContainer');
const loadingOverlay = document.getElementById('loadingOverlay');
const mainContent = document.getElementById('mainContent');
const tableLoadingOverlay = document.getElementById('tableLoadingOverlay');

const detailsModalOverlay = document.getElementById('detailsModalOverlay');
const closeModalButton = document.getElementById('closeModalButton');
const modalDetailsBody = document.getElementById('modalDetailsBody');
const printDetailsButton = document.getElementById('printDetailsButton');
const termsCheckbox = document.getElementById('termsCheckbox');


const messageModalOverlay = document.getElementById('messageModalOverlay');
const messageModalTitle = document.getElementById('messageModalTitle');
const messageModalBody = document.getElementById('messageModalBody');
const closeMessageModalButton = document.getElementById('closeMessageModalButton');
const messageModalOkButton = document.getElementById('messageModalOkButton');

const dashboardContainer = document.getElementById('dashboardContainer');
const dashboardMainTitle = document.getElementById('dashboardMainTitle');
const srProgressBubblesContainer = document.getElementById('srProgressBubblesContainer');

const acknowledgedConsignments = new Set();

function showMessage(message, type = 'info') {
    messageBox.classList.remove('hidden', 'bg-red-100', 'text-red-800', 'bg-blue-100', 'text-blue-800', 'flex', 'items-center', 'justify-center');
    messageBox.innerHTML = '';

    if (message === "Retrieving consignments..." && type === 'info') {
        messageBox.classList.add('bg-blue-100', 'text-blue-800', 'flex', 'items-center', 'justify-content-center');
        messageBox.textContent = "Retrieving consignments...";
    } else {
        messageBox.classList.add('mt-4', 'p-4', 'rounded-md');
        if (type === 'error') {
            messageBox.classList.add('bg-red-100', 'text-red-800');
        } else {
            messageBox.classList.add('bg-blue-100', 'text-blue-800');
        }
        messageBox.textContent = message;
    }
    messageBox.classList.remove('hidden');
}

function hideMessageBox() {
    messageBox.classList.add('hidden');
    messageBox.innerHTML = '';
    messageBox.classList.remove('bg-red-100', 'text-red-800', 'bg-blue-100', 'text-blue-800', 'flex', 'items-center', 'justify-content-center');
}

function showInfoModal(title, message) {
    console.log('Attempting to show info modal...');
    messageModalTitle.textContent = title;
    messageModalBody.textContent = message;
    messageModalOverlay.classList.add('show');
    messageModalOverlay.classList.remove('hidden');
    console.log('Info Modal shown.');
}

function hideInfoModal() {
    console.log('Attempting to hide info modal...');
    messageModalOverlay.classList.remove('show');
    messageModalOverlay.classList.add('hidden');
    console.log('Info Modal hidden.');
}

function calculateAndDisplaySummary() {
    const totalResults = filteredData.length;
    const resultWord = totalResults === 1 ? 'result' : 'results';
    overallSummaryDiv.textContent = `Found ${totalResults} ${resultWord}:`;

    const consignmentTotals = filteredData.reduce((acc, item) => {
        const consignmentNumber = String(item.co_no || 'N/A');
        const quantity = parseFloat(String(item.qty_sold || '0').replace(/[^0-9.-]+/g,"")) || 0;
        const amount = parseFloat(String(item.amount || '0').replace(/[^0-9.-]+/g,"")) || 0;

        if (!acc[consignmentNumber]) {
            acc[consignmentNumber] = {
                consignmentOrder: consignmentNumber,
                quantity: 0,
                amount: 0
            };
        }

        if (!isNaN(quantity)) {
            acc[consignmentNumber].quantity += quantity;
        }
        if (!isNaN(amount)) {
            acc[consignmentNumber].amount += amount;
        }
        return acc;
    }, {});

    consignmentSummaryList.innerHTML = '';

    if (Object.keys(consignmentTotals).length > 0) {
        const sortedConsignments = Object.entries(consignmentTotals).sort(([keyA, valA], [keyB, valB]) => {
            return String(valA.consignmentOrder).localeCompare(String(valB.consignmentOrder));
        });

        sortedConsignments.forEach(([compositeKey, totals]) => {
            const formattedQuantity = totals.quantity.toLocaleString();
            const formattedAmount = totals.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            const pcWord = totals.quantity === 1 ? 'pc' : 'pcs';
            const listItem = document.createElement('li');
            listItem.innerHTML = `CO Number ${totals.consignmentOrder} : <span class="font-bold text-blue-700">${formattedQuantity} ${pcWord}</span>, Total Amount <span class="font-bold text-blue-700">${formattedAmount}</span> reported sold.`;
            consignmentSummaryList.appendChild(listItem);
        });
    } else {
        const listItem = document.createElement('li');
        listItem.textContent = 'No consignment breakdown available.';
        consignmentSummaryList.appendChild(listItem);
    }

    if (searchInput.value.trim() !== '' && filteredData.length > 0) {
        quantitySummaryPanel.classList.remove('hidden');
    } else {
        quantitySummaryPanel.classList.add('hidden');
    }
}

/**
 * Updates the pagination controls based on the current page and total pages.
 */
function updatePaginationControls() {
    const paginationJoinDiv = paginationContainer.querySelector('.pagination-join');
    if (!paginationJoinDiv) {
        return;
    }
    paginationJoinDiv.innerHTML = ''; // Clear old buttons

    const totalPages = Math.ceil(filteredData.length / itemsPerPage);

    if (totalPages <= 1) {
        paginationContainer.classList.add('hidden');
        return;
    }
    paginationContainer.classList.remove('hidden');

    // Previous Button
    const prevButton = document.createElement('button');
    prevButton.innerHTML = '&laquo;';
    prevButton.classList.add('btn', 'pagination-arrow');
    prevButton.disabled = currentPage === 1;
    prevButton.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            renderTable();
        }
    });
    paginationJoinDiv.appendChild(prevButton);

    // Page Number Buttons
    const maxPageButtons = 4;
    let startPage, endPage;

    if (totalPages <= maxPageButtons) {
        startPage = 1;
        endPage = totalPages;
    } else {
        let pagesToShow = maxPageButtons;
        let halfPages = Math.floor(pagesToShow / 2);

        startPage = currentPage - halfPages;
        endPage = currentPage + (pagesToShow - halfPages - 1);

        if (startPage < 1) {
            endPage += (1 - startPage);
            startPage = 1;
        }
        if (endPage > totalPages) {
            startPage -= (endPage - totalPages);
            endPage = totalPages;
            if (startPage < 1) startPage = 1;
        }
         // Ensure we don't exceed maxPageButtons if totalPages is just slightly larger
        if (endPage - startPage + 1 > maxPageButtons) {
            if (currentPage - startPage < endPage - currentPage) { // current page is closer to startPage
                endPage = startPage + maxPageButtons - 1;
            } else { // current page is closer to endPage or in the middle
                startPage = endPage - maxPageButtons + 1;
            }
        }
    }

    for (let i = startPage; i <= endPage; i++) {
        const pageButton = document.createElement('button');
        pageButton.textContent = i;
        pageButton.classList.add('btn', 'pagination-number');
        if (i === currentPage) {
            pageButton.classList.add('active');
        }
        pageButton.addEventListener('click', () => {
            currentPage = i;
            renderTable();
        });
        paginationJoinDiv.appendChild(pageButton);
    }

    // Next Button
    const nextButton = document.createElement('button');
    nextButton.innerHTML = '&raquo;';
    nextButton.classList.add('btn', 'pagination-arrow');
    nextButton.disabled = currentPage === totalPages;
    nextButton.addEventListener('click', () => {
        if (currentPage < totalPages) {
            currentPage++;
            renderTable();
        }
    });
    paginationJoinDiv.appendChild(nextButton);
}


function updateSortIcons() {
    sortableTableHeaders.forEach(header => {
        const sortColumn = header.getAttribute('data-sort');
        const icon = header.querySelector('i');
        if (icon) {
            if (filteredData.length === 0) {
                icon.style.visibility = 'hidden';
                header.classList.remove('sorted-asc', 'sorted-desc');
            } else {
                icon.style.visibility = 'visible';
                icon.classList.remove('fa-sort', 'fa-sort-up', 'fa-sort-down');
                if (sortColumn === currentSortColumn) {
                    icon.classList.add(currentSortDirection === 'asc' ? 'fa-sort-up' : 'fa-sort-down');
                    header.classList.add(currentSortDirection === 'asc' ? 'sorted-asc' : 'sorted-desc');
                } else {
                    icon.classList.add('fa-sort');
                    header.classList.remove('sorted-asc', 'sorted-desc');
                }
            }
        }
    });
}

function sortData(column) {
    if (filteredData.length === 0) {
        return;
    }

    if (currentSortColumn === column) {
        currentSortDirection = currentSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        currentSortColumn = column;
        currentSortDirection = 'asc';
    }

    filteredData.sort((a, b) => {
        const valueA = a[column] || '';
        const valueB = b[column] || '';

        if (column === 'qty_sold' || column === 'amount' || column === 'remaining_bal') {
            const numA = parseFloat(String(valueA).replace(/[^0-9.-]+/g,"")) || 0;
            const numB = parseFloat(String(valueB).replace(/[^0-9.-]+/g,"")) || 0;
            if (numA < numB) return currentSortDirection === 'asc' ? -1 : 1;
            if (numA > numB) return currentSortDirection === 'asc' ? 1 : -1;
            return 0;
        }
        if (String(valueA).localeCompare(String(valueB)) < 0) return currentSortDirection === 'asc' ? -1 : 1;
        if (String(valueA).localeCompare(String(valueB)) > 0) return currentSortDirection === 'asc' ? 1 : -1;
        return 0;
    });

    currentPage = 1;
    renderTable();
    calculateAndDisplaySummary();
}

function getStatusHtml(item) {
    const invoiceNo = String(item.inv_no || '').trim();
    const voucherNo = String(item.voucher_no || '').trim();

    let statusText = '';
    let statusClass = '';

    if (invoiceNo === '' || invoiceNo === '-') {
        statusText = 'awaiting for invoice';
        statusClass = 'status-waiting';
    } else if (voucherNo === '' || voucherNo === '-' || voucherNo === '0') {
        statusText = 'Processing Voucher';
        statusClass = 'status-processing';
    } else {
        statusText = 'complete';
        statusClass = 'status-done';
    }

    return `<span class="status-button ${statusClass}">${statusText}</span>`;
}

function renderTable() {
    invoiceTableBody.innerHTML = '';
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const dataToDisplay = filteredData.slice(startIndex, endIndex);

    if (filteredData.length === 0) {
        const message = searchInput.value.trim() === '' ? 'Enter a search term and press Enter or select a suggestion.' : 'No data found for your search.';
        invoiceTableBody.innerHTML = `<tr><td colspan="10" class="text-center py-4 text-gray-500 empty-table-message">${message}</td></tr>`;

        exportButton.disabled = true;
        tableContainer.classList.add('hidden');
    } else {
        dataToDisplay.forEach(item => {
            const row = document.createElement('tr');
            row.className = 'hover:bg-gray-50';

            const invoiceNo = item.inv_no || '-';
            let invoiceNoCellContent = invoiceNo;

            const voucherValue = String(item.voucher_no || '').trim();
            const hasValidVoucher = voucherValue !== '' && voucherValue !== '0' && voucherValue !== '-';
            const voucherClass = hasValidVoucher ? 'highlight-voucher' : '';

            const statusHtml = getStatusHtml(item);

            const quantitySold = item.qty_sold ? parseFloat(String(item.qty_sold).replace(/[^0-9.-]+/g,"")).toLocaleString() : '';
            const amount = item.amount ? parseFloat(String(item.amount).replace(/[^0-9.-]+/g,"")).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
            const remainingBalance = item.remaining_bal ? parseFloat(String(item.remaining_bal).replace(/[^0-9.-]+/g,"")).toLocaleString() : '0';

            row.innerHTML = `
                <td data-label="SR ID:">${item.sr_id || ''}</td>
                <td data-label="Company:">${item.name_company || ''}</td>
                <td data-label="CO No.:">${item.co_no || ''}</td>
                <td data-label="Quantity:">${quantitySold}</td>
                <td data-label="Remaining Bal:">${remainingBalance}</td>
                <td data-label="Amount:">${amount}</td>
                <td data-label="Invoice No.:">${invoiceNoCellContent}</td>
                <td data-label="Voucher No.:" class="${voucherClass}">${item.voucher_no || '-'}</td>
                <td data-label="Voucher Date:">${item.voucher_date || '-'}</td>
                <td data-label="Status:">${statusHtml}</td>
            `;
            invoiceTableBody.appendChild(row);
        });

        exportButton.disabled = false;
        tableContainer.classList.remove('hidden');
    }

    updatePaginationControls();
    updateSortIcons();
    addAcknowledgeButtonListeners();
}

function mergeData(data) {
    const mergedMap = new Map();

    data.forEach(item => {
        const srId = item.sr_id || '';
        const consignmentOrderNumber = item.co_no || '';
        const key = `${srId}-${consignmentOrderNumber}`;

        const quantity = parseFloat(String(item.qty_sold || '0').replace(/[^0-9.-]+/g,"")) || 0;
        const amount = parseFloat(String(item.amount || '0').replace(/[^0-9.-]+/g,"")) || 0;
        const remaining_bal = parseFloat(String(item.remaining_bal || '0').replace(/[^0-9.-]+/g,"")) || 0;

        if (mergedMap.has(key)) {
            const existing = mergedMap.get(key);
            existing.qty_sold += quantity;
            existing.amount += amount;
            existing.remaining_bal += remaining_bal;
        } else {
            const newItem = { ...item };
            newItem.qty_sold = quantity;
            newItem.amount = amount;
            newItem.remaining_bal = remaining_bal;
            mergedMap.set(key, newItem);
        }
    });

    return Array.from(mergedMap.values());
}

async function fetchData() {
    loadingOverlay.classList.remove('hidden');
    mainContent.classList.add('hidden');
    console.log('Loading overlay shown, main content hidden.');

    try {
        const response = await fetch(apiUrl);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        allData = await response.json();

        // Check sessionStorage for a last search term and restore
        const lastSearchTerm = sessionStorage.getItem('lastSearchTerm');
        if (lastSearchTerm) {
            console.log('Found last search term in session storage:', lastSearchTerm);
            searchInput.value = lastSearchTerm; // Set the input field value
            performSearch(lastSearchTerm); // Trigger a search with the stored term
            clearSearchButton.classList.remove('hidden'); // Ensure clear button is visible
        } else {
            // If no stored search, initialize to empty state
            processedData = [];
            filteredData = [];
            lastDisplayedData = [];
            hideMessageBox();
            quantitySummaryPanel.classList.add('hidden');
            dashboardContainer.classList.add('hidden');
            renderTable(); // Render empty table if no search term
        }

        console.log('Raw data fetched successfully. Dashboard and table will load on search or restored search.');

        setTimeout(() => {
            loadingOverlay.classList.add('hidden');
            mainContent.classList.remove('hidden');
            console.log('Loading overlay hidden and main content shown after successful fetch (5000ms delay).');
        }, 5000);

    } catch (error) {
        console.error("Error fetching data:", error);
        showMessage(`Failed to load data from your local API. Make sure your backend server is running. Error: ${error.message}`, 'error');
        invoiceTableBody.innerHTML = '<tr><td colspan="10" class="text-center py-4 text-red-500 empty-table-message">Error loading data. Please check your API connection.</td></tr>';
        quantitySummaryPanel.classList.add('hidden');
        dashboardContainer.classList.add('hidden');
        tableContainer.classList.add('hidden');
        paginationContainer.classList.add('hidden');

        setTimeout(() => {
            loadingOverlay.classList.add('hidden');
            mainContent.classList.remove('hidden');
        }, 500);
    }
}

function performSearch(searchValue = null) {
    console.log("performSearch called. Search term (raw):", searchInput.value);

    hideMessageBox();
    showMessage("Retrieving consignments...", 'info');
    tableLoadingOverlay.classList.remove('hidden');

    setTimeout(() => {
        invoiceTableBody.innerHTML = '';
        tableLoadingOverlay.classList.add('hidden');

        let searchTerm;
        if (searchValue !== null) {
            searchTerm = String(searchValue).toLowerCase();
            searchInput.value = searchTerm; // Ensure input field is updated
            console.log("Searching by suggestion value (Consignment Order Number) or restored value:", searchTerm);
        } else {
            searchTerm = searchInput.value.toLowerCase();
            console.log("Searching by typed input:", searchTerm);
        }

        // Save the current search term to session storage
        if (searchTerm) {
            sessionStorage.setItem('lastSearchTerm', searchTerm);
        } else {
            sessionStorage.removeItem('lastSearchTerm');
        }

        if (searchTerm) {
            processedData = mergeData(allData);

            const relevantCOs = new Set();
            processedData.forEach(item => {
                const srId = item.sr_id ? String(item.sr_id).toLowerCase() : '';
                const consignmentOrderNumber = item.co_no ? String(item.co_no).toLowerCase() : '';
                const invoiceNo = item.inv_no ? String(item.inv_no).toLowerCase() : '';

                if (srId.includes(searchTerm) || consignmentOrderNumber.includes(searchTerm) || invoiceNo.includes(searchTerm)) {
                    if (item.co_no) {
                        relevantCOs.add(item.co_no);
                    }
                }
            });

            filteredData = processedData.filter(item =>
                relevantCOs.has(item.co_no)
            );

            filteredData.sort((a, b) => {
                const srA = String(a.sr_id || '').toLowerCase();
                const srB = String(b.sr_id || '').toLowerCase();
                if (srA < srB) return -1;
                if (srA > srB) return 1;
                return 0;
            });

        } else {
            filteredData = [];
            processedData = [];
            // Ensure quantities are hidden if no search term
            quantitySummaryPanel.classList.add('hidden');
            dashboardContainer.classList.add('hidden');
        }

        console.log("Filtered Data Length after search:", filteredData.length);
        currentPage = 1;
        calculateAndDisplaySummary();
        renderTable();
        renderDashboard();
        hideMessageBox();

        lastDisplayedData = [...filteredData];

        if (filteredData.length === 0 && searchInput.value.trim() !== '') {
            showMessage("No matching results found.", 'info');
        }
    }, 500);
}


searchInput.addEventListener('keypress', (event) => {
    if (event.key === 'Enter') {
        event.preventDefault();
        performSearch();
        suggestionsList.classList.add('hidden');
    }
});

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function renderSuggestions(suggestionsToRender, offset) {
    suggestionsList.innerHTML = '';
    const suggestionsPerPage = 5;
    let currentBatch = suggestionsToRender.slice(offset, offset + suggestionsPerPage);

    if (currentBatch.length === 0 && offset > 0) {
        suggestionsList.classList.add('hidden');
        return;
    }

    if (offset === 0 && suggestionsToRender.length <= suggestionsPerPage) {
        currentBatch = suggestionsToRender.sort((a, b) => a.display.localeCompare(b.display));
    } else if (offset === 0 && suggestionsToRender.length > suggestionsPerPage) {
        currentBatch = shuffleArray([...suggestionsToRender]).slice(0, suggestionsPerPage);
    } else if (offset > 0) {
        currentBatch = suggestionsToRender.slice(offset, offset + suggestionsPerPage);
    }


    currentBatch.forEach(suggestion => {
        const suggestionItem = document.createElement('div');
        suggestionItem.textContent = suggestion.display;
        suggestionItem.setAttribute('data-value', suggestion.value);
        suggestionItem.addEventListener('click', (event) => {
            event.stopPropagation();
            searchInput.value = suggestion.display;
            suggestionsList.classList.add('hidden');
            performSearch(suggestion.value);
        });
        suggestionsList.appendChild(suggestionItem);
    });

    if (suggestionsToRender.length > offset + suggestionsPerPage) {
        const loadMoreItem = document.createElement('div');
        loadMoreItem.textContent = 'Load more results...';
        loadMoreItem.classList.add('load-more-results');
        loadMoreItem.addEventListener('click', (event) => {
            event.stopPropagation();
            currentSuggestionOffset += suggestionsPerPage;
            renderSuggestions(suggestionsToRender, currentSuggestionOffset);
        });
        suggestionsList.appendChild(loadMoreItem);
    }

    if (suggestionsList.children.length > 0) {
        const inputRect = searchInput.getBoundingClientRect();
        suggestionsList.style.top = `${inputRect.bottom + window.scrollY + 4}px`;
        suggestionsList.style.left = `${inputRect.left + window.scrollX}px`;
        suggestionsList.style.width = `${inputRect.width}px`;
        suggestionsList.classList.remove('hidden');
    } else {
        suggestionsList.classList.add('hidden');
    }
}


searchInput.addEventListener('input', () => {
    const searchTerm = searchInput.value.toLowerCase();
    suggestionsList.innerHTML = '';
    currentSuggestionOffset = 0;

    if (searchInput.value.length > 0) {
        clearSearchButton.classList.remove('hidden');
    } else {
        clearSearchButton.classList.add('hidden');
    }

    if (searchTerm.length > 2 && allData.length > 0) {
        const matchedItemsMap = new Map();

        allData.forEach(item => {
            const srId = item.sr_id ? String(item.sr_id).toLowerCase() : '';
            const consignmentOrderNumber = item.co_no ? String(item.co_no) : '';
            const invoiceNo = item.inv_no ? String(item.inv_no).toLowerCase() : '';
            const companyName = item.name_company ? String(item.name_company) : 'Unknown Company';

            if (srId.includes(searchTerm) || consignmentOrderNumber.toLowerCase().includes(searchTerm) || invoiceNo.includes(searchTerm)) {
                if (consignmentOrderNumber !== '') {
                    matchedItemsMap.set(consignmentOrderNumber, {
                        display: `${companyName} – ${consignmentOrderNumber}`,
                        value: consignmentOrderNumber
                    });
                }
            }
        });

        allMatchedSuggestions = Array.from(matchedItemsMap.values());
        renderSuggestions(allMatchedSuggestions, currentSuggestionOffset);
    } else {
        suggestionsList.classList.add('hidden');
        suggestionsList.innerHTML = '';
        allMatchedSuggestions = [];
        currentSuggestionOffset = 0;
    }
    hideMessageBox();
});

clearSearchButton.addEventListener('click', () => {
    searchInput.value = '';
    clearSearchButton.classList.add('hidden');
    hideMessageBox();
    suggestionsList.classList.add('hidden');
    suggestionsList.innerHTML = '';
    allMatchedSuggestions = [];
    currentSuggestionOffset = 0;

    // Clear saved search term from sessionStorage
    sessionStorage.removeItem('lastSearchTerm');

    // Reset to empty state
    filteredData = [];
    processedData = [];

    // Ensure all relevant sections are hidden when search is cleared
    quantitySummaryPanel.classList.add('hidden');
    dashboardContainer.classList.add('hidden');
    tableContainer.classList.add('hidden'); // Hide table on clear
    paginationContainer.classList.add('hidden'); // Hide pagination on clear

    currentPage = 1;
    renderTable(); // Re-render table to show empty message
    renderDashboard();
});


exportButton.addEventListener('click', (event) => {
    event.stopPropagation();
    exportDropdown.classList.toggle('hidden');
    exportDropdown.classList.toggle('show');
});

window.addEventListener('click', (event) => {
    const isClickOutsideExport = !exportButton.contains(event.target) && !exportDropdown.contains(event.target);
    const isClickOutsideSearch = !searchInput.contains(event.target) && !suggestionsList.contains(event.target) && !clearSearchButton.contains(event.target);
    const isClickOutsideMessageModal = !messageModalOverlay.classList.contains('hidden') && !messageModalOverlay.contains(event.target) && !event.target.closest('#messageModalOverlay .modal-content');
    const isClickOutsideDetailsModal = !detailsModalOverlay.classList.contains('hidden') && !detailsModalOverlay.contains(event.target) && !event.target.closest('#detailsModalOverlay .modal-content');


    if (isClickOutsideExport) {
        exportDropdown.classList.remove('show');
        exportDropdown.classList.add('hidden');
    }
    if (isClickOutsideSearch) {
        suggestionsList.classList.add('hidden');
    }
    if (isClickOutsideMessageModal) {
        console.log('Click outside message modal detected. Hiding message modal.');
        hideInfoModal();
    }
    if (isClickOutsideDetailsModal) {
        console.log('Click outside details modal detected. Hiding details modal.');
        hideDetailsModal();
    }
});

function showDetailsModal(srId, consignmentOrder) {
    console.log('Attempting to show details modal...');
    const clickedItem = processedData.find(item =>
        String(item.sr_id || 'N/A') === String(srId) &&
        String(item.co_no || 'N/A') === String(consignmentOrder)
    );

    const companyName = clickedItem ? (clickedItem.name_company || 'N/A') : 'N/A';
    const totalQuantity = clickedItem ? (clickedItem.qty_sold || 0) : 0;
    const remainingBalance = clickedItem ? (clickedItem.remaining_bal || 0) : 0;
    const totalAmount = clickedItem ? (clickedItem.amount || 0) : 0;
    const displaySrId = clickedItem ? (clickedItem.sr_id || 'N/A') : srId;

    const numericTotalQuantity = parseFloat(String(totalQuantity).replace(/[^0-9.-]+/g,""));
    const numericRemainingBalance = parseFloat(String(remainingBalance).replace(/[^0-9.-]+/g,""));

    const qtySoldUnit = numericTotalQuantity === 1 ? 'pc' : 'pcs';
    
    let remainingBalanceDisplay;
    if (numericRemainingBalance === 0) {
        remainingBalanceDisplay = '-';
    } else {
        const remainingBalUnit = numericRemainingBalance === 1 ? 'pc' : 'pcs';
        remainingBalanceDisplay = `${numericRemainingBalance.toLocaleString()} ${remainingBalUnit}`;
    }

    modalDetailsBody.innerHTML = `
        <p><strong>Company:</strong> <span>${companyName}</span></p>
        <p><strong>SR ID:</strong> <span>${displaySrId}</span></p>
        <p><strong>C.O.#:</strong> <span>${consignmentOrder}</span></p>
        <p><strong>Total Qty. Sold:</strong> <span>${numericTotalQuantity.toLocaleString()} ${qtySoldUnit}</span></p>
        <p><strong>Remaining Balance:</strong> <span>${remainingBalanceDisplay}</span></p>
        <p><strong>Total Amount:</strong> <span>${totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></p>
    `;

    // Reset checkbox and disable button
    if(termsCheckbox) { // Check if element exists
        termsCheckbox.checked = false;
        printDetailsButton.disabled = true;
    }


    detailsModalOverlay.classList.add('show');
    detailsModalOverlay.classList.remove('hidden');
    console.log('Details Modal shown.');
}

function hideDetailsModal() {
    console.log('Attempting to hide details modal...');
    detailsModalOverlay.classList.remove('show');
    detailsModalOverlay.classList.add('hidden');
    console.log('Details Modal hidden.');
}

function updatePrintButtonLabel() {
    if (window.innerWidth <= 767) {
        printDetailsButton.innerHTML = '<i class="fas fa-share-alt"></i> Confirm and Share';
    } else {
        printDetailsButton.innerHTML = '<i class="fas fa-print"></i> Confirm and Print';
    }
}


const originalPlaceholder = "Search by, Consignment Order Number, SR ID, or Invoice No.";
function updateSearchInputPlaceholder() {
    if (window.innerWidth <= 767) {
        searchInput.placeholder = '';
    } else {
        searchInput.placeholder = originalPlaceholder;
    }
}

async function generateModalPngBlob() {
    const modalContent = document.querySelector('#detailsModalOverlay .modal-content');
    // Get all elements whose styles will be changed for canvas rendering
    const elementsToStyle = {
        closeButton: modalContent.querySelector('.modal-close-button'),
        printButton: modalContent.querySelector('#printDetailsButton'),
        confirmationSection: modalContent.querySelector('.confirmation-section'),
        signatureSection: modalContent.querySelector('.signature-section'),
        signatureBlockCentered: modalContent.querySelector('.signature-block-centered'),
        signatureLineElement: modalContent.querySelector('.signature-line'), // Renamed to avoid conflict
        signatureText: modalContent.querySelector('.signature-text'),
        dateLine: modalContent.querySelector('#modalDateLine'),
        modalNote: modalContent.querySelector('.modal-note.only-print'),
        printSeparator: modalContent.querySelector('.print-separator')
    };

    const originalCssText = {};
    for (const key in elementsToStyle) {
        if (elementsToStyle[key]) {
            originalCssText[key] = elementsToStyle[key].style.cssText;
        }
    }

    try {
        // Apply temporary styles for PNG capture, mimicking print styles
        if (elementsToStyle.closeButton) elementsToStyle.closeButton.style.display = 'none';
        if (elementsToStyle.printButton) elementsToStyle.printButton.style.display = 'none';
        if (elementsToStyle.confirmationSection) elementsToStyle.confirmationSection.style.display = 'none';
        if (elementsToStyle.printSeparator) elementsToStyle.printSeparator.style.display = 'none'; // Hide separator for PNG

        if (elementsToStyle.signatureSection) {
            elementsToStyle.signatureSection.style.display = 'flex';
            elementsToStyle.signatureSection.style.flexDirection = 'row';
            elementsToStyle.signatureSection.style.justifyContent = 'space-between';
            elementsToStyle.signatureSection.style.alignItems = 'baseline';
            elementsToStyle.signatureSection.style.width = '100%';
            elementsToStyle.signatureSection.style.marginTop = '1rem';
            elementsToStyle.signatureSection.style.fontFamily = "'Poppins', sans-serif";
            elementsToStyle.signatureSection.style.color = '#1F2937';
        }
        if (elementsToStyle.signatureBlockCentered) {
            elementsToStyle.signatureBlockCentered.style.display = 'flex';
            elementsToStyle.signatureBlockCentered.style.flexDirection = 'column';
            elementsToStyle.signatureBlockCentered.style.alignItems = 'flex-start';
            elementsToStyle.signatureBlockCentered.style.width = '60%';
            elementsToStyle.signatureBlockCentered.style.margin = '0';
        }
        if (elementsToStyle.signatureLineElement) {
            elementsToStyle.signatureLineElement.style.width = '100%';
            elementsToStyle.signatureLineElement.style.marginBottom = '0.25em';
            elementsToStyle.signatureLineElement.style.borderBottom = '1px solid #A1A1AA';
        }
        if (elementsToStyle.signatureText) {
            elementsToStyle.signatureText.style.fontSize = '0.75rem';
            elementsToStyle.signatureText.style.lineHeight = '1.2';
            elementsToStyle.signatureText.style.width = '100%';
            elementsToStyle.signatureText.style.marginTop = '0';
            elementsToStyle.signatureText.style.textAlign = 'left';
        }
        if (elementsToStyle.dateLine) {
            elementsToStyle.dateLine.style.fontSize = '0.75rem';
            elementsToStyle.dateLine.style.lineHeight = '1.2';
            elementsToStyle.dateLine.style.width = '35%';
            elementsToStyle.dateLine.style.margin = '0';
            elementsToStyle.dateLine.style.textAlign = 'left';
        }
        if (elementsToStyle.modalNote) {
            elementsToStyle.modalNote.style.display = 'block';
            elementsToStyle.modalNote.style.fontSize = '0.7rem';
            elementsToStyle.modalNote.style.marginTop = '1rem';
            elementsToStyle.modalNote.style.textAlign = 'left';
            elementsToStyle.modalNote.style.lineHeight = '1.4';
            elementsToStyle.modalNote.style.color = '#6B7280';
        }


        const canvas = await html2canvas(modalContent, {
            scale: 2,
            useCORS: true,
            logging: false,
            windowWidth: modalContent.scrollWidth,
            windowHeight: modalContent.scrollHeight
        });

        return new Promise(resolve => {
            canvas.toBlob(resolve, 'image/png');
        });
    } finally {
        // Revert styles in a finally block
        for (const key in elementsToStyle) {
            if (elementsToStyle[key]) {
                elementsToStyle[key].style.cssText = originalCssText[key];
            }
        }
    }
}


function triggerDownload(blob, filename, mimeType) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setTimeout(() => URL.revokeObjectURL(url), 10000);

    showMessage("Acknowledgement slip downloaded as PNG.", 'info');
}

function updateAcknowledgeButtonsState(consignmentOrder, srIdToUpdate) { // Added srIdToUpdate
    const ackKey = consignmentOrder + '-' + srIdToUpdate; // Use specific key
    acknowledgedConsignments.add(ackKey);
    renderTable();
    renderDashboard();
}

function addAcknowledgeButtonListeners() {
    // Target new buttons in dashboard
    document.querySelectorAll('.acknowledge-sr-button').forEach(button => {
        if (!button.disabled) {
            button.onclick = (event) => {
                event.stopPropagation();
                const srId = event.currentTarget.dataset.srId;
                const consignmentOrder = event.currentTarget.dataset.consignmentOrder;
                lastClickedConsignmentOrder = consignmentOrder;
                document.getElementById('detailsModalOverlay').dataset.currentSrId = srId;
                showDetailsModal(srId, consignmentOrder);
            };
        }
    });
}

function setupStatusButtonDelegation() {
    invoiceTableBody.addEventListener('click', (event) => {
        const clickedButton = event.target.closest('.status-waiting-clickable');
        if (clickedButton) {
            event.stopPropagation();
            const statusText = clickedButton.textContent.trim();
            if (statusText === 'awaiting for invoice') { // Updated text
            }
        }
    });
}


closeModalButton.addEventListener('click', hideDetailsModal);

if(termsCheckbox && printDetailsButton) {
    termsCheckbox.addEventListener('change', function() {
        printDetailsButton.disabled = !this.checked;
    });
}


printDetailsButton.addEventListener('click', async (event) => {
    console.log('Print/Confirm button clicked.');
    event.stopPropagation();

    const currentSrIdForModal = document.getElementById('detailsModalOverlay').dataset.currentSrId;

    if (lastClickedConsignmentOrder && currentSrIdForModal) {
        updateAcknowledgeButtonsState(lastClickedConsignmentOrder, currentSrIdForModal);
        lastClickedConsignmentOrder = null;
        document.getElementById('detailsModalOverlay').dataset.currentSrId = ''; // Clear it
    }

    if (window.innerWidth <= 767) {
        try {
            console.log('Generating PNG blob for mobile share...');
            const pngBlob = await generateModalPngBlob();
            const file = new File([pngBlob], 'acknowledgement_slip.png', { type: 'image/png' });

            if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
                console.log('Using Web Share API.');
                await navigator.share({
                    files: [file],
                    title: 'Acknowledgement Slip',
                    text: 'Here is your acknowledgement slip.'
                });
                showMessage("Acknowledgement slip shared successfully.", 'info');
            } else {
                console.log('Web Share API not available, falling back to download.');
                triggerDownload(pngBlob, 'acknowledgement_slip.png', 'image/png');
            }
        } catch (error) {
            console.error("Error handling share/download:", error);
            showMessage("Failed to share or download image. Please try again.", 'error');
        }
    } else {
        console.log('Initiating print for desktop.');
        document.body.classList.add('print-active');
        window.print();

        setTimeout(() => {
            document.body.classList.remove('print-active');
        }, 500);
    }
    hideDetailsModal();
});


closeMessageModalButton.addEventListener('click', hideInfoModal);
messageModalOkButton.addEventListener('click', hideInfoModal);

function renderDashboard() {
    srProgressBubblesContainer.innerHTML = '';
    const dataToSummarize = filteredData.length > 0 ? filteredData : [];

    if (dataToSummarize.length === 0) {
        dashboardContainer.classList.add('hidden');
        dashboardMainTitle.textContent = "Consignment Overview Dashboard";
        return;
    } else {
        dashboardContainer.classList.remove('hidden');
    }

    const uniqueCOs = new Set();
    const uniqueCompanies = new Set();
    dataToSummarize.forEach(item => {
        uniqueCOs.add(item.co_no);
        uniqueCompanies.add(item.name_company);
    });

    if (uniqueCompanies.size === 1) {
        dashboardMainTitle.textContent = `${Array.from(uniqueCompanies)[0]}`;
    } else if (uniqueCOs.size === 1) {
        dashboardMainTitle.textContent = `Latest update on C.O. ${Array.from(uniqueCOs)[0]}`;
    } else {
        dashboardMainTitle.textContent = "Latest Consignment Updates";
    }

    dataToSummarize.sort((a, b) => {
        const srA = String(a.sr_id || '').toLowerCase();
        const srB = String(b.sr_id || '').toLowerCase();
        if (srA < srB) return -1;
        if (srA > srB) return 1;
        return 0;
    });

    dataToSummarize.forEach(item => {
        const srId = item.sr_id || 'N/A';
        const coNumber = String(item.co_no || 'N/A');
        const invoiceNo = String(item.inv_no || '').trim();
        const voucherNo = String(item.voucher_no || '').trim();
        const ackKey = coNumber + '-' + srId;
        const isAcknowledgedForThisSR = acknowledgedConsignments.has(ackKey);


        let statusTextSummary = '';
        let srStepClass = 'inactive';
        let invoiceStepClass = 'inactive';
        let voucherStepClass = 'inactive';
        let acknowledgeButtonHtml = '';
        let collapsibleHeaderStatusHTML = '';


        if ((invoiceNo === '' || invoiceNo === '-') && !isAcknowledgedForThisSR) {
            srStepClass = 'active';
            invoiceStepClass = 'step-pending-invoice';
            voucherStepClass = 'inactive';
            acknowledgeButtonHtml = `
                <button class="acknowledge-sr-button ml-2" data-sr-id="${srId}" data-consignment-order="${coNumber}">
                    <i class="fas fa-handshake mr-1"></i> Acknowledge
                </button>`;
            collapsibleHeaderStatusHTML = `
                <span class="badge badge-error gap-1 text-xs py-0.5 px-1.5">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="inline-block w-3 h-3 stroke-current"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                    Awaiting for Invoice
                </span>`;

        } else if ( (invoiceNo === '' || invoiceNo === '-') && isAcknowledgedForThisSR) {
            statusTextSummary = 'Waiting for Invoice';
            srStepClass = 'active';
            invoiceStepClass = 'step-pending-invoice';
            voucherStepClass = 'inactive';
             acknowledgeButtonHtml = `
                <button class="acknowledge-sr-button ml-2" disabled>
                    <i class="fas fa-check mr-1"></i> Acknowledged
                </button>`;
            collapsibleHeaderStatusHTML = statusTextSummary;
        } else if (voucherNo === '' || voucherNo === '-' || voucherNo === '0') {
            statusTextSummary = 'Processing Voucher';
            srStepClass = 'active';
            invoiceStepClass = 'active';
            voucherStepClass = 'step-pending-voucher';
            collapsibleHeaderStatusHTML = statusTextSummary;
        } else {
            statusTextSummary = 'Completed';
            srStepClass = 'completed';
            invoiceStepClass = 'completed';
            voucherStepClass = 'completed';
            collapsibleHeaderStatusHTML = statusTextSummary;
        }


        const bubbleHtml = `
            <div class="collapsible-section">
                <div class="collapsible-header flex justify-between items-center">
                    <div class="collapsible-header-summary">
                        <span class="sr-id-text">SR ID # ${srId}</span>
                        <span class="status-text-summary mt-1">${collapsibleHeaderStatusHTML}</span>
                    </div>
                    <i class="fas fa-chevron-down text-gray-500 collapsible-icon"></i>
                </div>
                <div class="collapsible-content">
                    <div class="progress-bar-container">
                        <div class="progress-bar-header">
                            <h4>Status...</h4>
                            ${acknowledgeButtonHtml}
                        </div>
                        <div class="progress-bar-stages">
                            <div class="progress-stage-item ${srStepClass}">
                                <div class="progress-stage-circle"></div> Sales Report
                            </div>
                            <div class="progress-stage-item ${invoiceStepClass}">
                                <div class="progress-stage-circle"></div> Invoice
                            </div>
                            <div class="progress-stage-item ${voucherStepClass}">
                                <div class="progress-stage-circle"></div> Voucher
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        srProgressBubblesContainer.insertAdjacentHTML('beforeend', bubbleHtml);
    });
    // Event delegation for collapsible headers
    if (!srProgressBubblesContainer.dataset.collapsibleListenerAttached) {
        srProgressBubblesContainer.addEventListener('click', function(event) {
            const header = event.target.closest('.collapsible-header');
            if (!header) return;

            const parentSection = header.closest('.collapsible-section');
            if (!parentSection) return;

            const content = parentSection.querySelector('.collapsible-content');
            const icon = header.querySelector('.collapsible-icon');

            if (content) {
                content.classList.toggle('expanded');
            }
            if (icon) {
                icon.classList.toggle('rotate');
            }
        });
        srProgressBubblesContainer.dataset.collapsibleListenerAttached = 'true';
    }
    addAcknowledgeButtonListeners();
}


document.addEventListener('DOMContentLoaded', () => {
    console.log('DOMContentLoaded fired. Initializing...');
    mainContent.classList.add('hidden');
    loadingOverlay.classList.remove('hidden');

    fetchData(); // This will now handle restoring search state
    updatePrintButtonLabel();
    updateSearchInputPlaceholder();
    setupStatusButtonDelegation();
});

window.addEventListener('resize', () => {
    updatePrintButtonLabel();
    updateSearchInputPlaceholder();

    if (!suggestionsList.classList.contains('hidden')) {
        const inputRect = searchInput.getBoundingClientRect();
        suggestionsList.style.top = `${inputRect.bottom + window.scrollY + 4}px`;
        suggestionsList.style.left = `${inputRect.left + window.scrollX}px`;
        suggestionsList.style.width = `${inputRect.width}px`;
    }
});
