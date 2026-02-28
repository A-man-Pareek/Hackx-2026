import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyBJ9cnHSjFDrid7m_-GqsnixLK7P84aeRE",
    authDomain: "hackx26.firebaseapp.com",
    projectId: "hackx26"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

const signInButton = document.getElementById("signIn");
const signUpButton = document.getElementById("signUp");
const container = document.getElementById("container");
const startCustomerBtn = document.getElementById("startCustomerBtn");
const startOwnerBtn = document.getElementById("startOwnerBtn");
const mainWrapper = document.getElementById("mainWrapper");
const brandIntro = document.getElementById("brandIntro");

let selectedRole = null;

const proceedToLogin = (role) => {
    selectedRole = role;
    localStorage.setItem('reviewiq_signup_role', role);

    // Customize UI specific text
    const signUpTitle = document.querySelector('.sign-up-container h1');
    if (signUpTitle) {
        signUpTitle.textContent = role === 'customer' ? 'Customer Signup' : 'Owner Signup';
    }

    brandIntro.style.opacity = "0";
    setTimeout(() => {
        brandIntro.style.display = "none";
        mainWrapper.style.display = "block";
        setTimeout(() => {
            mainWrapper.classList.add("show");
        }, 50);
    }, 300);
};

if (startCustomerBtn) startCustomerBtn.addEventListener("click", () => proceedToLogin('customer'));
if (startOwnerBtn) startOwnerBtn.addEventListener("click", () => proceedToLogin('restaurant_owner'));

signUpButton.addEventListener("click", () => container.classList.add("right-panel-active"));
signInButton.addEventListener("click", () => container.classList.remove("right-panel-active"));

// Signup Logic
const signUpForm = document.querySelector('.sign-up-container form');
signUpForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const inputs = signUpForm.querySelectorAll('input');
    const name = inputs[0].value;
    const email = inputs[1].value;
    const password = inputs[2].value;

    if (!selectedRole) {
        alert("Please refresh and select a role first.");
        return;
    }

    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        const idToken = await user.getIdToken();

        // Create user deeply in our system database
        const response = await fetch('http://localhost:8000/auth/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${idToken}`
            },
            body: JSON.stringify({
                name,
                role: selectedRole
            })
        });

        const data = await response.json();
        if (data.success) {
            alert(`Welcome to ReviewIQ! Successfully registered as a ${selectedRole.replace('_', ' ')}.`);
            container.classList.remove("right-panel-active"); // switch to sign in
        } else {
            alert(`Error mapping system profile: ${data.error}`);
        }
    } catch (error) {
        alert(`Firebase Registration Failed: ${error.message}`);
    }
});

// Login Logic
const signInForm = document.querySelector('.sign-in-container form');
signInForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const inputs = signInForm.querySelectorAll('input');
    const email = inputs[0].value;
    const password = inputs[1].value;

    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        const idToken = await user.getIdToken();

        // Save token to localStorage for subsequent backend requests
        localStorage.setItem('reviewiq_auth_token', idToken);

        // Final UI Redirect
        alert("Logged in successfully! Let's get to work.");
        // window.location.href = '/frontend/html/dashboard.html'; // TBD next Phase
    } catch (error) {
        alert(`Firebase Access Denied: ${error.message}`);
    }
});