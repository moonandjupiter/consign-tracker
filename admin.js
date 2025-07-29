// admin.js - Logic for the admin control panel

document.addEventListener('DOMContentLoaded', () => {
    // The server now handles all redirects. This client-side check is removed.
    const accessToken = sessionStorage.getItem('admin_access_token');

    if (!accessToken) {
        // This is a fallback. The server should have already redirected.
        // If an API call is made without a token, fetchWithAuth will handle the redirect.
        console.log("No access token found in session storage. API calls will likely fail and trigger a redirect.");
    }

    // --- Element References ---
    const coSearchInput = document.getElementById('coSearchInput');
    const reportsContainer = document.getElementById('reportsContainer');
    const reportsHeader = document.getElementById('reportsHeader');
    const reportsTableBody = document.getElementById('reportsTableBody');
    const adminMessageBox = document.getElementById('adminMessageBox');
    const publishSelectedBtn = document.getElementById('publishSelectedBtn');
    const unpublishSelectedBtn = document.getElementById('unpublishSelectedBtn');
    const logoutButton = document.getElementById('logoutButton');
    const suggestionsList = document.getElementById('suggestionsList');
    const clearSearchButton = document.getElementById('clearSearchButton');
    const notifySupplierBtn = document.getElementById('notifySupplierBtn');
    
    // Email Modal Elements
    const emailModalOverlay = document.getElementById('emailModalOverlay');
    const closeEmailModalButton = document.getElementById('closeEmailModalButton');
    const sendEmailBtn = document.getElementById('sendEmailBtn');
    const recipientEmail = document.getElementById('recipientEmail');
    const emailSubject = document.getElementById('emailSubject');
    const emailForm = document.getElementById('emailForm');


    const apiUrl = "/api"; // Use relative path for all API calls

    // --- Helper for API calls ---
    const fetchWithAuth = async (url, options = {}) => {
        const currentToken = sessionStorage.getItem('admin_access_token');
        if (!currentToken) {
            window.location.href = '/login';
            throw new Error('No authentication token found.');
        }

        const headers = {
            ...options.headers,
            'Authorization': `Bearer ${currentToken}`
        };

        const response = await fetch(url, { ...options, headers });

        if (response.status === 401) { // Unauthorized (e.g., token expired)
            sessionStorage.removeItem('admin_access_token');
            document.cookie = 'admin_access_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
            window.location.href = '/login';
            throw new Error('Session expired. Please log in again.');
        }
        return response;
    };


    // --- Functions ---
    function showAdminMessage(message, type = 'info') {
        adminMessageBox.classList.remove('hidden', 'bg-red-100', 'text-red-800', 'bg-blue-100', 'text-blue-800', 'bg-green-100', 'text-green-800');
        let colorClasses = type === 'error' ? 'bg-red-100 text-red-800' : (type === 'success' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800');
        adminMessageBox.classList.add(...colorClasses.split(' '));
        adminMessageBox.textContent = message;
        adminMessageBox.classList.remove('hidden');
    }

    function hideAdminMessage() {
        adminMessageBox.classList.add('hidden');
    }

    function updateActionButtons() {
        const selectedCheckboxes = reportsTableBody.querySelectorAll('input[type="checkbox"]:checked');
        const hasSelection = selectedCheckboxes.length > 0;
        publishSelectedBtn.disabled = !hasSelection;
        unpublishSelectedBtn.disabled = !hasSelection;
        notifySupplierBtn.disabled = !hasSelection;
    }

    function renderReports(reports) {
        reportsTableBody.innerHTML = '';
        if (reports.length === 0) {
            reportsTableBody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-gray-500 text-sm">No sales reports found for this Consignment Order.</td></tr>`;
            return;
        }
        reports.forEach(report => {
            const isPublished = report.is_published === true;
            const row = document.createElement('tr');
            row.className = (isPublished ? 'bg-green-50 hover:bg-green-100' : 'bg-red-50 hover:bg-red-100') + ' cursor-pointer';
            
            const statusText = isPublished ? 'Published' : 'Unpublished';
            const statusClass = isPublished ? 'bg-green-200 text-green-800' : 'bg-red-200 text-red-800';
            row.innerHTML = `
                <td data-label="Select" class="px-2 py-1.5">
                    <input type="checkbox" class="sr-checkbox h-4 w-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500" data-id="${report._id}" data-sr-id="${report.sr_id}">
                </td>
                <td data-label="SR ID:" class="px-2 py-1.5 text-xs font-medium text-gray-900">${report.sr_id || 'N/A'}</td>
                <td data-label="Description:" class="px-2 py-1.5 text-xs">${report.item_description || ''}</td>
                <td data-label="Invoice No:" class="px-2 py-1.5 text-xs">${report.inv_no || '-'}</td>
                <td data-label="Voucher No:" class="px-2 py-1.5 text-xs">${report.voucher_no || '-'}</td>
                <td data-label="Status:" class="px-2 py-1.5 text-center">
                    <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${statusClass}">
                        ${statusText}
                    </span>
                </td>`;
            reportsTableBody.appendChild(row);
        });
    }
    
    async function fetchReports(coNumber) {
        if (!coNumber) {
            showAdminMessage('Please enter a Consignment Order number.', 'error');
            return;
        }
        hideAdminMessage();
        reportsContainer.classList.add('hidden');
        
        try {
            const response = await fetchWithAuth(`${apiUrl}/admin/srs_by_co?co_no=${encodeURIComponent(coNumber)}`);
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw { status: response.status, message: errorData.detail || `Server responded with status: ${response.status}` };
            }
            const reports = await response.json();
            reportsContainer.classList.remove('hidden');
            reportsHeader.textContent = `Results for CO #: ${coNumber}`;
            renderReports(reports);
            updateActionButtons();
        } catch (error) {
            console.error('Error fetching reports:', error);
            if (error.status === 404) {
                showAdminMessage(`No records found for Consignment Order "${coNumber}". Please check the number and try again.`, 'error');
            } else {
                showAdminMessage(`Failed to fetch reports. ${error.message || 'An unknown error occurred.'}`, 'error');
            }
            reportsContainer.classList.add('hidden');
        }
    }

    async function updatePublicationStatus(publish) {
        const selectedCheckboxes = reportsTableBody.querySelectorAll('input.sr-checkbox:checked');
        const srIds = Array.from(selectedCheckboxes).map(cb => cb.dataset.id);
        if (srIds.length === 0) {
            showAdminMessage('Please select at least one report to update.', 'error');
            return;
        }
        hideAdminMessage();
        const originalButtonHtml = publish ? publishSelectedBtn.innerHTML : unpublishSelectedBtn.innerHTML;
        const actionButton = publish ? publishSelectedBtn : unpublishSelectedBtn;
        actionButton.disabled = true;
        actionButton.innerHTML = `<i class="fas fa-spinner fa-spin mr-2"></i>Updating...`;

        try {
            const response = await fetchWithAuth(`${apiUrl}/admin/update_status`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sr_ids: srIds, publish: publish }),
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || 'Failed to update status.');
            }
            const result = await response.json();
            showAdminMessage(result.message, 'success');
            await fetchReports(coSearchInput.value.trim()); // Re-fetch with the current value
        } catch (error) {
            console.error('Error updating status:', error);
            showAdminMessage(`Error: ${error.message}`, 'error');
        } finally {
            actionButton.innerHTML = originalButtonHtml;
        }
    }

    function renderAdminSuggestions(suggestions) {
        suggestionsList.innerHTML = '';
        if (suggestions.length === 0) {
            suggestionsList.classList.add('hidden');
            return;
        }

        suggestions.forEach(suggestion => {
            const suggestionItem = document.createElement('div');
            suggestionItem.textContent = `${suggestion.name_company} – ${suggestion.co_no}`;
            suggestionItem.setAttribute('data-value', suggestion.co_no);
            suggestionItem.addEventListener('click', (event) => {
                event.stopPropagation();
                const coNumber = suggestion.co_no;
                coSearchInput.value = coNumber;
                suggestionsList.classList.add('hidden');
                fetchReports(coNumber);
            });
            suggestionsList.appendChild(suggestionItem);
        });

        const inputRect = coSearchInput.getBoundingClientRect();
        suggestionsList.style.top = `${inputRect.bottom + window.scrollY + 4}px`;
        suggestionsList.style.left = `${inputRect.left + window.scrollX}px`;
        suggestionsList.style.width = `${inputRect.width}px`;
        suggestionsList.classList.remove('hidden');
    }

    // --- Email Modal Logic ---
    function openEmailModal() {
        const selectedCheckboxes = reportsTableBody.querySelectorAll('input.sr-checkbox:checked');
        const selectedSrIds = Array.from(selectedCheckboxes).map(cb => cb.dataset.srId);

        if (selectedSrIds.length === 0) return;

        // Pre-fill the email subject. The body is now generated on the server.
        emailSubject.value = `Notification for Sales Reports: ${selectedSrIds.join(', ')}`;
        
        emailModalOverlay.classList.remove('hidden');
        emailModalOverlay.classList.add('show');
    }

    function closeEmailModal() {
        emailModalOverlay.classList.add('hidden');
        emailModalOverlay.classList.remove('show');
    }

    async function handleSendEmail() {
        if (!emailForm.checkValidity()) {
            emailForm.reportValidity();
            return;
        }

        const selectedCheckboxes = reportsTableBody.querySelectorAll('input.sr-checkbox:checked');
        const selectedIds = Array.from(selectedCheckboxes).map(cb => cb.dataset.id);

        const originalButtonText = sendEmailBtn.innerHTML;
        sendEmailBtn.disabled = true;
        sendEmailBtn.innerHTML = `<i class="fas fa-spinner fa-spin mr-2"></i>Sending...`;

        try {
            const response = await fetchWithAuth(`${apiUrl}/admin/send_email`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    recipient: recipientEmail.value,
                    subject: emailSubject.value,
                    sr_ids: selectedIds,
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || 'Failed to send email.');
            }

            const result = await response.json();
            showAdminMessage(result.message, 'success');
            closeEmailModal();

        } catch (error) {
            console.error('Error sending email:', error);
            showAdminMessage(`Error: ${error.message}`, 'error');
        } finally {
            sendEmailBtn.disabled = false;
            sendEmailBtn.innerHTML = "Send Notification";
        }
    }


    // --- Event Listeners ---
    if (coSearchInput) {
        coSearchInput.addEventListener('input', async () => {
            const searchTerm = coSearchInput.value.trim();
            if (clearSearchButton) {
                clearSearchButton.classList.toggle('hidden', !searchTerm);
            }

            if (searchTerm.length < 2) {
                suggestionsList.classList.add('hidden');
                return;
            }

            try {
                const response = await fetchWithAuth(`${apiUrl}/admin/suggestions?query=${encodeURIComponent(searchTerm)}`);
                if (!response.ok) {
                    throw new Error('Failed to fetch suggestions');
                }
                const suggestions = await response.json();
                renderAdminSuggestions(suggestions);
            } catch (error) {
                console.error("Error fetching suggestions:", error);
                suggestionsList.classList.add('hidden');
            }
        });

        coSearchInput.addEventListener('keypress', (event) => {
            if (event.key === 'Enter') {
                suggestionsList.classList.add('hidden');
                fetchReports(coSearchInput.value.trim());
            }
        });
    }
    
    if (clearSearchButton) {
        clearSearchButton.addEventListener('click', () => {
            coSearchInput.value = '';
            clearSearchButton.classList.add('hidden');
            suggestionsList.classList.add('hidden');
            reportsContainer.classList.add('hidden');
            hideAdminMessage();
        });
    }

    if (reportsTableBody) {
        reportsTableBody.addEventListener('click', (event) => {
            if (event.target.matches('.sr-checkbox')) {
                updateActionButtons();
                return;
            }
            
            const row = event.target.closest('tr');
            if (!row) return;
            
            const checkbox = row.querySelector('.sr-checkbox');
            if (!checkbox) return;
            
            checkbox.checked = !checkbox.checked;
            
            const changeEvent = new Event('change', { bubbles: true });
            checkbox.dispatchEvent(changeEvent);
        });

        reportsTableBody.addEventListener('change', (event) => {
            if (event.target.matches('.sr-checkbox')) {
                updateActionButtons();
            }
        });
    }

    if (publishSelectedBtn) {
        publishSelectedBtn.addEventListener('click', () => updatePublicationStatus(true));
    }
    if (unpublishSelectedBtn) {
        unpublishSelectedBtn.addEventListener('click', () => updatePublicationStatus(false));
    }
    if (logoutButton) {
        logoutButton.addEventListener('click', () => {
            sessionStorage.removeItem('admin_access_token');
            document.cookie = 'admin_access_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
            window.location.href = '/login';
        });
    }
    if (notifySupplierBtn) {
        notifySupplierBtn.addEventListener('click', openEmailModal);
    }
    if (closeEmailModalButton) {
        closeEmailModalButton.addEventListener('click', closeEmailModal);
    }
    if (sendEmailBtn) {
        sendEmailBtn.addEventListener('click', handleSendEmail);
    }

    window.addEventListener('click', (event) => {
        if (suggestionsList && coSearchInput && !coSearchInput.contains(event.target) && !suggestionsList.contains(event.target)) {
            suggestionsList.classList.add('hidden');
        }
        if (emailModalOverlay && !event.target.closest('.modal-content') && !event.target.closest('#notifySupplierBtn')) {
            closeEmailModal();
        }
    });
});
