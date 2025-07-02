// sharing.js

import { db, doc, getDoc, updateDoc, setDoc, onSnapshot, collection, addDoc, query, where, deleteDoc, arrayUnion, collectionGroup } from './firebase-config.js';
import { showToast, navigateToPage } from './harvest.js';

// --- SÉLECTION DES ÉLÉMENTS DU DOM ---
const sharedFieldListContainer = document.getElementById('shared-field-list-container');

// --- ÉTAT GLOBAL ---
let currentUser = null;
let unsubscribeSharedFields = null;
let isSharingInitialized = false; // Pour s'assurer que l'écouteur n'est ajouté qu'une fois

/**
 * Initialise le module de partage.
 * @param {import("firebase/auth").User} user - L'objet utilisateur de Firebase.
 */
export function initSharing(user) {
    currentUser = user;
    if (unsubscribeSharedFields) {
        unsubscribeSharedFields();
    }

    // On ajoute un écouteur d'événement délégué une seule fois.
    // Cet écouteur gérera les clics sur toutes les cartes de parcelles partagées.
    if (!isSharingInitialized) {
        sharedFieldListContainer.addEventListener('click', (e) => {
            const cardContent = e.target.closest('.field-card-content');
            if (cardContent && cardContent.dataset.key && cardContent.dataset.ownerId) {
                navigateToPage('details', cardContent.dataset.key, cardContent.dataset.ownerId);
            }
        });
        isSharingInitialized = true;
    }

    loadSharedFields();
}

/**
 * [MODIFIÉ] Lance le processus de partage en affichant les options de durée.
 * @param {string} fieldId - L'ID de la parcelle à partager.
 */
export async function generateShareLink(fieldId) {
    if (!currentUser) return;
    showShareOptionsModal(fieldId);
}

/**
 * [NOUVEAU] Affiche une modale pour choisir la durée de validité du lien de partage.
 * @param {string} fieldId - L'ID de la parcelle pour laquelle générer un lien.
 */
function showShareOptionsModal(fieldId) {
    const modalContainer = document.getElementById('modal-container');
    const modalContent = document.getElementById('modal-content');
    const modalBackdrop = document.getElementById('modal-backdrop');

    modalContent.innerHTML = `
        <h3 class="text-xl font-semibold mb-4 text-center">Partager la parcelle</h3>
        <div class="mb-6">
            <label for="share-duration-select" class="block text-sm font-medium text-gray-700 mb-2">Durée de validité du lien :</label>
            <select id="share-duration-select" class="w-full p-3 bg-gray-50 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 transition">
                <option value="24">24 Heures</option>
                <option value="168">7 Jours</option>
                <option value="720">30 Jours</option>
                <option value="never">À vie (jusqu'à la première utilisation)</option>
            </select>
        </div>
        <div class="grid grid-cols-2 gap-3">
            <button id="close-share-modal-btn" class="w-full px-6 py-3 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300">Annuler</button>
            <button id="generate-share-link-btn" class="w-full px-6 py-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700">Générer le lien</button>
        </div>
    `;
    
    modalContainer.classList.remove('hidden');

    const closeModal = () => modalContainer.classList.add('hidden');
    
    document.getElementById('close-share-modal-btn').addEventListener('click', closeModal);
    if (modalBackdrop) modalBackdrop.addEventListener('click', closeModal);

    document.getElementById('generate-share-link-btn').addEventListener('click', async () => {
        const generateBtn = document.getElementById('generate-share-link-btn');
        generateBtn.disabled = true;
        generateBtn.textContent = 'Génération...';

        const durationHours = document.getElementById('share-duration-select').value;
        
        let expiresAt = null;
        if (durationHours !== 'never') {
            expiresAt = new Date();
            expiresAt.setHours(expiresAt.getHours() + parseInt(durationHours, 10));
        }

        try {
            const token = `token_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const tokenDocRef = doc(db, "shareTokens", token);

            await setDoc(tokenDocRef, {
                ownerId: currentUser.uid,
                fieldId: fieldId,
                createdAt: new Date(),
                expiresAt: expiresAt
            });

            const shareUrl = `${window.location.origin}${window.location.pathname}?token=${token}`;
            showGeneratedLinkModal(shareUrl);

        } catch (error) {
            console.error("Erreur lors de la création du lien de partage:", error);
            showToast("Impossible de générer le lien.");
            closeModal();
        }
    });
}

/**
 * [NOUVEAU] Met à jour la modale pour afficher le lien de partage qui a été généré.
 * @param {string} url - Le lien de partage à afficher.
 */
function showGeneratedLinkModal(url) {
    const modalContent = document.getElementById('modal-content');
    modalContent.innerHTML = `
        <h3 class="text-xl font-semibold mb-4 text-center">Lien de partage généré</h3>
        <p class="text-gray-600 text-center mb-4">Envoyez ce lien à la personne avec qui vous souhaitez partager. Il est à usage unique.</p>
        <div class="bg-gray-100 p-3 rounded-lg flex items-center justify-between">
            <input id="share-url-input" type="text" readonly value="${url}" class="bg-transparent border-none text-gray-700 text-sm flex-grow">
            <button id="copy-share-url-btn" class="ml-2 px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700">Copier</button>
        </div>
        <button id="close-share-modal-btn" class="mt-6 w-full px-6 py-3 bg-gray-200 text-gray-800 rounded-lg">Fermer</button>
    `;

    const closeModal = () => document.getElementById('modal-container').classList.add('hidden');
    document.getElementById('close-share-modal-btn').addEventListener('click', closeModal);
    
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
    console.log("--- DÉBUT DU TRAITEMENT DU JETON DE PARTAGE ---");
    if (!token || !user) {
        console.log("Arrêt : Jeton ou utilisateur manquant.", { token, user });
        return;
    }
    
    console.log(`1. Jeton reçu: ${token}`);
    console.log(`2. Utilisateur actuel (qui accepte le partage): ${user.uid}`);

    const tokenDocRef = doc(db, "shareTokens", token);
    try {
        console.log(`3. Lecture du document du jeton à l'adresse: /shareTokens/${token}`);
        const tokenDocSnap = await getDoc(tokenDocRef);

        if (!tokenDocSnap.exists()) {
            console.error("ERREUR : Le document du jeton n'existe pas ou a déjà été utilisé.");
            showToast("Ce lien de partage est invalide ou a déjà été utilisé.");
            return;
        }

        const tokenData = tokenDocSnap.data();
        console.log("4. Données du jeton récupérées:", tokenData);

        // [NOUVEAU] Vérification de la date d'expiration du jeton.
        if (tokenData.expiresAt && tokenData.expiresAt.toDate() < new Date()) {
            console.error("ERREUR : Le jeton de partage a expiré.");
            showToast("Ce lien de partage a expiré.");
            await deleteDoc(tokenDocRef); // On nettoie le jeton expiré.
            return;
        }

        if (tokenData.ownerId === user.uid) {
            console.warn("AVERTISSEMENT : L'utilisateur essaie de partager avec lui-même.");
            showToast("Vous ne pouvez pas partager une parcelle avec vous-même.");
            await deleteDoc(tokenDocRef);
            return;
        }
        
        const fieldDocRef = doc(db, "users", tokenData.ownerId, "fields", tokenData.fieldId);
        console.log(`5. Préparation de la mise à jour de la parcelle à l'adresse: ${fieldDocRef.path}`);
        console.log(`   -> Ajout de l'UID '${user.uid}' au tableau 'accessControl'.`);

        await updateDoc(fieldDocRef, {
            accessControl: arrayUnion(user.uid)
        });

        console.log("6. SUCCÈS : La parcelle a été mise à jour.");

        console.log("7. Suppression du jeton utilisé...");
        await deleteDoc(tokenDocRef);
        console.log("8. Jeton supprimé.");
        
        showToast(`Accès accordé à la parcelle.`);
        navigateToPage('shared-list');

    } catch (error) {
        console.error("ERREUR FINALE lors du traitement du jeton :", error);
        showToast("Une erreur est survenue lors de l'acceptation du partage.");
    } finally {
        console.log("--- FIN DU TRAITEMENT DU JETON DE PARTAGE ---");
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
        if (snapshot.empty) {
            sharedFieldListContainer.innerHTML = `<p class="text-center text-gray-500 mt-8">Aucune parcelle n'a été partagée avec vous.</p>`;
            return;
        }

        const fieldCardPromises = snapshot.docs.map(async (fieldDoc) => {
            const field = { id: fieldDoc.id, ...fieldDoc.data() };
            try {
                const ownerDoc = await getDoc(doc(db, "users", field.ownerId));
                const ownerName = ownerDoc.exists() ? ownerDoc.data().name : "Propriétaire Inconnu";
                
                // On génère juste le HTML. L'écouteur de clic est maintenant sur le conteneur parent.
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
                return null;
            }
        });
        
        const fieldCardsHTML = (await Promise.all(fieldCardPromises)).filter(Boolean).join('');
        sharedFieldListContainer.innerHTML = fieldCardsHTML;

    }, (error) => {
        console.error("Erreur de chargement des champs partagés:", error);
        let userMessage = "";

        if (error.code === 'failed-precondition') {
            userMessage = `<p class="font-bold">Action requise : Index manquant !</p><p class="text-sm mt-2">La base de données a besoin d'un index pour cette recherche. Ouvrez la console (F12), trouvez l'erreur et <strong>cliquez sur le lien</strong> pour le créer.</p>`;
        } else if (error.code === 'permission-denied') {
             userMessage = `<p class="font-bold">Erreur de Permissions</p><p class="text-sm mt-2">Vos règles de sécurité Firestore ne permettent pas cette opération. Assurez-vous d'avoir publié les dernières règles.</p>`;
        } else {
             userMessage = `<p class="font-bold">La récupération des partages a échoué.</p><p class="text-sm mt-2">Vérifiez votre connexion et réessayez.</p>`;
        }

        sharedFieldListContainer.innerHTML = `<div class="text-center text-red-600 mt-8 p-4 bg-red-100 rounded-lg border border-red-200">${userMessage}</div>`;
    });
}