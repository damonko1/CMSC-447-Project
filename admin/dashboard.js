import { auth } from "../firebase-config.js";
import {
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const logoutBtn = document.getElementById("logout-btn");

onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "./index.html";
  }
});

logoutBtn.addEventListener("click", async () => {
  try {
    await signOut(auth);
    window.location.href = "./index.html";
  } catch (error) {
    console.error("Logout failed:", error);
  }
});