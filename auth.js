// TODO: Replace with your actual Firebase project configuration
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// Initialize Firebase
let auth, provider;

try {
  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }
  auth = firebase.auth();
  provider = new firebase.auth.GoogleAuthProvider();
  provider.addScope('https://www.googleapis.com/auth/drive.file');
} catch (error) {
  console.error("Firebase initialization error. Did you add your config?", error);
}

window.loginWithGoogle = () => {
  if (!auth) {
    alert("Firebase is not initialized. Please add your config to auth.js");
    return;
  }
  auth.signInWithPopup(provider).then((result) => {
    const credential = firebase.auth.GoogleAuthProvider.credentialFromResult(result);
    if (credential && credential.accessToken) {
      window.googleDriveAccessToken = credential.accessToken;
      console.log("Google Drive Access Token obtained.");
      if (window.syncToDrive) {
          window.syncToDrive(); // trigger initial sync
      }
    }
  }).catch(error => {
    console.error("Login failed", error);
    alert("Login failed: " + error.message);
  });
};

window.logout = () => {
  if (auth) {
    auth.signOut();
  }
};

// Listen for auth state changes and update the UI
if (auth) {
  auth.onAuthStateChanged((user) => {
    const loginBtn = document.getElementById('login-btn');
    if (user) {
      // User is signed in
      if (loginBtn) {
        loginBtn.innerHTML = `
          <div style="display: flex; align-items: center; gap: 8px;">
            <img src="${user.photoURL}" alt="Profile" style="width: 20px; height: 20px; border-radius: 50%; object-fit: cover;">
            <span>Logout</span>
          </div>
        `;
        loginBtn.onclick = window.logout;
      }
      console.log("User logged in:", user.displayName);
    } else {
      // User is signed out
      if (loginBtn) {
        loginBtn.innerHTML = `<i class='bx bxl-google'></i> <span data-i18n="btn_login">Login</span>`;
        loginBtn.onclick = window.loginWithGoogle;
      }
      console.log("User logged out");
    }
  });
}
