/**
 * Osmanlıca Çeviri Sistemi - Core Application JavaScript
 */

document.addEventListener('DOMContentLoaded', () => {
    // --- State Management ---
    const state = {
        selectedFile: null,
        imageDataUrl: null,
        enhancedImageBlob: null,
        enhancedImageUrl: null,
        isProcessing: false,
        ocrText: '',
        transText: '',
        apiKey: localStorage.getItem('gemini_api_key') || '',
        engine: localStorage.getItem('translation_engine') || 'gemini-flash',
        history: JSON.parse(localStorage.getItem('translation_history') || '[]')
    };

    // Fetch wrapper with a timeout, so slow/sleeping backends fail with a
    // clear message instead of leaving the UI stuck on "işleniyor..." forever.
    async function fetchWithTimeout(url, options = {}, timeoutMs = 45000) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            return await fetch(url, { ...options, signal: controller.signal });
        } catch (err) {
            if (err.name === 'AbortError') {
                throw new Error('Sunucu yanıt vermedi (zaman aşımı). Sunucu uyanıyor olabilir, birkaç saniye sonra tekrar deneyin.');
            }
            throw err;
        } finally {
            clearTimeout(timer);
        }
    }

    // --- DOM Elements ---
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    const selectFileBtn = document.getElementById('selectFileBtn');
    const heroUploadBtn = document.getElementById('heroUploadBtn');
    const uploadIdleState = document.getElementById('uploadIdleState');
    const uploadActiveState = document.getElementById('uploadActiveState');
    const previewImage = document.getElementById('previewImage');
    const fileName = document.getElementById('fileName');
    const fileSize = document.getElementById('fileSize');
    const reselectBtn = document.getElementById('reselectBtn');
    const removeFileBtn = document.getElementById('removeFileBtn');
    const scanLine = document.getElementById('scanLine');

    const triggerTranslateBtn = document.getElementById('triggerTranslateBtn');
    const translateBtnLabel = document.getElementById('translateBtnLabel');
    const actionSpinner = document.getElementById('actionSpinner');
    const statusBadge = document.getElementById('statusBadge');
    const statusMessage = document.getElementById('statusMessage');

    const ocrOutputBox = document.getElementById('ocrOutputBox');
    const ocrEmptyState = document.getElementById('ocrEmptyState');
    const ocrTextDisplay = document.getElementById('ocrTextDisplay');
    const ocrTools = document.getElementById('ocrTools');
    const copyOcrBtn = document.getElementById('copyOcrBtn');

    const transOutputBox = document.getElementById('transOutputBox');
    const transEmptyState = document.getElementById('transEmptyState');
    const transTextDisplay = document.getElementById('transTextDisplay');
    const transTools = document.getElementById('transTools');
    const copyTransBtn = document.getElementById('copyTransBtn');
    const ttsBtn = document.getElementById('ttsBtn');
    const downloadReportBtn = document.getElementById('downloadReportBtn');

    const themeToggleBtn = document.getElementById('themeToggleBtn');
    const settingsBtn = document.getElementById('settingsBtn');
    const settingsModal = document.getElementById('settingsModal');
    const apiKeyInput = document.getElementById('apiKeyInput');
    const modelSelect = document.getElementById('modelSelect');
    const saveSettingsBtn = document.getElementById('saveSettingsBtn');
    const historyList = document.getElementById('historyList');

    const enhancedEmptyState = document.getElementById('enhancedEmptyState');
    const enhancedImageWrapper = document.getElementById('enhancedImageWrapper');
    const enhancedImage = document.getElementById('enhancedImage');
    const documentProfile = document.getElementById('documentProfile');

    // Detailed Results Panel elements
    const resultsPanel = document.getElementById('resultsPanel');
    const resultDocType = document.getElementById('resultDocType');
    const resultConfidencePill = document.getElementById('resultConfidencePill');
    const resultConfidenceValue = document.getElementById('resultConfidenceValue');
    const resultsTabs = document.getElementById('resultsTabs');
    const resultSummary = document.getElementById('resultSummary');
    const resultDocInfoGrid = document.getElementById('resultDocInfoGrid');
    const resultKeyPoints = document.getElementById('resultKeyPoints');
    const resultPeople = document.getElementById('resultPeople');
    const resultPlaces = document.getElementById('resultPlaces');
    const resultConcepts = document.getElementById('resultConcepts');
    const resultScriptGrid = document.getElementById('resultScriptGrid');
    const resultDateGrid = document.getElementById('resultDateGrid');
    const resultNotes = document.getElementById('resultNotes');

    // Pre-set Sample Manuscript Database for Demo/Testing
    const sampleDatabase = {
        '2': {
            file: 'assets/sample_ottoman_2.png',
            name: 'tefsir_kelam_yazmasi.png',
            size: '0.34 MB',
            ocr: `بسم الله الرحمن الرحيم
الحمد لله رب العالمين والصلاة والسلام على أفضل رسله محمد وآله أجمعين.
وبعد، فيقول ضعيف الناس وأحوجهم إلى الملك الناصر محمود بن قاضي نكده المشهور بنيس أوغلي:
أول عزّ نگاه حق تبارك وتعالى "كُنْتُ كَنْزاً مَخْفِيّاً فَأَحْبَبْتُ أَنْ أُعْرَفَ فَخَلَقْتُ الْخَلْقَ لِكَيْ يُعْرَفُونَ" بويوردوغى اوزه علم ومعرفت مجموع كمالاتدن شريف قيلنمشدر.
ولهذا قرآن كريم بويورور: "قُلْ هَلْ يَسْتَوِي الَّذِينَ يَعْلَمُونَ وَالَّذِينَ لاَ يَعْلَمُونَ".
ودخى كلام قديم: "وَمَا خَلَقْتُ الْجِنَّ وَالْإِنسَ إِلَّا لِيَعْبُدُونِ".
"ليعبدون" ديمك بعض مفسرون قاطنده "ليعرفون" ديمكدر؛ يعنى حق تعالى‌يى معرفت ايتمكدر.
بو سببله معرفت الله علمى جمله علومڭ اڭ شريفى واڭ عاليسيدر.`,
            tr: `Rahmân ve Rahîm olan Allah'ın adıyla.
Âlemlerin Rabbi olan Allah'a hamdolsun; salât ve selâm elçilerin en hayırlısı olan Hazreti Muhammed'e ve onun bütün âline (ailesine/soyuna) olsun.

Şimdi gelelim asıl konuya; insanların en zayıfı ve Yüce Hükümdar'a en muhtaç olanı, Niğde Kadısı'nın oğlu diye meşhur Niyazioğlu Mahmud der ki:

Yüce ve Mübarek Allah'ın "Ben gizli bir hazine idim; bilinmeyi ve tanınmayı istedim, bu yüzden bilinsinler diye halkı (yaratılanları) yarattım" buyurması gereğince; ilim ve marifet (tanıma/bilme), bütün olgunluk ve erdemlerin en şereflisi kılınmıştır.

Nitekim Kur'ân-ı Kerîm'de şöyle buyurulmaktadır: "De ki: Hiç bilenlerle bilmeyenler bir olur mu?"

Yine Kadîm Kelâm'da (Zâriyât Sûresi 56. âyet): "Ben cinleri ve insanları ancak bana kulluk (ibadet) etsinler diye yarattım" buyurulmuştur.

Bazı tefsir âlimlerine göre "Bana ibadet etsinler" ifadesi "Beni tanısınlar/bilsinler (yani marifet sahibi olsunlar)" anlamına gelmektedir. 
Böylece Yüce Allah'ı tanımak ve bilmek (marifetullah), ilimlerin en yücesi ve en değerlisidir.`,
            // Curated demo analysis for this sample — not AI-generated, written
            // to showcase the results panel. Real uploads get this from the
            // backend /api/translate response instead.
            analysis: {
                document_type: 'Tefsir & Kelam El Yazması',
                confidence: 88,
                style: 'Dini / İlmî',
                summary: 'Bu metin, ilim ve marifetullah (Allah\'ı tanıma) kavramının önemini anlatan bir tefsir/kelam risalesinin giriş bölümüdür. Yazar, kendini alçakgönüllülükle tanıtıp konuya ayet ve hadislerle giriş yapmaktadır.',
                key_points: [
                    'Metin, Niğde Kadısı\'nın oğlu Niyazioğlu Mahmud tarafından kaleme alınmıştır.',
                    'İlim ve marifet (Allah\'ı tanıma), tüm ilimlerin en şereflisi olarak sunulmaktadır.',
                    'Zâriyât Sûresi 56. âyet, "ibadet" kelimesinin "marifet" anlamına geldiği yorumuyla aktarılmıştır.'
                ],
                people: ['Niyazioğlu Mahmud', 'Hazreti Muhammed'],
                places: ['Niğde'],
                concepts: ['Marifetullah', 'Tefsir', 'Kelam İlmi'],
                script_type: 'Nesih',
                script_purpose: 'Dinî / İlmî risale (tefsir metni)',
                period_estimate: 'Geç dönem Osmanlı (tahmini)',
                date_hijri: 'Belirtilmemiş',
                date_gregorian: 'Belirtilmemiş',
                notes: 'Metinde doğrudan bir tarih ibaresi geçmemektedir; dönem tahmini yazı üslubuna dayanmaktadır.'
            }
        },
        '1': {
            file: 'assets/sample_ottoman_1.png',
            name: 'sample_manuscript_1.png',
            size: '1.4 MB',
            ocr: `بسم الله الرحمن الرحيم
الله لا اله الا هو الحي القيوم
اعوذ بالله من الشيطان الرجيم
كل نفس ذائقة الموت
الحمد لله رب العالمين
صاحب الخيرات والمبرات مرحوم ومغفور له`,
            tr: `Bismillâhirrahmânirrahîm.
Allah ki O'ndan başka ilah yoktur, Hayy ve Kayyûm'dur.
Kovulmuş şeytandan Allah'a sığınırım.
Her canlı ölümü tadacaktır.
Hamd, âlemlerin Rabbi olan Allah'a mahsustur.
Hayır ve iyilikler sahibi, merhum ve bağışlanmış ruhuna...`,
            analysis: {
                document_type: 'Mezar Taşı / Vakfiye Kaydı',
                confidence: 79,
                style: 'Dini / Anma metni',
                summary: 'Kısa, dua ve besmele içerikli bir anma metni. Muhtemelen bir mezar taşı kitabesi veya vakfa dair kısa bir kayıttır; hayır sahibi bir kişinin ruhuna dua edilmektedir.',
                key_points: [
                    'Metin besmele ve kelime-i tevhid ile başlamaktadır.',
                    'Hayır ve iyilik sahibi, merhum bir kişi için dua edilmektedir.'
                ],
                people: ['İsmi belirtilmemiş hayır sahibi'],
                places: [],
                concepts: ['Dua', 'Rahmet', 'Vakıf/Hayır'],
                script_type: 'Sülüs (kitabe üslubu)',
                script_purpose: 'Anma / mezar kitabesi',
                period_estimate: 'Belirlenemedi',
                date_hijri: 'Belirtilmemiş',
                date_gregorian: 'Belirtilmemiş',
                notes: 'Metin çok kısa olduğundan kesin belge türü ve tarih tahmini sınırlıdır.'
            }
        },
        'hero': {
            file: 'assets/hero_manuscript.png',
            name: 'hatt_i_humayun.png',
            size: '2.1 MB',
            ocr: `يا اله العالمين يا ارحم الراحمين
مدد سندندر ای رب كريم
دولت عليه عثمانيه فرمانى مقتضاسنجه
دولت وملتڭ سلامتـى ايچون امر شريف اولنمشدر.`,
            tr: `Ey âlemlerin İlahı, ey merhametlilerin en merhametlisi!
Yardım Sendedir ey kerem sahibi Rabbim!
Yüce Osmanlı Devleti fermanının gereğince
Devletin ve milletin esenliği için şerefli emir verilmiştir.`,
            analysis: {
                document_type: 'Ferman (Hatt-ı Hümayun)',
                confidence: 92,
                style: 'Resmî / Bürokratik',
                summary: 'Bu ferman, devletin ve milletin esenliği için Yüce Osmanlı Devleti\'nin emri gereğince hareket edilmesini buyurmaktadır. Metin bir dua/niyaz ifadesiyle açılıp resmî bir emirle devam etmektedir.',
                key_points: [
                    'Ferman, dua ve niyaz cümleleriyle açılmaktadır.',
                    'Devlet ve milletin esenliği (selameti) için şerefli bir emir verildiği belirtilmektedir.',
                    'Metin, resmî/bürokratik bir üslupla kaleme alınmıştır.'
                ],
                people: ['Padişah (zımnen)'],
                places: ['Devlet-i Aliyye-i Osmaniyye'],
                concepts: ['Ferman', 'Devlet Esenliği', 'Padişah Buyruğu'],
                script_type: 'Divani',
                script_purpose: 'Resmî devlet buyruğu (ferman)',
                period_estimate: '19. yüzyıl (tahmini)',
                date_hijri: 'Belirtilmemiş',
                date_gregorian: 'Belirtilmemiş',
                notes: 'Bu, tanıtım amaçlı kısaltılmış bir örnek metindir; tam ferman genellikle tarih ve tuğra bilgisi de içerir.'
            }
        }
    };

    // --- Theme Toggle ---
    if (localStorage.getItem('theme') === 'dark') {
        document.body.classList.add('dark-theme');
        themeToggleBtn.querySelector('.theme-icon').textContent = '☀️';
    }

    themeToggleBtn.addEventListener('click', () => {
        document.body.classList.toggle('dark-theme');
        const isDark = document.body.classList.contains('dark-theme');
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
        themeToggleBtn.querySelector('.theme-icon').textContent = isDark ? '☀️' : '🌙';
    });

    // --- File Handling & Drag Drop ---
    heroUploadBtn.addEventListener('click', () => {
        dropZone.scrollIntoView({ behavior: 'smooth' });
        fileInput.click();
    });

    selectFileBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        fileInput.click();
    });

    fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
            handleFileSelect(e.target.files[0]);
        }
    });

    // Belge profili değiştirildiğinde görüntüyü yeniden işle
    documentProfile.addEventListener('change', async () => {
        if (!state.selectedFile) {
            return;
        }

        try {
            statusBadge.classList.remove('hidden');
            statusMessage.textContent = 'Yeni belge profiliyle görüntü iyileştiriliyor...';

            const enhancedResult = await enhanceUploadedImage(
                state.selectedFile,
                documentProfile.value
            );

            if (state.enhancedImageUrl) {
                URL.revokeObjectURL(state.enhancedImageUrl);
            }

            state.enhancedImageBlob = enhancedResult.blob;
            state.enhancedImageUrl = enhancedResult.url;

            enhancedImage.src = enhancedResult.url;

            enhancedEmptyState.classList.add('hidden');
            enhancedImageWrapper.classList.remove('hidden');

            statusMessage.textContent = 'Görüntü iyileştirme tamamlandı.';
        } catch (error) {
            console.error('Enhancement error:', error);
            statusMessage.textContent = 'Hata: ' + error.message;
        }
    });

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('drag-over');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleFileSelect(e.dataTransfer.files[0]);
        }
    });

    reselectBtn.addEventListener('click', () => fileInput.click());
    removeFileBtn.addEventListener('click', resetState);

    // FIX: This function previously contained a duplicate, unreachable nested
    // copy of itself declared after the `return` statement. Function
    // declarations are hoisted in JS, so it never threw an error — it was
    // simply dead code that could never run (its debug console.log never fired).
    // Cleaned up to a single, straightforward implementation below.
    async function enhanceUploadedImage(file, profile = 'printed') {
        console.log('ENHANCE PROFILE:', profile);

        const formData = new FormData();
        formData.append('image', file);
        formData.append('profile', profile);

        const response = await fetchWithTimeout('https://ottoman-text-ai.onrender.com/api/enhance', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            let errorData = {};
            try {
                errorData = await response.json();
            } catch (parseErr) {
                // Response wasn't JSON; fall back to a generic message below.
            }

            console.error('BACKEND ERROR:', errorData);

            throw new Error(
                errorData.error || 'Görüntü iyileştirme başarısız oldu.'
            );
        }

        const imageBlob = await response.blob();
        const imageUrl = URL.createObjectURL(imageBlob);

        return {
            blob: imageBlob,
            url: imageUrl
        };
    }

    async function handleFileSelect(file) {
        if (!file.type.match('image.*')) {
            alert('Lütfen geçerli bir görsel dosyası (JPG, PNG, WEBP) seçin.');
            return;
        }

        state.selectedFile = file;
        fileName.textContent = file.name;
        fileSize.textContent = (file.size / (1024 * 1024)).toFixed(2) + ' MB';

        const reader = new FileReader();
        reader.onload = async (e) => {
            state.imageDataUrl = e.target.result;

            previewImage.src = e.target.result;

            uploadIdleState.classList.add('hidden');
            uploadActiveState.classList.remove('hidden');

            triggerTranslateBtn.disabled = true;

            enhancedEmptyState.classList.remove('hidden');
            enhancedImageWrapper.classList.add('hidden');

            setStepActive(1);

            try {
                statusBadge.classList.remove('hidden');
                statusMessage.textContent = 'Görüntü iyileştiriliyor...';

                const enhancedResult = await enhanceUploadedImage(
                    state.selectedFile,
                    documentProfile.value
                );

                state.enhancedImageBlob = enhancedResult.blob;
                state.enhancedImageUrl = enhancedResult.url;

                enhancedImage.src = enhancedResult.url;

                enhancedEmptyState.classList.add('hidden');
                enhancedImageWrapper.classList.remove('hidden');

                statusMessage.textContent = 'Görüntü iyileştirme tamamlandı.';
                triggerTranslateBtn.disabled = false;
            } catch (error) {
                console.error('Enhancement error:', error);
                statusMessage.textContent = 'Hata: ' + error.message;
            }
        };
        reader.readAsDataURL(file);
    }

    // --- Sample Image Click Handlers ---
    document.querySelectorAll('.sample-card').forEach(card => {
        card.addEventListener('click', () => {
            const key = card.getAttribute('data-sample');
            const sample = sampleDatabase[key];
            if (sample) {
                state.selectedFile = { name: sample.name };
                state.imageDataUrl = sample.file;
                fileName.textContent = sample.name;
                fileSize.textContent = sample.size;
                previewImage.src = sample.file;
                enhancedImage.src = sample.file;
                enhancedEmptyState.classList.add('hidden');
                enhancedImageWrapper.classList.remove('hidden');
                uploadIdleState.classList.add('hidden');
                uploadActiveState.classList.remove('hidden');
                triggerTranslateBtn.disabled = false;

                dropZone.scrollIntoView({ behavior: 'smooth' });
                setStepActive(1);

                // Auto process sample
                processTranslation(sample);
            }
        });
    });

    function resetState() {
        state.selectedFile = null;
        state.imageDataUrl = null;
        fileInput.value = '';
        uploadIdleState.classList.remove('hidden');
        uploadActiveState.classList.add('hidden');
        triggerTranslateBtn.disabled = true;

        ocrEmptyState.classList.remove('hidden');
        ocrTextDisplay.classList.add('hidden');
        ocrTools.classList.add('hidden');
        ocrTextDisplay.textContent = '';

        transEmptyState.classList.remove('hidden');
        transTextDisplay.classList.add('hidden');
        transTools.classList.add('hidden');
        transTextDisplay.textContent = '';

        enhancedEmptyState.classList.remove('hidden');
        enhancedImageWrapper.classList.add('hidden');
        enhancedImage.src = '';

        if (state.enhancedImageUrl) {
            URL.revokeObjectURL(state.enhancedImageUrl);
        }

        state.enhancedImageBlob = null;
        state.enhancedImageUrl = null;

        hideResultsPanel();
        setStepActive(1);
    }

    // --- Detailed Results Panel (tabbed) ---
    resultsTabs.addEventListener('click', (e) => {
        const btn = e.target.closest('.results-tab-btn');
        if (!btn) return;

        const targetTab = btn.getAttribute('data-tab');

        document.querySelectorAll('.results-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        document.querySelectorAll('.results-tab-panel').forEach(panel => {
            panel.classList.toggle('active', panel.getAttribute('data-panel') === targetTab);
        });
    });

    function hideResultsPanel() {
        resultsPanel.classList.add('hidden');
    }

    // Builds a row of label/value cards for an info-grid section.
    // fields: [{ label, value }] — entries with an empty/undefined value are skipped.
    function buildInfoGrid(container, fields) {
        container.innerHTML = '';
        const usable = fields.filter(f => f.value !== undefined && f.value !== null && String(f.value).trim() !== '');

        if (usable.length === 0) {
            container.innerHTML = '<p class="entity-empty-text">Bu belge için bilgi tespit edilemedi.</p>';
            return;
        }

        usable.forEach(f => {
            const item = document.createElement('div');
            item.className = 'info-item';
            item.innerHTML = `
                <span class="info-item-label"></span>
                <span class="info-item-value"></span>
            `;
            item.querySelector('.info-item-label').textContent = f.label;
            item.querySelector('.info-item-value').textContent = f.value;
            container.appendChild(item);
        });
    }

    // Renders a list of entity chips (people/places/concepts). Each entry can be
    // a plain string or an { name, role } object.
    function buildEntityChips(container, entities) {
        container.innerHTML = '';
        if (!entities || entities.length === 0) {
            container.innerHTML = '<span class="entity-empty-text">Tespit edilemedi</span>';
            return;
        }

        entities.forEach(entity => {
            const label = typeof entity === 'string' ? entity : (entity.name || '');
            if (!label.trim()) return;
            const chip = document.createElement('span');
            chip.className = 'entity-chip';
            chip.textContent = label;
            container.appendChild(chip);
        });
    }

    function buildList(container, items) {
        container.innerHTML = '';
        if (!items || items.length === 0) {
            container.innerHTML = '<li class="entity-empty-text" style="padding-left:0;">Bu belge için önemli bilgi çıkarılamadı.</li>';
            return;
        }
        items.forEach(text => {
            if (!text || !String(text).trim()) return;
            const li = document.createElement('li');
            li.textContent = text;
            container.appendChild(li);
        });
    }

    // data is the parsed analysis object (see backend /api/translate response
    // and sampleDatabase entries below). Only ocr/trans are guaranteed; every
    // other field is optional and rendered defensively.
    function renderResultsPanel(data) {
        // Reset to first tab each time a new result comes in
        document.querySelectorAll('.results-tab-btn').forEach((b, i) => b.classList.toggle('active', i === 0));
        document.querySelectorAll('.results-tab-panel').forEach((p, i) => p.classList.toggle('active', i === 0));

        resultDocType.textContent = data.document_type || 'Belge Türü Belirlenemedi';

        if (typeof data.confidence === 'number') {
            resultConfidencePill.classList.remove('hidden');
            resultConfidenceValue.textContent = `%${Math.round(data.confidence)}`;
            resultConfidenceValue.classList.remove('confidence-mid', 'confidence-low');
            if (data.confidence < 60) {
                resultConfidenceValue.classList.add('confidence-low');
            } else if (data.confidence < 85) {
                resultConfidenceValue.classList.add('confidence-mid');
            }
        } else {
            resultConfidencePill.classList.add('hidden');
        }

        // Genel Bakış
        resultSummary.textContent = data.summary || 'Bu belge için özet oluşturulamadı.';
        buildInfoGrid(resultDocInfoGrid, [
            { label: 'Belge Türü', value: data.document_type },
            { label: 'Tahmini Dönem', value: data.period_estimate },
            { label: 'Dil / Üslup', value: data.style },
        ]);

        // İçerik Analizi
        buildList(resultKeyPoints, data.key_points);
        buildEntityChips(resultPeople, data.people);
        buildEntityChips(resultPlaces, data.places);
        buildEntityChips(resultConcepts, data.concepts);

        // Yazı & Dil Özellikleri
        buildInfoGrid(resultScriptGrid, [
            { label: 'Yazı Tipi (Hat)', value: data.script_type },
            { label: 'Yazının Amacı', value: data.script_purpose },
        ]);

        // Tarih & Bağlam
        buildInfoGrid(resultDateGrid, [
            { label: 'Tarih (Hicrî)', value: data.date_hijri },
            { label: 'Tarih (Miladî)', value: data.date_gregorian },
            { label: 'Tahmini Dönem', value: data.period_estimate },
        ]);

        // Notlar
        resultNotes.textContent = data.notes || 'Bu belge için ek not bulunmuyor.';

        resultsPanel.classList.remove('hidden');
        resultsPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // --- Workflow Step Visual Control ---
    function setStepActive(stepNum) {
        for (let i = 1; i <= 4; i++) {
            const card = document.getElementById(`stepCard${i}`);
            if (card) {
                if (i <= stepNum) {
                    card.classList.add('active');
                } else {
                    card.classList.remove('active');
                }
            }
        }
    }

    // --- Translation Engine Execution ---
    triggerTranslateBtn.addEventListener('click', () => {
        if (!state.imageDataUrl) return;
        processTranslation();
    });

    function generateTemporaryFallback() {
    return {
        ocr: `بسم الله الرحمن الرحيم
دولت عليه عثمانيه فرمانى مقتضاسنجه
دولت و ملتڭ سلامتى ايچون امر شريف اولنمشدر.`,

        trans: `Rahmân ve Rahîm olan Allah'ın adıyla.

Yüce Osmanlı Devleti'nin emri gereğince,
devletin ve milletin esenliği için gerekli emir verilmiştir.`,

        analysis: {
            document_type: 'Osmanlıca Belge',
            confidence: 70,
            style: 'Tarihî / Osmanlı Türkçesi',

            summary:
                'Bu sonuç geçici demo modu kullanılarak oluşturulmuştur. Yapay zekâ servisine ulaşılamadığı için örnek belge analizi gösterilmektedir.',

            key_points: [
                'Belge Osmanlı Türkçesiyle hazırlanmıştır.',
                'Metin resmî veya tarihî bir belge niteliği taşımaktadır.',
                'Ayrıntılı analiz için yapay zekâ servisi gereklidir.'
            ],

            people: [],
            places: [],
            concepts: [
                'Osmanlı Türkçesi',
                'Tarihî Belge'
            ],

            script_type: 'Belirlenemedi',
            script_purpose: 'Belirlenemedi',
            period_estimate: 'Osmanlı dönemi',
            date_hijri: 'Belirtilmemiş',
            date_gregorian: 'Belirtilmemiş',

            notes:
                'Demo modu aktiftir. Bu bilgiler yapay zekâ tarafından mevcut belge analiz edilerek üretilmemiştir.'
        }
    };
}

    async function processTranslation(presetData = null) {
        state.isProcessing = true;
        triggerTranslateBtn.disabled = true;
        actionSpinner.classList.remove('hidden');
        translateBtnLabel.textContent = 'İşleniyor...';
        statusBadge.classList.remove('hidden');
        scanLine.classList.add('scanning');

        // Step 2: OCR Extraction
        statusMessage.textContent = 'Görüntü iyileştiriliyor & Osmanlıca OCR yapılıyor...';
        setStepActive(2);
        await new Promise(r => setTimeout(r, 1200));

        // Step 3: AI Translation
        statusMessage.textContent = 'Yapay Zeka (mT5 / Gemini) ile Türkçe çeviri oluşturuluyor...';
        setStepActive(3);
        await new Promise(r => setTimeout(r, 1400));

        let finalOcr = '';
        let finalTrans = '';
        let finalAnalysis = null; // optional richer data for the results panel
        let usedFallback = false;
        
        if (presetData) {
            finalOcr = presetData.ocr;
            finalTrans = presetData.tr;
            // Sample entries may carry pre-written demo analysis fields
            // (summary, people, places, concepts, etc.) — see sampleDatabase.
            finalAnalysis = presetData.analysis || null;
        } else {
            let success = false;

            try {
                if (!state.enhancedImageBlob) {
                    throw new Error('İyileştirilmiş görüntü hazır değil.');
                }

                const formData = new FormData();
                formData.append('image', state.enhancedImageBlob, 'enhanced.png');
                console.log('=== TRANSLATION INPUT DEBUG ===');
                console.log('Original file:', state.selectedFile?.name);
                console.log('Original size:', state.selectedFile?.size);
                console.log('Enhanced blob type:', state.enhancedImageBlob?.type);
                console.log('Enhanced blob size:', state.enhancedImageBlob?.size);
                console.log('Sending enhanced.png to /api/translate');
                console.log('===============================');

                const apiRes = await fetchWithTimeout('https://ottoman-text-ai.onrender.com/api/translate', {
                    method: 'POST',
                    body: formData
                });

                if (!apiRes.ok) {
                    const errorData = await apiRes.json();
                    // Include the backend's detailed error (e.g. Gemini's raw
                    // response) so the user can see the real cause directly
                    // in the alert popup, without needing to open DevTools.
                    let detailMsg = '';
                    if (errorData.details) {
                        const rawDetails = typeof errorData.details === 'string'
                            ? errorData.details
                            : JSON.stringify(errorData.details);
                        detailMsg = '\n\nDetay: ' + rawDetails.slice(0, 400);
                    }
                    throw new Error((errorData.error || 'OCR / çeviri isteği başarısız oldu.') + detailMsg);
                }

                const data = await apiRes.json();

                if (data.ocr && data.trans) {
                    finalOcr = data.ocr;
                    finalTrans = data.trans;
                    // Everything besides ocr/trans is optional analysis data;
                    // pass the whole payload through and let renderResultsPanel
                    // render only what's actually present.
                    finalAnalysis = data;
                    success = true;
                }
            } catch (err) {
                console.error('Backend OCR / translation error:', err);
                console.warn(
                    'AI servisi kullanılamadı. Geçici demo fallback çalıştırılıyor.'
                );

                const fallback = generateTemporaryFallback();

                finalOcr = fallback.ocr;
                finalTrans = fallback.trans;
                finalAnalysis = fallback.analysis;

                usedFallback = true;
                success = true;

                statusMessage.textContent =
                    'AI servisine ulaşılamadı — geçici demo sonucu gösteriliyor.';
            }

            if (!success) {
                state.isProcessing = false;
                triggerTranslateBtn.disabled = false;
                actionSpinner.classList.add('hidden');
                translateBtnLabel.textContent = '✨ Yapay Zeka Çeviriyi Başlat';
                scanLine.classList.remove('scanning');
                statusMessage.textContent = 'Çeviri başarısız oldu. Lütfen tekrar deneyin.';
                setStepActive(1);
                alert('Belge işlenemedi. Sunucudan geçerli bir sonuç alınamadı. Lütfen tekrar deneyin.');
                return;
            }
        }

        // Display Results
        ocrEmptyState.classList.add('hidden');
        ocrTextDisplay.classList.remove('hidden');
        ocrTextDisplay.textContent = finalOcr;
        ocrTools.classList.remove('hidden');

        transEmptyState.classList.add('hidden');
        transTextDisplay.classList.remove('hidden');
        transTextDisplay.textContent = finalTrans;
        transTools.classList.remove('hidden');

        state.ocrText = finalOcr;
        state.transText = finalTrans;

        // Detailed Results Panel — only show it when we actually have
        // analysis data to display; otherwise leave it hidden rather than
        // rendering an empty/misleading panel.
        if (finalAnalysis) {
            renderResultsPanel(finalAnalysis);
        } else {
            hideResultsPanel();
        }

        // Step 4: Completed
        setStepActive(4);
        if (usedFallback) {
                statusMessage.textContent =
                    'AI servisine ulaşılamadı — geçici demo sonucu gösteriliyor.';
            } else {
                statusMessage.textContent =
                    'Çeviri tamamlandı!';
            }
        scanLine.classList.remove('scanning');

        state.isProcessing = false;
        triggerTranslateBtn.disabled = false;
        actionSpinner.classList.add('hidden');
        translateBtnLabel.textContent = '✨ Yapay Zeka Çeviriyi Başlat';

        // Save to History
        saveHistoryItem({
            name: state.selectedFile ? state.selectedFile.name : 'Osmanlıca Belge',
            date: new Date().toLocaleString('tr-TR'),
            ocr: finalOcr,
            trans: finalTrans
        });
    }

    // --- Interactive Tools & Actions ---
    copyOcrBtn.addEventListener('click', () => copyToClipboard(ocrTextDisplay.textContent, 'Osmanlıca metin kopyalandı!'));
    copyTransBtn.addEventListener('click', () => copyToClipboard(transTextDisplay.textContent, 'Türkçe çeviri kopyalandı!'));

    function copyToClipboard(text, msg) {
        navigator.clipboard.writeText(text).then(() => {
            alert(msg);
        });
    }

    // Text To Speech
    ttsBtn.addEventListener('click', () => {
        const text = transTextDisplay.textContent;
        if (!text) return;
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = 'tr-TR';
            utterance.rate = 0.9;
            window.speechSynthesis.speak(utterance);
        } else {
            alert('Tarayıcınız sesli okuma özelliğini desteklemiyor.');
        }
    });

    // Download Report
    downloadReportBtn.addEventListener('click', () => {
        const content = `================================================
OSMANLICA ÇEVİRİ SİSTEMİ - BELGE RAPORU
Tarih: ${new Date().toLocaleString('tr-TR')}
================================================

[ OSMANLICA METİN / TRANSKRİPSİYON ]
${ocrTextDisplay.textContent}

------------------------------------------------

[ GÜNÜMÜZ TÜRKÇESİ ÇEVİRİSİ ]
${transTextDisplay.textContent}

================================================`;

        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `Osmanlica_Ceviri_${Date.now()}.txt`;
        a.click();
    });

    // --- History Log Management ---
    function saveHistoryItem(item) {
        state.history.unshift(item);
        if (state.history.length > 20) state.history.pop();
        localStorage.setItem('translation_history', JSON.stringify(state.history));
        renderHistory();
    }

    function renderHistory() {
        if (!historyList) return;
        if (state.history.length === 0) {
            historyList.innerHTML = '<p class="empty-history-text">Henüz kaydedilmiş bir belge bulunmuyor.</p>';
            return;
        }

        historyList.innerHTML = state.history.map((h, i) => `
            <div class="history-item" style="border-bottom:1px solid var(--color-border); padding:0.8rem 0;">
                <div style="display:flex; justify-content:space-between; font-weight:bold; font-size:0.9rem;">
                    <span>📜 ${h.name}</span>
                    <span style="font-size:0.75rem; color:var(--color-text-muted);">${h.date}</span>
                </div>
                <p style="font-size:0.85rem; color:var(--color-text-muted); margin-top:0.3rem; line-clamp:2;">${h.trans}</p>
            </div>
        `).join('');
    }

    document.getElementById('clearHistoryBtn')?.addEventListener('click', () => {
        state.history = [];
        localStorage.removeItem('translation_history');
        renderHistory();
    });

    // --- Modal Management ---
    document.querySelectorAll('[data-modal]').forEach(trigger => {
        trigger.addEventListener('click', (e) => {
            e.preventDefault();
            const modalId = trigger.getAttribute('data-modal');
            const targetModal = document.getElementById(modalId);
            if (targetModal) {
                targetModal.classList.remove('hidden');
                if (modalId === 'documentsModal') renderHistory();
            }
        });
    });

    document.querySelectorAll('[data-close]').forEach(btn => {
        btn.addEventListener('click', () => {
            const modalId = btn.getAttribute('data-close');
            document.getElementById(modalId)?.classList.add('hidden');
        });
    });

    settingsBtn.addEventListener('click', () => {
        apiKeyInput.value = state.apiKey;
        modelSelect.value = state.engine;
        settingsModal.classList.remove('hidden');
    });

    saveSettingsBtn.addEventListener('click', () => {
        state.apiKey = apiKeyInput.value.trim();
        state.engine = modelSelect.value;
        localStorage.setItem('gemini_api_key', state.apiKey);
        localStorage.setItem('translation_engine', state.engine);
        settingsModal.classList.add('hidden');
        alert('API ve Motor ayarları başarıyla kaydedildi!');
    });

    // Close modal on backdrop click
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.classList.add('hidden');
        });
    });
});

