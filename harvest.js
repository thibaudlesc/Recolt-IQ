// harvest.js

import { db, doc, getDoc, updateDoc, onSnapshot, collection, addDoc, query, where, deleteDoc, getDocs } from './firebase-config.js';
import { generateShareLink } from './sharing.js';

// --- SÉLECTION DES ÉLÉMENTS DU DOM (Inchangé) ---
const pageFieldList = document.getElementById('page-field-list');
const pageSharedFieldList = document.getElementById('page-shared-field-list');
const pageFieldDetails = document.getElementById('page-field-details');
const cropFiltersContainer = document.getElementById('crop-filters-container');
const fieldListContainer = document.getElementById('field-list-container');
const detailsHeaderTitle = document.getElementById('details-header-title');
const backToListBtn = document.getElementById('back-to-list-btn');
const fieldInfoCards = document.getElementById('field-info-cards');
const trailersListContainer = document.getElementById('trailers-list');
const addTrailerFab = document.getElementById('add-trailer-fab');
const navFieldsBtn = document.getElementById('nav-fields');
const navSummaryBtn = document.getElementById('nav-summary');
const navExportBtn = document.getElementById('nav-export');
const modalContainer = document.getElementById('modal-container');
const modalContent = document.getElementById('modal-content');
const toast = document.getElementById('toast');
const toastMessage = document.getElementById('toast-message');
const addFieldBtn = document.getElementById('add-field-btn');
const premiumBadge = document.getElementById('premium-badge');

// --- ÉTAT GLOBAL (Inchangé) ---
let currentUser = null;
let userProfile = {};
let harvestData = {};
let trailerNames = []; 
let currentFieldKey = null;
let currentFieldOwnerId = null;
let selectedCrops = [];
let unsubscribeFields;
let unsubscribeTrailerNames;
let unsubscribeTrailers; // Ajout pour se désabonner des écouteurs de bennes
let onConfirmAction = null;
let currentView = 'my-fields';

// --- INITIALISATION ---
export function initHarvestApp(user, profile) {
    currentUser = user;
    userProfile = profile;
    if (unsubscribeFields) unsubscribeFields();
    if (unsubscribeTrailerNames) unsubscribeTrailerNames();

    const fieldsCollectionRef = collection(db, 'users', currentUser.uid, 'fields');
    unsubscribeFields = onSnapshot(query(fieldsCollectionRef), (snapshot) => {
        snapshot.docs.forEach(doc => {
            harvestData[doc.id] = { id: doc.id, ownerId: currentUser.uid, ...doc.data() };
        });
        
        if (currentView === 'my-fields') {
            displayCropFilters();
            displayFieldList();
        }
    }, (error) => showToast("Erreur de chargement des parcelles."));

    const trailerNamesCollectionRef = collection(db, 'users', currentUser.uid, 'trailerNames');
    unsubscribeTrailerNames = onSnapshot(trailerNamesCollectionRef, (snapshot) => {
        trailerNames = [];
        snapshot.forEach(doc => trailerNames.push({ id: doc.id, ...doc.data() }));
        trailerNames.sort((a, b) => a.name.localeCompare(b.name));
    }, (error) => showToast("Erreur de chargement des bennes."));

    setupEventListeners();
}

/**
 * Gère la navigation entre les différentes vues principales de l'application.
 * @param {'list' | 'shared-list' | 'details'} page - La vue à afficher.
 * @param {string | null} key - L'ID de l'élément (ex: fieldId).
 * @param {string | null} ownerId - L'ID du propriétaire (pour les éléments partagés).
 */
export function navigateToPage(page, key = null, ownerId = null) {
    const isMyFieldsVisible = page === 'list';
    const isSharedFieldsVisible = page === 'shared-list';
    const isDetailsVisible = page === 'details';

    pageFieldList.classList.toggle('hidden', !isMyFieldsVisible);
    pageSharedFieldList.classList.toggle('hidden', !isSharedFieldsVisible);
    pageFieldDetails.classList.toggle('hidden', !isDetailsVisible);
    
    if (isMyFieldsVisible) {
        currentView = 'my-fields';
        updateActiveNav('fields');
        displayCropFilters();
        displayFieldList();
    } else if (isSharedFieldsVisible) {
        currentView = 'shared-fields';
        updateActiveNav('shared-fields');
        // Le chargement et l'affichage sont gérés par `loadSharedFields` dans sharing.js
    } else if (isDetailsVisible && key) {
        currentFieldKey = key;
        currentFieldOwnerId = ownerId || currentUser.uid;
        // Maintient l'onglet de navigation actif correct lors de la consultation des détails
        updateActiveNav(currentView === 'my-fields' ? 'fields' : 'shared-fields');
        displayFieldDetails(key, currentFieldOwnerId);
    }
}


/**
 * Met à jour le bouton de navigation actif dans la barre inférieure.
 * @param {string} activeView - L'identifiant de la vue active ('fields', 'shared-fields', etc.)
 */
export function updateActiveNav(activeView) {
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active', 'text-green-600');
        btn.classList.add('text-gray-500');
    });

    const buttonToActivate = document.getElementById(`nav-${activeView}`);
    if (buttonToActivate) {
        buttonToActivate.classList.add('active', 'text-green-600');
        buttonToActivate.classList.remove('text-gray-500');
    }
}


// --- RENDU DE L'INTERFACE UTILISATEUR ---

function displayCropFilters() {
    const myFields = Object.values(harvestData).filter(field => field.ownerId === currentUser.uid);
    const crops = [...new Set(myFields.map(field => field.crop).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    
    cropFiltersContainer.innerHTML = '';
    const allButton = createFilterButton('Toutes', 'all', selectedCrops.length === 0);
    allButton.addEventListener('click', () => {
        selectedCrops = [];
        displayCropFilters();
        displayFieldList();
    });
    cropFiltersContainer.appendChild(allButton);

    crops.forEach(crop => {
        const button = createFilterButton(crop, crop, selectedCrops.includes(crop));
        button.addEventListener('click', () => {
            if (selectedCrops.includes(crop)) {
                selectedCrops = selectedCrops.filter(c => c !== crop);
            } else {
                selectedCrops.push(crop);
            }
            displayCropFilters();
            displayFieldList();
        });
        cropFiltersContainer.appendChild(button);
    });
}

function displayFieldList() {
    fieldListContainer.innerHTML = '';
    const myFields = Object.values(harvestData).filter(key => key.ownerId === currentUser.uid);

    const filteredFields = (selectedCrops.length === 0 
        ? myFields 
        : myFields.filter(field => selectedCrops.includes(field.crop))
    ).sort((a, b) => a.name.localeCompare(b.name));

    if (filteredFields.length === 0) {
        fieldListContainer.innerHTML = `<p class="text-center text-gray-500 mt-8">Aucune parcelle à afficher. Vérifiez vos filtres ou ajoutez une nouvelle parcelle.</p>`;
        return;
    }

    filteredFields.forEach(field => {
        const card = document.createElement('div');
        card.className = 'bg-white p-4 rounded-xl shadow-sm border border-gray-200';
        card.innerHTML = createFieldCardHTML(field);
        fieldListContainer.appendChild(card);
    });
}

async function displayFieldDetails(fieldKey, ownerId) {
    if (unsubscribeTrailers) unsubscribeTrailers(); // Se désabonner de l'écouteur précédent

    const fieldDocRef = doc(db, "users", ownerId, "fields", fieldKey);
    const fieldDocSnap = await getDoc(fieldDocRef);

    if (!fieldDocSnap.exists()) {
        showToast("Parcelle introuvable.");
        navigateToPage(currentView === 'my-fields' ? 'list' : 'shared-list');
        return;
    }

    const field = { id: fieldDocSnap.id, ...fieldDocSnap.data() };
    detailsHeaderTitle.textContent = field.name;

    // Gestion des permissions (simplifiée)
    const isOwner = ownerId === currentUser.uid;
    const isSharedUser = Array.isArray(field.accessControl) && field.accessControl.includes(currentUser.uid);
    const canManageTrailers = isOwner || isSharedUser;
    addTrailerFab.classList.toggle('hidden', !canManageTrailers);

    // Écoute en temps réel de la sous-collection 'trailers'
    const trailersColRef = collection(db, "users", ownerId, "fields", fieldKey, "trailers");
    unsubscribeTrailers = onSnapshot(query(trailersColRef), (trailersSnapshot) => {
        const trailers = trailersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        const { totalWeight, yield: yieldValue, totalBaleCount } = calculateTotals(field, trailers);

        // Mettre à jour les cartes d'information
        const isLinCrop = field.crop && field.crop.toLowerCase().includes('lin');
        let lastCardHTML = isLinCrop 
            ? `<div class="bg-white p-3 rounded-xl shadow-sm text-center"><h3 class="text-xs font-medium text-gray-500">Total Bottes</h3><p class="mt-1 text-lg font-semibold">${totalBaleCount.toLocaleString('fr-FR')}</p></div>`
            : `<div class="bg-white p-3 rounded-xl shadow-sm text-center"><h3 class="text-xs font-medium text-gray-500">Rendement</h3><p class="mt-1 text-lg font-semibold">${yieldValue.toFixed(2)} qx/ha</p></div>`;
        
        fieldInfoCards.innerHTML = `
            <div class="bg-white p-3 rounded-xl shadow-sm text-center"><h3 class="text-xs font-medium text-gray-500">Culture</h3><p class="mt-1 text-lg font-semibold">${field.crop || 'N/A'}</p></div>
            <div class="bg-white p-3 rounded-xl shadow-sm text-center"><h3 class="text-xs font-medium text-gray-500">Surface</h3><p class="mt-1 text-lg font-semibold">${(field.size || 0).toLocaleString('fr-FR')} ha</p></div>
            <div class="bg-white p-3 rounded-xl shadow-sm text-center"><h3 class="text-xs font-medium text-gray-500">Poids Total</h3><p class="mt-1 text-lg font-semibold">${totalWeight.toLocaleString('fr-FR')} kg</p></div>
            ${lastCardHTML}
        `;

        // Afficher la liste des bennes
        trailersListContainer.innerHTML = '';
        if (trailers.length === 0) {
            trailersListContainer.innerHTML = `<p class="text-center text-gray-500 mt-6">Aucune benne enregistrée.</p>`;
            return;
        }

        trailers.sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0)); // Trier par date
        trailers.forEach(trailer => {
            const card = document.createElement('div');
            card.className = 'bg-white p-4 rounded-xl shadow-sm border border-gray-200';
            card.innerHTML = createTrailerCardHTML(trailer, canManageTrailers);
            trailersListContainer.appendChild(card);
        });
    });
}


function createFieldCardHTML(field) {
    // Cette fonction est complexe à adapter sans connaître le total des poids à l'avance.
    // Pour la simplicité, nous allons afficher "..." et le poids sera calculé en entrant dans les détails.
    return `
        <div class="flex justify-between items-center">
            <div class="field-card-content flex-grow cursor-pointer pr-4" data-key="${field.id}" data-owner-id="${field.ownerId}">
                <h3 class="font-bold text-lg text-gray-800">${field.name}</h3>
                <p class="text-sm text-gray-500">${field.crop || 'N/A'} - ${(field.size || 0).toLocaleString('fr-FR')} ha</p>
            </div>
            <div class="flex items-center gap-0 ml-2 flex-shrink-0">
                <button class="share-field-btn p-2 text-gray-400 hover:text-green-600" data-key="${field.id}" title="Partager">...</button>
                <button class="edit-field-btn p-2 text-gray-400 hover:text-blue-600" data-key="${field.id}" title="Modifier">...</button>
                <button class="delete-field-btn p-2 text-gray-400 hover:text-red-600" data-key="${field.id}" title="Supprimer">...</button>
            </div>
        </div>
    `;
}

function createTrailerCardHTML(trailer, canManage) {
    const netWeight = (trailer.full && trailer.empty) ? trailer.full - trailer.empty : '---';
    const isFinalized = trailer.empty !== null && trailer.empty > 0;
    const baleInfo = (typeof trailer.baleCount === 'number') ? `<p>Bottes: ${trailer.baleCount}</p>` : '';

    const editControls = canManage ? `
        <button class="edit-btn p-2" data-id="${trailer.id}" title="Modifier">...</button>
        <button class="delete-btn p-2" data-id="${trailer.id}" title="Supprimer">...</button>
    ` : '';
    
    return `
        <div>
            <p>${trailer.trailerName || 'Benne'}</p>
            <p>${typeof netWeight === 'number' ? netWeight.toLocaleString('fr-FR') : '??'} kg</p>
            <p>Plein: ${trailer.full || '---'} / Vide: ${trailer.empty || '---'}</p>
            ${baleInfo}
        </div>
        <div>
            ${canManage && !isFinalized ? `<button class="finalize-btn" data-id="${trailer.id}">Finaliser</button>` : ''}
            ${isFinalized ? `<span>Terminé</span>` : ''}
            ${editControls}
        </div>
    `;
}

// --- GESTION DES MODALES ---

function openModal(content, type) {
    modalContent.innerHTML = content;
    modalContainer.classList.remove('hidden');

    const listeners = {
        'addField': () => {
            document.getElementById('modal-cancel-btn').addEventListener('click', closeModal);
            document.getElementById('modal-confirm-btn').addEventListener('click', handleSaveNewField);
        },
        'editField': () => {
            document.getElementById('modal-cancel-btn').addEventListener('click', closeModal);
            document.getElementById('modal-confirm-btn').addEventListener('click', handleSaveFieldEdit);
        },
        'upgrade': () => {
            document.getElementById('modal-close-btn').addEventListener('click', closeModal);
            document.getElementById('modal-upgrade-btn').addEventListener('click', upgradeToPremium);
        },
        'payment': () => {
             document.getElementById('modal-cancel-btn').addEventListener('click', closeModal);
             document.getElementById('modal-pay-btn').addEventListener('click', upgradeToPremium);
        },
        'weight': () => {
            document.getElementById('modal-cancel-btn').addEventListener('click', closeModal);
            document.getElementById('modal-confirm-btn').addEventListener('click', handleConfirmWeight);
            const addBtn = document.getElementById('add-trailer-name-btn');
            if (addBtn) addBtn.addEventListener('click', showAddTrailerNameModal);
        },
        'edit': () => {
            document.getElementById('edit-modal-cancel-btn').addEventListener('click', closeModal);
            document.getElementById('edit-modal-save-btn').addEventListener('click', handleSaveEdit);
        },
        'confirmation': () => {
            document.getElementById('confirmation-cancel-btn').addEventListener('click', closeModal);
            document.getElementById('confirmation-confirm-btn').addEventListener('click', () => {
                if (typeof onConfirmAction === 'function') onConfirmAction();
                closeModal();
            });
        },
        'addTrailerName': () => {
            document.getElementById('add-trailer-name-cancel-btn').addEventListener('click', () => showWeightModal('full'));
            document.getElementById('add-trailer-name-confirm-btn').addEventListener('click', handleAddNewTrailerName);
        }
    };
    if (listeners[type]) listeners[type]();
}

function closeModal() {
    modalContainer.classList.add('hidden');
    modalContent.innerHTML = '';
    onConfirmAction = null;
}

export function showPaymentModal() {
    const content = `
        <h3 class="text-xl font-semibold mb-6 text-center">Passer à la version Premium</h3>
        <p class="text-center text-gray-600 mb-6">
            Confirmez le paiement de 5€ pour débloquer toutes les fonctionnalités.
        </p>
        <div class="mt-8 grid grid-cols-2 gap-4">
            <button id="modal-cancel-btn" class="px-6 py-3 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300">Annuler</button>
            <button id="modal-pay-btn" class="px-6 py-3 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700">Payer</button>
        </div>
    `;
    openModal(content, 'payment');
}

function showAddFieldModal() {
    const fieldCount = Object.keys(harvestData).filter(k => harvestData[k].ownerId === currentUser.uid).length;
    if (userProfile.plan === 'demo' && fieldCount >= 3) {
        const content = `
            <h3 class="text-2xl font-bold mb-4 text-center">Limite de la version démo atteinte</h3>
            <p class="text-center text-gray-600 mb-6">Passez à la version Pro pour ajouter des parcelles en illimité.</p>
            <div class="bg-green-50 border border-green-200 p-6 rounded-lg text-center">
                 <p class="font-semibold text-green-800 text-xl">Version PRO</p>
                 <p class="text-5xl font-extrabold text-green-600 my-4">5€ <span class="text-xl font-normal">/ mois</span></p>
                 <button id="modal-upgrade-btn" class="mt-6 w-full bg-green-600 text-white font-bold py-3 rounded-lg hover:bg-green-700 transition">Mettre à niveau</button>
            </div>
            <button id="modal-close-btn" class="mt-4 w-full text-center text-sm text-gray-600 hover:underline">Plus tard</button>
        `;
        openModal(content, 'upgrade');
        return;
    }

    const content = `
        <h3 class="text-xl font-semibold mb-6 text-center">Ajouter une parcelle</h3>
        <div class="space-y-4">
            <input type="text" id="field-name-input" placeholder="Nom de la parcelle" class="w-full p-3 border-2 border-gray-300 rounded-lg">
            <input type="text" id="field-crop-input" placeholder="Culture" class="w-full p-3 border-2 border-gray-300 rounded-lg">
            <input type="number" step="0.01" id="field-size-input" placeholder="Surface (ha)" class="w-full p-3 border-2 border-gray-300 rounded-lg">
        </div>
        <p id="add-field-modal-error" class="text-red-500 text-sm hidden text-center mt-2"></p>
        <div class="mt-8 grid grid-cols-2 gap-4">
            <button id="modal-cancel-btn" class="px-6 py-3 bg-gray-200 rounded-lg">Annuler</button>
            <button id="modal-confirm-btn" class="px-6 py-3 bg-green-600 text-white rounded-lg">Enregistrer</button>
        </div>
    `;
    openModal(content, 'addField');
}

function showEditFieldModal(fieldKey) {
    const field = harvestData[fieldKey];
    if (!field) return;

    const content = `
        <h3 class="text-xl font-semibold mb-6 text-center">Modifier : ${field.name}</h3>
        <div class="space-y-4">
             <div>
                <label for="field-name-input" class="block text-sm font-medium text-gray-700 mb-1">Nom de la parcelle</label>
                <input type="text" id="field-name-input" value="${field.name}" placeholder="Nom de la parcelle" class="w-full p-3 border-2 border-gray-300 rounded-lg">
            </div>
            <div>
                <label for="field-crop-input" class="block text-sm font-medium text-gray-700 mb-1">Culture</label>
                <input type="text" id="field-crop-input" value="${field.crop}" placeholder="Culture" class="w-full p-3 border-2 border-gray-300 rounded-lg">
            </div>
            <div>
                <label for="field-size-input" class="block text-sm font-medium text-gray-700 mb-1">Surface (ha)</label>
                <input type="number" step="0.01" id="field-size-input" value="${field.size}" placeholder="Surface (ha)" class="w-full p-3 border-2 border-gray-300 rounded-lg">
            </div>
        </div>
        <input type="hidden" id="field-key-input" value="${fieldKey}">
        <p id="add-field-modal-error" class="text-red-500 text-sm hidden text-center mt-2"></p>
        <div class="mt-8 grid grid-cols-2 gap-4">
            <button id="modal-cancel-btn" class="px-6 py-3 bg-gray-200 rounded-lg">Annuler</button>
            <button id="modal-confirm-btn" class="px-6 py-3 bg-blue-600 text-white rounded-lg">Enregistrer</button>
        </div>
    `;
    openModal(content, 'editField');
}

function showWeightModal(mode, index = -1) {
    const fieldDocRef = doc(db, "users", currentFieldOwnerId, "fields", currentFieldKey);
    getDoc(fieldDocRef).then(fieldDocSnap => {
        if (!fieldDocSnap.exists()) return;
        const field = fieldDocSnap.data();
        const isLinCrop = field && field.crop && field.crop.toLowerCase().includes('lin');
        
        let content = '';
        if (mode === 'full') {
            const trailerOptions = trailerNames.map(t => `<option value="${t.name}">${t.name}</option>`).join('');
            const baleInputHTML = isLinCrop ? `
                <div>
                    <label for="bale-count-input" class="block text-sm font-medium text-gray-700 mb-1">Nombre de bottes</label>
                    <input type="number" inputmode="numeric" id="bale-count-input" class="w-full p-4 border-2 border-gray-300 rounded-lg text-xl text-center" placeholder="0">
                </div>` : '';

            content = `
                <h3 class="text-xl font-semibold mb-6 text-center">Nouvelle benne pleine</h3>
                <div class="space-y-4">
                    <div>
                        <label for="trailer-name-select" class="block text-sm font-medium text-gray-700 mb-1">Nom de la benne</label>
                        <div class="flex items-center gap-2">
                            <select id="trailer-name-select" class="w-full p-3 border-2 border-gray-300 rounded-lg text-lg focus:ring-2 focus:ring-green-500 transition">
                                <option value="">Sélectionner...</option>
                                ${trailerOptions}
                            </select>
                            <button id="add-trailer-name-btn" class="p-3 bg-gray-200 rounded-lg hover:bg-gray-300 transition shrink-0">
                                <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                            </button>
                        </div>
                    </div>
                    <div>
                        <label for="weight-input" class="block text-sm font-medium text-gray-700 mb-1">Poids plein (kg)</label>
                        <input type="number" inputmode="numeric" id="weight-input" data-mode="full" class="w-full p-4 border-2 border-gray-300 rounded-lg text-xl text-center focus:ring-2 focus:ring-green-500 transition" placeholder="0 kg">
                    </div>
                    ${baleInputHTML}
                </div>
                <p id="weight-modal-error" class="text-red-500 text-sm hidden text-center mt-2"></p>
                <div class="mt-8 grid grid-cols-2 gap-4">
                    <button id="modal-cancel-btn" class="px-6 py-3 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition">Annuler</button>
                    <button id="modal-confirm-btn" class="px-6 py-3 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 transition">Valider</button>
                </div>`;
        } else { // mode === 'empty'
            content = `
                <h3 class="text-xl font-semibold mb-6 text-center">Finaliser : Poids à vide</h3>
                <input type="number" inputmode="numeric" id="weight-input" data-mode="empty" data-index="${index}" class="w-full p-4 border-2 border-gray-300 rounded-lg text-xl text-center" placeholder="0 kg">
                <p id="weight-modal-error" class="text-red-500 text-sm hidden text-center mt-2"></p>
                <div class="mt-8 grid grid-cols-2 gap-4">
                    <button id="modal-cancel-btn" class="px-6 py-3 bg-gray-200 text-gray-800 rounded-lg">Annuler</button>
                    <button id="modal-confirm-btn" class="px-6 py-3 bg-green-600 text-white font-bold rounded-lg">Valider</button>
                </div>`;
        }
        openModal(content, 'weight');
    });
}

function showEditModal(index) {
    const fieldDocRef = doc(db, "users", currentFieldOwnerId, "fields", currentFieldKey);
    getDoc(fieldDocRef).then(fieldDocSnap => {
        if (!fieldDocSnap.exists()) return;
        const trailer = fieldDocSnap.data().trailers[index];
        const content = `
            <h3 class="text-xl font-semibold mb-6 text-center">Modifier la pesée</h3>
            <div class="space-y-4">
                <div>
                    <label for="edit-weight-full" class="block text-sm font-medium text-gray-700">Poids Plein (kg)</label>
                    <input type="number" inputmode="numeric" id="edit-weight-full" data-index="${index}" value="${trailer.full || ''}" class="mt-1 w-full p-3 border-2 border-gray-300 rounded-lg text-lg text-center">
                </div>
                <div>
                    <label for="edit-weight-empty" class="block text-sm font-medium text-gray-700">Poids Vide (kg)</label>
                    <input type="number" inputmode="numeric" id="edit-weight-empty" value="${trailer.empty || ''}" class="mt-1 w-full p-3 border-2 border-gray-300 rounded-lg text-lg text-center">
                </div>
            </div>
            <div class="mt-8 grid grid-cols-2 gap-4">
                <button id="edit-modal-cancel-btn" class="px-6 py-3 bg-gray-200 rounded-lg">Annuler</button>
                <button id="edit-modal-save-btn" class="px-6 py-3 bg-blue-600 text-white font-bold rounded-lg">Enregistrer</button>
            </div>
        `;
        openModal(content, 'edit');
    });
}


function showAddTrailerNameModal() {
    const content = `
        <h3 class="text-xl font-semibold mb-6 text-center">Ajouter un nom de benne</h3>
        <input type="text" id="new-trailer-name-input" class="w-full p-4 border-2 border-gray-300 rounded-lg text-lg text-center" placeholder="Ex: Benne Rouge">
        <p id="add-trailer-name-error" class="text-red-500 text-sm hidden text-center mt-2"></p>
        <div class="mt-8 grid grid-cols-2 gap-4">
            <button id="add-trailer-name-cancel-btn" class="px-6 py-3 bg-gray-200 rounded-lg">Annuler</button>
            <button id="add-trailer-name-confirm-btn" class="px-6 py-3 bg-blue-600 text-white font-bold rounded-lg">Ajouter</button>
        </div>
    `;
    openModal(content, 'addTrailerName');
}

export function showConfirmationModal(message, onConfirm) {
    onConfirmAction = onConfirm;
    const content = `
        <div class="text-center">
            <h3 class="text-lg font-medium text-gray-900 mt-5">Confirmer l'action</h3>
            <p class="text-sm text-gray-600 mt-2">${message}</p>
        </div>
        <div class="mt-6 grid grid-cols-2 gap-4">
            <button id="confirmation-cancel-btn" class="px-6 py-3 bg-gray-200 rounded-lg">Annuler</button>
            <button id="confirmation-confirm-btn" class="px-6 py-3 bg-red-600 text-white font-bold rounded-lg">Confirmer</button>
        </div>
    `;
    openModal(content, 'confirmation');
}

// --- ACTIONS & EVENT HANDLERS ---
async function upgradeToPremium() {
    if (!currentUser) return;
    const userDocRef = doc(db, "users", currentUser.uid);
    try {
        await updateDoc(userDocRef, { plan: 'pro' });
        userProfile.plan = 'pro';
        premiumBadge.classList.remove('hidden');
        showToast("Félicitations, vous êtes maintenant Premium !");
        closeModal();
    } catch (error) {
        console.error("Erreur lors de la mise à niveau :", error);
        showToast("Une erreur est survenue.");
    }
}

async function handleSaveNewField() {
    const name = document.getElementById('field-name-input').value.trim();
    const crop = document.getElementById('field-crop-input').value.trim();
    const size = parseFloat(document.getElementById('field-size-input').value);
    const errorEl = document.getElementById('add-field-modal-error');

    if (!name || !crop || isNaN(size) || size <= 0) {
        errorEl.textContent = "Veuillez remplir tous les champs.";
        errorEl.classList.remove('hidden');
        return;
    }
    errorEl.classList.add('hidden');

    try {
        const fieldsCollectionRef = collection(db, 'users', currentUser.uid, 'fields');
        
        await addDoc(collection(db, 'users', currentUser.uid, 'fields'), { 
            name, crop, size, 
            ownerId: currentUser.uid,
            accessControl: [] // Indispensable
        });

        showToast(`Parcelle "${name}" ajoutée !`);
        closeModal();
    } catch (error) {
        console.error("Error adding field:", error);
        showToast("Erreur lors de l'ajout de la parcelle.");
    }
}


async function handleSaveFieldEdit() {
    const name = document.getElementById('field-name-input').value.trim();
    const crop = document.getElementById('field-crop-input').value.trim();
    const size = parseFloat(document.getElementById('field-size-input').value);
    const fieldKey = document.getElementById('field-key-input').value;
    const errorEl = document.getElementById('add-field-modal-error');

    if (!name || !crop || isNaN(size) || size <= 0) {
        errorEl.textContent = "Veuillez remplir tous les champs.";
        errorEl.classList.remove('hidden');
        return;
    }
    errorEl.classList.add('hidden');

    try {
        const fieldDocRef = doc(db, 'users', currentUser.uid, 'fields', fieldKey);
        await updateDoc(fieldDocRef, { name, crop, size });
        showToast(`Parcelle "${name}" modifiée !`);
        closeModal();
    } catch (error) {
        console.error("Error updating field:", error);
        showToast("Erreur lors de la modification.");
    }
}


async function handleConfirmWeight() {
    const weightInput = document.getElementById('weight-input');
    const weight = parseInt(weightInput.value);
    const mode = weightInput.dataset.mode;
    const trailerId = weightInput.dataset.id; // On utilise l'ID du document benne

    if (isNaN(weight) || weight <= 0) { /* ...gestion erreur... */ return; }

    if (mode === 'full') {
        const trailerName = document.getElementById('trailer-name-select').value;
        if (!trailerName) { /* ...gestion erreur... */ return; }

        const newTrailer = { 
            trailerName,
            full: weight, 
            empty: null, 
            createdAt: new Date() // Important pour le tri
        };
        const baleCountInput = document.getElementById('bale-count-input');
        if (baleCountInput) newTrailer.baleCount = parseInt(baleCountInput.value) || 0;

        // Ajoute un NOUVEAU DOCUMENT dans la sous-collection
        const trailersColRef = collection(db, "users", currentFieldOwnerId, "fields", currentFieldKey, "trailers");
        await addDoc(trailersColRef, newTrailer);

    } else if (mode === 'empty' && trailerId) {
        // Met à jour un DOCUMENT EXISTANT dans la sous-collection
        const trailerDocRef = doc(db, "users", currentFieldOwnerId, "fields", currentFieldKey, "trailers", trailerId);
        await updateDoc(trailerDocRef, { empty: weight });
    }
    
    showToast('Pesée enregistrée.');
    closeModal();
}

async function handleSaveEdit() {
    const trailerId = document.getElementById('edit-weight-full').dataset.id;
    const newFull = parseInt(document.getElementById('edit-weight-full').value);
    const newEmpty = parseInt(document.getElementById('edit-weight-empty').value);

    const trailerDocRef = doc(db, "users", currentFieldOwnerId, "fields", currentFieldKey, "trailers", trailerId);
    const dataToUpdate = {};
    if (!isNaN(newFull) && newFull > 0) dataToUpdate.full = newFull;
    if (!isNaN(newEmpty) && newEmpty > 0) dataToUpdate.empty = newEmpty;

    await updateDoc(trailerDocRef, dataToUpdate);
    showToast('Benne modifiée.');
    closeModal();
}


function handleDeleteField(fieldKey) {
    const field = harvestData[fieldKey];
    if (!field) return;

    const message = `Êtes-vous sûr de vouloir supprimer la parcelle "${field.name}" ? Toutes les données de récolte associées seront perdues.`;

    const action = async () => {
        try {
            const fieldDocRef = doc(db, 'users', currentUser.uid, 'fields', fieldKey);
            await deleteDoc(fieldDocRef);
            delete harvestData[fieldKey];
            displayFieldList();
            showToast(`Parcelle "${field.name}" supprimée.`);
        } catch (error) {
            showToast("Erreur lors de la suppression.");
            console.error("Firestore delete error:", error);
        }
    };
    showConfirmationModal(message, action);
}

function handleDeleteTrailer(trailerId) {
    const action = async () => {
        const trailerDocRef = doc(db, "users", currentFieldOwnerId, "fields", currentFieldKey, "trailers", trailerId);
        await deleteDoc(trailerDocRef);
        showToast('Pesée supprimée.');
    };
    showConfirmationModal("Êtes-vous sûr de vouloir supprimer cette pesée ?", action);
}

async function handleAddNewTrailerName() {
    const input = document.getElementById('new-trailer-name-input');
    const name = input.value.trim();
    if (!name) {
        document.getElementById('add-trailer-name-error').textContent = "Le nom ne peut pas être vide.";
        document.getElementById('add-trailer-name-error').classList.remove('hidden');
        return;
    }

    try {
        const trailerNamesCollectionRef = collection(db, 'users', currentUser.uid, 'trailerNames');
        await addDoc(trailerNamesCollectionRef, { name: name });
        showToast(`Benne "${name}" ajoutée.`);
        showWeightModal('full'); // Refresh modal
    } catch (error) {
        console.error("Error adding trailer name:", error);
        showToast("Erreur lors de l'ajout.");
    }
}

function setupEventListeners() {
    backToListBtn.addEventListener('click', () => {
        navigateToPage(currentView === 'my-fields' ? 'list' : 'shared-list');
    });

    addFieldBtn.addEventListener('click', showAddFieldModal);
    addTrailerFab.addEventListener('click', () => { if (currentFieldKey) showWeightModal('full'); });
    
    navFieldsBtn.addEventListener('click', () => navigateToPage('list'));
    navSummaryBtn.addEventListener('click', showGlobalResults);
    navExportBtn.addEventListener('click', exportToExcel);

    fieldListContainer.addEventListener('click', (e) => {
        const shareBtn = e.target.closest('.share-field-btn');
        const editBtn = e.target.closest('.edit-field-btn');
        const deleteBtn = e.target.closest('.delete-field-btn');
        const cardContent = e.target.closest('.field-card-content');
        
        if (shareBtn) return generateShareLink(shareBtn.dataset.key);
        if (editBtn) return showEditFieldModal(editBtn.dataset.key);
        if (deleteBtn) return handleDeleteField(deleteBtn.dataset.key);
        if (cardContent) return navigateToPage('details', cardContent.dataset.key, cardContent.dataset.ownerId);
    });

    trailersListContainer.addEventListener('click', (e) => {
        const finalizeBtn = e.target.closest('.finalize-btn');
        const editBtn = e.target.closest('.edit-btn');
        const deleteBtn = e.target.closest('.delete-btn');
        
        if (finalizeBtn) return showWeightModal('empty', finalizeBtn.dataset.id);
        if (editBtn) return showEditModal(editBtn.dataset.id);
        if (deleteBtn) return handleDeleteTrailer(deleteBtn.dataset.id);
    });
    
    
    modalContainer.addEventListener('click', (e) => {
        if (e.target.id === 'modal-backdrop') closeModal();
    });
}

// --- FONCTIONS UTILITAIRES ---
export function showToast(message) {
    toastMessage.textContent = message;
    toast.classList.remove('hidden');
    setTimeout(() => {
        toast.classList.add('hidden');
    }, 3000);
}

function createFilterButton(text, crop, isActive) {
    const button = document.createElement('button');
    button.className = `filter-btn whitespace-nowrap px-4 py-2 text-sm font-medium rounded-full transition-colors border ${isActive ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-700 border-gray-300'}`;
    button.textContent = text;
    button.dataset.crop = crop;
    return button;
}

function calculateTotals(field, trailers) {
    if (!field || !trailers) return { totalWeight: 0, yield: 0, totalBaleCount: 0 };
    
    const totalWeight = trailers.reduce((sum, t) => (t.full && t.empty) ? sum + (t.full - t.empty) : sum, 0);
    const totalBaleCount = trailers.reduce((sum, t) => sum + (Number(t.baleCount) || 0), 0);
    const yieldValue = field.size > 0 ? (totalWeight / field.size) / 100 : 0;
    
    return { totalWeight, yield: yieldValue, totalBaleCount };
}

function showGlobalResults() {
    if (selectedCrops.length === 0) {
        showToast("Veuillez sélectionner au moins une culture à résumer.");
        return;
    }
    let totalWeight = 0, totalArea = 0, totalBales = 0;
    const hasLinCrop = selectedCrops.some(crop => crop.toLowerCase().includes('lin'));

    Object.values(harvestData).forEach(field => {
        if (selectedCrops.includes(field.crop) && field.ownerId === currentUser.uid) {
            totalArea += field.size || 0;
            const totals = calculateTotals(field);
            totalWeight += totals.totalWeight || 0;
            totalBales += totals.totalBaleCount || 0;
        }
    });

    const globalYield = totalArea > 0 ? (totalWeight / totalArea) / 100 : 0;

    let summaryHTML = `
        <div class="flex justify-between items-center bg-gray-100 p-3 rounded-lg"><span class="font-medium">Surface Totale</span><span class="font-bold">${totalArea.toLocaleString('fr-FR')} ha</span></div>
        <div class="flex justify-between items-center bg-gray-100 p-3 rounded-lg"><span class="font-medium">Poids Total</span><span class="font-bold">${totalWeight.toLocaleString('fr-FR')} kg</span></div>
    `;
    if (hasLinCrop) {
        summaryHTML += `<div class="flex justify-between items-center bg-gray-100 p-3 rounded-lg"><span class="font-medium">Total Bottes</span><span class="font-bold">${totalBales.toLocaleString('fr-FR')}</span></div>`;
    } else {
        summaryHTML += `<div class="flex justify-between items-center bg-gray-100 p-3 rounded-lg"><span class="font-medium">Rendement Moyen</span><span class="font-bold">${globalYield.toFixed(2)} qx/ha</span></div>`;
    }

    const content = `
        <h3 class="text-xl font-semibold mb-4 text-center">Récapitulatif de la récolte</h3>
        <p class="text-sm text-center text-gray-600 mb-6">Pour : <span class="font-semibold">${selectedCrops.join(', ')}</span></p>
        <div class="space-y-3">${summaryHTML}</div>
        <div class="mt-8"><button id="global-results-close-btn" class="w-full px-6 py-3 bg-gray-200 text-gray-800 rounded-lg">Fermer</button></div>
    `;

    openModal(content, 'confirmation'); 
    document.getElementById('confirmation-confirm-btn').classList.add('hidden');
    document.getElementById('confirmation-cancel-btn').textContent = "Fermer";
    document.getElementById('confirmation-cancel-btn').addEventListener('click', closeModal);

}


function exportToExcel() {
    const fieldsToExport = Object.values(harvestData).filter(f => f.ownerId === currentUser.uid);
    if (fieldsToExport.length === 0) {
        showToast("Aucune donnée à exporter.");
        return;
    }
    const wb = XLSX.utils.book_new();
    const recapAOA = [
        ["Récapitulatif de la Récolte - Recolt'IQ"], [],
        ["Parcelle", "Culture", "Surface (ha)", "Poids Total (kg)", "Rendement (qx/ha)", "Total Bottes"]
    ];
    const sortedFields = fieldsToExport.sort((a,b) => a.name.localeCompare(b.name));

    sortedFields.forEach(field => {
        const { totalWeight, yield: fieldYield, totalBaleCount } = calculateTotals(field);
        const isLinCrop = field.crop && field.crop.toLowerCase().includes('lin');
        const yieldDisplay = isLinCrop ? '' : fieldYield.toFixed(2);
        const baleDisplay = isLinCrop ? totalBaleCount : '';
        recapAOA.push([field.name, field.crop || "N/A", field.size || 0, totalWeight, yieldDisplay, baleDisplay]);
    });

    const wsRecap = XLSX.utils.aoa_to_sheet(recapAOA);
    XLSX.utils.book_append_sheet(wb, wsRecap, "Récapitulatif");

    sortedFields.forEach(field => {
        const sheetName = field.name.replace(/[\\/*?:"<>|]/g, "").substring(0, 31);
        const aoa = [
            ["Détail Parcelle:", field.name], ["Culture:", field.crop], [],
            ["#", "Nom Benne", "Poids Plein (kg)", "Poids Vide (kg)", "Poids Net (kg)", "Bottes"]
        ];
        if (field.trailers && field.trailers.length > 0) {
            field.trailers.forEach((trailer, index) => {
                const net = (trailer.full && trailer.empty) ? trailer.full - trailer.empty : 0;
                aoa.push([index + 1, trailer.trailerName || 'Benne', trailer.full || 0, trailer.empty || 0, net, trailer.baleCount || '']);
            });
        }
        const ws = XLSX.utils.aoa_to_sheet(aoa);
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
    });

    XLSX.writeFile(wb, `Export_RecoltIQ_${new Date().toISOString().slice(0,10)}.xlsx`);
    showToast("Exportation Excel terminée.");
}
