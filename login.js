import { auth } from "./firebase-config.js";
import {
    signInWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");

loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;

    loginError.textContent = "";
    loginError.style.display = "none";

    try {
        await signInWithEmailAndPassword(auth, email, password);
        window.location.href = "./main_page.html";
    } catch (error) {
        console.error(error);
        loginError.textContent = "Invalid email or password.";
        loginError.style.display = "block";
    }
});
