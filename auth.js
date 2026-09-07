// TODO: Replace with your actual Firebase project configuration
const firebaseConfig = {
  apiKey: "AIzaSyAowVyXifjhFhBrzKqjZqDvLj6tKO4lHFw",
  authDomain: "wanda-168cd.firebaseapp.com",
  projectId: "wanda-168cd",
  storageBucket: "wanda-168cd.firebasestorage.app",
  messagingSenderId: "114253740929",
  appId: "1:114253740929:web:d4d12401654cb6a3c34680",
  measurementId: "G-RF88KE758L"
};

// Initialize Firebase
let auth, provider;
window.googleDriveAccessToken = sessionStorage.getItem('googleDriveAccessToken') || null;

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
      sessionStorage.setItem('googleDriveAccessToken', credential.accessToken);
      console.log("Google Drive Access Token obtained.");
      if (window.pullFromDrive) {
          window.pullFromDrive(); // attempt to pull data from drive on login
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
    window.googleDriveAccessToken = null;
    sessionStorage.removeItem('googleDriveAccessToken');
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
