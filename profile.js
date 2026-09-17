// Profilim — bağımsız sayfa. index.html/app.js ile aynı 'auth_token'
// localStorage anahtarını paylaştığı için ayrıca giriş yapmaya gerek yoktur.

const API_BASE_URL = 'https://ottoman-text-ai.onrender.com';

let authToken = localStorage.getItem('auth_token');
let currentProfile = null;

const loginRequired = document.getElementById('loginRequired');
const profileView = document.getElementById('profileView');

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

// --- Kişisel Bilgiler formu ---
const profileForm = document.getElementById('profileForm');
const profileFullName = document.getElementById('profileFullName');
const profileTitleInput = document.getElementById('profileTitleInput');
const profileEmail = document.getElementById('profileEmail');
const profileSpecialty = document.getElementById('profileSpecialty');
const profilePhone = document.getElementById('profilePhone');
const profileBio = document.getElementById('profileBio');
const profileInstitution = document.getElementById('profileInstitution');
const profileCancelBtn = document.getElementById('profileCancelBtn');
const profileSaveBtn = document.getElementById('profileSaveBtn');
const profileSaveMsg = document.getElementById('profileSaveMsg');

const profileSummaryName = document.getElementById('profileSummaryName');
const profileSummaryTitle = document.getElementById('profileSummaryTitle');
const profileAvatarImg = document.getElementById('profileAvatarImg');
const avatarFileInput = document.getElementById('avatarFileInput');
const avatarEditBtn = document.getElementById('avatarEditBtn');

function fillFormFromProfile(profile) {
    profileFullName.value = profile.full_name || '';
    profileTitleInput.value = profile.title || '';
    profileEmail.value = profile.email || '';
    profileSpecialty.value = profile.specialty || '';
    profilePhone.value = profile.phone || '';
    profileBio.value = profile.bio || '';
    profileInstitution.value = profile.institution || '';
}

function renderProfileSummary(profile) {
    profileSummaryName.textContent = profile.full_name || profile.email || '—';
    profileSummaryTitle.textContent = profile.title || '';
    profileAvatarImg.src = profile.avatar_url || 'assets/icon.png';
}

// Sol menüdeki hesap kartı — aynı profile fetch'inden dolduruluyor, ayrı
// bir /api/auth/me isteği atmaya gerek yok.
function renderSidebarProfileCard(profile) {
    const nameEl = document.getElementById('sidebarProfileName');
    const titleEl = document.getElementById('sidebarProfileTitle');
    const avatarEl = document.getElementById('sidebarProfileAvatar');
    if (!nameEl || !profile) return;
    nameEl.textContent = profile.full_name || (profile.email ? profile.email.split('@')[0] : '') || 'Profilim';
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

function requireLogin() {
    authToken = null;
    loginRequired.classList.remove('hidden');
    profileView.classList.add('hidden');
}

// --- Navbar Arama ---
// Büyüteç ikonuna tıklayınca açılan küçük dropdown; documents.html'deki
// arama ile aynı GET /api/documents?q= uç noktasını (sadece giriş
// yapmış kullanıcının kendi belgeleri) kullanır, en fazla 4 sonuç
// gösterir. Tam sonuçlar için documents.html?search=... 'a yönlendirir.
(function initNavSearch() {
    const navSearchBtn = document.getElementById('navSearchBtn');
    const navSearchPanel = document.getElementById('navSearchPanel');
    const navSearchInput = document.getElementById('navSearchInput');
    const navSearchResults = document.getElementById('navSearchResults');
    if (!navSearchBtn) return;

    function escapeHtml(text) {
        return (text || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    function closeNavSearch() {
        navSearchPanel.classList.add('hidden');
        navSearchBtn.setAttribute('aria-expanded', 'false');
    }

    navSearchBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const opening = navSearchPanel.classList.contains('hidden');
        navSearchPanel.classList.toggle('hidden', !opening);
        navSearchBtn.setAttribute('aria-expanded', String(opening));
        if (opening) navSearchInput.focus();
    });

    document.addEventListener('click', (e) => {
        if (!navSearchPanel.classList.contains('hidden') && !navSearchPanel.contains(e.target) && !navSearchBtn.contains(e.target)) {
            closeNavSearch();
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeNavSearch();
    });

    // Tekil bir sonuca (dropdown'daki 4 sonuçtan biri) tıklanınca hâlâ
    // doğrudan belgeye gidiyoruz; "Daha fazlası"/Enter ise artık tam
    // sonuç listesi sayfasına (search.html) yönlendiriyor.
    function goToDocument(query, docId) {
        const params = new URLSearchParams();
        if (query) params.set('search', query);
        params.set('open', docId);
        window.location.href = `documents.html?${params.toString()}`;
    }

    function goToSearchPage(query) {
        window.location.href = `search.html?q=${encodeURIComponent(query)}`;
    }

    // Sözlük sonuçları giriş yapmadan da çalışır (bkz. aşağıdaki input
    // handler) — belge araması gibi kimlik doğrulama gerektirmez.
    function renderDictSectionHtml(entries) {
        if (!entries.length) return '';
        const itemsHtml = entries.slice(0, 3).map(entry => `
            <a href="sozluk.html?q=${encodeURIComponent(entry.word)}" class="nav-search-result-item nav-search-dict-item">
                <span class="nav-search-result-thumb nav-search-dict-icon">❖</span>
                <span class="nav-search-result-title">
                    <strong>${escapeHtml(entry.word)}</strong>
                    <span class="nav-search-dict-def">${escapeHtml(entry.definition.length > 70 ? entry.definition.slice(0, 70) + '…' : entry.definition)}</span>
                </span>
            </a>
        `).join('');
        return `<div class="nav-search-section-label">Sözlük</div>${itemsHtml}`;
    }

    async function fetchDictResults(query) {
        try {
            const res = await fetch(`${API_BASE_URL}/api/dictionary/search?q=${encodeURIComponent(query)}&limit=3`);
            if (!res.ok) return [];
            const data = await res.json();
            return data.results || [];
        } catch (err) {
            return [];
        }
    }

    function renderDocsSectionHtml(docs, query) {
        if (!docs.length) {
            return `<p class="nav-search-empty">Eşleşen belge bulunamadı.</p>`;
        }
        const itemsHtml = docs.slice(0, 4).map(doc => `
            <button type="button" class="nav-search-result-item" data-doc-id="${doc.id}">
                <span class="nav-search-result-thumb">${doc.thumbnail_url ? `<img src="${doc.thumbnail_url}" alt="">` : '📄'}</span>
                <span class="nav-search-result-title">${escapeHtml(doc.title || doc.filename || '')}</span>
            </button>
        `).join('');
        return `<div class="nav-search-section-label">Belgelerim</div>${itemsHtml}<a href="#" class="nav-search-more" data-query="${escapeHtml(query)}">Daha fazlası →</a>`;
    }

    let navSearchTimer = null;
    let navSearchRequestId = 0;
    navSearchInput.addEventListener('input', () => {
        clearTimeout(navSearchTimer);
        const query = navSearchInput.value.trim();
        if (!query) {
            navSearchResults.innerHTML = '';
            return;
        }
        navSearchTimer = setTimeout(async () => {
            const requestId = ++navSearchRequestId;
            const dictEntries = await fetchDictResults(query);
            if (requestId !== navSearchRequestId) return;
            const dictHtml = renderDictSectionHtml(dictEntries);

            if (!authToken) {
                navSearchResults.innerHTML = dictHtml || `<p class="nav-search-empty">Eşleşen kelime bulunamadı. Belgelerinizde aramak için giriş yapmalısınız.</p>`;
                return;
            }
            try {
                const res = await fetch(`${API_BASE_URL}/api/documents?per_page=4&q=${encodeURIComponent(query)}`, {
                    headers: { 'Authorization': `Bearer ${authToken}` }
                });
                if (requestId !== navSearchRequestId) return;
                const docsHtml = res.ok ? renderDocsSectionHtml((await res.json()).documents || [], query) : '';
                navSearchResults.innerHTML = dictHtml + docsHtml;
            } catch (err) {
                navSearchResults.innerHTML = dictHtml;
            }
        }, 300);
    });

    navSearchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const query = navSearchInput.value.trim();
            if (query) goToSearchPage(query);
        }
    });

    navSearchResults.addEventListener('click', (e) => {
        const more = e.target.closest('.nav-search-more');
        if (more) {
            e.preventDefault();
            goToSearchPage(more.getAttribute('data-query'));
            return;
        }
        const item = e.target.closest('.nav-search-result-item[data-doc-id]');
        if (item) {
            goToDocument(navSearchInput.value.trim(), item.getAttribute('data-doc-id'));
        }
    });
})();

async function loadProfile() {
    if (!authToken) {
        requireLogin();
        return;
    }

    try {
        const res = await fetch(`${API_BASE_URL}/api/auth/me`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        if (res.status === 401) {
            requireLogin();
            return;
        }

        if (!res.ok) throw new Error('Profil bilgileri alınamadı.');

        currentProfile = await res.json();
        loginRequired.classList.add('hidden');
        profileView.classList.remove('hidden');
        fillFormFromProfile(currentProfile);
        renderProfileSummary(currentProfile);
        renderSidebarProfileCard(currentProfile);
    } catch (err) {
        loginRequired.classList.remove('hidden');
        loginRequired.querySelector('p').textContent = 'Profil bilgileri yüklenemedi: ' + err.message;
        profileView.classList.add('hidden');
    }
}

function showSaveMsg(text, type, el) {
    el = el || profileSaveMsg;
    el.textContent = text;
    el.className = 'profile-save-msg' + (type ? ' ' + type : '');
    if (text) {
        setTimeout(() => {
            if (el.textContent === text) el.textContent = '';
        }, 4000);
    }
}

profileCancelBtn.addEventListener('click', () => {
    if (currentProfile) fillFormFromProfile(currentProfile);
    showSaveMsg('', '');
});

profileForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!authToken) { requireLogin(); return; }

    profileSaveBtn.disabled = true;
    showSaveMsg('', '');

    try {
        const res = await fetch(`${API_BASE_URL}/api/profile`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                full_name: profileFullName.value,
                title: profileTitleInput.value,
                specialty: profileSpecialty.value,
                phone: profilePhone.value,
                bio: profileBio.value,
                institution: profileInstitution.value,
            }),
        });

        if (!res.ok) {
            const data = await res.json().catch(() => null);
            throw new Error((data && data.error) || 'Kaydedilemedi. Lütfen tekrar deneyin.');
        }

        const data = await res.json();
        currentProfile = data;
        renderProfileSummary(currentProfile);
        showSaveMsg('Değişiklikler kaydedildi.', 'success');
    } catch (err) {
        showSaveMsg(err.message, 'error');
    } finally {
        profileSaveBtn.disabled = false;
    }
});

avatarEditBtn.addEventListener('click', () => avatarFileInput.click());

avatarFileInput.addEventListener('change', async () => {
    const file = avatarFileInput.files[0];
    if (!file || !authToken) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
        const res = await fetch(`${API_BASE_URL}/api/profile/avatar`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${authToken}` },
            body: formData,
        });

        if (!res.ok) {
            const data = await res.json().catch(() => null);
            throw new Error((data && data.error) || 'Fotoğraf yüklenemedi. Lütfen tekrar deneyin.');
        }

        const data = await res.json();
        if (currentProfile) currentProfile.avatar_url = data.avatar_url;
        profileAvatarImg.src = data.avatar_url || 'assets/icon.png';
    } catch (err) {
        alert('Fotoğraf yüklenemedi: ' + err.message);
    } finally {
        avatarFileInput.value = '';
    }
});

// --- Şifre Değiştirme ---
const passwordForm = document.getElementById('passwordForm');
const currentPasswordInput = document.getElementById('currentPassword');
const newPasswordInput = document.getElementById('newPassword');
const newPasswordConfirmInput = document.getElementById('newPasswordConfirm');
const passwordSaveBtn = document.getElementById('passwordSaveBtn');
const passwordSaveMsg = document.getElementById('passwordSaveMsg');

passwordForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!authToken) { requireLogin(); return; }

    if (newPasswordInput.value !== newPasswordConfirmInput.value) {
        showSaveMsg('Yeni şifreler eşleşmiyor.', 'error', passwordSaveMsg);
        return;
    }

    passwordSaveBtn.disabled = true;
    showSaveMsg('', '', passwordSaveMsg);

    try {
        const res = await fetch(`${API_BASE_URL}/api/auth/password`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                current_password: currentPasswordInput.value,
                new_password: newPasswordInput.value,
            }),
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) throw new Error(data.error || 'Şifre değiştirilemedi.');

        passwordForm.reset();
        showSaveMsg('Şifreniz güncellendi.', 'success', passwordSaveMsg);
    } catch (err) {
        showSaveMsg(err.message, 'error', passwordSaveMsg);
    } finally {
        passwordSaveBtn.disabled = false;
    }
});

// --- Sol menüdeki sekmeler (yalnızca "Kişisel Bilgiler" ve "Şifre ve
// Güvenlik" şu an işlevsel; diğerleri "yakında" içerikli birer yer
// tutucu). ---
const profileNavItems = document.querySelectorAll('.profile-nav-item');
const profilePanels = {
    personalInfoPanel: document.getElementById('personalInfoPanel'),
    securityPanel: document.getElementById('securityPanel'),
    preferencesPanel: document.getElementById('preferencesPanel'),
    subscriptionPanel: document.getElementById('subscriptionPanel'),
};

profileNavItems.forEach(item => {
    item.addEventListener('click', () => {
        profileNavItems.forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        const targetId = item.dataset.panel;
        Object.entries(profilePanels).forEach(([id, panel]) => {
            panel.classList.toggle('hidden', id !== targetId);
        });
    });
});

loadProfile();
