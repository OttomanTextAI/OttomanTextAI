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