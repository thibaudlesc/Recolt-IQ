// sharing.js

import { db, doc, getDoc, updateDoc, setDoc, onSnapshot, collection, addDoc, query, where, deleteDoc, arrayUnion, collectionGroup } from './firebase-config.js';
import { showToast, navigateToPage } from './harvest.js';

// --- SÉLECTION DES ÉLÉMENTS DU DOM ---
const sharedFieldListContainer = document.getElementById('shared-field-list-container');

// --- ÉTAT GLOBAL ---
let currentUser = null;
let unsubscribeSharedFields = null;

/**
 * Initialise le module de partage.
 * @param {import("firebase/auth").User} user - L'objet utilisateur de Firebase.
 */
export function initSharing(user) {
    currentUser = user;
    if (unsubscribeSharedFields) {
        unsubscribeSharedFields(); // Stoppe l'ancien écouteur avant d'en créer un nouveau
    }
    loadSharedFields();
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
    // S'assure que la modale est gérée par une seule fonction pour éviter les conflits
    const modalContainer = document.getElementById('modal-container');
    const modalContent = document.getElementById('modal-content');
    const modalBackdrop = document.getElementById('modal-backdrop');

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

    const closeModal = () => modalContainer.classList.add('hidden');
    
    document.getElementById('close-share-modal-btn').addEventListener('click', closeModal);
    modalBackdrop.addEventListener('click', closeModal);

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
            await deleteDoc(tokenDocRef);
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

        await updateDoc(fieldDocRef, {
            accessControl: arrayUnion(user.uid)
        });

        await deleteDoc(tokenDocRef);
        
        showToast(`Accès accordé à la parcelle "${fieldName}".`);
        // Force la navigation vers la page des partages, ce qui déclenchera un affichage propre.
        navigateToPage('shared-list');

    } catch (error) {
        console.error("Erreur lors du traitement du jeton :", error);
        showToast("Une erreur est survenue lors de l'acceptation du partage.");
    } finally {
        const url = new URL(window.location);
        url.searchParams.delete('token');
        window.history.replaceState({}, document.title, url.toString());
    }
}

/**
 * Charge et affiche les parcelles partagées avec l'utilisateur actuel en temps réel.
 */
function loadSharedFields() {
    if (!currentUser) return;

    const q = query(collectionGroup(db, 'fields'), where('accessControl', 'array-contains', currentUser.uid));

    unsubscribeSharedFields = onSnapshot(q, async (snapshot) => {
        sharedFieldListContainer.innerHTML = ''; // Vide la liste à chaque mise à jour pour éviter les doublons

        if (snapshot.empty) {
            sharedFieldListContainer.innerHTML = `<p class="text-center text-gray-500 mt-8">Aucune parcelle n'a été partagée avec vous.</p>`;
            return;
        }

        const fieldCardPromises = snapshot.docs.map(async (fieldDoc) => {
            const field = { id: fieldDoc.id, ...fieldDoc.data() };
            try {
                const ownerDoc = await getDoc(doc(db, "users", field.ownerId));
                const ownerName = ownerDoc.exists() ? ownerDoc.data().name : "Propriétaire Inconnu";
                
                const card = document.createElement('div');
                card.className = 'bg-white p-4 rounded-xl shadow-sm border border-gray-200';
                card.innerHTML = `
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
                `;
                return card;
            } catch (error) {
                console.error("Erreur de récupération du propriétaire pour la parcelle:", field.id, error);
                return null;
            }
        });
        
        const fieldCards = await Promise.all(fieldCardPromises);
        fieldCards.forEach(card => {
            if(card) sharedFieldListContainer.appendChild(card);
        });

    }, (error) => {
        console.error("Erreur de chargement des champs partagés:", error);
        const errorMessageHTML = `
            <div class="text-center text-red-600 mt-8 p-4 bg-red-100 rounded-lg border border-red-200">
                <p class="font-bold">La récupération des partages a échoué.</p>
                <p class="text-sm mt-2">Vérifiez vos règles de sécurité Firestore et que l'index composite est bien créé et activé.</p>
            </div>`;
        sharedFieldListContainer.innerHTML = errorMessageHTML;
    });
}
