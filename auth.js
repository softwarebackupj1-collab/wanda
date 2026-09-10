// Supabase Authentication Logic

window.loginWithEmail = () => {
  window.location.href = 'login.html';
};

window.logout = async () => {
  if (window.supabaseClient) {
    await window.supabaseClient.auth.signOut();
    window.updateAuthUI(null);
    window.location.href = 'login.html'; // Redirect to login page after logout
  }
};

window.updateAuthUI = (user) => {
  const loginBtn = document.getElementById('login-btn');
  if (!loginBtn) return;

  if (user) {
    // Supabase user object stores profile data in user.user_metadata
    const avatarUrl = user.user_metadata?.avatar_url || 'https://via.placeholder.com/20';
    loginBtn.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px;">
        <img src="${avatarUrl}" alt="Profile" style="width: 20px; height: 20px; border-radius: 50%; object-fit: cover;">
        <span>Logout</span>
      </div>
    `;
    loginBtn.onclick = window.logout;
  } else {
    loginBtn.innerHTML = `<i class='bx bx-log-in'></i> <span data-i18n="btn_login">Login</span>`;
    loginBtn.onclick = window.loginWithEmail;
  }
};

// Listen for auth state changes and update the UI
if (window.supabaseClient) {
  window.supabaseClient.auth.onAuthStateChange((event, session) => {
    if (session && session.user) {
      const user = session.user;

      // Strict email check
      if (user.email !== 'softwarebackupj1@gmail.com') {
        alert('Access Restricted: Only softwarebackupj1@gmail.com is allowed to use this application.');
        window.logout();
        return;
      }

      window.updateAuthUI(user);
      console.log("User logged in:", user.email);

      if (window.pullFromSupabase && !window.hasPulledFromSupabase) {
        window.hasPulledFromSupabase = true;
        window.pullFromSupabase();
      }
    } else {
      window.hasPulledFromSupabase = false;
      window.updateAuthUI(null);
      console.log("User logged out");
      // Force redirect to login page if they are not logged in and not already on the login page
      if (!window.location.pathname.endsWith('login.html')) {
        window.location.href = 'login.html';
      }
    }
  });
}
