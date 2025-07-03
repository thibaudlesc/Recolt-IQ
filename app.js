// app.js

import { 
    auth, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    onAuthStateChanged,
    signOut,
    sendPasswordResetEmail,
    db,
    doc,
    setDoc,
    getDoc,
    GoogleAuthProvider,
    signInWithPopup
} from './firebase-config.js';

import { initHarvestApp, showPaymentModal, updateActiveNav } from './harvest.js';
import { initSharing, handleShareToken } from './sharing.js';

// --- DOM Element Selection ---
const landingPage = document.getElementById('landing-page');
const authPage = document.getElementById('auth-page');
const appPage = document.getElementById('app-page');
const premiumBadge = document.getElementById('premium-badge');

const loginForm = document.getElementById('login');
const signupForm = document.getElementById('signup');
const loginContainer = document.getElementById('login-form');
const signupContainer = document.getElementById('signup-form');
const googleSignInBtn = document.getElementById('google-signin-btn');

const navLogo = document.getElementById('nav-logo');
const mobileNavLinkApp = document.getElementById('mobile-nav-link-app');
const navLinkLogin = document.getElementById('nav-link-login');
const mobileLogoutBtn = document.getElementById('mobile-logout-btn');
const ctaStartDemo = document.getElementById('cta-start-demo');
const ctaSignupDemo = document.getElementById('cta-signup-demo');
const ctaSignupPro = document.getElementById('cta-signup-pro');
const ctaFinalDemo = document.getElementById('cta-final-demo');

const showSignupLink = document.getElementById('show-signup');
const showLoginLink = document.getElementById('show-login');
const forgotPasswordLink = document.getElementById('forgot-password-link');
const authMessage = document.getElementById('auth-message');

const signupError = document.getElementById('signup-error');
const loginError = document.getElementById('login-error');

const mobileMenuButton = document.getElementById('mobile-menu-button');
const mobileMenu = document.getElementById('mobile-menu');

// --- Global State ---
let pendingToken = null;

// --- View Management ---
function showView(viewId) {
    if (landingPage) landingPage.classList.add('hidden');
    if (authPage) authPage.classList.add('hidden');
    if (appPage) appPage.classList.add('hidden');
    
    const viewToShow = document.getElementById(viewId);
    if (viewToShow) {
        viewToShow.classList.remove('hidden');
    }
    window.scrollTo(0, 0);
}

// --- UI Event Listeners ---
function safeAddEventListener(element, event, handler) {
    if (element) {
        element.addEventListener(event, handler);
    }
}

// Mobile Menu Toggle
safeAddEventListener(mobileMenuButton, 'click', () => {
    if (mobileMenu) mobileMenu.classList.toggle('hidden');
});

safeAddEventListener(showSignupLink, 'click', (e) => {
    e.preventDefault();
    if (loginContainer && signupContainer) {
        loginContainer.classList.add('hidden');
        signupContainer.classList.remove('hidden');
    }
});

safeAddEventListener(showLoginLink, 'click', (e) => {
    e.preventDefault();
    if (signupContainer && loginContainer) {
        signupContainer.classList.add('hidden');
        loginContainer.classList.remove('hidden');
    }
});

safeAddEventListener(forgotPasswordLink, 'click', async (e) => {
    e.preventDefault();
    if (!loginForm || !loginError) return;
    const email = loginForm['login-email'].value;
    if (!email) {
        loginError.textContent = "Veuillez saisir votre e-mail.";
        loginError.classList.remove('hidden');
        return;
    }
    try {
        await sendPasswordResetEmail(auth, email);
        loginError.textContent = "E-mail de réinitialisation envoyé !";
        loginError.classList.remove('text-red-500');
        loginError.classList.add('text-green-600');
        loginError.classList.remove('hidden');
    } catch (error) {
        loginError.textContent = "Erreur. L'e-mail est peut-être invalide.";
        loginError.classList.remove('hidden');
    }
});

// Main navigation
const navLandingLinks = document.querySelectorAll('.nav-landing-link');
navLandingLinks.forEach(anchor => {
    safeAddEventListener(anchor, 'click', function (e) {
        e.preventDefault();
        showView('landing-page');
        const href = this.getAttribute('href'); // FIX: Capture href to use in setTimeout
        setTimeout(() => {
            const targetElement = document.querySelector(href);
            if(targetElement) {
                targetElement.scrollIntoView({
                    behavior: 'smooth'
                });
            }
        }, 100); // Small delay to ensure the page is visible before scrolling
        if (mobileMenu) mobileMenu.classList.add('hidden');
    });
});

safeAddEventListener(navLinkLogin, 'click', (e) => { e.preventDefault(); showView('auth-page'); if (mobileMenu) mobileMenu.classList.add('hidden'); });
safeAddEventListener(navLogo, 'click', (e) => { e.preventDefault(); showView('landing-page'); });
safeAddEventListener(mobileNavLinkApp, 'click', (e) => { e.preventDefault(); showView('app-page'); if (mobileMenu) mobileMenu.classList.add('hidden'); });
safeAddEventListener(ctaStartDemo, 'click', (e) => { e.preventDefault(); showView('auth-page'); });
safeAddEventListener(ctaSignupDemo, 'click', (e) => { e.preventDefault(); showView('auth-page'); });
safeAddEventListener(ctaFinalDemo, 'click', (e) => { e.preventDefault(); showView('auth-page'); });

safeAddEventListener(ctaSignupPro, 'click', (e) => {
    e.preventDefault();
    const user = auth.currentUser;
    if (user) {
        showPaymentModal();
    } else {
        showView('auth-page');
    }
});

// --- Authentication ---

async function handleSignOut() {
    try {
        await signOut(auth);
    } catch (error) {
        console.error("Erreur de déconnexion:", error);
    }
}

safeAddEventListener(mobileLogoutBtn, 'click', handleSignOut);


async function signInWithGoogle() {
    const provider = new GoogleAuthProvider();
    try {
        const userCredential = await signInWithPopup(auth, provider);
        const user = userCredential.user;

        const userDocRef = doc(db, "users", user.uid);
        const userDocSnap = await getDoc(userDocRef);

        if (!userDocSnap.exists()) {
            await setDoc(userDocRef, {
                name: user.displayName,
                email: user.email,
                plan: 'demo'
            });
        }
    } catch (error) {
        console.error("Erreur de connexion Google:", error);
        if (loginError) {
            loginError.textContent = "Erreur de connexion avec Google.";
            loginError.classList.remove('hidden');
        }
    }
}
safeAddEventListener(googleSignInBtn, 'click', signInWithGoogle);

safeAddEventListener(signupForm, 'submit', async (e) => {
    e.preventDefault();
    const name = signupForm['signup-name'].value;
    const email = signupForm['signup-email'].value;
    const password = signupForm['signup-password'].value;
    if(signupError) signupError.classList.add('hidden');
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        await setDoc(doc(db, "users", user.uid), {
            name: name,
            email: email,
            plan: 'demo'
        });
        // FIX: Removed form reset to prevent race condition
    } catch (error) {
        console.error("Signup Error:", error); // Added for better debugging
        if(signupError) {
            signupError.textContent = "L'adresse e-mail est peut-être déjà utilisée ou invalide.";
            signupError.classList.remove('hidden');
        }
    }
});

safeAddEventListener(loginForm, 'submit', async (e) => {
    e.preventDefault();
    const email = loginForm['login-email'].value;
    const password = loginForm['login-password'].value;
    if(loginError) loginError.classList.add('hidden');
    try {
        await signInWithEmailAndPassword(auth, email, password);
        // FIX: Removed form reset to prevent race condition
    } catch (error) {
        console.error("Login Error:", error); // Added for better debugging
        if(loginError){
            loginError.textContent = "Email ou mot de passe incorrect.";
            loginError.classList.remove('hidden');
        }
    }
});

onAuthStateChanged(auth, async (user) => {
    const urlParams = new URLSearchParams(window.location.search);
    const tokenFromUrl = urlParams.get('token');

    if (tokenFromUrl && !user) {
        pendingToken = tokenFromUrl;
        if (authMessage) {
            authMessage.textContent = "Veuillez vous connecter ou créer un compte pour accepter le partage.";
            authMessage.classList.remove('hidden');
        }
        showView('auth-page');
        return;
    }

    if (user) {
        const userDocRef = doc(db, "users", user.uid);
        const userDocSnap = await getDoc(userDocRef);

        let userProfile = { plan: 'demo', name: 'Utilisateur' };
        if (userDocSnap.exists()) {
            userProfile = userDocSnap.data();
        }

        if (premiumBadge) {
            premiumBadge.classList.toggle('hidden', userProfile.plan !== 'pro');
        }
        
        showView('app-page');
        updateActiveNav('fields');
        
        // Manage mobile menu visibility
        if (mobileNavLinkApp) mobileNavLinkApp.classList.remove('hidden');
        if (mobileLogoutBtn) mobileLogoutBtn.classList.remove('hidden');
        if (navLinkLogin) navLinkLogin.classList.add('hidden');
        
        initHarvestApp(user, userProfile);
        initSharing(user, userProfile);

        const tokenToProcess = pendingToken || tokenFromUrl;
        if (tokenToProcess) {
            await handleShareToken(tokenToProcess, user);
            pendingToken = null;
        }

    } else {
        if (!pendingToken) {
            showView('landing-page');
        }
        
        // Manage mobile menu visibility
        if (mobileNavLinkApp) mobileNavLinkApp.classList.add('hidden');
        if (mobileLogoutBtn) mobileLogoutBtn.classList.add('hidden');
        if (navLinkLogin) navLinkLogin.classList.remove('hidden');

        if (premiumBadge) premiumBadge.classList.add('hidden');
        if (authMessage) authMessage.classList.add('hidden');
    }
});
