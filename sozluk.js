// Sözlük — bağımsız sayfa. Giriş gerektirmez (herkese açık bir sözlük).

const API_BASE_URL = 'https://ottoman-text-ai.onrender.com';

// Üst navbar'daki tema anahtarı ve sol menü çekmecesi — diğer sayfalarla
// birebir aynı davranış (aynı 'theme' localStorage anahtarı paylaşılır).
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

// Sol menüdeki hesap kartı — giriş yapılmışsa /api/auth/me'den dolan
// isim/unvan/avatar; diğer sayfalardakiyle aynı mantık.
(function renderSidebarProfile() {
    const authToken = localStorage.getItem('auth_token');
    if (!authToken) return;
    fetch(`${API_BASE_URL}/api/auth/me`, { headers: { 'Authorization': `Bearer ${authToken}` } })
        .then(res => res.ok ? res.json() : null)
        .then(profile => {
            if (!profile) return;
            const nameEl = document.getElementById('sidebarProfileName');
            const titleEl = document.getElementById('sidebarProfileTitle');
            const avatarEl = document.getElementById('sidebarProfileAvatar');
            if (!nameEl) return;
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
        })
        .catch(() => {});
})();

// --- Sözlük araması ---
const sozlukSearchInput = document.getElementById('sozlukSearchInput');
const sozlukResults = document.getElementById('sozlukResults');
const sozlukCount = document.getElementById('sozlukCount');
const sozlukPlaceholder = document.getElementById('sozlukPlaceholder');
const sozlukRandomBtn = document.getElementById('sozlukRandomBtn');

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function renderEntries(entries) {
    sozlukResults.innerHTML = entries.map(e => `
        <div class="sozluk-entry">
            <div class="sozluk-entry-word">${escapeHtml(e.word)}</div>
            <div class="sozluk-entry-def">${escapeHtml(e.definition)}</div>
        </div>
    `).join('');
}

let searchTimer = null;
let requestId = 0;

function runSearch(query) {
    clearTimeout(searchTimer);
    query = query.trim();

    if (!query) {
        sozlukResults.innerHTML = '';
        sozlukCount.hidden = true;
        sozlukPlaceholder.hidden = false;
        return;
    }

    if (query.length < 2) {
        sozlukResults.innerHTML = '';
        sozlukCount.hidden = true;
        sozlukPlaceholder.hidden = true;
        return;
    }

    searchTimer = setTimeout(async () => {
        const thisRequestId = ++requestId;
        try {
            const res = await fetch(`${API_BASE_URL}/api/dictionary/search?q=${encodeURIComponent(query)}&limit=50`);
            if (thisRequestId !== requestId) return;
            if (!res.ok) throw new Error('search failed');
            const data = await res.json();
            sozlukPlaceholder.hidden = true;
            if (!data.results.length) {
                sozlukResults.innerHTML = '<p class="sozluk-empty">Eşleşen kelime bulunamadı.</p>';
                sozlukCount.hidden = true;
                return;
            }
            renderEntries(data.results);
            sozlukCount.hidden = false;
            sozlukCount.textContent = data.total_matches > data.results.length
                ? `${data.results.length} / ${data.total_matches} sonuç gösteriliyor`
                : `${data.total_matches} sonuç`;
        } catch (err) {
            sozlukResults.innerHTML = '<p class="sozluk-empty">Sözlük şu an yüklenemedi, lütfen tekrar deneyin.</p>';
            sozlukCount.hidden = true;
        }
    }, 300);
}

sozlukSearchInput.addEventListener('input', () => runSearch(sozlukSearchInput.value));

// URL'de ?q= varsa (navbar aramasından "Sözlükte ara" ile gelinmiş olabilir)
// otomatik doldurup arasın.
const initialQuery = new URLSearchParams(window.location.search).get('q');
if (initialQuery) {
    sozlukSearchInput.value = initialQuery;
    runSearch(initialQuery);
}

if (sozlukRandomBtn) {
    sozlukRandomBtn.addEventListener('click', async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/dictionary/random`);
            if (!res.ok) return;
            const entry = await res.json();
            sozlukSearchInput.value = entry.word;
            runSearch(entry.word);
        } catch (err) {
            // sessizce geç
        }
    });
}
