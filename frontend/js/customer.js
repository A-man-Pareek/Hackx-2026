import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, collection, getDoc, getDocs, query, orderBy, doc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

let auth;
let db;
let currentUser = null;

let allBranches = [];
let allReviews = [];
let filteredReviews = [];
let selectedBranchId = null;

// DOM Elements
const userAvatar = document.getElementById('userAvatar');
const userNameDisplay = document.getElementById('userNameDisplay');
const logoutBtn = document.getElementById('logoutBtn');
const restaurantSearch = document.getElementById('restaurantSearch');
const restaurantList = document.getElementById('restaurantList');
const reviewsFeed = document.getElementById('reviewsFeed');
const feedTitle = document.getElementById('feedTitle');
const feedSubtitle = document.getElementById('feedSubtitle');
const resetFeedBtn = document.getElementById('resetFeedBtn');
const sortReviews = document.getElementById('sortReviews');
const reviewCardTemplate = document.getElementById('reviewCardTemplate');

// 1. Fetch config and Init
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
setupAuth();

// 2. Auth State
function setupAuth() {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            const userDoc = await getDoc(doc(db, "users", user.uid));
            if (userDoc.exists()) {
                const userData = userDoc.data();
                if (userData.role !== 'customer') {
                    // Kick non-customers back to dashboard
                    window.location.href = '../html/dashboard.html';
                    return;
                }
                currentUser = { uid: user.uid, ...userData };
                userNameDisplay.textContent = currentUser.name;
                userAvatar.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUser.name)}&background=1d4ed8&color=fff`;
                initDataFetch();
            } else {
                handleLogout();
            }
        } else {
            handleLogout();
        }
    });

    logoutBtn.addEventListener('click', handleLogout);
}

function handleLogout() {
    if (auth) signOut(auth);
    window.location.href = '../html/login.html';
}

// 3. Fetch Data
async function initDataFetch() {
    try {
        reviewsFeed.innerHTML = `
            <div class="text-center py-20">
                <i class="fa-solid fa-spinner fa-spin text-4xl text-brand-500 mb-4"></i>
                <p class="text-gray-500 font-medium">Loading network data...</p>
            </div>
        `;

        const [branchesSnap, reviewsSnap] = await Promise.all([
            getDocs(collection(db, "branches")),
            getDocs(query(collection(db, "reviews"), orderBy("createdAt", "desc")))
        ]);

        allBranches = branchesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        allReviews = reviewsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        filteredReviews = [...allReviews];

        renderBranches();
        renderReviews();
        setupListeners();
    } catch (e) {
        console.error("Data fetch failed:", e);
        reviewsFeed.innerHTML = `<div class="p-4 bg-red-50 text-red-600 rounded-lg text-sm font-semibold">Failed to load data. Please refresh.</div>`;
    }
}

// 4. Render Branches Sidebar
function renderBranches(filterText = "") {
    restaurantList.innerHTML = "";

    let branchesToRender = allBranches;
    if (filterText) {
        const lowerFilter = filterText.toLowerCase();
        branchesToRender = allBranches.filter(b =>
            (b.name && b.name.toLowerCase().includes(lowerFilter)) ||
            (b.location && b.location.toLowerCase().includes(lowerFilter))
        );
    }

    if (branchesToRender.length === 0) {
        restaurantList.innerHTML = `<p class="text-center text-sm text-gray-500 mt-6">No places found.</p>`;
        return;
    }

    branchesToRender.forEach(branch => {
        const div = document.createElement('div');
        const isActive = branch.id === selectedBranchId;

        // Match glass-card styling and active states securely
        if (isActive) {
            div.className = `p-4 rounded-xl border transition cursor-pointer flex flex-col gap-2 shadow-sm border-[var(--brand-orange)] bg-[rgba(245,158,11,0.05)]`;
        } else {
            div.className = `p-4 rounded-xl border transition cursor-pointer flex flex-col gap-2 border-[var(--surface-border)] hover:border-[var(--brand-orange)] hover:bg-[rgba(255,255,255,0.02)]`;
            div.style.background = 'var(--surface-light)';
        }

        // Stars HTML
        const rating = branch.averageRating || 0;
        let starsHtml = '';
        for (let i = 1; i <= 5; i++) {
            starsHtml += `<i class="fa-solid fa-star ${i <= Math.round(rating) ? 'text-yellow-500' : 'text-gray-600'}"></i>`;
        }

        const fallbackImg = 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&q=80&w=100&h=100';

        div.innerHTML = `
            <div class="flex items-start gap-3">
                <div class="w-12 h-12 rounded-lg bg-gray-800 overflow-hidden shrink-0 shadow-inner border border-[var(--surface-border)]">
                    <img src="${fallbackImg}" class="w-full h-full object-cover opacity-90">
                </div>
                <div>
                    <h3 class="font-bold text-white text-sm leading-tight line-clamp-2">${branch.name}</h3>
                    <p class="text-xs mt-1 truncate" style="color: var(--text-muted);"><i class="fa-solid fa-location-dot" style="color: var(--text-muted); opacity: 0.7;"></i> ${branch.location || 'Unknown'}</p>
                </div>
            </div>
            <div class="flex items-center justify-between mt-1 pt-2" style="border-top: 1px solid var(--surface-border);">
                <div class="flex items-center gap-1 text-[10px]">
                    ${starsHtml}
                    <span class="font-medium ml-1" style="color: var(--text-muted);">(${branch.totalReviews || 0})</span>
                </div>
                <div class="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full shadow-sm transition" style="color: var(--brand-orange-light); border: 1px solid rgba(245,158,11,0.3); background: rgba(0,0,0,0.3);">
                    View
                </div>
            </div>
        `;

        div.addEventListener('click', () => selectBranch(branch));
        restaurantList.appendChild(div);
    });
}

// 5. Select a Branch
function selectBranch(branch) {
    selectedBranchId = branch.id;
    feedTitle.textContent = branch.name;
    feedSubtitle.textContent = branch.location;
    resetFeedBtn.classList.remove('hidden');

    // Filter reviews
    filteredReviews = allReviews.filter(r => r.branchId === branch.id);
    renderBranches(restaurantSearch.value); // Re-render to show active state
    renderReviews();
}

// 6. Reset Feed
function resetFeed() {
    selectedBranchId = null;
    feedTitle.textContent = "Global Review Feed";
    feedSubtitle.textContent = "See what people are saying everywhere.";
    resetFeedBtn.classList.add('hidden');

    filteredReviews = [...allReviews];
    renderBranches(restaurantSearch.value);
    renderReviews();
}

// 7. Render Reviews Feed
function renderReviews() {
    reviewsFeed.innerHTML = "";

    // Apply Sort
    const sortVal = sortReviews.value;
    let sortedParams = [...filteredReviews];
    if (sortVal === 'highest') {
        sortedParams.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    } else if (sortVal === 'lowest') {
        sortedParams.sort((a, b) => (a.rating || 0) - (b.rating || 0));
    } else {
        // default newest
        sortedParams.sort((a, b) => (b.externalTimestamp || 0) - (a.externalTimestamp || 0));
    }

    if (sortedParams.length === 0) {
        reviewsFeed.innerHTML = `
            <div class="text-center py-24 rounded-2xl shadow-sm mx-4" style="background: var(--surface-light); border: 1px solid var(--surface-border); backdrop-filter: blur(12px);">
                <div class="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style="background: rgba(0,0,0,0.3); border: 1px solid var(--surface-border);">
                    <i class="fa-regular fa-folder-open text-2xl" style="color: var(--text-muted);"></i>
                </div>
                <h3 class="text-lg font-bold text-white tracking-tight">No reviews found</h3>
                <p class="text-sm mt-1 max-w-sm mx-auto" style="color: var(--text-muted);">It looks like there's no feedback available for this selection right now.</p>
            </div>
        `;
        return;
    }

    sortedParams.forEach(review => {
        const clone = reviewCardTemplate.content.cloneNode(true);
        const card = clone.querySelector('.glass-card');

        // Sentiment Bar
        const sBar = clone.querySelector('.sentiment-indicator');
        const sChip = clone.querySelector('.ai-sentiment-chip');
        if (review.sentiment === 'positive') {
            sBar.classList.add('bg-emerald-500');
            sChip.classList.remove('hidden');
            sChip.innerHTML = `<i class="fa-solid fa-wand-magic-sparkles"></i> Positive`;
        } else if (review.sentiment === 'negative') {
            sBar.classList.add('bg-red-500');
            sChip.classList.remove('hidden');
            sChip.classList.replace('bg-emerald-900/40', 'bg-red-900/40');
            sChip.classList.replace('text-emerald-400', 'text-red-400');
            sChip.classList.replace('border-emerald-800', 'border-red-800');
            sChip.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> Critical`;
        } else {
            sBar.classList.replace('bg-emerald-500', 'bg-amber-500');
        }

        // Author
        const authorName = review.authorName || "Anonymous User";
        clone.querySelector('.author-name').textContent = authorName;
        clone.querySelector('.author-initial').textContent = authorName.charAt(0).toUpperCase();

        // Stars
        let starsHtml = '';
        const rating = review.rating || 0;
        for (let i = 1; i <= 5; i++) {
            starsHtml += `<i class="fa-solid fa-star ${i <= rating ? 'text-yellow-400 shadow-sm drop-shadow-sm' : 'text-gray-200'}"></i>`;
        }
        clone.querySelector('.rating-stars').innerHTML = starsHtml;

        // Time
        const reviewDate = review.externalTimestamp ? new Date(review.externalTimestamp) : new Date();
        const daysAgo = Math.floor((Date.now() - reviewDate.getTime()) / (1000 * 3600 * 24));
        clone.querySelector('.review-time').textContent = `• ${daysAgo === 0 ? 'Today' : (daysAgo === 1 ? '1 day ago' : daysAgo + ' days ago')}`;

        // Text
        clone.querySelector('.review-text').textContent = review.reviewText || "No text provided.";

        // Branch Name Lookup
        const branchObj = allBranches.find(b => b.id === review.branchId);
        const bNameNode = clone.querySelector('.branch-name');
        if (branchObj) {
            bNameNode.textContent = branchObj.name;
            bNameNode.addEventListener('click', () => selectBranch(branchObj));
        } else {
            bNameNode.textContent = "Unknown Branch";
        }

        reviewsFeed.appendChild(clone);
    });
}

// 8. Event Listeners
function setupListeners() {
    restaurantSearch.addEventListener('input', (e) => {
        renderBranches(e.target.value);
    });

    resetFeedBtn.addEventListener('click', resetFeed);
    sortReviews.addEventListener('change', renderReviews);
}
