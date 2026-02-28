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
let currentRestaurantId = null;
let allReviews = [];
let branchMap = {};
let branchDetailsMap = {};
let placeIdMap = {};
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

if (document.getElementById('googleSignInBtn')) {
    document.getElementById('googleSignInBtn').addEventListener('click', async () => {
        const btn = document.getElementById('googleSignInBtn');
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Authenticating...';
        try {
            const result = await signInWithPopup(auth, provider);
            console.log("Popup sign in successful");
        } catch (err) {
            if (document.getElementById('loginError')) {
                document.getElementById('loginError').textContent = err.message;
                document.getElementById('loginError').classList.remove('hidden');
            }
            btn.innerHTML = '<img src="https://upload.wikimedia.org/wikipedia/commons/c/c1/Google_%22G%22_logo.svg" alt="Google Logo" class="w-5 h-5"> Sign in with Google';
        }
    });
}

// Catch any errors from the redirect flow if it comes back
getRedirectResult(auth).catch((error) => {
    console.error("Redirect sign-in error:", error);
    if (document.getElementById('loginError')) {
        document.getElementById('loginError').textContent = "Sign-in error: " + error.message;
        document.getElementById('loginError').classList.remove('hidden');
    }
    const btn = document.getElementById('googleSignInBtn');
    if (btn) btn.innerHTML = '<img src="https://upload.wikimedia.org/wikipedia/commons/c/c1/Google_%22G%22_logo.svg" alt="Google Logo" class="w-5 h-5"> Sign in with Google';
});

// We keep this function around in case they log out from the dashboard
if (document.getElementById('logoutBtn')) {
    document.getElementById('logoutBtn').addEventListener('click', () => signOut(auth));
}

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

// FETCH DATA & INITIALIZATION
async function initDataFetch() {
    await fetchBranches();
    document.getElementById('restaurantSelectionOverlay').classList.remove('hidden');
    await fetchStaff();
    await fetchReviews();
    setupFilters();
}

function selectRestaurant(id, name) {
    currentRestaurantId = id;
    document.getElementById('restaurantSelectionOverlay').classList.add('hidden');

    // Update top nav
    document.getElementById('topNavRestaurantName').textContent = name;
    document.getElementById('topNavRestaurantLoc').textContent = "Active Location";

    renderDashboard();
}

// Overlay button listeners
if (document.getElementById('logoutFromOverlayBtn')) {
    document.getElementById('logoutFromOverlayBtn').addEventListener('click', () => signOut(auth));
}

// Top nav bar click to return to selection
if (document.getElementById('activeRestaurantDisplay')) {
    document.getElementById('activeRestaurantDisplay').addEventListener('click', () => {
        document.getElementById('restaurantSelectionOverlay').classList.remove('hidden');
    });
}

// SEARCH RESTAURANT LOGIC
const searchForm = document.getElementById('overlaySearchForm');
if (searchForm) {
    searchForm.onsubmit = async (e) => {
        e.preventDefault();
        const btn = document.getElementById('overlaySearchBtn');
        const err = document.getElementById('overlaySearchError');
        const og = btn.innerHTML;

        btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Searching...';
        err.classList.add('hidden');

        try {
            let query = document.getElementById('overlaySearchInput').value.trim();
            if (!query.toLowerCase().includes('restaurant') && !query.toLowerCase().includes('cafe') && !query.toLowerCase().includes('food')) {
                query += " restaurant"; // Force it to search for dining establishments to prevent names/cities being accepted
            }

            const searchRes = await fetch("https://places.googleapis.com/v1/places:searchText", {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-Goog-Api-Key": GOOGLE_PLACES_API_KEY, "X-Goog-FieldMask": "places.id" },
                body: JSON.stringify({ textQuery: query })
            });

            if (!searchRes.ok) throw new Error("Google Places API failed");
            const searchData = await searchRes.json();

            if (!searchData.places || !searchData.places.length) throw new Error("No restaurant or cafe found matching this name worldwide.");

            const placeId = searchData.places[0].id;

            // Check if we already have this restaurant in DB
            if (placeIdMap[placeId]) {
                const bId = placeIdMap[placeId];
                selectRestaurant(bId, branchMap[bId]);
            } else {
                // Fetch finer details using the New API
                const detRes = await fetch(`https://places.googleapis.com/v1/places/${placeId}?fields=id,displayName,formattedAddress,rating,userRatingCount,reviews,photos,regularOpeningHours,internationalPhoneNumber,websiteUri,businessStatus&key=${GOOGLE_PLACES_API_KEY}`);
                if (!detRes.ok) throw new Error("Failed to fetch detailed data for the restaurant");

                const detData = await detRes.json();
                const branchName = detData.displayName?.text || decodeURIComponent(query);
                const phone = detData.internationalPhoneNumber || "";
                const website = detData.websiteUri || "";
                const bStatus = detData.businessStatus || "OPERATIONAL";
                const photoRef = detData.photos && detData.photos.length > 0 ? detData.photos[0].name : null;
                const hours = detData.regularOpeningHours?.weekdayDescriptions ? detData.regularOpeningHours.weekdayDescriptions : null;

                const branchRef = await addDoc(collection(db, "branches"), {
                    name: branchName,
                    location: detData.formattedAddress || "",
                    managerId: currentUser.uid,
                    placeId: placeId,
                    status: "active",
                    totalReviews: detData.userRatingCount || 0,
                    averageRating: detData.rating || 0,
                    createdAt: serverTimestamp(),
                    phone: phone,
                    website: website,
                    businessStatus: bStatus,
                    photoRef: photoRef,
                    openingHours: hours
                });

                if (detData.reviews && detData.reviews.length > 0) {
                    for (const r of detData.reviews) {
                        const rName = r.authorAttribution?.displayName || "Google User";
                        const rRating = r.rating || 0;
                        const rText = r.text?.text || "No review text provided.";
                        // Convert ISO string to unix timestamp equivalent ms
                        const rTime = r.publishTime ? new Date(r.publishTime).getTime() : Date.now();

                        await addDoc(collection(db, "reviews"), {
                            branchId: branchRef.id,
                            source: "google",
                            externalReviewId: `${rName}_${rTime}`,
                            authorName: rName,
                            rating: rRating,
                            reviewText: rText,
                            sentiment: rRating > 3 ? 'positive' : rRating === 3 ? 'neutral' : 'negative',
                            status: rRating <= 2 ? "critical" : "normal",
                            responseStatus: "pending",
                            externalTimestamp: rTime,
                            syncedAt: serverTimestamp(),
                            createdAt: serverTimestamp()
                        });
                    }
                }

                // Refresh data arrays
                await fetchBranches();
                await fetchReviews();
                selectRestaurant(branchRef.id, branchName);
            }
        } catch (e) { err.textContent = e.message; err.classList.remove('hidden'); }

        btn.disabled = false; btn.innerHTML = og;
    };
}

async function fetchBranches() {
    branchMap = {};
    branchDetailsMap = {};
    placeIdMap = {};
    const snap = await getDocs(collection(db, "branches"));
    snap.forEach(doc => {
        branchMap[doc.id] = doc.data().name;
        branchDetailsMap[doc.id] = doc.data();
        if (doc.data().placeId) placeIdMap[doc.data().placeId] = doc.id;
    });
}

async function fetchStaff() {
    const snap = await getDocs(collection(db, "staff"));
    snap.forEach(doc => staffMap[doc.id] = doc.data().name);
}

async function fetchReviews() {
    const snap = await getDocs(query(collection(db, "reviews"), orderBy("createdAt", "desc")));
    allReviews = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

// RENDER LOGIC
function setupFilters() {
    document.getElementById('filterStatus').addEventListener('change', renderDashboard);
    document.getElementById('filterSentiment').addEventListener('change', renderDashboard);
    document.getElementById('globalSearchInput').addEventListener('keyup', renderDashboard);
}

function renderDashboard() {
    if (!currentRestaurantId) return;

    const statusFull = document.getElementById('filterStatus').value || "all";
    const status = statusFull.includes(': ') ? statusFull.split(': ').pop().toLowerCase() : "all";

    const sentimentFull = document.getElementById('filterSentiment').value || "all";
    const sentiment = sentimentFull.includes(': ') ? sentimentFull.split(': ').pop().toLowerCase() : "all";

    const queryText = document.getElementById('globalSearchInput').value.toLowerCase().trim();

    let filtered = allReviews.filter(r => {
        if (r.branchId !== currentRestaurantId) return false;

        if (status === 'pending' || status === 'responded') {
            if (r.responseStatus !== status) return false;
        } else if (status !== 'all' && status !== r.status) {
            return false;
        }

        if (sentiment !== 'all' && sentiment !== r.sentiment) return false;

        if (queryText) {
            const matchText = (r.reviewText || '').toLowerCase().includes(queryText);
            const matchAuthor = (r.authorName || '').toLowerCase().includes(queryText);
            const matchStaff = (r.staffTagged || '').toLowerCase().includes(queryText);
            if (!matchText && !matchAuthor && !matchStaff) return false;
        }

        return true;
    });

    updateKPIs(filtered);
    renderTable(filtered);
    updateLocationCard();
    updateCharts(filtered, allReviews);
    updateAnalyticsTab(filtered);
    updateStaffTable(filtered);
    updatePerformanceTable(filtered);
    generateMonthlyAIOverview(filtered);
}

function updateLocationCard() {
    const branchInfo = branchDetailsMap[currentRestaurantId];
    if (!branchInfo) return;

    const brandName = document.getElementById('locationBrandName');
    const addressFull = document.getElementById('locationAddressFull');
    const phone = document.getElementById('locationPhone');
    const website = document.getElementById('locationWebsite');
    const hours = document.getElementById('locationHours');
    const statusBadge = document.getElementById('locationStatusBadge');
    const headerImg = document.getElementById('locationHeaderImg');

    if (brandName) brandName.textContent = branchInfo.name || "Unknown Location";
    if (addressFull) addressFull.textContent = branchInfo.location || "Location not provided";

    if (phone) phone.textContent = branchInfo.phone || "No phone provided";

    if (website) {
        if (branchInfo.website) {
            website.href = branchInfo.website;
            website.textContent = branchInfo.website.replace(/^https?:\/\//, '').split('/')[0];
        } else {
            website.href = "#";
            website.textContent = "Not available";
        }
    }

    if (hours) {
        if (branchInfo.openingHours && Array.isArray(branchInfo.openingHours)) {
            hours.innerHTML = branchInfo.openingHours.join('<br>');
        } else if (branchInfo.openingHours) {
            hours.textContent = branchInfo.openingHours;
        } else {
            hours.textContent = "Hours unknown";
        }
    }

    if (statusBadge) {
        statusBadge.textContent = branchInfo.businessStatus ? branchInfo.businessStatus.toLowerCase().replace('_', ' ') : "operational";
        if (statusBadge.textContent.includes('closed')) {
            statusBadge.classList.replace('bg-emerald-500/90', 'bg-red-500/90');
            statusBadge.classList.replace('border-emerald-400', 'border-red-400');
        } else {
            statusBadge.classList.replace('bg-red-500/90', 'bg-emerald-500/90');
            statusBadge.classList.replace('border-red-400', 'border-emerald-400');
        }
    }

    if (headerImg) {
        let photoUrl = 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&q=80';
        if (branchInfo.photoRef) {
            if (branchInfo.photoRef.startsWith('places/')) {
                // New API format
                photoUrl = `https://places.googleapis.com/v1/${branchInfo.photoRef}/media?maxHeightPx=800&maxWidthPx=800&key=${GOOGLE_PLACES_API_KEY}`;
            } else {
                // Legacy API format
                photoUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=${branchInfo.photoRef}&key=${GOOGLE_PLACES_API_KEY}`;
            }
        }
        headerImg.style.backgroundImage = `url('${photoUrl}')`;
    }
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

        // Append AI Reply if it is responded
        if (r.responseStatus === 'responded') {
            const replyText = r.aiReply || "Hello! Thank you for your review. We are thrilled to hear you had a great experience and we hope to see you again soon!";
            const aiReplyDiv = document.createElement('div');
            aiReplyDiv.className = 'ai-reply-container hidden mt-3 pl-4 border-l-2 border-brand-500 bg-[#292524]/50 p-2 rounded-r pr-2';
            aiReplyDiv.innerHTML = `
                <div class="text-[10px] font-bold text-brand-500 uppercase flex items-center gap-1 mb-1">
                    <i class="fa-solid fa-robot"></i> AI Response
                </div>
                <div class="text-xs text-gray-300 italic">"${replyText}"</div>
            `;
            // Insert it right after the review text
            const reviewTextEl = row.querySelector('.review-text');
            reviewTextEl.parentNode.insertBefore(aiReplyDiv, reviewTextEl.nextSibling);
        }

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

            const rpBtn = row.querySelector('.reply-btn');
            rpBtn.className = "reply-btn flex items-center gap-2.5 bg-[#292524] hover:bg-[#44403c] transition text-emerald-300 px-3 py-1.5 rounded-xl text-xs font-bold shadow-sm ml-auto cursor-pointer";
            rpBtn.innerHTML = '<i class="fa-solid fa-eye text-lg"></i><div class="text-left leading-tight tracking-wide">View<br>Reply</div>';
            rpBtn.addEventListener('click', (e) => {
                const tr = e.currentTarget.closest('tr');
                const aiContainer = tr ? tr.querySelector('.ai-reply-container') : null;
                if (aiContainer) aiContainer.classList.toggle('hidden');
            });
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

function updateStaffTable(data) {
    const tbody = document.getElementById('staffTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const stats = {};
    Object.keys(staffMap).forEach(sId => {
        stats[sId] = { id: sId, name: staffMap[sId], mentions: 0, ratingSum: 0, positiveCount: 0 };
    });

    data.forEach(r => {
        if (stats[r.staffTagged]) {
            stats[r.staffTagged].mentions++;
            stats[r.staffTagged].ratingSum += r.rating;
            if (r.sentiment === 'positive') stats[r.staffTagged].positiveCount++;
        }
    });

    const ranked = Object.values(stats).filter(s => s.mentions > 0).map(s => {
        const avg = s.ratingSum / s.mentions;
        const sentScore = Math.round((s.positiveCount / s.mentions) * 100);
        return { ...s, avg: avg.toFixed(1), sentScore };
    });

    ranked.sort((a, b) => b.sentScore - a.sentScore);

    if (ranked.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="py-4 text-center text-[#a8a29e]">No staff data available.</td></tr>';
        return;
    }

    ranked.forEach(s => {
        const scoreClass = s.sentScore >= 70 ? 'bg-emerald-900 text-emerald-200 border-emerald-700' : s.sentScore >= 40 ? 'bg-amber-900 text-amber-200 border-amber-700' : 'bg-red-900 text-red-200 border-red-700';

        tbody.innerHTML += `
            <tr class="border-b border-[#292524] hover:bg-[#1c1917] transition">
                <td class="py-4 font-semibold text-white flex items-center gap-2">
                    <div class="w-6 h-6 rounded bg-[#292524] flex items-center justify-center text-xs"><i class="fa-solid fa-user text-gray-400"></i></div>
                    ${s.name}
                </td>
                <td class="py-4 text-center text-[#a8a29e]">${s.mentions}</td>
                <td class="py-4 text-center font-medium">${s.avg} <i class="fa-solid fa-star text-yellow-400 text-[10px]"></i></td>
                <td class="py-4 text-right">
                    <span class="font-bold px-2.5 py-1 rounded-lg border ${scoreClass}">${s.sentScore}%</span>
                </td>
            </tr>
        `;
    });
}

let analyticsPieChart = null;

function updateAnalyticsTab(data) {
    const p = data.filter(r => r.sentiment === 'positive').length;
    const u = data.filter(r => r.sentiment === 'neutral' || r.sentiment === 'pending').length;
    const n = data.filter(r => r.sentiment === 'negative').length;
    const total = data.length;

    const eTot = document.getElementById('analytics-total');
    if (eTot) eTot.textContent = total;

    const ePos = document.getElementById('analytics-pos');
    if (ePos) ePos.textContent = p;

    const eNeu = document.getElementById('analytics-neu');
    if (eNeu) eNeu.textContent = u;

    const eNeg = document.getElementById('analytics-neg');
    if (eNeg) eNeg.textContent = n;

    const canvas = document.getElementById('analyticsPieChart');
    if (canvas) {
        if (!analyticsPieChart) {
            analyticsPieChart = new Chart(canvas.getContext('2d'), {
                type: 'doughnut',
                data: {
                    labels: ['Positive', 'Neutral', 'Negative'],
                    datasets: [{
                        data: [p, u, n],
                        backgroundColor: ['#10B981', '#FBBF24', '#EF4444'],
                        borderWidth: 2,
                        borderColor: '#0c0a09',
                        hoverOffset: 15,
                        hoverBorderColor: '#ffffff'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: '75%',
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: { color: '#a8a29e', padding: 20, font: { family: 'Inter', size: 12 } }
                        }
                    },
                    layout: { padding: 10 }
                }
            });
        } else {
            analyticsPieChart.data.datasets[0].data = [p, u, n];
            analyticsPieChart.update();
        }
    }
}

// MULTI-AI MONTHLY OVERVIEW
function generateMonthlyAIOverview(data) {
    const posList = document.getElementById('ai-positives-list');
    const negList = document.getElementById('ai-negatives-list');
    const sumText = document.getElementById('ai-overview-text');

    if (!posList || !negList || !sumText) return;

    // Simulate API delay
    posList.innerHTML = '<li class="flex items-start gap-3 text-sm text-gray-400"><i class="fa-solid fa-spinner fa-spin text-emerald-400 mt-1"></i> Analyzing positive feedback with Gemini API...</li>';
    negList.innerHTML = '<li class="flex items-start gap-3 text-sm text-gray-400"><i class="fa-solid fa-spinner fa-spin text-red-400 mt-1"></i> Analyzing negative feedback with Gemini API...</li>';
    sumText.innerHTML = '<i class="fa-solid fa-spinner fa-spin text-indigo-400"></i> Synthesizing executive summary...';

    setTimeout(() => {
        const positives = data.filter(r => r.sentiment === 'positive').sort((a, b) => b.rating - a.rating || b.time - a.time).slice(0, 5);
        const negatives = data.filter(r => r.sentiment === 'negative').sort((a, b) => a.rating - b.rating || b.time - a.time).slice(0, 5);

        const extractInsight = (text, isPositive) => {
            const t = text.toLowerCase();
            if (isPositive) {
                if (t.includes('staff') || t.includes('service') || t.includes('waiter') || t.includes('friendly')) return "Exceptional, friendly, and attentive staff service.";
                if (t.includes('food') || t.includes('delicious') || t.includes('taste') || t.includes('amazing')) return "High quality, delicious, and well-prepared food offerings.";
                if (t.includes('clean') || t.includes('atmosphere') || t.includes('ambience') || t.includes('vibe')) return "Great restaurant ambience and pristine cleanliness.";
                if (t.includes('fast') || t.includes('quick')) return "Extremely quick and efficient service times.";
                return "Consistently fantastic overall experience that exceeds expectations.";
            } else {
                if (t.includes('wait') || t.includes('slow') || t.includes('time') || t.includes('long')) return "Unacceptable wait times for food delivery and seating.";
                if (t.includes('rude') || t.includes('staff') || t.includes('service') || t.includes('attitude')) return "Poor staff attitude and frustratingly inattentive service.";
                if (t.includes('cold') || t.includes('taste') || t.includes('food') || t.includes('bad')) return "Subpar food quality, including temperature and taste issues.";
                if (t.includes('price') || t.includes('expensive') || t.includes('cost')) return "Pricing feels disproportionately high for the value provided.";
                return "Overall dining experience significantly fell short of expectations.";
            }
        };

        // Generate Positives HTML
        if (positives.length > 0) {
            posList.innerHTML = positives.map(r => {
                const insight = extractInsight(r.reviewText, true);
                const staffMention = r.staffTagged !== 'unassigned' && staffMap[r.staffTagged] ? ` (Validated by praise for: <b>${staffMap[r.staffTagged]}</b>)` : '';
                return `
                <li class="flex items-start gap-3 text-sm text-gray-300 bg-[#1c1917] p-3 rounded-lg border border-[#292524] shadow-sm relative pl-8">
                    <i class="fa-solid fa-check text-emerald-500 absolute left-3 top-4"></i>
                    <div>
                        <span class="font-semibold text-emerald-400">AI Highlight:</span> ${insight}${staffMention} 
                        <span class="text-xs text-gray-500 block mt-1">Found in ${r.authorName}'s ${r.rating}★ review</span>
                    </div>
                </li>`;
            }).join('');
        } else {
            posList.innerHTML = '<li class="text-sm text-gray-400 italic">Not enough positive data to extract insights.</li>';
        }

        // Generate Negatives HTML
        if (negatives.length > 0) {
            negList.innerHTML = negatives.map(r => {
                const insight = extractInsight(r.reviewText, false);
                const staffMention = r.staffTagged !== 'unassigned' && staffMap[r.staffTagged] ? ` (Issue correlated with: <b>${staffMap[r.staffTagged]}</b>)` : '';
                return `
                <li class="flex items-start gap-3 text-sm text-gray-300 bg-[#1c1917] p-3 rounded-lg border border-[#292524] shadow-sm relative pl-8">
                    <i class="fa-solid fa-triangle-exclamation text-red-500 absolute left-3 top-4"></i>
                    <div>
                        <span class="font-semibold text-red-400">AI Root Cause:</span> ${insight}${staffMention}
                        <span class="text-xs text-gray-500 block mt-1">Found in ${r.authorName}'s ${r.rating}★ review</span>
                    </div>
                </li>`;
            }).join('');
        } else {
            negList.innerHTML = '<li class="text-sm text-gray-400 italic">Great news! No significant negative trends detected.</li>';
        }

        // Generate Executive Summary
        const totalPos = data.filter(r => r.sentiment === 'positive').length;
        const total = data.length || 1;
        const score = (totalPos / total) * 100;

        let summaryStr = `<strong>Based on an AI analysis of ${data.length} recent reviews:</strong><br><br>`;

        if (score >= 80) {
            summaryStr += `✨ <strong>Overall Sentiment is Excellent.</strong> Staff service is highly praised, with frequent mentions of attentive and friendly behavior. The ambience continues to be a strong draw for customers. There are minimal complaints, indicating strong operational health. Keep maintaining these high standards!`;
        } else if (score >= 50) {
            summaryStr += `⚖️ <strong>Overall Sentiment is Mixed.</strong> While there are solid aspects to the service and food, inconsistencies are holding back the overall experience rating. Some staff members receive high praise, while others are flagged for slow service during peak hours. The ambience is generally acceptable. Focus training on consistency across all shifts.`;
        } else {
            summaryStr += `⚠️ <strong>Overall Sentiment Needs Immediate Attention.</strong> Service delays and staff attitude are recurring themes in negative feedback. Customers repeatedly mention waiting too long and feeling unvalued. The ambience cannot make up for the operational shortfalls. Immediate retraining and policy review are recommended.`;
        }

        sumText.innerHTML = summaryStr;

    }, 1500); // 1.5s delay for realistic "AI computation"
}

const refreshAiBtn = document.getElementById('refreshAiInsightsBtn');
if (refreshAiBtn) {
    refreshAiBtn.addEventListener('click', () => {
        renderDashboard();
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

    // 3. New Branch Comparison Bar Chart
    const branchStats = {};
    Object.keys(branchMap).forEach(bId => {
        branchStats[bId] = { name: branchMap[bId], count: 0, sum: 0 };
    });

    data.forEach(r => {
        if (branchStats[r.branchId]) {
            branchStats[r.branchId].count++;
            branchStats[r.branchId].sum += r.rating;
        }
    });

    const labels = [];
    const avgData = [];
    Object.values(branchStats).forEach(b => {
        if (b.count > 0) {
            labels.push(b.name);
            avgData.push((b.sum / b.count).toFixed(1));
        }
    });

    const ctxBar = document.getElementById('branchBarChart');
    if (ctxBar) {
        if (!window.branchBarChart) {
            window.branchBarChart = new Chart(ctxBar.getContext('2d'), {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Average Rating',
                        data: avgData,
                        backgroundColor: 'rgba(245, 158, 11, 0.7)',
                        borderColor: '#f59e0b',
                        borderWidth: 1,
                        borderRadius: 6
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                        y: { beginAtZero: true, max: 5, grid: { color: '#292524' }, border: { display: false }, ticks: { color: '#a8a29e' } },
                        x: { grid: { display: false }, border: { display: false }, ticks: { color: '#a8a29e' } }
                    }
                }
            });
        } else {
            window.branchBarChart.data.labels = labels;
            window.branchBarChart.data.datasets[0].data = avgData;
            window.branchBarChart.update();
        }
    }
}

// REPLY MODAL LOGIC

let currentReviewForModal = null;

function openReplyModal(r) {
    currentReviewForModal = r;
    if (!document.getElementById('modalReviewId')) return;
    document.getElementById('modalReviewId').value = r.id;
    document.getElementById('modalReviewText').textContent = `"${r.reviewText}"`;
    document.getElementById('replyMessage').value = '';
    document.getElementById('replyModal').classList.remove('hidden');
}

function closeReplyModal() {
    if (document.getElementById('replyModal')) document.getElementById('replyModal').classList.add('hidden');
    currentReviewForModal = null;
}

if (document.getElementById('closeModalBtn')) document.getElementById('closeModalBtn').onclick = closeReplyModal;
if (document.getElementById('cancelModalBtn')) document.getElementById('cancelModalBtn').onclick = closeReplyModal;

const aiBtn = document.getElementById('generateAiReplyBtn');
if (aiBtn) {
    aiBtn.onclick = () => {
        const btn = document.getElementById('generateAiReplyBtn');
        const textArea = document.getElementById('replyMessage');

        if (!currentReviewForModal) return;

        // Animate button
        const ogHtml = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Generating...';
        btn.disabled = true;

        setTimeout(() => {
            const rating = currentReviewForModal.rating || 0;
            const author = currentReviewForModal.authorName || "Valued Guest";

            let response = "";
            if (rating >= 4) {
                response = `Dear ${author}, \n\nThank you so much for your glowing ${rating} -star review! We are absolutely thrilled to hear that you had an excellent experience with us.Your kind words mean the world to our team, and we can't wait to welcome you back again soon.\n\nWarm regards,\nThe Management Team`;
            } else if (rating === 3) {
                response = `Dear ${author},\n\nThank you for taking the time to leave us your feedback. While we are glad you visited, we always strive for a 5-star experience and would love to know how we can improve. Please reach out to us directly so we can make your next visit perfect.\n\nBest regards,\nThe Management Team`;
            } else {
                response = `Dear ${author},\n\nWe are truly sorry to hear that your experience did not meet expectations. Providing exceptional service is our top priority, and it seems we fell short this time. We would greatly appreciate the opportunity to make things right. Please contact us directly at support@restaurant.com so we can address your concerns personally.\n\nSincerely,\nThe Management Team`;
            }

            // Typewriter effect
            textArea.value = "";
            let i = 0;
            const speed = 10;
            function typeWriter() {
                if (i < response.length) {
                    textArea.value += response.charAt(i);
                    i++;
                    setTimeout(typeWriter, speed);
                } else {
                    btn.innerHTML = ogHtml;
                    btn.disabled = false;
                }
            }
            typeWriter();

        }, 800); // Simulate API delay
    };
}

if (document.getElementById('replyForm')) {
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
}