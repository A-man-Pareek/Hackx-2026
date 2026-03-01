import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, setDoc, query, where, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// Initialize Firebase
const firebaseConfig = {
    apiKey: "AIzaSyBthIwz58nk23yTy8ntgN0T0ATqKUSHZbU",
    authDomain: "hackx26.firebaseapp.com",
    projectId: "hackx26",
    storageBucket: "hackx26.firebasestorage.app",
    messagingSenderId: "569116765255",
    appId: "1:569116765255:web:d7b86db5f99f01a29bd562"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentUserAuth = null;

// Auth Observer
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUserAuth = user;
        loadBranches();
    } else {
        window.location.href = 'login.html';
    }
});

// Load Branches from Backend API
async function loadBranches() {
    try {
        const token = await currentUserAuth.getIdToken();
        const res = await fetch("http://127.0.0.1:8000/branches", { headers: { Authorization: `Bearer ${token}` } });

        document.getElementById('loadingBranches').classList.add('hidden');

        if (res.ok) {
            const json = await res.json();
            const branches = json.data || [];

            if (branches.length > 0) {
                document.getElementById('existingBranchesList').classList.remove('hidden');
                document.getElementById('existingBranchesList').innerHTML = branches.map(b => `
                    <div class="bg-black/40 border border-[#44403c] p-4 rounded-xl hover:bg-[#292524] cursor-pointer transition flex justify-between items-center group" onclick="selectBranch('${b.id}')">
                        <div>
                            <h4 class="font-bold text-white text-lg group-hover:text-brand-500 transition">${b.name} (${b.location || 'Location missing'})</h4>
                            <p class="text-xs text-gray-400 mt-1"><i class="fa-solid fa-location-dot"></i> ${b.location || 'Location missing'}</p>
                        </div>
                        <i class="fa-solid fa-chevron-right text-brand-500 opacity-0 group-hover:opacity-100 transition transform group-hover:translate-x-1"></i>
                    </div>
                `).join('');
            } else {
                document.getElementById('noBranchesState').classList.remove('hidden');
            }
        }
    } catch (e) {
        console.error(e);
        document.getElementById('loadingBranches').innerHTML = '<i class="fa-solid fa-triangle-exclamation text-red-500"></i> Failed to connect to server.';
    }
}

// Global scope for onclick
window.selectBranch = function (branchId) {
    localStorage.setItem('activeBranchId', branchId);
    window.location.href = 'dashboard.html';
};

// Logout
document.getElementById('logoutBtn').addEventListener('click', () => {
    signOut(auth);
});

// Add Restaurant Logic (Mirroring dashboard.js logic)
document.getElementById('addRestaurantForm').onsubmit = async (e) => {
    e.preventDefault();
    const name = document.getElementById('searchName').value;
    const location = document.getElementById('searchLocation').value;
    const errBox = document.getElementById('addRestaurantError');
    const successBox = document.getElementById('addRestaurantSuccess');
    const btn = document.getElementById('submitAddBtn');
    const progressContainer = document.getElementById('addRestaurantProgress');
    const progressText = document.getElementById('progressText');
    const progressBar = document.getElementById('progressBar');
    const progressPercent = document.getElementById('progressPercent');

    const updateProgress = (text, percent) => {
        progressText.innerText = text;
        progressBar.style.width = percent + '%';
        progressPercent.innerText = percent + '%';
    };

    errBox.classList.add('hidden');
    successBox.classList.add('hidden');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processing...';
    progressContainer.classList.remove('hidden');

    updateProgress('Searching Google Places...', 20);

    try {
        const token = await currentUserAuth.getIdToken();
        const payload = {
            name: name,
            location: location,
            managerId: currentUserAuth.uid
        };

        const res = await fetch("http://127.0.0.1:8000/api/search-and-add", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
            throw new Error(data.error || "Failed to add restaurant. Please check network.");
        }

        updateProgress('Complete!', 100);

        successBox.innerText = data.message || `Successfully integrated! Taking you to the dashboard...`;
        successBox.classList.remove('hidden');

        // Auto-select and jump to dashboard
        setTimeout(() => {
            selectBranch(data.branchId);
        }, 1500);

    } catch (err) {
        console.error(err);
        errBox.innerText = err.message || "Failed to add restaurant. Please check network.";
        errBox.classList.remove('hidden');
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-magnifying-glass"></i> Try Again';
        progressContainer.classList.add('hidden');
    }
};
