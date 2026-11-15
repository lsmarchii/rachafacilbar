// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDbZBIxxf1hiLcYe7MlU7RANdp7jb5VDKY",
  authDomain: "rachafacilbar.firebaseapp.com",
  projectId: "rachafacilbar",
  storageBucket: "rachafacilbar.firebasestorage.app",
  messagingSenderId: "664997656980",
  appId: "1:664997656980:web:c3010aebe5066a59c33781",
  measurementId: "G-F0790JGS25"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);