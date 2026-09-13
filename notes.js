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


    function showStatus(message) {
        notesStatus.textContent = message;
    }


    if (!authToken) {
        showStatus(
            'Notlarınızı görüntülemek için giriş yapmanız gerekiyor.'
        );

        notesForm.style.display = 'none';
        return;
    }


    if (!documentId) {
        showStatus(
            'Aktif bir belge bulunamadı. Önce bir belge açın.'
        );

        notesForm.style.display = 'none';
        return;
    }


    notesDocumentInfo.textContent =
        `Belge #${documentId}`;


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


    function renderNotes(notes) {
        notesList.innerHTML = '';

        if (!Array.isArray(notes) ||
            notes.length === 0
        ) {
            const empty =
                document.createElement('div');

            empty.className = 'notes-empty';
            empty.textContent =
                'Henüz not eklenmedi.';

            notesList.appendChild(empty);
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

            notesList.appendChild(item);


            checkbox.addEventListener(
                'change',
                async () => {

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
                            !!data.note
                                ?.is_completed
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

                    deleteBtn.disabled = true;

                    try {
                        await apiRequest(
                            `/api/notes/${note.id}`,
                            {
                                method:
                                    'DELETE'
                            }
                        );

                        item.remove();

                        if (
                            notesList.children
                                .length === 0
                        ) {
                            loadNotes();
                        }

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
        showStatus(
            'Notlar yükleniyor...'
        );

        try {
            const notes =
                await apiRequest(
                    `/api/documents/${documentId}/notes`
                );

            showStatus('');
            renderNotes(notes);

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