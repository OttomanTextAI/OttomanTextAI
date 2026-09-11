// Belgelerim — bağımsız pencere/sekme.
// Ana sayfadaki (index.html/app.js) "Belgelerim" modalıyla aynı backend
// uçlarını (GET/PUT /api/documents, POST /api/documents/<id>/analyze)
// kullanır. Giriş bilgisi localStorage'daki 'auth_token' üzerinden aynı
// origin'de paylaşıldığı için ayrıca giriş yapmaya gerek yoktur.

const API_BASE_URL = 'https://ottoman-text-ai.onrender.com';

let authToken = localStorage.getItem('auth_token');

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

        documentsList.innerHTML = docs.map(doc => `
            <div class="history-item" data-doc-id="${doc.id}" style="border-bottom:1px solid var(--color-border); padding:0.8rem 0; cursor:pointer;">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:0.6rem;">
                    <span style="font-weight:bold; font-size:0.9rem;">📜 ${escapeHtml(doc.filename)}</span>
                    <div style="display:flex; align-items:center; gap:0.4rem; flex-shrink:0;">
                        <span style="font-size:0.75rem; color:var(--color-text-muted); white-space:nowrap;">${new Date(doc.uploaded_at).toLocaleString('tr-TR')}</span>
                        <button type="button" class="tool-btn doc-rename-btn" data-doc-id="${doc.id}" data-doc-name="${escapeHtml(doc.filename)}" title="Adını değiştir" style="width:26px; height:26px; font-size:0.8rem;">✏️</button>
                        <button type="button" class="tool-btn doc-replace-btn" data-doc-id="${doc.id}" title="Görseli değiştir" style="width:26px; height:26px; font-size:0.8rem;">🖼️</button>
                    </div>
                </div>
                ${doc.summary ? `<p style="font-size:0.82rem; color:var(--color-text-muted); margin-top:0.35rem;">${escapeHtml(doc.summary)}</p>` : ''}
            </div>
        `).join('');
    } catch (err) {
        documentsList.innerHTML = `<p>Belgeler yüklenemedi: ${escapeHtml(err.message)}</p>`;
    }
}

async function showDocumentDetail(docId) {
    listView.classList.add('hidden');
    detailView.classList.remove('hidden');
    detailContent.innerHTML = '<p>Yükleniyor...</p>';

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
            detailContent.innerHTML = `<p>${escapeHtml(data.error || 'Belge yüklenemedi.')}</p>`;
            return;
        }

        detailContent.innerHTML = `
            ${data.document_type ? `<p><strong>Belge Türü:</strong> ${escapeHtml(data.document_type)}</p>` : ''}
            ${data.summary ? `<p><strong>Özet:</strong> ${escapeHtml(data.summary)}</p>` : ''}
            <h3 style="margin-top: 1.2rem;">Osmanlıca Metin</h3>
            <div class="text-display" dir="rtl" lang="ota" style="margin-top: 0.4rem;">${escapeHtml(data.ocr)}</div>
            <h3 style="margin-top: 1.2rem;">Türkçe Çeviri</h3>
            <div class="text-display" style="margin-top: 0.4rem;">${escapeHtml(data.trans)}</div>
            ${data.trans_en ? `<h3 style="margin-top: 1.2rem;">İngilizce Çeviri</h3><div class="text-display" style="margin-top: 0.4rem;">${escapeHtml(data.trans_en)}</div>` : ''}
        `;
    } catch (err) {
        detailContent.innerHTML = `<p>Belge yüklenemedi: ${escapeHtml(err.message)}</p>`;
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

backToListBtn.addEventListener('click', () => {
    detailView.classList.add('hidden');
    listView.classList.remove('hidden');
    loadDocuments();
});

loadDocuments();
