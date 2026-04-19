import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyD0uNC73SafWUgBIyIaC4S0UzAXQZEhkak",
  authDomain: "cmsc-447-project-2a862.firebaseapp.com",
  databaseURL: "https://cmsc-447-project-2a862-default-rtdb.firebaseio.com",
  projectId: "cmsc-447-project-2a862",
  storageBucket: "cmsc-447-project-2a862.firebasestorage.app",
  messagingSenderId: "237422139196",
  appId: "1:237422139196:web:f644d2b67f9b6fc996b039",
  measurementId: "G-NMR2BC9JKK"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getDatabase(app);
export { app };