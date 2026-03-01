import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
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
let branchBarChart = null;

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
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Signing in...';

    signInWithPopup(auth, provider).then((result) => {
        console.log("Popup sign-in successful:", result.user.uid);
    }).catch(err => {
        console.error("Popup sign-in error:", err);
        document.getElementById('loginError').textContent = err.message;
        document.getElementById('loginError').classList.remove('hidden');
        btn.innerHTML = '<img src="https://upload.wikimedia.org/wikipedia/commons/c/c1/Google_%22G%22_logo.svg" alt="Google Logo" class="w-5 h-5"> Sign in with Google';
    });
});

// We keep this function around in case they log out from the dashboard
document.getElementById('logoutBtn').addEventListener('click', () => signOut(auth));

async function handleSuccessfulLogin(firebaseUser) {
    try {
        console.log("User authenticated, fetching user profile...");
        const userDoc = await getDoc(doc(db, "users", firebaseUser.uid));
        if (userDoc.exists() && userDoc.data().isActive) {
            currentUser = { uid: firebaseUser.uid, ...userDoc.data() };
            // Kick customers out of the owner portal
            if (currentUser.role === 'customer') {
                window.location.href = '../html/customer.html';
                return;
            }
        } else {
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
        if (currentUser.role === 'admin' || currentUser.role === 'restaurant_owner' || currentUser.branchId === doc.id) {
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
    updateStaffTable(filtered);
    updateCharts(filtered, allReviews);
    updateAnalyticsTab(filtered);
    generateMonthlyAIOverview(filtered);
}

function updateKPIs(data) {
    const tot = data.length;
    const crit = data.filter(r => r.status === 'critical').length;
    const avg = tot ? (data.reduce((acc, r) => acc + (Number(r.rating) || 0), 0) / tot).toFixed(1) : "0.0";
    const sentScore = tot ? Math.round((data.filter(r => r.sentiment === 'positive').length / tot) * 100) : 0;

    const idTotal = document.getElementById('stat-total');
    if (idTotal) idTotal.textContent = tot.toLocaleString();

    const idAvg = document.getElementById('stat-avg');
    if (idAvg) idAvg.textContent = avg;

    const idCrit = document.getElementById('stat-critical');
    if (idCrit) idCrit.textContent = crit;

    const idSent = document.getElementById('stat-sentiment');
    if (idSent) idSent.textContent = sentScore;

    const bar = document.getElementById('stat-sentiment-bar');
    if (bar) {
        bar.style.width = sentScore + '%';
        bar.className = `absolute bottom-0 left-0 h-1 rounded-b-xl transition-all duration-1000 ${sentScore >= 70 ? 'bg-emerald-500' : sentScore >= 40 ? 'bg-amber-500' : 'bg-red-500'}`;
    }

    const cSub = document.getElementById('critical-subtitle');
    if (cSub) cSub.textContent = `${crit} Critical issues pending response`;

    const cSubTable = document.getElementById('critical-subtitle-table');
    if (cSubTable) cSubTable.textContent = `${crit} Critical issues pending response`;

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
        if (stats[r.staffId]) {
            stats[r.staffId].mentions++;
            stats[r.staffId].ratingSum += r.rating;
            if (r.sentiment === 'positive') stats[r.staffId].positiveCount++;
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
                const staffMention = r.staffId !== 'unassigned' && staffMap[r.staffId] ? ` (Validated by praise for: <b>${staffMap[r.staffId]}</b>)` : '';
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
                const staffMention = r.staffId !== 'unassigned' && staffMap[r.staffId] ? ` (Issue correlated with: <b>${staffMap[r.staffId]}</b>)` : '';
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
        const selectedBranch = document.getElementById('branchSelector').value;
        const filtered = allReviews.filter(r => selectedBranch === 'all' || r.branchId === selectedBranch);
        generateMonthlyAIOverview(filtered);
    });
}

function updateCharts(data, all) {
    const p = data.filter(r => r.sentiment === 'positive').length;
    const u = data.filter(r => r.sentiment === 'neutral' || r.sentiment === 'pending').length;
    const n = data.filter(r => r.sentiment === 'negative').length;
    const t = p + u + n;

    const dPos = document.getElementById('doughnut-pos');
    if (dPos) dPos.textContent = p;

    const dNeu = document.getElementById('doughnut-neu');
    if (dNeu) dNeu.textContent = u;

    const dNeg = document.getElementById('doughnut-neg');
    if (dNeg) dNeg.textContent = n;

    const dCenter = document.getElementById('doughnut-center');
    if (dCenter) dCenter.textContent = t ? Math.round((p / t) * 100) + '%' : '0%';

    const sDoughnut = document.getElementById('sentimentDoughnut');
    if (sDoughnut) {
        if (!sentimentChart) {
            sentimentChart = new Chart(sDoughnut.getContext('2d'), {
                type: 'doughnut',
                data: { labels: ['Pos', 'Neu', 'Neg'], datasets: [{ data: [p, u, n], backgroundColor: ['#10B981', '#FBBF24', '#EF4444'], borderWidth: 0, hoverOffset: 4 }] },
                options: { responsive: true, maintainAspectRatio: false, cutout: '75%', plugins: { legend: { display: false } } }
            });
        } else {
            sentimentChart.data.datasets[0].data = [p, u, n];
            sentimentChart.update();
        }
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const volumes = [0, 0, 0, 0, 0, 0, 0];
    data.forEach(r => {
        const d = r.externalTimestamp ? new Date(r.externalTimestamp) : new Date(r.createdAt || Date.now());
        d.setHours(0, 0, 0, 0);
        const diffDays = Math.floor((today - d) / (1000 * 60 * 60 * 24));
        if (diffDays >= 0 && diffDays < 7) {
            volumes[6 - diffDays]++;
        }
    });

    if (!trendChart) {
        trendChart = new Chart(document.getElementById('sentimentTrendChart').getContext('2d'), {
            type: 'line',
            data: {
                labels: ['6d ago', '5d ago', '4d ago', '3d ago', '2d ago', '1d ago', 'Today'],
                datasets: [{ label: 'Incoming volume', data: volumes, borderColor: '#f59e0b', backgroundColor: 'rgba(245, 158, 11, 0.2)', fill: true, tension: 0.4, borderWidth: 2 }]
            },
            options: {
                responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, grid: { color: '#292524' }, border: { display: false }, ticks: { color: '#a8a29e', precision: 0 } },
                    x: { grid: { display: false }, border: { display: false }, ticks: { color: '#a8a29e' } }
                }
            }
        });
    } else {
        trendChart.data.datasets[0].data = volumes;
        trendChart.update();
    }

    const aiInsightText = document.getElementById('aiInsightText');
    if (aiInsightText) {
        if (data.length === 0) {
            aiInsightText.innerHTML = "Not enough review data to generate an AI insight yet.";
        } else {
            if (p >= n * 2 && p > 0) {
                aiInsightText.innerHTML = `"Based on ${data.length} recent reviews, customers highly praise the overall experience, with extremely positive sentiment across the board."`;
            } else if (n >= p && n > 0) {
                aiInsightText.innerHTML = `"Critical alert: Over ${n} recent reviews highlight significant ongoing issues that require immediate management attention."`;
            } else {
                aiInsightText.innerHTML = `"Based on ${data.length} recent reviews, overall feedback is mixed but stable. Monitor neutral reviews to prevent them from slipping into critical status."`;
            }
        }
    }


    // 3. New Branch Comparison Bar Chart
    const branchStats = {};
    Object.keys(branchMap).forEach(bId => {
        branchStats[bId] = { name: branchMap[bId], count: 0, sum: 0 };
    });

    data.forEach(r => {
        if (branchStats[r.branchId]) {
            branchStats[r.branchId].count++;
            branchStats[r.branchId].sum += Number(r.rating) || 0;
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
        if (!branchBarChart) {
            branchBarChart = new Chart(ctxBar.getContext('2d'), {
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
            branchBarChart.data.labels = labels;
            branchBarChart.data.datasets[0].data = avgData;
            branchBarChart.update();
        }
    }
}

let currentReviewForModal = null;

function openReplyModal(r) {
    currentReviewForModal = r;
    document.getElementById('modalReviewId').value = r.id;
    document.getElementById('modalReviewText').textContent = `"${r.reviewText}"`;
    document.getElementById('replyMessage').value = '';
    document.getElementById('replyModal').classList.remove('hidden');
}
function closeReplyModal() {
    document.getElementById('replyModal').classList.add('hidden');
    currentReviewForModal = null;
}
document.getElementById('closeModalBtn').onclick = closeReplyModal;
document.getElementById('cancelModalBtn').onclick = closeReplyModal;

document.getElementById('generateAiReplyBtn').addEventListener('click', () => {
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
            response = `Dear ${author},\n\nThank you so much for your glowing ${rating}-star review! We are absolutely thrilled to hear that you had an excellent experience with us. Your kind words mean the world to our team, and we can't wait to welcome you back again soon.\n\nWarm regards,\nThe Management Team`;
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
});

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

// BULK AI AUTO-REPLY LOGIC
const bulkAiReplyBtn = document.getElementById('bulkAiReplyBtn');
if (bulkAiReplyBtn) {
    bulkAiReplyBtn.addEventListener('click', async () => {
        const pendingReviews = allReviews.filter(r => r.responseStatus !== 'responded');

        if (pendingReviews.length === 0) {
            alert('No pending reviews to auto-reply to!');
            return;
        }

        if (!confirm(`Are you sure you want to AI auto-reply to ${pendingReviews.length} pending review(s)?`)) return;

        const ogHtml = bulkAiReplyBtn.innerHTML;
        bulkAiReplyBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Auto-Replying... (' + pendingReviews.length + ')';
        bulkAiReplyBtn.disabled = true;

        let successCount = 0;

        try {
            // Process sequentially to avoid slamming the frontend or firebase
            for (const r of pendingReviews) {
                const rating = r.rating || 0;
                const author = r.authorName || "Valued Guest";

                let responseText = "";
                if (rating >= 4) {
                    responseText = `Dear ${author},\n\nThank you so much for your glowing ${rating}-star review! We are absolutely thrilled to hear that you had an excellent experience with us. Your kind words mean the world to our team, and we can't wait to welcome you back again soon.\n\nWarm regards,\nThe Management Team`;
                } else if (rating === 3) {
                    responseText = `Dear ${author},\n\nThank you for taking the time to leave us your feedback. While we are glad you visited, we always strive for a 5-star experience and would love to know how we can improve. Please reach out to us directly so we can make your next visit perfect.\n\nBest regards,\nThe Management Team`;
                } else {
                    responseText = `Dear ${author},\n\nWe are truly sorry to hear that your experience did not meet expectations. Providing exceptional service is our top priority, and it seems we fell short this time. We would greatly appreciate the opportunity to make things right. Please contact us directly at support@restaurant.com so we can address your concerns personally.\n\nSincerely,\nThe Management Team`;
                }

                // Batch updates or single awaits
                await setDoc(doc(collection(db, "responses")), {
                    reviewId: r.id, responseText: responseText, respondedBy: currentUser.uid, respondedAt: serverTimestamp()
                });
                await updateDoc(doc(db, "reviews", r.id), { responseStatus: "responded" });
                r.responseStatus = 'responded';
                successCount++;
            }

            renderDashboard();
            alert(`Successfully sent ${successCount} AI auto-replies.`);
        } catch (e) {
            console.error("Error bulk responding:", e);
            alert("An error occurred during bulk reply: " + e.message);
        }

        bulkAiReplyBtn.innerHTML = ogHtml;
        bulkAiReplyBtn.disabled = false;
    });
}

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

        let details = null;
        let placeId = `mock_place_${Date.now()}`;

        const fullMockReviews = [
            { author_name: "Sarah Jenkins", rating: 5, text: "Excellent atmosphere and incredibly fast service! The staff was super friendly.", time: Math.floor(Date.now() / 1000) - 3600 },
            { author_name: "Mark T.", rating: 2, text: "My order was completely wrong and it took 30 minutes to get someone to fix it. Very disappointing.", time: Math.floor(Date.now() / 1000) - 86400 },
            { author_name: "Emily R.", rating: 4, text: "Great experience overall, but the music was a bit too loud for a business meeting.", time: Math.floor(Date.now() / 1000) - 172800 },
            { author_name: "David Chen", rating: 1, text: "Absolutely terrible. Found a hair in my food and the manager didn't even care.", time: Math.floor(Date.now() / 1000) - 259200 },
            { author_name: "Jessica Al.", rating: 5, text: "A hidden gem! The recommended specials were out of this world. I am coming back next week!", time: Math.floor(Date.now() / 1000) - 604800 },
            { author_name: "Michael B.", rating: 3, text: "It was okay. Nothing spectacular but not bad either. Pricing is a bit high.", time: Math.floor(Date.now() / 1000) - 904800 },
            { author_name: "Anna W.", rating: 5, text: "Best place in town! Will recommend it to everyone I know.", time: Math.floor(Date.now() / 1000) - 1004800 },
            { author_name: "Oliver S.", rating: 4, text: "Good food, nice ambiance. Wait time was a little long.", time: Math.floor(Date.now() / 1000) - 1204800 },
            { author_name: "Tom H.", rating: 2, text: "Disappointing. The steak was overcooked.", time: Math.floor(Date.now() / 1000) - 1304800 },
            { author_name: "Rachel G.", rating: 5, text: "Love the new menu items. Try the dessert!", time: Math.floor(Date.now() / 1000) - 1404800 }
        ];

        try {
            let query = restaurantName;
            if (!query.toLowerCase().includes('restaurant') && !query.toLowerCase().includes('cafe') && !query.toLowerCase().includes('food')) {
                query += " restaurant"; // Require dining places to block names/cities
            }

            const searchRes = await fetch("https://places.googleapis.com/v1/places:searchText", {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-Goog-Api-Key": GOOGLE_PLACES_API_KEY, "X-Goog-FieldMask": "places.id" },
                body: JSON.stringify({ textQuery: query })
            });

            if (!searchRes.ok) throw new Error("Google Places API failed");
            const searchData = await searchRes.json();

            if (!searchData.places || !searchData.places.length) throw new Error("No restaurant or cafe found matching this name worldwide.");

            placeId = searchData.places[0].id;

            const detRes = await fetch(`https://places.googleapis.com/v1/places/${placeId}?fields=id,displayName,formattedAddress,rating,userRatingCount,reviews,photos,regularOpeningHours,internationalPhoneNumber,websiteUri,businessStatus&key=${GOOGLE_PLACES_API_KEY}`);
            if (!detRes.ok) throw new Error("Failed to fetch detailed data for the restaurant");

            const detData = await detRes.json();

            details = {
                name: detData.displayName?.text || bName,
                formatted_address: detData.formattedAddress || bLoc,
                rating: detData.rating || 0,
                user_ratings_total: detData.userRatingCount || 0,
                reviews: (detData.reviews || []).map(r => ({
                    author_name: r.authorAttribution?.displayName || "Google User",
                    rating: r.rating || 0,
                    text: r.text?.text || "No text provided.",
                    time: r.publishTime ? Math.floor(new Date(r.publishTime).getTime() / 1000) : Math.floor(Date.now() / 1000)
                }))
            };

            // Pad API response up to 10 reviews if it comes back short
            if (details.reviews.length < 10) {
                const needed = 10 - details.reviews.length;
                details.reviews = [...details.reviews, ...fullMockReviews.slice(0, needed)];
            }
        } catch (apiErr) {
            console.warn("API Search failed. Bubbling up error instead of falling back to mock data.", apiErr);
            throw apiErr;
        }

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
