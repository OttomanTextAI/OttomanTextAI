document.addEventListener('DOMContentLoaded', () => {

    const API_BASE_URL =
        'https://ottoman-text-ai.onrender.com';

    const authToken =
        localStorage.getItem('auth_token');

    const documentId =
        localStorage.getItem('active_document_id');

    const notesForm =
        document.getElementById('notesForm');

    const notesInput =
        document.getElementById('notesInput');

    const notesList =
        document.getElementById('notesList');

    const notesStatus =
        document.getElementById('notesStatus');

    const notesDocumentInfo =
        document.getElementById('notesDocumentInfo');

    // Üst navbar'daki tema anahtarı ve sol menü çekmecesi — index.html/app.js
    // ile birebir aynı davranış (aynı 'theme' localStorage anahtarı
    // paylaşılır), sayfalar arasında tutarlı bir deneyim için.
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

    const GUEST_NOTES_KEY = 'divane_guest_notes';
    const MAX_GUEST_NOTES = 3;


    function getGuestNotes() {
            try {
                const notes = JSON.parse(
                    localStorage.getItem(GUEST_NOTES_KEY) || '[]'
                );

                return Array.isArray(notes)
                    ? notes
                    : [];

            } catch (error) {
                return [];
            }
        }


    function saveGuestNotes(notes) {
            localStorage.setItem(
                GUEST_NOTES_KEY,
                JSON.stringify(notes)
            );
        }
    function showStatus(message) {
        notesStatus.textContent = message;
    }


if (authToken) {

    notesDocumentInfo.textContent =
        'Belgelerinize Ait Notlar';

    if (!documentId) {
        notesForm.style.display = 'none';

        showStatus(
            'Yeni not eklemek için önce bir belge açın. ' +
            'Kayıtlı notlarınızı aşağıda görüntüleyebilirsiniz.'
        );
    }

} else {
    notesDocumentInfo.textContent =
        'Misafir Notları • 3 manuel + 1 AI notu';

    showStatus(
        'Misafir olarak 3 manuel not ve 1 AI notu oluşturabilirsiniz. ' +
        'Kalıcı kullanım için giriş yapabilirsiniz.'
    );
}


    async function apiRequest(
        url,
        options = {}
    ) {
        const response = await fetch(
            `${API_BASE_URL}${url}`,
            {
                ...options,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization':
                        `Bearer ${authToken}`,
                    ...(options.headers || {})
                }
            }
        );

        const data = await response
            .json()
            .catch(() => ({}));

        if (!response.ok) {
            throw new Error(
                data.error || 'İşlem başarısız oldu.'
            );
        }

        return data;
    }


    function formatSourceType(sourceType) {
        const labels = {
            manual: 'Manuel',
            prediction: 'Tahmin',
            recommendation: 'Öneri',
            research_suggestion:
                'Araştırma Önerisi',
            five_w_one_h: '5N1K'
        };

        return labels[sourceType] ||
            sourceType ||
            'Not';
    }


    function renderDocumentGroups(groups) {
    notesList.innerHTML = '';

    if (
        !Array.isArray(groups) ||
        groups.length === 0
    ) {
        const empty =
            document.createElement('div');

        empty.className = 'notes-empty';
        empty.textContent =
            'Henüz not eklenmedi.';

        notesList.appendChild(empty);
        return;
    }

    groups.forEach(group => {
        const section =
            document.createElement('section');

        section.className =
            'notes-document-group';

        const title =
            document.createElement('h3');

        title.className =
            'notes-document-title';

        title.textContent =
            `📄 ${group.document_title}`;

        section.appendChild(title);

        const groupList =
            document.createElement('div');

        groupList.className =
            'notes-document-list';

        section.appendChild(groupList);

        notesList.appendChild(section);

        renderNotes(
            group.notes,
            groupList
        );
    });
}

    function renderNotes(
        notes,
        container = notesList
    ) {
        container.innerHTML = '';

        if (!Array.isArray(notes) ||
            notes.length === 0
        ) {
            const empty =
                document.createElement('div');

            empty.className = 'notes-empty';
            empty.textContent =
                'Henüz not eklenmedi.';

            container.appendChild(empty);
            return;
        }


        notes.forEach(note => {

            const item =
                document.createElement('div');

            item.className = 'note-item';

            if (note.is_completed) {
                item.classList.add('completed');
            }


            const checkbox =
                document.createElement('input');

            checkbox.type = 'checkbox';
            checkbox.className =
                'note-checkbox';

            checkbox.checked =
                !!note.is_completed;


            const main =
                document.createElement('div');

            main.className = 'note-main';


            const content =
                document.createElement('div');

            content.className =
                'note-content';

            content.textContent =
                note.content;


            const meta =
                document.createElement('div');

            meta.className = 'note-meta';

            meta.textContent =
                formatSourceType(
                    note.source_type
                );


            const deleteBtn =
                document.createElement('button');

            deleteBtn.type = 'button';

            deleteBtn.className =
                'note-delete';

            deleteBtn.title =
                'Notu sil';

            deleteBtn.textContent = '🗑️';


            main.appendChild(content);
            main.appendChild(meta);

            item.appendChild(checkbox);
            item.appendChild(main);
            item.appendChild(deleteBtn);

            container.appendChild(item);

        checkbox.addEventListener(
            'change',
            async () => {

                // Misafir kullanıcı
                if (!authToken) {

                    const guestNotes =
                        getGuestNotes();

                    const targetNote =
                        guestNotes.find(
                            item =>
                                String(item.id) ===
                                String(note.id)
                        );

                    if (targetNote) {
                        targetNote.is_completed =
                            checkbox.checked;

                        saveGuestNotes(
                            guestNotes
                        );
                    }

                    item.classList.toggle(
                        'completed',
                        checkbox.checked
                    );

                    return;
                }


                // Giriş yapmış kullanıcı
                checkbox.disabled = true;

                try {
                    const data =
                        await apiRequest(
                            `/api/notes/${note.id}`,
                            {
                                method: 'PATCH',
                                body:
                                    JSON.stringify({
                                        is_completed:
                                            checkbox.checked
                                    })
                            }
                        );

                    item.classList.toggle(
                        'completed',
                        !!data.note?.is_completed
                    );

                } catch (error) {

                    checkbox.checked =
                        !checkbox.checked;

                    alert(
                        'Not güncellenemedi: ' +
                        error.message
                    );

                } finally {

                    checkbox.disabled =
                        false;
                }
            }
        );


         deleteBtn.addEventListener(
            'click',
            async () => {

                const confirmed =
                    confirm(
                        'Bu not silinsin mi?'
                    );

                if (!confirmed) {
                    return;
                }


                // Misafir kullanıcı
                if (!authToken) {

                    const guestNotes =
                        getGuestNotes()
                            .filter(
                                item =>
                                    String(item.id) !==
                                    String(note.id)
                            );

                    saveGuestNotes(
                        guestNotes
                    );

                    renderNotes(
                        guestNotes
                    );

                    return;
                }


                // Giriş yapmış kullanıcı
                deleteBtn.disabled = true;

                try {

                await apiRequest(
                    `/api/notes/${note.id}`,
                    {
                        method: 'DELETE'
                    }
                );

                await loadNotes();

                } catch (error) {

                    deleteBtn.disabled =
                        false;

                    alert(
                        'Not silinemedi: ' +
                        error.message
                    );
                }
            }
        );
        });
    }


async function loadNotes() {

    // Misafir
    if (!authToken) {

        const guestNotes =
            getGuestNotes();

        renderNotes(
            guestNotes
        );

        return;
    }


    // Giriş yapmış kullanıcı
    showStatus(
        'Notlar yükleniyor...'
    );

    try {

const notes =
    await apiRequest('/api/notes');

const groupsMap = new Map();

notes.forEach(note => {
    const key = String(note.document_id);

    if (!groupsMap.has(key)) {
        groupsMap.set(key, {
            document_id: note.document_id,
            document_title:
                note.document_name || 'İsimsiz Belge',
            notes: []
        });
    }

    groupsMap.get(key).notes.push(note);
});

const groups =
    Array.from(groupsMap.values());

showStatus('');
renderDocumentGroups(groups);

    } catch (error) {

        showStatus(
            'Notlar yüklenemedi: ' +
            error.message
        );
    }
}

    notesForm.addEventListener(
        'submit',
        async (event) => {

            event.preventDefault();

            const content =
                notesInput.value.trim();

            if (!content) {
                return;
            }

            const submitBtn =
                notesForm.querySelector(
                    'button[type="submit"]'
                );


                // Misafir kullanıcı
                if (!authToken) {

                    const guestNotes =
                        getGuestNotes();
                    const manualGuestNoteCount =
                        guestNotes.filter(
                            note =>
                                note.source_type === 'manual'
                        ).length;

                    if (
                        manualGuestNoteCount >=
                        MAX_GUEST_NOTES
                    ) {
                        alert(
                            'Misafir olarak en fazla 3 not oluşturabilirsiniz. ' +
                            'Daha fazla not eklemek ve notlarınızı kalıcı olarak saklamak için giriş yapın.'
                        );

                        return;
                    }


                    guestNotes.push({
                        id:
                            'guest_' +
                            Date.now(),

                        content:
                            content,

                        source_type:
                            'manual',

                        is_completed:
                            false,

                        created_at:
                            new Date()
                                .toISOString()
                    });


                    saveGuestNotes(
                        guestNotes
                    );

                    notesInput.value = '';

                    renderNotes(
                        guestNotes
                    );

                    return;
                }
            submitBtn.disabled = true;
            submitBtn.textContent =
                'Ekleniyor...';

            try {
                await apiRequest(
                    `/api/documents/${documentId}/notes`,
                    {
                        method: 'POST',
                        body: JSON.stringify({
                            content,
                            source_type:
                                'manual'
                        })
                    }
                );

                notesInput.value = '';

                await loadNotes();

            } catch (error) {
                alert(
                    'Not eklenemedi: ' +
                    error.message
                );

            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent =
                    'Not Ekle';
            }
        }
    );


    loadNotes();

});