const API_URL = 'http://localhost:8000';
let currentBranchId = null;

// ============================================
// 1. JWT Authentication Bootstrapper
// ============================================
const token = localStorage.getItem('reviewiq_auth_token');

if (!token) {
    alert("Session expired or missing. Please log in.");
    window.location.href = '../html/login.html';
}

const apiFetch = async (endpoint, options = {}) => {
    const defaultHeaders = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
    };

    const response = await fetch(`${API_URL}${endpoint}`, {
        ...options,
        headers: {
            ...defaultHeaders,
            ...options.headers
        }
    });

    const data = await response.json();
    if (!response.ok) {
        throw new Error(data.error || 'API Request Failed');
    }
    return data;
};

// ============================================
// 2. Hydration & Initial Load
// ============================================
window.addEventListener('DOMContentLoaded', async () => {
    try {
        // Authenticate context
        const userPayload = await apiFetch('/auth/me');
        document.getElementById('userNameDisplay').textContent = `Welcome, ${userPayload.name} (${userPayload.role.replace('_', ' ')})`;
        currentBranchId = userPayload.branchId;

        if (currentBranchId) {
            document.getElementById('branchDisplay').textContent = `Branch: ${currentBranchId}`;
        } else {
            document.getElementById('branchDisplay').textContent = "Admin | All Branches";
        }

        // Hydrate UI State
        await hydrateKPIs();
        await hydrateFeed();

        // Connect Socket
        initializeLiveFeed();

    } catch (error) {
        console.error("Boot failure:", error);
        alert(`Authentication Error: ${error.message}`);
        localStorage.removeItem('reviewiq_auth_token');
        window.location.href = '../html/login.html';
    }
});

// ============================================
// 3. Analytics Aggregation UI
// ============================================
const hydrateKPIs = async () => {
    try {
        const query = currentBranchId ? `?branchId=${currentBranchId}` : '';
        const data = await apiFetch(`/api/analytics/dashboard${query}`);
        const stats = data.data;

        document.getElementById('kpiTotalReviews').textContent = stats.totalReviews.toLocaleString();
        document.getElementById('kpiAvgRating').textContent = stats.averageRating.toFixed(1);

        if (stats.totalReviews > 0) {
            document.getElementById('kpiPositivePercent').textContent = `${((stats.sentimentCounts.positive / stats.totalReviews) * 100).toFixed(0)}%`;
        } else {
            document.getElementById('kpiPositivePercent').textContent = '0%';
        }

        // Assuming we calculate escalations based on negative for now if not directly sent
        document.getElementById('kpiEscalations').textContent = stats.sentimentCounts.negative;

    } catch (error) {
        console.error("Metrics failed:", error);
        document.querySelectorAll('.kpi-value').forEach(el => el.textContent = 'Err');
    }
};

// ============================================
// 4. Feed & Card Render Pipeline
// ============================================
const hydrateFeed = async () => {
    const feed = document.getElementById('reviewsFeed');
    try {
        const query = currentBranchId ? `?branchId=${currentBranchId}` : '';
        const data = await apiFetch(`/reviews${query}`); // Adjust route if needed
        const reviews = data.data;

        feed.innerHTML = '';
        if (reviews.length === 0) {
            feed.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-satellite-dish"></i>
                    <p>No reviews found. Live WebSocket stream is active.</p>
                </div>
            `;
            return;
        }

        reviews.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).forEach(r => appendReviewCard(r, false));
    } catch (e) {
        feed.innerHTML = `<div style="color:red;text-align:center;">Failed to fetch reviews: ${e.message}</div>`;
    }
};

const appendReviewCard = (review, prepend = true) => {
    const feed = document.getElementById('reviewsFeed');
    const emptyState = feed.querySelector('.empty-state');
    if (emptyState) emptyState.remove();

    const dateStr = new Date(review.createdAt || new Date()).toLocaleString();
    const sourceIcon = review.source === 'google' ? 'google' : 'comment-dots';

    const card = document.createElement('div');
    card.className = 'review-card';
    card.id = `review-${review.id}`;

    // Draw stars
    let stars = '';
    for (let i = 0; i < review.rating; i++) stars += '★';

    card.innerHTML = `
        <div class="review-header">
            <div class="review-meta">
                <i class="fas fa-${sourceIcon} source-icon ${review.source || 'internal'}"></i>
                <div class="stars">${stars}</div>
                <div class="date">${dateStr}</div>
            </div>
            ${review.isEscalated ? '<div class="badge sentiment-negative"><i class="fas fa-fire"></i> Escalated</div>' : ''}
        </div>
        <p class="review-text">${review.reviewText}</p>
        <div class="review-footer">
            <div class="ai-tags">
                <div class="badge sentiment-${review.sentiment || 'neutral'}">
                    ${review.sentiment || 'Pending AI'}
                </div>
                <div class="badge category">
                    <i class="fas fa-tag"></i> <span class="cat-label">${review.category || 'Uncategorized'}</span>
                </div>
            </div>
            <div class="review-actions">
                <button class="btn btn-outline draft-reply-btn" data-id="${review.id}"><i class="fas fa-robot"></i> Draft Reply</button>
                <button class="btn btn-outline override-cat-btn" data-id="${review.id}"><i class="fas fa-edit"></i> Override</button>
            </div>
        </div>
    `;

    if (prepend) {
        feed.prepend(card);
    } else {
        feed.appendChild(card);
    }

    // Attach local listeners
    card.querySelector('.draft-reply-btn').addEventListener('click', () => openAIModal(review.id));
    card.querySelector('.override-cat-btn').addEventListener('click', () => openCategoryModal(review.id));
};

// ============================================
// 5. Native WebSocket Streamer
// ============================================
const initializeLiveFeed = () => {
    // We attach token via auth so server can upgrade connection securely
    const socket = io(API_URL);

    socket.on('connect', () => {
        console.log("WebSocket connected!");
        if (currentBranchId) {
            socket.emit('join_branch', currentBranchId);
        }
    });

    socket.on('new_review', (reviewPayload) => {
        console.log('LIVE REVIEW CAPTURED:', reviewPayload);
        appendReviewCard(reviewPayload, true);
        hydrateKPIs(); // Recalculate physical numbers on screen
    });
};


// ============================================
// 6. Action Modals (AI Draft & Override)
// ============================================
let activeReviewId = null;

// AI Modals
const aiModal = document.getElementById('aiModal');
const aiDraftText = document.getElementById('aiDraftText');

const openAIModal = async (reviewId) => {
    activeReviewId = reviewId;
    aiDraftText.value = 'Connecting to Gemini Cloud... Generating contextual empathy vectors...';
    aiModal.classList.remove('hidden');

    try {
        const response = await apiFetch('/api/ai/suggest-reply', {
            method: 'POST',
            body: JSON.stringify({ reviewId })
        });
        aiDraftText.value = response.data.suggestion;
    } catch (e) {
        aiDraftText.value = `Failed to generate reply: ${e.message}`;
    }
};

document.getElementById('closeModalBtn').addEventListener('click', () => aiModal.classList.add('hidden'));

document.getElementById('copyDraftBtn').addEventListener('click', () => {
    aiDraftText.select();
    document.execCommand('copy');
    alert('Copied to Clipboard!');
    aiModal.classList.add('hidden');
});

// Category Overrides
const catModal = document.getElementById('categoryModal');
const openCategoryModal = (reviewId) => {
    activeReviewId = reviewId;
    catModal.classList.remove('hidden');
};

document.getElementById('closeCategoryModalBtn').addEventListener('click', () => catModal.classList.add('hidden'));
document.getElementById('saveCategoryBtn').addEventListener('click', async () => {
    const newCat = document.getElementById('newCategorySelect').value;
    try {
        await apiFetch(`/reviews/${activeReviewId}/category`, {
            method: 'PATCH',
            body: JSON.stringify({ category: newCat })
        });

        // Update local DOM instantly without reload
        const catLabel = document.querySelector(`#review-${activeReviewId} .cat-label`);
        if (catLabel) catLabel.textContent = newCat;

        catModal.classList.add('hidden');
    } catch (e) {
        alert("Action forbidden: " + e.message);
    }
});


// ============================================
// 7. Data Portability Core Features
// ============================================
document.getElementById('exportCsvBtn').addEventListener('click', async () => {
    try {
        // Since export is a download blob, we can't just fetch json easily.
        // We will construct URL and let browser download it.
        // Wait, endpoint requires bearer token in header. So we must fetch as blob!
        const response = await fetch(`${API_URL}/api/analytics/export?branchId=${currentBranchId || ''}&type=reviews`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || "Failed to generate CSV");
        }

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Branch_Report_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
    } catch (error) {
        alert(`Export Failed: ${error.message}`);
    }
});

// Logout
document.getElementById('logoutBtn').addEventListener('click', () => {
    localStorage.removeItem('reviewiq_auth_token');
    window.location.href = '../html/login.html';
});
