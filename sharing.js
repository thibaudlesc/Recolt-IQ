// sharing.js

import { 
    db, 
    doc, 
    getDoc, 
    updateDoc, 
    setDoc, 
    onSnapshot, 
    query, 
    where, 
    deleteDoc, 
    arrayUnion, 
    collectionGroup 
} from './firebase-config.js';
import { showToast, navigateToPage } from './harvest.js';

// --- SÉLECTION DES ÉLÉMENTS DU DOM ---
const sharedFieldListContainer = document.getElementById('shared-field-list-container');
const navSharedFieldsBtn = document.getElementById('nav-shared-fields');


// --- ÉTAT GLOBAL ---
let currentUser = null;
let unsubscribeSharedFields = null;

/**
 * Initialise le module de partage et charge les parcelles partagées.
 * @param {import("firebase/auth").User} user - L'objet utilisateur de Firebase.
 */
export function initSharing(user) {
    currentUser = user;
    if (unsubscribeSharedFields) {
        unsubscribeSharedFields(); // Se désabonne de l'ancien écouteur pour éviter les fuites de mémoire
    }
    loadSharedFields();
    
    // Ajout de l'écouteur de clic pour la navigation
    navSharedFieldsBtn.addEventListener('click', () => navigateToPage('shared-list'));
}

/**
 * Génère un lien de partage unique et sécurisé pour une parcelle.
 * @param {string} fieldId - L'ID de la parcelle à partager.
 */
export async function generateShareLink(fieldId) {
    if (!currentUser) return;

    try {
        // Crée un jeton unique et temporaire
        const token = `token_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const tokenDocRef = doc(db, "shareTokens", token);

        // Enregistre le jeton dans Firestore avec les informations nécessaires
        await setDoc(tokenDocRef, {
            ownerId: currentUser.uid,
            fieldId: fieldId,
            createdAt: new Date()
        });

        // Construit l'URL de partage complète
        const shareUrl = `${window.location.origin}${window.location.pathname}?token=${token}`;
        showShareLinkModal(shareUrl);

    } catch (error) {
        console.error("Erreur lors de la création du lien de partage:", error);
        showToast("Impossible de générer le lien de partage.");
    }
}

/**
 * Affiche une modale avec le lien de partage et un bouton pour le copier.
 * @param {string} url - Le lien de partage à afficher.
 */
function showShareLinkModal(url) {
    const modalContainer = document.getElementById('modal-container');
    const modalContent = document.getElementById('modal-content');
    const modalBackdrop = document.getElementById('modal-backdrop');

    modalContent.innerHTML = `
        <h3 class="text-xl font-semibold mb-4 text-center">Partager la parcelle</h3>
        <p class="text-gray-600 text-center mb-4">Envoyez ce lien à la personne avec qui vous souhaitez partager. Le lien est à usage unique et expirera.</p>
        <div class="bg-gray-100 p-3 rounded-lg flex items-center justify-between">
            <input id="share-url-input" type="text" readonly value="${url}" class="bg-transparent border-none text-gray-700 text-sm flex-grow">
            <button id="copy-share-url-btn" class="ml-2 px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700">Copier</button>
        </div>
        <button id="close-share-modal-btn" class="mt-6 w-full px-6 py-3 bg-gray-200 text-gray-800 rounded-lg">Fermer</button>
    `;
    
    modalContainer.classList.remove('hidden');

    const closeModal = () => modalContainer.classList.add('hidden');
    
    document.getElementById('close-share-modal-btn').addEventListener('click', closeModal);
    if (modalBackdrop) {
        modalBackdrop.addEventListener('click', closeModal);
    }

    // Gère la copie du lien dans le presse-papiers
    document.getElementById('copy-share-url-btn').addEventListener('click', () => {
        const input = document.getElementById('share-url-input');
        input.select();
        try {
            document.execCommand('copy');
            showToast("Lien copié !");
        } catch (err) {
            showToast("Erreur lors de la copie.");
        }
    });
}

/**
 * Traite un jeton de partage lorsqu'un utilisateur arrive via un lien d'invitation.
 * @param {string} token - Le jeton de partage provenant de l'URL.
 * @param {import("firebase/auth").User} user - L'utilisateur connecté qui accepte l'invitation.
 */
export async function handleShareToken(token, user) {
    if (!token || !user) return;

    const tokenDocRef = doc(db, "shareTokens", token);
    const url = new URL(window.location); // Pour nettoyer l'URL après traitement

    try {
        const tokenDocSnap = await getDoc(tokenDocRef);

        if (!tokenDocSnap.exists()) {
            showToast("Ce lien de partage est invalide ou a déjà été utilisé.");
            return;
        }

        const { ownerId, fieldId } = tokenDocSnap.data();

        // Empêche un utilisateur d'accepter sa propre invitation
        if (ownerId === user.uid) {
            showToast("Vous ne pouvez pas partager une parcelle avec vous-même.");
            await deleteDoc(tokenDocRef); // Supprime le jeton inutile
            return;
        }
        
        const fieldDocRef = doc(db, "users", ownerId, "fields", fieldId);
        
        // Opération critique : ajoute l'UID de l'invité au tableau de contrôle d'accès de la parcelle.
        // C'est cette opération qui est validée par les nouvelles règles de sécurité.
        await updateDoc(fieldDocRef, {
            accessControl: arrayUnion(user.uid)
        });

        // Le partage a réussi, on supprime le jeton à usage unique.
        await deleteDoc(tokenDocRef);
        
        showToast("Accès accordé à la parcelle !");
        navigateToPage('shared-list'); // Redirige l'utilisateur vers la liste des partages

    } catch (error) {
        console.error("Erreur lors du traitement du jeton de partage:", error);
        if (error.code === 'permission-denied') {
            showToast("Erreur de permission. Impossible d'accepter le partage.");
        } else {
            showToast("Une erreur est survenue lors de l'acceptation du partage.");
        }
    } finally {
        // Nettoie toujours le jeton de l'URL pour éviter de le traiter à nouveau.
        url.searchParams.delete('token');
        window.history.replaceState({}, document.title, url.toString());
    }
}


/**
 * Charge et affiche en temps réel les parcelles qui ont été partagées avec l'utilisateur actuel.
 */
function loadSharedFields() {
    if (!currentUser) return;

    // Crée une requête qui recherche dans tous les documents 'fields' de tous les utilisateurs
    // ceux où notre UID se trouve dans le tableau 'accessControl'.
    const q = query(collectionGroup(db, 'fields'), where('accessControl', 'array-contains', currentUser.uid));

    unsubscribeSharedFields = onSnapshot(q, async (snapshot) => {
        if (snapshot.empty) {
            sharedFieldListContainer.innerHTML = `<p class="text-center text-gray-500 mt-8">Aucune parcelle n'a été partagée avec vous.</p>`;
            return;
        }

        // Utilise Promise.all pour récupérer les noms des propriétaires de manière asynchrone
        const fieldCardPromises = snapshot.docs.map(async (fieldDoc) => {
            const field = { id: fieldDoc.id, ...fieldDoc.data() };
            try {
                const ownerDoc = await getDoc(doc(db, "users", field.ownerId));
                const ownerName = ownerDoc.exists() ? ownerDoc.data().name : "Propriétaire Inconnu";
                
                const card = document.createElement('div');
                card.className = 'bg-white p-4 rounded-xl shadow-sm border border-gray-200 cursor-pointer hover:bg-gray-50';
                card.innerHTML = `
                    <div class="field-card-content" data-key="${field.id}" data-owner-id="${field.ownerId}">
                        <div class="flex justify-between items-start">
                            <div>
                                <h3 class="font-bold text-lg text-gray-800">${field.name}</h3>
                                <p class="text-sm text-gray-500">Partagé par : <span class="font-semibold">${ownerName}</span></p>
                            </div>
                            <div class="text-right">
                                 <p class="text-sm text-gray-500">${field.crop || 'N/A'}</p>
                            </div>
                        </div>
                    </div>
                `;
                // Navigue vers les détails de la parcelle partagée au clic
                card.addEventListener('click', () => navigateToPage('details', field.id, field.ownerId));
                return card.outerHTML;
            } catch (error) {
                console.error("Erreur de récupération du propriétaire pour la parcelle:", field.id, error);
                return null; // Retourne null en cas d'erreur pour ne pas bloquer l'affichage
            }
        });
        
        const fieldCardsHTML = (await Promise.all(fieldCardPromises)).filter(Boolean).join('');
        sharedFieldListContainer.innerHTML = fieldCardsHTML;

    }, (error) => {
        console.error("Erreur de chargement des champs partagés:", error);
        let userMessage = "";

        // Gère les erreurs courantes de Firestore pour aider au débogage
        if (error.code === 'failed-precondition') {
            userMessage = `<p class="font-bold">Action requise : Index manquant !</p><p class="text-sm mt-2">La base de données a besoin d'un index pour cette recherche. Ouvrez la console (F12), trouvez l'erreur et <strong>cliquez sur le lien</strong> pour le créer automatiquement.</p>`;
        } else if (error.code === 'permission-denied') {
             userMessage = `<p class="font-bold">Erreur de Permissions</p><p class="text-sm mt-2">Vos règles de sécurité Firestore ne permettent pas cette opération. Assurez-vous d'avoir publié les dernières règles de sécurité.</p>`;
        } else {
             userMessage = `<p class="font-bold">La récupération des partages a échoué.</p><p class="text-sm mt-2">Vérifiez votre connexion et réessayez.</p>`;
        }

        sharedFieldListContainer.innerHTML = `<div class="text-center text-red-600 mt-8 p-4 bg-red-100 rounded-lg border border-red-200">${userMessage}</div>`;
    });
}
