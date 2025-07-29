document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const loginButton = document.getElementById('loginButton');
    const loginMessageBox = document.getElementById('loginMessageBox');
    const apiUrl = "/api"; // Use relative path for API calls

    // The server now handles all redirects. The initial JS check is removed.

    loginForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        
        const username = event.target.username.value;
        const password = event.target.password.value;

        // Show loading state
        loginButton.disabled = true;
        loginButton.textContent = 'Signing In...';
        loginMessageBox.classList.add('hidden');

        try {
            const response = await fetch(`${apiUrl}/admin/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ username, password }),
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.detail || 'Login failed.');
            }

            // On success, store the token in session storage AND a cookie for page-load auth
            sessionStorage.setItem('admin_access_token', result.access_token);
            // Set a cookie that expires in 60 minutes (3600 seconds)
            document.cookie = `admin_access_token=${result.access_token}; path=/; max-age=3600; SameSite=Lax`;
            window.location.href = '/admin'; // Go to the /admin route

        } catch (error) {
            // Show error message
            loginMessageBox.textContent = error.message;
            loginMessageBox.className = 'mb-4 p-3 rounded-md text-sm bg-red-100 text-red-800';
            loginMessageBox.classList.remove('hidden');
        } finally {
            // Restore button state
            loginButton.disabled = false;
            loginButton.textContent = 'Sign In';
        }
    });
});
