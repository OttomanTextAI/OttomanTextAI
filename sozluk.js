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
const sozlukRefreshBtn = document.getElementById('sozlukRefreshBtn');

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// Bazı tanımlar "1.devlet. 2.talih. 3.mevki." gibi birden fazla numaralı
// anlamı tek satırda art arda veriyor — bunları ayrı satırlara bölüyoruz.
// Numarasız/tek anlamlı tanımlarda hiçbir şey değişmez (tek parça döner).
function splitSenses(definition) {
    const re = /(?:^|\s)(\d{1,2})\.(?=\S)/g;
    const matches = [...definition.matchAll(re)];
    if (matches.length < 2) return [{ num: null, text: definition }];

    const senses = [];
    const firstStart = matches[0].index + matches[0][0].indexOf(matches[0][1]);
    if (firstStart > 0) {
        const prefix = definition.slice(0, firstStart).trim();
        if (prefix) senses.push({ num: null, text: prefix });
    }
    for (let i = 0; i < matches.length; i++) {
        const num = matches[i][1];
        const start = matches[i].index + matches[i][0].indexOf(num) + num.length + 1; // "N." sonrası
        const end = i + 1 < matches.length ? matches[i + 1].index + matches[i + 1][0].indexOf(matches[i + 1][1]) : definition.length;
        const text = definition.slice(start, end).trim();
        if (text) senses.push({ num, text });
    }
    return senses;
}

function renderSensesHtml(definition) {
    const senses = splitSenses(definition);
    return senses.map(s => `
        <div class="sozluk-sense">
            ${s.num ? `<span class="sozluk-sense-num">${s.num}.</span>` : ''}
            <span>${escapeHtml(s.text)}</span>
        </div>
    `).join('');
}

function renderEntries(entries) {
    sozlukResults.innerHTML = entries.map(e => `
        <div class="sozluk-entry">
            <div class="sozluk-entry-word">${escapeHtml(e.word)}</div>
            <div class="sozluk-entry-def">${renderSensesHtml(e.definition)}</div>
        </div>
    `).join('');
}

let searchTimer = null;
let requestId = 0;
let currentMode = 'browse'; // 'browse' (arama yapılmadan gösterilen rastgele kelimeler) | 'search'

async function loadRandomBatch() {
    currentMode = 'browse';
    const thisRequestId = ++requestId;
    try {
        const res = await fetch(`${API_BASE_URL}/api/dictionary/random?count=24`);
        if (thisRequestId !== requestId) return;
        if (!res.ok) throw new Error('random failed');
        const data = await res.json();
        if (!data.results || !data.results.length) {
            sozlukResults.innerHTML = '<p class="sozluk-empty">Sözlük şu an yüklenemedi, lütfen tekrar deneyin.</p>';
            sozlukCount.textContent = '';
            return;
        }
        renderEntries(data.results);
        sozlukCount.textContent = 'Aramadan önce göz atabileceğiniz rastgele kelimeler';
    } catch (err) {
        sozlukResults.innerHTML = '<p class="sozluk-empty">Sözlük şu an yüklenemedi, lütfen tekrar deneyin.</p>';
        sozlukCount.textContent = '';
    }
}

function runSearch(query) {
    clearTimeout(searchTimer);
    query = query.trim();

    if (!query || query.length < 2) {
        loadRandomBatch();
        return;
    }

    currentMode = 'search';
    searchTimer = setTimeout(async () => {
        const thisRequestId = ++requestId;
        try {
            const res = await fetch(`${API_BASE_URL}/api/dictionary/search?q=${encodeURIComponent(query)}&limit=50`);
            if (thisRequestId !== requestId) return;
            if (!res.ok) throw new Error('search failed');
            const data = await res.json();
            if (!data.results.length) {
                sozlukResults.innerHTML = '<p class="sozluk-empty">Eşleşen kelime bulunamadı.</p>';
                sozlukCount.textContent = '';
                return;
            }
            renderEntries(data.results);
            sozlukCount.textContent = data.total_matches > data.results.length
                ? `${data.results.length} / ${data.total_matches} sonuç gösteriliyor`
                : `${data.total_matches} sonuç`;
        } catch (err) {
            sozlukResults.innerHTML = '<p class="sozluk-empty">Sözlük şu an yüklenemedi, lütfen tekrar deneyin.</p>';
            sozlukCount.textContent = '';
        }
    }, 300);
}

sozlukSearchInput.addEventListener('input', () => runSearch(sozlukSearchInput.value));

sozlukRefreshBtn.addEventListener('click', () => {
    if (currentMode === 'search' && sozlukSearchInput.value.trim().length >= 2) {
        runSearch(sozlukSearchInput.value);
    } else {
        sozlukSearchInput.value = '';
        loadRandomBatch();
    }
});

// URL'de ?q= varsa (navbar aramasından "Sözlükte ara" ile gelinmiş olabilir)
// otomatik doldurup arasın; yoksa sayfa açılır açılmaz rastgele kelimelerle
// (arama yapmadan da göz atılabilsin diye) başlar.
const initialQuery = new URLSearchParams(window.location.search).get('q');
if (initialQuery) {
    sozlukSearchInput.value = initialQuery;
    runSearch(initialQuery);
} else {
    loadRandomBatch();
}
