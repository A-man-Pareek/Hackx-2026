import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

let auth;
let db;

// Firebase Config
const firebaseConfig = {
    apiKey: "AIzaSyBthIwz58nk23yTy8ntgN0T0ATqKUSHZbU",
    authDomain: "hackx26.firebaseapp.com",
    projectId: "hackx26",
    storageBucket: "hackx26.firebasestorage.app",
    messagingSenderId: "569116765255",
    appId: "1:569116765255:web:d7b86db5f99f01a29bd562"
};

const app = initializeApp(firebaseConfig);
auth = getAuth(app);
db = getFirestore(app);

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

    if (!auth) {
        alert("System initializing... Please wait a moment and try again.");
        return;
    }

    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // Create user deeply in our system database directly via Firestore
        await setDoc(doc(db, "users", user.uid), {
            name: name,
            email: email,
            role: selectedRole,
            isActive: true,
            createdAt: serverTimestamp()
        });

        alert(`Welcome to ReviewIQ! Successfully registered as a ${selectedRole.replace('_', ' ')}.`);
        container.classList.remove("right-panel-active"); // switch to sign in
    } catch (error) {
        alert(`Registration Failed: ${error.message}`);
    }
});

// Login Logic
const signInForm = document.querySelector('.sign-in-container form');
signInForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const inputs = signInForm.querySelectorAll('input');
    const email = inputs[0].value;
    const password = inputs[1].value;

    if (!auth) {
        alert("System initializing... Please wait a moment and try again.");
        return;
    }

    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        // Determine role and Redirect
        if (db) {
            const userDoc = await getDoc(doc(db, "users", user.uid));
            if (userDoc.exists()) {
                const role = userDoc.data().role;
                if (role === 'customer') {
                    alert("Welcome back! Redirecting to Customer Portal.");
                    window.location.href = '../html/customer.html';
                    return;
                } else if (role === 'restaurant_owner' || role === 'branch_manager') {
                    alert("Logged in successfully! Let's get to work.");
                    window.location.href = '../html/select-branch.html';
                    return;
                }
            }
        }

        // Final UI Redirect (Fallback for admin)
        alert("Logged in successfully! Let's get to work.");
        window.location.href = '../html/dashboard.html';
    } catch (error) {
        alert(`Firebase Access Denied: ${error.message}`);
    }
});