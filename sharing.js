// sharing.js

import { db, doc, getDoc, updateDoc, setDoc, onSnapshot, collection, addDoc, query, where, deleteDoc, arrayUnion, collectionGroup } from './firebase-config.js';
import { showToast, showConfirmationModal, navigateToPage } from './harvest.js';

// --- SÉLECTION DES ÉLÉMENTS DU DOM ---
const sharedFieldListContainer = document.getElementById('shared-field-list-container');
const navSharedFieldsBtn = document.getElementById('nav-shared-fields');
const navMyFieldsBtn = document.getElementById('nav-fields');

// --- ÉTAT GLOBAL ---
let currentUser = null;
let unsubscribeSharedFields = null;

/**
 * Initialise le module de partage.
 * @param {import("firebase/auth").User} user - L'objet utilisateur de Firebase.
 */
export function initSharing(user) {
    currentUser = user;
    setupSharingEventListeners();
    loadSharedFields();
}

/**
 * Configure les écouteurs d'événements pour la navigation de partage.
 */
function setupSharingEventListeners() {
    // Utilise le système de navigation central de harvest.js
    navMyFieldsBtn.addEventListener('click', () => navigateToPage('list'));
    navSharedFieldsBtn.addEventListener('click', () => navigateToPage('shared-list'));
    
    sharedFieldListContainer.addEventListener('click', (e) => {
        const card = e.target.closest('.field-card-content');
        if (card) {
            const ownerId = card.dataset.ownerId;
            const fieldId = card.dataset.key;
            // Passe l'ownerId à la page de détails pour savoir où chercher les données
            navigateToPage('details', fieldId, ownerId);
        }
    });
}

/**
 * Génère un lien de partage unique pour une parcelle.
 * @param {string} fieldId - L'ID de la parcelle à partager.
 */
export async function generateShareLink(fieldId) {
    if (!currentUser) return;

    try {
        const token = `token_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const tokenDocRef = doc(db, "shareTokens", token);

        await setDoc(tokenDocRef, {
            ownerId: currentUser.uid,
            fieldId: fieldId,
            createdAt: new Date()
        });

        const shareUrl = `${window.location.origin}${window.location.pathname}?token=${token}`;
        showShareLinkModal(shareUrl);

    } catch (error) {
        console.error("Erreur lors de la création du lien de partage:", error);
        showToast("Impossible de générer le lien de partage.");
    }
}

/**
 * Affiche une modale avec le lien de partage.
 * @param {string} url - Le lien de partage à afficher.
 */
function showShareLinkModal(url) {
    const modalContainer = document.getElementById('modal-container');
    const modalContent = document.getElementById('modal-content');

    modalContent.innerHTML = `
        <h3 class="text-xl font-semibold mb-4 text-center">Partager la parcelle</h3>
        <p class="text-gray-600 text-center mb-4">Envoyez ce lien à la personne avec qui vous souhaitez partager. Le lien est à usage unique.</p>
        <div class="bg-gray-100 p-3 rounded-lg flex items-center justify-between">
            <input id="share-url-input" type="text" readonly value="${url}" class="bg-transparent border-none text-gray-700 text-sm flex-grow">
            <button id="copy-share-url-btn" class="ml-2 px-4 py-2 bg-blue-500 text-white text-sm font-semibold rounded-lg hover:bg-blue-600">Copier</button>
        </div>
        <button id="close-share-modal-btn" class="mt-6 w-full px-6 py-3 bg-gray-200 text-gray-800 rounded-lg">Fermer</button>
    `;
    
    modalContainer.classList.remove('hidden');

    document.getElementById('close-share-modal-btn').addEventListener('click', () => modalContainer.classList.add('hidden'));
    document.getElementById('copy-share-url-btn').addEventListener('click', () => {
        const input = document.getElementById('share-url-input');
        input.select();
        // Utilise execCommand pour une meilleure compatibilité
        try {
            document.execCommand('copy');
            showToast("Lien copié !");
        } catch (err) {
            showToast("Erreur lors de la copie.");
        }
    });
}

/**
 * Traite un jeton de partage lors de l'arrivée sur le site.
 * @param {string} token - Le jeton de partage.
 * @param {import("firebase/auth").User} user - L'utilisateur qui réclame le jeton.
 */
export async function handleShareToken(token, user) {
    if (!token || !user) return;
    
    const tokenDocRef = doc(db, "shareTokens", token);
    try {
        const tokenDocSnap = await getDoc(tokenDocRef);

        if (!tokenDocSnap.exists()) {
            showToast("Ce lien de partage est invalide ou a déjà été utilisé.");
            return;
        }

        const tokenData = tokenDocSnap.data();

        if (tokenData.ownerId === user.uid) {
            showToast("Vous ne pouvez pas partager une parcelle avec vous-même.");
            await deleteDoc(tokenDocRef); // Supprime le jeton même dans ce cas
            return;
        }
        
        const fieldDocRef = doc(db, "users", tokenData.ownerId, "fields", tokenData.fieldId);
        const ownerDocRef = doc(db, "users", tokenData.ownerId);

        const [fieldDocSnap, ownerDocSnap] = await Promise.all([getDoc(fieldDocRef), getDoc(ownerDocRef)]);
        
        if (!fieldDocSnap.exists() || !ownerDocSnap.exists()) {
             showToast("La parcelle ou le propriétaire associé n'existe plus.");
             await deleteDoc(tokenDocRef);
             return;
        }

        const fieldName = fieldDocSnap.data().name;
        const ownerName = ownerDocSnap.data().name;

        // Ajoute l'UID de l'utilisateur actuel au tableau 'accessControl' de la parcelle
        await updateDoc(fieldDocRef, {
            accessControl: arrayUnion(user.uid)
        });

        // Supprime le jeton pour qu'il ne soit plus utilisable
        await deleteDoc(tokenDocRef);
        
        showToast(`Accès accordé à la parcelle "${fieldName}".`);
        navigateToPage('shared-list');

    } catch (error) {
        console.error("Erreur lors du traitement du jeton :", error);
        showToast("Une erreur est survenue lors de l'acceptation du partage.");
    } finally {
        // Nettoie l'URL pour enlever le jeton
        const url = new URL(window.location);
        url.searchParams.delete('token');
        window.history.replaceState({}, document.title, url.toString());
    }
}

/**
 * Charge et affiche les parcelles partagées avec l'utilisateur actuel en temps réel.
 */
function loadSharedFields() {
    if (unsubscribeSharedFields) unsubscribeSharedFields();

    // Requête sur un groupe de collections pour trouver toutes les parcelles partagées avec l'utilisateur
    const q = query(collectionGroup(db, 'fields'), where('accessControl', 'array-contains', currentUser.uid));

    unsubscribeSharedFields = onSnapshot(q, async (snapshot) => {
        if (snapshot.empty) {
            sharedFieldListContainer.innerHTML = `<p class="text-center text-gray-500 mt-8">Aucune parcelle n'a été partagée avec vous.</p>`;
            return;
        }

        // Utilise Promise.all pour gérer correctement les requêtes asynchrones
        const fieldCardPromises = snapshot.docs.map(async (fieldDoc) => {
            const field = { id: fieldDoc.id, ...fieldDoc.data() };
            try {
                const ownerDoc = await getDoc(doc(db, "users", field.ownerId));
                const ownerName = ownerDoc.exists() ? ownerDoc.data().name : "Propriétaire Inconnu";
                
                // Renvoie le HTML de la carte pour cette parcelle
                return `
                    <div class="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                        <div class="field-card-content cursor-pointer" data-key="${field.id}" data-owner-id="${field.ownerId}">
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
                    </div>
                `;
            } catch (error) {
                console.error("Erreur de récupération du propriétaire pour la parcelle:", field.id, error);
                return ''; // Renvoie une chaîne vide en cas d'erreur pour ne pas bloquer l'affichage
            }
        });

        // Attend que toutes les informations (y compris les noms des propriétaires) soient récupérées
        const fieldCardsHTML = await Promise.all(fieldCardPromises);
        
        // Met à jour le conteneur avec toutes les cartes d'un seul coup
        sharedFieldListContainer.innerHTML = fieldCardsHTML.join('');

    }, (error) => {
        console.error("Erreur de chargement des champs partagés:", error);
        showToast("Erreur de chargement des partages.");
        // Affiche un message d'erreur clair pour l'utilisateur, suggérant la cause la plus probable
        sharedFieldListContainer.innerHTML = `
            <div class="text-center text-red-600 mt-8 p-4 bg-red-100 rounded-lg border border-red-200">
                <p class="font-bold">La récupération des partages a échoué.</p>
                <p class="text-sm mt-2">Cela est souvent dû à un index manquant dans la base de données. Veuillez suivre les instructions pour créer cet index dans votre console Firebase.</p>
            </div>`;
    });
}
