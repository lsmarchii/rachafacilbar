import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// These values identify the Firebase web app. The Firestore database itself
// must also be created and its security rules configured in Firebase Console.
const firebaseConfig = {
  apiKey: "AIzaSyDbZBIxxf1hiLcYe7MlU7RANdp7jb5VDKY",
  authDomain: "rachafacilbar.firebaseapp.com",
  projectId: "rachafacilbar",
  storageBucket: "rachafacilbar.firebasestorage.app",
  messagingSenderId: "664997656980",
  appId: "1:664997656980:web:c3010aebe5066a59c33781",
  measurementId: "G-F0790JGS25"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
