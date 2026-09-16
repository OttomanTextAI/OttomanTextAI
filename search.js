// Arama Sonuçları — bağımsız sayfa. Navbar'daki arama dropdown'ının
// "Daha fazlası"/Enter'ı buraya (search.html?q=...) yönlendirir.
// documents.html'in kendi arama/filtre/detay mantığına dokunmuyoruz —
// aynı GET /api/documents?q= uç noktasını kullanıyoruz, sonuçları kendi
// satır düzeninde gösteriyoruz.

const API_BASE_URL = 'https://ottoman-text-ai.onrender.com';

const authToken = localStorage.getItem('auth_token');

const loginRequired = document.getElementById('loginRequired');
const searchPageInput = document.getElementById('searchPageInput');
const searchResultsList = document.getElementById('searchResultsList');
const searchResultsCount = document.getElementById('searchResultsCount');

// Üst navbar'daki tema anahtarı ve sol menü çekmecesi — index.html/app.js
// ile birebir aynı davranış (aynı 'theme' localStorage anahtarı paylaşılır).
const themeToggleBtn = document.getElementById('themeToggleBtn');
const sideMenuToggle = document.getElementById('sideMenuToggle');
const sideDrawer = document.getElementById('sideDrawer');
const sideDrawerOverlay = document.getElementById('sideDrawerOverlay');
const sideDrawerClose = document.getElementById('sideDrawerClose');

if (localStorage.getItem('theme') === 'light') {
    document.body.classList.remove('dark-theme');
    themeToggleBtn.querySelector('.theme-icon').textContent = '🌙';
} else {
    document.body.classList.add('dark-theme');
    themeToggleBtn.querySelector('.theme-icon').textContent = '☀️';
}

themeToggleBtn.addEventListener('click', () => {
    document.body.classList.toggle('dark-theme');
    const isDark = document.body.classList.contains('dark-theme');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    themeToggleBtn.querySelector('.theme-icon').textContent = isDark ? '☀️' : '🌙';
});

if (!localStorage.getItem('menuDiscovered')) {
    sideMenuToggle.classList.add('needs-attention');
}

function openSideDrawer() {
    sideDrawer.classList.add('open');
    sideDrawerOverlay.classList.remove('hidden');
    sideDrawer.setAttribute('aria-hidden', 'false');
    sideMenuToggle.setAttribute('aria-expanded', 'true');
    sideMenuToggle.classList.remove('needs-attention');
    localStorage.setItem('menuDiscovered', '1');
}

function closeSideDrawer() {
    sideDrawer.classList.remove('open');
    sideDrawerOverlay.classList.add('hidden');
    sideDrawer.setAttribute('aria-hidden', 'true');
    sideMenuToggle.setAttribute('aria-expanded', 'false');
}

sideMenuToggle.addEventListener('click', () => {
    if (sideDrawer.classList.contains('open')) closeSideDrawer();
    else openSideDrawer();
});

sideDrawerClose.addEventListener('click', closeSideDrawer);
sideDrawerOverlay.addEventListener('click', closeSideDrawer);

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sideDrawer.classList.contains('open')) closeSideDrawer();
});

function escapeHtml(text) {
    return (text || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

// Sol menüdeki hesap kartı — /api/auth/me'den gelen full_name/title/
// avatar_url ile dolduruluyor; giriş yoksa placeholder (silüet +
// "Profilim") olduğu gibi kalır.
function renderSidebarProfileCard(profile) {
    const nameEl = document.getElementById('sidebarProfileName');
    const titleEl = document.getElementById('sidebarProfileTitle');
    const avatarEl = document.getElementById('sidebarProfileAvatar');
    if (!nameEl || !profile) return;
    const fallbackName = profile.email ? profile.email.split('@')[0] : '';
    nameEl.textContent = profile.full_name || fallbackName || 'Profilim';
    if (profile.title) {
        titleEl.textContent = profile.title;
        titleEl.hidden = false;
    }
    if (profile.avatar_url && avatarEl) {
        avatarEl.innerHTML = '';
        const img = document.createElement('img');
        img.src = profile.avatar_url;
        img.alt = '';
        avatarEl.appendChild(img);
    }
}

if (authToken) {
    fetch(`${API_BASE_URL}/api/auth/me`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
    })
        .then(res => res.ok ? res.json() : null)
        .then(renderSidebarProfileCard)
        .catch(() => {});
}

// documents.html'deki belge detayına gitmenin TEK URL'li yolu bu —
// ?search=...&open=<docId> ile açılıp docsCache'te bulununca
// showDocumentDetail() otomatik çağrılıyor (bkz. documents.js sonu).
function goToDocument(query, docId) {
    const params = new URLSearchParams();
    if (query) params.set('search', query);
    params.set('open', docId);
    window.location.href = `documents.html?${params.toString()}`;
}

function renderResults(docs) {
    if (!docs.length) {
        searchResultsList.innerHTML = `<p class="search-empty">Eşleşen belge bulunamadı.</p>`;
        return;
    }
    searchResultsList.innerHTML = docs.map(doc => {
        const metaParts = [];
        if (doc.place) metaParts.push(doc.place);
        if (doc.script_type) metaParts.push(doc.script_type);
        return `
            <div class="search-result-row" data-doc-id="${doc.id}">
                <div class="search-result-thumb">
                    ${doc.thumbnail_url ? `<img src="${doc.thumbnail_url}" alt="">` : '📄'}
                </div>
                <div class="search-result-body">
                    <div class="search-result-title-row">
                        <span class="search-result-title">${escapeHtml(doc.title || doc.filename)}</span>
                        ${doc.document_type ? `<span class="search-result-type">(${escapeHtml(doc.document_type)})</span>` : ''}
                    </div>
                    ${doc.summary ? `<div class="search-result-summary">${escapeHtml(doc.summary)}</div>` : ''}
                    ${metaParts.length ? `<div class="search-result-meta">${escapeHtml(metaParts.join(' · '))}</div>` : ''}
                </div>
            </div>
        `;
    }).join('');
}

async function runSearch(query) {
    if (!authToken) {
        loginRequired.classList.remove('hidden');
        searchResultsList.innerHTML = '';
        searchResultsCount.classList.add('hidden');
        return;
    }
    loginRequired.classList.add('hidden');
    searchResultsList.innerHTML = `<p class="search-hint">Yükleniyor...</p>`;

    try {
        const url = `${API_BASE_URL}/api/documents?per_page=100${query ? `&q=${encodeURIComponent(query)}` : ''}`;
        const res = await fetch(url, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        if (res.status === 401) {
            loginRequired.classList.remove('hidden');
            searchResultsList.innerHTML = '';
            return;
        }
        if (!res.ok) throw new Error('Arama yapılamadı.');

        const data = await res.json();
        const docs = data.documents || [];
        searchResultsCount.textContent = `${docs.length} sonuç`;
        searchResultsCount.classList.toggle('hidden', docs.length === 0);
        renderResults(docs);
    } catch (err) {
        searchResultsList.innerHTML = `<p class="search-empty">${escapeHtml(err.message)}</p>`;
    }
}

let searchPageDebounceTimer = null;
searchPageInput.addEventListener('input', () => {
    clearTimeout(searchPageDebounceTimer);
    const query = searchPageInput.value.trim();
    const newUrl = query ? `search.html?q=${encodeURIComponent(query)}` : 'search.html';
    history.replaceState(null, '', newUrl);
    searchPageDebounceTimer = setTimeout(() => runSearch(query), 350);
});

searchResultsList.addEventListener('click', (e) => {
    const row = e.target.closest('.search-result-row');
    if (row) {
        goToDocument(searchPageInput.value.trim(), row.getAttribute('data-doc-id'));
    }
});

const initialParams = new URLSearchParams(window.location.search);
const initialQuery = initialParams.get('q') || '';
searchPageInput.value = initialQuery;
runSearch(initialQuery);
