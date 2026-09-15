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

// Kayıt formunda alınan ad soyad, backend'de henüz bir sütunu olmadığı için
// (bkz. proje notları — DB migrasyonu bekleniyor) index.html/app.js
// tarafından sadece localStorage'a yazılıyor. Backend bir full_name
// döndürene kadar buradan, sadece aynı hesaba (e-posta eşleşmesi) aitse
// okunuyor.
function localFullNameFallback(email) {
    if (localStorage.getItem('auth_full_name_email') !== email) return '';
    return localStorage.getItem('auth_full_name') || '';
}

function fillFormFromProfile(profile) {
    profileFullName.value = profile.full_name || localFullNameFallback(profile.email) || '';
    profileTitleInput.value = profile.title || '';
    profileEmail.value = profile.email || '';
    profileSpecialty.value = profile.specialty || '';
    profilePhone.value = profile.phone || '';
    profileBio.value = profile.bio || '';
    profileInstitution.value = profile.institution || '';
}

function renderProfileSummary(profile) {
    profileSummaryName.textContent = profile.full_name || localFullNameFallback(profile.email) || profile.email || '—';
    profileSummaryTitle.textContent = profile.title || '';
    profileAvatarImg.src = profile.avatar_url || 'assets/icon.png';
}

function requireLogin() {
    authToken = null;
    loginRequired.classList.remove('hidden');
    profileView.classList.add('hidden');
}

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
    } catch (err) {
        loginRequired.classList.remove('hidden');
        loginRequired.querySelector('p').textContent = 'Profil bilgileri yüklenemedi: ' + err.message;
        profileView.classList.add('hidden');
    }
}

function showSaveMsg(text, type) {
    profileSaveMsg.textContent = text;
    profileSaveMsg.className = 'profile-save-msg' + (type ? ' ' + type : '');
    if (text) {
        setTimeout(() => {
            if (profileSaveMsg.textContent === text) profileSaveMsg.textContent = '';
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

        // Yeni profil alanları veritabanına henüz eklenmediyse (bkz. proje
        // notu) backend bu uçta 404 döner ve gövde JSON olmaz — bunu ayırt
        // edip anlamlı bir mesaj göstermek için res.json() öncesi res.ok
        // kontrol ediliyor.
        if (!res.ok) {
            const data = await res.json().catch(() => null);
            throw new Error((data && data.error) || 'Kaydedilemedi (bu özellik henüz sunucuda etkin değil).');
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
            throw new Error((data && data.error) || 'Fotoğraf yüklenemedi (bu özellik henüz sunucuda etkin değil).');
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

// --- Sol menüdeki sekmeler (yalnızca "Kişisel Bilgiler" şu an işlevsel;
// diğerleri "yakında" içerikli birer yer tutucu). ---
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
