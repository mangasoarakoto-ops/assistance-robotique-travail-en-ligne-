import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDktG2Rm1K3pdRw5h4xJDjEjIbEvEa9Gko",
  authDomain: "assistance-robotique.firebaseapp.com",
  projectId: "assistance-robotique",
  storageBucket: "assistance-robotique.firebasestorage.app",
  messagingSenderId: "678171410266",
  appId: "1:678171410266:web:d0cddd65bfd62e908a7d63",
  measurementId: "G-E75XX84FNY"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export { db };
