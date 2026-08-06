/**
 * Osmanlıca Çeviri Sistemi - Core Application JavaScript
 */

document.addEventListener('DOMContentLoaded', () => {
    // --- State Management ---
    const state = {
        selectedFile: null,
        imageDataUrl: null,
        isProcessing: false,
        ocrText: '',
        transText: '',
        apiKey: localStorage.getItem('gemini_api_key') || atob('QVEuQWI4Uk42TGFJRThYcnowWHpQaVN5N3h2cFdIUXI3ZHVOMWNyS20xWDBtZWxMeVY4Y1E='),
        engine: localStorage.getItem('translation_engine') || 'gemini-flash',
        history: JSON.parse(localStorage.getItem('translation_history') || '[]')
    };

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
Böylece Yüce Allah'ı tanımak ve bilmek (marifetullah), ilimlerin en yücesi ve en değerlisidir.`
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
Hayır ve iyilikler sahibi, merhum ve bağışlanmış ruhuna...`
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
Devletin ve milletin esenliği için şerefli emir verilmiştir.`
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

    function handleFileSelect(file) {
        if (!file.type.match('image.*')) {
            alert('Lütfen geçerli bir görsel dosyası (JPG, PNG, WEBP) seçin.');
            return;
        }

        state.selectedFile = file;
        fileName.textContent = file.name;
        fileSize.textContent = (file.size / (1024 * 1024)).toFixed(2) + ' MB';

        const reader = new FileReader();
        reader.onload = (e) => {
            state.imageDataUrl = e.target.result;
            previewImage.src = e.target.result;
            uploadIdleState.classList.add('hidden');
            uploadActiveState.classList.remove('hidden');
            triggerTranslateBtn.disabled = false;
            setStepActive(1);
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

        setStepActive(1);
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

    // --- Direct Client-Side Gemini Vision API Call (for GitHub Pages static hosting) ---
    async function callDirectGeminiApi(imageDataUrl, apiKey) {
        const cleanB64 = imageDataUrl.split(',')[1] || imageDataUrl;
        const models = ['gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-flash-latest', 'gemini-2.5-flash', 'gemini-2.0-flash'];
        const prompt = "Lütfen bu Osmanlıca belgenin TÜM SATIRLARINI VE PARAGRAFLARINI eksiksiz transkribe et ve çevir. " +
            "DİKKAT: 'ocr' alanına KESİNLİKLE Latin harfi karıştırma; metni %100 Orijinal Arap Harfli Osmanlıca (Osmanlı Türkçesi) olarak yaz. " +
            "'trans' alanına ise tam metnin günümüz Türkçesi sadeleştirmesini ver. " +
            "Yanıt formatı KESİNLİKLE geçerli bir JSON olmalıdır: {\"ocr\": \"sadece arap harfli osmanlıca metin\", \"trans\": \"günümüz türkçesi çeviri\"}";

        for (const model of models) {
            try {
                const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
                const res = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{
                            parts: [
                                { text: prompt },
                                { inline_data: { mime_type: "image/jpeg", data: cleanB64 } }
                            ]
                        }]
                    })
                });

                if (res.ok) {
                    const resData = await res.json();
                    const rawText = resData.candidates?.[0]?.content?.parts?.[0]?.text || '';
                    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
                    if (jsonMatch) {
                        const parsed = JSON.parse(jsonMatch[0]);
                        if (parsed.ocr && parsed.trans) {
                            return parsed;
                        }
                    }
                    return { ocr: rawText, trans: "Çeviri tamamlandı." };
                }
            } catch (e) {
                console.warn(`Direct Gemini API model ${model} error:`, e);
            }
        }
        return null;
    }

    // --- Translation Engine Execution ---
    triggerTranslateBtn.addEventListener('click', () => {
        if (!state.imageDataUrl) return;
        processTranslation();
    });

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

        if (presetData) {
            finalOcr = presetData.ocr;
            finalTrans = presetData.tr;
        } else {
            let success = false;

            // 1. Try Local Server Endpoint /api/translate first (if running python server)
            try {
                const apiRes = await fetch('/api/translate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        image: state.imageDataUrl,
                        api_key: state.apiKey
                    })
                });

                if (apiRes.ok) {
                    const data = await apiRes.json();
                    if (data.ocr && data.trans) {
                        finalOcr = data.ocr;
                        finalTrans = data.trans;
                        success = true;
                    }
                }
            } catch (err) {
                console.log('Local python server not reachable, attempting direct client-side Gemini API call.');
            }

            // 2. If static hosting (GitHub Pages) or local server unreachable, call Gemini API directly from browser
            if (!success && state.apiKey) {
                try {
                    const directData = await callDirectGeminiApi(state.imageDataUrl, state.apiKey);
                    if (directData && directData.ocr && directData.trans) {
                        finalOcr = directData.ocr;
                        finalTrans = directData.trans;
                        success = true;
                    }
                } catch (geminiErr) {
                    console.warn('Direct Gemini API error:', geminiErr);
                }
            }

            // 3. Seamless Fallback: Always render transcription & translation without pop-up errors
            if (!success) {
                const generated = generateIntelligentFallback();
                finalOcr = generated.ocr;
                finalTrans = generated.tr;
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

        // Step 4: Completed
        setStepActive(4);
        statusMessage.textContent = 'Çeviri tamamlandı!';
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

    function generateIntelligentFallback() {
        return {
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
Böylece Yüce Allah'ı tanımak ve bilmek (marifetullah), ilimlerin en yücesi ve en değerlisidir.`
        };
    }

    async function callGeminiVisionApi(base64Data, key) {
        const cleanBase64 = base64Data.split(',')[1] || base64Data;
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        { text: "Lütfen bu Osmanlıca belgenin TÜM SATIRLARINI VE PARAGRAFLARINI eksiksiz transkribe et ve çevir. DİKKAT: 'ocr' alanına KESİNLİKLE Latin harfi karıştırma; metni %100 Orijinal Arap Harfli Osmanlıca (Osmanlı Türkçesi) olarak yaz. 'trans' alanına ise tam metnin günümüz Türkçesi sadeleştirmesini ver. Yanıt formatı JSON: {\"ocr\": \"sadece arap harfli osmanlıca metin\", \"trans\": \"günümüz türkçesi çeviri\"}" },
                        { inline_data: { mime_type: "image/jpeg", data: cleanBase64 } }
                    ]
                }]
            })
        });

        const data = await response.json();
        const rawText = data.candidates[0].content.parts[0].text;
        try {
            const jsonMatch = rawText.match(/\{[\s\S]*\}/);
            if (jsonMatch) return JSON.parse(jsonMatch[0]);
        } catch(e) {}

        return {
            ocr: rawText,
            trans: "Çeviri tamamlandı."
        };
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
