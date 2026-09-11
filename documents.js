// Belgelerim — bağımsız pencere/sekme.
// Ana sayfadaki (index.html/app.js) "Belgelerim" modalıyla aynı backend
// uçlarını (GET/PUT /api/documents, POST /api/documents/<id>/analyze)
// kullanır. Giriş bilgisi localStorage'daki 'auth_token' üzerinden aynı
// origin'de paylaşıldığı için ayrıca giriş yapmaya gerek yoktur.

const API_BASE_URL = 'https://ottoman-text-ai.onrender.com';

let authToken = localStorage.getItem('auth_token');
let docsCache = {};

const loginRequired = document.getElementById('loginRequired');
const listView = document.getElementById('listView');
const documentsList = document.getElementById('documentsList');
const detailView = document.getElementById('detailView');
const detailContent = document.getElementById('detailContent');
const backToListBtn = document.getElementById('backToListBtn');

function escapeHtml(text) {
    return (text || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function requireLogin() {
    localStorage.removeItem('auth_token');
    authToken = null;
    loginRequired.classList.remove('hidden');
    listView.classList.add('hidden');
    detailView.classList.add('hidden');
}

async function loadDocuments() {
    if (!authToken) {
        requireLogin();
        return;
    }

    documentsList.innerHTML = '<p>Yükleniyor...</p>';

    try {
        const res = await fetch(`${API_BASE_URL}/api/documents`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        if (res.status === 401) {
            requireLogin();
            return;
        }

        if (!res.ok) throw new Error('Belgeler alınamadı.');

        const data = await res.json();
        const docs = data.documents || [];

        if (docs.length === 0) {
            documentsList.innerHTML = '<p style="color: var(--color-text-muted);">Henüz kaydedilmiş bir belge bulunmuyor. Ana sayfada bir çeviri yapıp kaydettiğinizde burada listelenecektir.</p>';
            return;
        }

        docsCache = {};
        docs.forEach(doc => { docsCache[doc.id] = doc; });

        documentsList.style.display = 'grid';
        documentsList.style.gridTemplateColumns = 'repeat(auto-fill, minmax(150px, 1fr))';
        documentsList.style.gap = '1.4rem';

        documentsList.innerHTML = docs.map(doc => `
            <div class="doc-card" data-doc-id="${doc.id}" style="cursor:pointer;" title="${escapeHtml(doc.summary || doc.filename)}">
                <div style="width:100%; aspect-ratio:3/4; border-radius:var(--radius-sm); overflow:hidden; background:var(--bg-input); border:1px solid var(--color-border); display:flex; align-items:center; justify-content:center;">
                    ${doc.thumbnail_url
                        ? `<img src="${doc.thumbnail_url}" alt="${escapeHtml(doc.filename)}" style="width:100%; height:100%; object-fit:cover;">`
                        : `<span style="font-size:2.6rem;">📄</span>`}
                </div>
                <div style="font-size:0.82rem; font-weight:600; margin-top:0.5rem; text-align:center; word-break:break-word;">${escapeHtml(doc.title || doc.filename)}</div>
                <div style="font-size:0.7rem; color:var(--color-text-muted); text-align:center; margin-top:0.15rem;">${new Date(doc.uploaded_at).toLocaleDateString('tr-TR')}</div>
                <div style="display:flex; justify-content:center; gap:0.3rem; margin-top:0.4rem;">
                    <button type="button" class="tool-btn doc-rename-btn" data-doc-id="${doc.id}" data-doc-name="${escapeHtml(doc.filename)}" title="Adını değiştir" style="width:24px; height:24px; font-size:0.72rem;">✏️</button>
                    <button type="button" class="tool-btn doc-replace-btn" data-doc-id="${doc.id}" title="Görseli değiştir" style="width:24px; height:24px; font-size:0.72rem;">🖼️</button>
                </div>
            </div>
        `).join('');
    } catch (err) {
        documentsList.innerHTML = `<p>Belgeler yüklenemedi: ${escapeHtml(err.message)}</p>`;
    }
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

function _renderDocDetailInfoCard(data) {
    const rows = [
        ['📋', 'Belge Türü', data.document_type],
        ['🧭', 'Belgenin Amacı', data.script_purpose],
        ['✍️', 'Yazı Türü', data.script_type],
        ['🕰️', 'Tahmini Dönem', data.period_estimate],
        ['🌐', 'Dil / Üslup', data.style],
        ['🗓️', 'Tarih (Hicrî)', data.date_hijri],
        ['☀️', 'Tarih (Miladi)', data.date_gregorian],
    ].filter(([, , value]) => value);

    const hasConfidence = data.confidence !== undefined && data.confidence !== null;

    if (rows.length === 0 && !hasConfidence) return '';

    return `
        <div class="doc-detail-info-card">
            <div class="doc-detail-info-title">Belge Bilgileri</div>
            ${rows.map(([icon, label, value]) => `
                <div class="doc-detail-info-row">
                    <span class="doc-detail-info-label">${icon} ${escapeHtml(label)}</span>
                    <span class="doc-detail-info-value">${escapeHtml(value)}</span>
                </div>
            `).join('')}
            ${hasConfidence ? `
                <div style="margin-top:0.5rem;">
                    <div class="doc-detail-info-row" style="border-bottom:none; padding-bottom:0.15rem;">
                        <span class="doc-detail-info-label">🎯 Güven Skoru</span>
                        <span class="doc-detail-info-value">%${escapeHtml(String(data.confidence))}</span>
                    </div>
                    <div class="doc-detail-confidence-bar">
                        <div class="doc-detail-confidence-fill" style="width:${Math.max(0, Math.min(100, data.confidence))}%;"></div>
                    </div>
                </div>
            ` : ''}
        </div>
    `;
}

function _renderDocDetailTagList(items) {
    if (!items || items.length === 0) {
        return `<p class="doc-detail-empty">Bu belge için bilgi bulunamadı.</p>`;
    }
    return `<div class="doc-detail-tag-list">${items.map(item => `<span class="doc-detail-tag">${escapeHtml(item)}</span>`).join('')}</div>`;
}

function _renderDocDetailTabs(data) {
    const tabs = [
        { id: 'ceviri', label: 'Çeviri' },
        { id: 'ozet', label: 'Özet' },
        { id: 'kisiler', label: 'Kişiler' },
        { id: 'yerler', label: 'Yerler' },
        { id: 'kavramlar', label: 'Kavramlar' },
        { id: 'notlar', label: 'Notlar' },
    ];

    const panes = {
        ceviri: `
            <div class="doc-detail-card">
                <h3>Osmanlıca Metin</h3>
                <div class="text-display" dir="rtl" lang="ota">${escapeHtml(data.ocr)}</div>
            </div>
            <div class="doc-detail-card">
                <h3>Türkçe Çeviri</h3>
                <div class="text-display">${escapeHtml(data.trans)}</div>
            </div>
            ${data.trans_en ? `
                <div class="doc-detail-card">
                    <h3>İngilizce Çeviri</h3>
                    <div class="text-display">${escapeHtml(data.trans_en)}</div>
                </div>
            ` : ''}
        `,
        ozet: data.summary
            ? `<div class="doc-detail-card"><div class="text-display">${escapeHtml(data.summary)}</div></div>`
            : `<p class="doc-detail-empty">Bu belge için özet bulunamadı.</p>`,
        kisiler: _renderDocDetailTagList(data.people),
        yerler: _renderDocDetailTagList(data.places),
        kavramlar: _renderDocDetailTagList(data.concepts),
        notlar: data.notes
            ? `<div class="doc-detail-card"><div class="text-display">${escapeHtml(data.notes)}</div></div>`
            : `<p class="doc-detail-empty">Bu belge için not bulunamadı.</p>`,
    };

    const hasConfidence = data.confidence !== undefined && data.confidence !== null;

    return `
        <div class="doc-detail-tabs">
            <div class="doc-detail-tab-list">
                ${tabs.map((tab, i) => `<button type="button" class="doc-detail-tab-btn${i === 0 ? ' active' : ''}" data-tab="${tab.id}">${escapeHtml(tab.label)}</button>`).join('')}
            </div>
            ${hasConfidence ? `<span class="doc-detail-confidence-badge">Güven Skoru %${escapeHtml(String(data.confidence))}</span>` : ''}
        </div>
        ${tabs.map((tab, i) => `<div class="doc-detail-tab-pane${i === 0 ? '' : ' hidden'}" data-tab-pane="${tab.id}">${panes[tab.id]}</div>`).join('')}
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

        detailContent.innerHTML = `
            <div class="doc-detail-grid">
                ${_renderDocDetailImageCol(doc, _renderDocDetailInfoCard(data))}
                <div>${_renderDocDetailTabs(data)}</div>
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

    const item = e.target.closest('[data-doc-id]');
    if (item) {
        showDocumentDetail(item.getAttribute('data-doc-id'));
    }
});

detailContent.addEventListener('click', (e) => {
    const tabBtn = e.target.closest('.doc-detail-tab-btn');
    if (!tabBtn) return;

    const tabId = tabBtn.getAttribute('data-tab');
    const tabsContainer = tabBtn.closest('.doc-detail-tabs');
    if (tabsContainer) {
        tabsContainer.querySelectorAll('.doc-detail-tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn === tabBtn);
        });
    }

    detailContent.querySelectorAll('[data-tab-pane]').forEach(pane => {
        pane.classList.toggle('hidden', pane.getAttribute('data-tab-pane') !== tabId);
    });
});

backToListBtn.addEventListener('click', () => {
    detailView.classList.add('hidden');
    listView.classList.remove('hidden');
    loadDocuments();
});

loadDocuments();
