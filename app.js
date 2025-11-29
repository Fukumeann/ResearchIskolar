// Firebase configuration and imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import {
    getFirestore,
    doc,
    getDoc,
    setDoc,
    updateDoc,
    collection,
    addDoc,
    query,
    where,
    getDocs,
    orderBy,
    limit,
    deleteDoc,
    increment,
    onSnapshot,
    serverTimestamp,
    arrayUnion,
    arrayRemove
    , runTransaction
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
// Firebase Storage is not used when uploading to Cloudinary; storage SDK import removed.



const firebaseConfig = {
    apiKey: "AIzaSyAM8d-8hBOSf6jeR6zClVHFPU8s-o8n33Y",
    authDomain: "researchscholar-d232c.firebaseapp.com",
    projectId: "researchscholar-d232c",
    // NOTE: Storage bucket should usually be the `*.appspot.com` bucket name.
    // If your Firebase console shows a different bucket, use that exact value.
    storageBucket: "researchscholar-d232c.appspot.com",
    messagingSenderId: "140321397579",
    appId: "1:140321397579:web:966748afc14576562fa6ce",
    measurementId: "G-2SD4G9E6D3"
};

// Cloudinary client-side config (unsigned uploads)
// Replace these values with your Cloudinary account details and the unsigned upload preset you created.
const CLOUDINARY_CLOUD_NAME = "dekq1vljn"; // e.g. 'demo'
const CLOUDINARY_UNSIGNED_PRESET = "researchisko"; // e.g. 'unsigned_preset'

// Upload helper for Cloudinary (unsigned). Returns secure_url on success.
async function uploadToCloudinaryUnsigned(file) {
    if (!CLOUDINARY_CLOUD_NAME || CLOUDINARY_CLOUD_NAME === 'YOUR_CLOUD_NAME') {
        throw new Error('Cloudinary cloud name not configured. Set CLOUDINARY_CLOUD_NAME in app.js');
    }
    if (!CLOUDINARY_UNSIGNED_PRESET || CLOUDINARY_UNSIGNED_PRESET === 'YOUR_UPLOAD_PRESET') {
        throw new Error('Cloudinary unsigned preset not configured. Set CLOUDINARY_UNSIGNED_PRESET in app.js');
    }

    const url = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/auto/upload`;
    const form = new FormData();
    form.append('file', file);
    form.append('upload_preset', CLOUDINARY_UNSIGNED_PRESET);

    const resp = await fetch(url, { method: 'POST', body: form });
    if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        const err = new Error(`Cloudinary upload failed: ${resp.status} ${resp.statusText} ${text}`);
        err.status = resp.status;
        throw err;
    }

    const data = await resp.json();
    if (!data.secure_url) throw new Error('Cloudinary did not return a secure_url');
    return data.secure_url;
}

// Admin helper: delete all documents in `publishedPapers` (use cautiously)
async function deleteAllPublishedPapers() {
    if (!firebaseDb) {
        throw new Error('Firestore not initialized');
    }

    const publishedCol = collection(firebaseDb, 'publishedPapers');
    // fetch up to 500 documents to avoid runaway loops; adjust if you have more
    const q = query(publishedCol, orderBy('createdAt', 'desc'), limit(500));
    const snap = await getDocs(q);

    const ids = [];
    snap.forEach(d => ids.push(d.id));

    for (const id of ids) {
        try {
            await deleteDoc(doc(firebaseDb, 'publishedPapers', id));
        } catch (err) {
            console.error('Failed to delete publishedPapers/' + id, err);
        }
    }

    return ids.length;
}

// UI-facing confirm wrapper you can call from the browser console: `deleteAllPublishedPapersConfirm()`
async function deleteAllPublishedPapersConfirm() {
    const ok = await showConfirmModal('This will PERMANENTLY delete up to 500 documents from the `publishedPapers` collection. Do you want to continue?');
    if (!ok) {
        showNotification('Deletion cancelled', 'info');
        return 0;
    }

    try {
        const count = await deleteAllPublishedPapers();
        await showAlertModal(`Deleted ${count} published paper(s).`, 'Deletion Complete');
        console.log(`Deleted ${count} published paper(s).`);
        return count;
    } catch (err) {
        console.error('Error deleting published papers:', err);
        await showAlertModal('Error while deleting published papers: ' + (err.message || err), 'Deletion Error');
        return 0;
    }
}

// Expose helper on window for convenience (call from DevTools)
window.deleteAllPublishedPapersConfirm = deleteAllPublishedPapersConfirm;



// Initialize Firebase
let firebaseApp, firebaseAuth, googleProvider, firebaseDb;

try {
    firebaseApp = initializeApp(firebaseConfig);
    firebaseAuth = getAuth(firebaseApp);
    firebaseDb = getFirestore(firebaseApp);
    googleProvider = new GoogleAuthProvider();

    console.log("Firebase connected:", firebaseApp.name);
} catch (error) {
    console.error("Firebase initialization failed:", error);
    console.error("Failed to initialize authentication. Please refresh the page.");
}
export { firebaseAuth, firebaseDb };

// Check Firebase connection status
function checkFirebaseConnection() {
    if (!firebaseApp || !firebaseAuth || !firebaseDb) {
        console.error("Firebase not properly initialized");
        showNotification("Database connection issue. Please refresh the page.", "error");
        return false;
    }

    return true;
}

// DOM Elements
const elements = {
    // Navigation
    burgerMenuBtn: document.getElementById("burgerMenuBtn"),
    navbarLinks: document.getElementById("navbarLinks"),
    appSidebar: document.getElementById("appSidebar"),

    // Navigation links (will be reassigned after updates)
    loginNavLink: null,
    registerNavLink: null,

    // Modals
    loginModal: document.getElementById("loginModal"),
    registerModal: document.getElementById("registerModal"),
    logoutModal: document.getElementById("logoutModal"),
    closeLoginModal: document.getElementById("closeLoginModal"),
    closeRegisterModal: document.getElementById("closeRegisterModal"),
    closeLogoutModal: document.getElementById("closeLogoutModal"),
    cancelLogout: document.getElementById("cancelLogout"),
    confirmLogout: document.getElementById("confirmLogout"),

    // Forms
    loginForm: document.getElementById("loginForm"),
    registerForm: document.getElementById("registerForm"),
    googleLoginBtn: document.getElementById("googleLoginBtn"),



    // Search
    searchBtn: document.getElementById("searchBtn"),
    searchInput: document.getElementById("searchInput"),

    // User status
    userStatus: document.getElementById("userStatus"),

    // Auth switch links
    switchToRegister: document.getElementById("switchToRegister"),
    switchToLogin: document.getElementById("switchToLogin"),
    googleRegisterBtn: document.getElementById("googleRegisterBtn")
};

document.addEventListener("DOMContentLoaded", () => {
    const registerForm = document.getElementById("registerForm");
    if (registerForm) {
        // Attach submit listener (idempotent)
        registerForm.removeEventListener("submit", handleRegister);
        registerForm.addEventListener("submit", handleRegister);
        console.log("✅ Register form submit listener attached on DOM load");

        // Also attach a click listener on the submit button to handle cases
        // where the form submit event might be intercepted or not firing.
        const registerSubmitBtn = registerForm.querySelector('button[type="submit"]');
        if (registerSubmitBtn) {
            registerSubmitBtn.removeEventListener('click', registerForm._submitClickHandler);
            const submitClickHandler = (e) => {
                // If the form is valid, trigger the form submit which will call handleRegister
                try {
                    e.preventDefault();
                } catch (_) { }
                if (typeof registerForm.requestSubmit === 'function') {
                    registerForm.requestSubmit();
                } else {
                    // Fallback: call handler directly
                    handleRegister(new Event('submit', { bubbles: true, cancelable: true }));
                }
            };
            registerForm._submitClickHandler = submitClickHandler;
            registerSubmitBtn.addEventListener('click', submitClickHandler);
            console.log('✅ Register submit button click listener attached');
        }
    }
});

// Application state
let currentUser = null;
let settingsAuthResolved = false;
let settingsLoginWarned = false;
let lastUserDocWriteAt = null; // Guards against stale Firestore reads overwriting fresh UI
let currentUserRole = "guest"; // "user" | "admin" | "guest"

// Utility functions
async function checkIfUserBanned(user) {
    if (!user || !firebaseDb) return false;

    try {
        const userDocRef = doc(firebaseDb, "users", user.uid);
        const userSnap = await getDoc(userDocRef);

        if (userSnap.exists() && userSnap.data().role === "banned") {
            console.log("🚨 Banned user detected — showing restricted modal");
            showAccessRestrictedModal("Your account has been banned. Please contact support.");
            await signOut(firebaseAuth);
            return true; // User is banned
        }
    } catch (error) {
        console.error("Error verifying ban status:", error);
    }

    return false; // User not banned
}

// --- Notifications unread badge handling (navbar) ---
let _notificationsUnsubscribe = null;
function updateNotificationsBadge(count = 0) {
    // find the navbar notifications link (by href or icon)
    const navLink = document.querySelector('a[href="notifications.html"]');
    if (!navLink) return;

    // create badge if missing
    let badge = navLink.querySelector('#notificationsBadge');
    if (!badge) {
        badge = document.createElement('span');
        badge.id = 'notificationsBadge';
        badge.className = 'nav-badge';
        // small style fallback in case CSS not present
        badge.style.minWidth = '18px';
        badge.style.height = '18px';
        badge.style.lineHeight = '18px';
        badge.style.display = 'inline-block';
        badge.style.padding = '0 6px';
        badge.style.borderRadius = '999px';
        badge.style.background = '#dc2626';
        badge.style.color = 'white';
        badge.style.fontSize = '0.75rem';
        badge.style.marginLeft = '6px';
        badge.style.verticalAlign = 'middle';
        navLink.appendChild(badge);
    }

    if (!count || count <= 0) {
        // show an empty state (thin dot) or hide — we'll hide when zero
        badge.style.display = 'none';
    } else {
        badge.style.display = 'inline-block';
        badge.textContent = count > 99 ? '99+' : String(count);
    }
}

// subscribe to unread notifications for the current user
function subscribeToUnreadNotifications(uid) {
    if (!firebaseDb || !uid) return;
    // unsubscribe previous
    if (_notificationsUnsubscribe) { try { _notificationsUnsubscribe(); } catch (e) { }; _notificationsUnsubscribe = null; }

    const ref = collection(firebaseDb, 'notifications');
    // Try the preferred server-side filtered query first (fast and efficient)
    try {
        const q = query(ref, where('userId', '==', uid), where('read', '==', false));
        _notificationsUnsubscribe = onSnapshot(q, snap => {
            const count = snap.size || 0;
            updateNotificationsBadge(count);
        }, err => {
            console.warn('Notification badge listener error:', err);
        });
    } catch (err) {
        // If Firestore indicates this combination requires a composite index for server queries,
        // fall back to listening for any user notifications and counting unread client-side.
        console.warn('Unread notifications subscription failed (trying client-side fallback):', err?.message || err);

        try {
            const q2 = query(ref, where('userId', '==', uid));
            _notificationsUnsubscribe = onSnapshot(q2, snap => {
                const count = Array.from(snap.docs).filter(d => !d.data()?.read).length;
                updateNotificationsBadge(count);
            }, err2 => {
                console.warn('Notification badge fallback listener error:', err2);
            });
        } catch (fallbackErr) {
            console.error('Failed to subscribe to unread notifications (fallback):', fallbackErr);
        }
    }
}
// UNIVERSAL ACCESS RESTRICTED MODAL
function showAccessRestrictedModal(message) {
    let modal = document.getElementById("accessRestrictedModal");

    // If modal doesn't exist in DOM, inject it dynamically
    if (!modal) {
        const modalHTML = `
        <div class="modal" id="accessRestrictedModal" style="display:none;">
            <div class="modal-content">
                <button class="close-modal-btn" id="closeAccessRestricted">&times;</button>
                <div class="logout-icon">
                    <i class="fas fa-ban" style="color: #d9534f;"></i>
                </div>
                <h2 class="modal-title">Access Restricted</h2>
                <p id="accessRestrictedMessage">${message}</p>
                <div class="modal-actions">
                    <button class="btn btn-danger" id="closeAccessRestricted">Close Now</button>
                </div>
            </div>
        </div>`;
        document.body.insertAdjacentHTML("beforeend", modalHTML);
        modal = document.getElementById("accessRestrictedModal");
    }

    const msgEl = document.getElementById("accessRestrictedMessage");
    const closeBtns = modal.querySelectorAll("#closeAccessRestricted");

    // Update message text dynamically
    if (msgEl) msgEl.textContent = message;

    // Show modal
    modal.style.display = "block";

    // Close buttons: manual close + redirect
    closeBtns.forEach((btn) =>
        btn.addEventListener("click", () => {
            modal.style.display = "none";
            window.location.href = "index.html";
        })
    );

    // Auto-close & redirect after 5 seconds
    setTimeout(() => {
        modal.style.display = "none";
        window.location.href = "index.html";
    }, 5000);
}

function showModal(modal) {
    if (modal) {
        modal.classList.add("is-visible");
        // ensure inline display is set so older inline-style modals show correctly
        try { modal.style.display = 'flex'; } catch (_) { }
        document.body.style.overflow = 'hidden';

        // 🧩 Debug for register modal
        if (modal.id === "registerModal") {
            console.log("Register modal opened, checking for form...");
            console.log("Found register form:", document.getElementById("registerForm"));
        }
        // If this is the register modal, ensure the form handler is attached
        if (modal.id === 'registerModal') {
            setTimeout(() => {
                const form = document.getElementById('registerForm');
                if (form) {
                    form.removeEventListener('submit', handleRegister);
                    form.addEventListener('submit', handleRegister);
                    console.log('🔥 Register listener (re)attached by showModal');

                    // Also ensure the submit button is wired (defensive)
                    const registerSubmitBtn = form.querySelector('button[type="submit"]');
                    if (registerSubmitBtn) {
                        registerSubmitBtn.removeEventListener('click', form._submitClickHandler);
                        const submitClickHandler = (e) => {
                            try { e.preventDefault(); } catch (_) { }
                            if (typeof form.requestSubmit === 'function') form.requestSubmit();
                            else handleRegister(new Event('submit', { bubbles: true, cancelable: true }));
                        };
                        form._submitClickHandler = submitClickHandler;
                        registerSubmitBtn.addEventListener('click', submitClickHandler);
                        console.log('🔥 Register submit button (re)attached by showModal');
                    }
                }
            }, 50);
        }
    }
}

function hideModal(modal) {
    if (modal) {
        modal.classList.remove("is-visible");
        // hide any inline display left on the modal so it doesn't block interaction
        try { modal.style.display = 'none'; } catch (_) { }
        document.body.style.overflow = '';
    }
}

function hideAllModals() {
    hideModal(elements.loginModal);
    hideModal(elements.registerModal);
    hideModal(elements.logoutModal);
}


function toggleSidebar() {
    if (elements.appSidebar) {
        elements.appSidebar.classList.toggle("is-visible");
    }
}

function toggleMobileNav() {
    if (elements.navbarLinks) {
        elements.navbarLinks.classList.toggle("is-visible");
    }
}

function updateUserStatus(user) {
    if (!elements.userStatus || !elements.navbarLinks) return;

    if (user) {
        elements.userStatus.textContent = `Welcome, ${user.displayName || user.email}!`;
        elements.userStatus.classList.add("is-logged-in");

        elements.navbarLinks.innerHTML = `
            <a href="#" class="navbar-link" id="logoutNavLink"><i class="fas fa-sign-out-alt"></i> Logout</a>
        `;

        const logoutNavLink = document.getElementById("logoutNavLink");
        if (logoutNavLink) {
            logoutNavLink.addEventListener("click", (e) => {
                e.preventDefault();
                handleLogout();
            });
        }
    } else {
        elements.userStatus.textContent = "Guest User";
        elements.userStatus.classList.remove("is-logged-in");

        elements.navbarLinks.innerHTML = `
            <a href="#" class="navbar-link" id="registerNavLink">Register</a>
            <a href="#" class="navbar-link" id="loginNavLink">Log in</a>
        `;

        // Reattach listeners after updating the HTML
        setTimeout(() => {
            attachNavLinkListeners();
        }, 100);

        attachSidebarLinkListeners();
    }
}

function attachNavLinkListeners() {
    const loginNavLink = document.getElementById("loginNavLink");
    const registerNavLink = document.getElementById("registerNavLink");

    if (loginNavLink) {
        const clone = loginNavLink.cloneNode(true);
        loginNavLink.replaceWith(clone);

        clone.addEventListener("click", (e) => {
            e.preventDefault();
            showModal(elements.loginModal);
            elements.navbarLinks?.classList.remove("is-visible");
        });
    }

    if (registerNavLink) {
        const clone = registerNavLink.cloneNode(true);
        registerNavLink.replaceWith(clone);

        clone.addEventListener("click", (e) => {
            e.preventDefault();
            showModal(elements.registerModal);

            // Re-attach register form listener
            setTimeout(() => {
                const form = document.getElementById("registerForm");
                if (form) {
                    form.removeEventListener("submit", handleRegister);
                    form.addEventListener("submit", handleRegister);
                }
            }, 50);

            elements.navbarLinks?.classList.remove("is-visible");
        });
    }
}

function attachSidebarLinkListeners() {
    const allSidebarLinks = document.querySelectorAll('.sidebar-navigation a');
    allSidebarLinks.forEach(link => {
        link.removeEventListener("click", handleSidebarNavigation);
        link.addEventListener("click", handleSidebarNavigation);
    });
}
function updateAdminSidebarAccess() {
    const adminLink = document.getElementById("adminPanelLink");
    if (!adminLink) return;

    if (currentUserRole === "admin") {
        adminLink.style.display = "block";
        adminLink.classList.remove("disabled-link");
        adminLink.onclick = null; // allow access
    } else {
        adminLink.style.display = "block"; // still visible, but restricted
        adminLink.classList.add("disabled-link");
        adminLink.onclick = (e) => {
            e.preventDefault();
            showNotification("You do not have access to the Admin Panel.", "warning");
        };
    }
}

function handleSidebarNavigation(event) {
    closeSidebar();

    if (event.target.classList.contains('is-restricted')) {
        event.preventDefault();
        if (!currentUser) {
            const feature = event.target.dataset.feature || 'this feature';
            console.log(`Please log in to access the ${feature}.`);
            showModal(elements.loginModal);
        } else {
            const feature = event.target.dataset.feature || 'this feature';
            console.log(`Accessing ${feature}... (functionality to be implemented)`);
            window.location.href = event.target.href;
        }
    } else {
        console.log(`Navigating to: ${event.target.href}`);
    }
}

// Event handlers
const QUICK_DELAY = 300;
const SAVE_DELAY = 400;

async function handleLogin(event) {
    event.preventDefault();
    console.log("Login form submitted");

    const emailInput = event.target.querySelector('#loginEmail, input[type="email"]');
    const passwordInput = event.target.querySelector('#loginPassword, input[type="password"], input[type="text"]');


    const email = emailInput?.value.trim();
    const password = passwordInput?.value.trim();

    if (!email || !password) {
        showNotification("Please fill in all fields", "warning");
        return;
    }

    if (!firebaseAuth) {
        showNotification("Authentication service not available. Please refresh the page.", "error");
        return;
    }

    const submitBtn = event.target.querySelector('button[type="submit"]');
    const originalHTML = submitBtn.innerHTML;

    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Logging in...';
    submitBtn.disabled = true;

    try {
        console.log("🔐 Attempting login with:", { email });
        const userCredential = await signInWithEmailAndPassword(firebaseAuth, email, password);
        currentUser = userCredential.user;

        console.log("✅ Login successful:", currentUser);
        showNotification("Login successful! Welcome back!", "success");

        // Hide modal and clear form
        hideModal(elements.loginModal);
        emailInput.value = '';
        passwordInput.value = '';

        console.log("✅ Updating UI for logged in user");

        // Update UI based on current page
        if (window.location.pathname.includes('profile.html')) {
            console.log("✅ On profile page, updating UI");
            updateAvatarInitials(currentUser.displayName || currentUser.email);
            populateProfileWithDefaults();
        }

        if (window.location.pathname.includes('settings.html')) {
            console.log("✅ On settings page, updating UI");
            populateSettingsWithDefaults();
        }

        // Load profile data from Firestore
        if (firebaseDb) {
            console.log("✅ Loading profile data from Firestore");
            await loadProfileData();
        }

        console.log("🎉 Login COMPLETED successfully, user should have full access");

        // Restore button
        submitBtn.innerHTML = originalHTML;
        submitBtn.disabled = false;
        restoreIcons();

    } catch (error) {
        console.error("❌ Login error:", error);
        let errorMessage = "Login failed. ";

        switch (error.code) {
            case 'auth/user-not-found':
                errorMessage += "No account found with this email.";
                break;
            case 'auth/wrong-password':
                errorMessage += "Incorrect password.";
                break;
            case 'auth/invalid-email':
                errorMessage += "Invalid email address.";
                break;
            case 'auth/user-disabled':
                errorMessage += "This account has been disabled.";
                break;
            case 'auth/invalid-credential':
                errorMessage += "Invalid email or password.";
                break;
            default:
                errorMessage += error.message;
        }

        showNotification(errorMessage, "error");

        // Re-enable button on error
        submitBtn.innerHTML = originalHTML;
        submitBtn.disabled = false;
        restoreIcons();
    }
}

async function handleRegister(event) {
    event.preventDefault();

    const name = document.getElementById("registerName")?.value.trim();
    const email = document.getElementById("registerEmail")?.value.trim();
    const password = document.getElementById("registerPassword")?.value.trim();

    if (!name || !email || !password) {
        showNotification("Please fill in all fields", "warning");
        return;
    }

    const submitBtn = event.target.querySelector('button[type="submit"]');
    const originalHTML = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating...';

    try {
        // ✅ Create user and automatically sign them in
        const userCredential = await createUserWithEmailAndPassword(firebaseAuth, email, password);
        currentUser = userCredential.user;

        // ✅ Update display name
        await updateProfile(currentUser, { displayName: name });

        // ✅ Create Firestore profile with correct role
        await setDoc(doc(firebaseDb, "users", currentUser.uid), {
            fullName: name,
            email: email,
            role: "user",
            institution: "",
            department: "",
            bio: "",
            interests: [],
            stats: {
                papersPublished: 0,
                citations: 0,
                averageRating: 0,
                collaborators: 0
            },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        });

        // ✅ Update UI as logged-in user
        updateUserStatus(currentUser);
        updateAvatarInitials(name);

        showNotification("Account created successfully!", "success");

        // ✅ Close modal and stay on current page (user is signed in)
        hideModal(elements.registerModal);
        // Optionally navigate user to their profile — keep commented so user stays in context
        // setTimeout(() => { window.location.href = "profile.html"; }, 500);

    } catch (error) {
        console.error("Registration error:", error);
        let msg = "Registration failed.";
        if (error.code === "auth/email-already-in-use") msg = "Email already exists.";
        showNotification(msg, "error");
    }

    submitBtn.disabled = false;
    submitBtn.innerHTML = originalHTML;
}

function setupPasswordHelpers() {
    // Login password toggle
    const loginPasswordToggle = document.getElementById('loginPasswordToggle');
    const loginPassword = document.getElementById('loginPassword');

    if (loginPasswordToggle && loginPassword) {
        loginPasswordToggle.addEventListener('click', function () {
            const type = loginPassword.type === 'password' ? 'text' : 'password';
            loginPassword.type = type;
            this.innerHTML = type === 'password' ? '<i class="fas fa-eye"></i>' : '<i class="fas fa-eye-slash"></i>';
        });
    }

    // Register password toggle
    const registerPasswordToggle = document.getElementById('registerPasswordToggle');
    const registerPassword = document.getElementById('registerPassword');
    const passwordSuggestions = document.getElementById('passwordSuggestions');

    if (registerPasswordToggle && registerPassword) {
        registerPasswordToggle.addEventListener('click', function () {
            const type = registerPassword.type === 'password' ? 'text' : 'password';
            registerPassword.type = type;
            this.innerHTML = type === 'password' ? '<i class="fas fa-eye"></i>' : '<i class="fas fa-eye-slash"></i>';
        });

        // Show password suggestions on focus
        registerPassword.addEventListener('focus', function () {
            if (passwordSuggestions) {
                passwordSuggestions.style.display = 'block';
            }
        });

        // Real-time password validation
        registerPassword.addEventListener('input', function () {
            const password = this.value;

            // Check length
            const lengthCheck = document.getElementById('lengthCheck');
            if (lengthCheck) {
                if (password.length >= 8) {
                    lengthCheck.classList.add('valid');
                } else {
                    lengthCheck.classList.remove('valid');
                }
            }

            // Check uppercase
            const uppercaseCheck = document.getElementById('uppercaseCheck');
            if (uppercaseCheck) {
                if (/[A-Z]/.test(password)) {
                    uppercaseCheck.classList.add('valid');
                } else {
                    uppercaseCheck.classList.remove('valid');
                }
            }

            // Check lowercase
            const lowercaseCheck = document.getElementById('lowercaseCheck');
            if (lowercaseCheck) {
                if (/[a-z]/.test(password)) {
                    lowercaseCheck.classList.add('valid');
                } else {
                    lowercaseCheck.classList.remove('valid');
                }
            }

            // Check number
            const numberCheck = document.getElementById('numberCheck');
            if (numberCheck) {
                if (/[0-9]/.test(password)) {
                    numberCheck.classList.add('valid');
                } else {
                    numberCheck.classList.remove('valid');
                }
            }

            // Check special character
            const specialCheck = document.getElementById('specialCheck');
            if (specialCheck) {
                if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
                    specialCheck.classList.add('valid');
                } else {
                    specialCheck.classList.remove('valid');
                }
            }
        });
    }
}

function handleGoogleLogin() {
    if (!firebaseAuth || !googleProvider) {
        console.error("Firebase auth not initialized");
        showNotification("Authentication service not available. Please refresh the page.", "error");
        return;
    }

    signInWithPopup(firebaseAuth, googleProvider)
        .then(async (result) => {
            const user = result.user;
            currentUser = user;
            console.log("Google login successful:", user);
            hideModal(elements.loginModal);
            showNotification('Logged in successfully!', 'success');

            // Immediately populate forms with Google user data
            if (window.location.pathname.includes('profile.html')) {
                console.log("Google login on profile page, populating immediately");
                updateAvatarInitials(user.displayName || user.email);
                populateProfileWithDefaults();
            }

            if (window.location.pathname.includes('settings.html')) {
                console.log("Google login on settings page, populating immediately");
                populateSettingsWithDefaults();
            }

            // Load or create profile
            if (firebaseDb) {
                await loadProfileData();
            }
        })
        .catch((error) => {
            console.error("Google Login Error:", error);
            let errorMessage = "Google login failed. ";

            switch (error.code) {
                case 'auth/popup-closed-by-user':
                    errorMessage += "Login popup was closed.";
                    break;
                case 'auth/popup-blocked':
                    errorMessage += "Login popup was blocked. Please allow popups for this site.";
                    break;
                case 'auth/cancelled-popup-request':
                    errorMessage += "Login was cancelled.";
                    break;
                default:
                    errorMessage += error.message;
            }

            showNotification(errorMessage, 'error');
        });
}


function handleLogout() {
    showModal(elements.logoutModal);
}

function confirmLogout() {
    if (!firebaseAuth) {
        console.error("Firebase auth not initialized");
        showNotification("Authentication service not available. Please refresh the page.", "error");
        return;
    }

    signOut(firebaseAuth)
        .then(() => {
            currentUser = null;
            console.log("Logged out successfully!");
            showNotification("Logged out successfully!", "success");
            hideModal(elements.logoutModal);
            if (elements.appSidebar) {
                elements.appSidebar.classList.remove("is-visible");
            }

            // Redirect to index.html after logout
            setTimeout(() => {
                window.location.href = 'index.html';
            }, 1000);
        })
        .catch((error) => {
            console.error("Logout Error:", error);
            showNotification("Logout failed: " + error.message, "error");
        });
}

function closeSidebar() {
    if (elements.appSidebar) {
        setTimeout(() => {
            elements.appSidebar.classList.remove("is-visible");
        }, 150);
    }
}

// Ensure Font Awesome icons are loaded and preserved
function ensureIconsLoaded() {
    if (typeof FontAwesome === 'undefined' && !document.querySelector('link[href*="font-awesome"]')) {
        console.warn('Font Awesome not loaded, adding CDN link');
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css';
        document.head.appendChild(link);
    }

    const iconButtons = document.querySelectorAll('.btn i, .btn-icon i, .btn-small i');
    iconButtons.forEach(button => {
        if (button.parentElement && !button.parentElement.dataset.iconPreserved) {
            button.parentElement.dataset.iconPreserved = 'true';
            button.parentElement.dataset.originalIcon = button.className;
        }
    });
}

function restoreIcons() {
    const elementsWithIcons = document.querySelectorAll('[data-icon-preserved="true"]');
    elementsWithIcons.forEach(element => {
        const iconClass = element.dataset.originalIcon;
        if (iconClass && !element.querySelector('i')) {
            const icon = document.createElement('i');
            icon.className = iconClass;
            element.insertBefore(icon, element.firstChild);
        }
    });
}

// Page-specific functionality
function initializePageFeatures() {
    initializeProfileFeatures();
    initializeLibraryFeatures();
    initializePublishedFeatures();
    initializeQuestionsFeatures();
    initializeNotificationsFeatures();
    initializeSettingsFeatures();
    initializeAllButtons();

    setTimeout(() => {
        restoreIcons();
    }, 100);
}

// Attach delegated listeners for paper-card actions (Save/View/Remove)
function attachPaperCardActionListeners() {
    // Ensure we only attach once
    if (attachPaperCardActionListeners._installed) return;
    attachPaperCardActionListeners._installed = true;

    document.addEventListener('click', async function (e) {
        // Handle view buttons/links (browse results & rendered cards)
        const viewBtn = e.target.closest('.view-btn, .btn-view, .browse-btn');
        if (viewBtn) {
            // If it's an anchor (`a`) let it behave normally unless JS should open it.
            const isAnchor = viewBtn.tagName === 'A' || viewBtn.tagName === 'a';
            const fileUrl = viewBtn.dataset?.fileUrl || viewBtn.getAttribute('href') || '';

            if (fileUrl && isRemoteUrl(fileUrl)) {
                // Defensive: ensure the URL is safe and open in a new tab
                try {
                    const win = window.open(fileUrl, '_blank');
                    if (win) win.focus();
                } catch (err) {
                    // Fallback: set location
                    window.location.href = fileUrl;
                }
            } else if (fileUrl && !isRemoteUrl(fileUrl)) {
                // URL exists but is a local path (file:// or C:\...), which browsers block.
                showAlertModal('This paper points to a local file on your machine (file://...).\n\nBrowsers cannot open local files from a web page for security reasons.\n\nUpload the PDF to the server or Cloudinary and update the paper record with a remote URL to view it here.');
            } else if (!isAnchor) {
                showNotification('No file URL available for this paper', 'warning');
            }

            // Prevent other handlers from interfering for button clicks
            e.preventDefault();
            return;
        }

        const saveBtn = e.target.closest('.btn-save-library');
        if (saveBtn) {
            e.preventDefault();
            if (!currentUser) {
                showNotification('Please log in to save papers', 'warning');
                showModal(elements.loginModal);
                return;
            }

            // collect metadata from data- attributes
            const title = saveBtn.dataset.title || (saveBtn.closest('.paper-card')?.querySelector('h3, h4')?.textContent || '');
            const authors = saveBtn.dataset.authors || '';
            const category = saveBtn.dataset.category || '';
            const abstract = saveBtn.dataset.abstract || '';
            const year = saveBtn.dataset.year ? (parseInt(saveBtn.dataset.year, 10) || null) : null;
            const url = saveBtn.dataset.url || '';

            const paperData = { title, authors, category, abstract, year, url };

            try {
                saveBtn.disabled = true;
                saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
                await addToLibrary(paperData, 'saved');
                saveBtn.innerHTML = '<i class="fas fa-check"></i> Saved';
                saveBtn.classList.add('saved');
                showNotification('Paper saved to your library', 'success');
            } catch (err) {
                console.error('Error saving paper:', err);
                showNotification('Failed to save paper', 'error');
                saveBtn.disabled = false;
                saveBtn.innerHTML = '<i class="fas fa-book"></i> Save';
            }

            return;
        }

        const removeBtn = e.target.closest('.btn-remove-library');
        if (removeBtn) {
            e.preventDefault();
            if (!currentUser) {
                showNotification('Please log in', 'warning');
                showModal(elements.loginModal);
                return;
            }

            // Identify the library item; prefer title+type or an id if stored
            const title = removeBtn.dataset.title || (removeBtn.closest('.paper-card')?.querySelector('h3, h4')?.textContent || '');
            const type = removeBtn.dataset.type || 'saved';

            try {
                if (!(await showConfirmModal('Remove this paper from your library?'))) return;
                await removeFromLibrary(title, type);
                const card = removeBtn.closest('.paper-card');
                if (card) card.remove();
                showNotification('Removed from your library', 'info');
            } catch (err) {
                console.error('Error removing from library:', err);
                showNotification('Failed to remove item', 'error');
            }

            return;
        }
    });
}

// Ensure delegated listeners are attached
attachPaperCardActionListeners();

function initializeAllButtons() {
    const allButtons = document.querySelectorAll('.btn, .btn-small, .btn-icon, .btn-secondary, .btn-danger');
    allButtons.forEach(button => {
        if (button.dataset.initialized) return;

        button.addEventListener('click', function () {
            this.style.transform = 'scale(0.95)';
            setTimeout(() => {
                this.style.transform = '';
            }, 150);
        });

        button.dataset.initialized = 'true';
    });

    const formButtons = document.querySelectorAll('form .btn[type="submit"]');
    formButtons.forEach(button => {
        if (!button.dataset.formInitialized) {
            button.addEventListener('click', function (e) {
                if (!this.innerHTML.includes('spinner')) {
                    const originalHTML = this.innerHTML;
                    this.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
                    this.disabled = true;

                    setTimeout(() => {
                        this.innerHTML = originalHTML;
                        this.disabled = false;
                        restoreIcons();
                    }, 1000);
                }
            });
            button.dataset.formInitialized = 'true';
        }
    });
}

// PROFILE PAGE FUNCTIONALITY

async function initializeProfileFeatures() {
    console.log("Initializing profile features...");

    // Wait for Firebase auth to be ready
    if (!firebaseAuth) {
        console.warn("Firebase auth not available, retrying in 1 second...");
        setTimeout(initializeProfileFeatures, 1000);
        return;
    }

    // Force update avatar and form fields immediately if user is logged in
    if (currentUser) {
        console.log("User is logged in, force updating profile immediately");
        updateAvatarInitials(currentUser.displayName || currentUser.email);
        populateProfileWithDefaults();
    }

    // Always try to load profile data, even if currentUser is null
    // This handles cases where the user was logged in before page refresh
    console.log("Attempting to load profile data...");
    await loadProfileData();

    // Add interest functionality
    const addInterestBtn = document.getElementById('addInterestBtn');
    if (addInterestBtn) {
        addInterestBtn.addEventListener('click', function () {
            showAddInterestModal();
        });
    }

    // Remove interest on click
    attachInterestRemovalListeners();

    // Save profile changes
    const saveBtn = document.getElementById('saveProfileBtn');
    if (saveBtn) {
        saveBtn.addEventListener('click', async function () {
            if (!currentUser) {
                showNotification('Please log in to save changes', 'warning');
                showModal(elements.loginModal);
                return;
            }

            await saveProfileData();
        });
    }

    // Cancel button - reset form to last saved state
    const cancelBtn = document.getElementById('cancelChangesBtn');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', async function () {
            if (currentUser) {
                await loadProfileData();
                showNotification('Changes discarded', 'info');
            } else {
                resetProfileForm();
                showNotification('Form reset', 'info');
            }
        });
    }

    // Change avatar button
    const changeAvatarBtn = document.getElementById('changeAvatarBtn');
    if (changeAvatarBtn) {
        changeAvatarBtn.addEventListener('click', function () {
            showNotification('Avatar upload feature coming soon!', 'info');
        });
    }

    // Add demo stats update functionality
    addStatsUpdateDemo();

    console.log("Profile features initialized successfully");
}

function resetProfileForm() {
    const fullNameInput = document.getElementById('fullName');
    const emailInput = document.getElementById('email');
    const institutionInput = document.getElementById('institution');
    const departmentInput = document.getElementById('department');
    const bioTextarea = document.getElementById('bio');

    if (fullNameInput) fullNameInput.value = '';
    if (emailInput) emailInput.value = '';
    if (institutionInput) institutionInput.value = '';
    if (departmentInput) departmentInput.value = '';
    if (bioTextarea) bioTextarea.value = '';

    // Clear interests
    const interestsContainer = document.getElementById('interestsContainer');
    if (interestsContainer) {
        const existingTags = interestsContainer.querySelectorAll('.interest-tag');
        existingTags.forEach(tag => tag.remove());
    }

    // Reset avatar if on profile page
    const avatarCircle = document.getElementById('avatarCircle');
    if (avatarCircle) {
        updateAvatarInitials('');
    }

    // Reset stats if on profile page
    const papersCount = document.getElementById('papersCount');
    if (papersCount) {
        updateProfileStats({
            papersPublished: 0,
            citations: 0,
            averageRating: 0,
            collaborators: 0
        });
    }
}

// Load profile data from Firestore
async function loadProfileData() {
    if (!currentUser) {
        console.log('No user logged in, cannot load profile');
        resetProfileForm();
        return;
    }

    if (!firebaseDb) {
        console.error('Firestore not initialized');
        showNotification('Database connection not available', 'error');
        return;
    }

    try {
        console.log('Loading profile data for user:', currentUser.uid);

        const userDocRef = doc(firebaseDb, 'users', currentUser.uid);
        const userDoc = await getDoc(userDocRef);

        if (userDoc.exists()) {
            const userData = userDoc.data();
            console.log('Profile data loaded:', userData);

            // Skip applying if this payload is older than our most recent write
            if (lastUserDocWriteAt && userData.updatedAt && userData.updatedAt < lastUserDocWriteAt) {
                console.log('Stale profile payload detected, skipping UI apply');
                return;
            }

            // Populate form fields with a small delay to ensure DOM is ready
            setTimeout(() => {
                const fullNameInput = document.getElementById('fullName');
                const emailInput = document.getElementById('email');
                const institutionInput = document.getElementById('institution');
                const departmentInput = document.getElementById('department');
                const bioTextarea = document.getElementById('bio');

                console.log('Populating profile form with data:', {
                    fullName: userData.fullName || currentUser.displayName,
                    email: userData.email || currentUser.email,
                    institution: userData.institution,
                    department: userData.department,
                    bio: userData.bio
                });

                if (fullNameInput) {
                    fullNameInput.value = userData.fullName || currentUser.displayName || '';
                    console.log('Set fullName to:', fullNameInput.value);
                }
                if (emailInput) {
                    emailInput.value = userData.email || currentUser.email || '';
                    console.log('Set email to:', emailInput.value);
                }
                if (institutionInput) {
                    institutionInput.value = userData.institution || '';
                    console.log('Set institution to:', institutionInput.value);
                }
                if (departmentInput) {
                    departmentInput.value = userData.department || '';
                    console.log('Set department to:', departmentInput.value);
                }
                if (bioTextarea) {
                    bioTextarea.value = userData.bio || '';
                    console.log('Set bio to:', bioTextarea.value);
                }

                // Update avatar initials
                updateAvatarInitials(userData.fullName || currentUser.displayName || currentUser.email);

                // Load research interests
                const interestsContainer = document.getElementById('interestsContainer');
                if (interestsContainer) {
                    // Clear existing interests (except the add button)
                    const existingTags = interestsContainer.querySelectorAll('.interest-tag');
                    existingTags.forEach(tag => tag.remove());

                    // Add interests from database
                    if (userData.interests && Array.isArray(userData.interests)) {
                        userData.interests.forEach(interest => {
                            addInterestTag(interest);
                        });
                    }
                }

                // Update stats if available
                if (userData.stats) {
                    updateProfileStats(userData.stats);
                } else {
                    // Initialize default stats
                    updateProfileStats({
                        papersPublished: 0,
                        citations: 0,
                        averageRating: 0,
                        collaborators: 0
                    });
                }

                console.log('Profile loaded successfully');
            }, 100);

        } else {
            // Create initial profile document
            console.log('No existing profile found, creating initial profile...');
            await createInitialProfile();
            // Populate with default values while creating profile
            populateProfileWithDefaults();
            // Reload the newly created profile
            await loadProfileData();
        }
    } catch (error) {
        console.error('Error loading profile:', error);
        showNotification('Failed to load profile data: ' + error.message, 'error');
        // Fallback: populate with default values
        populateProfileWithDefaults();
    }
}

// Save profile data to Firestore
async function saveProfileData() {
    if (!currentUser) {
        showNotification('Please log in to save changes', 'warning');
        showModal(elements.loginModal);
        return;
    }

    if (!firebaseDb) {
        showNotification('Database connection not available', 'error');
        return;
    }

    const saveBtn = document.getElementById('saveProfileBtn');
    const originalHTML = saveBtn.innerHTML;

    try {
        // Show loading state
        saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
        saveBtn.disabled = true;

        // Get form values
        const fullName = document.getElementById('fullName')?.value.trim() || '';
        const email = document.getElementById('email')?.value.trim() || '';
        const institution = document.getElementById('institution')?.value.trim() || '';
        const department = document.getElementById('department')?.value.trim() || '';
        const bio = document.getElementById('bio')?.value.trim() || '';

        // Get research interests
        const interestTags = document.querySelectorAll('.interests-container .interest-tag');
        const interests = Array.from(interestTags).map(tag => tag.textContent.trim());

        // Get current stats to preserve them
        const currentStats = {
            papersPublished: parseInt(document.getElementById('papersCount')?.textContent) || 0,
            citations: parseInt(document.getElementById('citationsCount')?.textContent) || 0,
            averageRating: parseFloat(document.getElementById('ratingValue')?.textContent) || 0,
            collaborators: parseInt(document.getElementById('collaboratorsCount')?.textContent) || 0
        };

        const writeAt = new Date().toISOString();
        // Prepare profile data
        const profileData = {
            fullName,
            email: email || currentUser.email,
            institution,
            department,
            bio,
            interests,
            stats: currentStats,
            updatedAt: writeAt
        };

        // Save to Firestore
        const userDocRef = doc(firebaseDb, 'users', currentUser.uid);
        await setDoc(userDocRef, profileData, { merge: true });
        lastUserDocWriteAt = writeAt;

        // Immediately update the UI to reflect saved changes
        updateProfileUI(profileData);

        // Show success message
        saveBtn.innerHTML = '<i class="fas fa-check"></i> Saved!';
        saveBtn.style.background = '#10b981';

        showNotification('Profile saved successfully!', 'success');
        console.log('Profile saved:', profileData);

        // Restore button quickly
        setTimeout(() => {
            saveBtn.innerHTML = originalHTML;
            saveBtn.style.background = '';
            saveBtn.disabled = false;
            restoreIcons();
        }, 1000);

    } catch (error) {
        console.error('Error saving profile:', error);

        // Show error state
        saveBtn.innerHTML = '<i class="fas fa-exclamation-circle"></i> Error!';
        saveBtn.style.background = '#dc2626';
        saveBtn.disabled = false;

        showNotification('Failed to save profile: ' + error.message, 'error');

        // Restore button after delay
        setTimeout(() => {
            saveBtn.innerHTML = originalHTML;
            saveBtn.style.background = '';
            restoreIcons();
        }, 2000);
    }
}

// Create initial profile for new users
async function createInitialProfile() {
    if (!currentUser || !firebaseDb) {
        console.error('Cannot create profile: User not logged in or Firestore not available');
        return;
    }

    try {
        const initialData = {
            fullName: currentUser.displayName || '',
            email: currentUser.email || '',
            institution: '',
            department: '',
            bio: '',
            interests: [],
            stats: {
                papersPublished: 0,
                citations: 0,
                averageRating: 0,
                collaborators: 0
            },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        const userDocRef = doc(firebaseDb, 'users', currentUser.uid);
        await setDoc(userDocRef, initialData);

        console.log('Initial profile created successfully');
        showNotification('Welcome! Your profile has been created.', 'success');
    } catch (error) {
        console.error('Error creating initial profile:', error);
        showNotification('Failed to create profile: ' + error.message, 'error');
    }
}

// Create profile from registration data
async function createProfileFromRegistration(name, email) {
    if (!currentUser || !firebaseDb) {
        console.error('Cannot create profile: User not logged in or Firestore not available');
        return;
    }

    try {
        const profileData = {
            fullName: name,
            email: email,
            role: 'user',
            institution: '',
            department: '',
            bio: '',
            interests: [],
            stats: {
                papersPublished: 0,
                citations: 0,
                averageRating: 0,
                collaborators: 0
            },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        const userDocRef = doc(firebaseDb, 'users', currentUser.uid);
        await setDoc(userDocRef, profileData);

        console.log('Profile created from registration:', profileData);

        // If we're on the profile page, load the data immediately
        if (window.location.pathname.includes('profile.html')) {
            setTimeout(() => {
                loadProfileData();
            }, 500);
        }
    } catch (error) {
        console.error('Error creating profile from registration:', error);
        showNotification('Failed to create profile: ' + error.message, 'error');
    }
}

// Update avatar initials
function updateAvatarInitials(name) {
    const initials = name
        ? name.split(' ').map(word => word[0].toUpperCase()).slice(0, 2).join('')
        : '?';

    const profileAvatar = document.getElementById('avatarInitials');
    const sidebarAvatar = document.getElementById('sidebarAvatarInitials');

    if (profileAvatar) profileAvatar.textContent = initials;
    if (sidebarAvatar) sidebarAvatar.textContent = initials;
}

onAuthStateChanged(firebaseAuth, (user) => {
    if (user) {
        console.log("User logged in:", user.displayName || user.email);
        updateAvatarInitials(user.displayName || user.email);
        updateUserStatus(user);
        // subscribe to unread notifications so navbar badge stays up to date
        try { subscribeToUnreadNotifications(user.uid); } catch (e) { console.warn('failed subscribe notifications', e); }
    } else {
        console.log("No user logged in");
        updateAvatarInitials('');
        updateUserStatus(null);
        // cleanup any notification listener
        if (_notificationsUnsubscribe) { try { _notificationsUnsubscribe(); } catch (err) { }; _notificationsUnsubscribe = null; }
    }
});

// Update profile statistics
function updateProfileStats(stats) {
    const papersCount = document.getElementById('papersCount');
    const citationsCount = document.getElementById('citationsCount');
    const ratingValue = document.getElementById('ratingValue');
    const collaboratorsCount = document.getElementById('collaboratorsCount');

    if (papersCount) {
        papersCount.textContent = stats.papersPublished || 0;
        animateStatUpdate(papersCount);
    }
    if (citationsCount) {
        citationsCount.textContent = stats.citations || 0;
        animateStatUpdate(citationsCount);
    }
    if (ratingValue) {
        ratingValue.textContent = stats.averageRating?.toFixed(1) || '0.0';
        animateStatUpdate(ratingValue);
    }
    if (collaboratorsCount) {
        collaboratorsCount.textContent = stats.collaborators || 0;
        animateStatUpdate(collaboratorsCount);
    }
}

// Animate stat updates for visual feedback
function animateStatUpdate(element) {
    element.style.transition = 'all 0.3s ease';
    element.style.transform = 'scale(1.1)';
    element.style.color = '#10b981';

    setTimeout(() => {
        element.style.transform = 'scale(1)';
        element.style.color = '';
    }, 300);
}

// Update profile UI immediately after saving
function updateProfileUI(profileData) {
    // Update avatar initials
    updateAvatarInitials(profileData.fullName);

    // Update form inputs immediately to reflect saved changes
    const fullNameInput = document.getElementById('fullName');
    const emailInput = document.getElementById('email');
    const institutionInput = document.getElementById('institution');
    const departmentInput = document.getElementById('department');
    const bioTextarea = document.getElementById('bio');

    if (fullNameInput) fullNameInput.value = profileData.fullName || '';
    if (emailInput) emailInput.value = profileData.email || '';
    if (institutionInput) institutionInput.value = profileData.institution || '';
    if (departmentInput) departmentInput.value = profileData.department || '';
    if (bioTextarea) bioTextarea.value = profileData.bio || '';

    // Update stats if they exist
    if (profileData.stats) {
        updateProfileStats(profileData.stats);
    }

    // Update interests display
    const interestsContainer = document.getElementById('interestsContainer');
    if (interestsContainer && profileData.interests) {
        // Clear existing interests (except the add button)
        const existingTags = interestsContainer.querySelectorAll('.interest-tag');
        existingTags.forEach(tag => tag.remove());

        // Add interests from saved data
        profileData.interests.forEach(interest => {
            addInterestTag(interest);
        });
    }

    // Add visual feedback for successful save
    const profileContainer = document.querySelector('.profile-container');
    if (profileContainer) {
        profileContainer.style.transition = 'all 0.3s ease';
        profileContainer.style.transform = 'scale(1.02)';
        profileContainer.style.boxShadow = '0 0 20px rgba(16, 185, 129, 0.3)';

        setTimeout(() => {
            profileContainer.style.transform = 'scale(1)';
            profileContainer.style.boxShadow = '';
        }, 500);
    }

    console.log('Profile UI updated with saved data');
}

function addInterestTag(interest) {
    const container = document.getElementById('interestsContainer');
    if (container) {
        const tag = document.createElement('div');
        tag.className = 'interest-tag';
        tag.textContent = interest;
        tag.style.cursor = 'pointer';
        tag.title = 'Click to remove';

        // Add click to remove functionality
        tag.addEventListener('click', function () {
            showRemoveInterestModal(interest, this);
        });

        // Insert before the add button
        const addButton = container.querySelector('#addInterestBtn');
        if (addButton) {
            container.insertBefore(tag, addButton);
        } else {
            container.appendChild(tag);
        }
    }
}

// Attach listeners to existing interest tags for removal
function attachInterestRemovalListeners() {
    const interestTags = document.querySelectorAll('.interest-tag');
    interestTags.forEach(tag => {
        if (!tag.dataset.listenerAttached) {
            tag.style.cursor = 'pointer';
            tag.title = 'Click to remove';
            tag.addEventListener('click', function () {
                const interest = this.textContent.trim();
                showRemoveInterestModal(interest, this);
            });
            tag.dataset.listenerAttached = 'true';
        }
    });
}

// Save interests to Firebase immediately when they change
async function saveInterestsToFirebase() {
    if (!currentUser || !firebaseDb) {
        return;
    }

    try {
        // Get current interests from the UI
        const interestTags = document.querySelectorAll('.interests-container .interest-tag');
        const interests = Array.from(interestTags).map(tag => tag.textContent.trim());

        // Get current stats to preserve them
        const currentStats = {
            papersPublished: parseInt(document.getElementById('papersCount')?.textContent) || 0,
            citations: parseInt(document.getElementById('citationsCount')?.textContent) || 0,
            averageRating: parseFloat(document.getElementById('ratingValue')?.textContent) || 0,
            collaborators: parseInt(document.getElementById('collaboratorsCount')?.textContent) || 0
        };

        const writeAt = new Date().toISOString();
        // Update only interests in Firebase
        const userDocRef = doc(firebaseDb, 'users', currentUser.uid);
        await updateDoc(userDocRef, {
            interests: interests,
            stats: currentStats,
            updatedAt: writeAt
        });
        lastUserDocWriteAt = writeAt;

        console.log('Interests saved to Firebase:', interests);
    } catch (error) {
        console.error('Error saving interests:', error);
        showNotification('Failed to save interests: ' + error.message, 'error');
    }
}

// Add demo functionality for stats updates
function addStatsUpdateDemo() {
    // Add click handlers to stat cards for demo purposes
    const statCards = document.querySelectorAll('.stat-card');
    statCards.forEach(card => {
        card.style.cursor = 'pointer';
        card.title = 'Click to simulate stat update';

        card.addEventListener('click', function () {
            if (currentUser) {
                simulateStatsUpdate();
            } else {
                showNotification('Please log in to update stats', 'warning');
            }
        });
    });
}

// Simulate stats update for demonstration
async function simulateStatsUpdate() {
    if (!currentUser || !firebaseDb) {
        showNotification('Please log in to update stats', 'warning');
        return;
    }

    try {
        // Get current stats
        const currentStats = {
            papersPublished: parseInt(document.getElementById('papersCount')?.textContent) || 0,
            citations: parseInt(document.getElementById('citationsCount')?.textContent) || 0,
            averageRating: parseFloat(document.getElementById('ratingValue')?.textContent) || 0,
            collaborators: parseInt(document.getElementById('collaboratorsCount')?.textContent) || 0
        };

        // Simulate some growth
        const newStats = {
            papersPublished: currentStats.papersPublished + Math.floor(Math.random() * 3) + 1,
            citations: currentStats.citations + Math.floor(Math.random() * 10) + 5,
            averageRating: Math.min(5.0, currentStats.averageRating + (Math.random() * 0.2)),
            collaborators: currentStats.collaborators + Math.floor(Math.random() * 2) + 1
        };

        // Update UI immediately
        updateProfileStats(newStats);

        // Save to Firebase
        const userDocRef = doc(firebaseDb, 'users', currentUser.uid);
        await updateDoc(userDocRef, {
            stats: newStats,
            updatedAt: new Date().toISOString()
        });

        showNotification('Stats updated successfully!', 'success');
        console.log('Stats updated:', newStats);
    } catch (error) {
        console.error('Error updating stats:', error);
        showNotification('Failed to update stats: ' + error.message, 'error');
    }
}

// Populate profile with default values
function populateProfileWithDefaults() {
    console.log('Populating profile with default values...');
    console.log('Current user:', currentUser);

    // Set default profile values
    const fullNameInput = document.getElementById('fullName');
    const emailInput = document.getElementById('email');

    console.log('Form elements found:', {
        fullNameInput: !!fullNameInput,
        emailInput: !!emailInput
    });

    if (fullNameInput && currentUser) {
        const displayName = currentUser.displayName || currentUser.email?.split('@')[0] || '';
        fullNameInput.value = displayName;
        console.log('Set fullName to:', displayName);
    }
    if (emailInput && currentUser) {
        const email = currentUser.email || '';
        emailInput.value = email;
        console.log('Set email to:', email);
    }

    // Update avatar initials
    if (currentUser) {
        const nameForAvatar = currentUser.displayName || currentUser.email;
        console.log('Updating avatar with name:', nameForAvatar);
        updateAvatarInitials(nameForAvatar);
    }

    console.log('Default profile populated');
}

// Show modal for adding interests
function showAddInterestModal() {
    console.log('=== showAddInterestModal CALLED ===');

    // Remove any existing modal first
    const existingModal = document.getElementById('addInterestModal');
    if (existingModal) {
        console.log('Removing existing modal');
        existingModal.remove();
    }

    // Create modal HTML
    const modalHTML = `
        <div class="modal-content">
            <button class="close-modal-btn" id="closeAddInterestModalBtn">&times;</button>
            <h2 class="modal-title"><i class="fas fa-plus"></i> Add Research Interest</h2>
            <div class="form-group">
                <label for="interestInput">Research Interest</label>
                <input type="text" id="interestInput" class="form-input" placeholder="e.g., Machine Learning, Quantum Computing">
            </div>
            <div class="modal-actions">
                <button type="button" class="btn btn-secondary" id="cancelAddInterestBtn">Cancel</button>
                <button type="button" class="btn" id="submitAddInterestBtn">Add Interest</button>
            </div>
        </div>
    `;

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'addInterestModal';
    modal.innerHTML = modalHTML;

    document.body.appendChild(modal);
    console.log('Modal appended to body');

    // Make visible immediately
    modal.style.display = 'flex';
    setTimeout(() => modal.classList.add('is-visible'), 10);

    console.log('Setting up event listeners...');

    // Close button
    document.getElementById('closeAddInterestModalBtn').onclick = function () {
        console.log('Close button clicked');
        closeAddInterestModal();
    };

    // Cancel button
    document.getElementById('cancelAddInterestBtn').onclick = function () {
        console.log('Cancel button clicked');
        closeAddInterestModal();
    };

    // Submit button - THIS IS THE KEY ONE
    document.getElementById('submitAddInterestBtn').onclick = function () {
        console.log('=== SUBMIT BUTTON CLICKED ===');
        const input = document.getElementById('interestInput');
        const interest = input.value.trim();
        console.log('Interest value:', interest);

        if (interest) {
            console.log('Calling addInterestTag...');
            addInterestTag(interest);
            showNotification('Interest added: ' + interest, 'success');

            if (currentUser) {
                console.log('Saving to Firebase...');
                saveInterestsToFirebase();
            }

            closeAddInterestModal();
        } else {
            console.log('Empty interest');
            showNotification('Please enter an interest', 'warning');
        }
    };

    // Click outside to close
    modal.onclick = function (e) {
        if (e.target === modal) {
            console.log('Clicked outside modal');
            closeAddInterestModal();
        }
    };

    // Enter key to submit
    document.getElementById('interestInput').onkeypress = function (e) {
        if (e.key === 'Enter') {
            console.log('Enter key pressed');
            document.getElementById('submitAddInterestBtn').click();
        }
    };

    // Focus input
    setTimeout(() => {
        document.getElementById('interestInput').focus();
        console.log('Input focused');
    }, 100);

    console.log('=== Modal setup complete ===');
}

// Close add interest modal
function closeAddInterestModal() {
    console.log('closeAddInterestModal called');
    const modal = document.getElementById('addInterestModal');
    if (modal) {
        modal.classList.remove('is-visible');
        modal.style.display = 'none';
        setTimeout(() => {
            modal.remove();
            console.log('Modal removed');
        }, 300);
    }
}

// Show modal for removing interests
function showRemoveInterestModal(interest, element) {
    console.log('Opening remove modal for:', interest);

    // Remove existing modal if any
    const existingModal = document.getElementById('removeInterestModal');
    if (existingModal) {
        existingModal.remove();
    }

    // Escape single quotes in interest name for onclick attribute
    const escapedInterest = interest.replace(/'/g, "\\'");

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'removeInterestModal';
    modal.innerHTML = `
        <div class="modal-content">
            <button class="close-modal-btn" type="button">&times;</button>
            <div class="modal-icon">
                <i class="fas fa-trash-alt"></i>
            </div>
            <h2 class="modal-title">Remove Interest</h2>
            <p>Are you sure you want to remove "<strong>${interest}</strong>" from your research interests?</p>
            <div class="modal-actions">
                <button type="button" class="btn btn-secondary" id="cancelRemoveBtn">Cancel</button>
                <button type="button" class="btn btn-danger" id="confirmRemoveBtn">Remove</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    modal.style.display = 'flex';

    // Add visible class for animation
    setTimeout(() => modal.classList.add('is-visible'), 10);

    // Get buttons and attach event listeners
    const closeBtn = modal.querySelector('.close-modal-btn');
    const cancelBtn = document.getElementById('cancelRemoveBtn');
    const confirmBtn = document.getElementById('confirmRemoveBtn');

    // Close button handler
    closeBtn.onclick = function (e) {
        e.stopPropagation();
        console.log('Close clicked');
        closeRemoveInterestModal();
    };

    // Cancel button handler
    cancelBtn.onclick = function (e) {
        e.stopPropagation();
        console.log('Cancel clicked');
        closeRemoveInterestModal();
    };

    // Confirm remove button handler
    confirmBtn.onclick = function (e) {
        e.stopPropagation();
        console.log('Confirm remove clicked for:', interest);
        confirmRemoveInterest(interest);
    };

    // Click outside to close
    modal.onclick = function (e) {
        if (e.target === modal) {
            closeRemoveInterestModal();
        }
    };

    // Prevent clicks inside modal content from closing
    const modalContent = modal.querySelector('.modal-content');
    modalContent.onclick = function (e) {
        e.stopPropagation();
    };
}

// Close remove interest modal
function closeRemoveInterestModal() {
    console.log('Closing remove modal');
    const modal = document.getElementById('removeInterestModal');
    if (modal) {
        modal.classList.remove('is-visible');
        modal.style.display = 'none';
        setTimeout(() => {
            modal.remove();
        }, 300);
    }
}

// Confirm interest removal
function confirmRemoveInterest(interest) {
    console.log('Removing interest:', interest);

    // Find and remove the interest tag
    const interestTags = document.querySelectorAll('.interest-tag');
    let found = false;

    interestTags.forEach(tag => {
        if (tag.textContent.trim() === interest) {
            console.log('Found matching tag, removing...');

            // Animate out
            tag.style.transition = 'all 0.3s ease';
            tag.style.opacity = '0';
            tag.style.transform = 'scale(0.5)';

            setTimeout(() => {
                tag.remove();
                console.log('Tag removed');
            }, 300);

            found = true;
        }
    });

    if (found) {
        showNotification('Interest removed', 'info');

        // If user is logged in, auto-save the updated interests
        if (currentUser) {
            console.log('Saving to Firebase...');
            setTimeout(() => {
                saveInterestsToFirebase();
            }, 350);
        }
    } else {
        console.error('Interest tag not found');
    }

    closeRemoveInterestModal();
}



// SETTINGS PAGE FUNCTIONALITY
async function loadSettingsData() {
    if (!currentUser || !firebaseDb) {
        console.log('No user logged in or Firebase not available');
        return;
    }

    try {
        console.log('Loading settings data for user:', currentUser.uid);

        const userDocRef = doc(firebaseDb, 'users', currentUser.uid);
        const userDoc = await getDoc(userDocRef);

        if (userDoc.exists()) {
            const userData = userDoc.data();
            console.log('Settings data loaded:', userData);

            // Skip applying if this payload is older than our most recent write
            if (lastUserDocWriteAt && userData.updatedAt && userData.updatedAt < lastUserDocWriteAt) {
                console.log('Stale settings payload detected, skipping UI apply');
                return;
            }

            // Populate account settings
            const usernameInput = document.getElementById('username');
            const emailInput = document.getElementById('email');

            console.log('Populating settings form with data:', {
                username: userData.username || userData.fullName,
                email: userData.email || currentUser.email
            });

            if (usernameInput) {
                usernameInput.value = userData.username || userData.fullName || currentUser.displayName || '';
                console.log('Set username to:', usernameInput.value);
            }
            if (emailInput) {
                emailInput.value = userData.email || currentUser.email || '';
                console.log('Set email to:', emailInput.value);
            }

            // Populate research preferences
            const primaryFieldSelect = document.getElementById('primaryField');
            const experienceLevelSelect = document.getElementById('experienceLevel');
            const paperLanguageSelect = document.getElementById('paperLanguage');

            if (primaryFieldSelect) primaryFieldSelect.value = userData.primaryField || 'Machine Learning';
            if (experienceLevelSelect) experienceLevelSelect.value = userData.experienceLevel || 'Graduate Student';
            if (paperLanguageSelect) paperLanguageSelect.value = userData.paperLanguage || 'English';

            // Populate privacy settings
            const profilePublic = document.getElementById('profilePublic');
            const showReadingActivity = document.getElementById('showReadingActivity');
            const allowCollaboration = document.getElementById('allowCollaboration');
            const shareStats = document.getElementById('shareStats');

            if (profilePublic) profilePublic.checked = userData.privacy?.profilePublic !== false;
            if (showReadingActivity) showReadingActivity.checked = userData.privacy?.showReadingActivity === true;
            if (allowCollaboration) allowCollaboration.checked = userData.privacy?.allowCollaboration !== false;
            if (shareStats) shareStats.checked = userData.privacy?.shareStats === true;

            // Populate notification settings
            const emailNotifications = document.getElementById('emailNotifications');
            const paperRecommendations = document.getElementById('paperRecommendations');
            const citationAlerts = document.getElementById('citationAlerts');
            const qaNotifications = document.getElementById('qaNotifications');
            const weeklyDigest = document.getElementById('weeklyDigest');
            const marketingEmails = document.getElementById('marketingEmails');

            if (emailNotifications) emailNotifications.checked = userData.notifications?.emailNotifications !== false;
            if (paperRecommendations) paperRecommendations.checked = userData.notifications?.paperRecommendations !== false;
            if (citationAlerts) citationAlerts.checked = userData.notifications?.citationAlerts === true;
            if (qaNotifications) qaNotifications.checked = userData.notifications?.qaNotifications !== false;
            if (weeklyDigest) weeklyDigest.checked = userData.notifications?.weeklyDigest === true;
            if (marketingEmails) marketingEmails.checked = userData.notifications?.marketingEmails === true;

            console.log('Settings loaded successfully');
        } else {
            console.log('No existing settings found, using defaults');
            populateSettingsWithDefaults();
        }
    } catch (error) {
        console.error('Error loading settings:', error);
        showNotification('Failed to load settings: ' + error.message, 'error');
        // Fallback: populate with default values
        populateSettingsWithDefaults();
    }
}

// Save account settings
async function saveAccountSettings() {
    if (!currentUser || !firebaseDb) {
        showNotification('Please log in to save settings', 'warning');
        return;
    }

    const updateAccountBtn = document.getElementById('updateAccountBtn');
    const originalHTML = updateAccountBtn.innerHTML;

    try {
        updateAccountBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Updating...';
        updateAccountBtn.disabled = true;

        const username = document.getElementById('username')?.value.trim() || '';
        const email = document.getElementById('email')?.value.trim() || '';
        const currentPassword = document.getElementById('currentPassword')?.value.trim() || '';
        const newPassword = document.getElementById('newPassword')?.value.trim() || '';
        const confirmPassword = document.getElementById('confirmPassword')?.value.trim() || '';

        // Validate password change if provided
        if (newPassword && newPassword !== confirmPassword) {
            showNotification('New passwords do not match', 'error');
            return;
        }

        const writeAt = new Date().toISOString();
        const accountData = {
            username: username,
            email: email || currentUser.email,
            updatedAt: writeAt
        };

        // Add password change if provided
        if (newPassword && currentPassword) {
            accountData.passwordChanged = true;
            // Note: In a real app, you'd hash the password and verify the current one
        }

        const userDocRef = doc(firebaseDb, 'users', currentUser.uid);
        await updateDoc(userDocRef, accountData);
        lastUserDocWriteAt = writeAt;

        updateAccountBtn.innerHTML = '<i class="fas fa-check"></i> Updated!';
        updateAccountBtn.style.background = '#10b981';
        showNotification('Account settings updated successfully!', 'success');

        setTimeout(() => {
            updateAccountBtn.innerHTML = originalHTML;
            updateAccountBtn.style.background = '';
            updateAccountBtn.disabled = false;
            restoreIcons();
        }, 2000);

    } catch (error) {
        console.error('Error saving account settings:', error);
        updateAccountBtn.innerHTML = '<i class="fas fa-exclamation-circle"></i> Error!';
        updateAccountBtn.style.background = '#dc2626';
        showNotification('Failed to save account settings: ' + error.message, 'error');

        setTimeout(() => {
            updateAccountBtn.innerHTML = originalHTML;
            updateAccountBtn.style.background = '';
            updateAccountBtn.disabled = false;
            restoreIcons();
        }, 3000);
    }
}

// Save research preferences
async function saveResearchPreferences() {
    if (!currentUser || !firebaseDb) {
        showNotification('Please log in to save settings', 'warning');
        return;
    }

    const savePreferencesBtn = document.getElementById('savePreferencesBtn');
    const originalHTML = savePreferencesBtn.innerHTML;

    try {
        savePreferencesBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
        savePreferencesBtn.disabled = true;

        const primaryField = document.getElementById('primaryField')?.value || '';
        const experienceLevel = document.getElementById('experienceLevel')?.value || '';
        const paperLanguage = document.getElementById('paperLanguage')?.value || '';

        const writeAt = new Date().toISOString();
        const preferencesData = {
            primaryField: primaryField,
            experienceLevel: experienceLevel,
            paperLanguage: paperLanguage,
            updatedAt: writeAt
        };

        const userDocRef = doc(firebaseDb, 'users', currentUser.uid);
        await updateDoc(userDocRef, preferencesData);
        lastUserDocWriteAt = writeAt;

        savePreferencesBtn.innerHTML = '<i class="fas fa-check"></i> Saved!';
        savePreferencesBtn.style.background = '#10b981';
        showNotification('Research preferences saved successfully!', 'success');

        setTimeout(() => {
            savePreferencesBtn.innerHTML = originalHTML;
            savePreferencesBtn.style.background = '';
            savePreferencesBtn.disabled = false;
            restoreIcons();
        }, 2000);

    } catch (error) {
        console.error('Error saving research preferences:', error);
        savePreferencesBtn.innerHTML = '<i class="fas fa-exclamation-circle"></i> Error!';
        savePreferencesBtn.style.background = '#dc2626';
        showNotification('Failed to save research preferences: ' + error.message, 'error');

        setTimeout(() => {
            savePreferencesBtn.innerHTML = originalHTML;
            savePreferencesBtn.style.background = '';
            savePreferencesBtn.disabled = false;
            restoreIcons();
        }, 3000);
    }
}

// Save notification settings
async function saveNotificationSettings() {
    if (!currentUser || !firebaseDb) {
        showNotification('Please log in to save settings', 'warning');
        return;
    }

    const updateNotificationsBtn = document.getElementById('updateNotificationsBtn');
    const originalHTML = updateNotificationsBtn.innerHTML;

    try {
        updateNotificationsBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Updating...';
        updateNotificationsBtn.disabled = true;

        const emailNotifications = document.getElementById('emailNotifications')?.checked || false;
        const paperRecommendations = document.getElementById('paperRecommendations')?.checked || false;
        const citationAlerts = document.getElementById('citationAlerts')?.checked || false;
        const qaNotifications = document.getElementById('qaNotifications')?.checked || false;
        const weeklyDigest = document.getElementById('weeklyDigest')?.checked || false;
        const marketingEmails = document.getElementById('marketingEmails')?.checked || false;

        const writeAt = new Date().toISOString();
        const notificationsData = {
            notifications: {
                emailNotifications: emailNotifications,
                paperRecommendations: paperRecommendations,
                citationAlerts: citationAlerts,
                qaNotifications: qaNotifications,
                weeklyDigest: weeklyDigest,
                marketingEmails: marketingEmails
            },
            updatedAt: writeAt
        };

        const userDocRef = doc(firebaseDb, 'users', currentUser.uid);
        await updateDoc(userDocRef, notificationsData);
        lastUserDocWriteAt = writeAt;

        updateNotificationsBtn.innerHTML = '<i class="fas fa-check"></i> Updated!';
        updateNotificationsBtn.style.background = '#10b981';
        showNotification('Notification settings updated successfully!', 'success');

        setTimeout(() => {
            updateNotificationsBtn.innerHTML = originalHTML;
            updateNotificationsBtn.style.background = '';
            updateNotificationsBtn.disabled = false;
            restoreIcons();
        }, 2000);

    } catch (error) {
        console.error('Error saving notification settings:', error);
        updateNotificationsBtn.innerHTML = '<i class="fas fa-exclamation-circle"></i> Error!';
        updateNotificationsBtn.style.background = '#dc2626';
        showNotification('Failed to save notification settings: ' + error.message, 'error');

        setTimeout(() => {
            updateNotificationsBtn.innerHTML = originalHTML;
            updateNotificationsBtn.style.background = '';
            updateNotificationsBtn.disabled = false;
            restoreIcons();
        }, 3000);
    }
}

// Auto-save settings to Firebase
async function saveSettingsToFirebase() {
    if (!currentUser || !firebaseDb) {
        return;
    }

    try {
        // Get current settings
        const profilePublic = document.getElementById('profilePublic')?.checked || false;
        const showReadingActivity = document.getElementById('showReadingActivity')?.checked || false;
        const allowCollaboration = document.getElementById('allowCollaboration')?.checked || false;
        const shareStats = document.getElementById('shareStats')?.checked || false;

        const emailNotifications = document.getElementById('emailNotifications')?.checked || false;
        const paperRecommendations = document.getElementById('paperRecommendations')?.checked || false;
        const citationAlerts = document.getElementById('citationAlerts')?.checked || false;
        const qaNotifications = document.getElementById('qaNotifications')?.checked || false;
        const weeklyDigest = document.getElementById('weeklyDigest')?.checked || false;
        const marketingEmails = document.getElementById('marketingEmails')?.checked || false;

        const writeAt = new Date().toISOString();
        const settingsData = {
            privacy: {
                profilePublic: profilePublic,
                showReadingActivity: showReadingActivity,
                allowCollaboration: allowCollaboration,
                shareStats: shareStats
            },
            notifications: {
                emailNotifications: emailNotifications,
                paperRecommendations: paperRecommendations,
                citationAlerts: citationAlerts,
                qaNotifications: qaNotifications,
                weeklyDigest: weeklyDigest,
                marketingEmails: marketingEmails
            },
            updatedAt: writeAt
        };

        const userDocRef = doc(firebaseDb, 'users', currentUser.uid);
        await updateDoc(userDocRef, settingsData);
        lastUserDocWriteAt = writeAt;

        console.log('Settings auto-saved to Firebase');
    } catch (error) {
        console.error('Error auto-saving settings:', error);
    }
}

// Populate settings with default values
function populateSettingsWithDefaults() {
    console.log('Populating settings with default values...');
    console.log('Current user:', currentUser);

    // Set default account values
    const usernameInput = document.getElementById('username');
    const emailInput = document.getElementById('email');

    console.log('Settings form elements found:', {
        usernameInput: !!usernameInput,
        emailInput: !!emailInput
    });

    if (usernameInput && currentUser) {
        const username = currentUser.displayName || currentUser.email?.split('@')[0] || '';
        usernameInput.value = username;
        console.log('Set username to:', username);
    }
    if (emailInput && currentUser) {
        const email = currentUser.email || '';
        emailInput.value = email;
        console.log('Set email to:', email);
    }

    // Set default research preferences
    const primaryFieldSelect = document.getElementById('primaryField');
    const experienceLevelSelect = document.getElementById('experienceLevel');
    const paperLanguageSelect = document.getElementById('paperLanguage');

    console.log('Research preference elements found:', {
        primaryFieldSelect: !!primaryFieldSelect,
        experienceLevelSelect: !!experienceLevelSelect,
        paperLanguageSelect: !!paperLanguageSelect
    });

    if (primaryFieldSelect) {
        primaryFieldSelect.value = 'Machine Learning';
        console.log('Set primary field to: Machine Learning');
    }
    if (experienceLevelSelect) {
        experienceLevelSelect.value = 'Graduate Student';
        console.log('Set experience level to: Graduate Student');
    }
    if (paperLanguageSelect) {
        paperLanguageSelect.value = 'English';
        console.log('Set paper language to: English');
    }

    console.log('Default settings populated');
}

// END SETTINGS FUNCTIONALITY

// Library page functionality
function initializeLibraryFeatures() {
    const heartBtns = document.querySelectorAll('.btn-icon[title="Add to Favorites"]');
    heartBtns.forEach(btn => {
        btn.addEventListener('click', function () {
            this.classList.toggle('favorited');
            if (this.classList.contains('favorited')) {
                this.innerHTML = '<i class="fas fa-heart" style="color: #dc2626;"></i>';
                showNotification('Added to favorites!', 'success');
            } else {
                this.innerHTML = '<i class="fas fa-heart"></i>';
                showNotification('Removed from favorites', 'info');
            }
        });
    });

    const downloadBtns = document.querySelectorAll('.btn-icon[title="Download"]');
    downloadBtns.forEach(btn => {
        btn.addEventListener('click', function () {
            showNotification('Download started...', 'info');
            setTimeout(() => {
                showNotification('Download completed!', 'success');
            }, 2000);
        });
    });

    const shareBtns = document.querySelectorAll('.btn-icon[title="Share"]');
    shareBtns.forEach(btn => {
        btn.addEventListener('click', function () {
            if (navigator.share) {
                navigator.share({
                    title: 'Research Paper',
                    text: 'Check out this interesting research paper!',
                    url: window.location.href
                });
            } else {
                navigator.clipboard.writeText(window.location.href).then(() => {
                    showNotification('Link copied to clipboard!', 'success');
                });
            }
        });
    });

    const filterSelects = document.querySelectorAll('.form-select');
    filterSelects.forEach(select => {
        select.addEventListener('change', function () {
            console.log(`Filter changed: ${this.value}`);
            showNotification(`Filtered by: ${this.value}`, 'info');
            filterLibraryPapers(this.value);
        });
    });

    const librarySearchBtn = document.querySelector('.library-controls .btn');
    if (librarySearchBtn && librarySearchBtn.textContent.includes('Search')) {
        librarySearchBtn.addEventListener('click', function () {
            const searchInput = document.querySelector('.library-controls .search-input');
            if (searchInput && searchInput.value.trim()) {
                console.log(`Searching library for: ${searchInput.value}`);
                showNotification(`Searching for: ${searchInput.value}`, 'info');
                searchLibraryPapers(searchInput.value);
            } else {
                showNotification('Please enter a search term', 'warning');
            }
        });
    }

    const sortSelects = document.querySelectorAll('select[name="sort"]');
    sortSelects.forEach(select => {
        select.addEventListener('change', function () {
            console.log(`Sort changed: ${this.value}`);
            showNotification(`Sorted by: ${this.value}`, 'info');
            sortPapers(this.value);
        });
    });
}

// Render the user's library into the library page (#papersGrid)
async function renderUserLibrary() {
    const container = document.getElementById('papersGrid');
    if (!container) return;

    container.innerHTML = `<div class="paper-card loading-card"><h3 class="paper-title">Loading your library...</h3></div>`;

    if (!currentUser || !firebaseDb) {
        container.innerHTML = `<div class="paper-card"><h3 class="paper-title">Please log in to view your library.</h3></div>`;
        return;
    }

    try {
        const papers = await loadUserLibrary('all');

        if (!papers || papers.length === 0) {
            container.innerHTML = `<div class="paper-card no-papers"><h3 class="paper-title">No saved papers in your library</h3><div class="paper-meta"><span><i class="fas fa-info-circle"></i> Use the Save button on papers to add them here.</span></div></div>`;
            return;
        }

        const html = papers.map(paper => {
            const viewUrl = paper.fileUrl || paper.url || '';
            const yearText = paper.year ? `<span class="year"><i class="fas fa-calendar"></i> ${escapeHtml(String(paper.year))}</span>` : '';
            const authorsText = escapeHtml(paper.authors || paper.authorName || '—');
            const categoryText = escapeHtml(paper.category || '');
            const tagsHtml = (paper.tags || []).map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('');

            return `
                <div class="paper-card search-result-item" data-library-id="${escapeHtml(paper.id || '')}" data-category="${escapeHtml(paper.category || '')}">
                    <div class="result-header">
                        <h4>${escapeHtml(paper.title || '')}</h4>
                        <div class="result-actions">
                            ${isRemoteUrl(viewUrl) ? `<a class="btn btn-view" target="_blank" rel="noopener noreferrer" href="${escapeHtml(viewUrl)}" title="View Paper"><i class="fas fa-file-pdf"></i> View</a>` : `<button class="btn btn-view disabled" disabled title="No accessible file"><i class="fas fa-file-pdf"></i> View</button>`}
                            <button class="btn btn-remove-library" data-title="${escapeHtml(paper.title || '')}" data-type="${escapeHtml(paper.type || 'saved')}" title="Remove from library"><i class="fas fa-trash-alt"></i> Remove</button>
                        </div>
                    </div>

                    <div class="result-meta">
                        <span class="authors"><i class="fas fa-user"></i> ${authorsText}</span>
                        ${yearText}
                        <span class="category"><i class="fas fa-tag"></i> ${categoryText}</span>
                    </div>

                    <p class="result-abstract">${escapeHtml((paper.abstract || '').substring(0, 240))}${(paper.abstract && paper.abstract.length > 240) ? '...' : ''}</p>

                    <div class="result-tags">${tagsHtml}</div>
                </div>
            `;
        }).join('');

        container.innerHTML = html;

    } catch (err) {
        console.error('Error loading library UI:', err);
        container.innerHTML = `<div class="paper-card"><h3 class="paper-title">Failed to load library</h3></div>`;
    }
}

// If we are on the library page, auto-render the user library and attach refresh on auth change
if (location.href.includes('library.html')) {
    onAuthStateChanged(firebaseAuth, (user) => {
        currentUser = user;
        renderUserLibrary().catch(e => console.warn(e));
    });
}

function filterLibraryPapers(filterValue) {
    const papers = document.querySelectorAll('.paper-card, .search-result-item');
    papers.forEach(paper => {
        if (filterValue === 'all') {
            paper.style.display = 'block';
        } else {
            const shouldShow = Math.random() > 0.3;
            paper.style.display = shouldShow ? 'block' : 'none';
        }
    });
}

function searchLibraryPapers(query) {
    const papers = document.querySelectorAll('.paper-card, .search-result-item');
    let foundCount = 0;

    papers.forEach(paper => {
        const title = paper.querySelector('h3, h4')?.textContent.toLowerCase() || '';
        const abstract = paper.querySelector('.paper-abstract, .result-abstract')?.textContent.toLowerCase() || '';

        if (title.includes(query.toLowerCase()) || abstract.includes(query.toLowerCase())) {
            paper.style.display = 'block';
            foundCount++;
        } else {
            paper.style.display = 'none';
        }
    });

    showNotification(`Found ${foundCount} papers matching "${query}"`, 'info');
}

function sortPapers(sortValue) {
    const container = document.querySelector('.papers-grid, .search-results-list');
    if (!container) return;

    const papers = Array.from(container.children);

    papers.sort((a, b) => {
        switch (sortValue) {
            case 'title':
                const titleA = a.querySelector('h3, h4')?.textContent || '';
                const titleB = b.querySelector('h3, h4')?.textContent || '';
                return titleA.localeCompare(titleB);
            case 'year':
                const yearA = parseInt(a.querySelector('.year')?.textContent) || 0;
                const yearB = parseInt(b.querySelector('.year')?.textContent) || 0;
                return yearB - yearA;
            case 'rating':
                const ratingA = parseFloat(a.querySelector('.rating')?.textContent) || 0;
                const ratingB = parseFloat(b.querySelector('.rating')?.textContent) || 0;
                return ratingB - ratingA;
            default:
                return 0;
        }
    });

    papers.forEach(paper => container.appendChild(paper));
}


// -------------------------------------------------------------
// Load ONLY user's pending submissions (including sample papers)
// -------------------------------------------------------------
async function loadUserSubmissions() {
    if (!firebaseAuth?.currentUser || !firebaseDb) return [];

    try {
        const user = firebaseAuth.currentUser;

        // 🔑 get ALL user's papers regardless of status
        const q = query(
            collection(firebaseDb, "papers"),
            where("authorId", "==", user.uid),
            orderBy("submittedAt", "desc")
        );

        const snapshot = await getDocs(q);

        const submissions = [];

        snapshot.forEach(doc => {
            const data = doc.data();

            // If no status → treat as pending (for sample data)
            if (!data.status || data.status === "pending") {
                submissions.push({ id: doc.id, ...data });
            }
        });

        return submissions;

    } catch (err) {
        console.error("Error loading user submissions:", err);
        return [];
    }
}


// -------------------------------------------------------------
// Load ONLY user's APPROVED papers (from "publishedPapers")
// -------------------------------------------------------------
async function loadUserPublishedPapers() {
    if (!firebaseAuth?.currentUser || !firebaseDb) return [];

    try {
        const user = firebaseAuth.currentUser;

        const publishedRef = collection(firebaseDb, "publishedPapers");
        const q = query(
            publishedRef,
            where("authorId", "==", user.uid),
            orderBy("createdAt", "desc")
        );

        const snapshot = await getDocs(q);

        const papers = [];
        snapshot.forEach(doc => papers.push({ id: doc.id, ...doc.data() }));

        return papers;

    } catch (error) {
        console.error("Error loading published papers:", error);
        return [];
    }
}


// -------------------------------------------------------------
// Display merged pending + published papers
// -------------------------------------------------------------
function displayMergedUserPapers({ submissions = [], published = [] } = {}) {
    const container = document.getElementById("myPapersContainer");
    if (!container) return;

    if (submissions.length === 0 && published.length === 0) {
        container.innerHTML = `
            <div class="paper-card">
                <h3 class="paper-title">No papers found</h3>
                <div class="paper-meta">
                    <span><i class="fas fa-info-circle"></i> Submit a paper to begin.</span>
                </div>
            </div>
        `;
        return;
    }

    let html = "";

    // -----------------
    // Pending Section
    // -----------------
    if (submissions.length > 0) {
        html += `<h3 class="section-title">Pending Review</h3>`;

        submissions.forEach(paper => {
            const tags = paper.tags?.length
                ? `<div class="paper-tags">${paper.tags.map(t => `<span class="paper-tag">${t}</span>`).join("")}</div>`
                : "";

            html += `
                <div class="paper-card">
                    <h3 class="paper-title">${paper.title}</h3>
                    <div class="paper-meta">
                        <span><i class="fas fa-user"></i> ${escapeHtml(paper.authors || paper.authorName || '—')}</span>
                        <span><i class="fas fa-tag"></i> ${escapeHtml(paper.category || '')}</span>
                        ${paper.year ? `<span><i class="fas fa-calendar"></i> ${escapeHtml(String(paper.year))}</span>` : ''}
                    </div>
                    <p class="paper-abstract">${paper.abstract}</p>
                    ${tags}
                    <div class="paper-actions">
                        ${paper.url ? `<a class="btn btn-view" target="_blank" rel="noopener noreferrer" href="${escapeHtml(paper.url)}"><i class="fas fa-file-pdf"></i> View</a>` : `<button class="btn btn-view disabled" disabled title="No file"><i class="fas fa-file-pdf"></i> View</button>`}
                        <button class="btn btn-save-library" data-title="${escapeHtml(paper.title)}" data-authors="${escapeHtml(paper.authors || paper.authorName || '')}" data-category="${escapeHtml(paper.category || '')}" data-abstract="${escapeHtml(paper.abstract || '')}" data-year="${escapeHtml(paper.year || '')}" data-url="${escapeHtml(paper.fileUrl || paper.url || '')}"><i class="fas fa-book"></i> Save</button>
                        <span class="paper-status"><i class="fas fa-clock"></i> Pending Review</span>
                    </div>
                </div>
            `;
        });
    }

    // -----------------
    // Published Section
    // -----------------
    if (published.length > 0) {
        html += `<h3 class="section-title">Published Papers</h3>`;

        published.forEach(paper => {
            const tags = paper.tags?.length
                ? `<div class="paper-tags">${paper.tags.map(t => `<span class="paper-tag">${t}</span>`).join("")}</div>`
                : "";

            const fileUrl = paper.fileUrl || paper.url || "";

            html += `
                <div class="paper-card">
                    <h3 class="paper-title">${paper.title}</h3>
                    <div class="paper-meta">
                        <span><i class="fas fa-user"></i> ${escapeHtml(paper.authorName || paper.authors || '—')}</span>
                        <span><i class="fas fa-tag"></i> ${escapeHtml(paper.category || '')}</span>
                        ${paper.year ? `<span><i class="fas fa-calendar"></i> ${escapeHtml(String(paper.year))}</span>` : ''}
                    </div>
                    <p class="paper-abstract">${paper.abstract}</p>
                    ${tags}
                    <div class="paper-actions">
                        ${fileUrl ? `<a class="btn btn-view" target="_blank" rel="noopener noreferrer" href="${escapeHtml(fileUrl)}"><i class="fas fa-file-pdf"></i> View</a>` : `<button class="btn btn-view disabled" disabled title="No file"><i class="fas fa-file-pdf"></i> View</button>`}
                        <button class="btn btn-save-library" data-title="${escapeHtml(paper.title)}" data-authors="${escapeHtml(paper.authorName || paper.authors || '')}" data-category="${escapeHtml(paper.category || '')}" data-abstract="${escapeHtml(paper.abstract || '')}" data-year="${escapeHtml(paper.year || '')}" data-url="${escapeHtml(fileUrl)}"><i class="fas fa-book"></i> Save</button>
                        <span class="paper-status"><i class="fas fa-check-circle"></i> Published</span>
                    </div>
                </div>
            `;
        });
    }

    container.innerHTML = html;
}



// -------------------------------------------------------------
// Published Page Logic (FINAL WORKING VERSION)
// -------------------------------------------------------------
function initializePublishedFeatures() {

    // Prevent multiple inits
    if (initializePublishedFeatures._initialized) return;
    initializePublishedFeatures._initialized = true;

    console.log("Published Page Ready");

    const $ = (id) => document.getElementById(id);

    // =============================================================
    // Load merged: pending + published
    // =============================================================
    async function loadMergedPapers() {
        const container = $("myPapersContainer");
        if (!container) return;

        const user = firebaseAuth?.currentUser;
        if (!user) {
            container.innerHTML = `
                <div class="paper-card">
                    <h3 class="paper-title">Please log in to view your papers.</h3>
                </div>`;
            return;
        }

        container.innerHTML = `
            <div class="paper-card loading-card">
                <h3 class="paper-title">Loading papers...</h3>
                <div class="paper-meta">
                    <span><i class="fas fa-clock"></i> Please wait</span>
                </div>
            </div>
        `;

        try {
            const [submissions, published] = await Promise.all([
                loadUserSubmissions(),
                loadUserPublishedPapers()
            ]);

            displayMergedUserPapers({ submissions, published });

        } catch (err) {
            console.error("Error loading papers:", err);
            container.innerHTML = `<div class="paper-card"><h3>Error loading papers</h3></div>`;
        }
    }

    // =============================================================
    // Attach submit listener DIRECTLY (no retry logic)
    // =============================================================
    const form = $("submitPaperForm");
    const modal = $("submitPaperModal");

    if (form) {
        form.addEventListener("submit", async (e) => {
            e.preventDefault();
            console.log(">>> PUBLISH SUBMIT HANDLER TRIGGERED");

            const title = $("submitPaperTitle").value.trim();
            const authors = $("submitPaperAuthors").value.trim();
            const category = $("submitPaperCategory").value;
            const year = $("submitPaperYear") ? parseInt($("submitPaperYear").value, 10) || null : null;
            const abstract = $("submitPaperAbstract").value.trim();
            const tags = $("submitPaperTags").value.trim();
            const fileInput = $("submitPaperFileInput");
            const file = fileInput ? fileInput.files[0] : null;

            if (!title || !authors || !abstract) {
                showNotificationModal("Missing Fields", "Please fill in all required fields.", "error");
                return;
            }

            const user = firebaseAuth?.currentUser;
            if (!user) {
                showNotificationModal("Login Required", "Please log in before submitting.", "error");
                return;
            }

            try {
                if (!file) {
                    showNotificationModal("Missing File", "Please upload your paper as a PDF file.", "error");
                    return;
                }
                if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
                    showNotificationModal('Invalid file type', 'Please upload a PDF file.', 'error');
                    return;
                }
                const MAX_BYTES = 20 * 1024 * 1024; // 20MB
                if (file.size > MAX_BYTES) {
                    showNotificationModal('File too large', 'Please upload a PDF smaller than 20MB.', 'error');
                    return;
                }

                // Upload the file to Cloudinary (unsigned preset)
                const originalSubmitHTML = e.submitter ? e.submitter.innerHTML : null;
                if (e.submitter) { e.submitter.disabled = true; e.submitter.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...'; }

                // Use Cloudinary unsigned upload helper (returns secure_url)
                const downloadURL = await uploadToCloudinaryUnsigned(file);

                if (e.submitter) { e.submitter.disabled = false; e.submitter.innerHTML = originalSubmitHTML || '<i class="fas fa-paper-plane"></i> Submit for Review'; }

                await addDoc(collection(firebaseDb, "papers"), {
                    title,
                    authors,
                    category,
                    abstract,
                    tags: tags ? tags.split(",").map(t => t.trim()) : [],
                    year,
                    fileUrl: downloadURL,
                    fileName: file.name,
                    fileSize: file.size,
                    authorId: user.uid,
                    submittedAt: serverTimestamp(),
                    status: "pending"
                });

                showNotificationModal("Success!", "Your paper was submitted for review.", "success");

                form.reset();
                modal.style.display = "none";
                modal.setAttribute("aria-hidden", "true");

                setTimeout(loadMergedPapers, 400);

            } catch (err) {
                console.error("Submission error:", err);
                try {
                    showUploadError(err);
                } catch (e) {
                    showNotificationModal("Error", "Submission failed. Please try again.", "error");
                }
                if (e.submitter) { e.submitter.disabled = false; e.submitter.innerHTML = originalSubmitHTML || '<i class="fas fa-paper-plane"></i> Submit for Review'; }
            }
        });
    }

    // =============================================================
    // Modal Controls (simple and reliable)
    // =============================================================
    $("openSubmitPaperBtn")?.addEventListener("click", () => {
        modal.style.display = "flex";
        modal.removeAttribute("aria-hidden");
    });

    const closeModal = () => {
        modal.style.display = "none";
        modal.setAttribute("aria-hidden", "true");
        form.reset();
    };

    $("closeSubmitPaperModal")?.addEventListener("click", closeModal);
    $("cancelSubmitPaper")?.addEventListener("click", closeModal);

    modal?.addEventListener("click", (e) => {
        if (e.target === modal) closeModal();
    });

    // =============================================================
    // Auto-load after login
    // =============================================================
    onAuthStateChanged(firebaseAuth, (user) => {
        if (user) loadMergedPapers();
        else {
            const container = $("myPapersContainer");
            if (container) {
                container.innerHTML = `
                    <div class="paper-card">
                        <h3 class="paper-title">Please log in to view your papers.</h3>
                    </div>`;
            }
        }
    });
}

// -----------------------------
// Emergency delegated submit handler for paper upload (fallback)
// -----------------------------
(function attachDelegatedPaperSubmitFallback() {
    if (window.__paper_submit_delegation_installed) {
        console.log("Delegated paper submit fallback already installed");
        return;
    }

    // File input preview for the modal
    (function () {
        const fileInput = document.getElementById('submitPaperFileInput');
        const preview = document.getElementById('submitPaperFilePreview');
        if (!fileInput || !preview) return;
        fileInput.addEventListener('change', (ev) => {
            const f = ev.target.files[0];
            if (!f) {
                preview.style.display = 'none';
                preview.innerHTML = '';
                return;
            }
            const sizeKB = Math.round(f.size / 1024);
            preview.style.display = 'flex';
            preview.innerHTML = `<div class="file-name">${escapeHtml(f.name)}</div><div class="file-meta">${sizeKB} KB</div>`;
        });
    })();
    window.__paper_submit_delegation_installed = true;
    console.log("Installing delegated paper submit fallback (listening for submit events)");

    // Delegated submit listener (captures submit events from dynamically inserted forms)
    document.addEventListener('submit', async function delegatedPaperSubmitHandler(e) {
        // If it's not the paper upload form, ignore
        const form = e.target;
        if (!form || form.id !== 'submitPaperForm') return;

        e.preventDefault();
        e.stopImmediatePropagation();
        console.log("Delegated handler: caught submit for #submitPaperForm");

        // Defensive reads
        const get = id => document.getElementById(id);
        const titleEl = get('submitPaperTitle');
        const authorsEl = get('submitPaperAuthors');
        const abstractEl = get('submitPaperAbstract');
        const categoryEl = get('submitPaperCategory');
        const tagsEl = get('submitPaperTags');
        const fileInputEl = get('submitPaperFileInput');
        const modal = get('submitPaperModal');

        const title = titleEl?.value?.trim?.() ?? '';
        const authors = authorsEl?.value?.trim?.() ?? '';
        const category = categoryEl?.value ?? '';
        const abstract = abstractEl?.value?.trim?.() ?? '';
        const tags = tagsEl?.value?.trim?.() ?? '';
        const file = fileInputEl?.files?.[0] ?? null;

        console.log("Delegated submit values:", { title, authors, category, abstract, tags });

        if (!title || !authors || !abstract) {
            console.warn("Delegated handler: missing required fields");
            if (typeof showNotificationModal === "function") showNotificationModal("Missing Fields", "Please fill in all required fields.", "error");
            return;
        }

        try {
            const user = firebaseAuth?.currentUser;
            if (!user) {
                console.warn("Delegated handler: user not logged in");
                if (typeof showNotificationModal === "function") showNotificationModal("Login Required", "Please log in before submitting.", "error");
                return;
            }

            // Require a file and upload to storage, then create the paper record
            if (!file) {
                if (typeof showNotificationModal === "function") showNotificationModal('Missing File', 'Please upload a PDF file before submitting.', 'error');
                return;
            }
            if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
                if (typeof showNotificationModal === "function") showNotificationModal('Invalid file', 'Please upload a PDF file.', 'error');
                return;
            }

            // Upload to Cloudinary unsigned (client-side)
            const downloadURL = await uploadToCloudinaryUnsigned(file);

            console.log("Delegated handler: submitting to Firestore...");
            await addDoc(collection(firebaseDb, "papers"), {
                title,
                authors,
                category,
                abstract,
                tags: tags ? tags.split(",").map(t => t.trim()) : [],
                fileUrl: downloadURL,
                fileName: file.name,
                authorId: user.uid,
                submittedAt: serverTimestamp(),
                status: "pending"
            });

            console.log("Delegated handler: submission success");
            if (typeof showNotificationModal === "function") showNotificationModal("Success!", "Your paper was submitted for review.", "success");
            // reset form and close modal if present
            form.reset();
            if (modal) {
                modal.style.display = "none";
                modal.setAttribute('aria-hidden', 'true');
            }
            // attempt to refresh list if function exists
            if (typeof loadMergedPapers === "function") setTimeout(loadMergedPapers, 400);
        } catch (err) {
            console.error("Delegated handler: submission error", err);
            try {
                showUploadError(err);
            } catch (e) {
                if (typeof showNotificationModal === "function") showNotificationModal("Error", "Submission failed. Try again.", "error");
            }
        }
    }, true /* useCapture to catch earlier */);

    // Extra: attach a click handler to the submit button that will call requestSubmit if present
    (function attachSubmitButtonBackup() {
        const tryAttach = () => {
            const form = document.getElementById('submitPaperForm');
            const btn = form?.querySelector('button[type="submit"], input[type="submit"]');
            if (!btn || btn.dataset.__backup) {
                if (btn && btn.dataset.__backup) return;
                // if form not found, retry in 200ms (only do small number of retries to avoid spam)
                if (!btn) {
                    setTimeout(tryAttach, 200);
                }
                return;
            }
            btn.dataset.__backup = "1";
            btn.addEventListener('click', (ev) => {
                console.log("Submit button clicked (backup listener)");
                const f = document.getElementById('submitPaperForm');
                if (!f) return;
                if (!f.checkValidity()) {
                    console.warn("Backup: form invalid according to browser validity");
                    return;
                }
                if (typeof f.requestSubmit === 'function') f.requestSubmit();
                else f.submit();
            });
            console.log("Attached submit-button backup listener");
        };
        tryAttach();
    })();
})();



function showNotificationModal(title, message, type = "info") {
    const modal = document.getElementById("notificationModal");
    const titleEl = document.getElementById("notificationTitle");
    const messageEl = document.getElementById("notificationMessage");
    const closeBtn = document.getElementById("closeNotificationBtn");
    const modalContent = document.getElementById("notificationModalContent");

    if (!modal || !titleEl || !messageEl) return;

    titleEl.textContent = title;
    messageEl.textContent = message;

    // Change color based on type
    modalContent.style.borderTop = type === "success"
        ? "6px solid #10b981"
        : type === "error"
            ? "6px solid #dc2626"
            : "6px solid #5b21b6";

    modal.classList.add("is-visible");
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";

    const closeModal = () => {
        modal.classList.remove("is-visible");
        modal.setAttribute("aria-hidden", "true");
        document.body.style.overflow = "";
    };

    closeBtn.onclick = closeModal;
    modal.onclick = (e) => {
        if (e.target === modal) closeModal();
    };
}

// Show a more detailed upload error to help diagnose CORS/auth issues
function showUploadError(err) {
    console.error('Storage upload error detail:', err);
    const details = err && (err.message || err.code) ? `${err.code || ''} ${err.message || ''}`.trim() : String(err);
    const hint = 'Possible causes: CORS not configured on the Storage bucket, incorrect bucket name, or authentication/permission issues.';
    const advice = 'Check DevTools Network panel for the OPTIONS preflight response and run the gsutil `cors get`/`set` steps.';
    const message = details ? `${details} — ${hint} ${advice}` : `${hint} ${advice}`;
    showNotificationModal('Upload Error', message, 'error');
}



// QUESTIONS PAGE FUNCTIONALITY
async function initializeQuestionsFeatures() {
    console.log("Initializing Questions Page with fixed tab functionality...");

    const questionsContainer = document.getElementById('questionsContainer');
    const questionsListView = document.getElementById('questionsListView');
    const questionDetailView = document.getElementById('questionDetailView');
    const askQuestionBtn = document.getElementById('askQuestionBtn');
    const backToQuestionsBtn = document.getElementById('backToQuestionsBtn');
    const answerQuestionBtn = document.getElementById('answerQuestionBtn');
    const cancelAnswerBtn = document.getElementById('cancelAnswerBtn');
    const submitAnswerBtn = document.getElementById('submitAnswerBtn');
    const answerFormContainer = document.getElementById('answerFormContainer');
    const answerText = document.getElementById('answerText');

    // Questions search functionality
    const questionsSearchBtn = document.getElementById('questionsSearchBtn');
    const questionsSearchInput = document.getElementById('questionsSearchInput');

    if (!questionsContainer) {
        console.log("Not on questions page, skipping initialization");
        return;
    }

    // Initialize tab buttons with proper event listeners
    const tabButtons = document.querySelectorAll('.filter-tabs .tab-btn');
    console.log(`Found ${tabButtons.length} tab buttons`);

    tabButtons.forEach(btn => {
        btn.addEventListener('click', async function () {
            console.log('Tab clicked:', this.dataset.tab);

            // Remove active class from all tabs
            tabButtons.forEach(tab => tab.classList.remove('active'));

            // Add active class to clicked tab
            this.classList.add('active');

            // Get the tab type
            const tabType = this.dataset.tab;

            console.log(`Loading ${tabType} questions...`);

            // Load questions based on tab
            await loadAndDisplayQuestions(tabType);

            // Debug info for "My Questions" tab
            if (tabType === 'my-questions') {
                console.log('My Questions tab activated - running debug...');
                setTimeout(() => {
                    debugQuestionsDisplay();
                }, 1000);
            }
        });
    });

    // Search functionality
    if (questionsSearchBtn && questionsSearchInput) {
        questionsSearchBtn.addEventListener('click', () => {
            const searchTerm = questionsSearchInput.value.trim();
            if (searchTerm) {
                searchQuestions(searchTerm);
            } else {
                showNotification('Please enter a search term', 'warning');
            }
        });

        questionsSearchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const searchTerm = questionsSearchInput.value.trim();
                if (searchTerm) {
                    searchQuestions(searchTerm);
                } else {
                    showNotification('Please enter a search term', 'warning');
                }
            }
        });
    }

    // Load initial questions (All Questions tab)
    await loadAndDisplayQuestions('all');

    // Back button handler
    if (backToQuestionsBtn) {
        backToQuestionsBtn.addEventListener('click', () => {
            // unsubscribe realtime listener if active
            if (typeof window.questionDetailUnsubscribe === 'function') {
                try { window.questionDetailUnsubscribe(); } catch (e) { /* ignore */ }
                window.questionDetailUnsubscribe = null;
            }

            questionDetailView.style.display = 'none';
            questionsListView.style.display = 'block';
        });
    }

    // Answer question handlers
    if (answerQuestionBtn) {
        answerQuestionBtn.addEventListener('click', () => {
            if (!currentUser) {
                showNotification("Please log in to answer questions.", "warning");
                showModal(elements.loginModal);
                return;
            }
            answerFormContainer.style.display = 'block';
        });
    }

    if (cancelAnswerBtn) {
        cancelAnswerBtn.addEventListener('click', () => {
            answerFormContainer.style.display = 'none';
            answerText.value = '';
        });
    }

    console.log("Questions features initialized successfully");


}

const askQuestionBtn = document.getElementById("askQuestionBtn");

document.addEventListener("DOMContentLoaded", () => {
    const askQuestionBtn = document.getElementById("askQuestionBtn");
    if (askQuestionBtn) {
        askQuestionBtn.addEventListener("click", async () => {
            currentTab = "all";
            document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
            const allTabBtn = document.querySelector('.tab-btn[data-tab="all"]');
            if (allTabBtn) allTabBtn.classList.add("active");

            if (typeof loadAllQuestions === "function") {
                await loadAllQuestions();
            }

            openAskQuestionModal();
        });
    }
});

async function loadQuestionsIAnswered() {
    console.log("Loading My Answers...");

    if (!firebaseAuth.currentUser) {
        showNotification("Please log in to view your answers.", "warning");
        return [];
    }

    const user = firebaseAuth.currentUser;
    const container = document.getElementById("questionsContainer");
    container.innerHTML = `
    <div class="loading-state">
      <i class="fas fa-spinner fa-spin"></i>
      <p>Loading your answers...</p>
    </div>
  `;

    try {
        const answersRef = collection(firebaseDb, "answers");
        const q = query(answersRef, where("authorId", "==", user.uid));
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            container.innerHTML = `
        <div class="no-results">
          <i class="fas fa-comment-slash"></i>
          <p>You haven’t answered any questions yet.</p>
        </div>
      `;
            return []; // ✅ return empty array
        }

        container.innerHTML = "";

        const userAnswers = [];

        for (const docSnap of snapshot.docs) {
            const answerData = docSnap.data();
            userAnswers.push(answerData); // ✅ collect them

            const questionId = answerData.questionId;
            const answerText = answerData.content || "(No answer text)";
            const preview = answerText.length > 120 ? answerText.slice(0, 120) + "..." : answerText;

            // Try to get question title
            let questionTitle = "Answered Question";
            try {
                const questionSnap = await getDoc(doc(firebaseDb, "questions", questionId));
                if (questionSnap.exists()) {
                    questionTitle = questionSnap.data().title || questionTitle;
                }
            } catch (err) {
                console.warn("Couldn't fetch question:", err);
            }

            // Create clickable card
            const card = document.createElement("div");
            card.classList.add("paper-card");
            card.style.cursor = "pointer";
            card.innerHTML = `
        <h3 class="paper-title"><i class="fas fa-reply"></i> ${questionTitle}</h3>
        <p class="paper-abstract">${preview}</p>
        <div class="paper-meta">
          <span><i class="fas fa-clock"></i> ${new Date(answerData.createdAt).toLocaleString()}</span>
        </div>
      `;

            card.addEventListener("click", () => {
                openQuestionDetail(questionId);
            });

            container.appendChild(card);
        }

        return userAnswers; // ✅ return array instead of undefined

    } catch (error) {
        console.error("Error loading user's answers:", error);
        showNotification("Failed to load your answers: " + error.message, "error");
        return [];
    }
}

async function handleQuestionUpvote(questionId) {
    try {
        if (!firebaseAuth.currentUser) {
            showNotification("Please log in to upvote.", "warning");
            return;
        }

        const currentUserId = firebaseAuth.currentUser.uid;

        const questionRef = doc(firebaseDb, "questions", questionId);
        const questionDoc = await getDoc(questionRef);

        if (!questionDoc.exists()) {
            console.error("Question does not exist.");
            return;
        }

        const questionData = questionDoc.data();
        const questionAuthorId = questionData.authorId;
        const questionTitle = questionData.title || "your question";
        const hasUpvoted = questionData.upvotedBy?.includes(currentUserId);

        // TOGGLE UPVOTE (safely using a transaction so upvotes never go below 0)
        await runTransaction(firebaseDb, async (tx) => {
            const snapshot = await tx.get(questionRef);
            if (!snapshot.exists()) throw new Error('Question not found');

            const current = snapshot.data() || {};
            const upvotedByNow = current.upvotedBy || [];
            const upvotesNow = typeof current.upvotes === 'number' ? current.upvotes : 0;
            const already = upvotedByNow.includes(currentUserId);

            if (already) {
                // remove user, decrement but never go below 0
                const nextUpvotes = Math.max(0, upvotesNow - 1);
                const nextUpvotedBy = upvotedByNow.filter(uid => uid !== currentUserId);
                tx.update(questionRef, {
                    upvotes: nextUpvotes,
                    upvotedBy: nextUpvotedBy,
                    updatedAt: new Date().toISOString()
                });
            } else {
                // add user and increment
                const nextUpvotes = upvotesNow + 1;
                const nextUpvotedBy = [...upvotedByNow, currentUserId];
                tx.update(questionRef, {
                    upvotes: nextUpvotes,
                    upvotedBy: nextUpvotedBy,
                    updatedAt: new Date().toISOString()
                });
            }
        });

        // SEND NOTIF TO QUESTION AUTHOR ONLY WHEN UPVOTE WAS ADDED (not removed)
        if (!hasUpvoted && currentUserId !== questionAuthorId) {
            await createNotification(
                "Question Liked",
                `${firebaseAuth.currentUser.displayName || "Someone"} liked your question "${questionTitle}"`,
                questionAuthorId
            );
        }
        console.log("Upvote toggled successfully");

        // Apply targeted DOM updates instead of forcing a full view reload
        try {
            const refreshed = await getDoc(doc(firebaseDb, "questions", questionId));
            const fresh = refreshed.data() || {};

            // Update list elements (cards)
            const listEls = document.querySelectorAll(`.upvote-stat[data-id="${questionId}"]`);
            listEls.forEach(el => {
                const countEl = el.querySelector('.upvote-count');
                if (countEl) countEl.textContent = Math.max(0, fresh.upvotes || 0);
                const nowUp = (fresh.upvotedBy || []).includes(firebaseAuth.currentUser?.uid);
                if (nowUp) el.classList.add('active'); else el.classList.remove('active');
            });

            // Update detail view elements if present
            const qUpEl = document.getElementById('questionDetailUpvotes');
            if (qUpEl) qUpEl.textContent = Math.max(0, fresh.upvotes || 0);

            const upBtn = document.getElementById('upvoteQuestionBtn');
            if (upBtn) {
                const nowUp = (fresh.upvotedBy || []).includes(firebaseAuth.currentUser?.uid);
                upBtn.classList.add('btn-upvote');
                if (nowUp) upBtn.classList.add('active'); else upBtn.classList.remove('active');
                upBtn.innerHTML = `<i class="fas fa-thumbs-up"></i> <span id="questionDetailUpvotes">${Math.max(0, fresh.upvotes || 0)}</span>`;
            }
        } catch (e) {
            console.warn('Failed to apply targeted UI updates after handleQuestionUpvote:', e);
        }
    } catch (error) {
        console.error("Error toggling upvote:", error);
    }
}


// Attach listener in question detail view
document.addEventListener("DOMContentLoaded", () => {
    const upvoteBtn = document.getElementById("upvoteQuestionBtn");
    if (upvoteBtn) {
        upvoteBtn.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (window.currentQuestionId) {
                handleQuestionUpvote(window.currentQuestionId);
            } else {
                showNotification("No question selected.", "error");
            }
        });
    }
});


document.addEventListener("DOMContentLoaded", () => {
    if (elements.burgerMenuBtn)
        elements.burgerMenuBtn.addEventListener("click", toggleSidebar);

    if (elements.loginNavLink || elements.registerNavLink)
        attachNavLinkListeners();

    setupPasswordHelpers();
    initializePageFeatures();
});

document.addEventListener("DOMContentLoaded", () => {
    // Attach burger menu button listener safely
    const burgerMenuBtn = document.getElementById("burgerMenuBtn");
    if (burgerMenuBtn) {
        burgerMenuBtn.addEventListener("click", () => {
            const sidebar = document.getElementById("appSidebar");
            if (sidebar) {
                sidebar.classList.toggle("is-visible");
            }
        });
    }

    // Attach nav link listeners (login/register)
    attachNavLinkListeners();

    // Other features
    setupPasswordHelpers();
    initializePageFeatures();
});

// Load and display questions based on tab selection
async function loadAndDisplayQuestions(tabType) {
    const questionsContainer = document.getElementById('questionsContainer');

    if (!questionsContainer) return;

    // Show loading state
    questionsContainer.innerHTML = `
        <div class="loading-state">
            <i class="fas fa-spinner fa-spin"></i>
            <p>Loading ${getTabDisplayName(tabType)}...</p>
        </div>
    `;

    try {
        // detach any previous realtime listener for the questions list
        if (typeof window.questionsListUnsubscribe === 'function') {
            try { window.questionsListUnsubscribe(); } catch (e) { /* ignore */ }
            window.questionsListUnsubscribe = null;
        }
        let questions = [];

        console.log(`Loading questions for tab: ${tabType}`);

        if (tabType === 'all') {
            // For the main 'all' tab we subscribe to realtime updates so upvote counts update instantly
            if (firebaseDb) {
                const q = query(collection(firebaseDb, "questions"), orderBy("createdAt", "desc"));

                // initial load + realtime updates
                window.questionsListUnsubscribe = onSnapshot(q, (snap) => {
                    const live = [];
                    snap.forEach(docSnap => live.push({ id: docSnap.id, ...docSnap.data() }));
                    console.log('Realtime questions list update — rendering', live.length);
                    displayQuestions(live, tabType);
                }, (err) => {
                    console.warn('Realtime listener for questions list failed:', err);
                });

                // don't continue to getDocs fallback below; the listener will render results
                return;
            } else {
                questions = await loadAllQuestions();
            }
        } else if (tabType === 'my-questions') {
            // For my-questions we can also subscribe if user is logged in
            if (firebaseDb && currentUser) {
                const q = query(collection(firebaseDb, "questions"), where("authorId", "==", currentUser.uid), orderBy("createdAt", "desc"));
                window.questionsListUnsubscribe = onSnapshot(q, (snap) => {
                    const live = [];
                    snap.forEach(docSnap => live.push({ id: docSnap.id, ...docSnap.data() }));
                    console.log('Realtime my-questions update — rendering', live.length);
                    displayQuestions(live, tabType);
                }, (err) => {
                    console.warn('Realtime listener for my-questions failed:', err);
                });
                return;
            } else {
                questions = await loadMyQuestions();
            }
        } else if (tabType === 'my-answers') {
            questions = await loadQuestionsIAnswered();
        } else if (tabType === 'unanswered') {
            questions = await loadUnansweredQuestions();
        }

        console.log(`Displaying ${questions.length} questions for ${tabType}`);

        // Display questions
        displayQuestions(questions, tabType);

    } catch (error) {
        console.error('Error loading questions:', error);
        questionsContainer.innerHTML = `
            <div class="error-state">
                <i class="fas fa-exclamation-circle"></i>
                <p>Failed to load questions. Please try again.</p>
                <button class="btn btn-small" onclick="loadAndDisplayQuestions('${tabType}')" style="margin-top: 1rem;">
                    <i class="fas fa-redo"></i> Retry
                </button>
            </div>
        `;
    }
}

function getTabDisplayName(tabType) {
    const names = {
        'all': 'All Questions',
        'my-questions': 'Your Questions',
        'my-answers': 'Questions You Answered',
        'unanswered': 'Unanswered Questions'
    };
    return names[tabType] || 'questions';
}

// Load all questions
async function loadAllQuestions() {
    if (!firebaseDb) return [];

    try {
        const q = query(
            collection(firebaseDb, "questions"),
            orderBy("createdAt", "desc")
        );
        const querySnapshot = await getDocs(q);
        const questions = [];

        querySnapshot.forEach(doc => {
            questions.push({ id: doc.id, ...doc.data() });
        });

        console.log(`Loaded ${questions.length} total questions`);
        return questions;
    } catch (error) {
        console.error('Error loading all questions:', error);
        return [];
    }
}

// Load user's questions
async function loadMyQuestions() {
    if (!currentUser || !firebaseDb) {
        showNotification('Please log in to view your questions', 'warning');
        return [];
    }

    try {
        console.log('Loading questions for user:', currentUser.uid);

        const q = query(
            collection(firebaseDb, "questions"),
            where("authorId", "==", currentUser.uid),
            orderBy("createdAt", "desc")
        );
        const querySnapshot = await getDocs(q);
        const questions = [];

        querySnapshot.forEach(doc => {
            const questionData = doc.data();
            console.log('Found my question:', {
                id: doc.id,
                title: questionData.title,
                authorId: questionData.authorId,
                currentUser: currentUser.uid
            });
            questions.push({ id: doc.id, ...questionData });
        });

        console.log(`✅ Loaded ${questions.length} of your questions`);
        return questions;

    } catch (error) {
        console.error('❌ Error loading my questions:', error);

        // Fallback: load all questions and filter client-side
        try {
            const allQuestions = await loadAllQuestions();
            const myQuestions = allQuestions.filter(q =>
                q.authorId === currentUser.uid
            );
            console.log(`Fallback: Found ${myQuestions.length} questions for user`);
            return myQuestions;
        } catch (fallbackError) {
            console.error('Fallback also failed:', fallbackError);
            return [];
        }
    }
}

async function debugQuestionsDisplay() {
    console.log(' DEBUGGING QUESTIONS DISPLAY');
    console.log('Current user:', currentUser ? {
        uid: currentUser.uid,
        displayName: currentUser.displayName,
        email: currentUser.email
    } : 'No user');

    if (!firebaseDb) {
        console.error('Firestore not available');
        return;
    }

    try {
        // Load all questions to see what's in the database
        const allQuestionsQuery = query(collection(firebaseDb, "questions"));
        const allQuestionsSnapshot = await getDocs(allQuestionsQuery);

        console.log(`Total questions in database: ${allQuestionsSnapshot.size}`);

        allQuestionsSnapshot.forEach((doc, index) => {
            const data = doc.data();
            console.log(`Question ${index + 1}:`, {
                id: doc.id,
                title: data.title,
                authorId: data.authorId,
                authorName: data.authorName,
                isMine: data.authorId === currentUser?.uid
            });
        });

        // Test the my-questions query specifically
        if (currentUser) {
            const myQuestionsQuery = query(
                collection(firebaseDb, "questions"),
                where("authorId", "==", currentUser.uid)
            );
            const myQuestionsSnapshot = await getDocs(myQuestionsQuery);
            console.log(`Direct query found: ${myQuestionsSnapshot.size} questions for current user`);
        }

    } catch (error) {
        console.error('Debug error:', error);
    }
    console.log('=== END DEBUG ===');
}

// Load questions user has answered
async function loadAllAnswers() {
    if (!firebaseDb) return [];

    try {
        const q = query(collection(firebaseDb, "answers"));
        const querySnapshot = await getDocs(q);
        const answers = [];

        querySnapshot.forEach(doc => {
            answers.push({ id: doc.id, ...doc.data() });
        });

        return answers;
    } catch (error) {
        console.error('Error loading all answers:', error);
        return [];
    }
}

// Load unanswered questions
async function loadUnansweredQuestions() {
    if (!firebaseDb) return [];

    try {
        // Load all questions first
        const allQuestions = await loadAllQuestions();
        const unanswered = [];

        // Check if each question has responses
        for (const q of allQuestions) {
            const responsesRef = collection(firebaseDb, "questions", q.id, "responses");
            const snapshot = await getDocs(query(responsesRef, limit(1)));
            if (snapshot.empty) unanswered.push(q);
        }

        console.log(`✅ Found ${unanswered.length} unanswered questions`);
        return unanswered;
    } catch (error) {
        console.error("❌ Error loading unanswered questions:", error);
        return [];
    }
}

function displayQuestions(questions, tabType) {
    const questionsContainer = document.getElementById('questionsContainer');

    if (!questionsContainer) return;

    if (questions.length === 0) {
        let emptyMessage = 'No questions found.';
        let emptyDescription = '';
        let actionButton = '';

        if (tabType === 'my-questions') {
            emptyMessage = 'You haven\'t asked any questions yet.';
            emptyDescription = 'Be the first to start a discussion!';
            actionButton = `
                <button class="btn" onclick="showAskQuestionForm()" style="margin-top: 1rem;">
                    <i class="fas fa-plus"></i> Ask Your First Question
                </button>`;
        } else if (tabType === 'my-answers') {
            emptyMessage = 'You haven\'t answered any questions yet.';
            emptyDescription = 'Browse questions and share your knowledge!';
            actionButton = `
                <button class="browse-btn" onclick="switchToTab('all')" style="margin-top: 1rem;">
                    <i class="fas fa-search"></i> Browse Questions
                </button>`;
        } else if (tabType === 'unanswered') {
            emptyMessage = 'All questions have answers!';
            emptyDescription = 'Great job helping the community!';
            actionButton = `
                <button class="view-all-btn" onclick="switchToTab('all')" style="margin-top: 1rem;">
                    <i class="fas fa-eye"></i> View All Questions
                </button>`;
        } else {
            emptyMessage = 'No questions found.';
            emptyDescription = 'Be the first to ask a question!';
            actionButton = `
                <button class="btn" onclick="showAskQuestionForm()" style="margin-top: 1rem;">
                    <i class="fas fa-plus"></i> Ask a Question
                </button>`;
        }

        questionsContainer.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-inbox"></i>
                <h3>${emptyMessage}</h3>
                <p>${emptyDescription}</p>
                ${actionButton}
            </div>
        `;
        return;
    }

    questionsContainer.innerHTML = '';

    questions.forEach((question, index) => {
        const questionCard = document.createElement('div');
        questionCard.className = 'question-card';
        questionCard.style.animationDelay = `${index * 0.05}s`;

        const timeAgo = getTimeAgo(question.createdAt);
        const isOwnQuestion = currentUser && question.authorId === currentUser.uid;

        questionCard.innerHTML = `
            <div class="question-card-header">
                <h3>${question.title}</h3>
                ${question.category ? `<span class="category-badge">${question.category}</span>` : ''}
            </div>
            <div class="question-card-meta">
                <span class="author"><i class="fas fa-user"></i> ${question.authorName}</span>
                <span class="date"><i class="fas fa-clock"></i> ${timeAgo}</span>
                ${tabType === 'my-answers' ? '<span class="tag" style="background: #10b981; color: white;"><i class="fas fa-check"></i> You answered this</span>' : ''}
                ${isOwnQuestion ? '<span class="tag" style="background: #5b21b6; color: white;"><i class="fas fa-star"></i> Your question</span>' : ''}
            </div>
            <p class="question-card-text">${question.details.substring(0, 150)}${question.details.length > 150 ? '...' : ''}</p>
            ${question.tags && question.tags.length > 0 ? `
                <div class="question-card-tags">
                    ${question.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}
                </div>
            ` : ''}
            <div class="question-card-stats">
                <span class="stat"><i class="fas fa-eye"></i> ${question.views || 0}</span>
                ${(function () {
                const hasUpvoted = currentUser && Array.isArray(question.upvotedBy) && question.upvotedBy.includes(currentUser.uid);
                const icon = 'fas'; // always use solid icon to avoid missing/hidden icons
                const activeClass = hasUpvoted ? ' active' : '';
                return `<span class="stat upvote-stat${activeClass}" data-action="upvote" data-id="${question.id}"><i class="${icon} fa-thumbs-up"></i> <span class="upvote-count" data-id="${question.id}">${Math.max(0, question.upvotes || 0)}</span></span>`;
            })()}
                <span class="stat comment-stat" data-action="comments" data-id="${question.id}"><i class="fas fa-comments"></i> <span id="answer-count-${question.id}">...</span></span>
            </div>
            <div class="question-card-actions">
                <button class="btn-small btn-primary" onclick="viewQuestionDetail('${question.id}')">
                    <i class="fas fa-eye"></i> View Details
                </button>
                <button class="btn-small btn-secondary" onclick="answerQuestionQuick('${question.id}')">
                    <i class="fas fa-reply"></i> Answer
                </button>
                ${isOwnQuestion ? `
                    <button class="btn-small btn-danger" onclick="deleteQuestion('${question.id}')">
                        <i class="fas fa-trash"></i> Delete
                    </button>
                ` : ''}
            </div>
        `;

        questionsContainer.appendChild(questionCard);

        // Load answer count asynchronously
        getAnswerCount(question.id).then(count => {
            const countElement = document.getElementById(`answer-count-${question.id}`);
            if (countElement) {
                countElement.textContent = count;
            }
        });
    });

    // Attach delegated click handler for upvote/comment stats (idempotent)
    if (!questionsContainer.__stat_listener_attached) {
        questionsContainer.addEventListener('click', async (ev) => {
            const up = ev.target.closest('.upvote-stat');
            const comment = ev.target.closest('.comment-stat');

            if (up) {
                ev.preventDefault();
                ev.stopPropagation();
                const questionId = up.dataset.id;

                // Prevent clicking when no user
                if (!currentUser) {
                    showNotification('Please log in to upvote', 'warning');
                    if (elements && elements.loginModal) showModal(elements.loginModal);
                    return;
                }

                // Optimistic UI update
                try {
                    const countEl = up.querySelector('.upvote-count');
                    const currentlyActive = up.classList.contains('active');
                    let currentCount = parseInt(countEl?.textContent || '0', 10) || 0;

                    if (currentlyActive) {
                        up.classList.remove('active');
                        const nextCount = Math.max(0, currentCount - 1);
                        // update the inner HTML to a stable structure (keeps icon visible)
                        up.innerHTML = `<i class="fas fa-thumbs-up"></i> <span class="upvote-count" data-id="${questionId}">${nextCount}</span>`;
                    } else {
                        up.classList.add('active');
                        const nextCount = currentCount + 1;
                        up.innerHTML = `<i class="fas fa-thumbs-up"></i> <span class="upvote-count" data-id="${questionId}">${nextCount}</span>`;
                    }
                } catch (_) { }

                // perform DB toggle
                try {
                    await toggleUpvote(questionId, 'question');
                } catch (err) {
                    console.error('Upvote toggle failed:', err);
                    showNotification('Failed to toggle upvote', 'error');
                }
                return;
            }

            if (comment) {
                ev.preventDefault();
                ev.stopPropagation();
                const questionId = comment.dataset.id;

                // Navigate to detail view and open the answer form (or quick answer) directly
                try {
                    // if user isn't logged in, ask them to login first
                    if (!currentUser) {
                        showNotification('Please log in to leave an answer', 'warning');
                        if (elements && elements.loginModal) showModal(elements.loginModal);
                        return;
                    }

                    if (typeof openQuestionDetail === 'function') {
                        await openQuestionDetail(questionId);

                        // show the inline answer form if present
                        const answerForm = document.getElementById('answerFormContainer');
                        const textarea = document.getElementById('answerText');
                        if (answerForm) {
                            answerForm.style.display = 'block';
                            setTimeout(() => { if (textarea) textarea.focus(); }, 250);
                        } else {
                            // fallback to quick answer modal
                            if (typeof showAnswerModal === 'function') showAnswerModal(questionId);
                        }
                    } else {
                        viewQuestionDetail(questionId);
                        setTimeout(() => {
                            const answerForm = document.getElementById('answerFormContainer');
                            const textarea = document.getElementById('answerText');
                            if (answerForm) {
                                answerForm.style.display = 'block';
                                if (textarea) textarea.focus();
                            } else if (typeof showAnswerModal === 'function') {
                                showAnswerModal(questionId);
                            }
                        }, 500);
                    }
                } catch (err) {
                    console.error('Failed to open question detail for comments click:', err);
                }

                return;
            }
        });

        questionsContainer.__stat_listener_attached = true;
    }
}

// Helper function to switch tabs programmatically
function switchToTab(tabType) {
    const tabButtons = document.querySelectorAll('.filter-tabs .tab-btn');
    tabButtons.forEach(btn => {
        if (btn.dataset.tab === tabType) {
            btn.click();
        }
    });
}

window.switchToTab = switchToTab;

let currentTab = "all";

document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        const tab = btn.dataset.tab;

        currentTab = tab;

        if (tab === "my-answers") {
            loadMyAnswers();
        } else if (tab === "my-questions") {
            loadMyQuestions();
        } else if (tab === "unanswered") {
            loadUnansweredQuestions();
        } else {
            loadAllQuestions();
        }
    });
});


async function debugQuestionData() {
    console.log('=== DEBUGGING QUESTION DATA ===');
    console.log('Current user:', currentUser ? {
        uid: currentUser.uid,
        displayName: currentUser.displayName,
        email: currentUser.email
    } : 'No user');

    if (!firebaseDb) {
        console.error('Firestore not available');
        return;
    }

    try {
        // Check all questions
        const allQuestions = await loadAllQuestions();
        console.log(`Total questions in database: ${allQuestions.length}`);

        // Check user's questions
        const myQuestions = allQuestions.filter(q => q.authorId === currentUser?.uid);
        console.log(`Questions asked by current user: ${myQuestions.length}`);

        // Check user's answers
        const allAnswers = await loadAllAnswers();
        const userAnswers = allAnswers.filter(a => a.authorId === currentUser?.uid);
        console.log(`Answers by current user: ${userAnswers.length}`);

        const answeredQuestionIds = [...new Set(userAnswers.map(a => a.questionId))];
        const answeredQuestions = allQuestions.filter(q => answeredQuestionIds.includes(q.id));
        console.log(`Questions answered by current user: ${answeredQuestions.length}`);

        // Show detailed info
        console.log('My Questions:', myQuestions.map(q => ({ id: q.id, title: q.title })));
        console.log('Questions I Answered:', answeredQuestions.map(q => ({ id: q.id, title: q.title })));

    } catch (error) {
        console.error('Debug error:', error);
    }
    console.log('=== END DEBUG ===');
}

// Make it available globally for testing
window.debugQuestionData = debugQuestionData;

// Search questions
async function searchQuestions(searchTerm) {
    const questionsContainer = document.getElementById('questionsContainer');

    questionsContainer.innerHTML = `
        <div class="loading-state">
            <i class="fas fa-spinner fa-spin"></i>
            <p>Searching...</p>
        </div>
    `;

    try {
        const allQuestions = await loadAllQuestions();

        const searchTermLower = searchTerm.toLowerCase();
        const filteredQuestions = allQuestions.filter(q =>
            q.title.toLowerCase().includes(searchTermLower) ||
            q.details.toLowerCase().includes(searchTermLower) ||
            (q.tags && q.tags.some(tag => tag.toLowerCase().includes(searchTermLower))) ||
            (q.category && q.category.toLowerCase().includes(searchTermLower))
        );

        if (filteredQuestions.length === 0) {
            questionsContainer.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-search"></i>
                    <h3>No results found for "${searchTerm}"</h3>
                    <p>Try different keywords or check your spelling</p>
                </div>
            `;
        } else {
            showNotification(`Found ${filteredQuestions.length} result${filteredQuestions.length !== 1 ? 's' : ''}`, 'success');
            displayQuestions(filteredQuestions, 'search');
        }
    } catch (error) {
        console.error('Error searching questions:', error);
        showNotification('Search failed. Please try again.', 'error');
    }
}

// View question details (from "View Details" button)
window.viewQuestionDetail = async function (questionId) {
    console.log("Loading question:", questionId);
    window.currentQuestionId = questionId;

    try {
        const questionRef = doc(firebaseDb, "questions", questionId);
        const questionSnap = await getDoc(questionRef);

        if (!questionSnap.exists()) {
            showNotification("Question not found!", "error");
            return;
        }

        const q = questionSnap.data();

        // Handle timestamp safely
        let updatedViews = q.views || 0;

        // Handle view count (one per user)
        if (currentUser) {
            const userId = currentUser.uid;
            const viewedBy = q.viewedBy || [];

            if (!viewedBy.includes(userId)) {
                await updateDoc(questionRef, {
                    views: increment(1),
                    viewedBy: arrayUnion(userId)
                });
                updatedViews += 1;
            }
        }

        // Update view count in UI
        el("questionDetailViews").textContent = updatedViews;

        // Populate title, author, category, text, tags
        questionDetailTitle.textContent = q.title || "";
        questionDetailAuthor.textContent = q.authorName || "Anonymous";
        questionDetailCategory.textContent = q.category || "";
        questionDetailText.textContent = q.details || "";
        questionDetailTags.innerHTML = (q.tags || [])
            .map(t => `<span class="tag">${escapeHtml(t)}</span>`)
            .join("");

        // Convert Firestore Timestamp / number / Date to actual Date
        let createdDate;
        if (q.createdAt?.toDate) {
            createdDate = q.createdAt.toDate();
        } else if (typeof q.createdAt === "number") {
            createdDate = new Date(q.createdAt);
        } else {
            createdDate = q.createdAt ? new Date(q.createdAt) : null;
        }

        if (createdDate) {
            // Relative time under title (e.g., "3 hours ago")
            questionDetailDate.textContent = getTimeAgo(q.createdAt);

            // Full timestamp in "Asked on ..."
            const fullDate = createdDate.toLocaleString();
            const askedOnEl = el("questionDetailDateSmall");
            if (askedOnEl) {
                askedOnEl.textContent = fullDate;
            }
        } else {
            questionDetailDate.textContent = "";
            const askedOnEl = el("questionDetailDateSmall");
            if (askedOnEl) {
                askedOnEl.textContent = "";
            }
        }

        // Get real answer count from Firestore
        try {
            const responsesRef = collection(firebaseDb, "questions", questionId, "responses");
            const rSnap = await getDocs(responsesRef);
            el("questionDetailAnswers").textContent = rSnap.size;
        } catch (err) {
            console.warn("Failed to compute real answer count:", err);
            el("questionDetailAnswers").textContent = q.answers || 0;
        }

        // Upvotes - check if current user has upvoted
        const upvotedBy = q.upvotedBy || [];
        const hasUpvoted = currentUser && upvotedBy.includes(currentUser.uid);

        console.log("🔍 Looking for upvote button...");
        const upvoteBtn = document.getElementById("upvoteQuestionBtn");
        console.log("Upvote button element:", upvoteBtn);

        el("questionDetailUpvotes").textContent = Math.max(0, q.upvotes || 0);

        if (upvoteBtn) {
            console.log("✅ Upvote button found, attaching handler");
            // Ensure the button uses the project's upvote styling
            upvoteBtn.classList.add('btn-upvote');

            // Update button appearance based on upvote status
            if (hasUpvoted) {
                upvoteBtn.classList.add('active');
                upvoteBtn.innerHTML = `<i class="fas fa-thumbs-up"></i> <span id="questionDetailUpvotes">${Math.max(0, q.upvotes || 0)}</span>`;
            } else {
                upvoteBtn.classList.remove('active');
                upvoteBtn.innerHTML = `<i class="fas fa-thumbs-up"></i> <span id="questionDetailUpvotes">${Math.max(0, q.upvotes || 0)}</span>`;
            }

            // Attach a click handler that applies optimistic UI updates while performing the toggle
            upvoteBtn.onclick = function (e) {
                e.preventDefault();
                e.stopPropagation();

                // optimistic toggle for snappy UI
                try {
                    const countEl = document.getElementById('questionDetailUpvotes');
                    const currentCount = parseInt(countEl?.textContent || '0', 10) || 0;
                    const currentlyActive = upvoteBtn.classList.contains('active');

                    if (currentlyActive) {
                        upvoteBtn.classList.remove('active');
                        if (countEl) countEl.textContent = Math.max(0, currentCount - 1);
                        upvoteBtn.innerHTML = `<i class="fas fa-thumbs-up"></i> <span id="questionDetailUpvotes">${Math.max(0, currentCount - 1)}</span>`;
                    } else {
                        upvoteBtn.classList.add('active');
                        if (countEl) countEl.textContent = currentCount + 1;
                        upvoteBtn.innerHTML = `<i class="fas fa-thumbs-up"></i> <span id="questionDetailUpvotes">${currentCount + 1}</span>`;
                    }
                } catch (e) {/* ignore optimistic UI errors */ }

                handleQuestionUpvote(questionId).catch(err => console.error("Error in toggle:", err));
                return false;
            };

            console.log("Handler attached, onclick is:", upvoteBtn.onclick);
        } else {
            console.warn("⚠️ Upvote button not found in DOM");
        }

        // Share button functionality
        console.log("🔍 Looking for share button...");
        const shareBtn = document.getElementById("shareQuestionBtn");
        console.log("Share button element:", shareBtn);

        if (shareBtn) {
            console.log("✅ Share button found, attaching handler");
            // Test: Add inline onclick first
            shareBtn.onclick = function (e) {
                console.log("🎯 SHARE BUTTON CLICKED (inline)!", e);
                e.preventDefault();
                e.stopPropagation();
                shareQuestion(questionId, q.title);
                return false;
            };

            console.log("Handler attached, onclick is:", shareBtn.onclick);
        } else {
            console.warn("⚠️ Share button not found in DOM");
        }

        // Show the detail view
        questionsListView.style.display = "none";
        questionDetailView.style.display = "block";

        //Load responses
        if (typeof loadQuestionResponses === "function") {
            loadQuestionResponses(questionId);
        }

        // Store global for submitAnswer
        window.currentQuestionId = questionId;

    } catch (error) {
        console.error("openQuestionDetail error:", error);
        showNotification("Error loading question", "error");
    }
};

// Load all answers written by the current user
async function loadMyAnswers() {
    if (!currentUser || !firebaseDb) {
        showNotification("Please log in to view your answers.", "warning");
        return;
    }

    const container = document.getElementById("questionsContainer");
    container.innerHTML = `
    <div class="loading-state">
      <i class="fas fa-spinner fa-spin"></i>
      <p>Loading your answers...</p>
    </div>
  `;

    try {
        const questionsRef = collection(firebaseDb, "questions");
        const questionSnap = await getDocs(questionsRef);

        if (questionSnap.empty) {
            container.innerHTML = `
        <div class="no-results">
          <i class="fas fa-comment-slash"></i>
          <p>No questions found in the database.</p>
        </div>
      `;
            return;
        }

        // We'll gather all matching answers first, then display them.
        const cards = [];

        for (const questionDoc of questionSnap.docs) {
            const questionId = questionDoc.id;
            const questionData = questionDoc.data();

            // Subcollection path
            const responsesRef = collection(firebaseDb, `questions/${questionId}/responses`);
            const q = query(responsesRef, where("authorId", "==", currentUser.uid));
            const responsesSnap = await getDocs(q);

            // Skip if user didn't answer this question
            if (responsesSnap.empty) continue;

            for (const respDoc of responsesSnap.docs) {
                const responseData = respDoc.data();
                const answerText = responseData.text || "(No content)";
                const createdAt = responseData.createdAt?.toDate
                    ? responseData.createdAt.toDate()
                    : new Date();

                // Build a card element
                const card = document.createElement("div");
                card.className = "question-card";
                card.style.cursor = "pointer";
                card.innerHTML = `
          <h3>${questionData.title}</h3>
          <div style="border-left:3px solid #3b82f6;padding-left:0.75rem;margin-bottom:0.5rem;">
            <strong style="color:#111827;">Your Answer:</strong>
            <p style="margin:0.3rem 0;color:#374151;">${answerText.substring(0, 200)}...</p>
          </div>
          <button class="btn-small btn-danger answer-delete-btn"
    style="padding:6px 10px; font-size:0.8rem; color: white; display:inline-flex; align-items:center; gap:6px; border-radius:6px; margin-top:0.5rem;"
    onclick="deleteAnswer('${questionId}', '${respDoc.id}')">
    <i class="fas fa-trash"></i> Delete
</button>
          <div style="font-size:0.9rem;color:#6b7280;">
            <i class="fas fa-clock"></i> Answered on ${createdAt.toLocaleString()}
          </div>
        `;
                card.addEventListener("click", () => openQuestionDetail(questionId));
                cards.push(card);
            }
        }

        // Now that we’re done gathering, decide what to render
        if (cards.length > 0) {
            container.innerHTML = "";
            cards.forEach(card => container.appendChild(card));
        } else {
            container.innerHTML = `
        <div class="no-results">
          <i class="fas fa-comment-slash"></i>
          <p>You haven’t answered any questions yet.</p>
        </div>
      `;
        }

    } catch (error) {
        console.error("Error loading user's answers:", error);
        showNotification("Failed to load your answers.", "error");
        container.innerHTML = `
      <div class="error-message">
        <p><i class="fas fa-exclamation-circle"></i> Error loading answers</p>
      </div>
    `;
    }
}

// 💬 LOAD QUESTION RESPONSES

function loadQuestionResponses(questionId) {
    const answersList = document.getElementById("answersList");
    answersList.innerHTML = `
        <div class="loading-state">
            <i class="fas fa-spinner fa-spin"></i>
            <p>Loading answers...</p>
        </div>
    `;

    const responsesRef = collection(firebaseDb, "questions", questionId, "responses");

    onSnapshot(
        responsesRef,
        (snapshot) => {
            answersList.innerHTML = "";

            if (snapshot.empty) {
                answersList.innerHTML = `
                    <div class="no-answers">
                        <i class="fas fa-comment-slash"></i>
                        <p>No answers yet. Be the first to answer!</p>
                    </div>
                `;
                return;
            }

            snapshot.forEach((docSnap) => {
                const answer = docSnap.data();
                const answerEl = document.createElement("div");
                answerEl.classList.add("answer-card");

                const createdDate = answer.createdAt?.toDate
                    ? answer.createdAt.toDate()
                    : new Date(answer.createdAt);

                const timeAgoStr = getTimeAgo(createdDate);

                const isMyAnswer = currentUser && answer.authorId === currentUser.uid;

                answerEl.innerHTML = `
    <div class="answer-meta">
        <strong>${answer.authorName || "Anonymous"}</strong> • 
        <small>${timeAgoStr}</small>

        ${isMyAnswer ? `
    <button class="btn-small btn-danger answer-delete-btn"
        style="padding:4px 8px; font-size:0.75rem; display:inline-flex; align-items:center; gap:6px; border-radius:6px;"
        onclick="deleteAnswer('${questionId}', '${docSnap.id}')">
        <i class="fas fa-trash"></i> Delete
    </button>
` : ""}

    <p>${answer.text}</p>
`;


                answersList.appendChild(answerEl);
            });
        },
        (error) => {
            console.error("Error loading answers:", error);
            answersList.innerHTML = `
                <div class="error-state">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>Failed to load answers.</p>
                </div>
            `;
        }
    );
}

// Submit answer function
window.submitAnswer = async function (questionId) {
    console.log("submitAnswer called", { questionId, currentUser });
    console.log("submitAnswer called with ID:", questionId);

    try {
        // sanity checks
        if (!questionId && window.currentQuestionId) questionId = window.currentQuestionId;
        if (!questionId) {
            console.error("submitAnswer: missing questionId");
            showNotification("Internal error: missing question id", "error");
            return;
        }

        if (!firebaseDb) {
            console.error("submitAnswer: firebaseDb not initialized");
            showNotification("Database not ready. Try again.", "error");
            return;
        }

        if (!currentUser) {
            showNotification("Please log in to post an answer.", "warning");
            if (elements && elements.loginModal) showModal(elements.loginModal);
            return;
        }

        // grab textarea from detail view
        const textarea = document.getElementById("answerText");
        if (!textarea) {
            console.error("submitAnswer: answerText element not found");
            showNotification("UI error: answer box not found", "error");
            return;
        }

        const text = textarea.value.trim();
        if (!text) {
            showNotification("Please write an answer before submitting.", "warning");
            textarea.focus();
            return;
        }

        // disable UI while posting
        const submitBtn = document.getElementById("submitAnswerBtn");
        const originalHTML = submitBtn ? submitBtn.innerHTML : null;
        if (submitBtn) {
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Posting...';
            submitBtn.disabled = true;
        }

        console.log("submitAnswer: posting to firestore", { questionId, text });

        // build payload using serverTimestamp
        const payload = {
            text,
            authorId: currentUser.uid,
            authorName: currentUser.displayName || currentUser.email || "Anonymous",
            upvotes: 0,
            upvotedBy: [],
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        };

        // write to subcollection /questions/{questionId}/responses
        const responsesRef = collection(firebaseDb, "questions", questionId, "responses");
        await addDoc(responsesRef, payload);
        console.log("submitAnswer: response doc added");

        // increment answer count on parent question (atomic)
        const questionRef = doc(firebaseDb, "questions", questionId);
        await updateDoc(questionRef, { answers: increment(1), updatedAt: serverTimestamp() });
        console.log("submitAnswer: incremented parent question answers count");

        // success UI
        textarea.value = "";
        showNotification("Answer posted successfully!", "success");

        // refresh answers list if we are on the detail view
        if (typeof loadQuestionResponses === "function") {
            try {
                await loadQuestionResponses(questionId);
            } catch (err) {
                console.warn("submitAnswer: loadQuestionResponses threw:", err);
            }
        }

        // update answer count UI if present
        const detailCountEl = document.getElementById("questionDetailAnswers");
        if (detailCountEl) {
            // attempt to read the latest value from firestore
            try {
                const qSnap = await getDoc(questionRef);
                const qData = qSnap.exists() ? qSnap.data() : null;
                detailCountEl.textContent = qData && typeof qData.answers !== "undefined" ? qData.answers : "…";
            } catch (err) {
                console.warn("submitAnswer: failed to refresh detail answer count", err);
            }
        }

        // also update question-list count element if visible
        const listCountEl = document.getElementById(`answer-count-${questionId}`);
        if (listCountEl && typeof getAnswerCount === "function") {
            try {
                const newCount = await getAnswerCount(questionId);
                listCountEl.textContent = newCount;
            } catch (err) {
                console.warn("submitAnswer: getAnswerCount failed", err);
            }
        }

    } catch (error) {
        console.error("submitAnswer error:", error);
        showNotification("Failed to post answer. " + (error.message || ""), "error");
    } finally {
        const submitBtn = document.getElementById("submitAnswerBtn");
        if (submitBtn) {
            submitBtn.disabled = false;
            if (submitBtn.innerHTML && submitBtn.innerHTML.includes("Posting")) {
                submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Post Answer';
            }
        }
    }

    await createNotification(
        "New Answer",
        `${currentUser.displayName || "Someone"} answered your question "${questionTitle}"`,
        questionAuthorId
    );
};

// Toggle the inline answer form inside the Question Detail view
window.toggleAnswerForm = function () {
    const form = document.getElementById("answerFormContainer");
    if (!form) return;

    if (form.style.display === "none" || form.style.display === "") {
        form.style.display = "block";
        const textarea = form.querySelector("#answerText");
        if (textarea) textarea.focus();
    } else {
        form.style.display = "none";
    }
};

function showDeleteAnswerModal(questionId, answerId) {
    // Remove existing modal if any
    const existingModal = document.getElementById('deleteAnswerConfirmModal');
    if (existingModal) {
        existingModal.remove();
    }

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'deleteAnswerConfirmModal';
    modal.innerHTML = `
        <div class="modal-content">
            <button class="close-modal-btn" type="button" id="closeDeleteAnswerModal">&times;</button>
            <div class="modal-icon">
                <i class="fas fa-exclamation-triangle" style="color: #dc2626;"></i>
            </div>
            <h2 class="modal-title">Delete Answer</h2>
            <p>Are you sure you want to delete this answer? This action cannot be undone.</p>
            <div class="modal-actions">
                <button type="button" class="btn btn-secondary" id="cancelDeleteAnswer">Cancel</button>
                <button type="button" class="btn btn-danger" id="confirmDeleteAnswer">Delete</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    modal.style.display = 'flex';
    setTimeout(() => modal.classList.add('is-visible'), 10);

    // Close modal
    function closeDeleteAnswerModal() {
        modal.classList.remove('is-visible');
        // hide immediately to avoid leftover inline `display:flex` keeping the wrapper visible
        modal.style.display = 'none';
        setTimeout(() => modal.remove(), 300);
    }

    // Close button
    document.getElementById('closeDeleteAnswerModal').onclick = (e) => {
        e.stopPropagation();
        closeDeleteAnswerModal();
    };

    // Cancel button
    document.getElementById('cancelDeleteAnswer').onclick = (e) => {
        e.stopPropagation();
        closeDeleteAnswerModal();
    };

    // Confirm delete handler
    document.getElementById('confirmDeleteAnswer').onclick = async (e) => {
        e.stopPropagation();
        await confirmDeleteAnswer(questionId, answerId);
        closeDeleteAnswerModal();
    };

    // Click outside to close
    modal.onclick = (e) => {
        if (e.target === modal) closeDeleteAnswerModal();
    };

    // Prevent inner clicks from closing
    modal.querySelector('.modal-content').onclick = (e) => e.stopPropagation();
}

// Global helper so inline handlers like `onclick="deleteAnswer(qId, aId)"` work
window.deleteAnswer = function (questionId, answerId) {
    if (!questionId || !answerId) return;
    showDeleteAnswerModal(questionId, answerId);
};

async function confirmDeleteAnswer(questionId, answerId) {
    try {
        await deleteDoc(doc(firebaseDb, "questions", questionId, "responses", answerId));

        const questionRef = doc(firebaseDb, "questions", questionId);
        await updateDoc(questionRef, { answers: increment(-1) });

        showNotification("Answer deleted successfully!", "success");

        if (typeof loadQuestionResponses === "function") {
            loadQuestionResponses(questionId);
        }

        const detailCountEl = document.getElementById("questionDetailAnswers");
        if (detailCountEl) {
            const snap = await getDoc(questionRef);
            if (snap.exists()) {
                detailCountEl.textContent = snap.data().answers;
            }
        }

        const listCountEl = document.getElementById(`answer-count-${questionId}`);
        if (listCountEl) {
            const newCount = await getAnswerCount(questionId);
            listCountEl.textContent = newCount;
        }

        if (currentTab === "my-answers" && typeof loadMyAnswers === "function") {
            loadMyAnswers();
        }

    } catch (error) {
        console.error("Error deleting answer:", error);
        showNotification("Failed to delete answer.", "error");
    }
}


// 💬 QUICK ANSWER MODAL SYSTEM
function answerQuestionQuick(questionId) {
    if (!currentUser) {
        showNotification("Please log in to answer questions", "warning");
        if (elements && elements.loginModal) showModal(elements.loginModal);
        return;
    }

    console.log("🟣 Opening Quick Answer modal for question:", questionId);

    // Create modal dynamically
    const modal = document.createElement("div");
    modal.classList.add("question-modal", "is-visible");
    modal.innerHTML = `
        <div class="question-modal-content">
            <h3><i class="fas fa-reply"></i> Quick Answer</h3>
            <textarea id="quickAnswerText" class="form-textarea" rows="5" placeholder="Write your answer..."></textarea>
            <div class="modal-actions" style="margin-top: 1.5rem;">
                <button class="btn btn-secondary" id="cancelQuickAnswer">Cancel</button>
                <button class="btn" id="submitQuickAnswer">
                    <i class="fas fa-paper-plane"></i> Submit
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    // Close modal logic
    const closeModal = () => {
        modal.classList.remove("is-visible");
        setTimeout(() => modal.remove(), 200);
    };

    modal.querySelector("#cancelQuickAnswer").onclick = closeModal;

    // Submit logic
    modal.querySelector("#submitQuickAnswer").onclick = async () => {
        const text = modal.querySelector("#quickAnswerText").value.trim();
        if (!text) {
            showNotification("Please type an answer before submitting.", "warning");
            return;
        }

        try {
            console.log(`📝 Submitting answer for question ${questionId}:`, text);

            const responsesRef = collection(firebaseDb, "questions", questionId, "responses");
            const payload = {
                text,
                authorId: currentUser.uid,
                authorName: currentUser.displayName || currentUser.email || "Anonymous",
                upvotes: 0,
                upvotedBy: [],
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            };

            await addDoc(responsesRef, payload);

            // Update answer count on parent question
            const questionRef = doc(firebaseDb, "questions", questionId);
            await updateDoc(questionRef, { answers: increment(1) });

            showNotification("Answer submitted successfully!", "success");
            closeModal();

            // Optional refresh for visible count
            const countEl = document.getElementById(`answer-count-${questionId}`);
            if (countEl && typeof getAnswerCount === "function") {
                const count = await getAnswerCount(questionId);
                countEl.textContent = count;
            }

        } catch (err) {
            console.error("❌ Error submitting answer:", err);
            showNotification("Failed to submit answer. Try again.", "error");
        }
    };
}


// 🗑️ DELETE QUESTION
async function deleteQuestion(questionId) {
    if (!currentUser || !firebaseDb) return;

    // Show delete confirmation modal
    showDeleteQuestionModal(questionId);
}

// Show delete question modal
function showDeleteQuestionModal(questionId) {
    // Remove existing modal if any
    const existingModal = document.getElementById('deleteQuestionConfirmModal');
    if (existingModal) {
        existingModal.remove();
    }

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'deleteQuestionConfirmModal';
    modal.innerHTML = `
        <div class="modal-content">
            <button class="close-modal-btn" type="button" id="closeDeleteQuestionModal">&times;</button>
            <div class="modal-icon">
                <i class="fas fa-exclamation-triangle" style="color: #dc2626;"></i>
            </div>
            <h2 class="modal-title">Delete Question</h2>
            <p>Are you sure you want to delete this question? This action cannot be undone and will also delete all answers.</p>
            <div class="modal-actions">
                <button type="button" class="btn btn-secondary" id="cancelDeleteQuestion">Cancel</button>
                <button type="button" class="btn btn-danger" id="confirmDeleteQuestion">Delete</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    modal.style.display = 'flex';
    setTimeout(() => modal.classList.add('is-visible'), 10);

    // Close button handler
    const closeBtn = document.getElementById('closeDeleteQuestionModal');
    closeBtn.onclick = function (e) {
        e.stopPropagation();
        closeDeleteQuestionModal();
    };

    // Cancel button handler
    const cancelBtn = document.getElementById('cancelDeleteQuestion');
    cancelBtn.onclick = function (e) {
        e.stopPropagation();
        closeDeleteQuestionModal();
    };

    // Confirm delete button handler
    const confirmBtn = document.getElementById('confirmDeleteQuestion');
    confirmBtn.onclick = async function (e) {
        e.stopPropagation();
        await confirmDeleteQuestion(questionId);
    };

    // Click outside to close
    modal.onclick = function (e) {
        if (e.target === modal) {
            closeDeleteQuestionModal();
        }
    };

    // Prevent clicks inside modal content from closing
    const modalContent = modal.querySelector('.modal-content');
    modalContent.onclick = function (e) {
        e.stopPropagation();
    };
}

// Close delete question modal
function closeDeleteQuestionModal() {
    const modal = document.getElementById('deleteQuestionConfirmModal');
    if (modal) {
        modal.classList.remove('is-visible');
        modal.style.display = 'none';
        setTimeout(() => {
            modal.remove();
        }, 300);
    }
}

// Confirm question deletion
async function confirmDeleteQuestion(questionId) {
    const confirmBtn = document.getElementById('confirmDeleteQuestion');
    const originalHTML = confirmBtn.innerHTML;

    try {
        // Show loading state
        confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Deleting...';
        confirmBtn.disabled = true;

        await deleteDoc(doc(firebaseDb, "questions", questionId));
        showNotification("Question deleted successfully", "success");

        closeDeleteQuestionModal();

        // Reload current tab
        const activeTab = document.querySelector(".filter-tabs .tab-btn.active");
        if (activeTab) {
            await loadAndDisplayQuestions(activeTab.dataset.tab);
        }
    } catch (error) {
        console.error("Error deleting question:", error);
        showNotification("Failed to delete question", "error");

        // Restore button
        confirmBtn.innerHTML = originalHTML;
        confirmBtn.disabled = false;
    }
}

// 📊 GET ANSWER COUNT
async function getAnswerCount(questionId) {
    try {
        const responsesRef = collection(firebaseDb, "questions", questionId, "responses");
        const snapshot = await getDocs(responsesRef);
        return snapshot.size;
    } catch (error) {
        console.error("Error fetching answer count:", error);
        return 0;
    }
}

// 🔄 EXPORTS
window.loadAndDisplayQuestions = loadAndDisplayQuestions;
window.viewQuestionDetail = viewQuestionDetail;
window.answerQuestionQuick = answerQuestionQuick;
window.deleteQuestion = deleteQuestion;
window.searchQuestions = searchQuestions;


// 🕓 TIME AGO UTILITY
function getTimeAgo(timestamp) {
    if (!timestamp) return "Just now";

    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);

    const intervals = {
        year: 31536000,
        month: 2592000,
        week: 604800,
        day: 86400,
        hour: 3600,
        minute: 60,
        second: 1,
    };

    for (const [unit, secondsInUnit] of Object.entries(intervals)) {
        const interval = Math.floor(seconds / secondsInUnit);
        if (interval >= 1) {
            return interval === 1 ? `1 ${unit} ago` : `${interval} ${unit}s ago`;
        }
    }

    return "Just now";
}


// Toggle upvote on question or answer
async function toggleUpvote(itemId, type = 'question') {
    if (!currentUser) {
        showNotification('Please log in to upvote', 'warning');
        showModal(elements.loginModal);
        return;
    }

    if (!firebaseDb) {
        showNotification('Database not available', 'error');
        return;
    }

    try {
        const collectionName = type === 'question' ? 'questions' : 'answers';
        const itemRef = doc(firebaseDb, collectionName, itemId);
        const itemDoc = await getDoc(itemRef);

        if (!itemDoc.exists()) {
            showNotification('Item not found', 'error');
            return;
        }

        // remember prior state so we can notify only on additions
        const priorData = itemDoc.data() || {};
        const priorUpvoted = Array.isArray(priorData.upvotedBy) && priorData.upvotedBy.includes(currentUser.uid);

        // Use a transaction to safely flip the upvote and ensure upvotes never go below 0
        await runTransaction(firebaseDb, async (tx) => {
            const snap = await tx.get(itemRef);
            if (!snap.exists()) throw new Error('Item not found');
            const current = snap.data() || {};
            const upvotedByNow = current.upvotedBy || [];
            const upvotesNow = typeof current.upvotes === 'number' ? current.upvotes : 0;
            const already = upvotedByNow.includes(currentUser.uid);

            if (already) {
                const nextUpvotes = Math.max(0, upvotesNow - 1);
                const nextUpvotedBy = upvotedByNow.filter(uid => uid !== currentUser.uid);
                tx.update(itemRef, {
                    upvotes: nextUpvotes,
                    upvotedBy: nextUpvotedBy,
                    updatedAt: new Date().toISOString()
                });
                // local feedback
                showNotification('Upvote removed', 'info');
            } else {
                const nextUpvotes = upvotesNow + 1;
                const nextUpvotedBy = [...upvotedByNow, currentUser.uid];
                tx.update(itemRef, {
                    upvotes: nextUpvotes,
                    upvotedBy: nextUpvotedBy,
                    updatedAt: new Date().toISOString()
                });
                showNotification('Upvoted!', 'success');
            }
        });

        // After transaction, fetch fresh data and notify owner only if this was an add
        try {
            const refreshedAfterTx = await getDoc(itemRef);
            const freshData = refreshedAfterTx.data() || {};
            const nowUpvoted = Array.isArray(freshData.upvotedBy) && freshData.upvotedBy.includes(currentUser.uid);

            // If this action resulted in an upvote (was not upvoted before, now is), notify the item's owner
            if (!priorUpvoted && nowUpvoted) {
                const ownerId = freshData.authorId || freshData.author || freshData.authorUid || null;
                if (ownerId && ownerId !== currentUser.uid) {
                    const nType = type === 'question' ? 'Question Liked' : 'Answer Liked';
                    const nMessage = `${currentUser.displayName || currentUser.email || 'Someone'} liked your ${type}.`;
                    await createNotification(nType, nMessage, ownerId);
                }
            }
        } catch (e) {
            console.warn('Failed to send notification after upvote toggle:', e);
        }

        // Refresh UI - try to update detailed view if present
        try {
            const refreshed = await getDoc(itemRef);
            const freshData = refreshed.data() || {};

            if (type === 'question') {
                // update question detail counts if visible
                const qUpEl = document.getElementById('questionDetailUpvotes');
                if (qUpEl) qUpEl.textContent = Math.max(0, freshData.upvotes || 0);

                const upBtn = document.getElementById('upvoteQuestionBtn');
                if (upBtn) {
                    const hasUpvotedNow = (freshData.upvotedBy || []).includes(currentUser.uid);
                    if (hasUpvotedNow) {
                        upBtn.classList.add('btn-upvote', 'active');
                        upBtn.innerHTML = `<i class="fas fa-thumbs-up"></i> <span id="questionDetailUpvotes">${Math.max(0, freshData.upvotes || 0)}</span>`;
                    } else {
                        upBtn.classList.add('btn-upvote');
                        upBtn.classList.remove('active');
                        upBtn.innerHTML = `<i class="fas fa-thumbs-up"></i> <span id="questionDetailUpvotes">${Math.max(0, freshData.upvotes || 0)}</span>`;
                    }
                }
            }
        } catch (e) {
            console.warn('Failed to refresh UI after upvote:', e);
        }

        // Update any visible upvote controls for this item in the DOM instead of forcing a full reload
        try {
            // freshData is available in the scope above; fetch again to be safe
            const refreshedAfterTx = await getDoc(itemRef);
            const freshData = refreshedAfterTx.data() || {};

            // Update any list / card upvote controls
            const listUpvoteEls = document.querySelectorAll(`.upvote-stat[data-id="${itemId}"]`);
            listUpvoteEls.forEach(el => {
                const countEl = el.querySelector('.upvote-count');
                if (countEl) countEl.textContent = Math.max(0, freshData.upvotes || 0);

                const nowUpvoted = (freshData.upvotedBy || []).includes(currentUser.uid);
                if (nowUpvoted) el.classList.add('active'); else el.classList.remove('active');
            });

            // Ensure the question detail button and count stay in sync if present
            const qUpEl = document.getElementById('questionDetailUpvotes');
            if (qUpEl) qUpEl.textContent = Math.max(0, freshData.upvotes || 0);

            const upBtn = document.getElementById('upvoteQuestionBtn');
            if (upBtn) {
                const hasUpvotedNow = (freshData.upvotedBy || []).includes(currentUser.uid);
                upBtn.classList.add('btn-upvote');
                if (hasUpvotedNow) upBtn.classList.add('active'); else upBtn.classList.remove('active');
                upBtn.innerHTML = `<i class="fas fa-thumbs-up"></i> <span id="questionDetailUpvotes">${Math.max(0, freshData.upvotes || 0)}</span>`;
            }
        } catch (e) {
            // As a last resort, if the targeted UI update fails we avoid forcing a full page reload
            console.warn('Failed to apply targeted UI updates after upvote:', e);
        }


    } catch (error) {
        console.error('Error toggling upvote:', error);
        showNotification('Failed to update upvote: ' + error.message, 'error');
    }
}


// Show ask question modal
function showAskQuestionForm() {
    if (!currentUser) {
        showNotification('Please log in to ask a question', 'warning');
        showModal(elements.loginModal);
        return;
    }

    console.log('=== Opening Ask Question Modal ===');

    // Remove existing modal if any
    const existingModal = document.getElementById('askQuestionModal');
    if (existingModal) {
        console.log('Removing existing modal');
        existingModal.remove();
    }

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'askQuestionModal';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 600px; max-height: 90vh; overflow-y: auto;">
            <button class="close-modal-btn" type="button" id="closeAskQuestionModalBtn">&times;</button>
            <h2 class="modal-title" style="margin-bottom: 1.5rem;">
                <i class="fas fa-question-circle"></i> Ask a Question
            </h2>
            <form id="askQuestionForm" style="text-align: left;">
                <div class="form-group" style="margin-bottom: 1.5rem;">
                    <label for="questionTitle" style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: #374151;">
                        Question Title *
                    </label>
                    <input type="text" id="questionTitle" class="form-input" 
                           placeholder="What's your question?" required 
                           style="width: 100%; box-sizing: border-box;">
                </div>
                <div class="form-group" style="margin-bottom: 1.5rem;">
                    <label for="questionCategory" style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: #374151;">
                        Category *
                    </label>
                    <select id="questionCategory" class="form-select" required 
                            style="width: 100%; box-sizing: border-box;">
                        <option value="">Select a category</option>
                        <option value="Computer Science">Computer Science</option>
                        <option value="Machine Learning">Machine Learning</option>
                        <option value="Data Science">Data Science</option>
                        <option value="Medicine">Medicine</option>
                        <option value="Physics">Physics</option>
                        <option value="Chemistry">Chemistry</option>
                        <option value="Biology">Biology</option>
                        <option value="Psychology">Psychology</option>
                        <option value="Economics">Economics</option>
                        <option value="Mathematics">Mathematics</option>
                        <option value="Engineering">Engineering</option>
                        <option value="Other">Other</option>
                    </select>

                    <div id="questionCategoryOtherGroup" aria-hidden="true" style="display:none; margin-top:0.75rem;">
                        <label for="questionCategoryOther" style="display:block; margin-bottom:0.25rem; font-weight:600; color:#374151;">Please specify</label>
                        <input id="questionCategoryOther" aria-hidden="true" class="form-input" placeholder="Describe the category (e.g. Philosophy, Sociology)">
                    </div>
                </div>
                <div class="form-group" style="margin-bottom: 1.5rem;">
                    <label for="questionDetails" style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: #374151;">
                        Question Details *
                    </label>
                    <textarea id="questionDetails" class="form-textarea" 
                              placeholder="Provide more details about your question..." 
                              rows="5" required 
                              style="width: 100%; box-sizing: border-box;"></textarea>
                </div>
                <div class="form-group" style="margin-bottom: 1.5rem;">
                    <label for="questionTags" style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: #374151;">
                        Tags (comma-separated)
                    </label>
                    <input type="text" id="questionTags" class="form-input" 
                           placeholder="e.g., machine learning, research, methodology"
                           style="width: 100%; box-sizing: border-box;">
                    <small style="color: #666; font-size: 0.85rem; display: block; margin-top: 0.25rem;">
                        Add relevant tags to help others find your question
                    </small>
                </div>
                <div class="modal-actions" style="display: flex; gap: 1rem; justify-content: flex-end; margin-top: 2rem;">
                    <button type="button" class="btn btn-secondary" id="cancelAskQuestionBtn">
                        Cancel
                    </button>
                    <button type="submit" class="btn" id="submitQuestionBtn">
                        <i class="fas fa-paper-plane"></i> Post Question
                    </button>
                </div>
            </form>
        </div>
    `;

    document.body.appendChild(modal);
    console.log('Modal appended to body');

    // Show modal with animation
    setTimeout(() => {
        modal.style.display = 'flex';
        modal.classList.add('is-visible');
    }, 10);

    // Set up event listeners
    console.log('Setting up event listeners...');

    // Close button
    const closeBtn = document.getElementById('closeAskQuestionModalBtn');
    if (closeBtn) {
        closeBtn.onclick = function (e) {
            e.preventDefault();
            e.stopPropagation();
            console.log('Close button clicked');
            closeAskQuestionModal();
        };
    }

    // Cancel button
    const cancelBtn = document.getElementById('cancelAskQuestionBtn');
    if (cancelBtn) {
        cancelBtn.onclick = function (e) {
            e.preventDefault();
            e.stopPropagation();
            console.log('Cancel button clicked');
            closeAskQuestionModal();
        };
    }

    // Form submission - CRITICAL FIX
    const form = document.getElementById('askQuestionForm');
    const submitQuestionBtn = document.getElementById('submitQuestionBtn');

    if (form) {
        form.onsubmit = async function (e) {
            e.preventDefault();
            e.stopPropagation();
            console.log('=== FORM SUBMITTED ===');
            await submitQuestion();
            return false;
        };
    }

    // ALSO attach to button directly as backup
    if (submitQuestionBtn) {
        submitQuestionBtn.onclick = async function (e) {
            e.preventDefault();
            e.stopPropagation();
            console.log('=== SUBMIT BUTTON CLICKED DIRECTLY ===');
            await submitQuestion();
            return false;
        };
    }

    // Click outside to close
    modal.onclick = function (e) {
        if (e.target === modal) {
            console.log('Clicked outside modal');
            closeAskQuestionModal();
        }
    };

    // Prevent clicks inside modal content from closing
    const modalContent = modal.querySelector('.modal-content');
    if (modalContent) {
        modalContent.onclick = function (e) {
            e.stopPropagation();
        };
    }

    // Show/hide custom category input when 'Other' is selected
    const categorySelectEl = document.getElementById('questionCategory');
    const otherGroup = document.getElementById('questionCategoryOtherGroup');
    const otherInput = document.getElementById('questionCategoryOther');
    if (categorySelectEl && otherGroup) {
        const toggleOther = (val) => {
            if (val === 'Other') {
                otherGroup.style.display = 'block';
                otherGroup.setAttribute('aria-hidden', 'false');
                if (otherInput) { otherInput.focus(); otherInput.setAttribute('aria-hidden', 'false'); }
            } else {
                otherGroup.style.display = 'none';
                otherGroup.setAttribute('aria-hidden', 'true');
                if (otherInput) { otherInput.value = ''; otherInput.setAttribute('aria-hidden', 'true'); }
            }
        };

        // initialize visibility
        toggleOther(categorySelectEl.value);

        categorySelectEl.addEventListener('change', (e) => {
            toggleOther(e.target.value);
        });
    }

    // Focus first input
    setTimeout(() => {
        const titleInput = document.getElementById('questionTitle');
        if (titleInput) {
            titleInput.focus();
            console.log('Title input focused');
        }
    }, 100);

    console.log('=== Modal setup complete ===');
}

// FIXED: Close ask question modal
function closeAskQuestionModal() {
    console.log('Closing ask question modal...');
    const modal = document.getElementById('askQuestionModal');
    if (modal) {
        modal.classList.remove('is-visible');
        modal.style.display = 'none';
        setTimeout(() => {
            modal.remove();
            console.log('Modal removed from DOM');
        }, 300);
    }
}

// Submit new question with proper validation and error handling
async function submitQuestion() {
    console.log('=== submitQuestion called ===');
    console.log('Current user:', currentUser);
    console.log('Firebase DB:', firebaseDb);

    if (!currentUser) {
        console.error('No current user');
        showNotification('Please log in to post a question', 'warning');
        return;
    }

    if (!firebaseDb) {
        console.error('Firebase not initialized');
        showNotification('Database connection not available. Please refresh the page.', 'error');
        return;
    }

    const titleInput = document.getElementById('questionTitle');
    const categorySelect = document.getElementById('questionCategory');
    const detailsTextarea = document.getElementById('questionDetails');
    const tagsInput = document.getElementById('questionTags');
    const submitBtn = document.getElementById('submitQuestionBtn');

    if (!titleInput || !categorySelect || !detailsTextarea || !submitBtn) {
        console.error('Required form elements not found');
        showNotification('Form error. Please try refreshing the page.', 'error');
        return;
    }

    const title = titleInput.value.trim();
    let category = categorySelect.value.trim();
    // If user selected Other, prefer the custom input value instead
    if (category === 'Other') {
        const otherEl = document.getElementById('questionCategoryOther');
        const otherVal = otherEl ? otherEl.value.trim() : '';
        if (!otherVal) {
            showNotification('Please specify the category for "Other"', 'warning');
            if (otherEl) otherEl.focus();
            return;
        }
        category = otherVal;
    }
    const details = detailsTextarea.value.trim();
    const tagsValue = tagsInput ? tagsInput.value.trim() : '';

    if (!title) {
        showNotification('Please enter a question title', 'warning');
        titleInput.focus();
        return;
    }
    if (title.length < 10) {
        showNotification('Question title must be at least 10 characters', 'warning');
        titleInput.focus();
        return;
    }
    if (!category) {
        showNotification('Please select a category', 'warning');
        categorySelect.focus();
        return;
    }
    if (!details) {
        showNotification('Please provide question details', 'warning');
        detailsTextarea.focus();
        return;
    }
    if (details.length < 20) {
        showNotification('Question details must be at least 20 characters', 'warning');
        detailsTextarea.focus();
        return;
    }

    const originalHTML = submitBtn.innerHTML;
    const originalBg = submitBtn.style.background;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Posting...';
    submitBtn.disabled = true;
    submitBtn.style.pointerEvents = 'none';

    try {
        const tags = tagsValue
            ? tagsValue.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0)
            : [];

        const questionData = {
            title,
            category,
            details,
            tags,
            authorId: currentUser.uid,
            authorName: currentUser.displayName || currentUser.email || 'Anonymous',
            upvotes: 0,
            upvotedBy: [],
            answers: 0,
            views: 0,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        const questionsRef = collection(firebaseDb, 'questions');
        const docRef = await addDoc(questionsRef, questionData);
        console.log('✅ SUCCESS! Question posted with ID:', docRef.id);

        submitBtn.innerHTML = '<i class="fas fa-check"></i> Posted!';
        submitBtn.style.background = '#10b981';
        showNotification('Question posted successfully! 🎉', 'success');

        // ✅ Close modal, clear form, and switch tab to All
        setTimeout(async () => {
            closeAskQuestionModal();

            // clear fields
            titleInput.value = '';
            categorySelect.selectedIndex = 0;
            try {
                const otherGroupEl = document.getElementById('questionCategoryOtherGroup');
                const otherInputEl = document.getElementById('questionCategoryOther');
                if (otherGroupEl) otherGroupEl.style.display = 'none';
                if (otherInputEl) otherInputEl.value = '';
            } catch (e) { /* ignore */ }
            detailsTextarea.value = '';
            if (tagsInput) tagsInput.value = '';

            // switch tab to All Questions
            currentTab = "all";
            document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
            const allTabBtn = document.querySelector('.tab-btn[data-tab="all"]');
            if (allTabBtn) allTabBtn.classList.add("active");

            // reload questions for All tab
            if (typeof loadAllQuestions === 'function') {
                await loadAllQuestions();
                showNotification('Your question is now visible in All Questions!', 'success');
            } else if (typeof loadQuestions === 'function') {
                await loadQuestions();
                showNotification('Your question is now visible!', 'success');
            } else {
                console.warn('⚠️ No question loader found, reloading page.');
                window.location.reload();
            }

            // restore button
            submitBtn.innerHTML = originalHTML;
            submitBtn.style.background = originalBg;
            submitBtn.disabled = false;
            submitBtn.style.pointerEvents = '';

        }, 1200);

    } catch (error) {
        console.error('❌ ERROR POSTING QUESTION', error);
        submitBtn.innerHTML = originalHTML;
        submitBtn.style.background = originalBg;
        submitBtn.disabled = false;
        submitBtn.style.pointerEvents = '';

        let errorMessage = 'Failed to post question. ';
        if (error.code === 'permission-denied') {
            errorMessage += 'Permission denied. Check Firebase rules.';
        } else if (error.code === 'unavailable') {
            errorMessage += 'Database unavailable. Check your connection.';
        } else if (error.code === 'unauthenticated') {
            errorMessage += 'Please log in again.';
        } else {
            errorMessage += error.message || 'Unknown error.';
        }
        showNotification(errorMessage, 'error');
    }
}


// Export globally
window.showAskQuestionForm = showAskQuestionForm;
window.closeAskQuestionModal = closeAskQuestionModal;
window.submitQuestion = submitQuestion;

// Helper function to verify questions are loading
/*async function verifyQuestionsDisplay() {
    if (!firebaseDb) {
        console.error('Firebase not available');
        return;
    }
 
    try {
        console.log('🔍 Verifying questions in database...');
 
        const questionsRef = collection(firebaseDb, 'questions');
        const q = query(questionsRef, orderBy('createdAt', 'desc'), limit(10));
        const snapshot = await getDocs(q);
 
        console.log(`📊 Found ${snapshot.size} questions in database`);
 
        snapshot.forEach((doc, index) => {
            const data = doc.data();
            console.log(`${index + 1}. ${data.title} (by ${data.authorName})`);
        });
 
        // Check if questions list container exists
        const questionsList = document.querySelector('.questions-list');
        if (questionsList) {
            console.log('✅ Questions list container found');
            const displayedQuestions = questionsList.querySelectorAll('.question-item');
            console.log(`📺 Currently displaying ${displayedQuestions.length} questions`);
 
            if (displayedQuestions.length === 0 && snapshot.size > 0) {
                console.warn('⚠️ Questions exist in DB but not displayed! Forcing reload...');
                if (typeof loadQuestionsFromFirebase === 'function') {
                    loadQuestionsFromFirebase('all');
                }
            }
        } else {
            console.error('❌ Questions list container not found in DOM');
        }
 
    } catch (error) {
        console.error('Error verifying questions:', error);
    }
}
 
// Auto-verify on page load (only on questions page)
if (window.location.pathname.includes('questions.html')) {
    setTimeout(() => {
        verifyQuestionsDisplay();
    }, 2000);
}
 
window.verifyQuestionsDisplay = verifyQuestionsDisplay;
 
console.log('✅ Fixed Ask Question Modal functions loaded');
console.log('💡 To manually check questions, run: verifyQuestionsDisplay()');
 
*/


// NOTIFICATIONS (kept, cleaned, standardized)
async function createNotification(type, message, targetUserId = null) {
    if (!firebaseDb || !firebaseAuth.currentUser) return;

    try {
        await addDoc(collection(firebaseDb, "notifications"), {
            type,
            message,
            userId: targetUserId || firebaseAuth.currentUser.uid,
            createdBy: firebaseAuth.currentUser.uid,
            read: false,
            createdAt: serverTimestamp()
        });
    } catch (error) {
        console.error("Error creating notification:", error);
    }
}

// Ensure escapeHtml exists (fallback) so modal helpers are safe to call early
if (typeof escapeHtml !== 'function') {
    function escapeHtml(str) {
        if (str == null) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
}

// Helper to determine whether a URL is a safe remote resource we can open from the browser
function isRemoteUrl(url) {
    if (!url) return false;
    try {
        return /^(https?:|blob:|data:)/i.test(String(url).trim());
    } catch (e) {
        return false;
    }
}

// Simple modal alert helper (returns a Promise resolved when user dismisses)
function showAlertModal(message, title = 'Notice', opts = {}) {
    return new Promise((resolve) => {
        // remove existing alert modal
        const existing = document.getElementById('appAlertModal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.id = 'appAlertModal';
        modal.innerHTML = `
            <div class="modal-content">
                <button class="close-modal-btn" type="button" id="closeAppAlert">&times;</button>
                <div class="modal-icon"><i class="fas fa-info-circle" style="color: ${opts.color || '#5b21b6'}"></i></div>
                <h2 class="modal-title">${escapeHtml(title)}</h2>
                <p style="margin-top:0.5rem; white-space: pre-wrap; text-align:left;">${escapeHtml(message)}</p>
                <div class="modal-actions">
                    <button class="btn" id="appAlertOk">OK</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        // show modal
        setTimeout(() => {
            modal.style.display = 'flex';
            modal.classList.add('is-visible');
            document.body.style.overflow = 'hidden';
        }, 10);

        function close(result = true) {
            modal.classList.remove('is-visible');
            try { modal.style.display = 'none'; } catch (_) { }
            document.body.style.overflow = '';
            setTimeout(() => { try { modal.remove(); } catch (_) { }; resolve(result); }, 300);
        }

        modal.querySelector('#closeAppAlert').onclick = () => close(true);
        modal.querySelector('#appAlertOk').onclick = () => close(true);
        modal.onclick = (e) => { if (e.target === modal) close(true); };
    });
}

// Confirm modal (returns Promise<boolean>)
function showConfirmModal(message, title = 'Confirm') {
    return new Promise((resolve) => {
        const existing = document.getElementById('appConfirmModal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.id = 'appConfirmModal';
        modal.innerHTML = `
            <div class="modal-content">
                <button class="close-modal-btn" type="button" id="closeAppConfirm">&times;</button>
                <div class="modal-icon"><i class="fas fa-question-circle" style="color:#f59e0b"></i></div>
                <h2 class="modal-title">${escapeHtml(title)}</h2>
                <p style="margin-top:0.5rem; white-space: pre-wrap; text-align:left;">${escapeHtml(message)}</p>
                <div class="modal-actions">
                    <button class="btn btn-secondary" id="appConfirmCancel">Cancel</button>
                    <button class="btn btn-danger" id="appConfirmOk">OK</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        setTimeout(() => { modal.style.display = 'flex'; modal.classList.add('is-visible'); document.body.style.overflow = 'hidden'; }, 10);

        function close(result) {
            modal.classList.remove('is-visible');
            try { modal.style.display = 'none'; } catch (_) { }
            document.body.style.overflow = '';
            setTimeout(() => { try { modal.remove(); } catch (_) { }; resolve(result); }, 300);
        }

        modal.querySelector('#closeAppConfirm').onclick = () => close(false);
        modal.querySelector('#appConfirmCancel').onclick = () => close(false);
        modal.querySelector('#appConfirmOk').onclick = () => close(true);
        modal.onclick = (e) => { if (e.target === modal) close(false); };
    });
}

async function loadUserNotifications() {
    const user = firebaseAuth?.currentUser;
    if (!user || !firebaseDb) return [];

    try {
        const ref = collection(firebaseDb, "notifications");
        // Prefer server-sorted query (fast) — if Firestore requires a composite index we'll fallback
        try {
            const q = query(
                ref,
                where("userId", "==", user.uid),
                orderBy("createdAt", "desc"),
                limit(50)
            );

            const snapshot = await getDocs(q);
            const notifications = [];
            snapshot.forEach(doc => notifications.push({ id: doc.id, ...doc.data() }));
            return notifications;
        } catch (err) {
            // If Firestore complains about a missing index, provide a graceful fallback and a helpful log
            console.warn("Primary notifications query failed, attempting safe fallback:", err?.message || err);

            // If the SDK returned a helpful index-creation URL, surface it in the console for easy copy/paste
            try {
                const urlMatch = String(err?.message || "").match(/(https?:\/\/\S+)/);
                if (urlMatch) {
                    console.warn("Firestore composite index required. Create it here:", urlMatch[0]);
                }
            } catch (_) { /* ignore */ }

            // Fallback: query only by userId (no order), then sort client-side by createdAt.
            try {
                const q2 = query(ref, where("userId", "==", user.uid), limit(200));
                const snapshot2 = await getDocs(q2);
                const notifications = [];
                snapshot2.forEach(doc => notifications.push({ id: doc.id, ...doc.data() }));

                // Sort by createdAt (supporting Firestore Timestamp or ISO strings / numbers)
                notifications.sort((a, b) => {
                    const aT = a.createdAt && typeof a.createdAt === 'object' && typeof a.createdAt.toMillis === 'function'
                        ? a.createdAt.toMillis()
                        : (a.createdAt ? new Date(a.createdAt).getTime() : 0);
                    const bT = b.createdAt && typeof b.createdAt === 'object' && typeof b.createdAt.toMillis === 'function'
                        ? b.createdAt.toMillis()
                        : (b.createdAt ? new Date(b.createdAt).getTime() : 0);
                    return bT - aT;
                });

                // Return up to the requested limit
                return notifications.slice(0, 50);
            } catch (fallbackErr) {
                console.error("Fallback notifications query failed:", fallbackErr);
                return [];
            }
        }

    } catch (error) {
        console.error("Error loading notifications:", error);
        return [];
    }
}

async function markNotificationAsRead(notificationId) {
    if (!firebaseDb) return;

    try {
        await updateDoc(doc(firebaseDb, "notifications", notificationId), {
            read: true,
            readAt: new Date().toISOString()
        });
    } catch (error) {
        console.error("Error marking notification as read:", error);
    }
}

// Notifications page functionality
function initializeNotificationsFeatures() {
    const notifTabBtns = document.querySelectorAll('.notification-controls .tab-btn');
    notifTabBtns.forEach(btn => {
        btn.addEventListener('click', function () {
            notifTabBtns.forEach(tab => tab.classList.remove('active'));
            this.classList.add('active');
            console.log(`Switched to notification tab: ${this.textContent}`);
        });
    });

    const markReadBtns = document.querySelectorAll('.notification-actions .btn-icon[title="Mark as read"]');
    markReadBtns.forEach(btn => {
        btn.addEventListener('click', function () {
            const notification = this.closest('.notification-item');
            if (notification) {
                notification.classList.remove('unread');
                this.style.display = 'none';
                console.log('Notification marked as read');
            }
        });
    });

    const dismissBtns = document.querySelectorAll('.notification-actions .btn-icon[title="Dismiss"]');
    dismissBtns.forEach(btn => {
        btn.addEventListener('click', function () {
            const notification = this.closest('.notification-item');
            if (notification) {
                notification.style.opacity = '0';
                notification.style.transform = 'translateX(100%)';
                setTimeout(() => {
                    notification.remove();
                }, 300);
                console.log('Notification dismissed');
            }
        });
    });

    const markAllReadBtn = document.querySelector('.notification-actions .btn-secondary');
    if (markAllReadBtn && markAllReadBtn.textContent.includes('Mark All as Read')) {
        markAllReadBtn.addEventListener('click', function () {
            const unreadNotifications = document.querySelectorAll('.notification-item.unread');
            unreadNotifications.forEach(notification => {
                notification.classList.remove('unread');
            });
            console.log('All notifications marked as read');
        });
    }
}

async function renderNotificationsPage() {
    const list = document.getElementById("notificationsList");
    if (!list) return;

    const notifications = await loadUserNotifications(); // already exists
    list.innerHTML = "";

    const unreadCount = notifications.filter(n => !n.read).length;
    // show header summary at top of notifications list — hide header when there are no notifications
    const header = document.getElementById('notificationsSummary');
    if (header) {
        if (notifications.length === 0) {
            header.style.display = 'none';
        } else {
            header.style.display = '';
            header.textContent = `You have ${notifications.length} notifications (${unreadCount} unread)`;
        }
    }

    if (notifications.length === 0) {
        // Render a single, clear empty-state so we never show multiple "No notifications" copies.
        list.innerHTML = `
            <div class="notification-empty">
                <div class="notification-content">
                    <h4>No notifications yet</h4>
                    <p>You're all caught up — no new notifications.</p>
                </div>
            </div>`;
        return;
    }

    notifications.forEach(n => {
        const item = document.createElement("div");
        item.className = `notification-item ${n.read ? "" : "unread"}`;
        item.dataset.id = n.id;

        const icon = getNotifIcon(n.type);

        item.innerHTML = `
            <div class="notification-icon"><span class="icon">${icon}</span></div>
            <div class="notification-content">
                <h4>${n.type}</h4>
                <p>${n.message}</p>
                <span class="notification-time">${formatTimeAgo(n.createdAt)}</span>
            </div>
            <div class="notification-actions">
                <button class="btn-icon" data-action="mark">✓</button>
                <button class="btn-icon" data-action="dismiss">×</button>
            </div>
        `;

        list.appendChild(item);
    });

    attachNotificationActions();
}

const markAllBtn = document.querySelector(".notification-actions .btn-secondary");
if (markAllBtn && markAllBtn.textContent.includes("Mark All as Read")) {
    markAllBtn.addEventListener("click", async () => {
        const notifs = await loadUserNotifications();
        for (const n of notifs) {
            if (!n.read) {
                await markNotificationAsRead(n.id);
            }
        }
        renderNotificationsPage();
    });
}

function attachNotificationActions() {
    const list = document.getElementById("notificationsList");
    if (!list) return;

    list.addEventListener("click", async (e) => {
        const btn = e.target.closest(".btn-icon");
        if (!btn) return;

        const item = btn.closest(".notification-item");
        const id = item.dataset.id;
        if (!id) return; // guard: ignore clicks on empty-state or malformed items

        if (btn.dataset.action === "mark") {
            await markNotificationAsRead(id);
            item.classList.remove("unread");
        }

        if (btn.dataset.action === "dismiss") {
            await deleteDoc(doc(firebaseDb, "notifications", id));
            item.remove();
        }
    });
}

function getNotifIcon(type) {
    const icons = {
        "Question Liked": "👍",
        "New Answer": "💬",
        "Paper Approved": "📄",
        "Paper Rejected": "❌",
        "Info": "ℹ️"
    };
    return icons[type] || "🔔";
}

function formatTimeAgo(timestamp) {
    // Support Firestore Timestamp, ISO string, or JS Date/number
    let timeMs = null;
    try {
        if (!timestamp) return 'Unknown';
        if (typeof timestamp === 'object' && typeof timestamp.toDate === 'function') {
            timeMs = timestamp.toDate().getTime();
        } else if (typeof timestamp === 'number') {
            timeMs = timestamp;
        } else {
            timeMs = new Date(timestamp).getTime();
        }
    } catch (_) {
        return 'Unknown';
    }

    const diff = (Date.now() - timeMs) / 1000; // seconds
    if (diff < 60) return "Just now";
    if (diff < 3600) return `${Math.floor(diff / 60)} minutes ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
    return `${Math.floor(diff / 86400)} days ago`;
}

// Auto-run only on notifications page
if (window.location.pathname.includes("notifications.html")) {
    setTimeout(renderNotificationsPage, 300);
}

// Settings page functionality
function initializeSettingsFeatures() {
    console.log("Initializing settings features...");

    // Force update settings immediately if user is logged in
    if (currentUser) {
        console.log("User is logged in, force updating settings immediately");
        populateSettingsWithDefaults();
    }

    // Wait a bit for Firebase auth to initialize, then load settings
    setTimeout(async () => {
        if (currentUser) {
            console.log("User is logged in, loading settings data...");
            await loadSettingsData();
        } else {
            console.log("No user logged in (init phase), suppressing settings login prompt");
            // Do not notify here; wait for auth observer to decide once
        }
    }, 500);

    // Account settings
    const updateAccountBtn = document.getElementById('updateAccountBtn');
    if (updateAccountBtn) {
        updateAccountBtn.addEventListener('click', async function () {
            await saveAccountSettings();
        });
    }

    // Research preferences
    const savePreferencesBtn = document.getElementById('savePreferencesBtn');
    if (savePreferencesBtn) {
        savePreferencesBtn.addEventListener('click', async function () {
            await saveResearchPreferences();
        });
    }

    // Notification settings
    const updateNotificationsBtn = document.getElementById('updateNotificationsBtn');
    if (updateNotificationsBtn) {
        updateNotificationsBtn.addEventListener('click', async function () {
            await saveNotificationSettings();
        });
    }

    // Delete account
    const deleteAccountBtn = document.getElementById('deleteAccountBtn');
    if (deleteAccountBtn) {
        deleteAccountBtn.addEventListener('click', async function () {
            const confirmed = await showConfirmModal('Are you absolutely sure you want to delete your account? This action cannot be undone.');
            if (confirmed) {
                const doubleConfirmed = await showConfirmModal('This will permanently delete all your data. Type "DELETE" to confirm.');
                if (doubleConfirmed) {
                    showNotification('Account deletion confirmed. This is a demo - no actual deletion occurred.', 'warning');
                    console.log('Account deletion confirmed');
                }
            }
        });
    }

    // Auto-save checkbox changes
    const checkboxes = document.querySelectorAll('.settings-grid input[type="checkbox"]');
    checkboxes.forEach(checkbox => {
        checkbox.addEventListener('change', function () {
            const settingName = this.nextElementSibling.textContent;
            console.log(`Setting changed: ${settingName} = ${this.checked}`);
            showNotification(`${settingName} ${this.checked ? 'enabled' : 'disabled'}`, 'info');

            // Auto-save checkbox changes
            if (currentUser) {
                saveSettingsToFirebase();
            }
        });
    });

    console.log("Settings features initialized successfully");
}

async function handleSearch() {
    const query = elements.searchInput.value.trim();
    const browseEl = document.querySelector('.browse-categories');
    if (query) {
        // Hide the "Browse by Category" section when a search is performed
        if (browseEl) browseEl.style.display = 'none';
        if (elements.searchBtn) {
            elements.searchBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Searching...';
            elements.searchBtn.disabled = true;

            try {
                console.log(`Searching for: "${query}"`);
                await performSearch(query);
            } catch (error) {
                console.error("Search error:", error);
                showNotification("Search failed. Please try again.", "error");
            } finally {
                elements.searchBtn.innerHTML = '<i class="fas fa-search"></i> Search';
                elements.searchBtn.disabled = false;
                restoreIcons();
            }
        }
    } else {
        // If search is cleared or empty, show the browse categories again
        if (browseEl) browseEl.style.display = '';
        showNotification("Please enter a search query", "warning");
        if (elements.searchInput) {
            elements.searchInput.focus();
        }
    }
}

// Search ONLY through published papers
async function performSearch(searchTerm) {
    try {
        const user = firebaseAuth.currentUser;

        if (!user) {
            console.warn("User not logged in, searching only approved papers.");
        }

        let papersQuery;

        // 🔥 Admin search
        const isAdmin = user?.email === "responsojohncarlo7@gmail.com" ||
            user?.email === "anotheradmin@gmail.com";


        if (isAdmin) {
            // admin can see all papers
            papersQuery = query(
                collection(firebaseDb, "publishedPapers")
            );
        } else {
            // regular users: only approved papers
            papersQuery = query(
                collection(firebaseDb, "publishedPapers"),
            );
        }

        let snapshot;
        try {
            snapshot = await getDocs(papersQuery);
        } catch (queryErr) {
            console.warn('Firestore query failed, falling back to client-side fetch:', queryErr);
            // Fallback: fetch the whole collection and filter client-side.
            // This helps when a restrictive security rule or missing index prevents the server-side query.
            const allSnap = await getDocs(collection(firebaseDb, "publishedPapers"));
            const docs = allSnap.docs.filter(d => {
                const data = d.data();
                if (!isAdmin && data.status !== 'approved') return false;
                return true;
            });
            snapshot = { docs };
        }

        const resultsContainer = document.getElementById("searchResultsContainer");
        resultsContainer.innerHTML = "";

        const keyword = searchTerm.toLowerCase();

        // 🔥 Client-side filtering (SAFE)
        const filteredDocs = snapshot.docs.filter(doc => {
            const data = doc.data();

            return (
                (data.title || "").toLowerCase().includes(keyword) ||
                (data.abstract || "").toLowerCase().includes(keyword) ||
                (data.authors || "").toLowerCase().includes(keyword) ||
                (data.category || "").toLowerCase().includes(keyword) ||
                (data.tags ? data.tags.join(" ").toLowerCase() : "")
                    .includes(keyword)
            );
        });

        // 🧩 If no results
        if (filteredDocs.length === 0) {
            resultsContainer.innerHTML = `
        <div class="paper-card no-papers">
          <h3 class="paper-title">No matching papers found</h3>
          <div class="paper-meta">
            <span><i class="fas fa-search"></i> Try different keywords</span>
          </div>
        </div>
      `;
            return;
        }

        // 🎨 Render results
        filteredDocs.forEach(doc => {
            const data = doc.data();

            resultsContainer.innerHTML += `
        <div class="paper-card">
          <h3 class="paper-title">${data.title}</h3>

          <div class="paper-meta">
            <span><i class="fas fa-user"></i> ${data.authors}</span>
            <span><i class="fas fa-tag"></i> ${data.category}</span>
          </div>

          <p class="paper-abstract">${data.abstract}</p>

          ${data.tags?.length
                    ? `<div class="paper-tags">
                  ${data.tags.map(t => `<span class="paper-tag">${t}</span>`).join("")}
                 </div>`
                    : ""
                }

                    <div class="paper-actions">
                        ${isRemoteUrl(data.fileUrl || data.url)
                    ? `<a href="${escapeHtml(data.fileUrl || data.url)}" class="btn browse-btn" target="_blank">
                                         <i class="fas fa-file-pdf"></i> View Paper
                                     </a>`
                    : `<button class="btn browse-btn disabled" disabled title="No accessible file"><i class="fas fa-file-pdf"></i> View Paper</button>`
                }
                        <button class="btn btn-save-library" data-title="${escapeHtml(data.title)}" data-authors="${escapeHtml(data.authors || '')}" data-category="${escapeHtml(data.category || '')}" data-abstract="${escapeHtml(data.abstract || '')}" data-year="${escapeHtml(data.year || '')}" data-url="${escapeHtml(data.fileUrl || data.url || '')}"><i class="fas fa-book"></i> Save</button>
                        <span class="paper-status">
                                <i class="fas fa-check-circle"></i>
                                ${escapeHtml(data.status || '')}
                        </span>
                    </div>
        </div>
      `;
        });

    } catch (err) {
        console.error("Search failed:", err);
    }
}

const papersRef = collection(firebaseDb, "publishedPapers");

const papersQuery = query(
    collection(firebaseDb, "publishedPapers"),
    where("status", "==", "approved")
);

console.log("Sample papers initialized in Firebase");

function displaySearchResults(results, query) {
    let resultsContainer = document.getElementById('searchResults');
    if (!resultsContainer) {
        resultsContainer = document.createElement('div');
        resultsContainer.id = 'searchResults';
        resultsContainer.className = 'search-results';

        const searchContainer = document.querySelector('.search-container');
        if (searchContainer) {
            searchContainer.parentNode.insertBefore(resultsContainer, searchContainer.nextSibling);
        }
    }

    if (results.length === 0) {
        resultsContainer.innerHTML = `
            <div class="no-results">
                <i class="fas fa-search"></i>
                <h3>No results found for "${query}"</h3>
                <p>Try different keywords or check your spelling</p>
            </div>
        `;
    } else {
        const categories = [...new Set(results.map(paper => paper.category))];

        resultsContainer.innerHTML = `
            <div class="search-results-header">
                <h3><i class="fas fa-search"></i> Search Results for "${query}" (${results.length} found)</h3>
                <div class="search-filters">
                    <label for="categoryFilter">Filter by Category:</label>
                    <select id="categoryFilter" class="form-select">
                        <option value="all">All Categories</option>
                        ${categories.map(cat => `<option value="${cat}">${cat}</option>`).join('')}
                    </select>
                    <label for="sortResults">Sort by:</label>
                    <select id="sortResults" class="form-select">
                        <option value="relevance">Relevance</option>
                        <option value="year">Year (Newest First)</option>
                        <option value="citations">Citations (Most First)</option>
                        <option value="rating">Rating (Highest First)</option>
                        <option value="title">Title (A-Z)</option>
                    </select>
                </div>
            </div>
            <div class="search-results-list">
                ${results.map(paper => `
                    <div class="search-result-item" data-category="${paper.category}">
                        <div class="result-header">
                            <h4>${paper.title}</h4>
                            <div class="result-actions">
                                <button class="btn-icon" title="Add to Favorites"><i class="fas fa-heart"></i></button>
                                <button class="btn-icon" title="Download"><i class="fas fa-download"></i></button>
                                <button class="btn-icon" title="Share"><i class="fas fa-share"></i></button>
                            </div>
                        </div>
                        <div class="result-meta">
                            <span class="authors"><i class="fas fa-user"></i> ${paper.authors}</span>
                            <span class="year"><i class="fas fa-calendar"></i> ${paper.year}</span>
                            <span class="citations"><i class="fas fa-quote-left"></i> ${paper.citations} citations</span>
                            <span class="rating"><i class="fas fa-star"></i> ${paper.rating}</span>
                            <span class="category"><i class="fas fa-tag"></i> ${paper.category}</span>
                        </div>
                        <p class="result-abstract">${paper.abstract}</p>
                        <div class="result-tags">
                            ${paper.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    attachSearchResultListeners();
    attachSearchFilterListeners();
    restoreIcons();
}

function attachSearchFilterListeners() {
    const categoryFilter = document.getElementById('categoryFilter');
    if (categoryFilter) {
        categoryFilter.addEventListener('change', function () {
            filterSearchResults(this.value);
        });
    }

    const sortFilter = document.getElementById('sortResults');
    if (sortFilter) {
        sortFilter.addEventListener('change', function () {
            sortSearchResults(this.value);
        });
    }
}

function filterSearchResults(category) {
    const results = document.querySelectorAll('.search-result-item');
    let visibleCount = 0;

    results.forEach(result => {
        if (category === 'all' || result.dataset.category === category) {
            result.style.display = 'block';
            visibleCount++;
        } else {
            result.style.display = 'none';
        }
    });

    showNotification(`Showing ${visibleCount} results for ${category === 'all' ? 'all categories' : category}`, 'info');
}

function sortSearchResults(sortBy) {
    const container = document.querySelector('.search-results-list');
    if (!container) return;

    const results = Array.from(container.querySelectorAll('.search-result-item'));

    results.sort((a, b) => {
        switch (sortBy) {
            case 'year':
                const yearA = parseInt(a.querySelector('.year')?.textContent) || 0;
                const yearB = parseInt(b.querySelector('.year')?.textContent) || 0;
                return yearB - yearA;
            case 'citations':
                const citationsA = parseInt(a.querySelector('.citations')?.textContent) || 0;
                const citationsB = parseInt(b.querySelector('.citations')?.textContent) || 0;
                return citationsB - citationsA;
            case 'rating':
                const ratingA = parseFloat(a.querySelector('.rating')?.textContent) || 0;
                const ratingB = parseFloat(b.querySelector('.rating')?.textContent) || 0;
                return ratingB - ratingA;
            case 'title':
                const titleA = a.querySelector('h4')?.textContent || '';
                const titleB = b.querySelector('h4')?.textContent || '';
                return titleA.localeCompare(titleB);
            default:
                return 0;
        }
    });

    results.forEach(result => container.appendChild(result));
    showNotification(`Results sorted by ${sortBy}`, 'info');
}

function attachSearchResultListeners() {
    const favoriteBtns = document.querySelectorAll('.search-results .btn-icon[title="Add to Favorites"]');
    favoriteBtns.forEach(btn => {
        btn.addEventListener('click', async function () {
            if (!currentUser) {
                showNotification('Please log in to add favorites', 'warning');
                showModal(elements.loginModal);
                return;
            }

            const resultItem = this.closest('.search-result-item');
            const paperData = {
                title: resultItem.querySelector('h4')?.textContent || '',
                authors: resultItem.querySelector('.authors')?.textContent.replace(/^\s*.*?\s*/, '') || '',
                year: resultItem.querySelector('.year')?.textContent.replace(/^\s*.*?\s*/, '') || '',
                category: resultItem.querySelector('.category')?.textContent.replace(/^\s*.*?\s*/, '') || '',
                abstract: resultItem.querySelector('.result-abstract')?.textContent || '',
                citations: parseInt(resultItem.querySelector('.citations')?.textContent) || 0,
                rating: parseFloat(resultItem.querySelector('.rating')?.textContent) || 0,
            };

            try {
                const isFavorited = this.classList.contains('favorited');

                if (!isFavorited) {
                    await addToLibrary(paperData, 'favorites');
                    this.classList.add('favorited');
                    this.innerHTML = '<i class="fas fa-heart" style="color: #dc2626;"></i>';
                    showNotification('Added to favorites!', 'success');
                } else {
                    await removeFromLibrary(paperData.title, 'favorites');
                    this.classList.remove('favorited');
                    this.innerHTML = '<i class="fas fa-heart"></i>';
                    showNotification('Removed from favorites', 'info');
                }
            } catch (error) {
                console.error("Error updating favorites:", error);
                showNotification('Failed to update favorites', 'error');
            }
        });
    });

    const downloadBtns = document.querySelectorAll('.search-results .btn-icon[title="Download"]');
    downloadBtns.forEach(btn => {
        btn.addEventListener('click', async function () {
            if (!currentUser) {
                showNotification('Please log in to save papers', 'warning');
                showModal(elements.loginModal);
                return;
            }

            const resultItem = this.closest('.search-result-item');
            const paperData = {
                title: resultItem.querySelector('h4')?.textContent || '',
                authors: resultItem.querySelector('.authors')?.textContent.replace(/^\s*.*?\s*/, '') || '',
                year: resultItem.querySelector('.year')?.textContent.replace(/^\s*.*?\s*/, '') || '',
                category: resultItem.querySelector('.category')?.textContent.replace(/^\s*.*?\s*/, '') || '',
                abstract: resultItem.querySelector('.result-abstract')?.textContent || '',
                citations: parseInt(resultItem.querySelector('.citations')?.textContent) || 0,
                rating: parseFloat(resultItem.querySelector('.rating')?.textContent) || 0,
            };

            try {
                await addToLibrary(paperData, 'saved');
                showNotification('Paper saved to library!', 'success');
            } catch (error) {
                console.error("Error saving paper:", error);
                showNotification('Failed to save paper', 'error');
            }
        });
    });

    const shareBtns = document.querySelectorAll('.search-results .btn-icon[title="Share"]');
    shareBtns.forEach(btn => {
        btn.addEventListener('click', function () {
            if (navigator.share) {
                navigator.han({
                    title: 'Research Paper',
                    text: 'Check out this interesting research paper!',
                    url: window.location.href
                });
            } else {
                navigator.clipboard.writeText(window.location.href).then(() => {
                    showNotification('Link copied to clipboard!', 'success');
                });
            }
        });
    });
}

async function addToLibrary(paperData, type = 'saved') {
    if (!currentUser || !firebaseDb) {
        throw new Error('User not authenticated or database unavailable');
    }

    try {
        const libraryRef = collection(firebaseDb, 'users', currentUser.uid, 'library');
        const paperWithMetadata = {
            ...paperData,
            type: type,
            savedAt: new Date().toISOString(),
            userId: currentUser.uid
        };

        await addDoc(libraryRef, paperWithMetadata);
        console.log(`Paper added to ${type}:`, paperData.title);
    } catch (error) {
        console.error('Error adding to library:', error);
        throw error;
    }
}

async function removeFromLibrary(paperTitle, type) {
    if (!currentUser || !firebaseDb) {
        throw new Error('User not authenticated or database unavailable');
    }

    try {
        const libraryRef = collection(firebaseDb, 'users', currentUser.uid, 'library');
        const q = query(libraryRef, where('title', '==', paperTitle), where('type', '==', type));
        const querySnapshot = await getDocs(q);

        querySnapshot.forEach(async (document) => {
            await deleteDoc(doc(firebaseDb, 'users', currentUser.uid, 'library', document.id));
        });

        console.log(`Paper removed from ${type}:`, paperTitle);
    } catch (error) {
        console.error('Error removing from library:', error);
        throw error;
    }
}

async function loadUserLibrary(type = 'all') {
    if (!currentUser || !firebaseDb) {
        return [];
    }

    try {
        const libraryRef = collection(firebaseDb, 'users', currentUser.uid, 'library');
        let q;

        if (type === 'all') {
            q = query(libraryRef, orderBy('savedAt', 'desc'));
        } else {
            q = query(libraryRef, where('type', '==', type), orderBy('savedAt', 'desc'));
        }

        const querySnapshot = await getDocs(q);
        const papers = [];

        querySnapshot.forEach((doc) => {
            papers.push({ id: doc.id, ...doc.data() });
        });

        return papers;
    } catch (error) {
        console.error('Error loading library:', error);
        return [];
    }
}

function searchSuggestion(term) {
    if (elements.searchInput) {
        elements.searchInput.value = term;
        handleSearch();
    }
}

function browseCategory(category) {
    if (elements.searchInput) {
        elements.searchInput.value = category;
        handleSearch();
    }
    showNotification(`Browsing ${category} papers...`, 'info');
}

function reinitializeFeatures() {
    initializePageFeatures();
    attachSidebarLinkListeners();
    restoreIcons();
    console.log('Features reinitialized');
}

const observer = new MutationObserver(function (mutations) {
    let shouldReinitialize = false;

    mutations.forEach(function (mutation) {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
            for (let node of mutation.addedNodes) {
                if (node.nodeType === 1) {
                    if (node.classList && (
                        node.classList.contains('search-results') ||
                        node.classList.contains('question-item') ||
                        node.classList.contains('answer-form') ||
                        node.classList.contains('modal')
                    )) {
                        shouldReinitialize = true;
                        break;
                    }
                }
            }
        }
    });

    if (shouldReinitialize) {
        setTimeout(reinitializeFeatures, 100);
    }
});

if (document.body) {
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
}

// Notification system
function showNotification(message, type = 'info') {
    let notificationContainer = document.getElementById('notificationContainer');
    if (!notificationContainer) {
        notificationContainer = document.createElement('div');
        notificationContainer.id = 'notificationContainer';
        notificationContainer.className = 'notification-container';
        document.body.appendChild(notificationContainer);
    }

    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;

    const icon = getNotificationIcon(type);
    notification.innerHTML = `
        <div class="notification-content">
            <i class="${icon}"></i>
            <span>${message}</span>
        </div>
        <button class="notification-close" onclick="closeNotification(this)">&times;</button>
    `;

    notificationContainer.appendChild(notification);

    setTimeout(() => {
        if (notification.parentNode) {
            notification.classList.add('notification-fade-out');
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.remove();
                }
            }, 300);
        }
    }, 4000);
}

function getNotificationIcon(type) {
    const icons = {
        success: 'fas fa-check-circle',
        error: 'fas fa-exclamation-circle',
        warning: 'fas fa-exclamation-triangle',
        info: 'fas fa-info-circle'
    };
    return icons[type] || icons.info;
}

function closeNotification(button) {
    const notification = button.closest('.notification');
    notification.classList.add('notification-fade-out');
    setTimeout(() => {
        if (notification.parentNode) {
            notification.remove();
        }
    }, 300);
}

// Initialize event listeners
function initializeEventListeners() {
    const requiredElements = ['burgerMenuBtn', 'navbarLinks', 'appSidebar', 'loginModal', 'registerModal'];
    const missingElements = requiredElements.filter(id => !elements[id]);

    if (missingElements.length > 0) {
        console.warn('Missing DOM elements:', missingElements);
    }

    if (elements.burgerMenuBtn) {
        elements.burgerMenuBtn.addEventListener("click", (event) => {
            event.stopPropagation();
            toggleSidebar();
        });
    }

    // Initial attachment of nav link listeners
    attachNavLinkListeners();

    if (elements.closeLoginModal) {
        elements.closeLoginModal.addEventListener("click", () => hideModal(elements.loginModal));
    }

    if (elements.closeRegisterModal) {
        elements.closeRegisterModal.addEventListener("click", () => hideModal(elements.registerModal));
    }

    if (elements.closeLogoutModal) {
        elements.closeLogoutModal.addEventListener("click", () => hideModal(elements.logoutModal));
    }

    if (elements.cancelLogout) {
        elements.cancelLogout.addEventListener("click", () => hideModal(elements.logoutModal));
    }

    if (elements.confirmLogout) {
        elements.confirmLogout.addEventListener("click", confirmLogout);
    }

    window.addEventListener("click", (event) => {
        if (event.target === elements.loginModal) {
            hideModal(elements.loginModal);
        }
        if (event.target === elements.registerModal) {
            hideModal(elements.registerModal);
        }
        if (event.target === elements.logoutModal) {
            hideModal(elements.logoutModal);
        }
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === 'Escape') {
            hideAllModals();
            closeSidebar();
        }
    });

    document.addEventListener("click", (event) => {
        if (elements.appSidebar && elements.appSidebar.classList.contains("is-visible")) {
            if (!elements.appSidebar.contains(event.target) &&
                !elements.burgerMenuBtn.contains(event.target)) {
                closeSidebar();
            }
        }
    });

    let scrollTimeout;
    window.addEventListener("scroll", () => {
        if (elements.appSidebar && elements.appSidebar.classList.contains("is-visible")) {
            clearTimeout(scrollTimeout);
            scrollTimeout = setTimeout(() => {
                closeSidebar();
            }, 0);
        }
    });

    window.addEventListener("resize", () => {
        if (elements.appSidebar && elements.appSidebar.classList.contains("is-visible")) {
            closeSidebar();
        }
    });

    if (elements.loginForm) {
        elements.loginForm.removeEventListener("submit", handleLogin);
        elements.loginForm.addEventListener("submit", handleLogin);
        console.log("Login form listener attached");
    }

    if (elements.googleLoginBtn) {
        elements.googleLoginBtn.addEventListener("click", handleGoogleLogin);
    }

    attachSidebarLinkListeners();

    if (elements.searchBtn) {
        elements.searchBtn.addEventListener("click", handleSearch);
    }

    if (elements.searchInput) {
        elements.searchInput.addEventListener("keypress", (event) => {
            if (event.key === "Enter") {
                handleSearch();
            }
        });
    }

    document.addEventListener("click", (event) => {
        if (window.innerWidth <= 768) {
            if (elements.appSidebar && elements.burgerMenuBtn) {
                if (!elements.appSidebar.contains(event.target) &&
                    !elements.burgerMenuBtn.contains(event.target) &&
                    elements.appSidebar.classList.contains("is-visible")) {
                    elements.appSidebar.classList.remove("is-visible");
                }
            }
        }
    });

    // Switch between login and register modals - FIXED VERSION
    const switchToRegister = document.getElementById('switchToRegister');
    const switchToLogin = document.getElementById('switchToLogin');

    if (switchToRegister) {
        switchToRegister.onclick = (e) => {
            e.preventDefault();
            hideModal(elements.loginModal);
            showModal(elements.registerModal);

            // 🔥 Attach register listener AFTER modal opens
            setTimeout(() => {
                const form = document.getElementById("registerForm");
                if (form) {
                    form.removeEventListener("submit", handleRegister);
                    form.addEventListener("submit", handleRegister);
                    console.log("🔥 Register listener finally attached (modal visible)");
                }
            }, 100);
        };
    }


    if (switchToLogin) {
        switchToLogin.onclick = (e) => {
            e.preventDefault();
            hideModal(elements.registerModal);
            showModal(elements.loginModal);

            console.log("🪄 Login modal opened — rebinding handleLogin...");
            const form = document.getElementById("loginForm");
            if (form) {
                form.removeEventListener("submit", handleLogin);
                form.addEventListener("submit", handleLogin);
                console.log("✅ handleLogin rebound to visible login form");
            } else {
                console.warn("⚠️ Login form not found when modal opened");
            }
        };
    }


    // Google register button (same functionality as login)
    const googleRegisterBtn = document.getElementById('googleRegisterBtn');
    if (googleRegisterBtn) {
        googleRegisterBtn.addEventListener('click', handleGoogleLogin);
    }
}

function addFormValidation() {
    const forms = document.querySelectorAll('form');
    forms.forEach(form => {
        const inputs = form.querySelectorAll('input[required]');
        inputs.forEach(input => {
            input.addEventListener('blur', function () {
                if (this.value.trim() === '') {
                    this.classList.add('error');
                } else {
                    this.classList.remove('error');
                    this.classList.add('success');
                }
            });

            input.addEventListener('input', function () {
                if (this.value.trim() !== '') {
                    this.classList.remove('error');
                }
            });
        });
    });
}


// AUTH STATE & ROLE MANAGEMENT 
if (firebaseAuth) {
    onAuthStateChanged(firebaseAuth, async (user) => {
        currentUser = user;
        settingsAuthResolved = true;
        updateUserStatus(user);
        console.log("Auth state changed:", user ? "✅ User logged in" : "🚪 User logged out");

        // --- Handle logged-out users ---
        if (!user) {
            currentUserRole = "guest";
            if (window.location.pathname.includes("profile.html")) resetProfileForm();
            return;
        }

        try {
            // --- Retrieve user record ---
            const userDocRef = doc(firebaseDb, "users", user.uid);
            const userSnap = await getDoc(userDocRef);

            if (userSnap.exists()) {
                const userData = userSnap.data();
                currentUserRole = userData.role || "user";
                console.log("Detected role:", currentUserRole);

                // 🚫 Check for ban status immediately after login
                const isBanned = await checkIfUserBanned(user);
                if (isBanned) return;

            } else {
                currentUserRole = "user";
            }
        } catch (error) {
            console.error("Error retrieving user data:", error);
            currentUserRole = "user";
        }

        // Update sidebar access after role load 
        updateAdminSidebarAccess();

        // PAGE-SPECIFIC LOGIC 
        if (window.location.pathname.includes("profile.html")) {
            console.log("📄 Loading profile page...");
            updateAvatarInitials(user.displayName || user.email);
            populateProfileWithDefaults();
            setTimeout(async () => await loadProfileData(), 200);
        }

        if (window.location.pathname.includes("settings.html")) {
            console.log("⚙️ Loading settings data...");
            populateSettingsWithDefaults();
            setTimeout(async () => await loadSettingsData(), 300);
        }

        // LOGIN REMINDER (for settings)
        if (!user && window.location.pathname.includes("settings.html") && !settingsLoginWarned) {
            settingsLoginWarned = true;
            showNotification("Please log in to access settings", "warning");
        }
    });
} else {
    console.warn("⚠️ Firebase auth not available, skipping auth observer");
}

// ✅ Ensure login submit buttons trigger the form submit
document.addEventListener("click", (e) => {
    if (e.target.matches("#loginForm button[type='submit']")) {
        console.log("💡 Forcing native form submit for login");
        e.target.closest("form").requestSubmit();
    }
});


// Initialize the application
function initializeResearchApp() {
    ensureIconsLoaded();
    initializeEventListeners();
    initializePageFeatures();

    // Add password helpers
    setTimeout(setupPasswordHelpers, 500);

    console.log("ResearchScholar app initialized!");
}

// Wait for DOM to be fully loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeResearchApp);
} else {
    initializeResearchApp();
}


// 📘 QUESTIONS PAGE
if (window.location.pathname.includes("questions.html")) {
    window.currentQuestionId = null;
    // will hold the realtime unsubscribe function for the current question detail view
    window.questionDetailUnsubscribe = null;

    // --- GET ELEMENTS FROM THE PAGE ---
    const questionsListView = document.getElementById("questionsListView");
    const questionDetailView = document.getElementById("questionDetailView");

    const questionDetailTitle = document.getElementById("questionDetailTitle");
    const questionDetailAuthor = document.getElementById("questionDetailAuthor");
    const questionDetailDate = document.getElementById("questionDetailDate");
    const questionDetailCategory = document.getElementById("questionDetailCategory");
    const questionDetailText = document.getElementById("questionDetailText");
    const questionDetailTags = document.getElementById("questionDetailTags");

    const answersList = document.getElementById("answersList");
    const answerFormContainer = document.getElementById("answerFormContainer");
    const answerQuestionBtn = document.getElementById("answerQuestionBtn");
    const cancelAnswerBtn = document.getElementById("cancelAnswerBtn");
    const submitAnswerBtn = document.getElementById("submitAnswerBtn");
    const backToQuestionsBtn = document.getElementById("backToQuestionsBtn");
    const answerText = document.getElementById("answerText");

    // fallback checks to avoid runtime errors if an element is missing
    function el(id) { return document.getElementById(id); }

    // --- UTILS ---
    function escapeHtml(str) {
        if (!str && str !== 0) return "";
        return String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    // simple safe remove helper
    function safeRemove(selectorOrEl) {
        const el = (typeof selectorOrEl === "string") ? document.querySelector(selectorOrEl) : selectorOrEl;
        if (el && el.parentNode) el.parentNode.removeChild(el);
    }

    // showNotification is expected to exist globally — fallback to console
    if (typeof showNotification !== "function") {
        window.showNotification = (msg, type) => console.log(`[${type || "info"}] ${msg}`);
    }

    // small utility to create an element from html string
    function createFromHTML(html) {
        const tpl = document.createElement("template");
        tpl.innerHTML = html.trim();
        return tpl.content.firstChild;
    }

    // LOAD QUESTIONS: Firestore-backed (complete, robust, idempotent render)
    async function loadQuestions() {
        const questionsContainer = document.getElementById("questionsContainer");
        if (!questionsContainer) {
            console.warn("Questions list container not found in DOM");
            return [];
        }

        // Prevent duplicate renderings by clearing first and cancelling any existing loading state
        questionsContainer.innerHTML = `
            <div class="loading-state">
                <i class="fas fa-spinner fa-spin"></i>
                <p>Loading questions...</p>
            </div>
        `;

        try {
            // Query: get latest questions
            const qSnap = await getDocs(query(collection(firebaseDb, "questions"), orderBy("createdAt", "desc")));

            if (!qSnap || qSnap.empty) {
                questionsContainer.innerHTML = `
                    <div class="no-questions empty-state">
                        <i class="fas fa-inbox"></i>
                        <p>No questions found.</p>
                    </div>
                `;
                return [];
            }

            // Build a lightweight array of question data to return (useful for callers)
            const questions = [];

            // Clear container before appending
            questionsContainer.innerHTML = "";

            qSnap.forEach((docSnap) => {
                const q = docSnap.data() || {};
                const qId = docSnap.id;

                questions.push({ id: qId, ...q });

                // Create card element (keeps markup consistent with your CSS)
                const card = document.createElement("div");
                card.className = "question-card";
                card.dataset.id = qId;

                const authorName = q.authorName || "Anonymous";
                const createdDate = q.createdAt ? new Date(q.createdAt).toLocaleDateString() : "";

                // Build inner HTML using escapeHtml
                card.innerHTML = `
                    <div class="question-card-header">
                        <h3>${escapeHtml(q.title || "(no title)")}</h3>
                        <div class="category-badge">${escapeHtml(q.category || "")}</div>
                    </div>

                    <div class="question-card-meta">
                        <span>Asked by <strong>${escapeHtml(authorName)}</strong></span>
                        <span>•</span>
                        <span>${escapeHtml(createdDate)}</span>
                    </div>

                    <p class="question-card-text">${escapeHtml((q.details || "").substring(0, 200))}${(q.details && q.details.length > 200) ? "..." : ""}</p>

                    <div class="question-card-tags">
                        ${(q.tags || []).map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}
                    </div>

                    <div class="question-card-actions">
                        <button class="btn btn-small" data-action="view" data-id="${qId}">
                            <i class="fas fa-eye"></i> View Details
                        </button>
                        <button class="btn btn-secondary btn-small" data-action="answer" data-id="${qId}">
                            <i class="fas fa-reply"></i> Answer
                        </button>
                        ${(currentUser && q.authorId === currentUser.uid) ? `
                        <button class="btn btn-danger btn-small" data-action="delete" data-id="${qId}">
                            <i class="fas fa-trash"></i> Delete
                        </button>` : ""}
                    </div>
                `;

                // append card
                questionsContainer.appendChild(card);
            });

            // After cards appended, attach a single delegated listener to container
            // This avoids adding many click handlers to individual buttons.
            // First remove any previous handler we attached (idempotent).
            const existingHandlerFlag = "__questions_click_delegation";
            if (!questionsContainer[existingHandlerFlag]) {
                questionsContainer.addEventListener("click", function (ev) {
                    const btn = ev.target.closest("button[data-action]");
                    if (!btn) return;
                    const action = btn.dataset.action;
                    const id = btn.dataset.id;
                    if (action === "view") {
                        // open detail view
                        if (typeof window.openQuestionDetail === "function") {
                            window.openQuestionDetail(id);
                        } else {
                            console.warn("openQuestionDetail not defined");
                        }
                    } else if (action === "answer") {
                        if (typeof window.showAnswerModal === "function") {
                            window.showAnswerModal(id);
                        } else {
                            console.warn("showAnswerModal not defined");
                        }
                    } else if (action === "delete") {
                        if (typeof window.deleteQuestion === "function") {
                            window.deleteQuestion(id);
                        } else {
                            // fallback confirmation + delete logic (best-effort)
                            (async () => {
                                if (await showConfirmModal("Delete this question?")) {
                                    const qRef = doc(firebaseDb, "questions", id);
                                    deleteDoc(qRef).then(() => {
                                        showNotification("Question deleted", "success");
                                        // reload list
                                        loadQuestions().catch(e => console.warn(e));
                                    }).catch(e => {
                                        console.error("delete error:", e);
                                        showNotification("Failed to delete question", "error");
                                    });
                                }
                            })();
                        }
                    }
                });
                questionsContainer[existingHandlerFlag] = true;
            }

            // Return questions array for possible callers (keeps compatibility)
            return questions;

        } catch (error) {
            console.error("Error loading questions:", error);
            questionsContainer.innerHTML = `
                <div class="error-state">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>Failed to load questions. Please try again later.</p>
                </div>
            `;
            return [];
        }
    }

    // Answer Modal-
    window.showAnswerModal = function (questionId) {
        if (!currentUser) {
            showNotification("Please log in to answer questions", "warning");
            if (typeof showModal === "function" && elements?.loginModal) {
                showModal(elements.loginModal);
            }
            return;
        }

        safeRemove("#quickAnswerModal");

        const modal = createFromHTML(`
            <div class="modal" id="quickAnswerModal">
                <div class="modal-content" style="max-width:600px;">
                    <button class="close-modal-btn" id="closeQuickAnswerModalBtn">&times;</button>
                    <h2 class="modal-title"><i class="fas fa-reply"></i> Quick Answer</h2>
                    <textarea id="quickAnswerTextarea" class="form-textarea" rows="6" placeholder="Write your answer..."></textarea>
                    <div class="modal-actions" style="display:flex; justify-content:flex-end; gap:0.5rem;">
                        <button class="btn btn-secondary" id="cancelQuickAnswerBtn">Cancel</button>
                        <button class="btn" id="submitQuickAnswerBtn"><i class="fas fa-paper-plane"></i> Submit</button>
                    </div>
                </div>
            </div>
        `);

        document.body.appendChild(modal);
        setTimeout(() => modal.classList.add("is-visible"), 10);

        const textarea = el("quickAnswerTextarea");
        const close = () => modal.remove();

        el("closeQuickAnswerModalBtn").onclick = close;
        el("cancelQuickAnswerBtn").onclick = close;
        modal.onclick = e => (e.target === modal ? close() : null);

        el("submitQuickAnswerBtn").onclick = async () => {
            const text = textarea.value.trim();
            if (!text) return showNotification("Answer cannot be empty", "warning");

            const btn = el("submitQuickAnswerBtn");
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Posting...';

            try {
                await addDoc(collection(firebaseDb, "questions", questionId, "responses"), {
                    authorId: currentUser.uid,
                    authorName: currentUser.displayName || "Anonymous",
                    text,
                    upvotes: 0,
                    upvotedBy: [],
                    createdAt: serverTimestamp(),
                });

                await updateDoc(doc(firebaseDb, "questions", questionId), {
                    answers: increment(1),
                });

                showNotification("Answer posted!", "success");
                close();

                if (typeof loadQuestionResponses === "function") {
                    loadQuestionResponses(questionId);
                }
            } catch (err) {
                console.error(err);
                showNotification("Failed to post.", "error");
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit';
            }
        };

        setTimeout(() => textarea?.focus(), 50);
    };

    //View Question Detail
    window.openQuestionDetail = async function (questionId) {
        try {
            const qRef = doc(firebaseDb, "questions", questionId);
            const qSnap = await getDoc(qRef);

            if (!qSnap.exists()) {
                showNotification("Not found", "error");
                return;
            }

            const q = qSnap.data();
            let updatedViews = q.views || 0;

            // ✅ Handle view count (one per user)
            if (currentUser) {
                const userId = currentUser.uid;
                const viewedBy = q.viewedBy || [];

                if (!viewedBy.includes(userId)) {
                    await updateDoc(qRef, {
                        views: increment(1),
                        viewedBy: arrayUnion(userId)
                    });
                    updatedViews += 1;
                }
            }

            // ✅ Update view count in UI
            el("questionDetailViews").textContent = updatedViews;

            // ✅ Populate title, author, category, text, tags
            questionDetailTitle.textContent = q.title || "";
            questionDetailAuthor.textContent = q.authorName || "Anonymous";
            questionDetailCategory.textContent = q.category || "";
            questionDetailText.textContent = q.details || "";
            questionDetailTags.innerHTML = (q.tags || [])
                .map(t => `<span class="tag">${escapeHtml(t)}</span>`)
                .join("");

            // ✅ Convert Firestore Timestamp / number / Date to actual Date
            let createdDate;
            if (q.createdAt?.toDate) {
                createdDate = q.createdAt.toDate();
            } else if (typeof q.createdAt === "number") {
                createdDate = new Date(q.createdAt);
            } else {
                createdDate = q.createdAt ? new Date(q.createdAt) : null;
            }

            if (createdDate) {
                // ✅ Relative time under title (e.g., "3 hours ago")
                questionDetailDate.textContent = getTimeAgo(q.createdAt);

                // ✅ Full timestamp in "Asked on ..."
                const fullDate = createdDate.toLocaleString();
                const askedOnEl = el("questionDetailDateSmall");
                if (askedOnEl) {
                    askedOnEl.textContent = fullDate;
                }
            } else {
                questionDetailDate.textContent = "";
                const askedOnEl = el("questionDetailDateSmall");
                if (askedOnEl) {
                    askedOnEl.textContent = "";
                }
            }

            // ✅ Get real answer count from Firestore
            try {
                const responsesRef = collection(firebaseDb, "questions", questionId, "responses");
                const rSnap = await getDocs(responsesRef);
                el("questionDetailAnswers").textContent = rSnap.size;
            } catch (err) {
                console.warn("Failed to compute real answer count:", err);
                el("questionDetailAnswers").textContent = q.answers || 0;
            }

            // ✅ Upvotes
            el("questionDetailUpvotes").textContent = Math.max(0, q.upvotes || 0);

            // ✅ Show the detail view
            questionsListView.style.display = "none";
            questionDetailView.style.display = "block";

            // Attach a realtime listener for the question doc so the UI updates live (upvotes, answers count)
            try {
                if (typeof window.questionDetailUnsubscribe === 'function') {
                    try { window.questionDetailUnsubscribe(); } catch (e) { /* ignore */ }
                    window.questionDetailUnsubscribe = null;
                }

                window.questionDetailUnsubscribe = onSnapshot(qRef, (liveSnap) => {
                    if (!liveSnap.exists()) return;
                    const live = liveSnap.data() || {};

                    // update upvotes display
                    const upEl = document.getElementById('questionDetailUpvotes');
                    if (upEl) upEl.textContent = Math.max(0, live.upvotes || 0);

                    // update upvote button visual
                    const upBtn = document.getElementById('upvoteQuestionBtn');
                    if (upBtn) {
                        upBtn.classList.add('btn-upvote');
                        const nowUpvoted = (live.upvotedBy || []).includes(currentUser?.uid);
                        if (nowUpvoted) {
                            upBtn.classList.add('active');
                            upBtn.innerHTML = `<i class="fas fa-thumbs-up"></i> <span id="questionDetailUpvotes">${Math.max(0, live.upvotes || 0)}</span>`;
                        } else {
                            upBtn.classList.remove('active');
                            upBtn.innerHTML = `<i class="fas fa-thumbs-up"></i> <span id="questionDetailUpvotes">${Math.max(0, live.upvotes || 0)}</span>`;
                        }
                    }

                    // update answers count if present
                    const answersCntEl = document.getElementById('questionDetailAnswers');
                    if (answersCntEl && typeof live.answers === 'number') answersCntEl.textContent = live.answers;
                }, (err) => {
                    console.warn('Realtime subscription failed for question detail:', err);
                });
            } catch (err) {
                console.warn('Could not attach realtime listener to question:', err);
            }

            // ✅ Load responses
            if (typeof loadQuestionResponses === "function") {
                loadQuestionResponses(questionId);
            }

            // ✅ Store global for submitAnswer
            window.currentQuestionId = questionId;

        } catch (error) {
            console.error("openQuestionDetail error:", error);
            showNotification("Error loading question", "error");
        }
    };

    window.viewQuestionDetail = window.openQuestionDetail;



    // --- Back Button ---
    backToQuestionsBtn?.addEventListener("click", () => {
        questionDetailView.style.display = "none";
        questionsListView.style.display = "block";
    });

    // --- INITIALIZE PAGE AFTER AUTH ---
    onAuthStateChanged(firebaseAuth, (user) => {
        currentUser = user;
        setTimeout(() => {
            // ✅ Use ONLY the modern rendering system!
            if (typeof loadAndDisplayQuestions === "function") {
                loadAndDisplayQuestions("all");
            } else {
                // Fallback to legacy fetch if needed
                loadQuestions();
            }
        }, 250);
    });

    // --- Export aliases (for backward compatibility) ---
    window.loadQuestions = loadQuestions; // Now returns data AND renders
    window.loadQuestionsFromFirebase = loadQuestions;
}

// === ADMIN PAGE ACCESS PROTECTION ===
if (window.location.pathname.includes("admin.html")) {
    console.log("🔒 Admin page detected — verifying access...");

    onAuthStateChanged(firebaseAuth, async (user) => {
        const accessCheck = document.getElementById("adminAccessCheck");
        const dashboard = document.getElementById("adminDashboard");

        if (!user) {
            await showAlertModal("You must be logged in to access the Admin Panel.");
            window.location.href = "index.html";
            return;
        }

        try {
            const userDocRef = doc(firebaseDb, "users", user.uid);
            const userSnap = await getDoc(userDocRef);

            if (userSnap.exists() && userSnap.data().role === "admin") {
                console.log("✅ Access granted: Admin user");
                if (accessCheck) accessCheck.style.display = "none";
                if (dashboard) dashboard.style.display = "block";

                await loadAdminDashboardStats();
            } else {
                await showAlertModal("🚫 Access Denied: You are not an admin.");
                window.location.href = "index.html";
            }
        } catch (error) {
            console.error("Error verifying admin role:", error);
            window.location.href = "index.html";
        }
    });
}
// === ADMIN DASHBOARD STATS ===
async function loadAdminDashboardStats() {
    try {
        console.log("📊 Loading admin dashboard stats...");

        const usersCountEl = document.getElementById("totalUsersCount");
        const papersCountEl = document.getElementById("totalPapersCount");
        const questionsCountEl = document.getElementById("totalQuestionsCount");

        // Safety check
        if (!usersCountEl || !firebaseDb) {
            console.warn("Stats elements or Firebase not found.");
            return;
        }

        // Import Firestore utilities
        const { getDocs, collection } = await import("https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js");

        // === Users count ===
        const usersSnapshot = await getDocs(collection(firebaseDb, "users"));
        usersCountEl.textContent = usersSnapshot.size.toLocaleString();

        // === Papers count ===
        try {
            const papersSnapshot = await getDocs(collection(firebaseDb, "papers"));
            papersCountEl.textContent = papersSnapshot.size.toLocaleString();
        } catch {
            papersCountEl.textContent = "0";
        }

        // === Questions count ===
        try {
            const questionsSnapshot = await getDocs(collection(firebaseDb, "questions"));
            questionsCountEl.textContent = questionsSnapshot.size.toLocaleString();
        } catch {
            questionsCountEl.textContent = "0";
        }

        console.log("✅ Admin stats loaded successfully!");
    } catch (error) {
        console.error("Error loading admin stats:", error);
    }
}

// === ADMIN MANAGE USERS LOGIC ===
const manageUsersBtn = document
    .querySelector(".admin-tool-btn i.fa-user-cog")
    ?.closest("button");
const manageUsersModal = document.getElementById("manageUsersModal");
const closeManageUsers = document.getElementById("closeManageUsers");
const usersTableBody = document.getElementById("usersTableBody");

// === LOAD ALL USERS (WITH BAN/UNBAN SUPPORT) ===
async function loadAllUsers() {
    if (!firebaseDb) return;
    usersTableBody.innerHTML = `<tr><td colspan="4">Loading users...</td></tr>`;

    try {
        const querySnapshot = await getDocs(collection(firebaseDb, "users"));
        if (querySnapshot.empty) {
            usersTableBody.innerHTML = `<tr><td colspan="4">No users found</td></tr>`;
            return;
        }

        let rows = "";
        querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const userId = docSnap.id;
            const role = data.role || "user";

            const actionBtn =
                role === "banned"
                    ? `<button class="btn btn-success unban-btn" data-id="${userId}">Unban</button>`
                    : `<button class="btn btn-danger ban-btn" data-id="${userId}">Ban</button>`;

            rows += `
                <tr>
                    <td>${data.fullName || "—"}</td>
                    <td>${data.email || "—"}</td>
                    <td>${role}</td>
                    <td>${actionBtn}</td>
                </tr>
            `;
        });

        usersTableBody.innerHTML = rows;

        // --- BAN USER ---
        document.querySelectorAll(".ban-btn").forEach((btn) => {
            btn.addEventListener("click", async (e) => {
                const userId = e.target.dataset.id;
                if (!(await showConfirmModal("Are you sure you want to ban this user?"))) return;

                try {
                    await updateDoc(doc(firebaseDb, "users", userId), { role: "banned" });
                    await showAlertModal("🚫 User has been banned.");
                    loadAllUsers(); // refresh table
                } catch (error) {
                    console.error("Error banning user:", error);
                    await showAlertModal("Failed to ban user. Check console for details.");
                }
            });
        });

        // --- UNBAN USER ---
        document.querySelectorAll(".unban-btn").forEach((btn) => {
            btn.addEventListener("click", async (e) => {
                const userId = e.target.dataset.id;
                if (!(await showConfirmModal("Are you sure you want to unban this user?"))) return;

                try {
                    await updateDoc(doc(firebaseDb, "users", userId), { role: "user" });
                    await showAlertModal("✅ User has been unbanned.");
                    loadAllUsers(); // refresh table
                } catch (error) {
                    console.error("Error unbanning user:", error);
                    await showAlertModal("Failed to unban user. Check console for details.");
                }
            });
        });

    } catch (error) {
        console.error("Error loading users:", error);
        usersTableBody.innerHTML = `<tr><td colspan="4">Failed to load users</td></tr>`;
    }
}

// === OPEN / CLOSE MODAL ===
manageUsersBtn?.addEventListener("click", () => {
    manageUsersModal.style.display = "block";
    loadAllUsers();
});

closeManageUsers?.addEventListener("click", () => {
    manageUsersModal.style.display = "none";
});

window.addEventListener("click", (e) => {
    if (e.target === manageUsersModal) {
        manageUsersModal.style.display = "none";
    }
});
// === ADMIN MODERATE QUESTIONS LOGIC ===
const moderateQuestionsBtn = document.querySelector(".admin-tool-btn i.fa-comments")?.closest("button");
const moderateQuestionsModal = document.getElementById("moderateQuestionsModal");
const closeModerateQuestions = document.getElementById("closeModerateQuestions");
const questionsTableBody = document.getElementById("questionsTableBody");

// === Helper: Format Firestore dates safely ===
function formatFirestoreDate(dateValue) {
    if (!dateValue) return "—";
    try {
        if (dateValue.toDate) return dateValue.toDate().toLocaleString(); // Firestore Timestamp
        if (typeof dateValue === "string") return new Date(dateValue).toLocaleString();
        if (dateValue instanceof Date) return dateValue.toLocaleString();
        return "—";
    } catch {
        return "—";
    }
}

// Load all questions for ADMIN moderation
async function loadAllQuestionsForAdmin() {
    if (!firebaseDb) return;
    questionsTableBody.innerHTML = `<tr><td colspan="4">Loading questions...</td></tr>`;

    try {
        const querySnapshot = await getDocs(collection(firebaseDb, "questions"));
        if (querySnapshot.empty) {
            questionsTableBody.innerHTML = `<tr><td colspan="4">No questions found</td></tr>`;
            return;
        }

        let rows = "";
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            const questionId = doc.id;
            const content = data.title || data.content || "(No content)";
            const author = data.authorEmail || data.authorName || "Unknown";
            const date = formatFirestoreDate(data.createdAt);


            rows += `
                <tr>
                    <td>${content}</td>
                    <td>${author}</td>
                    <td>${date}</td>
                    <td><button class="btn btn-danger delete-question-btn" data-id="${questionId}">Delete</button></td>
                </tr>
            `;
        });

        questionsTableBody.innerHTML = rows;

        // Attach event listeners for delete buttons
        document.querySelectorAll(".delete-question-btn").forEach((btn) => {
            btn.addEventListener("click", async (e) => {
                const questionId = e.target.dataset.id;
                if (await showConfirmModal("Are you sure you want to delete this question and all its responses?")) {
                    await deleteQuestionAsAdmin(questionId);
                }
            });
        });
    } catch (error) {
        console.error("Error loading questions:", error);
        questionsTableBody.innerHTML = `<tr><td colspan="4">Failed to load questions</td></tr>`;
    }
}

// Delete question and all its responses as admin
async function deleteQuestionAsAdmin(questionId) {
    try {
        const questionRef = doc(firebaseDb, "questions", questionId);
        const responsesRef = collection(questionRef, "responses");

        // 1️⃣ Delete all subcollection responses first
        const responsesSnapshot = await getDocs(responsesRef);
        const deletePromises = [];
        responsesSnapshot.forEach((responseDoc) => {
            deletePromises.push(deleteDoc(responseDoc.ref));
        });
        await Promise.all(deletePromises);

        // 2️⃣ Delete the question itself
        await deleteDoc(questionRef);

        console.log("🗑️ Deleted question and its responses:", questionId);
        loadAllQuestionsForAdmin();
    } catch (error) {
        console.error("Error deleting question:", error);
        await showAlertModal("Failed to delete question.");
    }
}

// Open modal
moderateQuestionsBtn?.addEventListener("click", () => {
    moderateQuestionsModal.style.display = "block";
    loadAllQuestionsForAdmin();
});

// Close modal
closeModerateQuestions?.addEventListener("click", () => {
    moderateQuestionsModal.style.display = "none";
});

// Optional: close modal when clicking outside
window.addEventListener("click", (e) => {
    if (e.target === moderateQuestionsModal) {
        moderateQuestionsModal.style.display = "none";
    }
});


// ADMIN: MANAGE PAPERS (FINAL PATCHED VERSION)

(() => {

    // ELEMENTS
    const managePapersBtn =
        document.getElementById("managePapersBtn") ||
        document.querySelector('.admin-tool-btn i.fa-database')?.closest("button");

    const managePapersModal = document.getElementById("managePapersModal");
    const closeManagePapersModal = document.getElementById("closeManagePapersModal");

    const pendingPapersBody = document.getElementById("pendingPapersBody");
    const managePapersSearch = document.getElementById("managePapersSearch");
    const refreshPendingPapersBtn = document.getElementById("refreshPendingPapersBtn");

    // Preview modal
    const paperPreviewModal = document.getElementById("paperPreviewModal");
    const closePaperPreview = document.getElementById("closePaperPreview");
    const previewPaperTitle = document.getElementById("previewPaperTitle");
    const previewPaperAuthors = document.getElementById("previewPaperAuthors");
    const previewPaperCategory = document.getElementById("previewPaperCategory");
    const previewPaperUploader = document.getElementById("previewPaperUploader");
    const previewPaperDate = document.getElementById("previewPaperDate");
    const previewPaperTags = document.getElementById("previewPaperTags");
    const previewPaperAbstract = document.getElementById("previewPaperAbstract");
    const previewDownloadBtn = document.getElementById("previewDownloadBtn");
    const previewApproveBtn = document.getElementById("previewApproveBtn");
    const previewRejectBtn = document.getElementById("previewRejectBtn");

    let pendingPapersUnsubscribe = null;
    let currentPreviewPaper = null;

    // UTILITY

    function safeDate(ts) {
        if (!ts) return "—";
        if (ts.toDate) return ts.toDate().toLocaleString();
        try { return new Date(ts).toLocaleString(); } catch { return "—"; }
    }

    function escapeHtml(str) {
        if (!str) return "";
        return String(str)
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;");
    }
    // RENDER TABLE

    function renderPendingPapers(docs) {
        pendingPapersBody.innerHTML = "";

        if (!docs.length) {
            pendingPapersBody.innerHTML = `
                <tr><td colspan="6">No pending papers found.</td></tr>
            `;
            return;
        }

        docs.forEach((p) => {
            const submitDate = p.submittedAt || p.uploadedAt || null;

            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td style="text-align:left; max-width:250px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                    ${escapeHtml(p.title || "Untitled")}
                </td>
                <td>${escapeHtml(p.authors || "—")}</td>
                <td>${escapeHtml(p.category || "—")}</td>
                <td>${escapeHtml(p.authorId || "Unknown")}</td>
                <td>${escapeHtml(safeDate(submitDate))}</td>
                <td style="display:flex; gap:0.5rem;">
                    <button class="btn btn-secondary btn-small previewPaperBtn" data-id="${p.id}">
                        <i class="fas fa-eye"></i> Preview
                    </button>
                    <button class="btn btn-small approvePaperBtn" data-id="${p.id}">
                        <i class="fas fa-check"></i> Approve
                    </button>
                    <button class="btn btn-danger btn-small rejectPaperBtn" data-id="${p.id}">
                        <i class="fas fa-times"></i> Reject
                    </button>
                </td>
            `;

            // handlers
            tr.querySelector(".previewPaperBtn")
                .addEventListener("click", () => openPreview(p));

            tr.querySelector(".approvePaperBtn")
                .addEventListener("click", () => approvePaper(p.id));

            tr.querySelector(".rejectPaperBtn")
                .addEventListener("click", () => rejectPaper(p.id));

            pendingPapersBody.appendChild(tr);
        });

        // Apply search if typed
        if (managePapersSearch.value.trim()) {
            filterPendingPapers(managePapersSearch.value.trim());
        }
    }

    function filterPendingPapers(query) {
        const q = query.toLowerCase();
        const rows = pendingPapersBody.querySelectorAll("tr");

        rows.forEach(row => {
            if (row.textContent.toLowerCase().includes(q)) {
                row.style.display = "";
            } else {
                row.style.display = "none";
            }
        });
    }

    // =========================
    // PREVIEW MODAL
    // =========================

    function openPreview(p) {
        currentPreviewPaper = p;

        previewPaperTitle.textContent = p.title || "Untitled";
        previewPaperAuthors.textContent = p.authors || "—";
        previewPaperCategory.textContent = p.category || "—";

        previewPaperUploader.textContent = p.authorId || "Unknown";

        const date = p.submittedAt || p.uploadedAt;
        previewPaperDate.textContent = safeDate(date);

        // tags
        previewPaperTags.innerHTML = "";
        if (p.tags && Array.isArray(p.tags)) {
            p.tags.forEach(tag => {
                const chip = document.createElement("span");
                chip.className = "paper-tag";
                chip.textContent = tag;
                previewPaperTags.appendChild(chip);
            });
        }

        previewPaperAbstract.textContent = p.abstract || "No abstract provided.";

        // FILE URL FIX (supports url or fileUrl)
        previewDownloadBtn.href = p.url || p.fileUrl || "#";

        paperPreviewModal.style.display = "block";
    }

    function closePreview() {
        paperPreviewModal.style.display = "none";
        currentPreviewPaper = null;
    }


    // APPROVE / REJECT

    async function approvePaper(id) {
        if (!(await showConfirmModal("Approve this paper?"))) return;

        try {
            const paperRef = doc(firebaseDb, "papers", id);
            const snap = await getDoc(paperRef);

            if (!snap.exists()) {
                await showAlertModal("Paper not found.");
                return;
            }

            const paperData = snap.data();

            // 1) Mark original as approved (for audit history)
            await updateDoc(paperRef, {
                status: "approved",
                approvedAt: serverTimestamp()
            });

            // 2) Copy paper into publishedPapers collection
            const publishedRef = collection(firebaseDb, "publishedPapers");

            await addDoc(publishedRef, {
                title: paperData.title || "",
                authors: paperData.authors || "",
                category: paperData.category || "",
                abstract: paperData.abstract || "",
                year: paperData.year || null,
                tags: paperData.tags || [],
                fileUrl: paperData.fileUrl || paperData.url || "",
                authorId: paperData.authorId || "",
                createdAt: serverTimestamp(),
                approvedId: id,
                status: "approved"
            });

            // OPTIONAL but recommended:
            // 3) Delete original pending paper
            await deleteDoc(paperRef);

            closePreview();
            await showAlertModal("Paper approved and published successfully!");

        } catch (err) {
            console.error(err);
            await showAlertModal("Error approving paper.");
        }

        await createNotification(
            "Paper Approved",
            `Your paper "${paperData.title}" has been approved and published!`,
            paperData.authorId
        );
    }


    async function rejectPaper(id) {
        if (!(await showConfirmModal("Reject this paper?"))) return;

        try {
            const ref = doc(firebaseDb, "papers", id);

            // Option A (simple): delete document
            await deleteDoc(ref);

            // Option B (if you want archive):
            // await updateDoc(ref, { status: "rejected", rejectedAt: serverTimestamp() });

            closePreview();
            await showAlertModal("Paper rejected and removed.");

        } catch (err) {
            console.error(err);
            await showAlertModal("Error rejecting paper.");
        }
    }


    // REAL-TIME LISTENER

    function startListener() {
        if (pendingPapersUnsubscribe) return;

        const ref = collection(firebaseDb, "papers");
        const q = query(ref, where("status", "==", "pending"));

        pendingPapersUnsubscribe = onSnapshot(
            q,
            (snap) => {
                const docs = snap.docs
                    .map(d => ({ id: d.id, ...d.data() }))
                    .sort((a, b) => (String(a.title || '').localeCompare(String(b.title || ''))));

                try { renderPendingPapers(docs); } catch (e) { console.error('Failed to render pending papers:', e); }
            },
            (err) => {
                console.error("Listener error:", err);
                showAlertModal("Failed to listen for pending papers:\n" + err.message);
            }
        );
    }

    function stopListener() {
        if (pendingPapersUnsubscribe) {
            pendingPapersUnsubscribe();
            pendingPapersUnsubscribe = null;
        }
    }

    // REFRESH (ONE-TIME)

    async function refreshOnce() {
        try {
            const ref = collection(firebaseDb, "papers");

            let q;
            try {
                q = query(ref, where("status", "==", "pending"), orderBy("submittedAt", "desc"));
            } catch {
                q = query(ref, where("status", "==", "pending"));
            }

            const snap = await getDocs(q);
            const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));

            renderPendingPapers(docs);
        } catch (err) {
            console.error(err);
            await showAlertModal("Error refreshing papers.");
        }
    }

    // INIT

    function init() {
        if (!managePapersBtn) return;

        managePapersBtn.addEventListener("click", () => {
            managePapersModal.style.display = "flex";
            startListener();
        });

        closeManagePapersModal.addEventListener("click", () => {
            managePapersModal.style.display = "none";
            stopListener();
        });

        managePapersSearch.addEventListener("input", (e) =>
            filterPendingPapers(e.target.value.trim())
        );

        refreshPendingPapersBtn.addEventListener("click", refreshOnce);

        closePaperPreview.addEventListener("click", closePreview);

        window.addEventListener("click", (e) => {
            if (e.target === managePapersModal) {
                managePapersModal.style.display = "none";
                stopListener();
            }
            if (e.target === paperPreviewModal) {
                closePreview();
            }
        });
    }

    if (window.location.pathname.includes("admin.html")) {
        document.addEventListener("DOMContentLoaded", init);
    }

})();

// === ADMIN: Analytics Modal for published papers ===
(function () {
    const viewAnalyticsBtn = document.getElementById('viewAnalyticsBtn');
    const analyticsModal = document.getElementById('analyticsModal');
    const closeAnalyticsModal = document.getElementById('closeAnalyticsModal');
    const analyticsPapersBody = document.getElementById('analyticsPapersBody');
    const analyticsSearch = document.getElementById('analyticsSearch');
    const refreshAnalyticsBtn = document.getElementById('refreshAnalyticsBtn');

    async function loadAnalyticsPapers() {
        if (!firebaseDb || !analyticsPapersBody) return;
        analyticsPapersBody.innerHTML = '<tr><td colspan="5">Loading...</td></tr>';

        try {
            const publishedCol = collection(firebaseDb, 'publishedPapers');
            const q = query(publishedCol, orderBy('createdAt', 'desc'));
            const snap = await getDocs(q);

            if (snap.empty) {
                analyticsPapersBody.innerHTML = '<tr><td colspan="5">No published papers found.</td></tr>';
                return;
            }

            const rows = [];
            snap.forEach(docSnap => {
                const d = docSnap.data() || {};
                const id = docSnap.id;
                const title = d.title || 'Untitled';
                const authors = d.authors || d.authorName || '';
                const category = d.category || '';
                const publishedAt = d.createdAt ? (d.createdAt.toDate ? d.createdAt.toDate().toLocaleString() : new Date(d.createdAt).toLocaleString()) : '—';
                rows.push({ id, title, authors, category, publishedAt, fileUrl: d.fileUrl || '' });
            });

            // Apply search filter if present
            const qterm = analyticsSearch?.value?.trim().toLowerCase();
            const filtered = qterm ? rows.filter(r => (r.title + ' ' + r.authors + ' ' + r.category).toLowerCase().includes(qterm)) : rows;

            analyticsPapersBody.innerHTML = filtered.map(r => `
                <tr>
                    <td style="text-align:left; max-width:360px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(r.title)}</td>
                    <td>${escapeHtml(r.authors)}</td>
                    <td>${escapeHtml(r.category)}</td>
                    <td>${escapeHtml(r.publishedAt)}</td>
                    <td style="display:flex; gap:.5rem; justify-content:flex-end;">
                        <a class="btn btn-secondary" target="_blank" rel="noopener" href="${escapeHtml(r.fileUrl || '#')}">View</a>
                        <button class="btn btn-danger analytics-delete-btn" data-id="${r.id}">Delete</button>
                    </td>
                </tr>
            `).join('');

            // Attach delete listeners
            const delBtns = analyticsPapersBody.querySelectorAll('.analytics-delete-btn');
            delBtns.forEach(b => b.addEventListener('click', async (e) => {
                const id = e.target.dataset.id;
                if (!id) return;
                if (!(await showConfirmModal('Delete this published paper record? This will remove the Firestore document but will NOT remove the Cloudinary asset.'))) return;
                try {
                    await deleteDoc(doc(firebaseDb, 'publishedPapers', id));
                    showNotification('Published paper record deleted', 'success');
                    // refresh list
                    await loadAnalyticsPapers();
                } catch (err) {
                    console.error('Failed to delete published paper:', err);
                    showNotification('Failed to delete published paper', 'error');
                }
            }));

        } catch (err) {
            console.error('Error loading analytics papers:', err);
            analyticsPapersBody.innerHTML = '<tr><td colspan="5">Failed to load published papers</td></tr>';
        }
    }

    function openAnalytics() {
        if (!analyticsModal) return;
        analyticsModal.style.display = 'flex';
        setTimeout(() => analyticsModal.classList.add('is-visible'), 10);
        loadAnalyticsPapers();
    }

    function closeAnalytics() {
        if (!analyticsModal) return;
        analyticsModal.classList.remove('is-visible');
        analyticsModal.style.display = 'none';
    }

    if (viewAnalyticsBtn) viewAnalyticsBtn.addEventListener('click', openAnalytics);
    if (closeAnalyticsModal) closeAnalyticsModal.addEventListener('click', closeAnalytics);
    if (refreshAnalyticsBtn) refreshAnalyticsBtn.addEventListener('click', loadAnalyticsPapers);
    if (analyticsSearch) analyticsSearch.addEventListener('input', () => {
        // debounce superficially
        if (analyticsSearch._timer) clearTimeout(analyticsSearch._timer);
        analyticsSearch._timer = setTimeout(loadAnalyticsPapers, 250);
    });

    // Close when clicking backdrop
    window.addEventListener('click', (e) => {
        if (e.target === analyticsModal) closeAnalytics();
    });

})();

let papersCache = [];
let activeCategory = null;
const searchInputEl = document.getElementById('searchInput');
const searchBtnEl = document.getElementById('searchBtn');
const searchResultsListEl = document.getElementById('searchResultsList');
const noResultsEl = document.getElementById('noResults');


// Fetch ONLY published (approved) papers
async function fetchApprovedPapersFromFirestore() {
    if (!firebaseDb) {
        console.error("Firestore not initialized for fetching papers");
        return [];
    }

    try {
        const publishedCol = collection(firebaseDb, 'publishedPapers');

        // Order by newest published
        const q = query(publishedCol, orderBy('createdAt', 'desc'));
        const snap = await getDocs(q);

        const papers = [];
        snap.forEach(docSnap => {
            const data = docSnap.data();

            papers.push({
                id: docSnap.id,
                title: data.title || 'Untitled',
                abstract: data.abstract || '',
                authorName: data.authors || data.authorName || data.authorId || 'Unknown',
                authorId: data.authorId || null,
                category: data.category || 'Uncategorized',
                tags: data.tags || [],
                fileUrl: data.fileUrl || '',
                uploadDate: data.createdAt ? data.createdAt.toDate?.() || new Date(data.createdAt) : null,
                views: data.views || 0,
                downloads: data.downloads || 0
            });
        });

        // cache and return
        papersCache = papers;
        return papers;
    } catch (err) {
        console.error("Error fetching published papers:", err);
        return [];
    }
}

function renderPaperCard(paper) {
    const card = document.createElement('article');
    card.className = 'search-result-item paper-card';
    card.style.cursor = 'pointer';
    card.innerHTML = `
        <div class="result-header">
            <h4>${escapeHtml(paper.title)}</h4>
            <div class="result-actions">
                <button class="btn btn-small view-btn" data-file-url="${escapeHtml(paper.fileUrl || '')}" data-paper-id="${escapeHtml(paper.id || '')}">View</button>
            </div>
        </div>
        <div class="result-meta">
            <span><i class="fas fa-user"></i> ${escapeHtml(paper.authorName)}</span>
            <span><i class="fas fa-calendar"></i> ${paper.uploadDate ? formatDate(paper.uploadDate) : '—'}</span>
            <span class="category"><i class="fas fa-folder"></i> ${escapeHtml(paper.category)}</span>
        </div>
        <p class="result-abstract">${truncate(escapeHtml(paper.abstract), 300)}</p>
        <div class="result-tags">
            ${paper.tags.map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('')}
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-top: .75rem;">
            <div style="color:#666; font-size:.9rem;">
                <span><i class="fas fa-download"></i> ${paper.downloads || 0}</span>
                <span style="margin-left:1rem;"><i class="fas fa-eye"></i> ${paper.views || 0}</span>
            </div>
            <div>
                <button class="btn btn-secondary" data-paper-id="${paper.id}" data-action="download">Download</button>
                <button class="btn" data-paper-id="${paper.id}" data-action="open">Open</button>
            </div>
        </div>
    `;

    // Attach listeners
    const viewBtn = card.querySelector('.view-btn');
    if (viewBtn) {
        viewBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openPaperDetailModal(paper);
        });
    }

    const downloadBtn = card.querySelector('button[data-action="download"]');
    if (downloadBtn) {
        downloadBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            window.open(paper.fileUrl, '_blank');
            // Optionally increment downloads counters here by calling a Firestore update
        });
    }

    const openBtn = card.querySelector('button[data-action="open"]');
    if (openBtn) {
        openBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openPaperDetailModal(paper);
        });
    }

    // Clicking card also opens detail
    card.addEventListener('click', () => openPaperDetailModal(paper));

    return card;
}

function renderPapersList(papers) {
    searchResultsListEl.innerHTML = '';
    if (!papers || papers.length === 0) {
        noResultsEl.style.display = 'block';
        return;
    }
    noResultsEl.style.display = 'none';

    const fragment = document.createDocumentFragment();
    papers.forEach(p => {
        const card = renderPaperCard(p);
        fragment.appendChild(card);
    });
    searchResultsListEl.appendChild(fragment);
}

function filterPapers({ category = activeCategory, query = (searchInputEl?.value || '').trim().toLowerCase() } = {}) {
    let filtered = papersCache.slice();

    if (category) {
        filtered = filtered.filter(p => (p.category || '').toLowerCase() === category.toLowerCase());
    }

    if (query) {
        const needle = query.toLowerCase();
        filtered = filtered.filter(p => {
            const hay = `${p.title} ${p.abstract} ${p.authorName} ${(p.tags || []).join(' ')}`.toLowerCase();
            return hay.includes(needle);
        });
    }

    renderPapersList(filtered);
}

// Exposed function used by category cards in HTML
window.browseCategory = function (categoryName) {
    activeCategory = categoryName || null;
    // visual feedback: scroll to results
    window.scrollTo({ top: document.getElementById('searchResults')?.offsetTop || 0, behavior: 'smooth' });
    filterPapers({ category: activeCategory });
};

// helper utilities
function truncate(str, max = 150) {
    if (!str) return '';
    return str.length > max ? str.slice(0, max - 1) + '…' : str;
}
function formatDate(d) {
    try {
        const dt = new Date(d);
        return dt.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    } catch (e) {
        return '';
    }
}
function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

/* Detail modal functions */
const paperDetailModal = document.getElementById('paperDetailModal');
const closePaperDetailModalBtn = document.getElementById('closePaperDetailModal');
const closePaperDetailBtn = document.getElementById('closePaperDetailBtn');

function openPaperDetailModal(paper) {
    if (!paper) return;
    document.getElementById('paperTitle').textContent = paper.title || 'Untitled';
    document.getElementById('paperAuthors').textContent = paper.authorName || '';
    document.getElementById('paperCategory').textContent = paper.category || '';
    document.getElementById('paperDate').textContent = paper.uploadDate ? formatDate(paper.uploadDate) : '—';
    document.getElementById('paperAbstract').textContent = paper.abstract || '';
    const tagsContainer = document.getElementById('paperTags');
    tagsContainer.innerHTML = '';
    (paper.tags || []).forEach(t => {
        const span = document.createElement('span');
        span.className = 'tag';
        span.style.marginRight = '6px';
        span.textContent = t;
        tagsContainer.appendChild(span);
    });

    const downloadBtn = document.getElementById('downloadPaperBtn');
    downloadBtn.href = paper.fileUrl || '#';
    downloadBtn.style.display = paper.fileUrl ? 'inline-block' : 'none';

    if (paperDetailModal) {
        paperDetailModal.classList.add('is-visible');
        paperDetailModal.setAttribute('aria-hidden', 'false');
    }
}

function closePaperDetailModal() {
    if (paperDetailModal) {
        paperDetailModal.classList.remove('is-visible');
        paperDetailModal.setAttribute('aria-hidden', 'true');
    }
}

if (closePaperDetailModalBtn) closePaperDetailModalBtn.addEventListener('click', closePaperDetailModal);
if (closePaperDetailBtn) closePaperDetailBtn.addEventListener('click', closePaperDetailModal);

// close on backdrop click
if (paperDetailModal) {
    paperDetailModal.addEventListener('click', (ev) => {
        if (ev.target === paperDetailModal) closePaperDetailModal();
    });
}

/* Initialize browse UI */
async function initializeBrowsePapers() {
    // If search elements not present, abort gracefully
    if (!searchResultsListEl || !searchInputEl) return;

    // Hide search results initially
    const searchResultsContainer = document.getElementById('searchResults');
    if (searchResultsContainer) searchResultsContainer.classList.remove('visible');

    // Wire search button & input
    if (searchBtnEl) {
        searchBtnEl.addEventListener('click', (e) => {
            e.preventDefault();
            activeCategory = activeCategory || null;
            filterPapers();
            // scroll into view
            document.getElementById('searchResults')?.scrollIntoView({ behavior: 'smooth' });
        });
    }

    // Enter key triggers search
    searchInputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            filterPapers();
            document.getElementById('searchResults')?.scrollIntoView({ behavior: 'smooth' });
        }
    });

    // First fetch approved papers (but don't display them yet)
    await fetchApprovedPapersFromFirestore();

    // Optional: refresh on interval or provide a refresh button
}

// call initialization once DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // If you have an existing initializer, this is safe to call — duplicates are guarded by element checks.
    initializeBrowsePapers().catch(err => console.error(err));
});

if (location.href.includes("published.html")) {
    initializePublishedFeatures();
}