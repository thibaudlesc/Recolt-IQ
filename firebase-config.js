// firebase-config.js

// Imports from Firebase SDKs
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-app.js";
import { 
    getAuth, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    onAuthStateChanged,
    signOut,
    sendPasswordResetEmail,
    GoogleAuthProvider, // [NOUVEAU] Fournisseur d'authentification Google
    signInWithPopup     // [NOUVEAU] Fonction pour la connexion via pop-up
} from "https://www.gstatic.com/firebasejs/9.17.1/firebase-auth.js";
import { 
    getFirestore, 
    doc, 
    setDoc, 
    getDoc, 
    updateDoc, 
    onSnapshot, 
    collection, 
    addDoc, 
    query, 
    where,
    deleteDoc,
    arrayUnion,
    arrayRemove,
    collectionGroup,
    writeBatch
} from "https://www.gstatic.com/firebasejs/9.17.1/firebase-firestore.js";

// TODO: Remplacez par la configuration de votre projet Firebase
const firebaseConfig = {
  apiKey: "AIzaSyB7PBlp6EGZGzPQ4wav2AMQZ_in0WWZnyo",
  authDomain: "recolt-iq.firebaseapp.com",
  projectId: "recolt-iq",
  storageBucket: "recolt-iq.firebasestorage.app",
  messagingSenderId: "1069534683318",
  appId: "1:1069534683318:web:633bad25dd9889cdb98617",
  measurementId: "G-V8RXV292T7"
};

// Initialiser Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Exporter toutes les fonctions et objets nécessaires
export { 
    app,
    auth, 
    db,
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    onAuthStateChanged,
    signOut,
    sendPasswordResetEmail,
    GoogleAuthProvider, // [NOUVEAU]
    signInWithPopup,    // [NOUVEAU]
    doc, 
    setDoc, 
    getDoc,
    updateDoc,
    onSnapshot,
    collection,
    addDoc,
    query,
    where,
    deleteDoc,
    arrayUnion,
    arrayRemove,
    collectionGroup,
    writeBatch
};
