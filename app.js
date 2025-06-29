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
    getDoc
} from './firebase-config.js';

import { initHarvestApp, showPaymentModal, updateActiveNav } from './harvest.js';
import { initSharing, handleShareToken } from './sharing.js';

// --- SÉLECTION DES ÉLÉMENTS DU DOM ---
const landingPage = document.getElementById('landing-page');
const authPage = document.getElementById('auth-page');
const appPage = document.getElementById('app-page');
const premiumBadge = document.getElementById('premium-badge');

const loginForm = document.getElementById('login');
const signupForm = document.getElementById('signup');
const loginContainer = document.getElementById('login-form');
const signupContainer = document.getElementById('signup-form');

const navLogo = document.getElementById('nav-logo');
const navLinkHome = document.getElementById('nav-link-home');
const navLinkApp = document.getElementById('nav-link-app');
const navLinkLogin = document.getElementById('nav-link-login');
const navLinkLogout = document.getElementById('nav-link-logout');
const ctaStartDemo = document.getElementById('cta-start-demo');
const ctaSignupDemo = document.getElementById('cta-signup-demo');
const ctaSignupPro = document.getElementById('cta-signup-pro');

const showSignupLink = document.getElementById('show-signup');
const showLoginLink = document.getElementById('show-login');
const forgotPasswordLink = document.getElementById('forgot-password-link');
const authMessage = document.getElementById('auth-message');

const signupError = document.getElementById('signup-error');
const loginError = document.getElementById('login-error');

// --- ÉTAT GLOBAL ---
let pendingToken = null; // Stocke le jeton en attendant la connexion

// --- GESTION DE L'AFFICHAGE (VUES) ---
function showView(viewId) {
    landingPage.classList.add('hidden');
    authPage.classList.add('hidden');
    appPage.classList.add('hidden');
    
    const viewToShow = document.getElementById(viewId);
    if (viewToShow) {
        viewToShow.classList.remove('hidden');
    }
    window.scrollTo(0, 0);
}

// --- GESTION DE L'UI ---
showSignupLink.addEventListener('click', (e) => {
    e.preventDefault();
    loginContainer.classList.add('hidden');
    signupContainer.classList.remove('hidden');
});

showLoginLink.addEventListener('click', (e) => {
    e.preventDefault();
    signupContainer.classList.add('hidden');
    loginContainer.classList.remove('hidden');
});

forgotPasswordLink.addEventListener('click', async (e) => {
    e.preventDefault();
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

// Navigation principale
navLinkLogin.addEventListener('click', (e) => { e.preventDefault(); showView('auth-page'); });
navLinkHome.addEventListener('click', (e) => { e.preventDefault(); showView('landing-page'); });
navLogo.addEventListener('click', (e) => { e.preventDefault(); showView('landing-page'); });
navLinkApp.addEventListener('click', (e) => { e.preventDefault(); showView('app-page'); });
ctaStartDemo.addEventListener('click', (e) => { e.preventDefault(); showView('auth-page'); });
ctaSignupDemo.addEventListener('click', (e) => { e.preventDefault(); showView('auth-page'); });

// Bouton pour passer PRO
ctaSignupPro.addEventListener('click', (e) => {
    e.preventDefault();
    const user = auth.currentUser;
    if (user) {
        showPaymentModal();
    } else {
        showView('auth-page');
    }
});

// --- AUTHENTIFICATION ---

signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = signupForm['signup-name'].value;
    const email = signupForm['signup-email'].value;
    const password = signupForm['signup-password'].value;
    signupError.classList.add('hidden');
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        await setDoc(doc(db, "users", user.uid), {
            name: name,
            email: email,
            plan: 'demo' // Plan 'démo' par défaut
        });
        signupForm.reset();
        // La redirection se fera via onAuthStateChanged
    } catch (error) {
        signupError.textContent = "L'adresse e-mail est peut-être déjà utilisée ou invalide.";
        signupError.classList.remove('hidden');
    }
});

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = loginForm['login-email'].value;
    const password = loginForm['login-password'].value;
    loginError.classList.add('hidden');
    try {
        await signInWithEmailAndPassword(auth, email, password);
        loginForm.reset();
        // La redirection se fera via onAuthStateChanged
    } catch (error) {
        loginError.textContent = "Email ou mot de passe incorrect.";
        loginError.classList.remove('hidden');
    }
});

navLinkLogout.addEventListener('click', async () => {
    try {
        await signOut(auth);
        // Redirection gérée par onAuthStateChanged
    } catch (error) {
        console.error("Erreur de déconnexion:", error);
    }
});

// Écouteur global de l'état d'authentification
onAuthStateChanged(auth, async (user) => {
    // Vérifier s'il y a un jeton dans l'URL à chaque changement d'état
    const urlParams = new URLSearchParams(window.location.search);
    const tokenFromUrl = urlParams.get('token');

    if (tokenFromUrl && !user) {
        pendingToken = tokenFromUrl;
        authMessage.textContent = "Veuillez vous connecter ou créer un compte pour accepter le partage.";
        authMessage.classList.remove('hidden');
        showView('auth-page');
        return; // Attendre que l'utilisateur se connecte
    }

    if (user) {
        // Utilisateur connecté
        const userDocRef = doc(db, "users", user.uid);
        const userDocSnap = await getDoc(userDocRef);

        let userProfile = { plan: 'demo', name: 'Utilisateur' };
        if (userDocSnap.exists()) {
            userProfile = userDocSnap.data();
        }

        if (userProfile.plan === 'pro') {
            premiumBadge.classList.remove('hidden');
        } else {
            premiumBadge.classList.add('hidden');
        }
        
        showView('app-page');
        updateActiveNav('fields');
        navLinkApp.classList.remove('hidden');
        navLinkLogout.classList.remove('hidden');
        navLinkLogin.classList.add('hidden');
        
        initHarvestApp(user, userProfile);
        initSharing(user, userProfile);

        const tokenToProcess = pendingToken || tokenFromUrl;
        if (tokenToProcess) {
            await handleShareToken(tokenToProcess, user);
            pendingToken = null; // Réinitialiser le jeton
        }

    } else {
        // Utilisateur déconnecté
        if (!pendingToken) {
            showView('landing-page');
        }
        navLinkApp.classList.add('hidden');
        navLinkLogout.classList.add('hidden');
        navLinkLogin.classList.remove('hidden');
        premiumBadge.classList.add('hidden');
        authMessage.classList.add('hidden');
    }
});
