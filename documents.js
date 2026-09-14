// Belgelerim — bağımsız pencere/sekme.
// Ana sayfadaki (index.html/app.js) "Belgelerim" modalıyla aynı backend
// uçlarını (GET/PUT /api/documents, POST /api/documents/<id>/analyze)
// kullanır. Giriş bilgisi localStorage'daki 'auth_token' üzerinden aynı
// origin'de paylaşıldığı için ayrıca giriş yapmaya gerek yoktur.

const API_BASE_URL = 'https://ottoman-text-ai.onrender.com';

let authToken = localStorage.getItem('auth_token');
let docsCache = {};
let currentDetailDoc = null;
let currentDetailData = null;

const loginRequired = document.getElementById('loginRequired');
const listView = document.getElementById('listView');
const documentsList = document.getElementById('documentsList');
const detailView = document.getElementById('detailView');
const detailContent = document.getElementById('detailContent');
const backToListBtn = document.getElementById('backToListBtn');
const docsCountBadge = document.getElementById('docsCountBadge');
const docSearchInput = document.getElementById('docSearchInput');
const docSortSelect = document.getElementById('docSortSelect');

// Üst navbar'daki tema anahtarı ve sol menü çekmecesi — index.html/app.js
// ile birebir aynı davranış (aynı 'theme' localStorage anahtarı paylaşılır,
// bkz. app.js), sayfalar arasında tutarlı bir deneyim için.
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

// İlk ziyarette hamburger'ın üzerinde küçük bir nabız noktası gösterip
// menüyü fark ettiriyor; çekmece bir kere açılınca kalıcı olarak kayboluyor
// (localStorage'da işaretlenir, index.html ile de paylaşılır).
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

// Supabase'in imzalı linkleri farklı bir origin'den geldiği için tarayıcı
// <a download> özniteliğini yok sayıp linki sadece yeni sekmede açıyordu.
// Dosyayı burada kendimiz indirip (blob) yerel bir link üzerinden
// indirmeyi tetikleyerek gerçek bir "bilgisayara kaydet" davranışı elde
// ediyoruz.
async function downloadFile(url, filename) {
    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error('Dosya indirilemedi.');
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = filename || 'belge';
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(blobUrl);
    } catch (err) {
        alert('Dosya indirilemedi: ' + err.message);
    }
}

function requireLogin() {
    localStorage.removeItem('auth_token');
    authToken = null;
    loginRequired.classList.remove('hidden');
    listView.classList.add('hidden');
    detailView.classList.add('hidden');
}

let allDocs = [];

function renderDocumentsList() {
    const query = (docSearchInput.value || '').trim().toLowerCase();
    const sortOrder = docSortSelect.value;

    let docs = allDocs.filter(doc => {
        if (!query) return true;
        const haystack = `${doc.title || ''} ${doc.filename || ''}`.toLowerCase();
        return haystack.includes(query);
    });

    docs = docs.slice().sort((a, b) => {
        const diff = new Date(a.uploaded_at) - new Date(b.uploaded_at);
        return sortOrder === 'date-asc' ? diff : -diff;
    });

    if (docs.length === 0) {
        documentsList.innerHTML = `<p style="color: var(--color-text-muted);">${query ? 'Aramanızla eşleşen bir belge bulunamadı.' : 'Henüz kaydedilmiş bir belge bulunmuyor. Ana sayfada bir çeviri yapıp kaydettiğinizde burada listelenecektir.'}</p>`;
        return;
    }

    documentsList.style.display = 'grid';
    documentsList.style.gridTemplateColumns = 'repeat(auto-fill, minmax(150px, 1fr))';
    documentsList.style.gap = '1.4rem';

    documentsList.innerHTML = docs.map(doc => `
        <div class="doc-card" data-doc-id="${doc.id}" title="${escapeHtml(doc.summary || doc.filename)}">
            <div class="doc-card-thumb-wrap" style="position:relative; width:100%; aspect-ratio:3/4; border-radius:var(--radius-sm); overflow:hidden; background:var(--bg-input); border:1px solid var(--color-border); display:flex; align-items:center; justify-content:center;">
                ${doc.document_type ? `<span class="doc-card-type-badge">${escapeHtml(doc.document_type)}</span>` : ''}
                ${doc.thumbnail_url
                    ? `<img src="${doc.thumbnail_url}" alt="${escapeHtml(doc.filename)}" style="width:100%; height:100%; object-fit:cover;">`
                    : `<span style="font-size:2.6rem;">📄</span>`}
            </div>
            <div style="font-size:0.82rem; font-weight:600; margin-top:0.5rem; text-align:center; word-break:break-word; color:#3A2E1D;">${escapeHtml(doc.title || doc.filename)}</div>
            <div style="font-size:0.7rem; color:#8A7148; text-align:center; margin-top:0.15rem;">${new Date(doc.uploaded_at).toLocaleDateString('tr-TR')}</div>
            <div style="display:flex; justify-content:center; gap:0.3rem; margin-top:0.4rem;">
                <button type="button" class="tool-btn doc-view-btn" data-doc-id="${doc.id}" title="Görüntüle" style="width:24px; height:24px; font-size:0.72rem;">👁️</button>
                <button type="button" class="tool-btn doc-rename-btn" data-doc-id="${doc.id}" data-doc-name="${escapeHtml(doc.filename)}" title="Adını değiştir" style="width:24px; height:24px; font-size:0.72rem;">✏️</button>
                <button type="button" class="tool-btn doc-download-btn" data-doc-id="${doc.id}" title="İndir" style="width:24px; height:24px; font-size:0.72rem;" ${doc.download_url ? '' : 'disabled'}>⬇️</button>
                <button type="button" class="tool-btn doc-delete-btn" data-doc-id="${doc.id}" data-doc-name="${escapeHtml(doc.title || doc.filename)}" title="Sil" style="width:24px; height:24px; font-size:0.72rem;">🗑️</button>
            </div>
        </div>
    `).join('');
}

async function loadDocuments() {
    if (!authToken) {
        requireLogin();
        return;
    }

    documentsList.innerHTML = '<p>Yükleniyor...</p>';

    try {
        const res = await fetch(`${API_BASE_URL}/api/documents?per_page=100`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        if (res.status === 401) {
            requireLogin();
            return;
        }

        if (!res.ok) throw new Error('Belgeler alınamadı.');

        const data = await res.json();
        allDocs = data.documents || [];

        docsCache = {};
        allDocs.forEach(doc => { docsCache[doc.id] = doc; });

        docsCountBadge.textContent = `${data.total_documents ?? allDocs.length} Belge`;
        docsCountBadge.classList.toggle('hidden', allDocs.length === 0);

        renderDocumentsList();
    } catch (err) {
        documentsList.innerHTML = `<p>Belgeler yüklenemedi: ${escapeHtml(err.message)}</p>`;
    }
}

function _renderDocDetailSaveButton() {
    return `<button type="button" class="btn btn-outline doc-detail-save-btn" style="width:100%; margin-top:0.8rem; font-size:0.82rem; padding:0.55rem;">💾 Kaydet</button>`;
}

function _buildDocDetailTextExport(doc, data) {
    const lines = [];
    lines.push(doc.title || doc.filename);
    lines.push(new Date(doc.uploaded_at).toLocaleString('tr-TR'));
    lines.push('');

    const infoRows = [
        ['Belge Türü', data.document_type],
        ['Tahmini Dönem', data.period_estimate],
        ['Dil / Üslup', data.style],
        ['Tarih (Hicrî)', data.date_hijri],
        ['Tarih (Miladi)', data.date_gregorian],
    ].filter(([, value]) => value);
    infoRows.forEach(([label, value]) => lines.push(`${label}: ${value}`));
    if (data.confidence !== undefined && data.confidence !== null) lines.push(`Güven Skoru: %${data.confidence}`);
    lines.push('');

    if (data.summary) {
        lines.push('KISA ÖZET');
        lines.push(data.summary);
        lines.push('');
    }

    lines.push('OSMANLICA METİN');
    lines.push(data.ocr || '');
    lines.push('');
    lines.push('TÜRKÇE ÇEVİRİ');
    lines.push(data.trans_modern || data.trans || '');
    lines.push('');

    if (data.trans_en) {
        lines.push('İNGİLİZCE ÇEVİRİ');
        lines.push(data.trans_en);
        lines.push('');
    }
    if (data.people && data.people.length) lines.push('KİŞİLER: ' + data.people.join(', '));
    if (data.places && data.places.length) lines.push('YERLER: ' + data.places.join(', '));
    if (data.concepts && data.concepts.length) lines.push('KAVRAMLAR: ' + data.concepts.join(', '));
    if (data.key_points && data.key_points.length) {
        lines.push('');
        lines.push('ÖNEMLİ BİLGİLER');
        data.key_points.forEach(point => lines.push('- ' + point));
    }
    if (data.notes) {
        lines.push('');
        lines.push('NOTLAR');
        lines.push(data.notes);
    }

    return lines.join('\n');
}

function _renderDocDetailImageCol(doc, extraHtml) {
    return `
        <div class="doc-detail-image-col">
            <div class="doc-detail-image-frame">
                ${doc && doc.thumbnail_url
                    ? `<img src="${doc.thumbnail_url}" alt="${escapeHtml(doc.filename)}">`
                    : `<span style="font-size:4rem;">📄</span>`}
            </div>
            ${doc ? `
                <div style="margin-top:0.7rem; font-weight:600; text-align:center; word-break:break-word;">${escapeHtml(doc.title || doc.filename)}</div>
                <div style="font-size:0.78rem; color:var(--color-text-muted); text-align:center; margin-top:0.2rem;">${new Date(doc.uploaded_at).toLocaleString('tr-TR')}</div>
            ` : ''}
            ${extraHtml || ''}
        </div>
    `;
}

function _renderDocDetailTagList(items) {
    if (!items || items.length === 0) {
        return `<p class="doc-detail-empty">Tespit edilemedi.</p>`;
    }
    return `<div class="doc-detail-tag-list">${items.map(item => `<span class="doc-detail-tag">${escapeHtml(item)}</span>`).join('')}</div>`;
}

function _renderDocDetailTranslationRow(data) {
    return `
        <div class="doc-trans-row">
            <div class="doc-detail-card">
                <h3>Osmanlıca Metin</h3>
                <div class="text-display" dir="rtl" lang="ota">${escapeHtml(data.ocr)}</div>
            </div>
            <div class="doc-detail-card">
                <h3>Türkçe Çeviri</h3>
                <div class="text-display">${escapeHtml(data.trans_modern || data.trans)}</div>
            </div>
            <div class="doc-detail-card">
                <h3>İngilizce Çeviri</h3>
                <div class="text-display">${data.trans_en ? escapeHtml(data.trans_en) : ''}</div>
            </div>
        </div>
    `;
}

function _renderDocDetailAnalysisCard(data) {
    const hasConfidence = data.confidence !== undefined && data.confidence !== null;

    const miniBoxes = [
        ['Belge Türü', data.document_type],
        ['Tahmini Dönem', data.period_estimate],
    ].filter(([, value]) => value);

    return `
        <div class="doc-analysis-card">
            <div class="doc-analysis-header">
                <span class="doc-analysis-title">📋 Bilgi (Belge Analizi)</span>
                ${data.document_type ? `<span class="doc-detail-tag">${escapeHtml(data.document_type)}</span>` : ''}
                ${hasConfidence ? `<span class="doc-detail-confidence-badge">Güven Skoru %${escapeHtml(String(data.confidence))}</span>` : ''}
            </div>
            <div class="doc-analysis-grid">
                <div class="doc-analysis-col">
                    <h4>Kısa Özet</h4>
                    <p>${data.summary ? escapeHtml(data.summary) : ''}</p>
                    <h4>Belge Bilgileri</h4>
                    <div class="doc-analysis-mini-grid">
                        ${miniBoxes.map(([label, value]) => `
                            <div class="doc-analysis-mini-box">
                                <div class="doc-analysis-mini-label">${escapeHtml(label)}</div>
                                <div class="doc-analysis-mini-value">${escapeHtml(value)}</div>
                            </div>
                        `).join('')}
                    </div>
                    ${data.style ? `
                        <div class="doc-analysis-mini-grid" style="margin-top:0.6rem;">
                            <div class="doc-analysis-mini-box full">
                                <div class="doc-analysis-mini-label">Dil / Üslup</div>
                                <div class="doc-analysis-mini-value">${escapeHtml(data.style)}</div>
                            </div>
                        </div>
                    ` : ''}
                </div>
                <div class="doc-analysis-col">
                    <h4>Önemli Bilgiler</h4>
                    ${(data.key_points && data.key_points.length)
                        ? `<ul>${data.key_points.map(point => `<li>${escapeHtml(point)}</li>`).join('')}</ul>`
                        : `<p class="doc-detail-empty">Tespit edilemedi.</p>`}
                    <h4>👤 Kişiler</h4>
                    ${_renderDocDetailTagList(data.people)}
                    <h4>📍 Yerler</h4>
                    ${_renderDocDetailTagList(data.places)}
                    <h4>💡 Kavramlar</h4>
                    ${_renderDocDetailTagList(data.concepts)}
                </div>
                <div class="doc-analysis-col">
                    <h4>✍️ Yazı &amp; Dil</h4>
                    <div class="doc-analysis-mini-grid" style="grid-template-columns: 1fr;">
                        ${data.script_type ? `
                            <div class="doc-analysis-mini-box">
                                <div class="doc-analysis-mini-label">Yazı Tipi (Hat)</div>
                                <div class="doc-analysis-mini-value">${escapeHtml(data.script_type)}</div>
                            </div>
                        ` : ''}
                        ${data.script_purpose ? `
                            <div class="doc-analysis-mini-box">
                                <div class="doc-analysis-mini-label">Yazının Amacı</div>
                                <div class="doc-analysis-mini-value">${escapeHtml(data.script_purpose)}</div>
                            </div>
                        ` : ''}
                    </div>
                    <h4>🗓️ Tarih &amp; Bağlam</h4>
                    <div class="doc-analysis-mini-grid" style="grid-template-columns: 1fr;">
                        ${data.period_estimate ? `
                            <div class="doc-analysis-mini-box">
                                <div class="doc-analysis-mini-label">Tahmini Dönem</div>
                                <div class="doc-analysis-mini-value">${escapeHtml(data.period_estimate)}</div>
                            </div>
                        ` : ''}
                        ${data.date_hijri ? `
                            <div class="doc-analysis-mini-box">
                                <div class="doc-analysis-mini-label">Tarih (Hicrî)</div>
                                <div class="doc-analysis-mini-value">${escapeHtml(data.date_hijri)}</div>
                            </div>
                        ` : ''}
                        ${data.date_gregorian ? `
                            <div class="doc-analysis-mini-box">
                                <div class="doc-analysis-mini-label">Tarih (Miladi)</div>
                                <div class="doc-analysis-mini-value">${escapeHtml(data.date_gregorian)}</div>
                            </div>
                        ` : ''}
                    </div>
                </div>
            </div>
            ${data.notes ? `
                <div class="doc-analysis-notes">
                    <span>📌</span>
                    <span><strong>Notlar &amp; Sistem Notları:</strong> ${escapeHtml(data.notes)}</span>
                </div>
            ` : ''}
        </div>
    `;
}

async function showDocumentDetail(docId) {
    listView.classList.add('hidden');
    detailView.classList.remove('hidden');

    const doc = docsCache[docId];

    detailContent.innerHTML = `
        <div class="doc-detail-grid">
            ${_renderDocDetailImageCol(doc)}
            <div><p>Yükleniyor...</p></div>
        </div>
    `;

    try {
        const res = await fetch(`${API_BASE_URL}/api/documents/${docId}/analyze`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        const data = await res.json().catch(() => ({}));

        if (res.status === 401) {
            requireLogin();
            return;
        }

        if (!res.ok) {
            detailContent.innerHTML = `
                <div class="doc-detail-grid">
                    ${_renderDocDetailImageCol(doc)}
                    <div><p>${escapeHtml(data.error || 'Belge yüklenemedi.')}</p></div>
                </div>
            `;
            return;
        }

        currentDetailDoc = doc;
        currentDetailData = data;

        detailContent.innerHTML = `
            <div class="doc-detail-grid">
                ${_renderDocDetailImageCol(doc, _renderDocDetailSaveButton())}
                <div>
                    ${_renderDocDetailTranslationRow(data)}
                    ${_renderDocDetailAnalysisCard(data)}
                </div>
            </div>
        `;
    } catch (err) {
        detailContent.innerHTML = `
            <div class="doc-detail-grid">
                ${_renderDocDetailImageCol(doc)}
                <div><p>Belge yüklenemedi: ${escapeHtml(err.message)}</p></div>
            </div>
        `;
    }
}

detailContent.addEventListener('click', async (e) => {
    const saveBtn = e.target.closest('.doc-detail-save-btn');
    if (!saveBtn || !currentDetailDoc || !currentDetailData) return;

    if (currentDetailDoc.thumbnail_url) {
        await downloadFile(currentDetailDoc.thumbnail_url, currentDetailDoc.filename);
    }

    const textContent = _buildDocDetailTextExport(currentDetailDoc, currentDetailData);
    const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8' });
    const blobUrl = URL.createObjectURL(blob);
    const baseName = (currentDetailDoc.title || currentDetailDoc.filename || 'belge').replace(/[\\/:*?"<>|]/g, '_');
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = `${baseName}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(blobUrl);
});

const replaceFileInput = document.createElement('input');
replaceFileInput.type = 'file';
replaceFileInput.accept = 'image/*';
replaceFileInput.style.display = 'none';
document.body.appendChild(replaceFileInput);
let replaceTargetId = null;

replaceFileInput.addEventListener('change', async () => {
    const file = replaceFileInput.files && replaceFileInput.files[0];
    const targetId = replaceTargetId;
    replaceFileInput.value = '';
    replaceTargetId = null;
    if (!file || !targetId) return;

    try {
        const formData = new FormData();
        formData.append('file', file);
        const res = await fetch(`${API_BASE_URL}/api/documents/${targetId}`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${authToken}` },
            body: formData
        });
        const data = await res.json().catch(() => ({}));

        if (res.status === 401) {
            requireLogin();
            return;
        }
        if (!res.ok) {
            alert(data.error || 'Görsel değiştirilemedi.');
            return;
        }
        loadDocuments();
    } catch (err) {
        alert(err.message);
    }
});

documentsList.addEventListener('click', async (e) => {
    const renameBtn = e.target.closest('.doc-rename-btn');
    if (renameBtn) {
        const docId = renameBtn.getAttribute('data-doc-id');
        const currentName = renameBtn.getAttribute('data-doc-name');
        const newName = prompt('Belgenin yeni adı:', currentName);
        if (!newName || !newName.trim() || newName.trim() === currentName) return;

        try {
            const formData = new FormData();
            formData.append('filename', newName.trim());
            const res = await fetch(`${API_BASE_URL}/api/documents/${docId}`, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${authToken}` },
                body: formData
            });
            const data = await res.json().catch(() => ({}));

            if (res.status === 401) {
                requireLogin();
                return;
            }
            if (!res.ok) {
                alert(data.error || 'Ad değiştirilemedi.');
                return;
            }
            loadDocuments();
        } catch (err) {
            alert(err.message);
        }
        return;
    }

    const replaceBtn = e.target.closest('.doc-replace-btn');
    if (replaceBtn) {
        replaceTargetId = replaceBtn.getAttribute('data-doc-id');
        replaceFileInput.click();
        return;
    }

    const downloadBtn = e.target.closest('.doc-download-btn');
    if (downloadBtn) {
        const doc = docsCache[downloadBtn.getAttribute('data-doc-id')];
        if (doc && doc.download_url) {
            downloadFile(doc.download_url, doc.filename);
        }
        return;
    }

    const deleteBtn = e.target.closest('.doc-delete-btn');
    if (deleteBtn) {
        const docId = deleteBtn.getAttribute('data-doc-id');
        const docName = deleteBtn.getAttribute('data-doc-name');
        if (!confirm(`"${docName}" belgesini silmek istediğinize emin misiniz? Bu işlem geri alınamaz.`)) return;

        try {
            const res = await fetch(`${API_BASE_URL}/api/documents/${docId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${authToken}` }
            });

            if (res.status === 401) {
                requireLogin();
                return;
            }
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                alert(data.error || 'Belge silinemedi.');
                return;
            }
            loadDocuments();
        } catch (err) {
            alert(err.message);
        }
        return;
    }

    const item = e.target.closest('[data-doc-id]');
    if (item) {
        showDocumentDetail(item.getAttribute('data-doc-id'));
    }
});

docSearchInput.addEventListener('input', renderDocumentsList);
docSortSelect.addEventListener('change', renderDocumentsList);

backToListBtn.addEventListener('click', () => {
    detailView.classList.add('hidden');
    listView.classList.remove('hidden');
    loadDocuments();
});

loadDocuments();
