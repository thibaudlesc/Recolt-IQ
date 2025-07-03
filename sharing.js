// sharing.js

import { db, doc, getDoc, getDocs, updateDoc, setDoc, onSnapshot, collection, addDoc, query, where, deleteDoc, arrayUnion, arrayRemove, collectionGroup, writeBatch } from './firebase-config.js';
import { showToast, navigateToPage, showConfirmationModal, createFilterButton } from './harvest.js';

// --- SÉLECTION DES ÉLÉMENTS DU DOM ---
const sharedFieldListContainer = document.getElementById('shared-field-list-container');
const mySharesListContainer = document.getElementById('my-shares-list-container');
const sharedCropFiltersContainer = document.getElementById('shared-crop-filters-container');
const openSharedFilterModalBtn = document.getElementById('open-shared-filter-modal-btn');
const modalContainer = document.getElementById('modal-container');
const modalContent = document.getElementById('modal-content');


// --- ÉTAT GLOBAL ---
let currentUser = null;
let unsubscribeSharedFields = null;
let unsubscribeMyShares = null;
let isSharingInitialized = false;
let allSharedFields = [];
let myFieldsWithShares = [];
let selectedSharedCrops = [];


export function initSharing(user) {
    currentUser = user;
    if (unsubscribeSharedFields) unsubscribeSharedFields();
    if (unsubscribeMyShares) unsubscribeMyShares();

    if (!isSharingInitialized) {
        // Listener pour la liste des partages qu'on m'a faits
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

        // Listener pour la gestion des partages (individuel et total)
        mySharesListContainer.addEventListener('click', (e) => {
            const header = e.target.closest('.share-user-card-header');
            const revokeAllBtn = e.target.closest('.revoke-all-access-btn');
            const revokeSingleBtn = e.target.closest('.revoke-single-access-btn');

            if (revokeAllBtn) {
                e.stopPropagation();
                const { userId, userName } = revokeAllBtn.dataset;
                handleRevokeAllAccessForUser(userId, userName);
            } else if (revokeSingleBtn) {
                e.stopPropagation();
                const { fieldId, userId, userName, fieldName } = revokeSingleBtn.dataset;
                handleRevokeSingleAccessForUser(fieldId, userId, userName, fieldName);
            } else if (header) {
                const content = header.nextElementSibling;
                content.classList.toggle('hidden');
                const icon = header.querySelector('svg.accordion-icon');
                icon.classList.toggle('rotate-180');
            }
        });
        
        if (openSharedFilterModalBtn) {
            openSharedFilterModalBtn.addEventListener('click', showSharedFilterModal);
        }

        if (modalContainer) {
            modalContainer.addEventListener('click', (e) => {
                if (e.target.id === 'modal-backdrop') closeModal();
            });
        }

        isSharingInitialized = true;
    }

    loadSharedFields();
    loadMySharedFields();
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
        <p class="text-center text-slate-600 mb-6">
            Ce lien est à usage unique. Vous devrez créer un nouveau lien pour chaque personne que vous voulez inviter sur cette parcelle.
        </p>
        <div class="grid grid-cols-2 gap-3">
            <button id="close-share-modal-btn" class="w-full px-6 py-3 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300">Annuler</button>
            <button id="generate-share-link-btn" class="w-full px-6 py-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700">Générer le lien</button>
        </div>
    `;
    
    modalContainer.classList.remove('hidden');

    const closeModalFunc = () => modalContainer.classList.add('hidden');
    
    document.getElementById('close-share-modal-btn').addEventListener('click', closeModalFunc);
    if (modalBackdrop) modalBackdrop.addEventListener('click', closeModalFunc);

    document.getElementById('generate-share-link-btn').addEventListener('click', async () => {
        const generateBtn = document.getElementById('generate-share-link-btn');
        generateBtn.disabled = true;
        generateBtn.textContent = 'Génération...';

        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 24);

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
            closeModalFunc();
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
        <p class="text-center text-slate-600 mb-6">
            Ce lien est à usage unique. Vous devrez créer un nouveau lien pour chaque personne que vous voulez inviter sur ces parcelles.
        </p>
        <div class="grid grid-cols-2 gap-3">
            <button id="close-share-modal-btn" class="w-full px-6 py-3 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300">Annuler</button>
            <button id="generate-multi-share-link-btn" class="w-full px-6 py-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700">Générer le lien</button>
        </div>
    `;
    
    modalContainer.classList.remove('hidden');

    const closeModalFunc = () => modalContainer.classList.add('hidden');
    
    document.getElementById('close-share-modal-btn').addEventListener('click', closeModalFunc);
    if (modalBackdrop) modalBackdrop.addEventListener('click', closeModalFunc);

    document.getElementById('generate-multi-share-link-btn').addEventListener('click', async () => {
        const generateBtn = document.getElementById('generate-multi-share-link-btn');
        generateBtn.disabled = true;
        generateBtn.textContent = 'Génération...';

        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 24);

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
            closeModalFunc();
        }
    });
}

function showGeneratedLinkModal(url) {
    const modalContent = document.getElementById('modal-content');
    modalContent.innerHTML = `
        <h3 class="text-xl font-semibold mb-4 text-center">Lien de partage généré</h3>
        <p class="text-gray-600 text-center mb-4">Envoyez ce lien à la personne avec qui vous souhaitez partager. Il est à usage unique et expirera dans 24 heures.</p>
        <div class="bg-gray-100 p-3 rounded-lg flex items-center justify-between">
            <input id="share-url-input" type="text" readonly value="${url}" class="bg-transparent border-none text-gray-700 text-sm flex-grow">
            <button id="copy-share-url-btn" class="ml-2 px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700">Copier</button>
        </div>
        <button id="close-share-modal-btn" class="mt-6 w-full px-6 py-3 bg-gray-200 text-gray-800 rounded-lg">Fermer</button>
    `;

    const closeModalFunc = () => document.getElementById('modal-container').classList.add('hidden');
    document.getElementById('close-share-modal-btn').addEventListener('click', closeModalFunc);
    
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
            showToast("Vous ne pouvez pas accepter votre propre partage.");
            await deleteDoc(tokenDocRef);
            return;
        }
        
        // Créer la relation de partage pour les permissions
        const shareRef = doc(db, "user_shares", tokenData.ownerId, "sharers", user.uid);
        await setDoc(shareRef, {
            userName: user.displayName || user.email,
            sharedAt: new Date()
        });

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

// --- NOUVELLES FONCTIONS POUR L'ONGLET "MES PARTAGES" ---

function loadMySharedFields() {
    if (!currentUser) return;
    const q = query(collection(db, 'users', currentUser.uid, 'fields'), where("accessControl", "!=", []));
    
    unsubscribeMyShares = onSnapshot(q, (snapshot) => {
        myFieldsWithShares = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }));
        displayMySharesList();
    }, (error) => {
        console.error("Erreur de chargement de mes partages:", error);
        mySharesListContainer.innerHTML = `<p class="text-center text-red-500 mt-8">Impossible de charger la liste de vos partages.</p>`;
    });
}

async function displayMySharesList() {
    if (!mySharesListContainer) return;

    const usersWithAccess = {};

    // 1. Grouper les parcelles par utilisateur
    myFieldsWithShares.forEach(field => {
        if (field.accessControl && field.accessControl.length > 0) {
            field.accessControl.forEach(userId => {
                if (!usersWithAccess[userId]) {
                    usersWithAccess[userId] = { fields: [] };
                }
                usersWithAccess[userId].fields.push(field);
            });
        }
    });

    if (Object.keys(usersWithAccess).length === 0) {
        mySharesListContainer.innerHTML = `<div class="text-center text-slate-500 mt-8 p-6 bg-slate-100 rounded-lg">
            <h3 class="font-semibold text-slate-700">Aucune parcelle partagée</h3>
            <p class="text-sm mt-1">Vous n'avez partagé aucune de vos parcelles pour le moment.</p>
        </div>`;
        return;
    }

    // 2. Récupérer les informations des utilisateurs
    const userIds = Object.keys(usersWithAccess);
    const userPromises = userIds.map(id => getDoc(doc(db, "users", id)));
    const userDocs = await Promise.all(userPromises);

    userDocs.forEach((userDoc, index) => {
        if (userDoc.exists()) {
            usersWithAccess[userIds[index]].name = userDoc.data().name || 'Utilisateur inconnu';
        } else {
            usersWithAccess[userIds[index]].name = 'Utilisateur supprimé';
        }
    });

    // 3. Afficher la liste groupée
    mySharesListContainer.innerHTML = ''; // Vider la liste
    for (const userId in usersWithAccess) {
        const userData = usersWithAccess[userId];
        const userCard = document.createElement('div');
        userCard.className = 'bg-white rounded-xl shadow-sm border border-slate-200';
        
        // MODIFIÉ: Ajout d'un bouton de révocation pour chaque parcelle
        const fieldListHTML = userData.fields.map(field => 
            `<li class="flex justify-between items-center py-1 group">
                <span class="text-sm text-slate-600">${field.name}</span>
                <button class="revoke-single-access-btn text-xs font-semibold text-red-500 hover:text-red-700 opacity-0 group-hover:opacity-100 transition-opacity"
                        data-field-id="${field.id}"
                        data-user-id="${userId}"
                        data-user-name="${userData.name}"
                        data-field-name="${field.name}">
                    Révoquer
                </button>
            </li>`
        ).join('');

        userCard.innerHTML = `
            <div class="share-user-card-header flex justify-between items-center p-4 cursor-pointer">
                <span class="font-bold text-slate-800">${userData.name}</span>
                <div class="flex items-center gap-4">
                    <button class="revoke-all-access-btn text-xs font-semibold text-red-500 hover:text-red-700" 
                            data-user-id="${userId}" 
                            data-user-name="${userData.name}">
                        Tout révoquer
                    </button>
                    <svg class="w-5 h-5 text-slate-400 transition-transform accordion-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                        <path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd" />
                    </svg>
                </div>
            </div>
            <div class="share-user-card-content hidden border-t border-slate-100 px-4 pb-4 pt-2">
                <p class="text-sm font-semibold text-slate-600 mb-2">Accès aux parcelles :</p>
                <ul class="space-y-1">
                    ${fieldListHTML}
                </ul>
            </div>
        `;
        mySharesListContainer.appendChild(userCard);
    }
}

function handleRevokeSingleAccessForUser(fieldId, userIdToRevoke, userName, fieldName) {
    const message = `Êtes-vous sûr de vouloir révoquer l'accès de <strong>${userName}</strong> à la parcelle <strong>${fieldName}</strong> ?`;

    const action = async () => {
        if (!currentUser) return;
        const fieldDocRef = doc(db, "users", currentUser.uid, "fields", fieldId);
        try {
            await updateDoc(fieldDocRef, {
                accessControl: arrayRemove(userIdToRevoke)
            });
            
            // Vérifier s'il reste d'autres partages pour cet utilisateur
            const q = query(collection(db, 'users', currentUser.uid, 'fields'), where('accessControl', 'array-contains', userIdToRevoke));
            const snapshot = await getDocs(q);
            if (snapshot.empty) {
                const shareRef = doc(db, "user_shares", currentUser.uid, "sharers", userIdToRevoke);
                await deleteDoc(shareRef);
                showToast(`Accès à ${fieldName} révoqué. C'était le dernier partage avec ${userName}.`);
            } else {
                showToast(`Accès à ${fieldName} révoqué pour ${userName}.`);
            }
        } catch (error) {
            console.error("Erreur lors de la révocation de l'accès :", error);
            showToast("Une erreur est survenue.");
        }
    };

    showConfirmationModal(message, action);
}

function handleRevokeAllAccessForUser(userIdToRevoke, userName) {
    const message = `Êtes-vous sûr de vouloir révoquer <strong>tous les accès</strong> de <strong>${userName}</strong> ? Il/Elle ne pourra plus voir aucune de vos parcelles.`;
    
    const action = async () => {
        if (!currentUser) return;
        
        const batch = writeBatch(db);
        const fieldsToUpdate = myFieldsWithShares.filter(field => field.accessControl.includes(userIdToRevoke));

        fieldsToUpdate.forEach(field => {
            const fieldRef = doc(db, "users", currentUser.uid, "fields", field.id);
            batch.update(fieldRef, {
                accessControl: arrayRemove(userIdToRevoke)
            });
        });

        try {
            await batch.commit();
            const shareRef = doc(db, "user_shares", currentUser.uid, "sharers", userIdToRevoke);
            await deleteDoc(shareRef);
            showToast(`Tous les accès de ${userName} ont été révoqués.`);
        } catch (error) {
            console.error("Erreur lors de la révocation de tous les accès :", error);
            showToast("Une erreur est survenue.");
        }
    };

    showConfirmationModal(message, action);
}


// --- Fonctions existantes pour les partages reçus ---

function closeModal() {
    if (modalContainer) modalContainer.classList.add('hidden');
    if (modalContent) modalContent.innerHTML = '';
}

function openSharedModal(content, type) {
    if (!modalContainer || !modalContent) return;

    modalContent.innerHTML = content;
    modalContainer.classList.remove('hidden');

    if (type === 'filterModal') {
        document.getElementById('modal-cancel-btn').addEventListener('click', closeModal);
        const filterOptionsContainer = document.getElementById('modal-filter-options');
        if (filterOptionsContainer) {
            filterOptionsContainer.addEventListener('click', (e) => {
                const button = e.target.closest('.filter-btn');
                if (!button) return;

                const crop = button.dataset.crop;
                if (crop === 'all') {
                    selectedSharedCrops = [];
                } else {
                    const index = selectedSharedCrops.indexOf(crop);
                    if (index > -1) {
                        selectedSharedCrops.splice(index, 1);
                    } else {
                        selectedSharedCrops.push(crop);
                    }
                }
                displaySharedCropFilters();
                displaySharedFieldList();
                closeModal();
            });
        }
    }
}

function showSharedFilterModal() {
    const crops = [...new Set(allSharedFields.map(field => field.crop).filter(Boolean))].sort((a, b) => a.localeCompare(b));

    let filtersHTML = '';
    const allButton = createFilterButton('Toutes', 'all', selectedSharedCrops.length === 0);
    allButton.classList.add('w-full', 'justify-center');
    filtersHTML += allButton.outerHTML;

    crops.forEach(crop => {
        const button = createFilterButton(crop, crop, selectedSharedCrops.includes(crop));
        button.classList.add('w-full', 'justify-center');
        filtersHTML += button.outerHTML;
    });

    const content = `
        <h3 class="text-xl font-semibold mb-6 text-center">Filtrer par culture</h3>
        <div id="modal-filter-options" class="space-y-2">
            ${filtersHTML}
        </div>
        <button id="modal-cancel-btn" class="mt-6 w-full px-6 py-3 bg-slate-200 rounded-lg">Fermer</button>
    `;
    openSharedModal(content, 'filterModal');
}

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

async function displaySharedFieldList() {
    if (allSharedFields.length === 0) {
        sharedFieldListContainer.innerHTML = `<div class="text-center text-slate-500 mt-8 p-6 bg-slate-100 rounded-lg">
            <h3 class="font-semibold text-slate-700">Aucun partage</h3>
            <p class="text-sm mt-1">Aucune parcelle n'a encore été partagée avec vous.</p>
        </div>`;
        return;
    }

    const filteredFields = (selectedSharedCrops.length === 0
        ? allSharedFields
        : allSharedFields.filter(field => selectedSharedCrops.includes(field.crop))
    ).sort((a, b) => a.name.localeCompare(b.name));

    if (filteredFields.length === 0) {
        sharedFieldListContainer.innerHTML = `<div class="text-center text-slate-500 mt-8 p-6 bg-slate-100 rounded-lg">
            <h3 class="font-semibold text-slate-700">Aucune parcelle correspondante</h3>
            <p class="text-sm mt-1">Vérifiez vos filtres pour afficher les parcelles partagées.</p>
        </div>`;
        return;
    }

    const fieldCardPromises = filteredFields.map(async (field) => {
        try {
            const ownerDoc = await getDoc(doc(db, "users", field.ownerId));
            const ownerName = ownerDoc.exists() ? ownerDoc.data().name : "Propriétaire Inconnu";
            
            return `
                <div class="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                    <div class="flex justify-between items-center">
                        <div class="field-card-content cursor-pointer flex-grow pr-2" data-key="${field.id}" data-owner-id="${field.ownerId}">
                            <h3 class="font-bold text-lg text-slate-800">${field.name}</h3>
                            <p class="text-sm text-slate-500">Partagé par : <span class="font-semibold">${ownerName}</span></p>
                            <p class="text-sm text-slate-500">Culture : <span class="font-semibold">${field.crop || 'N/A'}</span></p>
                        </div>
                        <button class="revoke-access-btn p-2 text-slate-400 hover:text-red-600 rounded-full hover:bg-slate-100 transition-colors ml-2 flex-shrink-0" 
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
