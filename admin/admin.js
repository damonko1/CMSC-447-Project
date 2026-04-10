import { auth } from "../firebase-config.js";
import {
  signInWithEmailAndPassword,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");

// If user is already logged in and comes back to login page,
// send them straight to dashboard
onAuthStateChanged(auth, (user) => {
  if (user) {
    window.location.href = "./dashboard.html";
  }
});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  loginError.textContent = "";

  try {
    await signInWithEmailAndPassword(auth, email, password);
    window.location.href = "./dashboard.html";
  } catch (error) {
    console.error(error);
    loginError.textContent = "Invalid email or password.";
  }
});