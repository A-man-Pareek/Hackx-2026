import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, signInWithPopup, signInWithRedirect, getRedirectResult, GoogleAuthProvider, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, collection, getDoc, getDocs, query, orderBy, addDoc, updateDoc, doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// Tab Navigation Logic
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        // Remove active class from all tabs
        document.querySelectorAll('.tab-btn').forEach(b => {
            b.classList.remove('active', 'bg-gray-50');
            b.classList.add('text-gray-600');
        });
        // Hide all panes
        document.querySelectorAll('.tab-pane').forEach(pane => {
            pane.classList.remove('block');
            pane.classList.add('hidden');
        });

        // Set clicked active
        btn.classList.add('active', 'bg-gray-50');
        btn.classList.remove('text-gray-600');

        // Show target pane
        const targetId = btn.getAttribute('data-target');
        document.getElementById(targetId).classList.remove('hidden');
        document.getElementById(targetId).classList.add('block');
    });
});

// Firebase Config
const firebaseConfig = {
    apiKey: "AIzaSyBthIwz58nk23yTy8ntgN0T0ATqKUSHZbU",
    authDomain: "hackx26.firebaseapp.com",
    projectId: "hackx26",
    storageBucket: "hackx26.firebasestorage.app",
    messagingSenderId: "569116765255",
    appId: "1:569116765255:web:d7b86db5f99f01a29bd562"
};
const GOOGLE_PLACES_API_KEY = "AIzaSyDDHmxiUoDtQoAQAhpcB8Tkzxz1zW-PtX8";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();
const db = getFirestore(app);

// State
let currentUser = null;
let allReviews = [];
let branchMap = {};
let staffMap = {};
let sentimentChart = null;
let trendChart = null;

// AUTHENTICATION
onAuthStateChanged(auth, async (user) => {
    if (user) {
        await handleSuccessfulLogin(user);
    } else {
        showLoginScreen();
    }
});

function showLoginScreen() {
    document.getElementById('loginOverlay').classList.remove('hidden');
    document.getElementById('loginOverlay').classList.remove('opacity-0');
    document.getElementById('appWorkspace').classList.add('hidden');
    document.getElementById('appWorkspace').classList.remove('opacity-100');
}

document.getElementById('googleSignInBtn').addEventListener('click', () => {
    const btn = document.getElementById('googleSignInBtn');
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Redirecting...';
    signInWithRedirect(auth, provider).catch(err => {
        document.getElementById('loginError').textContent = err.message;
        document.getElementById('loginError').classList.remove('hidden');
        btn.innerHTML = '<img src="https://upload.wikimedia.org/wikipedia/commons/c/c1/Google_%22G%22_logo.svg" alt="Google Logo" class="w-5 h-5"> Sign in with Google';
    });
});

// Catch any errors from the redirect flow if it comes back
getRedirectResult(auth).catch((error) => {
    console.error("Redirect sign-in error:", error);
    document.getElementById('loginError').textContent = "Sign-in error: " + error.message;
    document.getElementById('loginError').classList.remove('hidden');
    const btn = document.getElementById('googleSignInBtn');
    if (btn) btn.innerHTML = '<img src="https://upload.wikimedia.org/wikipedia/commons/c/c1/Google_%22G%22_logo.svg" alt="Google Logo" class="w-5 h-5"> Sign in with Google';
});

// We keep this function around in case they log out from the dashboard
document.getElementById('logoutBtn').addEventListener('click', () => signOut(auth));

async function handleSuccessfulLogin(firebaseUser) {
    try {
        console.log("User authenticated, fetching user profile...");
        const userDoc = await getDoc(doc(db, "users", firebaseUser.uid));
        if (userDoc.exists() && userDoc.data().isActive) currentUser = { uid: firebaseUser.uid, ...userDoc.data() };
        else {
            console.log("First time login, creating demo user doc...");
            currentUser = { uid: firebaseUser.uid, name: firebaseUser.displayName || "Demo", email: firebaseUser.email, role: "admin", isActive: true };
            await setDoc(doc(db, "users", firebaseUser.uid), currentUser, { merge: true });
        }

        console.log("Updating UI with user details...");
        document.getElementById('userNameDisplay').textContent = currentUser.name;
        document.getElementById('userRoleDisplay').textContent = currentUser.role.replace('_', ' ') + " • Access granted";
        document.getElementById('userAvatar').src = firebaseUser.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUser.name)}&background=1d4ed8&color=fff`;

        if (currentUser.role === 'admin') document.getElementById('openAddRestaurantBtn').classList.remove('hidden');

        console.log("Hiding login overlay...");
        // Show workspace
        const ws = document.getElementById('appWorkspace');
        ws.classList.remove('hidden');
        document.getElementById('loginOverlay').classList.add('hidden');
        setTimeout(() => ws.classList.add('opacity-100'), 50);

        console.log("Fetching dashboard data...");
        initDataFetch();
    } catch (e) {
        console.error("Critical error in handleSuccessfulLogin: ", e);
        document.getElementById('loginError').textContent = "Initialization error: " + e.message;
        document.getElementById('loginError').classList.remove('hidden');

        const btn = document.getElementById('googleSignInBtn');
        if (btn) {
            btn.innerHTML = '<img src="https://upload.wikimedia.org/wikipedia/commons/c/c1/Google_%22G%22_logo.svg" alt="Google Logo" class="w-5 h-5"> Sign in with Google';
        }

        signOut(auth);
    }
}

// FETCH DATA
async function initDataFetch() {
    await Promise.all([fetchBranches(), fetchStaff()]);
    await fetchReviews();
    setupFilters();
}

async function fetchBranches() {
    const snap = await getDocs(collection(db, "branches"));
    const sel = document.getElementById('branchSelector');
    sel.innerHTML = '<option value="all">🏢 All Branches Overview</option>';
    snap.forEach(doc => {
        branchMap[doc.id] = doc.data().name;
        if (currentUser.role === 'admin' || currentUser.branchId === doc.id) {
            sel.innerHTML += `<option value="${doc.id}">📍 ${doc.data().name}</option>`;
        }
    });
    if (currentUser.role === 'branch_manager' && currentUser.branchId) {
        sel.value = currentUser.branchId;
        sel.querySelector('option[value="all"]').disabled = true;
    }
}

async function fetchStaff() {
    const snap = await getDocs(collection(db, "staff"));
    snap.forEach(doc => staffMap[doc.id] = doc.data().name);
}

async function fetchReviews() {
    const snap = await getDocs(query(collection(db, "reviews"), orderBy("createdAt", "desc")));
    allReviews = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderDashboard();
}

// RENDER LOGIC
function setupFilters() {
    document.getElementById('branchSelector').addEventListener('change', renderDashboard);
    document.getElementById('filterStatus').addEventListener('change', renderDashboard);
    document.getElementById('filterSentiment').addEventListener('change', renderDashboard);
    document.getElementById('globalSearchInput').addEventListener('keyup', renderDashboard);
}

function renderDashboard() {
    const branch = document.getElementById('branchSelector').value;
    const statusFull = document.getElementById('filterStatus').value || "all";
    const status = statusFull.includes(': ') ? statusFull.split(': ').pop().toLowerCase() : "all";

    const sentimentFull = document.getElementById('filterSentiment').value || "all";
    const sentiment = sentimentFull.includes(': ') ? sentimentFull.split(': ').pop().toLowerCase() : "all";

    const queryText = document.getElementById('globalSearchInput').value.toLowerCase().trim();

    let filtered = allReviews.filter(r => {
        if (currentUser.role === 'branch_manager' && r.branchId !== currentUser.branchId) return false;
        if (branch !== 'all' && r.branchId !== branch) return false;
        if (status !== 'all' && status !== r.status) return false;
        if (sentiment !== 'all' && sentiment !== r.sentiment) return false;

        if (queryText) {
            const matchText = (r.reviewText || '').toLowerCase().includes(queryText);
            const matchAuthor = (r.authorName || '').toLowerCase().includes(queryText);
            const matchBranch = (branchMap[r.branchId] || '').toLowerCase().includes(queryText);
            const matchStaff = (r.staffTagged || '').toLowerCase().includes(queryText);
            if (!matchText && !matchAuthor && !matchBranch && !matchStaff) return false;
        }

        return true;
    });

    updateKPIs(filtered);
    renderTable(filtered);
    updatePerformanceTable(filtered);
    updateCharts(filtered, allReviews);
}

function updateKPIs(data) {
    const tot = data.length;
    const crit = data.filter(r => r.status === 'critical').length;
    const avg = tot ? (data.reduce((acc, r) => acc + r.rating, 0) / tot).toFixed(1) : "0.0";
    const sentScore = tot ? Math.round((data.filter(r => r.sentiment === 'positive').length / tot) * 100) : 0;

    document.getElementById('stat-total').textContent = tot.toLocaleString();
    document.getElementById('stat-avg').textContent = avg;
    document.getElementById('stat-critical').textContent = crit;
    document.getElementById('stat-sentiment').textContent = sentScore;

    const bar = document.getElementById('stat-sentiment-bar');
    bar.style.width = sentScore + '%';
    bar.className = `absolute bottom-0 left-0 h-1 rounded-b-xl transition-all duration-1000 ${sentScore >= 70 ? 'bg-emerald-500' : sentScore >= 40 ? 'bg-amber-500' : 'bg-red-500'}`;

    document.getElementById('critical-subtitle').textContent = `${crit} Critical issues pending response`;
    document.getElementById('critical-subtitle-table').textContent = `${crit} Critical issues pending response`;

    // Sidebar unread badge
    const sidebarCount = document.getElementById('sidebar-critical-count');
    sidebarCount.textContent = crit;
    if (crit > 0) {
        sidebarCount.classList.remove('hidden');
    } else {
        sidebarCount.classList.add('hidden');
    }
}

function renderTable(data) {
    const tbody = document.getElementById('reviewsTableBody');
    const template = document.getElementById('reviewRowTemplate');
    const empty = document.getElementById('emptyState');
    tbody.innerHTML = '';

    if (!data.length) { empty.classList.remove('hidden'); return; }
    empty.classList.add('hidden');

    data.forEach(r => {
        const row = template.content.cloneNode(true);
        row.querySelector('.review-author').textContent = r.authorName || 'Google User';
        row.querySelector('.review-text').textContent = `"${r.reviewText}"`;
        row.querySelector('.branch-name').textContent = branchMap[r.branchId] || 'Unknown';
        row.querySelector('.staff-text').textContent = r.staffTagged ? (staffMap[r.staffTagged] || r.staffTagged) : 'Not Tagged';

        // Source Icon
        const icon = row.querySelector('.source-icon');
        if (r.source === 'google') icon.className = 'fa-brands fa-google text-blue-500';
        else icon.className = 'fa-solid fa-utensils text-brand-orange';

        // Stars
        const stars = row.querySelector('.rating-stars');
        for (let i = 1; i <= 5; i++) stars.innerHTML += i <= r.rating ? '<i class="fa-solid fa-star"></i>' : '<i class="fa-regular fa-star text-gray-600"></i>';

        // Status Badge & Action
        const badge = row.querySelector('.status-badge');
        if (r.responseStatus === 'responded') {
            badge.textContent = 'RESPONDED';
            badge.className = 'font-semibold px-2.5 py-1 text-[10px] rounded-lg shadow-sm bg-blue-900 border border-blue-700 text-blue-200';
            row.querySelector('.reply-btn').outerHTML = `<span class="text-xs font-semibold text-[#a8a29e] flex items-center gap-1.5 ml-auto bg-[#1c1917] px-3 py-1.5 rounded-lg border border-[#292524]"><i class="fa-solid fa-check text-emerald-500"></i> Replied</span>`;
        } else if (r.status === 'critical') {
            badge.textContent = 'CRITICAL';
            badge.className = 'font-semibold px-2.5 py-1 text-[10px] rounded-lg shadow-sm bg-red-900 border border-red-700 text-red-200';
            const rpBtn = row.querySelector('.reply-btn');
            rpBtn.className = "reply-btn btn-primary px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 ml-auto cursor-pointer";
            rpBtn.addEventListener('click', () => openReplyModal(r));
        } else {
            badge.textContent = 'PENDING';
            badge.className = 'font-semibold px-2.5 py-1 text-[10px] rounded-lg shadow-sm bg-[#1c1917] border border-[#292524] text-[#a8a29e]';
            const rpBtn = row.querySelector('.reply-btn');
            rpBtn.className = "reply-btn btn-primary px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 ml-auto cursor-pointer";
            rpBtn.addEventListener('click', () => openReplyModal(r));
        }

        // Sentiment & Category Tags
        if (r.category && r.category !== 'pending') {
            const tagClass = r.sentiment === 'positive' ? 'bg-emerald-900 text-emerald-200 border-emerald-700' : r.sentiment === 'negative' ? 'bg-red-900 text-red-200 border-red-700' : 'bg-amber-900 text-amber-200 border-amber-700';
            row.querySelector('.review-tags').innerHTML = `<span class="text-[10px] px-2 py-0.5 rounded border ${tagClass} font-semibold shadow-sm">${r.category}</span>`;
        } else {
            let tClass = 'bg-[#1c1917] text-[#a8a29e] border-[#292524]';
            if (r.sentiment === 'positive') tClass = 'bg-emerald-900 text-emerald-200 border-emerald-700';
            if (r.sentiment === 'negative') tClass = 'bg-red-900 text-red-200 border-red-700';
            row.querySelector('.review-tags').innerHTML = `<span class="text-[10px] px-2 py-0.5 rounded border ${tClass} font-semibold shadow-sm">${r.sentiment.toUpperCase()}</span>`;
        }

        tbody.appendChild(row);
    });
}

function updatePerformanceTable(data) {
    const tbody = document.getElementById('performanceTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const branchStats = {};
    Object.keys(branchMap).forEach(bId => {
        branchStats[bId] = { id: bId, name: branchMap[bId], reviews: 0, ratingSum: 0, positiveCount: 0 };
    });

    data.forEach(r => {
        if (branchStats[r.branchId]) {
            branchStats[r.branchId].reviews++;
            branchStats[r.branchId].ratingSum += r.rating;
            if (r.sentiment === 'positive') branchStats[r.branchId].positiveCount++;
        }
    });

    const ranked = Object.values(branchStats).filter(b => b.reviews > 0).map(b => {
        const avgRating = b.ratingSum / b.reviews;
        const positivePct = Math.round((b.positiveCount / b.reviews) * 100);
        const score = ((avgRating / 5) * 60) + ((positivePct / 100) * 40);
        return { ...b, avgRating: avgRating.toFixed(1), positivePct, score: score.toFixed(1) };
    });

    ranked.sort((a, b) => b.score - a.score);

    if (ranked.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="py-4 text-center text-[#a8a29e]">No data available for selected filters.</td></tr>';
        return;
    }

    ranked.forEach((b, index) => {
        const rankColors = index === 0 ? 'bg-yellow-900 text-yellow-200' : index === 1 ? 'bg-gray-700 text-gray-200' : index === 2 ? 'bg-orange-900 text-orange-200' : 'bg-[#1c1917] text-[#a8a29e]';

        tbody.innerHTML += `
            <tr class="border-b border-[#292524] hover:bg-[#1c1917] transition">
                <td class="py-4 flex items-center gap-3">
                    <div class="w-6 h-6 rounded-full ${rankColors} flex items-center justify-center font-bold text-xs">${index + 1}</div>
                    <div class="font-semibold text-white">${b.name}</div>
                </td>
                <td class="py-4 text-center font-medium">${b.avgRating} <i class="fa-solid fa-star text-yellow-400 text-xs text-center"></i></td>
                <td class="py-4 text-center">
                    <div class="flex items-center gap-2 justify-center">
                        <span class="text-emerald-500 font-medium">${b.positivePct}%</span>
                        <div class="w-16 h-1.5 bg-[#292524] rounded-full overflow-hidden">
                            <div class="bg-emerald-500 h-full" style="width: ${b.positivePct}%"></div>
                        </div>
                    </div>
                </td>
                <td class="py-4 text-right">
                    <span class="bg-emerald-900 text-emerald-200 font-bold px-2.5 py-1 rounded-lg border border-emerald-700">${b.score}</span>
                </td>
            </tr>
        `;
    });
}

function updateCharts(data, all) {
    const p = data.filter(r => r.sentiment === 'positive').length;
    const u = data.filter(r => r.sentiment === 'neutral' || r.sentiment === 'pending').length;
    const n = data.filter(r => r.sentiment === 'negative').length;
    const t = p + u + n;

    document.getElementById('doughnut-pos').textContent = p;
    document.getElementById('doughnut-neu').textContent = u;
    document.getElementById('doughnut-neg').textContent = n;
    document.getElementById('doughnut-center').textContent = t ? Math.round((p / t) * 100) + '%' : '0%';

    if (!sentimentChart) {
        sentimentChart = new Chart(document.getElementById('sentimentDoughnut').getContext('2d'), {
            type: 'doughnut',
            data: { labels: ['Pos', 'Neu', 'Neg'], datasets: [{ data: [p, u, n], backgroundColor: ['#10B981', '#FBBF24', '#EF4444'], borderWidth: 0, hoverOffset: 4 }] },
            options: { responsive: true, maintainAspectRatio: false, cutout: '75%', plugins: { legend: { display: false } } }
        });
    } else {
        sentimentChart.data.datasets[0].data = [p, u, n];
        sentimentChart.update();
    }

    if (!trendChart) {
        trendChart = new Chart(document.getElementById('sentimentTrendChart').getContext('2d'), {
            type: 'line',
            data: {
                labels: ['7d', '6d', '5d', '4d', '3d', '2d', 'Today'],
                datasets: [{ label: 'Incoming volume', data: [15, 29, 30, 21, 16, 25, 40], borderColor: '#f59e0b', backgroundColor: 'rgba(245, 158, 11, 0.2)', fill: true, tension: 0.4, borderWidth: 2 }]
            },
            options: {
                responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, grid: { color: '#292524' }, border: { display: false }, ticks: { color: '#a8a29e' } },
                    x: { grid: { display: false }, border: { display: false }, ticks: { color: '#a8a29e' } }
                }
            }
        });
    }
}

// REPLY MODAL LOGIC
function openReplyModal(r) {
    document.getElementById('modalReviewId').value = r.id;
    document.getElementById('modalReviewText').textContent = `"${r.reviewText}"`;
    document.getElementById('replyMessage').value = '';
    document.getElementById('replyModal').classList.remove('hidden');
}
function closeReplyModal() { document.getElementById('replyModal').classList.add('hidden'); }
document.getElementById('closeModalBtn').onclick = closeReplyModal;
document.getElementById('cancelModalBtn').onclick = closeReplyModal;

document.getElementById('replyForm').onsubmit = async (e) => {
    e.preventDefault();
    const btn = document.getElementById('submitReplyBtn');
    const og = btn.innerHTML;
    btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';

    try {
        const id = document.getElementById('modalReviewId').value;
        await setDoc(doc(collection(db, "responses")), {
            reviewId: id, responseText: document.getElementById('replyMessage').value, respondedBy: currentUser.uid, respondedAt: serverTimestamp()
        });
        await updateDoc(doc(db, "reviews", id), { responseStatus: "responded" });
        allReviews.find(r => r.id === id).responseStatus = 'responded';
        renderDashboard();
        closeReplyModal();
    } catch (e) { alert("Error saving response: " + e.message); }
    btn.disabled = false; btn.innerHTML = og;
};

// ADD RESTAURANT MODAL (GOOGLE PROXY FETCH)
const addMod = document.getElementById('addRestaurantModal');
document.getElementById('openAddRestaurantBtn').onclick = () => { addMod.classList.remove('hidden'); document.getElementById('addRestaurantError').classList.add('hidden'); };
document.getElementById('closeAddModalBtn').onclick = () => addMod.classList.add('hidden');

document.getElementById('addRestaurantForm').onsubmit = async (e) => {
    e.preventDefault();
    const btn = document.getElementById('submitAddBtn');
    const err = document.getElementById('addRestaurantError');
    const og = btn.innerHTML;

    btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Proxying Google API...';
    err.classList.add('hidden');

    try {
        const bName = document.getElementById('searchName').value.trim();
        const bLoc = document.getElementById('searchLocation').value.trim();
        const query = encodeURIComponent(`${bName} ${bLoc}`);

        const searchRes = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(`https://maps.googleapis.com/maps/api/place/textsearch/json?query=${query}&key=${GOOGLE_PLACES_API_KEY}`)}`);
        const searchData = await searchRes.json();
        if (!searchData.results?.length) throw new Error("No business found matching this criteria on Google.");
        const placeId = searchData.results[0].place_id;

        const detRes = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(`https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=name,formatted_address,rating,user_ratings_total,reviews&reviews_sort=newest&key=${GOOGLE_PLACES_API_KEY}`)}`);
        const detData = await detRes.json();
        const details = detData.result;

        const branchRef = await addDoc(collection(db, "branches"), {
            name: details.name, location: bLoc, managerId: currentUser.uid, placeId: placeId, status: "active",
            totalReviews: details.user_ratings_total || 0, averageRating: details.rating || 0, createdAt: serverTimestamp()
        });

        if (details.reviews && details.reviews.length > 0) {
            for (const r of details.reviews) {
                await addDoc(collection(db, "reviews"), {
                    branchId: branchRef.id, source: "google", externalReviewId: `${r.author_name}_${r.time * 1000}`,
                    authorName: r.author_name, rating: r.rating, reviewText: r.text || "No text provided.",
                    sentiment: r.rating > 3 ? 'positive' : r.rating === 3 ? 'neutral' : 'negative',
                    status: r.rating <= 2 ? "critical" : "normal", responseStatus: "pending",
                    externalTimestamp: r.time * 1000, syncedAt: serverTimestamp(), createdAt: serverTimestamp()
                });
            }
        }

        await initDataFetch();
        document.getElementById('branchSelector').value = branchRef.id;
        renderDashboard();
        addMod.classList.add('hidden');
    } catch (e) { err.textContent = e.message; err.classList.remove('hidden'); }

    btn.disabled = false; btn.innerHTML = og;
};
