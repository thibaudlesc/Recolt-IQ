// sharing.js

// [MODIFIÉ] Import de arrayRemove et writeBatch
import { db, doc, getDoc, updateDoc, setDoc, onSnapshot, collection, addDoc, query, where, deleteDoc, arrayUnion, arrayRemove, collectionGroup, writeBatch } from './firebase-config.js';
// [MODIFIÉ] Import de showConfirmationModal et createFilterButton
import { showToast, navigateToPage, showConfirmationModal, createFilterButton } from './harvest.js';

// --- SÉLECTION DES ÉLÉMENTS DU DOM ---
const sharedFieldListContainer = document.getElementById('shared-field-list-container');
// [NOUVEAU] Sélection du conteneur de filtres pour les parcelles partagées
const sharedCropFiltersContainer = document.getElementById('shared-crop-filters-container');

// --- ÉTAT GLOBAL ---
let currentUser = null;
let unsubscribeSharedFields = null;
let isSharingInitialized = false;
// [NOUVEAU] États pour la gestion des parcelles partagées
let allSharedFields = [];
let selectedSharedCrops = [];


export function initSharing(user) {
    currentUser = user;
    if (unsubscribeSharedFields) {
        unsubscribeSharedFields();
    }

    if (!isSharingInitialized) {
        sharedFieldListContainer.addEventListener('click', (e) => {
            const cardContent = e.target.closest('.field-card-content');
            const revokeBtn = e.target.closest('.revoke-access-btn');

            if (revokeBtn) {
                const { key, ownerId, fieldName } = revokeBtn.dataset;
                handleRevokeAccess(key, ownerId, fieldName);
            }
            else if (cardContent && cardContent.dataset.key && cardContent.dataset.ownerId) {
                navigateToPage('details', cardContent.dataset.key, cardContent.dataset.ownerId);
            }
        });
        isSharingInitialized = true;
    }

    loadSharedFields();
}

export async function generateShareLink(fieldId) {
    if (!currentUser) return;
    showShareOptionsModal(fieldId);
}

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

export function showMultiShareOptionsModal(fieldIds, selectedCrops) {
    const modalContainer = document.getElementById('modal-container');
    const modalContent = document.getElementById('modal-content');
    const modalBackdrop = document.getElementById('modal-backdrop');

    const title = selectedCrops.length > 0
        ? `Partager les parcelles de ${selectedCrops.join(', ')} (${fieldIds.length})`
        : `Partager toutes vos parcelles (${fieldIds.length})`;

    modalContent.innerHTML = `
        <h3 class="text-xl font-semibold mb-4 text-center">${title}</h3>
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
            <button id="generate-multi-share-link-btn" class="w-full px-6 py-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700">Générer le lien</button>
        </div>
    `;
    
    modalContainer.classList.remove('hidden');

    const closeModal = () => modalContainer.classList.add('hidden');
    
    document.getElementById('close-share-modal-btn').addEventListener('click', closeModal);
    if (modalBackdrop) modalBackdrop.addEventListener('click', closeModal);

    document.getElementById('generate-multi-share-link-btn').addEventListener('click', async () => {
        const generateBtn = document.getElementById('generate-multi-share-link-btn');
        generateBtn.disabled = true;
        generateBtn.textContent = 'Génération...';

        const durationHours = document.getElementById('share-duration-select').value;
        
        let expiresAt = null;
        if (durationHours !== 'never') {
            expiresAt = new Date();
            expiresAt.setHours(expiresAt.getHours() + parseInt(durationHours, 10));
        }

        try {
            const token = `token_multi_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const tokenDocRef = doc(db, "shareTokens", token);

            await setDoc(tokenDocRef, {
                ownerId: currentUser.uid,
                fieldIds: fieldIds,
                type: 'multi',
                createdAt: new Date(),
                expiresAt: expiresAt
            });

            const shareUrl = `${window.location.origin}${window.location.pathname}?token=${token}`;
            showGeneratedLinkModal(shareUrl);

        } catch (error) {
            console.error("Erreur lors de la création du lien de partage multiple:", error);
            showToast("Impossible de générer le lien.");
            closeModal();
        }
    });
}

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

        if (tokenData.expiresAt && tokenData.expiresAt.toDate() < new Date()) {
            showToast("Ce lien de partage a expiré.");
            await deleteDoc(tokenDocRef);
            return;
        }

        if (tokenData.ownerId === user.uid) {
            showToast("Vous ne pouvez pas partager une parcelle avec vous-même.");
            await deleteDoc(tokenDocRef);
            return;
        }
        
        if (tokenData.type === 'multi' && Array.isArray(tokenData.fieldIds)) {
            const batch = writeBatch(db);
            for (const fieldId of tokenData.fieldIds) {
                const fieldDocRef = doc(db, "users", tokenData.ownerId, "fields", fieldId);
                batch.update(fieldDocRef, { accessControl: arrayUnion(user.uid) });
            }
            await batch.commit();
            showToast(`Accès accordé à ${tokenData.fieldIds.length} parcelles.`);
        } else if (tokenData.fieldId) {
            const fieldDocRef = doc(db, "users", tokenData.ownerId, "fields", tokenData.fieldId);
            await updateDoc(fieldDocRef, { accessControl: arrayUnion(user.uid) });
            showToast(`Accès accordé à la parcelle.`);
        } else {
            showToast("Format de jeton invalide.");
            await deleteDoc(tokenDocRef);
            return;
        }

        await deleteDoc(tokenDocRef);
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

// [NOUVEAU] Gère la révocation de l'accès à une parcelle partagée
async function handleRevokeAccess(fieldId, ownerId, fieldName) {
    const message = `Êtes-vous sûr de vouloir quitter le partage de la parcelle "${fieldName}" ? Vous n'y aurez plus accès.`;
    
    const action = async () => {
        if (!currentUser) return;
        const fieldDocRef = doc(db, "users", ownerId, "fields", fieldId);
        try {
            await updateDoc(fieldDocRef, {
                accessControl: arrayRemove(currentUser.uid)
            });
            showToast("Vous avez quitté le partage.");
        } catch (error) {
            console.error("Erreur lors de la révocation de l'accès :", error);
            showToast("Une erreur est survenue.");
        }
    };

    showConfirmationModal(message, action);
}

// [NOUVEAU] Affiche les filtres pour les parcelles partagées
function displaySharedCropFilters() {
    const crops = [...new Set(allSharedFields.map(field => field.crop).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    
    sharedCropFiltersContainer.innerHTML = '';
    const allButton = createFilterButton('Toutes', 'all', selectedSharedCrops.length === 0);
    allButton.addEventListener('click', () => {
        selectedSharedCrops = [];
        displaySharedCropFilters();
        displaySharedFieldList();
    });
    sharedCropFiltersContainer.appendChild(allButton);

    crops.forEach(crop => {
        const button = createFilterButton(crop, crop, selectedSharedCrops.includes(crop));
        button.addEventListener('click', () => {
            if (selectedSharedCrops.includes(crop)) {
                selectedSharedCrops = selectedSharedCrops.filter(c => c !== crop);
            } else {
                selectedSharedCrops.push(crop);
            }
            displaySharedCropFilters();
            displaySharedFieldList();
        });
        sharedCropFiltersContainer.appendChild(button);
    });
}

// [NOUVEAU] Affiche la liste des parcelles partagées (filtrées ou non)
async function displaySharedFieldList() {
    if (allSharedFields.length === 0) {
        sharedFieldListContainer.innerHTML = `<p class="text-center text-gray-500 mt-8">Aucune parcelle n'a été partagée avec vous.</p>`;
        return;
    }

    const filteredFields = (selectedSharedCrops.length === 0
        ? allSharedFields
        : allSharedFields.filter(field => selectedSharedCrops.includes(field.crop))
    ).sort((a, b) => a.name.localeCompare(b.name));

    if (filteredFields.length === 0) {
        sharedFieldListContainer.innerHTML = `<p class="text-center text-gray-500 mt-8">Aucune parcelle partagée ne correspond à vos filtres.</p>`;
        return;
    }

    const fieldCardPromises = filteredFields.map(async (field) => {
        try {
            const ownerDoc = await getDoc(doc(db, "users", field.ownerId));
            const ownerName = ownerDoc.exists() ? ownerDoc.data().name : "Propriétaire Inconnu";
            
            return `
                <div class="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                    <div class="flex justify-between items-center">
                        <div class="field-card-content cursor-pointer flex-grow" data-key="${field.id}" data-owner-id="${field.ownerId}">
                            <h3 class="font-bold text-lg text-gray-800">${field.name}</h3>
                            <p class="text-sm text-gray-500">Partagé par : <span class="font-semibold">${ownerName}</span></p>
                            <p class="text-sm text-gray-500">Culture : <span class="font-semibold">${field.crop || 'N/A'}</span></p>
                        </div>
                        <button class="revoke-access-btn p-2 text-gray-400 hover:text-red-600 rounded-full hover:bg-gray-100 transition-colors ml-2" 
                                data-key="${field.id}" 
                                data-owner-id="${field.ownerId}"
                                data-field-name="${field.name}" 
                                title="Quitter le partage">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
                            </svg>
                        </button>
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
}

// [MODIFIÉ] Charge les parcelles, puis appelle les fonctions d'affichage et de filtrage
function loadSharedFields() {
    if (!currentUser) return;

    const q = query(collectionGroup(db, 'fields'), where('accessControl', 'array-contains', currentUser.uid));

    unsubscribeSharedFields = onSnapshot(q, (snapshot) => {
        allSharedFields = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        displaySharedCropFilters();
        displaySharedFieldList();

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
