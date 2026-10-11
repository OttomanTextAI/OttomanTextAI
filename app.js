//app.js
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
    transTextEn: '',
    translitText: '',
    lastAnalysis: null,
    dbDocumentId: null,
    restoredEntityFilterType: null,
    // sampleDatabase anahtarı — SADECE sample-card tıklamasında set edilir,
    // gerçek yükleme (handleFileSelect) başında null'a döner. entity-info/
    // word-alternatives popover'ları bununla "şu an açık belge bir örnek mi,
    // öyleyse hangisi" sorusunu cevaplar (bkz. showEntityPopover/
    // showWordAlternativesPopover) — presetData-şekilli ama örnek OLMAYAN
    // "kaydedilmiş belgeyi yeniden aç" akışı (processTranslation'a
    // backend'den gelen veriyle çağrılan dal) bunu hiç set etmez.
    activeSampleKey: null,

    originalFileHash: null,
    pendingOverwriteDocumentId: null,
    
    apiKey: localStorage.getItem('gemini_api_key') || '',
    engine: localStorage.getItem('translation_engine') || 'gemini-flash',

    authToken: localStorage.getItem('auth_token') || null,
    authEmail: localStorage.getItem('auth_email') || null
};
function restoreTranslationState() {
    const params = new URLSearchParams(window.location.search);

    if (params.get('restore') !== '1') {
        return;
    }

    const saved = localStorage.getItem(
        'divane_translation_state'
    );

    if (!saved) {
        console.warn('[STATE RESTORE] Saved translation not found');
        return;
    }

    try {
        const restored = JSON.parse(saved);

        state.dbDocumentId =
            restored.dbDocumentId || null;

        state.ocrText =
            restored.ocrText || '';

        state.translitText =
            restored.translitText || '';

        state.transText =
            restored.transText || '';

        state.transTextEn =
            restored.transTextEn || '';

        state.lastAnalysis =
            restored.lastAnalysis || null;

        state.restoredEntityFilterType =
         restored.activeEntityFilterType || null;

        console.log(
            '[STATE RESTORE] Translation restored:',
            state.dbDocumentId
        );

    } catch (error) {
        console.warn(
            '[STATE RESTORE] Restore failed:',
            error
        );
    }
}

    // /api/auth/* ve /api/documents/* uç noktaları da diğer her şey gibi bu
    // backend'de yaşıyor.
    const API_BASE_URL = 'https://ottoman-text-ai.onrender.com';

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
    const uploadIdleState = document.getElementById('uploadIdleState');
    const uploadActiveState = document.getElementById('uploadActiveState');
    const previewImage = document.getElementById('previewImage');
    const fileName = document.getElementById('fileName');
    const fileSize = document.getElementById('fileSize');
    const reselectBtn = document.getElementById('reselectBtn');
    const removeFileBtn = document.getElementById('removeFileBtn');
    const scanLine = document.getElementById('scanLine');

    // Dosya Seçimi: Düzenle / Direkt Yükle + Görsel Kırpma (Cropper.js)
    const fileChoiceModal = document.getElementById('fileChoiceModal');
    const fileChoicePreviewImg = document.getElementById('fileChoicePreviewImg');
    const fileChoiceFileName = document.getElementById('fileChoiceFileName');
    const fileChoiceFileSize = document.getElementById('fileChoiceFileSize');
    const fileChoiceEditBtn = document.getElementById('fileChoiceEditBtn');
    const fileChoiceDirectBtn = document.getElementById('fileChoiceDirectBtn');
    const cropModal = document.getElementById('cropModal');
    const cropImage = document.getElementById('cropImage');
    const cropCloseBtn = document.getElementById('cropCloseBtn');
    const cropCancelBtn = document.getElementById('cropCancelBtn');
    const cropConfirmBtn = document.getElementById('cropConfirmBtn');
    let cropperInstance = null;

    const statusBadge = document.getElementById('statusBadge');
    const statusMessage = document.getElementById('statusMessage');
    const statusHint = document.getElementById('statusHint');

    const ocrOutputBox = document.getElementById('ocrOutputBox');
    const ocrEmptyState = document.getElementById('ocrEmptyState');
    const ocrEmptyStateText = ocrEmptyState.querySelector('p');
    const ocrEmptyStateDefaultText = ocrEmptyStateText.textContent;
    const ocrTextDisplay = document.getElementById('ocrTextDisplay');
    const ocrTools = document.getElementById('ocrTools');
    const copyOcrBtn = document.getElementById('copyOcrBtn');
    const ocrTtsBtn = document.getElementById('ocrTtsBtn');
    const ocrStopTtsBtn = document.getElementById('ocrStopTtsBtn');

    const translitOutputBox = document.getElementById('translitOutputBox');
    const translitEmptyState = document.getElementById('translitEmptyState');
    const translitEmptyStateText = translitEmptyState.querySelector('p');
    const translitEmptyStateDefaultText = translitEmptyStateText.textContent;
    const translitTextDisplay = document.getElementById('translitTextDisplay');
    const translitTools = document.getElementById('translitTools');
    const copyTranslitBtn = document.getElementById('copyTranslitBtn');
    const translitTtsBtn = document.getElementById('translitTtsBtn');
    const translitStopTtsBtn = document.getElementById('translitStopTtsBtn');

    const transOutputBox = document.getElementById('transOutputBox');
    const transEmptyState = document.getElementById('transEmptyState');
    const transEmptyStateText = transEmptyState.querySelector('p');
    const transEmptyStateDefaultText = transEmptyStateText.textContent;
    const transTextDisplay = document.getElementById('transTextDisplay');
    const transTools = document.getElementById('transTools');
    const copyTransBtn = document.getElementById('copyTransBtn');
    const ttsBtn = document.getElementById('ttsBtn');
    const transStopTtsBtn = document.getElementById('transStopTtsBtn');
    const downloadReportBtn = document.getElementById('downloadReportBtn');

    const enOutputBox = document.getElementById('enOutputBox');
    const enEmptyState = document.getElementById('enEmptyState');
    const enTextDisplay = document.getElementById('enTextDisplay');
    const copyEnBtn = document.getElementById('copyEnBtn');
    const enTtsBtn = document.getElementById('enTtsBtn');
    const enStopTtsBtn = document.getElementById('enStopTtsBtn');

    // Sol üstteki hamburger butonuyla açılan menü çekmecesi (Belgelerim/
    // Harita) — bkz. aşağıdaki "Sol Menü Çekmecesi" bölümü.
    const sideMenuToggle = document.getElementById('sideMenuToggle');
    const sideDrawer = document.getElementById('sideDrawer');
    const sideDrawerOverlay = document.getElementById('sideDrawerOverlay');
    const sideDrawerClose = document.getElementById('sideDrawerClose');

    const themeToggleBtn = document.getElementById('themeToggleBtn');
    // Hesap (Giriş / Kayıt) modalı
    const profileBtn = document.getElementById('profileBtn');
    const authModal = document.getElementById('authModal');
    const profilePromptModal = document.getElementById('profilePromptModal');
    const authTabs = document.getElementById('authTabs');
    const authError = document.getElementById('authError');
    const authLoggedOutView = document.getElementById('authLoggedOutView');
    const authLoggedInView = document.getElementById('authLoggedInView');
    const authUserEmail = document.getElementById('authUserEmail');
    const loginForm = document.getElementById('loginForm');
    const loginEmail = document.getElementById('loginEmail');
    const loginPassword = document.getElementById('loginPassword');
    const loginSubmitBtn = document.getElementById('loginSubmitBtn');
    const registerForm = document.getElementById('registerForm');
    const registerFullName = document.getElementById('registerFullName');
    const registerEmail = document.getElementById('registerEmail');
    const registerPassword = document.getElementById('registerPassword');
    const registerPasswordConfirm = document.getElementById('registerPasswordConfirm');
    const registerSubmitBtn = document.getElementById('registerSubmitBtn');
    const logoutBtn = document.getElementById('logoutBtn');

    const documentProfile = document.getElementById('documentProfile');
    const enhancedToggle = document.getElementById('enhancedToggle');
    const enhanceStatusIcon = document.getElementById('enhanceStatusIcon');
    const heroStartBtn = document.getElementById('heroStartBtn');

    // Osmanlıca (Arapça Harfler) ve Türkçe Harfler (Okunuş) artık her zaman
    // görünen ayrı sütunlar; Günümüz Türkçesi sütunu içindeki küçük
    // Türkçe/İngilizce geçişi ve "Bilgi" (belge analizi) aç/kapa bölümü.
    const transLangToggle = document.getElementById('transLangToggle');
    const entityFilterTrigger = document.getElementById('entityFilterTrigger');
    const entityFilterMenu = document.getElementById('entityFilterMenu');

    // "Bilgi" output tab (belge analizi) elements
    const infoTabBtn = document.getElementById('infoTabBtn');
    const infoOutputBox = document.getElementById('infoOutputBox');
    const infoEmptyState = document.getElementById('infoEmptyState');
    const infoContentWrapper = document.getElementById('infoContentWrapper');
    const infoAnalysisCard = document.getElementById('infoAnalysisCard');
function renderRestoredTranslation() {
    if (!state.dbDocumentId) {
        return;
    }

    // Normal çeviri akışındaki documentId mantığını yeniden oluştur.
    state.documentId = hashText(
        `${state.ocrText}\u0001${state.translitText}\u0001${state.transText}`
    );

    // Analizden entity listesini yeniden oluştur.
    const transEntities = buildEntityIndex(
        state.lastAnalysis
    );

    // =========================
    // OCR
    // =========================

    if (state.ocrText) {
        ocrEmptyState.classList.add('hidden');
        ocrTextDisplay.classList.remove('hidden');

        renderWithGuessMarkers(
            ocrTextDisplay,
            state.ocrText,
            {
                clickableGuesses: true,
                field: 'ocr'
            }
        );

        applyStoredWordCorrections(
            state.documentId,
            'ocr',
            ocrTextDisplay
        );

        ocrTools.classList.add('tools-ready');
    }

    // =========================
    // TRANSLITERATION
    // =========================

    if (state.translitText) {
        translitEmptyState.classList.add('hidden');
        translitTextDisplay.classList.remove('hidden');

        renderWithGuessMarkers(
            translitTextDisplay,
            state.translitText,
            {
                clickableGuesses: true,
                field: 'translit'
            }
        );

        applyStoredWordCorrections(
            state.documentId,
            'translit',
            translitTextDisplay
        );

        translitTools.classList.add('tools-ready');
    }

    // =========================
    // MODERN TÜRKÇE
    // =========================

    if (state.transText) {
        transEmptyState.classList.add('hidden');
        transTextDisplay.classList.remove('hidden');

        renderColumnWithEntities(
            transTextDisplay,
            state.transText,
            transEntities,
            {
                clickableGuesses: true,
                field: 'trans'
            }
        );

        applyStoredWordCorrections(
            state.documentId,
            'trans',
            transTextDisplay
        );

        transTools.classList.add('tools-ready');

        // Kaydedilmiş bir belge geri yüklendiğinde de "Filtrele" menüsü o
        // belgenin kategorileriyle güncel kalsın diye yeniden kuruluyor.
        renderEntityFilterMenu();
    }

    // =========================
    // ENGLISH
    // =========================

    if (state.transTextEn) {
        enEmptyState.classList.add('hidden');
        enTextDisplay.classList.remove('hidden');

        renderWithGuessMarkers(
            enTextDisplay,
            state.transTextEn
        );

        enTools.classList.add('tools-ready');
    }

    // =========================
    // BELGE ANALİZİ
    // =========================

    if (state.lastAnalysis) {
        renderResultsPanel(
            state.lastAnalysis
        );

        setInfoExpanded(true);

        // AI Belge Araçları
        aiToolsTabBtn.classList.remove('hidden');
        setAiToolsExpanded(true);
    } else {
        clearInfoTab();
    }

    // Aktif belgeyi koru
    localStorage.setItem(
        'active_document_id',
        String(state.dbDocumentId)
    );

    // Türkçe görünüm
    setOutputTab('trans');

    if (state.restoredEntityFilterType) {
        applyEntityFilter(
            state.restoredEntityFilterType
        );
    }

    console.log(
        '[STATE RESTORE] Workspace restored:',
        state.dbDocumentId
    );

    setTimeout(() => {
        smoothScrollTo(dropZone);
    }, 150);
}

    // Pre-set Sample Manuscript Database for Demo/Testing
    const sampleDatabase = {
        '2': {
            entity_info: {
            "person:sultan mehmed han": "Fatih Sultan Mehmed (II. Mehmed, 1432-1481), İstanbul'u fetheden ve Osmanlı Devleti'ni imparatorluk hâline getiren padişahtır; 'Fatih' unvanıyla anılır. Bu belgede kendisi, 'Sultan Mehmed Han' olarak, Bosna'daki ruhbanlara güvence veren ahidnâmeyi bizzat veren padişah olarak anılmaktadır.",
            "concept:fermanını": "Ferman, padişahın bizzat verdiği, kanun hükmünde buyruk niteliğindeki resmî emirlere verilen addır. Bu belgede ferman, Fatih Sultan Mehmed'in Bosna'daki ruhbanlara verdiği, onların can, mal ve kilise güvenliğini garanti eden ahidnâmeyi/buyruğu ifade etmektedir.",
            "place:bosnalı": "Bosna, Balkanlar'da, 1463'te Fatih Sultan Mehmed tarafından fethedilip Osmanlı topraklarına katılan bir bölgedir; günümüzde Bosna-Hersek'in bir parçasıdır. Bu belgede Bosna, ahidnâmenin muhatabı olan Fransiskan ruhbanların bulunduğu bölge olarak anılmaktadır.",
            "concept:ruhbanlara": "Ruhban, Hıristiyanlıkta kiliseye bağlı din adamlarına (rahip, keşiş vb.) verilen genel addır. Bu belgede ruhbanlar, Fatih Sultan Mehmed'in can, mal ve ibadet özgürlüklerini güvence altına aldığı Bosna'daki Fransiskan keşişleri ifade etmektedir.",
            "concept:kiliselerine": "Kilise, Hıristiyanlıkta ibadet edilen mabede verilen addır. Bu belgede kiliseler, Fatih Sultan Mehmed'in dokunulmazlığını ve korunmasını güvence altına aldığı, Bosna'daki ruhbanlara ait ibadet yerlerini ifade etmektedir.",
            "concept:güvenlik": "Güvenlik, bir kişinin veya topluluğun can, mal ve haklarının tehdit veya zarardan korunması hâlidir. Bu belgede güvenlik, Fatih Sultan Mehmed'in Bosna'daki ruhbanlara ve kiliselerine yönelik olarak tüm devlet görevlilerine ve halka karşı güvence altına aldığı temel hakkı ifade etmektedir."
            },
            word_alternatives: {},
            file: 'assets/fsma.png',
            enhancedFile: 'assets/fsma-enhanced.jpg',
            name: 'fatihin_ahidnamesi.png',
            size: '0.15 MB',
            ocr: `نشـان همايون اولدر كه بن كه سلطان محمد خانم
جمله خواص و عوام معلوم اولا كه اشبو دارندگان فرمان همايون بوسنه راهبلرنه مزيد عنايتم ظهور ايدوب بويوردوم كه مزبـورلره و كليسالرينه كمسنه مانع و مزاحم اولمايوب احتياطسز مملكتمده دورالار.
و قاچوب گيدنلر داهي امن و امانده اولالار.
گلوب بزم خاصه مملكتمزده خوفسز ساكن اولوب كليسالرنده متمكن اولالار.
و يوجه حضرتمدن و وزيرلرمدن و قوللارمدن و رعايامدن و جمله اهالي مملكتمدن كمسنه مزبـورلره دخل و تعرض ايدوب انجيتميه‌لر.
كندولرينه و جانلرينه و ماللرينه و كليسالرينه و داهي ياباندان خاصه مملكتمزه آدم گلورلر ايسه يمين مغلظه ايدرَم كه:
يرى و گوكى يراتان پروردگار حقى اچون
و مصحف حقى اچون
و اولى پيغمبرمز حقى اچون
و يوز ييرمى دورت بن پيغمبرلر حقى اچون
و قوشاندغم قليچ حقى اچون
بو يازلغانلره هيچ فرد مخالفت اتميه.
مادام كه بونلار بنم امرمه مطيع و منقاد اولالار.
شويله بيلاسز.`,
            tr: `Ben Sultan Mehmed Han'ım.
Herkes bilsin ki, bu padişah fermanını taşıyan Bosnalı ruhbanlara özel bir lütufta bulunarak emrediyorum:
Kimse onlara ve kiliselerine engel olmayacak, onları rahatsız etmeyecektir. Ülkemde güven içinde yaşayacaklardır.
Kaçıp gitmiş olanlar da güvenlik içinde olacaklardır.
Ülkeme gelip korkusuzca yaşayabilecek ve kiliselerinde ibadet edebileceklerdir.
Benim makamımdan, vezirlerimden, askerlerimden, halkımdan ve ülkemdeki hiç kimseden onlara zarar gelmeyecek, kimse onları incitmeyecektir.
Canlarına, mallarına ve kiliselerine dokunulmayacaktır.
Dışarıdan ülkeye insan getirmelerine de engel olunmayacaktır.
Yeri ve göğü yaratan Allah adına, Kur'an adına, Peygamber adına, bütün peygamberler adına ve kuşandığım kılıç adına yemin ederim ki bu hükümlere kimse karşı gelmeyecektir.
Onlar benim emrime bağlı kaldıkları sürece bu güvence devam edecektir.
Böyle bilinsin.`,
            translit: `Nişân-ı hümâyûn oldur ki, ben ki Sultân Mehemmed Hânım.
Cümle havâss u avâm ma'lûm ola ki, işbu dârendegân-ı fermân-ı hümâyûn Bosna râhiblerine mezîd-i inâyetim zuhûr idüp buyurdum ki, mezbûrlara ve kilîsâlarına kimesne mâni' ve müzâhim olmayup ihtiyâtsız memleketimde duralar.
Ve kaçup gidenler dahi emn ü emânda olalar.
Gelüp bizim hâssa memleketimizde havfsız sâkin olup kilîsâlarında mütemekkin olalar.
Ve yüce hazretimden ve vezîrlerimden ve kullarımdan ve reâyâmdan ve cümle ehâlî-i memleketimden kimesne mezbûrlara dahl ü taarruz idüp incitmeyeler.
Kendülerine ve cânlarına ve mâllarına ve kilîsâlarına ve dahi yabandan hâssa memleketimize âdem gelürler ise yemîn-i muġallaza iderem ki:
Yiri ve göki yaradan Perverdigâr hakkı içün
Ve mushaf hakkı içün
Ve ulu Peygamberimiz hakkı içün
Ve yüz yigirmi dört bin Peygamberler hakkı içün
Ve kuşandığım kılıç hakkı içün
Bu yazılganlara hiç ferd muhâlefet itmeye.
Mâdâm ki bunlar benim emrime mutî' ü munkâd olalar.
Şöyle bilesiz.`,
            // Curated demo analysis for this sample — not AI-generated, written
            // to showcase the results panel. Real uploads get this from the
            // backend /api/translate response instead.
            analysis: {
                document_type: 'Ahidnâme (Ferman niteliğinde)',
                confidence: 94,
                style: 'Osmanlı Türkçesi / Resmî-Bürokratik (Padişah buyruğu)',
                summary: 'Fatih Sultan Mehmed\'in 1463 yılında Bosna\'daki ruhbanlara (Fransiskenler) verdiği ahidnâmedir. Belgede ruhbanların ve kiliselerinin korunacağı, güven içinde yaşamalarına ve dinî faaliyetlerini sürdürmelerine izin verileceği güvence altına alınmaktadır.',
                key_points: [
                    'Bosna ruhbanlarına verilmiştir.',
                    'Kiliselerin korunması emredilmiştir.',
                    'Ruhbanların güven içinde yaşamaları güvence altına alınmıştır.',
                    'Can, mal ve kilise dokunulmazlığı vurgulanmıştır.',
                    'Padişah, hükümlere uyulacağına yemin etmektedir.',
                    '28 Mayıs 1463 tarihinde, Milodraž\'da verilmiştir.'
                ],
                people: ['Fatih Sultan Mehmed (Sultan Mehmed Han)', 'Bosna ruhbanları / Fransiskenler', 'Fra Anđeo Zvizdović (tarihsel bağlamda ilişkilendirilir)'],
                places: ['Bosna', 'Milodraž', 'Fojnica (nüshanın muhafaza edildiği yer)'],
                concepts: ['Ahidnâme', 'Ferman', 'Dinî özgürlük', 'Güvenlik', 'Kilise', 'Ruhban', 'Padişah buyruğu', 'Koruma / himaye'],
                script_type: 'Rık\'a karakterli el yazısı',
                script_purpose: 'Padişah buyruğu / hukukî güvence belgesi',
                period_estimate: '15. yüzyıl — Fatih Sultan Mehmed dönemi',
                date_hijri: '868',
                date_gregorian: '28 Mayıs 1463',
                notes: 'Belgenin özgün 1463 tarihli nüshası değil, metnin bir yazımı/kopyası olabileceği düşünülerek güven skoru %100 verilmemiştir.'
            }
        },
        '1': {
            entity_info: {
            "concept:milletimin": "Millet, ortak dil, tarih, kültür ve kader birliği bilinciyle bağlı olan insan topluluğuna verilen addır. Bu şiirde millet, bağımsızlığı (istiklâli) hak eden, Allah'a inanan ve bayrağı uğruna canını vermeye hazır Türk milletini ifade etmektedir.",
            "concept:istiklâl": "İstiklâl, bir milletin veya devletin başka bir güce bağımlı olmadan kendi kaderini özgürce belirleyebilmesi, yani bağımsızlık anlamına gelir. Bu şiirde istiklâl, hem şiirin adını oluşturan hem de her kıtanın sonunda tekrarlanan, Türk milletinin hakkı olarak vurgulanan temel kavramdır.",
            "concept:iman": "İman, bir inanca, özellikle dinî inanca kalpten bağlanma ve güven duyma hâlidir. Bu şiirde iman, Türk milletinin göğsündeki demir bir zırh gibi tasvir edilen, milleti dış tehditlere karşı koruyan manevi güç olarak anlatılmaktadır.",
            "concept:vatanı": "Vatan, bir milletin üzerinde yaşadığı, aidiyet duyduğu ve uğruna fedakârlık yapmaya hazır olduğu toprak parçasına verilen addır. Bu şiirde vatan, şehitlerin kanıyla sulanmış, 'cennet vatan' olarak nitelenen ve hiçbir dünya nimetine değişilmeyecek kadar kutsal sayılan topraklar olarak anlatılmaktadır.",
            "concept:vatanın": "Vatan, bir milletin üzerinde yaşadığı, aidiyet duyduğu ve uğruna fedakârlık yapmaya hazır olduğu toprak parçasına verilen addır. Bu şiirde vatan, şehitlerin kanıyla sulanmış, 'cennet vatan' olarak nitelenen ve hiçbir dünya nimetine değişilmeyecek kadar kutsal sayılan topraklar olarak anlatılmaktadır.",
            "concept:vatanımdan": "Vatan, bir milletin üzerinde yaşadığı, aidiyet duyduğu ve uğruna fedakârlık yapmaya hazır olduğu toprak parçasına verilen addır. Bu şiirde vatan, şehitlerin kanıyla sulanmış, 'cennet vatan' olarak nitelenen ve hiçbir dünya nimetine değişilmeyecek kadar kutsal sayılan topraklar olarak anlatılmaktadır.",
            "concept:ezanlar": "Ezan, Müslümanları namaza çağırmak için belirli vakitlerde okunan, İslam inancının temel unsurlarından biridir. Bu şiirde ezanlar, dinin temelini oluşturan şehadet kelimelerini taşıyan, vatan toprakları üzerinde sonsuza dek yankılanması istenen kutsal sesler olarak tasvir edilmektedir.",
            "concept:hürriyet": "Hürriyet, bir kişinin veya milletin başkalarının baskısı olmadan özgürce yaşayabilmesi hâlidir. Bu şiirde hürriyet, bayrağın hakkı olarak nitelenir; şiir, Türk milletinin ezelden beri hür yaşadığını ve bundan sonra da hür yaşayacağını vurgulamaktadır."
            },
            word_alternatives: {},
            file: 'assets/im.png',
            enhancedFile: 'assets/im-enhanced.jpg',
            name: 'istiklal_marsi.png',
            size: '0.4 MB',
            ocr: `قورقما سونمز بو شفقلرده یوزن آل سنجاق
سونمه‌دن یوردمڭ اوستنده توتن اڭ صوڭ اوجاق
اوبنم ملتمڭ ییلدیزیدر پارلایاجق
اوبنمدر اوبنم ملتمڭدر آنجاق

چاتما قربان اولایم چهره ڭی ای نازلی هلال
قهرمان عرقمه بر گول نه بو شدت بو جلال
سڭا الماز دوكولن قانلرمز صوڭره حلال
حقیدر حقه طاپان ملتمڭ استقلال

بن ازلدن بریدر حر یاشادم حر یاشارم
هانگی چیلغین بڭا زنجیر اوره جقمش شاشارم
كوكره مش سیل كبی‌یم بندمی چیگنر آشارم
ییرتارم طاغلری انگینلره صیغمام طاشارم

غربڭ آفاقنی صارمشسه چلیك زرهلی دیوار
بنم ایمان طولی كوكوسم كبی سرحدم وار
اولوسون قورقما نصل بویله بر ایمانی بوغار
مدنیت دیدیگن تك دیشی قالمش جانوار

آرقاداش يودمى آلچاقلری اوغراتما صاقین
سپر ايت كوده ڭی دورسون بو حیاسزجه آقین
طوغاجقدرسگا وعد ایتدیڭی كونلر حقڭ
كیم بیلیر بلكی یارین بلكی یاریندنده یاقین

باصدیغڭ یرلری طوپراق دییه رك گچمه طانی
دوشون آلتنده كی بیڭلرجه كفنسز یاتانی
سن شهید اوغلیسڭ اینجیتمه یازیقدر آتاڭی
ویرمه دنیالری آلسه ڭده بو جنت وطنی

كیم بو جنت وطنڭ اوغرینه اولمازكه فدا
شهدا فیشقیراجق طوپراغی صیقسه ڭ شهدا
جانی جانانی بوتون واریمی آلسین ده خدا
ایتمه سین تك وطنمدن بنی دنیاده جدا

روحمڭ سندن الهی شودر آنجاق املی
دكمه سین معبدمڭ كوكسنه نامحرم الی
بو اذان لر كه شهادتلری دینڭ اتملی
ابدی یوردمڭ اوستنده بنم ایگلملی

او زمان وجد ایله بیڭ سجده ایدر وارسه طاشم
هرجریحه مدن الهی بوشانور قانلی یاشیم
فیشقیریر روح مجرد گبی یردن نعشیم
او زمان یوكسله رك عرشه ده گر بلكی باشم

دالقالان سن ده شفقلر كبی ای شانلی هلال
ولسون آرتق دكولن قانلرمڭ هپسی حلال
ابديا سڭا یوق عرقمه یوق اضمحلال
حقیدر حر یاشامش بایراغمڭ حریت
حقیدر حقه طاپان ملتمڭ استقلال`,
            tr: `Korkma, sönmez bu şafaklarda yüzen al sancak;
Sönmeden yurdumun üstünde tüten en son ocak.
O benim milletimin yıldızıdır, parlayacak;
O benimdir, o benim milletimindir ancak.

Çatma, kurban olayım, çehreni ey nazlı hilâl!
Kahraman ırkıma bir gül; ne bu şiddet, bu celâl?
Sana olmaz dökülen kanlarımız sonra helâl.
Hakkıdır, Hakk'a tapan milletimin istiklâl!

Ben ezelden beridir hür yaşadım, hür yaşarım.
Hangi çılgın bana zincir vuracakmış? Şaşarım!
Kükremiş sel gibiyim, bendimi çiğner, aşarım.
Yırtarım dağları, enginlere sığmam, taşarım.

Garbın âfâkını sarmışsa çelik zırhlı duvar,
Benim iman dolu göğsüm gibi serhaddim var.
Ulusun, korkma! Nasıl böyle bir îmânı boğar,
"Medeniyet!" dediğin tek dişi kalmış canavar?

Arkadaş! Yurduma alçakları uğratma, sakın.
Siper et gövdeni, dursun bu hayâsızca akın.
Doğacaktır sana va'dettiği günler Hakk'ın...
Kim bilir, belki yarın, belki yarından da yakın.

Bastığın yerleri "toprak!" diyerek geçme, tanı!
Düşün altındaki binlerce kefensiz yatanı.
Sen şehid oğlusun, incitme, yazıktır atanı;
Verme, dünyaları alsan da, bu cennet vatanı.

Kim bu cennet vatanın uğruna olmaz ki fedâ?
Şühedâ fışkıracak toprağı sıksan, şühedâ!
Cânı, cânânı, bütün varımı alsın da Huda,
Etmesin tek vatanımdan beni dünyada cüdâ.

Ruhumun senden, İlâhî, şudur ancak emeli:
Değmesin mabedimin göğsüne nâ-mahrem eli.
Bu ezanlar -ki şehadetleri dînin temeli-
Ebedî yurdumun üstünde benim inlemeli.

O zaman vecd ile bin secde eder -varsa- taşım;
Her cerîhamdan, İlâhî, boşanıp kanlı yaşım,
Fışkırır ruh-ı mücerret gibi yerden na'şım;
O zaman yükselerek Arş'a değer, belki başım.

Dalgalan sen de şafaklar gibi ey şanlı hilâl!
Olsun artık dökülen kanlarımın hepsi helâl.
Ebediyen sana yok, ırkıma yok izmihlâl:
Hakkıdır, hür yaşamış, bayrağımın hürriyet;
Hakkıdır, Hakk'a tapan milletimin istiklâl!`,
            // İstiklâl Marşı zaten 1921'den beri aynı sözlerle okunduğu için,
            // Arap harfli aslının Latin harfli okunuşu ile günümüz Türkçesi
            // neredeyse birebir aynıdır — ayrı bir sadeleştirme gerekmez.
            translit: `Korkma, sönmez bu şafaklarda yüzen al sancak;
Sönmeden yurdumun üstünde tüten en son ocak.
O benim milletimin yıldızıdır, parlayacak;
O benimdir, o benim milletimindir ancak.

Çatma, kurban olayım, çehreni ey nazlı hilâl!
Kahraman ırkıma bir gül; ne bu şiddet, bu celâl?
Sana olmaz dökülen kanlarımız sonra helâl.
Hakkıdır, Hakk'a tapan milletimin istiklâl!

Ben ezelden beridir hür yaşadım, hür yaşarım.
Hangi çılgın bana zincir vuracakmış? Şaşarım!
Kükremiş sel gibiyim, bendimi çiğner, aşarım.
Yırtarım dağları, enginlere sığmam, taşarım.

Garbın âfâkını sarmışsa çelik zırhlı duvar,
Benim iman dolu göğsüm gibi serhaddim var.
Ulusun, korkma! Nasıl böyle bir îmânı boğar,
"Medeniyet!" dediğin tek dişi kalmış canavar?

Arkadaş! Yurduma alçakları uğratma, sakın.
Siper et gövdeni, dursun bu hayâsızca akın.
Doğacaktır sana va'dettiği günler Hakk'ın...
Kim bilir, belki yarın, belki yarından da yakın.

Bastığın yerleri "toprak!" diyerek geçme, tanı!
Düşün altındaki binlerce kefensiz yatanı.
Sen şehid oğlusun, incitme, yazıktır atanı;
Verme, dünyaları alsan da, bu cennet vatanı.

Kim bu cennet vatanın uğruna olmaz ki fedâ?
Şühedâ fışkıracak toprağı sıksan, şühedâ!
Cânı, cânânı, bütün varımı alsın da Huda,
Etmesin tek vatanımdan beni dünyada cüdâ.

Ruhumun senden, İlâhî, şudur ancak emeli:
Değmesin mabedimin göğsüne nâ-mahrem eli.
Bu ezanlar -ki şehadetleri dînin temeli-
Ebedî yurdumun üstünde benim inlemeli.

O zaman vecd ile bin secde eder -varsa- taşım;
Her cerîhamdan, İlâhî, boşanıp kanlı yaşım,
Fışkırır ruh-ı mücerret gibi yerden na'şım;
O zaman yükselerek Arş'a değer, belki başım.

Dalgalan sen de şafaklar gibi ey şanlı hilâl!
Olsun artık dökülen kanlarımın hepsi helâl.
Ebediyen sana yok, ırkıma yok izmihlâl:
Hakkıdır, hür yaşamış, bayrağımın hürriyet;
Hakkıdır, Hakk'a tapan milletimin istiklâl!`,
            analysis: {
                document_type: 'Şiir / Millî Marş (Edebî Eser)',
                confidence: 99,
                style: 'Osmanlı Türkçesi / Millî, Hamasî, Dinî, Edebî',
                summary: 'Mehmet Âkif Ersoy\'un Millî Mücadele döneminde yazdığı İstiklâl Marşı\'dır. Şiirde Türk milletinin bağımsızlığı, vatan sevgisi, bayrak, şehitlik, iman ve özgürlük temaları işlenmektedir. Marş, TBMM tarafından 12 Mart 1921\'de kabul edilmiştir.',
                key_points: [
                    'Yazar: Mehmet Âkif Ersoy — İthaf: Kahraman Ordumuza',
                    'Kabul tarihi: 12 Mart 1921, Türkiye Büyük Millet Meclisi',
                    'Kıta sayısı: 10, Tema: Bağımsızlık ve vatan sevgisi',
                    'Yazıldığı dönem: Millî Mücadele',
                    'İlk olarak 17 Şubat 1921\'de yayımlanmıştır.'
                ],
                people: ['Mehmet Âkif Ersoy (şair)', 'Hamdullah Suphi Tanrıöver (Mecliste okuyan Maarif Vekili)', 'Mustafa Kemal Atatürk (dönemin TBMM Başkanı)'],
                places: ['Ankara', 'Taceddin Dergâhı (şiirin kaleme alındığı yer)'],
                concepts: ['İstiklâl', 'Hürriyet', 'Vatan', 'Bayrak', 'Millet', 'Şehitlik', 'İman', 'Ezan', 'Fedakârlık', 'Millî Mücadele'],
                script_type: 'Nesih karakterli Osmanlıca yazı',
                script_purpose: 'Edebî eser / Millî marş metni',
                period_estimate: '20. yüzyılın ilk çeyreği — Millî Mücadele dönemi (1921)',
                date_hijri: '12 Mart 1337 (Rûmî)',
                date_gregorian: '12 Mart 1921',
                notes: 'Görsel, metnin Osmanlı alfabesiyle bir gösterimidir; 1921 tarihli resmî nüshanın özgün taraması olarak doğrulanmadığından güven skoru %100 verilmemiştir.'
            }
        },
        'hero': {
            entity_info: {
            "concept:gözyaşından": "Gözyaşı, divan şiirinde aşk acısının, hasretin ve duygusal yoğunluğun en yaygın simgelerinden biridir; şairin iç dünyasındaki ateşi (aşk ıstırabını) dışa vuran bir imge olarak kullanılır. Bu kasidede şair, gönlündeki ateşlere gözyaşıyla su dökmenin bile çare olmadığını söyleyerek acısının derinliğini vurgulamaktadır.",
            "concept:gül": "Gül, divan edebiyatında sevgilinin yüzünün, güzelliğinin ve aşkın en temel simgelerinden biridir; aynı zamanda bülbül-gül ilişkisiyle âşık-maşuk temasını da çağrıştırır. Bu kasidede gül, sevgilinin yüzüne benzetilerek, hiçbir gül bahçesinin sevgilinin güzelliğine erişemeyeceği vurgulanmaktadır.",
            "concept:gülü": "Gül, divan edebiyatında sevgilinin yüzünün, güzelliğinin ve aşkın en temel simgelerinden biridir; aynı zamanda bülbül-gül ilişkisiyle âşık-maşuk temasını da çağrıştırır. Bu kasidede gül, sevgilinin yüzüne benzetilerek, hiçbir gül bahçesinin sevgilinin güzelliğine erişemeyeceği vurgulanmaktadır.",
            "person:zahitler": "Zahid (çoğulu zühhâd/zahitler), dünya nimetlerinden uzak durup kendini ibadete adayan, sofu/dindar kişilere divan edebiyatında verilen addır; genellikle aşk ve şarap temalı şiirlerde, hazcı âşığın karşıtı olarak katı/kuralcı bir tip şeklinde tasvir edilir. Bu kasidede zahitler, Kevser şarabını isteyenler olarak, şairin sevgilinin dudağını özleyen tutkusuyla karşılaştırılmaktadır.",
            "place:kevser": "Kevser, İslam inancına göre cennette bulunan, Hz. Muhammed'e has özel bir havuz/nehirdir; Kur'an'da adı geçen bir sûreye de adını vermiştir. Bu kasidede Kevser, zahitlerin arzuladığı cennet nimeti olarak, şairin sevgilinin dudağına duyduğu tutkuyla karşılaştırılmaktadır.",
            "person:ahmed-i muhtâr": "Ahmed-i Muhtâr ('seçilmiş Ahmed'), Hz. Muhammed'in güzel isimlerinden biridir; 'Ahmed' Peygamberimizin diğer bir adı, 'Muhtâr' ise 'seçilmiş' anlamına gelir. Bu kasidede su, Hz. Muhammed'in ('Ahmed-i Muhtâr'ın) yoluna uymakla temiz yaradılışını insanlara gösterdiği söylenerek methedilmektedir.",
            "person:hz. muhammed": "Hz. Muhammed (yaklaşık 570-632), İslam dininin peygamberi olup, bu na't türü kasidenin asıl övgü konusudur. Fuzûlî'nin bu kasidesinde su, çeşitli beyitlerde Hz. Muhammed'in mucizeleri, merhameti ve yüceliğiyle ilişkilendirilerek methedilmektedir.",
            "concept:mucizeleri": "Mucize, bir peygamberin, Allah'ın izniyle, olağan tabiat kanunlarını aşan olağanüstü bir olayı gerçekleştirmesine verilen addır; peygamberliğin doğrulanması için bir delil sayılır. Bu kasidede Hz. Muhammed'in çeşitli mucizeleri (parmaklarından su akıtması, taştan su çıkarması gibi) su imgesiyle ilişkilendirilerek övülmektedir.",
            "concept:mucizesiyle": "Mucize, bir peygamberin, Allah'ın izniyle, olağan tabiat kanunlarını aşan olağanüstü bir olayı gerçekleştirmesine verilen addır; peygamberliğin doğrulanması için bir delil sayılır. Bu kasidede Hz. Muhammed'in çeşitli mucizeleri (parmaklarından su akıtması, taştan su çıkarması gibi) su imgesiyle ilişkilendirilerek övülmektedir.",
            "concept:mucizesi": "Mucize, bir peygamberin, Allah'ın izniyle, olağan tabiat kanunlarını aşan olağanüstü bir olayı gerçekleştirmesine verilen addır; peygamberliğin doğrulanması için bir delil sayılır. Bu kasidede Hz. Muhammed'in çeşitli mucizeleri (parmaklarından su akıtması, taştan su çıkarması gibi) su imgesiyle ilişkilendirilerek övülmektedir.",
            "concept:mucizeden": "Mucize, bir peygamberin, Allah'ın izniyle, olağan tabiat kanunlarını aşan olağanüstü bir olayı gerçekleştirmesine verilen addır; peygamberliğin doğrulanması için bir delil sayılır. Bu kasidede Hz. Muhammed'in çeşitli mucizeleri (parmaklarından su akıtması, taştan su çıkarması gibi) su imgesiyle ilişkilendirilerek övülmektedir.",
            "person:ensâr": "Ensâr ('yardımcılar'), Hz. Muhammed Mekke'den Medine'ye hicret ettiğinde onu ve beraberindeki Müslümanları kabul edip destekleyen Medineli Müslümanlara verilen addır. Bu kasidede Ensâr, Hz. Muhammed'in bir susuzluk gününde parmaklarından akıttığı suyu içenler olarak anılan mucizevi bir olayla ilişkilendirilmektedir.",
            "concept:rahmet": "Rahmet, Allah'ın kullarına gösterdiği merhamet, şefkat ve bağışlayıcılığı ifade eden bir kavramdır. Bu kasidede rahmet, Hz. Muhammed'in abdest alırken yüzüne sürdüğü her su damlasından yayıldığı söylenen ilahi bir bereket olarak tasvir edilmektedir.",
            "concept:na'tını": "Na't, divan edebiyatında Hz. Muhammed'i övmek amacıyla yazılan şiir türüne verilen addır. Bu kaside de aslında bir na't olup, su redifi üzerinden hem aşk hem de Hz. Muhammed övgüsünü bir arada işlemektedir; şair, na'tını tekrarlamanın günahkârlar için bir çare olduğunu söylemektedir.",
            "person:fuzûlî": "Fuzûlî (yaklaşık 1483-1556), Azerbaycan/Irak kökenli, Türk, Arap ve Fars dillerinde eser vermiş, divan edebiyatının en büyük şairlerinden biridir; bu ünlü 'Su Kasidesi'nin de yazarıdır. Şiirin son beyitlerinde şair, kendi adını anarak sözlerinin Hz. Muhammed'i övmenin bereketiyle inciye dönüştüğünü ifade etmektedir.",
            "concept:vuslatını": "Vuslat, divan edebiyatında âşığın sevgiliye kavuşması anlamına gelir; dinî/tasavvufi şiirlerde ise kulun Allah'a veya Hz. Muhammed'e manevi kavuşmasını da ifade edebilir. Bu kasidenin son beytinde şair, kıyamet gününde Hz. Muhammed'in yüzünü görmekten mahrum kalmamayı, yani ona kavuşmayı (vuslatını) dilemektedir.",
            "concept:şefaatini": "Şefaat, İslam inancına göre Hz. Muhammed'in veya diğer salih kulların, kıyamet gününde günahkâr müminler için Allah'tan af dilemesi/aracılık etmesidir. Bu kasidenin son beytinde şair, Hz. Muhammed'den kıyamet gününde kendisine şefaat etmesini dilemektedir."
            },
            word_alternatives: {},
            file: 'assets/sk.png',
            enhancedFile: 'assets/sk-enhanced.jpg',
            name: 'su_kasidesi.png',
            size: '0.15 MB',
            ocr: `صاچمه ای كوز اشكدن كوكلمدەكي اودلاره صو
كیم بو دكلو دوتشان اودلاره قیلمز چاره صو

آبگوندور كنبد دوار رنكى بيلمزم
يا محيط اولمش كوزومدن كنبد دواره صو

ذوق تيغكدن عجب يوخ اولسه كوكلم چاك چاك
كيم مرور ايلن براقور رخنلر ديواره صو

وهم ايلن صويلر دل مجروح پيكانك سوزين
احتياط ايلن ايچر هر كيمده اولسه ياره صو

صويه ويرسون باغبان گلزارى زحمت چكشمسون
بر گل آچيلمز يوزك تك ويرسه بيك گلزاره صو

اوخشده بيلمز غبارينى محرر خطكه
خامه تك باقمقدن اينسه كوزلرينه قاره صو

عارضك يادييلە نمناك اولسه مژگانم نوله
ضايع اولمز گل تمناسيله ويرمك خاره صو

غم كونی ايتمه دل بيماردن تيغك دريغ
خيردر ويرمك قراكوكجه ده بيماره صو

ايسته پيكانك كوكل هجرنده شوقم ساكن ايت
صوسزم بر كز بو صحراده بنمچون آره صو

من لبك مشتاقيم زهاد كوثر طالبي
نيتكم مسته مي ايچمك خوش كلور هشياره صو

روضه كوینه هر دم دورميوپ ايلر گذار
عاشق اولمش غالبا اول سرو خوش رفتارە صو

صو يولن اول كوي دن طپراق اولوب دوتسم كرك
چون رقيبمدر دخي اول كويه قويمـن واره صو

دست بوسی آرزوسيله گر اولورسم دوستلر
كوزه ايلك طپراغم صونك آنكلە ياره صو

سرور سركشلك قيلور قمرى نيازندن مكر
دامنن دوته اياغنه دوشه يالواره صو

ايچمك استر بلبلك قانن مگر بر رنكيله
گل بوداغنك مزاجنه گيرە قورتاره صو

طينت پاكینی روشن قيلمیش اهل عالمه
اقتدا قيلمیش طريق احمد مختاره صو

سید نوع بشر دريای در اصطفا
كيم سپوپدر معجزاتى آتش اشراره صو

قلمغیچون تازه گلزار نبوت رونقن
معجزندن ايلمش اظهار سنگ خاره صو

معجزى بر بحر بى پايان ايمش عالم ده كيم
يتمش اندن بيك بيك آتشخانه كفاره صو

حيرت ايلن برمغن ديشلر كيم ايتسه استماع
برمغندن ويرديكى شدت كونی انصاره صو

دوستى كر زهر مار ايچسه اولور آب حيات
خصمى صو ايچسه دونر البته زهر ماره صو

ايلمش هر قطره دن بيك بحر رحمت موج خيز
ال صونوب اورغج وضو ايچون كل رخساره صو

خاكپاينه يتم در عمرلر در متصل
باشنى طاشدن طاشه اوروب كزر آواره صو

ذره ذره خاك درگاهينه استر صا له نور
دونمز اول دركاهدن كر اولسه پاره پاره صو

ذكر نعتن وردنى درمان بيلور اهل خطا
ايله كيم دفع خمار ايچون ايچر ميخاره صو

يا حبيب الله يا خير البشر مشتاقكم
ايله كيم لب تشنه لريانوب ديلر همواره صو

سنسن اول بحر كرامت كيم شب معراجد
شبنم فيضك يتورمش ثابت وسياره صو

چشمه خورشيددن هر دم زلال فيض اينر
حاجت اولسه مرقدك تجديد ايدن معماره صو

بيم دوزخ نا رغم صالمش دل سوزانم
وار اميدم ابر احسانك سپه اول ناره صو

يمن نعتندن گوهر اولمش فضولى سوزلرى
ابر نيساندن دونن تك لولو شه وارە صو

خواب غفلتن الان بيدار الانده روز حشر
اشك حسرتن دوكن ده ديده بيداره صو

اومدوغم اولدر كه روز حشر محروم اولمين
چشمه وصالت ويرن تشنه ديداره صو`,
            tr: `Ey göz! Gönlümdeki ateşlere gözyaşından su saçma; çünkü böylesine tutuşmuş ateşlere su çare olmaz.

Dönen gök kubbenin rengi su renginde midir, yoksa gözümden akan gözyaşları mı gök kubbeyi kaplamıştır, bilmiyorum.

Senin kılıca benzeyen keskin bakışlarının etkisiyle gönlüm parça parça olsa buna şaşılmaz. Çünkü akarsu da akıp geçerken duvarlarda yarıklar oluşturur.

Yaralı gönül, senin oka benzeyen kirpiklerinden korkarak söz eder. Çünkü yarası olan kişi suyu bile dikkat ederek içer.

Bahçıvan binlerce gül bahçesini sulasa bile senin yüzün gibi bir gül açılmaz. Bu yüzden boşuna zahmet çekmesin, gül bahçesini suya bıraksın.

Kâtip, kalem gibi sürekli yazıya bakmaktan gözlerine kara su inse bile senin yüzündeki ayva tüylerine benzeyen ince çizgileri taklit edemez.

Senin yanağını hatırladığım için kirpiklerim gözyaşlarıyla ıslansa ne olur? Gülü elde etme ümidiyle dikene su vermek boşa değildir.

Gam gününde kılıcını hasta gönlümden esirgeme. Çünkü karanlık bir gecede hastaya su vermek hayırlı ve sevaptır.

Ey gönül! Sevgiliden ayrı kaldığımda onun oka benzeyen kirpiklerini iste ve kavuşma arzumu dindir. Bu çölde susuzum; bir kez olsun benim için su ara.

Ben senin dudağının özlemini çekiyorum, zahitler ise Kevser'i istiyor. Nitekim sarhoş olana şarap, ayık olana ise su hoş gelir.

Su, galiba o güzel yürüyüşlü serviye âşık olmuş; bir an bile durmadan onun bulunduğu cennet bahçesine doğru akıp gidiyor.

Sevgilinin bulunduğu yere gitmesini engellemek için suyun yolunu toprak olup kapatmalıyım. Çünkü su benim rakibimdir ve onun bulunduğu yere ulaşmasına izin vermek istemem.

Dostlar! Eğer sevgilinin elini öpme arzusu yüzünden ölürsem, toprağımdan bir testi yapın ve onunla sevgiliye su sunun.

Servi, kumrunun yalvarışlarına karşı dik başlılık ediyor. Öyleyse su onun eteğini tutup ayaklarına kapanarak yalvarsın.

Gül, bir hileyle bülbülün kanını içmek istiyor. Su ise gül dalının damarlarına girerek bülbülü kurtarsın.

Su, Hz. Ahmed-i Muhtâr'ın yoluna uymakla temiz yaradılışını bütün insanlara açıkça göstermiştir.

İnsanların efendisi, seçilmiş ve temizlenmiş inciler denizi olan Hz. Muhammed'in mucizeleri, kötülük sahiplerinin ateşlerine su serpmiştir; yani onların kötülüklerini ve zulümlerini söndürmüştür.

Peygamberlik gül bahçesinin güzelliğini ve canlılığını yeniden ortaya çıkarmak için Hz. Peygamber mucizesiyle sert taştan su çıkarmıştır.

Onun mucizesi dünyada uçsuz bucaksız bir deniz gibidir; bu mucizeden binlerce kâfirin ateş yanan tapınağına su ulaşmıştır.

Hz. Peygamber'in şiddetli bir susuzluk gününde parmaklarından Ensâr'a su verdiğini kim işitse hayretinden parmağını ısırır.

Hz. Peygamber'in dostu yılan zehri içse, o zehir onun için ölümsüzlük suyuna dönüşür. Düşmanı ise su içse, o su elbette yılan zehrine dönüşür.

Hz. Peygamber abdest almak için suyu gül gibi güzel yüzüne sürdüğünde, suyun her damlasından binlerce rahmet denizi dalgalanmıştır.

Su, onun ayağının bastığı toprağa ulaşabilmek için ömürler boyunca durmadan başını taştan taşa vurup avare bir şekilde dolaşmaktadır.

Su, onun dergâhının toprağına zerre zerre ışık saçmak ister. Parçalara ayrılsa bile o dergâhtan geri dönmez.

Günahkâr insanlar, senin na'tını ve övgünü tekrar tekrar söylemeyi bir çare olarak görürler. Tıpkı sarhoşların baş ağrılarını gidermek için su içmeleri gibi.

Ey Allah'ın sevgilisi! Ey insanların en hayırlısı! Susuzluktan dudakları kuruyan insanların sürekli su istemeleri gibi ben de sana büyük bir özlem duyuyorum.

Sen, Miraç gecesinde feyzinin çiy damlalarıyla sabit ve hareketli yıldızlara bile su ulaştırmış olan keramet denizisin.

Senin kabrini yenileyen mimarın suya ihtiyacı olsa, güneş çeşmesinden her an temiz ve tatlı bir feyiz suyu iner.

Cehennem korkusu, yanmakta olan gönlüme bir gam ateşi salmıştır. Fakat senin bağışlama ve iyilik bulutunun bu ateşe su serpeceğine dair umudum vardır.

Fuzûlî'nin sözleri, senin övgünü söylemenin uğuru sayesinde inciye dönüşmüştür. Nasıl ki nisan yağmurundan düşen bir su damlası değerli bir inciye dönüşürse, onun sözleri de inci gibi değer kazanmıştır.

Mahşer günü gaflet uykusundan uyanıp, sana duyulan hasretin gözyaşlarını uyanık gözlerden döktüğümde...

Umudum şudur ki kıyamet gününde senin yüzünü görmekten mahrum kalmayayım. Ben, senin güzel yüzünü görmeye susamış biriyim; kavuşma çeşmen bana su versin, yani bana vuslatını ve şefaatini nasip etsin.`,
            translit: `Saçma ey göz eşkden gönlümdeki odlara su
Kim bu denlü tutuşan odlara kılmaz çâre su

Âb-gûndur günbed-i devvâr rengi bilmezem
Yâ muhît olmuş gözümden günbed-i devvâre su

Zevk-i tîgundan aceb yok olsa gönlüm çâk çâk
Kim mürûr eyler iken bırakır rahneler dîvâre su

Vehm ile söyler dil-i mecrûh peykânun sözin
İhtiyât ile içer her kimde olsa yare su

Suya versün bağban gülzârı zahmet çekmesün
Bir gül açılmaz yüzün tek versem bin gülzâre su

Ohşadabilmez gubârını muharrir hattuna
Hâme tek bakmakdan inse gözlerine kare su

Ârızun yâdıyla nemnâk olsa müjgânım n'ola
Zâyi olmaz gül temennâsıyla vermek hâre su

Gam gecesi itme dil-i bîmârdan tîgun dirîg
Hayırdır vermek karanuluk gicede bîmâre su

İste peykânun gönül hicrinde şevkim sâkin it
Susuzum bir kez bu sahrâda benim çün ara su

Men lebün müştâkıyam zühhâd kevser tâlibi
Nitekim meste mey içmek hoş gelir hüşyâre su

Ravza-i kûyına her dem durmayup eyler güzer
Âşık olmuş gâlibâ ol serv-i hoş-reftâre su

Su yolın ol kûydan toprak olup tutsam gerek
Çün rakîbimdir dahi ol kûye koyman vâre su

Dest-bûsı ârzûsıyla ger ölürsem dostlar
Kûze eylen toprağum sunun anıla yâre su

Serv-i serkeşlik kılur kumriy niyâzından meğer
Dâmenin tutup ayağına düşe yalvara su

İçmek ister bülbülün kanın meğer bir rengile
Gül budağının mizâcına gire kurtara su

Tıynet-i pâkini rûşen kılmış ehl-i âleme
İktida kılmış tarîk-i Ahmed-i Muhtâr'a su

Seyyid-i nev-i beşer deryâ-yı dürr-i istifâ
Kim sepüpdür mucizâtı âteş-i eşrâre su

Kılmağıçun tâze gülzâr-ı nübüvvet revnakın
Mucizinden eylemiş izhâr seng-i hâre su

Mucizi bir bahr-i bî-pâyân imiş âlemde kim
Yetmiş andan bin bin âteş-hâneye kefâre su

Hayret ile parmağın dişler kim etse istimâ
Parmağından verdigi şiddet günü Ensâr'e su

Dostı ger zehr-i mâr içse olur âb-ı hayât
Hasmı su içse döner elbette zehr-i mâre su

Eylemiş her katreden bin bahr-i rahmet mevc-hîz
El sunup urgaç vuzû içün gül-i ruhsâre su

Hâk-i pâyine yetem dir ömrler dir muttasıl
Başını taşdan taşa urup gezer âvâre su

Zerre zerre hâk-i dergâhına ister sâla nûr
Dönmez ol dergâhdan ger olsa pâre pâre su

Zikr-i na'tin virdini dermân bilür ehl-i hatâ
Eyle kim def'-i humâr içün içer meyhâre su

Yâ Habîballah yâ Hayre'l-Beşer müştâkunam
Eyle kim leb-teşneler yansun diler hemvâre su

Sensin ol bahr-i kerâmet kim şeb-i mi'râcda
Şebnem-i feyzin yetürmüş sâbit ü seyyâre su

Çeşme-i hurşîdden her dem zülâl-i feyz iner
Hâcet olsa merkadin tecdîd iden mi'mâre su

Bîm-i dûzah nâr-ı gam salmış dil-i sûzânıma
Var ümîdim ebr-i ihsânun sepe ol nâre su

Yümn-i na'tından güher olmuş Fuzûlî sözleri
Ebr-i nîsandan dönen tek lü'lü-i şehvâre su

Hâb-ı gafletten aç gözüni bîdâr ol kim rûz-ı haşr
Eşk-i hasretden döker didare bîdâre su

Umduğum oldur ki rûz-ı haşr mahrûm olmayam
Çeşme-i vaslın veren teşne didâre su`,
            analysis: {
                document_type: 'Kaside (Na\'t-ı Nebevî)',
                confidence: 97,
                style: 'Osmanlı Türkçesi / Dinî-Edebî / Klasik Divan Üslubu',
                summary: 'Fuzûlî\'nin Su Kasidesi, Hz. Muhammed\'i övmek ve ona duyulan sevgi ile bağlılığı dile getirmek amacıyla yazılmış 32 beyitlik bir na\'ttır. Şair; su, ateş, gül, gözyaşı, Kevser ve rahmet gibi unsurlar üzerinden Hz. Peygamber\'in güzelliğini, üstünlüğünü ve mucizelerini anlatır.',
                key_points: [
                    'Eserin şairi Fuzûlî\'dir.',
                    'Özgün başlığı "Kaside Der-Na\'t-ı Hazret-i Nebevî"dir, "su" redifinden dolayı "Su Kasidesi" adıyla yaygınlaşmıştır.',
                    '32 beyitten oluşur, nazım şekli kaside, nazım türü na\'ttır.',
                    'Aruz kalıbı: Fâilâtün / Fâilâtün / Fâilâtün / Fâilün',
                    'Su, şiirin tamamında önemli bir sembol olarak kullanılır.'
                ],
                people: ['Fuzûlî (şair)', 'Hz. Muhammed / Ahmed-i Muhtâr (kasidede övülen kişi)', 'Ensâr', 'Zühhâd (zahitler)'],
                places: ['Ravza', 'Kûy', 'Sahrâ', 'Kevser', 'Mi\'rac'],
                concepts: ['Su', 'Aşk', 'Gözyaşı', 'Na\'t', 'Mucize', 'Kerâmet', 'Rahmet', 'Kevser', 'Gül', 'Vuslat', 'Şefaat'],
                script_type: 'Osmanlıca matbu yazı',
                script_purpose: 'Dinî-edebî şiir (na\'t)',
                period_estimate: '16. yüzyıl — Osmanlı Klasik Dönemi (Fuzûlî dönemi)',
                date_hijri: 'Belirtilmemiş',
                date_gregorian: 'Belirtilmemiş',
                notes: 'Görsel, özgün bir el yazması değil basılı/çoğaltılmış bir metin olduğundan güven skoru %100 verilmemiştir.'
            }
        },
        'mdo': {
            entity_info: {
            "concept:gülle": "Gülle, Türkçede aslen top mermisi anlamına gelse de, mekanik düzenek ve otomat tariflerinde (hiyel kitaplarında) oluk içinde yuvarlanan küçük, yuvarlak bir bilyeyi ifade etmek için de kullanılır. Bu belgede gülle, oluğun (mizab) içine yerleştirilip yuvarlanarak düzeneği harekete geçiren parça olarak tarif edilmektedir. Metinde, güllenin oluk içindeki hareketinin kolay olması için oluğun genişliğinin güllenin çapına uygun ayarlanması gerektiği belirtilir.",
            "concept:olukta": "Oluk (Arapça karşılığıyla mizab), bir sıvının veya katı bir cismin içinden geçerek yönlendirildiği, genellikle dar ve uzun kanal biçimindeki yapıya verilen genel addır. Bu teknik belgede oluk, güllenin (bilyenin) içinde yuvarlanarak hareket ettiği, genişliği güllenin çapına göre ayarlanması gereken ana mekanik kanalı ifade eder. Metinde, oluk üzerine konan işaretlerle güllelerin kesim/durma noktalarının nasıl belirleneceği ayrıntılı olarak anlatılmaktadır.",
            "concept:güllelerin": "Gülle, Türkçede aslen top mermisi anlamına gelse de, mekanik düzenek ve otomat tariflerinde (hiyel kitaplarında) oluk içinde yuvarlanan küçük, yuvarlak bir bilyeyi ifade etmek için de kullanılır. Bu belgede gülle, oluğun (mizab) içine yerleştirilip yuvarlanarak düzeneği harekete geçiren parça olarak tarif edilmektedir. Metinde, güllenin oluk içindeki hareketinin kolay olması için oluğun genişliğinin güllenin çapına uygun ayarlanması gerektiği belirtilir.",
            "concept:güllenin": "Gülle, Türkçede aslen top mermisi anlamına gelse de, mekanik düzenek ve otomat tariflerinde (hiyel kitaplarında) oluk içinde yuvarlanan küçük, yuvarlak bir bilyeyi ifade etmek için de kullanılır. Bu belgede gülle, oluğun (mizab) içine yerleştirilip yuvarlanarak düzeneği harekete geçiren parça olarak tarif edilmektedir. Metinde, güllenin oluk içindeki hareketinin kolay olması için oluğun genişliğinin güllenin çapına uygun ayarlanması gerektiği belirtilir.",
            "concept:bıçak ağzı": "Şefre, Osmanlı teknik/hiyel literatüründe genellikle ince, keskin kenarlı bir bıçak veya bıçak ağzı biçimindeki mekanik parçaya verilen addır. Bu belgede bıçak ağzı, demirden veya bakırdan yapılan, bir mil etrafında dönerek güllenin oluk içindeki hareketini yönlendiren/durduran hareketli bir parça olarak tarif edilir. Metne göre bu parçanın sapına bir delik açılıp mil geçirilerek düzeneğe monte edilmektedir.",
            "concept:mil": "Mil (Arapça karşılığıyla mihver), bir mekanik parçanın etrafında döndüğü ince, uzun eksen çubuğuna verilen addır. Bu belgede mil, bıçak ağzı (şefre) parçasının sapındaki delikten geçirilerek onun oluğun kenarlarındaki deliklere yerleştirilmesini ve parçanın bu eksen etrafında dönmesini sağlayan bileşen olarak geçer. Düzeneğin güllenin hareketine göre bıçak ağzını döndürüp durdurabilmesi, bu milin doğru yerleştirilmesine bağlıdır.",
            "concept:milin": "Mil (Arapça karşılığıyla mihver), bir mekanik parçanın etrafında döndüğü ince, uzun eksen çubuğuna verilen addır. Bu belgede mil, bıçak ağzı (şefre) parçasının sapındaki delikten geçirilerek onun oluğun kenarlarındaki deliklere yerleştirilmesini ve parçanın bu eksen etrafında dönmesini sağlayan bileşen olarak geçer. Düzeneğin güllenin hareketine göre bıçak ağzını döndürüp durdurabilmesi, bu milin doğru yerleştirilmesine bağlıdır.",
            "concept:bilye": "Bilye, küçük, yuvarlak ve sert bir topak/top şeklindeki nesnelere verilen genel addır; mekanik düzeneklerde genellikle yuvarlanarak hareket ileten bir parça olarak kullanılır. Bu belgede bilye, oluğun başına konulduğunda yuvarlanarak ilerleyen ve mekanizmayı tetikleyen küçük bir top olarak, metinde 'fındık' benzetmesiyle birlikte anılır. Düzenekteki gülle ile burada kastedilen bilye, işlevsel olarak aynı tür parçayı ifade etmektedir.",
            "concept:ağırlık": "Ağırlık (Arapça karşılığıyla sıkale), bir mekanik düzenekte denge veya hareket sağlamak amacıyla bir parçaya asılan veya eklenen kütleye verilen addır. Bu belgede ağırlık, ikinci bıçak ağzının (şefrenin) kuyruk kısmına takılarak, bir ucu aşağı inerken diğer ucun yukarı kalkmasını sağlayan, kaldıraç mantığıyla çalışan dengeleme parçası olarak tarif edilir. Metinde, iki bıçak ağzının birbirine göre ters yönde hareket etmesi bu ağırlığın sağladığı denge sayesinde gerçekleşmektedir."
            },
            word_alternatives: {
            "بونجاب": {"alternatives":[],"alternative_details":[],"origin":"Belirsiz (teknik terim, olası OCR bozulması)","ocr_form":"بونجاب"},
            "buncab": {"alternatives":[],"alternative_details":[],"origin":"Belirsiz (teknik terim, olası OCR bozulması)","ocr_form":"بونجاب"},
            "طوغانك": {"alternatives":[],"alternative_details":[],"origin":"Türkçe (\"doğan\" + iyelik eki)","ocr_form":"طوغانك"},
            "toğanın": {"alternatives":[],"alternative_details":[],"origin":"Türkçe (\"doğan\" + iyelik eki)","ocr_form":"طوغانك"},
            "doğan şeklindeki kaldıracın": {"alternatives":[],"alternative_details":[],"origin":"Türkçe (\"doğan\" + iyelik eki)","ocr_form":"طوغانك"},
            "تیز اره": {"alternatives":[],"alternative_details":[],"origin":"Farsça-Türkçe bileşik (\"tîz\" + \"ere/eğe\")","ocr_form":"تیز اره"},
            "tiz-ere": {"alternatives":[],"alternative_details":[],"origin":"Farsça-Türkçe bileşik (\"tîz\" + \"ere/eğe\")","ocr_form":"تیز اره"},
            "keskin testere": {"alternatives":[],"alternative_details":[],"origin":"Farsça-Türkçe bileşik (\"tîz\" + \"ere/eğe\")","ocr_form":"تیز اره"},
            "ياپيلمش": {"alternatives":[],"alternative_details":[],"origin":"Türkçe (\"yapmak\" fiilinin edilgen sıfat-fiili)","ocr_form":"ياپيلمش"},
            "yapılmış": {"alternatives":[],"alternative_details":[],"origin":"Türkçe (\"yapmak\" fiilinin edilgen sıfat-fiili)","ocr_form":"ياپيلمش"},
            "ذنبى": {"alternatives":[],"alternative_details":[],"origin":"Arapça (\"zeneb\" = kuyruk + iyelik eki)","ocr_form":"ذنبى"},
            "ẕenebi": {"alternatives":[],"alternative_details":[],"origin":"Arapça (\"zeneb\" = kuyruk + iyelik eki)","ocr_form":"ذنبى"},
            "kuyruğu": {"alternatives":[],"alternative_details":[],"origin":"Arapça kökenli terimin Türkçe karşılığı (\"zeneb\" = kuyruk)","ocr_form":"ذنبى"},
            "فرودينك": {"alternatives":[],"alternative_details":[],"origin":"Farsça-Türkçe bileşik (\"ferûd\" = iniş/alt + iyelik eki)","ocr_form":"فرودينك"},
            "ferūdīnüñ": {"alternatives":[],"alternative_details":[],"origin":"Farsça-Türkçe bileşik (\"ferûd\" = iniş/alt + iyelik eki)","ocr_form":"فرودينك"},
            "alt kısmının": {"alternatives":[],"alternative_details":[],"origin":"Farsça-Türkçe bileşik terimin Türkçe karşılığı (\"ferûd\" = iniş/alt)","ocr_form":"فرودينك"},
            "مسى": {"alternatives":["nühâsî"],"alternative_details":[{"text":"nühâsî","confidence":0.35,"confidence_percent":35}],"origin":"Arapça (olası \"nühâsî\" = bakırdan, kısaltılmış/bozuk okunuş)","ocr_form":"مسى"},
            "misī": {"alternatives":["nühâsî"],"alternative_details":[{"text":"nühâsî","confidence":0.35,"confidence_percent":35}],"origin":"Arapça (olası \"nühâsî\" = bakırdan, kısaltılmış/bozuk okunuş)","ocr_form":"مسى"},
            "bakır": {"alternatives":[],"alternative_details":[],"origin":"Arapça kökenli terimin Türkçe karşılığı (\"nühâs\" = bakır)","ocr_form":"مسى"},
            "منخفض": {"alternatives":[],"alternative_details":[],"origin":"Arapça (\"munhafıd\" = alçalmış, indirilmiş)","ocr_form":"منخفض"},
            "munḫafıż": {"alternatives":[],"alternative_details":[],"origin":"Arapça (\"munhafıd\" = alçalmış, indirilmiş)","ocr_form":"منخفض"},
            "alçalmıştır": {"alternatives":[],"alternative_details":[],"origin":"Arapça kökenli terimin Türkçe karşılığı (\"munhafıd\" = alçalmış)","ocr_form":"منخفض"}
            },
            file: 'assets/mdo.png',
            enhancedFile: 'assets/mdo-enhanced.jpg',
            name: 'mekanik_duzenek_oluk.png',
            size: '0.06 MB',
            ocr: `کله که نازل اولدقدن بر مقدار تکرار ایده بعده قصرك ایچنه **بونجاب** وضع
ایده و کاه قصرك اخرنده و بر طوق **طوغانك** اکثرسنه حواله اولوب و چونکه
طوغانك حرکتنه مانع اولمیه و بو میزابك وسعتی اولقدر اوله که ایچنده وضع
اولاجق بندقه بسهولتله حرکت ایده بعده اول میزاب ده مقطع بنادقی
تعیین ایده لر بو طریقله که بر دانه بندقه یی میزابه قویوب و میزابك کنارنده
ایکی علامت وضع ایده لر که بونون بعدی بندقه نك قطری قدر اولا و میزابك
بر کنارنده دخی اول علامت لره مقابل ایکی علامت دخی وضع ایدوب و هر ایکی
مقابلنده اولان علامت طرف میزابك کنار لرینی شعره صیغجق قدر **تیز اره**
عرضنده دك خرق ایده لر بعده تیمور دن یا نحاسدن بر شفره یعنی بیوك بچاق دوزرلر
یوزینك اوزنلغی میزابك انی قدر اولا و اول بچاغك صاپنك دخی یعنی
یوزینه متصل اولan یرندن بر دلوك دلوب و محور کچوره لر و اول محورك
ارضنه دك خرق ايده لر بعده تيموردن **ياپيلمش** بر شفره يعنى بيوك بيچاق اوزره
يوزينك اوزنلغى ميزابك انى قدر اولا و اول بيجاغك صابنك **ذنبى** يعنى
يوزينه متصل اولان يرندن بر دلوك دلوب محور كچوره لر و اول محورك
ايكى اوجلرينى ميزابك خرقلرينه وضع ايدوب **فرودينك** اوجنى دوندروب حلقم
كبى ايده‌لر و بو شفرة نك باشنه بر نسنه ياپشدره لر و كشفه ميزابك طوغانندن طرفه
طوغانك باشنه قريب يرده واقع اولا پس اگر ميزابك باشنه بر بنده وضع اولنسه
تكلونوب طوغان طرفه كدر تا واروب او كشفه يه طاينور و اگر شفرة نك ذنبنى
اشاغه چكسه كشفه نك باشنى حلقوب بندقه طوغانك باشنه دوشر بعده شكل
مزبور اوزره بر شفره دخی الوب ايكنجى خرقه ادخال ايده‌لر و بو شفرة نك باشنه
بر دلوك دله لر و اصه لر و ذنبنه بر ثقاله **مسى** شفرة اولينك باشنه اشاغه اولوب **ذنبى**
مرتفع اولمشدر و شفرة ثانيه نك باشنى مرتفع اولوب ذنبى **منخفض** اولمشدر بعده
الحق`,
            tr: `Gülle indikten sonra bir miktar tekrar ede, ondan sonra köşkün içine **buncab** yerleştirile ve bazen köşkün sonunda ve bir halka **doğan şeklindeki kaldıracın** çoğuna havale edilip ve çünkü kaldıracın hareketine engel olmaya ve bu oluğun genişliği o kadar ola ki içinde yerleştirilecek gülle kolaylıkla hareket ede, ondan sonra o olukta güllelerin kesim yerini belirleyeler. Bu yolla ki bir adet gülle oluğa konulup oluğun kenarında iki işaret koyalar ki bunun mesafesi güllenin çapı kadar ola ve oluğun bir kenarında dahi o işaretlere karşılık iki işaret dahi koyup her iki karşılıklı işarette oluğun kenarlarını kıl sığacak kadar **keskin testere** enince yarasalar. Ondan sonra demirden veya bakırdan bir bıçak ağzı yani büyük bıçak yapalar, yüzünün uzunluğu oluğun eni kadar ola ve o bıçağın sapının dahi yani yüzüne bitişik olan yerinden bir delik delip mil geçireler ve o milin...
Tabanına kadar delik açalar, sonra demirden **yapılmış** bir bıçak yani büyük bıçak üzerine, yüzünün uzunluğu oluğun eni kadar ola ve o bıçağın sapının **kuyruğu** yani yüzüne bitişik olan yerinden bir delik delip mil geçireler ve o milin iki ucunu oluğun deliklerine yerleştirip **alt kısmının** ucunu döndürüp boğaz gibi yapalar ve bu bıçağın başına bir şey yapıştıralar ve kepçe oluğun doğanından tarafa doğanın başına yakın yerde buluna. Sonra eğer oluğun başına bir fındık (bilye) konsa, yuvarlanıp doğan tarafına gider, ta gidip o kepçeye dayanır. Ve eğer bıçağın kuyruğunu aşağı çekse, kepçenin başını yutup fındık doğanın başına düşer. Sonra adı geçen şekil üzere bir bıçak daha alıp ikinci deliğe sokalar ve bu bıçağın başına bir delik delip asalar ve kuyruğuna bir **bakır** ağırlık koyalar. Birinci bıçağın başı aşağı olup **kuyruğu** yükselmiştir ve ikinci bıçağın başı yükselip kuyruğu **alçalmıştır**. Sonra...`,
            translit: `Gülle ki nazil oldukdan bir mikdar tekrar ide ba'deh kasrın içine **buncab** vaz'
ide ve gah kasrın ahırında ve bir tavk **toğanın** ekserisine havale olub ve çünki
toğanın hareketine mani' olmaya ve bu mizabın vüs'ati ol kadar ola ki içinde vaz'
olacak bendege bi-suhületle hareket ide ba'deh ol mizabda makta'-ı benadıkı
ta'yin ideler bu tarik ile ki bir dane bendegeyi mizaba koyub ve mizabın kenarında
iki 'alamet vaz' ideler ki bunun bu'du bendegenin kutru kadar ola ve mizabın
bir kenarında dahi ol 'alametlere mukabil iki 'alamet dahi vaz' idüb ve her iki
mukabilinde olan 'alamet taraf-ı mizabın kenarlarını şa'ra sığacak kadar **tiz-ere**
'arzındadek hark ideler ba'deh timürden ya nühasdan bir şefre ya'ni büyük bıçak düzerler
yüzünün uzunlığı mizabın eni kadar ola ve ol bıçağın sapının dahi ya'ni
yüzüne muttasıl olan yerinden bir delük delüb ve mihver geçüreler ve ol mihverin
arzına dek ḫarḳ ideler baʿdeh tīmūrdan **yapılmış** bir şafra yaʿnī büyük bıçaḳ üzere
yüzinüñ uzunlığı mīzābıñ eni ḳadar ola ve ol bıçağıñ ṣapınıñ **ẕenebi** yaʿnī
yüzine muttaṣıl olan yerinden bir delük delüb miḥver geçüreler ve ol miḥverüñ
iki uclarını mīzābıñ ḫarḳlarına vażʿ idüb **ferūdīnüñ** ucını dönderüb ḥalḳūm
gibi ideler ve bu şafranuñ başına bir nesne yapışdıralar ve keşfe mīzābıñ ṭoġanından ṭarafa
ṭoġanuñ başına ḳarīb yerde vāḳıʿ ola pes eger mīzābıñ başına bir bende vażʿ olunsah
tekerlenüb ṭoġan ṭarafına gider tā varub o keşfeye ṭayanur ve eger şafranuñ ẕenebini
aşaġa çekse keşfenüñ başını ḥalḳub bındıḳa ṭoġanuñ başına düşer baʿdeh şekil
mezbūr üzere bir şafra daḫı alub ikinci ḫarḳa idḫāl ideler ve bu şafranuñ başına
bir delük deleler ve aṣalar ve ẕenebine bir s̱iḳāle **misī** şafra-i evvelüñ başına aşaġa olub **ẕenebi**
murtefiʿ olmışdur ve şafra-i s̱āniyenüñ başını murtefiʿ olub ẕenebi **munḫafıż** olmışdur baʿdeh
el-ḥaḳ`,
            analysis: {
                document_type: "Yazma Eser / Teknik El Yazması",
                confidence: 90,
                style: "Teknik, açıklayıcı ve öğretici bir dil kullanılmıştır.",
                summary: "Belgede, mekanik bir düzenekte güllelerin hareket ettiği oluğun yapımı, işaretlenmesi ve bilyelerin geçişini kontrol edecek bıçak mekanizmasının montajı teknik detaylarıyla tarif edilmektedir. Belge, bilye, oluk, mil, ağırlık ve kaldıraç gibi parçalardan oluşan mekanik bir düzeneğin yapımını ve çalışma prensibini adım adım tarif etmektedir. Bu metin, muhtemelen El-Cezerî'nin ünlü mekanik eserinin Osmanlıca tercümelerinden bir kesittir.",
                key_points: [
                    "Mekanik bir düzenekte güllelerin (bilye) geçtiği oluğun (mizab) yapımı tarif edilmektedir.",
                    "Oluk üzerinde güllelerin kesim/işaretleme noktalarının nasıl belirleneceği anlatılmaktadır.",
                    "Demir veya bakırdan yapılan bir bıçak (şefre) mekanizmasının montajı açıklanmaktadır.",
                    "Bilyelerin geçişini kontrol eden kaldıraç ve ağırlık (sıkale) sistemi tarif edilmektedir.",
                    "Metin, muhtemelen El-Cezerî'nin mekanik araçlar hakkındaki eserinin Osmanlıca bir tercümesine aittir."
                ],
                people: [],
                places: [],
                concepts: ["Mizab (Oluk)", "Bendege / Bandıka (Gülle/Bilye)", "Mihver (Mil/Eksen)", "Şefre (Bıçak ağzı)", "Mekanik Düzenek", "Kaldıraç", "Mil", "Oluk", "Ağırlık"],
                script_type: "Nesih",
                script_purpose: "Teknik veya bilimsel bir eserin kopyalanması",
                period_estimate: "18. veya 19. Yüzyıl",
                date_hijri: "Belirtilmemiş",
                date_gregorian: "Belirtilmemiş",
                notes: "Metin, El-Cezeri'nin mekanik araçlar hakkındaki eserinin Osmanlıca tercümelerinden birine ait teknik bir tariftir."
            }
        },
        'svf': {
            entity_info: {
            "place:sivas": "Sivas, Orta Anadolu'da, Osmanlı döneminde önemli bir eyalet merkezi olan tarihî bir şehirdir; bölgenin idari, ticari ve dinî açıdan önde gelen merkezlerinden biriydi. Bu belgede Sivas, üzerinde Süleyman Paşa Vakfı'nın bulunduğu, vakıf yönetimiyle ilgili fermanın gönderildiği beylerbeyilik ve kadılık merkezi olarak geçmektedir.",
            "concept:beylerbeyi": "Beylerbeyi, Osmanlı taşra teşkilatında bir eyaletin en üst düzey askerî ve idari yöneticisine verilen unvandır. Bu belgede beylerbeyi, fermanın kendisine hitaben gönderildiği, Sivas eyaletinin en yetkili yöneticisi olarak anılmaktadır.",
            "concept:kadısı": "Kadı, Osmanlı adalet sisteminde İslam hukukuna (şer'î hukuka) göre yargı yetkisini kullanan, aynı zamanda bulunduğu kazada çeşitli idari görevleri de yürüten görevlidir. Bu belgede kadı, Sivas Beylerbeyi ile birlikte fermanın muhatabı olan, vakfın şartlarına uyulmasını denetlemekle görevli yerel yetkili olarak geçmektedir.",
            "concept:fermanı": "Ferman, padişahın bizzat verdiği, kanun hükmünde buyruk niteliğindeki resmî emirlere verilen addır. Bu belgede ferman, Sivas'taki Süleyman Paşa Vakfı'nın yönetim ve denetim işlerinin vakfiye şartlarına uygun yürütülmesini emreden padişah buyruğunu ifade etmektedir.",
            "person:süleyman paşa": "Bu belgede Süleyman Paşa, Sivas'ta kendi adını taşıyan vakfın (Süleyman Paşa Vakfı) banisi/kurucusu olarak anılmaktadır; kendisi hakkında metinde başka bir bilgi yer almamaktadır. Fermanın konusu, bu vakfın yönetim ve gelir şartlarının vakfiye hükümlerine uygun biçimde yürütülmesinin denetlenmesidir.",
            "concept:vakıf": "Vakıf, bir kişinin mal varlığının bir kısmını veya tamamını, dinî, hayrî veya sosyal bir amaca sürekli olarak tahsis etmesiyle oluşan, İslam hukukuna dayanan bir kurumdur. Bu belgede vakıf, Sivas'ta Süleyman Paşa tarafından kurulan ve yönetim/gelir şartlarına titizlikle uyulması istenen Süleyman Paşa Vakfı'nı ifade etmektedir.",
            "concept:fermanının": "Ferman, padişahın bizzat verdiği, kanun hükmünde buyruk niteliğindeki resmî emirlere verilen addır. Bu belgede ferman, Sivas'taki Süleyman Paşa Vakfı'nın yönetim ve denetim işlerinin vakfiye şartlarına uygun yürütülmesini emreden padişah buyruğunu ifade etmektedir."
            },
            word_alternatives: {
            "والاحترام": {"alternatives":[],"alternative_details":[],"origin":"Arapça (\"ve\" + \"el-ihtirâm\" = ve hürmet)","ocr_form":"والاحترام"},
            "ve'l-ihtirâm": {"alternatives":[],"alternative_details":[],"origin":"Arapça (\"ve\" + \"el-ihtirâm\" = ve hürmet)","ocr_form":"والاحترام"},
            "معدن العز والاجلال": {"alternatives":[],"alternative_details":[],"origin":"Arapça tamlama (\"izzet ve celalin kaynağı\")","ocr_form":"معدن العز والاجلال"},
            "ma'dinü'l-izzi ve'l-iclâl": {"alternatives":[],"alternative_details":[],"origin":"Arapça tamlama (\"izzet ve celalin kaynağı\")","ocr_form":"معدن العز والاجلال"},
            "اولان": {"alternatives":[],"alternative_details":[],"origin":"Türkçe (sıfat-fiil eki)","ocr_form":"اولان"},
            "olan": {"alternatives":[],"alternative_details":[],"origin":"Türkçe (sıfat-fiil eki)","ocr_form":"اولان"},
            "قدوة الاماثل": {"alternatives":[],"alternative_details":[],"origin":"Arapça tamlama (\"emsallerin/benzerlerinin örneği\")","ocr_form":"قدوة الاماثل"},
            "kudvetü'l-emâsil": {"alternatives":[],"alternative_details":[],"origin":"Arapça tamlama (\"emsallerin/benzerlerinin örneği\")","ocr_form":"قدوة الاماثل"},
            "زيدت فضائله": {"alternatives":[],"alternative_details":[],"origin":"Arapça dua formülü (\"faziletleri artsın\")","ocr_form":"زيدت فضائله"},
            "zîdet fezâilühû": {"alternatives":[],"alternative_details":[],"origin":"Arapça dua formülü (\"faziletleri artsın\")","ocr_form":"زيدت فضائله"},
            "توقيع رفيع همایون واصل اولیجاق معلوم اولا که": {"alternatives":[],"alternative_details":[],"origin":"Arapça-Türkçe bileşik (fermanların standart açılış formülü: \"yüce padişah fermanı ulaştığında bilinsin ki\")","ocr_form":"توقيع رفيع همایون واصل اولیجاق معلوم اولا که"},
            "tevkî'-i refî'-i hümâyûn vâsıl olıcak ma'lûm ola ki": {"alternatives":[],"alternative_details":[],"origin":"Arapça-Türkçe bileşik (fermanların standart açılış formülü: \"yüce padişah fermanı ulaştığında bilinsin ki\")","ocr_form":"توقيع رفيع همایون واصل اولیجاق معلوم اولا که"},
            "مضمون": {"alternatives":[],"alternative_details":[],"origin":"Arapça (\"içerik, muhteva\")","ocr_form":"مضمون"},
            "mazmûn-ı": {"alternatives":[],"alternative_details":[],"origin":"Arapça (\"içerik, muhteva\")","ocr_form":"مضمون"},
            "حكم همایون": {"alternatives":[],"alternative_details":[],"origin":"Arapça-Farsça tamlama (\"padişah hükmü/buyruğu\")","ocr_form":"حكم همایون"},
            "hükm-i hümâyûn": {"alternatives":[],"alternative_details":[],"origin":"Arapça-Farsça tamlama (\"padişah hükmü/buyruğu\")","ocr_form":"حكم همایون"},
            "تولیت و نظارت": {"alternatives":[],"alternative_details":[],"origin":"Arapça (vakıf idaresinde \"yöneticilik\" ve \"denetçilik\" görevleri)","ocr_form":"تولیت و نظارت"},
            "tevliyet ve nezâret": {"alternatives":[],"alternative_details":[],"origin":"Arapça (vakıf idaresinde \"yöneticilik\" ve \"denetçilik\" görevleri)","ocr_form":"تولیت و نظارت"},
            "وقفیه": {"alternatives":[],"alternative_details":[],"origin":"Arapça (\"vakıf senedi/belgesi\")","ocr_form":"وقفیه"},
            "vakfiye": {"alternatives":[],"alternative_details":[],"origin":"Arapça (\"vakıf senedi/belgesi\")","ocr_form":"وقفیه"},
            "موجبجه": {"alternatives":[],"alternative_details":[],"origin":"Arapça kökenli (\"mûcib\" = gerek + Türkçe ek, \"gereğince\")","ocr_form":"موجبجه"},
            "mûcebince": {"alternatives":[],"alternative_details":[],"origin":"Arapça kökenli (\"mûcib\" = gerek + Türkçe ek, \"gereğince\")","ocr_form":"موجبجه"},
            "عمل اولنمق": {"alternatives":[],"alternative_details":[],"origin":"Arapça-Türkçe bileşik (\"amel\" = iş/eylem + \"olunmak\", \"uygulanmak\")","ocr_form":"عمل اولنمق"},
            "amel olunmak": {"alternatives":[],"alternative_details":[],"origin":"Arapça-Türkçe bileşik (\"amel\" = iş/eylem + \"olunmak\", \"uygulanmak\")","ocr_form":"عمل اولنمق"},
            "سلیمان پاشا": {"alternatives":[],"alternative_details":[],"origin":"Özel isim (vakfın banisi)","ocr_form":"سلیمان پاشا"},
            "Süleyman Paşa": {"alternatives":[],"alternative_details":[],"origin":"Özel isim (vakfın banisi)","ocr_form":"سلیمان پاشا"},
            "وقفی": {"alternatives":[],"alternative_details":[],"origin":"Arapça (\"vakıf\" + Türkçe iyelik eki)","ocr_form":"وقفی"},
            "vakfı": {"alternatives":[],"alternative_details":[],"origin":"Arapça (\"vakıf\" + Türkçe iyelik eki)","ocr_form":"وقفی"},
            "شروطی": {"alternatives":[],"alternative_details":[],"origin":"Arapça (\"şart\" kelimesinin çoğulu + Türkçe iyelik eki, \"şartları\")","ocr_form":"شروطی"},
            "şurûtu": {"alternatives":[],"alternative_details":[],"origin":"Arapça (\"şart\" kelimesinin çoğulu + Türkçe iyelik eki, \"şartları\")","ocr_form":"شروطی"},
            "ضبط اولنمق": {"alternatives":[],"alternative_details":[],"origin":"Arapça-Türkçe bileşik (\"zapt edilmek, kayıt/denetim altına alınmak\")","ocr_form":"ضبط اولنمق"},
            "zabt olunmak": {"alternatives":[],"alternative_details":[],"origin":"Arapça-Türkçe bileşik (\"zapt edilmek, kayıt/denetim altına alınmak\")","ocr_form":"ضبط اولنمق"},
            "مخالف": {"alternatives":[],"alternative_details":[],"origin":"Arapça (\"aykırı, karşıt\")","ocr_form":"مخالف"},
            "muhâlif": {"alternatives":[],"alternative_details":[],"origin":"Arapça (\"aykırı, karşıt\")","ocr_form":"مخالف"},
            "عمل اولنمامق": {"alternatives":[],"alternative_details":[],"origin":"Arapça-Türkçe bileşik (\"uygulanmamak\", olumsuz çatı)","ocr_form":"عمل اولنمامق"},
            "amel olunmamak": {"alternatives":[],"alternative_details":[],"origin":"Arapça-Türkçe bileşik (\"uygulanmamak\", olumsuz çatı)","ocr_form":"عمل اولنمامق"},
            "استدعا": {"alternatives":[],"alternative_details":[],"origin":"Arapça (\"talep, rica\")","ocr_form":"استدعا"},
            "istid'â": {"alternatives":[],"alternative_details":[],"origin":"Arapça (\"talep, rica\")","ocr_form":"استدعا"},
            "اولندقده": {"alternatives":[],"alternative_details":[],"origin":"Türkçe (\"olunduğunda\", eski yazı zarf-fiil eki)","ocr_form":"اولندقده"},
            "olundukda": {"alternatives":[],"alternative_details":[],"origin":"Türkçe (\"olunduğunda\", eski yazı zarf-fiil eki)","ocr_form":"اولندقده"},
            "مقتضاسنجه": {"alternatives":[],"alternative_details":[],"origin":"Arapça kökenli (\"muktezâ\" = gerek + Türkçe ek, \"gereğince, icabınca\")","ocr_form":"مقتضاسنجه"},
            "muktezâsınca": {"alternatives":[],"alternative_details":[],"origin":"Arapça kökenli (\"muktezâ\" = gerek + Türkçe ek, \"gereğince, icabınca\")","ocr_form":"مقتضاسنجه"},
            "عمل اولنه": {"alternatives":[],"alternative_details":[],"origin":"Arapça-Türkçe bileşik, emir kipi (\"uygulansın\")","ocr_form":"عمل اولنه"},
            "amel oluna": {"alternatives":[],"alternative_details":[],"origin":"Arapça-Türkçe bileşik, emir kipi (\"uygulansın\")","ocr_form":"عمل اولنه"},
            "دیو": {"alternatives":[],"alternative_details":[],"origin":"Türkçe (eski yazımla \"diye\")","ocr_form":"دیو"},
            "deyü": {"alternatives":[],"alternative_details":[],"origin":"Türkçe (eski yazımla \"diye\")","ocr_form":"دیو"},
            "مهر شریف": {"alternatives":[],"alternative_details":[],"origin":"Arapça tamlama (\"şerefli/kutsal mühür\", padişah mührü)","ocr_form":"مهر شریف"},
            "mühr-i şerîf": {"alternatives":[],"alternative_details":[],"origin":"Arapça tamlama (\"şerefli/kutsal mühür\", padişah mührü)","ocr_form":"مهر شریف"},
            "وقف شروطی": {"alternatives":[],"alternative_details":[],"origin":"Arapça-Türkçe bileşik (\"vakıf şartları\")","ocr_form":"وقف شروطی"},
            "vakıf şurûtu": {"alternatives":[],"alternative_details":[],"origin":"Arapça-Türkçe bileşik (\"vakıf şartları\")","ocr_form":"وقف شروطی"},
            "درباره": {"alternatives":[],"alternative_details":[],"origin":"Farsça (\"hakkında, ile ilgili\")","ocr_form":"درباره"},
            "der-bâre-i": {"alternatives":[],"alternative_details":[],"origin":"Farsça (\"hakkında, ile ilgili\")","ocr_form":"درباره"},
            "مخالفت": {"alternatives":[],"alternative_details":[],"origin":"Arapça (\"aykırılık, karşı çıkma\")","ocr_form":"مخالفت"},
            "muhâlefet": {"alternatives":[],"alternative_details":[],"origin":"Arapça (\"aykırılık, karşı çıkma\")","ocr_form":"مخالفت"},
            "جدید": {"alternatives":[],"alternative_details":[],"origin":"Arapça (\"yeni\")","ocr_form":"جدید"},
            "cedîd": {"alternatives":[],"alternative_details":[],"origin":"Arapça (\"yeni\")","ocr_form":"جدید"},
            "اجرا": {"alternatives":[],"alternative_details":[],"origin":"Arapça (\"icra, yürütme\")","ocr_form":"اجرا"},
            "icrâ": {"alternatives":[],"alternative_details":[],"origin":"Arapça (\"icra, yürütme\")","ocr_form":"اجرا"},
            "اولنمق": {"alternatives":[],"alternative_details":[],"origin":"Türkçe (edilgen fiil eki)","ocr_form":"اولنمق"},
            "olunmak": {"alternatives":[],"alternative_details":[],"origin":"Türkçe (edilgen fiil eki)","ocr_form":"اولنمق"},
            "في اواسط": {"alternatives":[],"alternative_details":[],"origin":"Arapça (\"-de/-da\" + \"ortalar\", \"...ayının ortalarında\")","ocr_form":"في اواسط"},
            "fî evâsıt-ı": {"alternatives":[],"alternative_details":[],"origin":"Arapça (\"-de/-da\" + \"ortalar\", \"...ayının ortalarında\")","ocr_form":"في اواسط"},
            "شعبان": {"alternatives":[],"alternative_details":[],"origin":"Arapça (Hicrî takvimde sekizinci ay adı)","ocr_form":"شعبان"},
            "Şa'bân": {"alternatives":[],"alternative_details":[],"origin":"Arapça (Hicrî takvimde sekizinci ay adı)","ocr_form":"شعبان"},
            "سنه": {"alternatives":[],"alternative_details":[],"origin":"Arapça (\"yıl, sene\")","ocr_form":"سنه"},
            "sene": {"alternatives":[],"alternative_details":[],"origin":"Arapça (\"yıl, sene\")","ocr_form":"سنه"},
            "تسع وتسعين": {"alternatives":[],"alternative_details":[],"origin":"Arapça sayı (\"doksan dokuz\")","ocr_form":"تسع وتسعين"},
            "tis'a ve tis'în": {"alternatives":[],"alternative_details":[],"origin":"Arapça sayı (\"doksan dokuz\")","ocr_form":"تسع وتسعين"}
            },
            file: 'assets/svf.png',
            enhancedFile: 'assets/svf-enhanced.jpg',
            name: 'sivas_vakif_fermani.png',
            size: '1.93 MB',
            ocr: `۱ امير الامراء الكرام الكبار ذوي الاقدار **والاحترام** **معدن العز والاجلال**
۲ سیواس بگربگیسی **اولان** **قدوة الاماثل**
۳ سیواس قاضیسی **زيدت فضائله** **توقيع رفيع همایون واصل اولیجاق معلوم اولا که**
۴ توقيع رفيع همایون واصل اولیجاق معلوم اولا که **مضمون** **حكم همایون**
۵ **تولیت و نظارت** **وقفیه** **موجبجه** **عمل اولنمق**
۶ سیواسده **سلیمان پاشا** **وقفی** **شروطی** **موجبجه**
۷ **ضبط اولنمق** **مخالف** **عمل اولنمامق**
۸ **وقفیه** **موجبجه** **عمل اولنمق** **استدعا** **اولندقده**
۹ **مقتضاسنجه** **عمل اولنه** **دیو** **حكم همایون**
۱۰ **مهر شریف** **موجبجه** **عمل اولنه**
۱۱ **وقف شروطی** **موجبجه** **عمل اولنه**
۱۲ **موجبجه** **عمل اولنه** **درباره** **مخالفت**
۱۳ **جدید** **وقفیه** **موجبجه** **عمل اولنه**
۱۴ **مضمون** **حكم همایون** **موجبجه** **عمل اولنه**
۱۵ **موجبجه** **عمل اولنه** **دیو** **حكم همایون**
۱۶ **اجرا** **اولنمق** **مخالف** **عمل اولنمامق**
۱۷ **في اواسط** **شعبان** **سنه** **تسع وتسعين**`,
            tr: `1. Emirlerin emiri; cömertlik ve güç sahibi büyüklerin en büyüğü, şeref ve yüceliğin kaynağı olan...
2. Sivas Beylerbeyi, seçkin kişilerin örneği olan...
3. Sivas Kadısı'na — Allah faziletini artırsın.
4. Yüce padişahın fermanı ulaştığında bilinsin ki padişahın emrinin içeriği şöyledir:
5. Vakfın yönetim ve denetim işlerinin vakfiye hükümlerine uygun olarak yürütülmesi,
6. Sivas'taki Süleyman Paşa Vakfı'nın vakfiye şartlarına uygun biçimde işletilmesi,
7. Vakfın yönetilip denetlenmesi ve bu şartlara aykırı davranılmaması,
8. Vakfiye hükümlerine uygun hareket edilmesi talep edildiğinde,
9. Bu hükümlere uygun davranılması emredilmiştir.
10. Padişahın kutsal mührü gereğince hareket edilsin.
11. Vakfın şartlarına uygun hareket edilsin.
12. Vakıf şartlarına aykırı davranılmaması konusunda...
13. Yeni vakfiye hükümlerine uygun hareket edilsin.
14. Padişah fermanının içeriğine uygun hareket edilsin.
15. Bu hükümlere uygun davranılması padişahın emridir.
16. Emir yerine getirilsin ve aksine davranılmasın.
17. Şaban ayının ortalarında, 99 yılında...`,
            translit: `1 Emîrü'l-ümerâi'l-kirâmi'l-kibâr zevi'l-akdâr **ve'l-ihtirâm** **ma'dinü'l-izzi ve'l-iclâl**
2 Sivas beylerbeyisi **olan** **kudvetü'l-emâsil**
3 Sivas kadısı **zîdet fezâilühû** **tevkî'-i refî'-i hümâyûn vâsıl olıcak ma'lûm ola ki**
4 tevkî'-i refî'-i hümâyûn vâsıl olıcak ma'lûm ola ki **mazmûn-ı** **hükm-i hümâyûn**
5 **tevliyet ve nezâret** **vakfiye** **mûcebince** **amel olunmak**
6 Sivas'ta **Süleyman Paşa** **vakfı** **şurûtu** **mûcebince**
7 **zabt olunmak** **muhâlif** **amel olunmamak**
8 **vakfiye** **mûcebince** **amel olunmak** **istid'â** **olundukda**
9 **muktezâsınca** **amel oluna** **deyü** **hükm-i hümâyûn**
10 **mühr-i şerîf** **mûcebince** **amel oluna**
11 **vakıf şurûtu** **mûcebince** **amel oluna**
12 **mûcebince** **amel oluna** **der-bâre-i** **muhâlefet**
13 **cedîd** **vakfiye** **mûcebince** **amel oluna**
14 **mazmûn-ı** **hükm-i hümâyûn** **mûcebince** **amel oluna**
15 **mûcebince** **amel oluna** **deyü** **hükm-i hümâyûn**
16 **icrâ** **olunmak** **muhâlif** **amel olunmamak**
17 **fî evâsıt-ı** **Şa'bân** **sene** **tis'a ve tis'în**`,
            analysis: {
                document_type: "Ferman",
                confidence: 85,
                style: "Resmî, bürokratik ve diplomatik Osmanlı Türkçesi ile yazılmış divanî üslup.",
                summary: "Sivas Beylerbeyi ve Sivas Kadısı'na hitaben gönderilen bu ferman, Sivas'ta bulunan bir vakfın tevliyet, nezaret ve vakıf şartlarına dair yaşanan ihtilafların çözülmesini konu almaktadır. Belgede, vakıf kayıtlarının ve yeni defterlerin incelenerek vakfiyedeki şartlara titizlikle uyulması emredilmektedir.",
                key_points: [
                    "Sivas Beylerbeyi ve Sivas Kadısı'na hitaben yazılmıştır.",
                    "Sivas'taki vakfın tevliyet ve nezaret şartları ile vakıf gelirlerinin idaresi ele alınmaktadır.",
                    "Vakıf şartlarının (şurût-ı vakfiye) ve yeni defter kayıtlarının (defter-i cedid) esas alınması emredilmektedir.",
                    "Vakıf işlerine dışarıdan müdahale edilmemesi ve şer'î hükümlere göre hareket edilmesi vurgulanmaktadır."
                ],
                people: ["Süleyman Paşa"],
                places: ["Sivas"],
                concepts: ["Ferman", "Vakıf", "Beylerbeyi", "Kadı"],
                script_type: "Divanî",
                script_purpose: "Devlet kararlarının ve emirlerinin taşradaki görevlilere tebliği",
                period_estimate: "17. Yüzyıl Sonu (Sultan II. Süleyman veya Sultan II. Ahmed dönemi)",
                date_hijri: "Evâsıt-ı Şa'bân 1099",
                date_gregorian: "Haziran 1688",
                notes: "Belge, Sivas'taki Süleyman Paşa Vakfı'nın idari ve mali işleyişine dair padişah fermanıdır. Metinde vakfiye şartlarına uyulması ve muhalif hareket edilmemesi mükerrer şekilde vurgulanmıştır."
            }
        },
        'yeni2': {
            entity_info: {
            "concept:dilekçeyi": "Dilekçe (Osmanlıca karşılığıyla arzuhal), bir kişinin bir talebini, şikâyetini veya durumunu resmî bir makama yazılı olarak bildirdiği belgedir. Bu belgede dilekçe, yazarın yıllardır padişahın yüce makamına defalarca sunduğu, ancak hiçbir sonuç alamadığı başvuruları ifade etmektedir.",
            "person:reşid paşa": "Mustafa Reşid Paşa (1800-1858), Tanzimat Fermanı'nın mimarı olarak bilinen, Osmanlı Devleti'nde birkaç kez sadrazamlık yapmış önemli bir devlet adamı ve reformcudur. Bu belgede Reşid Paşa, dilekçe sahibinin 1274 (Hicrî) yılında bizzat kendisine de bir dilekçe sunduğu, belgenin yazıldığı sırada vefat etmiş olan eski sadrazam olarak anılmaktadır.",
            "concept:dilekçe": "Dilekçe (Osmanlıca karşılığıyla arzuhal), bir kişinin bir talebini, şikâyetini veya durumunu resmî bir makama yazılı olarak bildirdiği belgedir. Bu belgede dilekçe, yazarın yıllardır padişahın yüce makamına defalarca sunduğu, ancak hiçbir sonuç alamadığı başvuruları ifade etmektedir.",
            "concept:dilekçem": "Dilekçe (Osmanlıca karşılığıyla arzuhal), bir kişinin bir talebini, şikâyetini veya durumunu resmî bir makama yazılı olarak bildirdiği belgedir. Bu belgede dilekçe, yazarın yıllardır padişahın yüce makamına defalarca sunduğu, ancak hiçbir sonuç alamadığı başvuruları ifade etmektedir.",
            "concept:meclis-i vâlâ": "Meclis-i Vâlâ (Meclis-i Vâlâ-yı Ahkâm-ı Adliye), Tanzimat döneminde kurulan, kanun tasarılarını hazırlayan ve bazı yüksek yargı/idari işlere bakan üst düzey bir devlet kuruludur. Bu belgede Meclis-i Vâlâ, dilekçe sahibinin başvurularının havale edildiği, ancak sonuçlandırılmadığı merkezi kurum olarak geçmektedir.",
            "concept:dilekçenin": "Dilekçe (Osmanlıca karşılığıyla arzuhal), bir kişinin bir talebini, şikâyetini veya durumunu resmî bir makama yazılı olarak bildirdiği belgedir. Bu belgede dilekçe, yazarın yıllardır padişahın yüce makamına defalarca sunduğu, ancak hiçbir sonuç alamadığı başvuruları ifade etmektedir.",
            "concept:hazine-i hassa": "Hazine-i Hassa, Osmanlı Devleti'nde padişahın özel/şahsi mal varlığını ve gelirlerini yöneten hazine kurumudur. Bu belgede Hazine-i Hassa, dilekçe sahibinin başvurularının Meclis-i Vâlâ tarafından havale edildiği, ancak gerekli yanıtın hiç verilmediği kurum olarak anılmaktadır.",
            "concept:dilekçelerime": "Dilekçe (Osmanlıca karşılığıyla arzuhal), bir kişinin bir talebini, şikâyetini veya durumunu resmî bir makama yazılı olarak bildirdiği belgedir. Bu belgede dilekçe, yazarın yıllardır padişahın yüce makamına defalarca sunduğu, ancak hiçbir sonuç alamadığı başvuruları ifade etmektedir.",
            "concept:dilekçelerin": "Dilekçe (Osmanlıca karşılığıyla arzuhal), bir kişinin bir talebini, şikâyetini veya durumunu resmî bir makama yazılı olarak bildirdiği belgedir. Bu belgede dilekçe, yazarın yıllardır padişahın yüce makamına defalarca sunduğu, ancak hiçbir sonuç alamadığı başvuruları ifade etmektedir.",
            "concept:tanzimat": "Tanzimat, 1839'da Gülhane Hatt-ı Hümayunu'nun ilanıyla başlayan, Osmanlı Devleti'nde hukuk, idare ve mali alanlarda köklü reformlar yapılan dönemi ifade eder. Bu belgede Tanzimat, dilekçe sahibinin daha önce bu reformlarla ilgili yaptığı açıklamaların/taleplerin de yerine getirilmesini istediği bağlamda anılmaktadır."
            },
            word_alternatives: {},
            file: 'assets/yeni2.png',
            enhancedFile: 'assets/yeni2-enhanced.jpg',
            name: 'cozume_kavusmayan_mesele_dilekcesi.png',
            size: '0.69 MB',
            ocr: `بو عبد كمزلری یتمش بر دیتمش اوچ تاریخلرنده ركاب قریاب حضرت شهناهیه اوچ قطعه عی محال تقدیم زارلغی سنیهلری سنوح ایتمش ایسه بر كونه نمره حاصلهسی مشاهده اولنامامش و یتمش درت اریخنده دخی صدر سابق
متوفی رسشید پاشایه دفعه بر قطعه عرضحان تقدیم ایله سنه جاله ماه صفرالخیرینك طقوزی تاریخنده مجلس والایه لدی الحواله ماه مذكورك اون وردی تاریخنده مذكور درت قطعه عرضحالین عاج انم
خنینه خاصهیه حواله بیورولمش ایسه ده الی الان اجویه الازمهسی تریر اولنمیهرق عرضحالات مزبوره عبداندن دسترس اولنامامش و خصوصات واقعه چكانم نه صورت كسب ایدهجكی معلوم اولارقن
و حكهیی نوالری ایسه مصلح واقنه عاجرانهنك امر تسیهسی ضمننده اوچ درت سنه مدور اوغراشمقده و سفیلا و ذلیلا خان كوسهلرنده سورتمكده بولنمش اولدیغم حاكده
خصوصات عاجزانهنك بو وجهیله مدت مدینده عدم روی و تسیسی حق عاجرانهمده غدر كلییی بوجب و قیون كیرهیه وجار اولمقلغمی مستوجب اولمش و بوكا
مراحم عالیه صدارتپناهیلری بر وجهله قایل اولهجغی امر بریهسی بولنمش اولدیغندن عرضحالات مزبوره بینكانهنك ظاهره اخراجیله
رویت و یسوسی حقنده مساعفه علیه خدیوانهلرینك معطوف و پشایانی ویاخود قلمه فرمان بیورلری و تنظیماتجه
و قوعبولان افادات بندكانهنك امراجر اسی بابنده هم جلیله افانهلرینك منذول و سزاواربورهسی
معرفتنده مذكره اكتدازم تاقیم و خاكیلای حاجنرری داورانهلرینه تقدیم قلنمش
اولمین اول بابده و هر حرلره امادمان حضرت من لهلامركدر۔`,
            tr: `Bu dilekçeyi, 1271 ve 1273 yıllarında padişahın yüce makamına üç ayrı kez sunmuş olmama rağmen herhangi bir sonuç alamadım. 1274 yılında da eski sadrazam merhum Reşid Paşa'ya bir dilekçe daha verdim. Bu dilekçem, aynı yılın Safer ayının dokuzuncu günü Meclis-i Vâlâ'ya gönderildi. Ardından, ayın on dördünde, daha önce sunduğum dört dilekçenin Hazine-i Hassa'ya iletilmesi emredildi. Ancak bugüne kadar gerekli cevaplar yazılmadığı için dilekçelerime ilişkin herhangi bir sonuç elde edemedim.
İçinde bulunduğum durumun nasıl sonuçlanacağı hâlâ belirsizdir. Oysa söz konusu sorunun çözüme kavuşturulması için üç dört yıldır uğraşmakta, han köşelerinde sefil ve perişan bir hâlde yaşamaktayım.
Sorunumun bu kadar uzun süre ele alınmaması ve sonuçlandırılmaması, benim için büyük bir haksızlığa yol açmış; beni ve ailemi ciddi sıkıntılara sürüklemiştir. Bu durumun daha fazla devam etmesi, çok sayıda insanın mağdur olmasına da neden olacaktır.
Bu nedenle, yüce makamınızın merhametine sığınarak daha önce sunduğum dilekçelerin yeniden ortaya çıkarılmasını, incelenmesini ve gerekli işlemlerin tamamlanmasını saygıyla arz ederim. Ayrıca, Tanzimat işleriyle ilgili daha önce yaptığım açıklamaların yerine getirilmesi için de gerekli emirlerin verilmesini ve bu konuda gereken desteğin sağlanmasını rica ederim.
Bu dilekçem, durumumun değerlendirilmesi ve gereğinin yapılması amacıyla yüksek makamınıza sunulmuştur.
Bu konuda karar ve emir, yetkili makamınıza aittir.`,
            translit: `bu abd-i gümrükleri yetmiş bir ve yetmiş üç tarihlerinde rikâb-ı kudret-yâb-ı hazret-i şehinşâhîye üç kıta mahal takdim-zârlığı seniyyeleri sünûh etmiş ise bir gûne semere-i hâsılası müşahede olunamamış ve yetmiş dört tarihinde dahi sadr-ı sâbık
müteveffâ Reşid Paşaya defa bir kıta arzuhâl takdim ile sene-i celîle mâh-ı Saferül-hayrının dokuzu tarihinde Meclis-i Vâlâya ledel-havale mâh-ı mezkûrun on dördü tarihinde mezkûr dört kıta arzuhâlin âcizânem
Hazine-i Hassaya havale buyurulmuş ise de ile'l-ân ecvibe-i lâzımesi tahrir olunmayarak arzuhâlât-ı mezbûre ubeydânemden dest-res olunamamış ve hususât-ı vâkı'a-i çâkerânem ne suret kesb edeceği malum olarak
ve hâk-i pâ-yı nevâları ise maslahat-ı vâkıa-i âcizânenin emr-i tesviyesi zımnında üç dört sene müdevver uğraşmakda ve sefilen ve zelilen han köşelerinde sürünmekde bulunmuş olduğum hâlde
husûsât-ı âcizânenin bu vechile müddet-i medîde adem-i rü'yet ve tesessüsü hakk-ı âcizânemde gadr-ı küllîyi mûcib ve koyun-ı kesîreye vâcib olmaklığımı müstevcib olmuş ve buna
merâhim-i aliyye-i Sadâret-penâhîleri bir vechile kâbil olacağı emr-i berriyesi bulunmuş olduğundan arzuhâlât-ı mezbûre-i bendegânenin zâhire ihracıyla
rü'yet ve tesviyesi hakkında müsâafe-i aliyye-i hidivânelerinin ma'tûf ve şâyânı veyahud kaleme fermân buyurulması ve Tanzimatça
vukû' bulan ifâdât-ı bendegânenin emr-i icrâsı bâbında himem-i celîle-i âsafânelerinin mebzûl ve sezâvâr-pûresi
marifetiyle müzekkire-i iktidârım terkîm ve hâk-i pây-ı hâcet-redîf-i dâverânelerine takdim kılınmış
olmağın ol bâbda ve her halde ifade-i hâl hazret-i men lehül-emrindir.`,
            analysis: {
                document_type: "Dilekçe (Arzuhal)",
                confidence: 75,
                style: "Resmî, bürokratik arzuhal üslubu; mağduriyet bildiren ricacı bir dil",
                summary: "Dilekçe sahibi, 1271, 1273 ve 1274 (Hicrî) yıllarında padişahın yüce makamına defalarca başvurduğunu, dilekçelerinin Meclis-i Vâlâ ve Hazine-i Hassa'ya havale edildiğini ancak yıllardır hiçbir sonuç alamadığını anlatmaktadır. Üç dört yıldır perişan bir hâlde beklediğini belirterek, daha önceki dilekçelerinin yeniden incelenmesini ve Tanzimat'la ilgili taleplerinin yerine getirilmesini saygıyla rica etmektedir.",
                key_points: [
                    "Dilekçe sahibi, 1271 ve 1273 yıllarında üç kez padişaha başvurmuş, sonuç alamamıştır.",
                    "1274 yılında eski sadrazam merhum Reşid Paşa'ya ayrıca bir dilekçe daha sunmuştur.",
                    "Dilekçeler Meclis-i Vâlâ üzerinden Hazine-i Hassa'ya havale edilmiş, ancak gerekli cevaplar hiç yazılmamıştır.",
                    "Başvuru sahibi üç dört yıldır sorununun çözümünü beklediğini ve bu süreçte perişan bir hâlde yaşadığını belirtmektedir.",
                    "Dilekçelerinin yeniden incelenmesini ve Tanzimat'la ilgili taleplerinin yerine getirilmesini rica etmektedir."
                ],
                people: ["Reşid Paşa"],
                places: [],
                concepts: ["Meclis-i Vâlâ", "Hazine-i Hassa", "Tanzimat", "dilekçe"],
                script_type: "Rik'a",
                script_purpose: "Şikâyet/talep dilekçesi (arzuhal) — üst makama mağduriyet arzı",
                period_estimate: "Tanzimat Dönemi",
                date_hijri: "1271-1274 (metinde adı geçen yıllar)",
                date_gregorian: "1854-1858 civarı (tahminî)",
                notes: "Dilekçenin kendisi, metinde adı geçen 1271/1273/1274 (Hicrî) tarihlerinden sonra, yazarın 'üç dört yıldır uğraştığını' belirtmesinden hareketle daha geç bir tarihte kaleme alınmış olmalıdır; ancak kesin yazılış tarihi metinde belirtilmemiştir. Görsel, el yazısı (rik'a) bir arzuhal örneğidir."
            }
        },
        'hbv': {
            entity_info: {
            "person:tayyib baba": "Bu belgede merhum Tayyib Baba, Hacı Bayram Veli Vakfı'nın mütevellilik, şeyhlik ve zaviyedarlık görevlerini daha önce yürütmüş olan ve oğlu Seyyid Muhammed Said Baba'nın bu görevleri ondan devraldığı kişi olarak anılmaktadır; kendisi hakkında metinde başka bir bilgi yer almamaktadır.",
            "person:seyyid muhammed said baba": "Bu belgede Seyyid Muhammed Said Baba, Tayyib Baba'nın oğlu olup, Ankara'daki Hacı Bayram Veli Vakfı'nın mütevellilik, şeyhlik ve zaviyedarlık görevlerini babasından devralan, ancak bir süre haksız yere bu görevlerden uzaklaştırılıp padişah beratıyla tekrar bu görevlere iade edilen kişidir.",
            "place:ankara": "Ankara, İç Anadolu'da, Hacı Bayram Veli'nin türbesi ve ona bağlı vakfın bulunduğu tarihî bir şehirdir. Bu belgede Ankara, mütevellilik, şeyhlik ve zaviyedarlık görevlerine dair ihtilafın konusu olan Hacı Bayram Veli Vakfı'nın bulunduğu yer olarak anılmaktadır.",
            "concept:vakıf": "Vakıf, bir kişinin mal varlığının bir kısmını veya tamamını dinî, hayrî veya sosyal bir amaca sürekli olarak tahsis etmesiyle oluşan, İslam hukukuna dayanan bir kurumdur. Bu belgede vakıf, Ankara'daki Hacı Bayram Veli Vakfı'nı ifade etmekte, belgenin konusu bu vakfın yönetim görevlerine (mütevellilik, şeyhlik, zaviyedarlık) ilişkin bir ihtilaftır.",
            "person:seyyid halil baba": "Bu belgede Seyyid Halil Baba, haksız yere görev talep eden Seyyid Kasım Baba'nın babası olarak anılmaktadır; kendisi hakkında metinde başka bir bilgi yer almamaktadır.",
            "person:seyyid kasım baba": "Bu belgede Seyyid Kasım Baba, Seyyid Halil Baba'nın oğlu olup, kendisinin Hacı Bayram Veli Vakfı görevlerine en layık evlat ve akraba olduğunu ileri sürerek çeşitli yollarla bir berat çıkarttıran ve bu sayede Seyyid Muhammed Said Baba'yı görevlerinden haksız yere uzaklaştıran kişi olarak anılmaktadır.",
            "concept:berat": "Berat, padişahın bir kişiye belirli bir görev, unvan, imtiyaz veya gelir tahsis ettiğini bildiren resmî belgedir. Bu belgenin kendisi, Seyyid Muhammed Said Baba'ya Hacı Bayram Veli Vakfı'ndaki görevlerini iade eden bir berattır.",
            "concept:mütevellilik": "Mütevellilik, bir vakfın idaresinden, gelirlerinin toplanıp vakfiye şartlarına göre harcanmasından sorumlu yöneticilik görevidir. Bu belgede mütevellilik, Hacı Bayram Veli Vakfı için Seyyid Muhammed Said Baba'ya babasından miras kalan ve bir süre haksız yere elinden alınan görevlerden biridir.",
            "concept:şeyhlik": "Şeyhlik, bir tarikatın veya tekkenin manevi önderliği ve irşad görevine verilen addır. Bu belgede şeyhlik, Hacı Bayram Veli Vakfı'na bağlı tekkenin manevi önderlik görevi olarak, mütevellilik ve zaviyedarlıkla birlikte Seyyid Muhammed Said Baba'ya iade edilen görevlerden biridir.",
            "concept:zaviyedarlık": "Zaviyedarlık, bir zaviyenin (küçük tekke/dergâh) işletilmesinden ve orada konaklayan dervişlere/yolculara hizmet edilmesinden sorumlu görevliliktir. Bu belgede zaviyedarlık, Hacı Bayram Veli Vakfı'na bağlı zaviyenin yönetim görevi olarak, mütevellilik ve şeyhlikle birlikte Seyyid Muhammed Said Baba'ya iade edilen görevlerden biridir.",
            "concept:şeyhülislam": "Şeyhülislam, Osmanlı Devleti'nde din işlerinin en üst makamı olup, fetva verme yetkisine sahip baş müftüdür. Bu belgede Şeyhülislam Mevlânâ Ahmed Esad, Seyyid Muhammed Said Baba'nın görevlerinin iadesi konusunda görüşü alınan, kararın onaylanmasında etkili olan üst düzey din görevlisi olarak anılmaktadır.",
            "person:mevlânâ ahmed esad": "Bu belgede Mevlânâ Ahmed Esad, dönemin Şeyhülislamı olup, büyük âlimlerin en bilgini ve takva sahiplerinin en faziletlisi olarak nitelenen, Seyyid Muhammed Said Baba'nın görevlerinin iadesi kararına işaretiyle katkıda bulunan din görevlisidir.",
            "concept:beratımı": "Berat, padişahın bir kişiye belirli bir görev, unvan, imtiyaz veya gelir tahsis ettiğini bildiren resmî belgedir. Bu belgenin kendisi, Seyyid Muhammed Said Baba'ya Hacı Bayram Veli Vakfı'ndaki görevlerini iade eden bir berattır.",
            "concept:beratıma": "Berat, padişahın bir kişiye belirli bir görev, unvan, imtiyaz veya gelir tahsis ettiğini bildiren resmî belgedir. Bu belgenin kendisi, Seyyid Muhammed Said Baba'ya Hacı Bayram Veli Vakfı'ndaki görevlerini iade eden bir berattır."
            },
            word_alternatives: {
            "السالكين": {"alternatives":[],"alternative_details":[],"origin":"Arapça (\"tarikat yolunda ilerleyenler\")","ocr_form":"السالكين"},
            "es-sâlikîn": {"alternatives":[],"alternative_details":[],"origin":"Arapça (\"tarikat yolunda ilerleyenler\")","ocr_form":"السالكين"},
            "بموجب": {"alternatives":[],"alternative_details":[],"origin":"Arapça (\"gereğince, uyarınca\")","ocr_form":"بموجب"},
            "bi-mûceb": {"alternatives":[],"alternative_details":[],"origin":"Arapça (\"gereğince, uyarınca\")","ocr_form":"بموجب"},
            "خلیل": {"alternatives":[],"alternative_details":[],"origin":"Arapça özel isim (\"Halil\")","ocr_form":"خلیل"},
            "Halil": {"alternatives":[],"alternative_details":[],"origin":"Arapça özel isim (\"Halil\")","ocr_form":"خلیل"},
            "جناب": {"alternatives":[],"alternative_details":[],"origin":"Arapça (\"saygıdeğer makam/kişi\" anlamında hitap sözü)","ocr_form":"جناب"},
            "cenâb": {"alternatives":[],"alternative_details":[],"origin":"Arapça (\"saygıdeğer makam/kişi\" anlamında hitap sözü)","ocr_form":"جناب"}
            },
            file: 'assets/hbv.png',
            enhancedFile: 'assets/hbv-enhanced.jpg',
            name: 'haci_bayram_veli_berati.png',
            size: '0.18 MB',
            ocr: `حاجی بیرام ولی سلکنده اشبو رافع توقيع رفیع الشأن خاقانی قدوة الصلحاء **السالكين**
السيد محمد سعيد بابا ولد متوفی طیب بابا عن اصلح وارشد اولانلر غب زماننا الیه **بموجب**
زبدة تقواه ديوان همايونه عرضحال ايدوب انقره ده واقع حاجی بیرام ولی وقفنك
وظیفه معینه ایله تولیت و مشیختنه و وظیفه معینه ایله زاویه دارلغنه بونلر افدم
بر وجه مشروطه باباسی محصولندن متصرف و رفعنی ایجاب ایدر بر وجه حرکتی
يوقيكن اصحاب اغراضدن السيد قاسم بابا ابن السيد **خلیل** بابا اصلح اولاد واقربا اولمق
اوزره بر تقریب اوزرینه برات و فتوا ننه خط همایون کشیده ایتدروب **جناب**
عزل کلی و عیal اولانندن خوار اولغله تولیت و مشیخت و زاویه دارلق **جناب**
اول و باباسی نائبلرندن اوله بغنه بناء كما فی الاول ابقا و يدينه برات عالی شانم
ديرلمك بابنده استدعاى عنایت ایتمکله مومی الیهك استدعاى اوزره
مسامحه اولنمق بابنده اراده سنيه ملوکانه تعلفنه بناء هر وجه استدعا موجبنجه
اولنمق اوزره اعلم العلماء المتبحرين افضل الفضلاء المتورعين بالفعل شيخ الاسلام
مولانا احمد اسعد ادام الله تعالى فضائله اشارت ایتمکلہ اشارت موجبنجه
توجیه اولنمق فرمانم اولمشدر حقنده مزید عنایت پادشاهانم ظهور کتروب
بيك ايكيوز يكرمی اوچ سنه سی رجبنك دوزنجی کونی تاریخيله مورخ و بوندان
رؤس همايونم موجبنجه بو برات همايونم ویردم و بیوردم که غب زماننا
الیهك اولادندن ارشد و اصلح مومی الیه السيد محمد سعيد بابا ولد متوفی طیب بابا
زبدة تقواه واروب مرقومك ربع و نصف مزبورك تولیت و مشیخت و زاویه
دارلغنه کما فی بر وجه مشروطه متصرف اولوب ادای خدمت ایلدکدن صکره
بوندن اول جهات مذکوره نك وظیفه معینه لرینه توجهله متصرف اولدقدن
ینه اولو جهله وظیفه معینه لرینی اوقاف مزبوره محصولندن الوب متصرف اولوب
اشبو برات عالیشانم مغایر رفع اولنمامق تقدم و طرف اخر دن هیچ فرد...`,
            tr: `Hacı Bayram Veli'nin yolundan giden, bu yüce padişahlık belgesini taşıyan, salih ve tasavvuf yolunda ilerleyen kişilerin örneği olan merhum Tayyib Baba'nın oğlu Seyyid Muhammed Said Baba, zamanının en liyakatli ve olgun kişilerinden biridir.
Kendisi, takvası ve dürüstlüğüyle Divan-ı Hümayun'a bir dilekçe sunmuştur. Ankara'da bulunan Hacı Bayram Veli Vakfı'nın, önceden belirlenmiş ücret karşılığında mütevelliliğini (vakfın yöneticiliğini), şeyhliğini ve zaviyedarlığını (tekkenin yönetimini) yürütmekteydi. Bu görevleri, daha önce belirlenen şartlar doğrultusunda babasından devralmış ve vakıf gelirlerinden yararlanmıştı. Görevden alınmasını gerektirecek herhangi bir davranışı da bulunmuyordu.
Ancak kötü niyetli kişilerden Seyyid Halil Baba'nın oğlu Seyyid Kasım Baba, kendisinin bu görevlere en layık evlat ve akraba olduğunu ileri sürerek çeşitli yollarla bir berat, fetva ve padişah fermanı çıkarttırmıştır. Bunun sonucunda Seyyid Muhammed Said Baba görevlerinden tamamen uzaklaştırılmış ve ailesiyle birlikte zor durumda kalmıştır.
Bunun üzerine Seyyid Muhammed Said Baba, vakfın mütevellilik, şeyhlik ve zaviyedarlık görevlerinin, eskiden olduğu gibi kendisine ve babasının vekillerine verilmesini talep ederek padişahın lütfunu istemiştir.
Adı geçen kişinin talebi üzerine kendisine kolaylık gösterilmesi yönünde padişahın iradesi ortaya çıkmıştır. Bu nedenle dilekçesinde belirttiği hususların yerine getirilmesi amacıyla, büyük âlimlerin en bilgini ve takva sahiplerinin en faziletlisi olan, görevdeki Şeyhülislam Mevlânâ Ahmed Esad'ın (Allah onun faziletlerini daim kılsın) da görüşü alınmıştır.
Onun işareti doğrultusunda, söz konusu görevlerin Seyyid Muhammed Said Baba'ya geri verilmesi emredilmiştir.
Padişahlık lütfumun bir göstergesi olarak, 1223 yılı Recep ayının dokuzuncu günü tarihini taşıyan ve hükümdarlık mührümü içeren bu yüce beratımı kendisine verdim ve şöyle buyurdum:
Merhum Tayyib Baba'nın oğlu Seyyid Muhammed Said Baba, adı geçen vakfın dörtte bir ve yarım hisselerine ilişkin mütevellilik, şeyhlik ve zaviyedarlık görevlerini, vakfın belirlenmiş şartlarına uygun biçimde yürütecektir.
Görevlerini ve hizmetlerini yerine getirdikten sonra, daha önce bu görevleri yürütürken aldığı belirlenmiş maaşları nasıl vakıf gelirlerinden alıyorsa, bundan sonra da aynı şekilde almaya devam edecektir.
Bu yüce beratıma aykırı olarak kendisi görevden uzaklaştırılamaz ve başkaları tarafından görevlerine herhangi bir müdahalede bulunulamaz.`,
            translit: `Hacı Bayram Veli silkinde işbu rafi'-i tevkî'-i refî'-i şân-ı hakanî kudvetü's-sulehâ **es-sâlikîn**
es-Seyyid Muhammed Said Baba veled-i müteveffa Tayyib Baba 'an aslah ve arşad olanlar gıbbe zamânınâ ileyhi **bi-mûceb**
zübdetü takvâh dîvân-ı hümâyûna arz-ı hâl idüb Ankara'da vâki' Hacı Bayram Veli vakfının
vazîfe-i muayyene ile tevliyet ve meşîhatine ve vazîfe-i muayyene ile zâviyedarlığına bunlar akdem
bir vech-i meşrûta babası mahsûlünden mutasarrıf ve ref'ini îcâb ider bir vech-i hareketi
yok iken ashâb-ı agrâzdan es-Seyyid Kasım Baba ibn es-Seyyid **Halil** Baba aslah evlâd ve akrabâ olmak
üzere bir takrîb üzerine berât ve fetvâ nene hatt-ı hümâyûn keşîde itdürüb **cenâb**
'azl-i küllî ve 'iyâl olanından hâr olgala tevliyet ve meşîhat ve zâviyedarlık **cenâb**
evvel ve babası nâiblerinden ola bağına binâen kemâ fi'l-evvel ibkâ ve yedine berât-ı âlî-şânım
dirilmek bâbında istid'â-yı 'inâyet itmekle mûmâ-ileyhin istid'âsı üzere
müsâmaha olunmak bâbında irâde-i seniyye-i mülûkâne taallukuna binâen her vech-i istid'â mûcebince
olunmak üzere a'lemü'l-ulemâi'l-mütebahhirîn efdalü'l-fudalâi'l-müteverri'în bi'l-fi'l Şeyhülislâm
Mevlânâ Ahmed Esad edâmallâhu teâlâ fezâilehu işâret itmekle işâret mûcebince
tevcîh olunmak fermânım olmuşdur hakkında mezîd-i 'inâyet-i pâdişâhânem zuhûr getürüb
bin iki yüz yirmi üç senesi Recebinin dokuzuncu günü târîhiyle müverrah ve bundan
rûs-ı hümâyûnum mûcebince bu berât-ı hümâyûnum virdim ve buyurdum ki gıbbe zamânınâ
ileyhin evlâdından arşad ve aslah mûmâ-ileyh es-Seyyid Muhammed Said Baba veled-i müteveffa Tayyib Baba
zübdetü takvâh varub merkûmun rub' ve nısf-ı mezbûrun tevliyet ve meşîhat ve zâviye
darlığına kemâ fî bir vech-i meşrûta mutasarrıf olub edâ-yı hizmet eyledikden sonra
bundan evvel cihât-ı mezkûrenin vazîfe-i muayyenelerine teveccühle mutasarrıf oldukdan
yine ol vechile vazîfe-i muayyenelerini evkâf-ı mezbûre mahsûlünden alub mutasarrıf olub
işbu berât-ı âlî-şânım mugâyir-i ref' olunmamak takaddüm ve taraf-ı âhardan hîç ferd...`,
            analysis: {
                document_type: "Berat",
                confidence: 92,
                style: "Resmî, bürokratik ve hukuki bir üslup kullanılmıştır.",
                summary: "Ankara'da bulunan Hacı Bayram Veli Vakfı'nın tevliyet, meşihat ve zaviyedarlık görevlerinin, haksız yere elinden alınan es-Seyyid Muhammed Said Baba'ya Şeyhülislam Ahmed Esad Efendi'nin işareti ve padişahın iradesiyle iade edildiğine dair berattır.",
                key_points: [
                    "Hacı Bayram Veli Vakfı'nın tevliyet, meşihat ve zaviyedarlık görevleri es-Seyyid Muhammed Said Baba'ya aittir.",
                    "es-Seyyid Kasım Baba'nın hileli girişimleriyle bu görevler el değiştirmiştir.",
                    "Şeyhülislam Ahmed Esad Efendi'nin işareti ve padişahın iradesiyle görevler eski sahibi es-Seyyid Muhammed Said Baba'ya iade edilmiştir.",
                    "Karar, 9 Receb 1223 tarihinde berat-ı hümayun ile tescil edilmiştir."
                ],
                people: ["Mevlânâ Ahmed Esad", "Seyyid Muhammed Said Baba", "Tayyib Baba", "Seyyid Kasım Baba", "Seyyid Halil Baba"],
                places: ["Ankara"],
                concepts: ["mütevellilik", "şeyhlik", "zaviyedarlık", "berat", "vakıf", "Şeyhülislam"],
                script_type: "Dîvânî",
                script_purpose: "Atama ve Hak İadesi Beratı",
                period_estimate: "II. Mahmud Dönemi",
                date_hijri: "9 Receb 1223",
                date_gregorian: "31 Ağustos 1808",
                notes: "Belge, Hacı Bayram Veli soyundan gelenler arasındaki vakıf görevleri ihtilafını ve Şeyhülislamın müdahalesiyle hakkın iade edilmesini konu almaktadır."
            }
        },
        'yeni3': {
            entity_info: {
            "place:rumeli": "Rumeli, Osmanlı Devleti'nin Balkanlar'daki (Avrupa yakası) topraklarına verilen genel addır; idari olarak önemli bir eyalet merkezi hâline gelmiştir. Bu belgede Rumeli, emrindeki süvari alayının sevk edilmesinden sorumlu olan valinin görev bölgesi olarak anılmaktadır.",
            "concept:asâkir-i mansûre": "Asâkir-i Mansûre-i Muhammediyye, II. Mahmud'un 1826'da Yeniçeri Ocağı'nı kaldırmasının ardından kurduğu, Batı tarzında eğitilmiş yeni Osmanlı ordusuna verilen addır. Bu belgede Asâkir-i Mansûre, Topçu Hüseyin Bey komutasındaki ve sevk edilecek olan süvari birliklerinin bağlı olduğu ana askerî teşkilatı ifade etmektedir.",
            "person:topçu hüseyin bey": "Bu belgede Topçu Hüseyin Bey, Rumeli Valisi'nin emrinde görevli, Asâkir-i Mansûre süvari birliklerinden bir alayın komutanı olup, belgenin konusu olan sevkiyatta bizzat alayı yönetecek kişidir; kendisi hakkında metinde başka bir bilgi yer almamaktadır.",
            "place:veliefendi çeşmesi": "Veliefendi, İstanbul'da (günümüzde Bakırköy ilçesinde) tarihî bir semt ve mesire alanı olup, adını buradaki bir çeşmeden almaktadır. Bu belgede Veliefendi Çeşmesi, sevk edilecek süvari alayının çadır ve yüklerinin toplandığı, Büyükçekmece'ye taşınmak üzere yola çıkılacak açık arazi olarak anılmaktadır.",
            "place:büyükçekmece": "Büyükçekmece, İstanbul'un batısında, tarihî İstanbul-Edirne yol güzergâhı üzerinde yer alan bir ilçedir. Bu belgede Büyükçekmece, Veliefendi Çeşmesi'nden yola çıkacak süvari alayının yük ve çadırlarının taşınacağı hedef nokta olarak geçmektedir.",
            "concept:baruthâne-i âmire": "Baruthâne-i Âmire, Osmanlı Devleti'nin barut üretimi yapılan resmî imalathanesine verilen addır; İstanbul çevresinde bu amaçla kurulmuş tesisler bulunmaktaydı. Bu belgede Baruthâne-i Âmire, sevkiyat için gereken kırk arabanın yirmi beşinin temin edildiği, kendisine bağlı köylerin kaynağı olduğu kurum olarak anılmaktadır.",
            "concept:müşirin": "Müşir, Osmanlı askerî hiyerarşisinde mareşal rütbesine karşılık gelen en yüksek askerî rütbedir. Bu belgede müşir, padişahın özel muhafız birliklerinin (Asâkir-i Hâssa-i Şâhâne) komutanı olup, sevkiyat için gereken kalan on beş arabanın temin edileceği su yolu köylerinin yönetimi kendisine bağlı olan üst düzey komutanı ifade etmektedir.",
            "concept:müşire": "Müşir, Osmanlı askerî hiyerarşisinde mareşal rütbesine karşılık gelen en yüksek askerî rütbedir. Bu belgede müşir, padişahın özel muhafız birliklerinin (Asâkir-i Hâssa-i Şâhâne) komutanı olup, sevkiyat için gereken kalan on beş arabanın temin edileceği su yolu köylerinin yönetimi kendisine bağlı olan üst düzey komutanı ifade etmektedir.",
            "concept:babıâli": "Babıâli, Osmanlı Devleti'nde sadrazamlık makamının ve devletin idari/bürokratik merkezinin bulunduğu kapıya/binaya verilen addır; mecazi olarak Osmanlı hükümetinin tamamını ifade etmek için de kullanılır. Bu belgede Babıâli, kalan on beş arabanın temini için gerekli bildirimin ilgili müşire iletilmesi gereken merkezi makam olarak anılmaktadır.",
            "concept:müşir": "Müşir, Osmanlı askerî hiyerarşisinde mareşal rütbesine karşılık gelen en yüksek askerî rütbedir. Bu belgede müşir, padişahın özel muhafız birliklerinin (Asâkir-i Hâssa-i Şâhâne) komutanı olup, sevkiyat için gereken kalan on beş arabanın temin edileceği su yolu köylerinin yönetimi kendisine bağlı olan üst düzey komutanı ifade etmektedir."
            },
            word_alternatives: {},
            file: 'assets/yeni3.png',
            enhancedFile: 'assets/yeni3-enhanced.jpg',
            name: 'askeri_sevkiyat_araba_temini.png',
            size: '0.22 MB',
            ocr: `سی الهجما دولتلو عنایتلو عاطفتلو افندیم
بااراده سنیه دولتلو روم ایلی والیسی حضرتلری معیتنه مامور نیمارلی سوارنی عساكر منصوره الایلرندن طوپل حین بك قوماند
ب اه
لای سواری عساكر منصوره ایله بنه تعلی یازنكی كونه اخراج و اعظام اولنهجق اولدیغندن الاس مذكورك چادر و سایر احمال
و انقالنی ولی افندی چشمسنی صحراسندن چكمجه كبییره نقل ایتمك اوزره بافزمان علی ترتیب بیوریلان قرق عدد عربهنك
یكرمی بشی عددی باروتخانه عامرهیه مربوط قریهلردن تداركیله محل مذكورده موجود بولنملری خصوصی مهمات حربیه
نافلری عطوفتلو افندی بندهلری معرفتیله اجرا قلنمش و قصور اون بش عددی دخی صو یولی كویلرندن مرتب اولوب اشبو
صو یولی كویلری دولتلو مشیر عساكر خاصه شاهانه حضرتلری طرفلرندن اداره اولنمقده اولوب مذكور عربهلرك تداركی
خصوصنك طرف مخلصیده اشعار اولنمسی مشار الیه حضرتلری بروزیر عالشان اولهرق یاردج دت ككندن مذكور اون بش
تعدی عربهنك بارنكی كونه محل مزبورده بولنملری خصوصنی باب عالیدن مشارالیه خضرتلرینه اشعار بیتورلمس منوط همت بهلریدر افندیم`,
            tr: `Saygıdeğer, yardımsever ve merhametli efendim,
Padişahın emriyle Rumeli Valisi'nin emrinde görevlendirilen, Asâkir-i Mansûre süvari birliklerinden Topçu Hüseyin Bey'in komutasındaki alay, Allah'ın izniyle yarın yola çıkarılacaktır.
Söz konusu alayın çadırlarını ve diğer yüklerini Veliefendi Çeşmesi civarındaki açık araziden Büyükçekmece'ye taşımak için, üst makamın emriyle toplam kırk araba tahsis edilmiştir.
Bu arabaların yirmi beşi, Baruthâne-i Âmire'ye bağlı köylerden temin edilerek belirtilen yerde hazır bulundurulmuştur. Bu işlem, askerî mühimmat işlerinden sorumlu görevlinin aracılığıyla gerçekleştirilmiştir.
Geriye kalan on beş arabanın ise su yollarına bağlı köylerden sağlanması kararlaştırılmıştır. Ancak söz konusu köyler, padişahın özel muhafız birliklerinin komutanı olan müşirin yönetimi altındadır.
Bu nedenle, kalan on beş arabanın da yarın belirtilen yerde hazır bulundurulabilmesi için gerekli bildirimin ilgili müşire Babıâli tarafından yapılması gerekmektedir.
Sözü edilen müşir yüksek rütbeli bir devlet adamı olduğundan, bu talebin kendisine resmî olarak iletilmesi, yüce makamınızın desteğine ve takdirine bağlıdır.
Efendim, gereğinin yapılmasını saygılarımla arz ederim.`,
            translit: `Seniyyül-himemâ Devletlü İnâyetlü Âtufetlü Efendim
Bâ-irâde-i seniyye devletlü Rumeli valisi hazretleri maiyetine memur timarlı süvari Asâkir-i Mansûre alaylarından Topçu Hüseyin Bey kumanda
b ah
alay süvari-i asâkir-i mansûre ile bi-mennihi teâlâ yarınki güne ihraç ve izâm olunacak olduğundan alay-ı mezkûrun çadır ve sair ahmâl
ve eskalini Veliefendi Çeşmesi sahrasından Çekmece-i Kebîre nakletmek üzere bâ-fermân-ı âlî tertip buyrulan kırk adet arabanın
yirmi beş adedi Baruthâne-i Âmireye merbût karyelerden tedarikiyle mahal-i mezkûrda mevcut bulunmaları hususu mühimmât-ı harbiye
sâkinleri atûfetli efendi bendeleri marifetiyle icra kılınmış ve kusur on beş adedi dahi su yolu köylerinden mürettep olup işbu
su yolu köyleri devletli müşir asâkir-i hâssa-i şâhâne hazretleri taraflarından idare olunmakta olup mezkûr arabaların tedariki
husûsunun taraf-ı muhlisîde işâr olunması müşârun-ileyh hazretleri bir vezîr-i âlîşân olarak Barut demekle mezkûr on beş
ta'addî arabanın yarınki gûne mahall-i mezbûrda bulunmaları hususu Bâbıâliden müşârunileyh hazretlerine iş'âr buyurulması menût-ı himmet-i behiyyeleridir efendim.`,
            analysis: {
                document_type: "Arz / Resmî Askerî Yazışma",
                confidence: 82,
                style: "Resmî, saray/divan yazışma üslubu — üst makama arz",
                summary: "Belge, Rumeli Valisi'nin emrindeki Topçu Hüseyin Bey komutasında yarın yola çıkacak bir süvari alayının çadır ve yüklerinin Veliefendi Çeşmesi'nden Büyükçekmece'ye taşınması için kırk araba tahsis edildiğini, bunun yirmi beşinin hazır olduğunu, kalan on beşinin ise su yolu köylerini yöneten bir müşirin yetkisi altında olduğundan Babıâli aracılığıyla talep edilmesi gerektiğini bildiren resmî bir arzdır.",
                key_points: [
                    "Rumeli Valisi'nin emrindeki Topçu Hüseyin Bey komutasında bir süvari alayı ertesi gün sevk edilecektir.",
                    "Alayın yük ve çadırlarının Veliefendi Çeşmesi'nden Büyükçekmece'ye taşınması için toplam kırk araba tahsis edilmiştir.",
                    "Bu arabaların yirmi beşi Baruthâne-i Âmire'ye bağlı köylerden temin edilip hazırlanmıştır.",
                    "Kalan on beş araba su yolu köylerinden sağlanacak, ancak bu köyler bir müşirin yönetimi altında olduğundan talebin Babıâli üzerinden iletilmesi istenmektedir."
                ],
                people: ["Topçu Hüseyin Bey"],
                places: ["Rumeli", "Veliefendi Çeşmesi", "Büyükçekmece"],
                concepts: ["Asâkir-i Mansûre", "Baruthâne-i Âmire", "Babıâli", "müşir"],
                script_type: "Rik'a",
                script_purpose: "Askerî sevkiyat için nakliye (araba) temini arzı",
                period_estimate: "Belirtilmemiş",
                date_hijri: "Belirtilmemiş",
                date_gregorian: "Belirtilmemiş",
                notes: "Metinde belirli bir tarih verilmemiştir; 'Asâkir-i Mansûre' adlandırması belgeyi genel olarak 19. yüzyıl Osmanlı askerî teşkilatlanma dönemine yerleştirmekle birlikte, kesin yıl metinden çıkarılamamaktadır."
            }
        },
        'tah': {
            entity_info: {
            "date:11 şevval 1277": "Hicrî 11 Şevval 1277, Miladi takvimde 21 Nisan 1861 tarihine karşılık gelir ve Sultan Abdülaziz'in saltanatının ilk yılına rastlar. Bu belgede 11 Şevval 1277, Tercümân-ı Ahvâl gazetesinin bu sayısının yayım tarihidir.",
            "place:i̇stanbul": "İstanbul, Osmanlı Devleti'nin başkenti olup, dönemin siyasi, idari, ticari ve basın hayatının merkezidir. Bu belgede İstanbul, hem gazetenin Bahçekapısı'ndaki matbaasının bulunduğu şehir hem de abonelik ücretlerinin farklılaştığı referans nokta olarak anılmaktadır.",
            "person:i̇smail paşa": "Bu belgede İsmail Paşa, rahatsızlığı nedeniyle İpek Teftiş Komisyonu başkanlığı görevinin Ömer Paşa'ya devredildiği devlet görevlisi olarak anılmaktadır; kendisi hakkında metinde başka bir bilgi yer almamaktadır.",
            "place:rumeli": "Rumeli, Osmanlı Devleti'nin Balkanlar'daki topraklarına verilen genel addır. Bu belgede Rumeli, Ömer Paşa'nın müşirlik göreviyle ilişkilendirildiği bölgelerden biri olarak Balkan ile birlikte anılmaktadır.",
            "place:balkan": "Balkan, Güneydoğu Avrupa'daki dağlık bölgeye ve bu bölgeyi kapsayan coğrafyaya verilen addır; Osmanlı Rumeli topraklarının büyük bölümünü oluşturur. Bu belgede Balkan, Ömer Paşa'nın müşirlik göreviyle ilişkilendirildiği bölgelerden biri olarak Rumeli ile birlikte anılmaktadır.",
            "person:ömer paşa": "Bu belgede devletli Ömer Paşa, İpek Teftiş Komisyonu başkanlığı ek göreviyle birlikte Rumeli, Balkan ve Ordu-yı Hümâyun müşirliği yüksek meclislerinde görevli bulunan, kendisine ayrıca Hazine-i Hassa-i Şahane nazırlığı verilen üst düzey bir devlet görevlisi olarak anılmaktadır.",
            "concept:hazine-i hassa-i şahane": "Hazine-i Hassa, Osmanlı Devleti'nde padişahın özel/şahsi mal varlığını ve gelirlerini yöneten hazine kurumudur. Bu belgede Hazine-i Hassa-i Şahane nazırlığı görevinin Ömer Paşa'ya verildiği, önceki nazır Hasib Paşa'nın ise Erzurum valiliğine atandığı bildirilmektedir.",
            "person:hasib paşa": "Bu belgede devletli Hasib Paşa, Hazine-i Hassa-i Şahane nazırlığı görevinden alınıp Erzurum valiliğine atanan bir devlet görevlisi olarak anılmaktadır.",
            "place:erzurum": "Erzurum, Doğu Anadolu'da önemli bir Osmanlı eyalet merkezidir. Bu belgede Erzurum, Hasib Paşa'nın vali olarak atandığı, önceki valisi Edhem Paşa'nın görevden ayrılması üzerine boşalan bir valilik makamı olarak geçmektedir.",
            "person:edhem paşa": "Bu belgede devletli Edhem Paşa, Erzurum valiliği görevinden ayrılan, yerine eski Sivas valisi Hayreddin Paşa'nın atandığı bir devlet görevlisi olarak anılmaktadır.",
            "place:sivas": "Sivas, Orta Anadolu'da önemli bir Osmanlı eyalet merkezidir. Bu belgede Sivas, Hayreddin Paşa'nın önceki valilik görevi olarak anılmakta; kendisi buradan Erzurum valiliğine atanmıştır.",
            "person:hayreddin paşa": "Bu belgede devletli Hayreddin Paşa, eski Sivas valisi olup, Edhem Paşa'nın görevden ayrılması üzerine Erzurum valiliğine atanan bir devlet görevlisi olarak anılmaktadır.",
            "person:rıza efendi": "Bu belgede atufetli Rıza Efendi, eski Hazine-i Hassa nazırı olup, Maliye Meclisi Tanzimat üyeliğine atanan bir devlet görevlisi olarak anılmaktadır.",
            "concept:maliye meclisi": "Maliye Meclisi, Tanzimat döneminde Osmanlı maliye işlerini düzenlemek üzere kurulan idari kuruldur. Bu belgede Maliye Meclisi Tanzimat üyeliğine eski Hazine-i Hassa nazırı Rıza Efendi'nin atandığı bildirilmektedir.",
            "person:emin efendi": "Bu belgede izzetli Emin Efendi, eski Rumeli muhasebecisi olup, Murtaza Ali Efendi'nin vekâleten yürüttüğü kapı kâtipliği görevi nedeniyle boşalan muhasebecilik görevine atanan bir devlet görevlisi olarak anılmaktadır.",
            "place:halep": "Halep, günümüzde Suriye sınırları içinde yer alan, Osmanlı döneminde önemli bir eyalet ve ticaret merkezidir. Bu belgede Halep, muhasebecisi Hertin Efendi'nin görevden ayrılması üzerine yeni bir atama yapılan eyalet olarak geçmektedir.",
            "person:seyfi efendi": "Bu belgede rıfatlı Seyfi Efendi, eski Rufe muhasebecisi olup, Hertin Efendi'nin görevden ayrılması üzerine Halep muhasebeciliğine atanan bir devlet görevlisi olarak anılmaktadır.",
            "concept:naipler": "Naip, bir kadının görev bölgesinde onun adına ve yetkisiyle yargı işlerini yürüten vekil/yardımcı görevliye verilen addır. Bu belgede naipler, çeşitli bölgelere (Direli Debdebe, Noveberde, Sjenica, Budaközü vb.) atanan, isimleri ve görev yerleri tek tek listelenen adli görevliler olarak anılmaktadır.",
            "concept:naip": "Naip, bir kadının görev bölgesinde onun adına ve yetkisiyle yargı işlerini yürüten vekil/yardımcı görevliye verilen addır. Bu belgede naipler, çeşitli bölgelere (Direli Debdebe, Noveberde, Sjenica, Budaközü vb.) atanan, isimleri ve görev yerleri tek tek listelenen adli görevliler olarak anılmaktadır.",
            "person:azmi efendi": "Bu belgede Azmi Efendi, Direli Debdebe'ye naip olarak atanan bir görevli olarak anılmaktadır; kendisi hakkında metinde başka bir bilgi yer almamaktadır.",
            "place:direli debdebe": "Bu belgede Direli Debdebe, Azmi Efendi'nin naip olarak atandığı bir yerleşim yeri olarak anılmaktadır.",
            "person:lebib mehmed emin efendi": "Bu belgede Lebib Mehmed Emin Efendi, Kavala müftüsü olup Noveberde'ye naip olarak atanan bir din/hukuk görevlisi olarak anılmaktadır.",
            "place:noveberde": "Bu belgede Noveberde, Kavala müftüsü Lebib Mehmed Emin Efendi'nin naip olarak atandığı bir yerleşim yeri olarak anılmaktadır.",
            "person:ahmed şakir efendi": "Bu belgede Ahmed Şakir Efendi, Kavala Müftülüğü'nden Sultan Selim Debre-i Kefe ambarına naip olarak atanan bir görevli olarak anılmaktadır.",
            "place:kavala": "Kavala, Ege Denizi kıyısında, günümüzde Yunanistan sınırları içinde yer alan bir Osmanlı dönemi liman şehridir. Bu belgede Kavala, Ahmed Şakir Efendi'nin müftülük görevinden Debre-i Kefe'ye naip olarak atandığı yer olarak anılmaktadır.",
            "place:debre-i kefe": "Bu belgede Sultan Selim Debre-i Kefe ambarı, Ahmed Şakir Efendi'nin Kavala Müftülüğü'nden naip olarak atandığı yer olarak anılmaktadır.",
            "person:ahmed şahin efendi": "Bu belgede Ahmed Şahin Efendi, Travnik'e naip olarak atanan bir görevlidir; aynı isimli (Ergirili) bir başka Ahmed Şahin Efendi ise Budaközü'ne atanmıştır — metinde iki farklı atama olarak ayrı ayrı listelenmiştir.",
            "place:travnik": "Travnik, günümüzde Bosna-Hersek sınırları içinde yer alan bir Osmanlı dönemi kaza merkezidir. Bu belgede Travnik, Ahmed Şahin Efendi'nin naip olarak atandığı yer olarak anılmaktadır.",
            "person:abdülkerim şemi efendi": "Bu belgede Abdülkerim Şemi Efendi, İstanbul mahkemesi kâtiplerinden olup Sjenica'ya naip olarak atanan bir görevli olarak anılmaktadır.",
            "place:sjenica": "Sjenica, günümüzde Sırbistan sınırları içinde yer alan bir Osmanlı dönemi yerleşim yeridir. Bu belgede Sjenica, İstanbul mahkemesi kâtiplerinden Abdülkerim Şemi Efendi'nin naip olarak atandığı yer olarak anılmaktadır.",
            "place:budaközü": "Bu belgede Budaközü, Ergirili Ahmed Şahin Efendi'nin naip olarak atandığı bir yerleşim yeri olarak anılmaktadır."
            },
            word_alternatives: {
            "ایکی کونده بر کره": {"alternatives":[],"alternative_details":[],"origin":"Türkçe","ocr_form":"ایکی کونده بر کره"},
            "iki günde bir kere": {"alternatives":[],"alternative_details":[],"origin":"Türkçe","ocr_form":"ایکی کونده بر کره"},
            "ثلاثی": {"alternatives":[],"alternative_details":[],"origin":"Arapça (\"selâse\" = üç kökünden, \"üçer aylık\")","ocr_form":"ثلاثی"},
            "sülâsî": {"alternatives":[],"alternative_details":[],"origin":"Arapça (\"selâse\" = üç kökünden, \"üçer aylık\")","ocr_form":"ثلاثی"},
            "اجرا به": {"alternatives":[],"alternative_details":[],"origin":"Arapça-Farsça bileşik (\"icrâ\" = yürütme + Farsça izafet eki)","ocr_form":"اجرا به"},
            "icrâ-yı": {"alternatives":[],"alternative_details":[],"origin":"Arapça-Farsça bileşik (\"icrâ\" = yürütme + Farsça izafet eki)","ocr_form":"اجرا به"},
            "اولدیغنه": {"alternatives":[],"alternative_details":[],"origin":"Türkçe","ocr_form":"اولدیغنه"},
            "olduğuna": {"alternatives":[],"alternative_details":[],"origin":"Türkçe","ocr_form":"اولدیغنه"},
            "بالکوز": {"alternatives":[],"alternative_details":[],"origin":"Belirsiz (olası OCR bozulması, bağlamdan bürokratik bir bağlaç/ifade olduğu tahmin ediliyor)","ocr_form":"بالکوز"},
            "balkuz": {"alternatives":[],"alternative_details":[],"origin":"Belirsiz (olası OCR bozulması, bağlamdan bürokratik bir bağlaç/ifade olduğu tahmin ediliyor)","ocr_form":"بالکوز"}
            },
            file: 'assets/tah.png',
            enhancedFile: 'assets/tah-enhanced.jpg',
            name: 'tercuman_i_ahval_25.png',
            size: '0.04 MB',
            ocr: `ترجمان احوال
١١ شوال بازار ١٢٧٧ نومرو ٢٥
اشبو غزته داخلیه و خارجیه هر درلو حوادث ایله فنون و صنایعه دائر مباحثی شامل اوله رق **ایکی کونده بر کره** بازار و صالی و پنچشنبه کونلری چیقار. ابونولق ایستمک دیینلر استانبولده باغچه قبوسی اوزونده کائن مطبعه سنه مراجعه اوله. در سعادت ایچون **ثلاثی** (١٥٠) والتی ایلیغی (٨٠) غرو شdr. طشره ایچون پوست خانه اجرت دخی اولنور. بر نسخه سی (٤٠) پاره به در.

حوادث داخلیه
ترجمان احوال شمدی یه قدر هفته ده بر کره اوله رق چیقارلمش ایسه ده بو غزته نك حین ظهورندن بروسا بر محلی غزته لرنده کوریلان آثار ترقی یه نظراً من بعد بزم بو حالده دواممز جائز و مناسب کوریلمز مقدمه لری و عداوتدینی وجهله بک کونده بر کونه بر نشری دخی درجهء کفایه ده اوله میه جغندن دها صیق چیقارلمسی لازم کلشدر چونکه آثار مدنیتی بر درجهء اعلایه ایصال ایله اعصار سابقة به بالوجوه تقدمی باهر اولان شو زمانمزده تلغراف و اوطه سیله و رقاچ آیه ظرفنده کرهء ارضك هر طرفندن اخذینه دست رس اولنان حوادث مهمهء پولیتقیه و سائره نك اعlانی هفته باشنده قدر تأخیر اولنمق حقا و یوفسر وکالات نافعه حقنده بر ظلم دینك اولیور اشته شو مصلحت عامه مبنی بوندن بویله ترجمان احوالك دخی هفته ده اوچ کره یعنی بازار و صالی و پنچشنبه کونلری چیقارلمسی و بعض احبامزدن دخی معاونتله حسن تحریر و تنظیمنه اولکیندن زیاده دقت و اهتمام قلنمی وجیبهء ذمت عد اولنمشدر بو جهتله طبع اولنه رق **اجرا به** مطالعه سنه رغبت ایدن ذواتك استحصال اسباب خشنودیلری ارجم آمالدر.

توجیهات
دولتلو اسماعیل پاشا حضرتلرینك کیف مزاچلری **اولدیغنه** مبنی بوسنه ایپکی تفتیش قومیسیونی ریاستنی علاوه سیله روم ایلی و بالکان واردوی همایونی مشیرلکی مجالس عالیه سنه مأمور دولتلو رأفتلو عمر پاشا حضرتلرینه
خزینهء خاصهء شاهانه نظارت جلیله سی دولتلو حسیب پاشا حضرتلرینه
ارضروم والیسی دولتلو ادهم پاشا حضرتلرینك انفصالی وقوعنه مبنی ایالت مزبوره و **بالکوز** سیواس والیسی سابق دولتلو خیرالدین پاشا حضرتلرینه
مجلس مالیه تنظیمیات اعضالغی خزینهء خاصه ناظری سابق عطوفتلو رضا افندی حضرتلرینه
قپو کتبی جلیلی مرتضی علی افندی افندیمجه قائممقامی نصب اولنمش اولدیغندن محاسب جلیلات مذکوره روم ایلی محاسب جلیلی سابق عزتلو امین افندی یه
حلب محاسب جلیلی عزتلو هرتین افندینك انفصالی محاسب جliلی مذکوره روفه محاسب جلیلی سابق رفعتلو سیفی افندی یه

(بعض محللره مأمور بیورلمش اولان نائبلر)
دیره لی دبدبه عزمی افندی - نوه برده مع بلاغه
قواله مفتیسی لبیb محمد امین افندی - سلطان سلیم دبرکفه انبارینه
منوفاق احمد شاکر افندی - تراویکه
ارکیر یلی احمد شاهین افندی - سنکه
استانبول محکمه سی کتبه سندن عبدالکریم شمی افندی - بوداق اوزی یه`,
            tr: `Tercümân-ı Ahvâl Gazetesi
11 Şevval 1277, Pazar — Sayı: 25
Bu gazete; yurt içinden ve yurt dışından haberlerin yanı sıra bilim, teknik ve sanayiyle ilgili konuları da içerecek şekilde bundan böyle iki günde bir, pazar, salı ve perşembe günleri yayımlanacaktır.
Abone olmak isteyenler, İstanbul'da Bahçekapısı'nda bulunan matbaamıza başvurabilirler.
İstanbul için üç aylık abonelik bedeli 150 kuruş, altı aylık abonelik bedeli ise 80 kuruştur. Taşraya gönderilecek nüshalar için posta ücreti ayrıca eklenir. Gazetenin tek nüshası 40 paradır.
Not: Üç aylık abonelik ücretinin altı aylık ücretten yüksek görünmesi, kaynak metindeki bir yazım veya aktarım hatasından kaynaklanıyor olabilir.

İç Haberler
Tercümân-ı Ahvâl şimdiye kadar haftada bir kez yayımlanıyordu. Ancak gazetemizin yayımlanmaya başlamasından bu yana diğer yerel gazetelerde görülen gelişmeler dikkate alındığında, bundan sonra aynı şekilde haftada bir kez yayımlanmaya devam etmemizin uygun olmayacağı düşünülmüştür.
Gazetenin haftada bir kez yayımlanması yeterli olmadığından, daha sık çıkarılması gerekli görülmüştür.
Çünkü medeniyetin gelişmişlik bakımından en yüksek seviyeye ulaştığı ve geçmiş yüzyıllara her açıdan üstünlüğünü açıkça gösterdiği günümüzde, telgraf aracılığıyla dünyanın dört bir yanından alınan önemli siyasi haberlerin yayımlanmasının haftanın sonuna kadar geciktirilmesi, kamu yararına yönelik çalışmalar açısından doğru değildir.
Bu genel yarar göz önünde bulundurularak Tercümân-ı Ahvâl gazetesinin bundan böyle haftada üç kez, yani pazar, salı ve perşembe günleri yayımlanmasına karar verilmiştir.
Ayrıca bazı dostlarımızın yardımlarıyla gazetenin yazımına ve düzenlenmesine eskisinden daha fazla özen gösterilmesi de görev kabul edilmiştir.
Böylece gazetemizin, onu okumaya ilgi gösteren kişilerin memnuniyetini kazanması en büyük amacımızdır.

Atamalar
Devletli İsmail Paşa Hazretleri'nin rahatsızlığı nedeniyle, bu yıl İpek Teftiş Komisyonu başkanlığı ek göreviyle birlikte Rumeli, Balkan ve Ordu-yı Hümâyun müşirliği yüksek meclislerinde görevli bulunan devletli Ömer Paşa Hazretleri'ne Hazine-i Hassa-i Şahane nazırlığı görevi verilmiştir.
Devletli Hasib Paşa Hazretleri, Erzurum valisi olarak atanmıştır.
Devletli Edhem Paşa Hazretleri'nin görevinden ayrılması üzerine, adı geçen eyalete eski Sivas valisi devletli Hayreddin Paşa Hazretleri atanmıştır.
Eski Hazine-i Hassa nazırı atufetli Rıza Efendi Hazretleri, Maliye Meclisi Tanzimat üyeliğine atanmıştır.
Kapı kâtipliği görevi Murtaza Ali Efendi tarafından vekâleten yürütüldüğünden, söz konusu muhasebecilik görevine eski Rumeli muhasebecisi izzetli Emin Efendi atanmıştır.
Halep muhasebecisi izzetli Hertin Efendi'nin görevinden ayrılması üzerine, söz konusu muhasebeciliğe eski Rufe muhasebecisi rıfatlı Seyfi Efendi atanmıştır.

Bazı Yerlere Atanan Naipler
Aşağıdaki kişilerin çeşitli bölgelere naip olarak atandığı bildirilmektedir:
- Azmi Efendi: Direli Debdebe'ye.
- Lebib Mehmed Emin Efendi: Noveberde'ye.
- Ahmed Şakir Efendi: Kavala Müftülüğü'nden Sultan Selim Debre-i Kefe ambarına.
- Ahmed Şahin Efendi: Travnik'e.
- Abdülkerim Şemi Efendi: Sjenica'ya. Kendisi İstanbul mahkemesi kâtiplerindendir.
- Ergirili Ahmed Şahin Efendi: Budaközü'ne.`,
            translit: `Tercümân-ı Ahvâl
11 Şevvâl Bâzâr 1277 Numara 25
İşbu gazete dâhiliyye ve hâriciyye her dürlü havâdis ile fünûn ve sanâyi'e dâir mebâhisi şâmil olarak **iki günde bir kere** bâzâr ve salı ve pençşenbih günleri çıkar. Abonelik istemek diyenler İstanbul'da Bahçekapısı üzerinde kâin matbaasına mürâca'at ola. Der-sa'âdet içün **sülâsî** (150) ve altı aylığı (80) kuruşdur. Taşra içün postahâne ücreti dahi olunur. Bir nüshası (40) parayadır.

Havâdis-i Dâhiliyye
Tercümân-ı Ahvâl şimdiye kadar haftada bir kere olarak çıkarılmış ise de bu gazetenin hîn-i zuhûrundan berû sâir mahallî gazetelerinde görülen âsâr-ı terakkîye nazaran min-ba'd bizim bu hâlde devâmımız câiz ve münâsib görülmez mukaddemeleri ve adâvetdînî vechile pek günde bir güne bir neşri dahi derece-i kifâyede olamayacağından daha sık çıkarılması lâzım gelmişdir çünkü âsâr-ı medeniyyeti bir derece-i a'lâya îsâl ile a'sâr-ı sâbıkaya bil-vücûh tekaddümü bâhir olan şu zamânımızda telgraf ve odasıyla ve birkaç ay zarfında küre-i arzın her tarafından ahzine dest-res olunan havâdis-i mühimme-i politikiyye ve sâirenin i'lânı hafta başına kadar te'hîr olunmak hakkâ ve yufser vekâlât-ı nâfi'a hakkında bir zulüm demek oluyor işte şu maslahat-ı âmme mebnî bundan böyle Tercümân-ı Ahvâl'in dahi haftada üç kere ya'nî bâzâr ve salı ve pençşenbih günleri çıkarılması ve bazı ahbâbımızdan dahi mu'âvenetle hüsn-i tahrîr ve tanzîmine ilkinden ziyâde dikkat ve ihtimâm kılınması vecîbe-i zimmet addolunmuşdur bu cihetle tab' olunarak **icrâ-yı** mütâla'asına rağbet eden zevâtın istihsâl-i esbâb-ı huşnûdîleri ercâ-yı âmâldir.

Tevcîhât
Devletlü İsmâ'îl Paşa hazretlerinin keyf-i mizâcları **olduğuna** mebnî bu sene İpek Teftîş Komisyonu riyâsetini ilâvesiyle Rûmeli ve Balkan ve Ordu-yı Hümâyûn müşîrliği mecâlis-i âliyesine me'mûr devletlü re'fetlü Ömer Paşa hazretlerine
Hazîne-i Hassa-i Şâhâne nezâret-i celîlesi devletlü Hasîb Paşa hazretlerine
Erzurûm vâlîsi devletlü Edhem Paşa hazretlerinin infisâli vukû'una mebnî eyâlet-i mezbûre ve **balkuz** Sîvâs vâlîsi sâbık devletlü Hayreddîn Paşa hazretlerine
Meclis-i Mâliyye Tanzîmât a'zâlığı Hazîne-i Hassa nâzırı sâbık 'atûfetlü Rızâ Efendi hazretlerine
Kapu kütüb-i celîli Murtazâ 'Alî Efendi efendimizce kâ'immakâmı nasb olunmuş olduğundan muhâsib-i celîlât-ı mezkûre Rûmeli muhâsib-i celîli sâbık 'izzetlü Emîn Efendi'ye
Haleb muhâsib-i celîli 'izzetlü Hertin Efendi'nin infisâli muhâsib-i celîli mezkûre Rûfe muhâsib-i celîli sâbık rıf'atlü Seyfî Efendi'ye

(Ba'zı mahallere me'mûr buyurulmuş olan nâ'ibler)
Dîreli Debdebe 'Azmî Efendi - Noveberde ma'a belâga
Kavala müftîsi Lebîb Mehmed Emîn Efendi - Sultân Selîm Debre-i Kefe anbârına
Menûfâk Ahmed Şâkir Efendi - Travnik'e
Ergirili Ahmed Şâhîn Efendi - Sjenica'ya
İstanbul mahkemesi ketebesinden 'Abdülkerîm Şem'î Efendi - Budaközü'ne`,
            analysis: {
                document_type: "Gazete",
                confidence: 92,
                style: "Resmî ve haber dili, Osmanlı Türkçesi matbu nesir.",
                summary: "Tercüman-ı Ahval gazetesinin 11 Şevval 1277 tarihli 25. sayısıdır. Gazetenin yayın periyodunun haftada birden haftada üçe (Pazar, Salı, Perşembe) çıkarıldığı ilan edilmektedir. Ayrıca iç haberler (Havadis-i Dahiliye) kısmında çeşitli devlet görevlerine yapılan yeni atamalar ve tayinler (tevcihat) listelenmektedir.",
                key_points: [
                    "Tercüman-ı Ahval gazetesinin yayın sıklığı haftada birden haftada üçe çıkarılmıştır.",
                    "Gazete pazar, salı ve perşembe günleri yayınlanacaktır.",
                    "İsmail Paşa'nın rahatsızlığı sebebiyle İpek Teftiş Komisyonu Başkanlığı Ömer Paşa'ya verilmiştir.",
                    "Erzurum Valiliğine, eski Sivas Valisi Hayreddin Paşa atanmıştır.",
                    "Çeşitli bölgelere yeni kadılar ve naipler tayin edilmiştir."
                ],
                people: ["İsmail Paşa", "Ömer Paşa", "Hasib Paşa", "Edhem Paşa", "Hayreddin Paşa", "Rıza Efendi", "Emin Efendi", "Seyfi Efendi", "Azmi Efendi", "Lebib Mehmed Emin Efendi", "Ahmed Şakir Efendi", "Ahmed Şahin Efendi", "Abdülkerim Şemi Efendi"],
                places: ["İstanbul", "Rumeli", "Balkan", "Erzurum", "Sivas", "Halep", "Kavala", "Travnik", "Budaközü", "Direli Debdebe", "Noveberde", "Sjenica", "Debre-i Kefe"],
                concepts: ["Hazine-i Hassa-i Şahane", "Maliye Meclisi", "naip"],
                script_type: "Matbu",
                script_purpose: "Haber ve İlan",
                period_estimate: "Osmanlı Tanzimat Dönemi",
                date_hijri: "11 Şevval 1277",
                date_gregorian: "21 Nisan 1861",
                notes: "Belgenin alt kısımlarında bazı isimler ve yer adları matbaa baskısından dolayı hafif silik çıkmıştır."
            }
        },
        'ssp': {
            entity_info: {
            "concept:hazne": "Hazne, Arapça kökenli bir kelime olup Türkçede genel olarak bir sıvı veya nesnenin biriktirildiği kap, depo ya da haznedarlık görevi gören bölmeye verilen addır. Bu belgede hazne, su saati (pengâh) düzeneğinin çalışması için gerekli olan, su biriktirme işlevi gören iki kaptan biri olarak geçer. Metne göre bu haznelerden biri bakırdan yapılmış huni biçiminde bir kap olup, boyutları ve akış deliği ayrıntılı şekilde tarif edilmektedir.",
            "concept:su saati": "Su saati (Farsça kökenli adıyla pengâh), suyun belirli bir hazneden sabit bir hızla akmasından veya boşalmasından yararlanarak zamanı ölçen, mekanik saatlerden önce kullanılan eski bir zaman ölçüm aletidir. Bu belgede su saatinin yapımı; hazne boyutları, akış deliğinin çapı ve suyun tamamen boşalma süresinin gün uzunluğuna göre nasıl ayarlanacağı teknik ayrıntılarla anlatılmaktadır. Metin, düzeneğin dördüncü iklim kuşağına (coğrafi bölgeye) göre kalibre edildiğini belirtir.",
            "concept:iklim": "İklim kelimesi bu metinde günümüzdeki hava durumu anlamından farklı olarak, İslam coğrafya geleneğindeki yedi 'iklim kuşağı'ndan (ekvatordan kutuplara doğru enlem bantları) birini, yani belirli bir coğrafi enlem aralığını ifade eder. Bu belgede su saatinin ayarı, kurulacağı yerin hangi iklim kuşağında olduğuna göre değişmektedir; çünkü güneşin gün içindeki hareketi ve gündüzün uzunluğu enleme göre farklılaşır. Metinde, su saatinin dördüncü iklimde kurulması durumunda en uzun günün on dört buçuk saat süreceği örnek olarak verilmektedir."
            },
            word_alternatives: {
            "آرشن": {"alternatives":[],"alternative_details":[],"origin":"Türkçe (Osmanlı dönemi bir uzunluk ölçü birimi, yaklaşık 68 cm)","ocr_form":"آرشن"},
            "arşın": {"alternatives":[],"alternative_details":[],"origin":"Türkçe (Osmanlı dönemi bir uzunluk ölçü birimi, yaklaşık 68 cm)","ocr_form":"آرشن"},
            "دلونك": {"alternatives":[],"alternative_details":[],"origin":"Arapça (\"delv\" = kova/kap + Türkçe tamlama eki)","ocr_form":"دلونك"},
            "delvün": {"alternatives":[],"alternative_details":[],"origin":"Arapça (\"delv\" = kova/kap + Türkçe tamlama eki)","ocr_form":"دلونك"},
            "پنگاه": {"alternatives":[],"alternative_details":[],"origin":"Farsça (bir tür su saati/düzeneği adı)","ocr_form":"پنگاه"},
            "pengāh": {"alternatives":[],"alternative_details":[],"origin":"Farsça (bir tür su saati/düzeneği adı)","ocr_form":"پنگاه"}
            },
            file: 'assets/ssp.png',
            enhancedFile: 'assets/ssp-enhanced.jpg',
            name: 'su_saati_pengah_risalesi.png',
            size: '0.03 MB',
            ocr: `ليلده تمام اون ايكى جام ضيا بولوب منور اولور و جمله اشكال مذكوره
بو وجه اوزره در كه صحيفه آتيه ده تصوير و تحرير اولندى

فصل ثانى اعمال مزبوره ايچون لازم اولان خزانه ايكى كاسه و ممالكك
كيفيتنى بيان ايدر اولا لازم خابيه در يعنى نحاسدن دوزلمش بوغازنده كه
طولى التمش **آرشن** و سعتى بش شبر ده و خابيه مزبوره نك اسفلنده
بر ثقبه وار در كه اول خابيه ده مملو اولان اب **دلونك** عرضنك
اطول نهارى مدت ساعاتنده اول ثقبه دن تمام چقمق لازمدر **پنگاه** اقليم
رابعه ده وضع اولونسه كه انك اطول نهارى اون درت بجق عدد
و نهار`,
            tr: `Gece boyunca tam on iki kandil yanarak ortamı aydınlatır. Sözü edilen şekillerin tamamı, bir sonraki sayfada çizilmiş ve açıklanmıştır.
İkinci bölüm: Bu bölümde, anlatılan işlemler için gerekli olan hazne, iki kap ve farklı bölgelerin özellikleri açıklanmaktadır.
Öncelikle gerekli olan huni biçimindeki kap bakırdan yapılmıştır. Bu kabın boğaz kısmının uzunluğu altmış arşın, genişliği ise beş karıştır. Kabın alt kısmında bir delik bulunmaktadır. Kabın içinde bulunan suyun, en uzun gündüzün saatleri boyunca bu delikten tamamen akıp boşalması gerekir.
Su saati dördüncü iklim bölgesine kurulursa, bu bölgedeki en uzun gündüz yaklaşık on dört buçuk saat sürer.`,
            translit: `Leylde temām on iki cām ziyā bulub münevver olur ve cümle eşkāl-i mezkūre
bu vech üzere dir ki sahīfe-i ātiyede tasvīr ve tahrīr olundı

Fasl-ı sānī a'māl-i mezbūre içün lāzım olan hazāne iki kāse ve memālikin
keyfiyyetini beyān ider evvelā lāzım hābiye dir ya'nī nühāsdan düzilmiş boğazında ki
tūlı altmış **arşın** ve vüs'ati beş şiber de ve hābiye-i mezbūrenin esfelinde
bir sakbe var dır ki ol hābiyede memlū olan āb **delvün** 'arzının
atval-i nehārı müddet sā'atinde ol sakbeden temām çıkmak lāzımdır **pengāh** iqlīm-i
rābi'ada vaz' olunsa ki anun atval-i nehārı on dörd buçuk 'aded
ve nehār`,
            analysis: {
                document_type: "Kitap Sayfası / Bilimsel Eser",
                confidence: 92,
                style: "Bilimsel, teknik ve açıklayıcı",
                summary: "Belgede, mekanik düzeneklerin (su saati/pengâh) çalışma prensipleri, hazne ve kapların boyutları ile coğrafi iklimlere göre gün uzunluklarının bu düzeneklerin ayarlanmasındaki rolü anlatılmaktadır. Ayrıca geceleyin aydınlanan cam düzeneklerin tasvirine ve sonraki sayfadaki çizimlere atıfta bulunulmaktadır.",
                key_points: [
                    "Gece boyunca on iki cam kandilin ışık vererek aydınlandığı, şekillerin bir sonraki sayfada resmedildiği belirtilmektedir.",
                    "Su saatinin (pengâh) çalışması için gerekli hazne, iki kase ve bakırdan yapılmış huninin ölçüleri tarif edilmektedir.",
                    "Huninin altındaki delikten suyun, bulunduğu enlemin en uzun gününün saatleri boyunca tamamen boşalması gerektiği anlatılmaktadır.",
                    "Dördüncü iklimde kurulan bir su saatinde en uzun günün on dört buçuk saat sürdüğü örnek olarak verilmektedir."
                ],
                people: [],
                places: [],
                concepts: ["Su Saati", "Hazne", "İklim"],
                script_type: "Nesih",
                script_purpose: "Bilimsel ve teknik bilgi aktarımı",
                period_estimate: "Osmanlı Dönemi (18. veya 19. yüzyıl)",
                date_hijri: "Belirtilmemiş",
                date_gregorian: "Belirtilmemiş",
                notes: "Metin, Banu Musa kardeşlerin veya El-Cezeri'nin hiyel (mekanik) kitaplarının Osmanlıca tercümelerinden (muhtemelen Tercüme-i Hiyel) bir sayfadır. Satır aralarında sonradan yapılmış düzeltmeler (derkenar/düzeltme notları) bulunmaktadır."
            }
        },
        'sya': {
            entity_info: {
            "concept:imamlarına": "İmam, bir camide cemaate namaz kıldıran, Osmanlı taşra teşkilatında aynı zamanda mahallenin dinî ve bazen idari işlerinden de sorumlu tutulan görevliye verilen addır. Bu belgede imamlar, muhtarlarla birlikte, mahallelerindeki gençleri şehir içinde silah atma yasağı konusunda bilgilendirmekle görevlendirilen yerel sorumlular olarak geçer. Metne göre bu yasağa uyulmasını sağlamak imamların ve muhtarların sorumluluğundadır.",
            "concept:muhtarlarına": "Muhtar, bir mahalle veya köyün idari işlerinden sorumlu, günümüzde de varlığını sürdüren yerel yönetim görevlisidir. Bu belgede muhtarlar, imamlarla birlikte, mahallelerindeki halkı şehir içinde silah atılmasının yasak olduğu ve bu yasağa uymayanların cezalandırılacağı konusunda uyarmakla yükümlü tutulan kişiler olarak anılmaktadır.",
            "concept:kolluk kuvvetleri": "Kolluk kuvvetleri, kamu düzenini ve güvenliğini sağlamakla görevli, kanunlara aykırı davranışları önleyen ve gerektiğinde müdahale eden resmî güvenlik birimlerine verilen genel addır (günümüzdeki polis/jandarma teşkilatının tarihî karşılığı). Bu belgede kolluk kuvvetleri, şehir içinde silah atma yasağına uymayan kişileri yakalayıp cezai işlem uygulamakla görevlendirilen yürütücü güç olarak geçmektedir.",
            "concept:para cezası": "Para cezası, bir suç veya kabahat karşılığında devlete belirli bir miktar para ödenmesini gerektiren yaptırım türüdür. Bu belgede para cezası, şehir içinde silah atma yasağını ihlal edenlere, on günlük hapis cezasının ardından ayrıca uygulanacak ikinci bir ceza olarak öngörülmektedir.",
            "concept:vilayet i̇dare meclisi": "Vilayet İdare Meclisi, Osmanlı taşra idaresinde bir vilayetin (ilin) genel yönetim ve idari kararlarından sorumlu, valinin başkanlığında toplanan üst düzey idari kuruldur. Bu belgede, şehir içinde silah atılmasına karşı uygulanacak cezaların (on gün hapis ve para cezası) ve bu konudaki uyarıların kolluk kuvvetlerine ve mahalle görevlilerine bildirilmesi kararının Vilayet İdare Meclisi tarafından alındığı belirtilmektedir.",
            "concept:kolluk kuvvetlerine": "Kolluk kuvvetleri, kamu düzenini ve güvenliğini sağlamakla görevli, kanunlara aykırı davranışları önleyen ve gerektiğinde müdahale eden resmî güvenlik birimlerine verilen genel addır (günümüzdeki polis/jandarma teşkilatının tarihî karşılığı). Bu belgede kolluk kuvvetleri, şehir içinde silah atma yasağına uymayan kişileri yakalayıp cezai işlem uygulamakla görevlendirilen yürütücü güç olarak geçmektedir.",
            "concept:imam": "İmam, bir camide cemaate namaz kıldıran, Osmanlı taşra teşkilatında aynı zamanda mahallenin dinî ve bazen idari işlerinden de sorumlu tutulan görevliye verilen addır. Bu belgede imamlar, muhtarlarla birlikte, mahallelerindeki gençleri şehir içinde silah atma yasağı konusunda bilgilendirmekle görevlendirilen yerel sorumlular olarak geçer. Metne göre bu yasağa uyulmasını sağlamak imamların ve muhtarların sorumluluğundadır.",
            "concept:muhtarların": "Muhtar, bir mahalle veya köyün idari işlerinden sorumlu, günümüzde de varlığını sürdüren yerel yönetim görevlisidir. Bu belgede muhtarlar, imamlarla birlikte, mahallelerindeki halkı şehir içinde silah atılmasının yasak olduğu ve bu yasağa uymayanların cezalandırılacağı konusunda uyarmakla yükümlü tutulan kişiler olarak anılmaktadır.",
            "concept:para cezasıyla": "Para cezası, bir suç veya kabahat karşılığında devlete belirli bir miktar para ödenmesini gerektiren yaptırım türüdür. Bu belgede para cezası, şehir içinde silah atma yasağını ihlal edenlere, on günlük hapis cezasının ardından ayrıca uygulanacak ikinci bir ceza olarak öngörülmektedir."
            },
            word_alternatives: {
            "طوتولوب": {"alternatives":[],"alternative_details":[],"origin":"Türkçe (\"tutmak\" fiilinin zarf-fiili)","ocr_form":"طوتولوب"},
            "tutulup": {"alternatives":[],"alternative_details":[],"origin":"Türkçe (\"tutmak\" fiilinin zarf-fiili)","ocr_form":"طوتولوب"},
            "منضبطه يه": {"alternatives":["zabıtaya"],"alternative_details":[{"text":"zabıtaya","confidence":0.55,"confidence_percent":55}],"origin":"Arapça (\"inzibat/disiplin\" kökünden, kolluk/zabıta anlamında + Türkçe hal eki)","ocr_form":"منضبطه يه"},
            "münzâbıtaya": {"alternatives":["zabıtaya"],"alternative_details":[{"text":"zabıtaya","confidence":0.55,"confidence_percent":55}],"origin":"Arapça (\"inzibat/disiplin\" kökünden, kolluk/zabıta anlamında + Türkçe hal eki)","ocr_form":"منضبطه يه"}
            },
            file: 'assets/sya.png',
            enhancedFile: 'assets/sya-enhanced.jpg',
            name: 'sehir_ici_silah_yasagi_ilani.png',
            size: '0.01 MB',
            ocr: `إعلان

شهر ايچنده سلاح اتمسی نظاماً ممنوع اولديغی معلومدر
حالبوكه ايام مخصوصه ده اشبو ممنوعيتك خلافنه سلاح
اتيلور بونك ضررلری ايسه ميدانده در بوجهتله
شمديدن بالجمله محلات امام ومختارلرينه تنبيهات لازمه نك
اجراسيله بيرامده وايام سائره ده هیچ بر كيمسه نك تفريح
اتمه مسی وشايد اتان اولورسه ضابطه جه **طوتولوب**
اون كون حبس اولندقده ن صوكره جزای نقدی دخی
النه رق مجازات ايدلمسی مجلس اداره ولايتدن بالا علام
**منضبطه يه** امر وتبليغ ايدلمكين اكا كوره بتون امام ومختارلرك
محله لرنده كی دليقانلولره بوندن صوكره هانگی كون اولورسه
اولسون سلاح اتلميه جكنی وشايد اتان اولورسه حبس
وجزا اولنه جغنی كوزلجه اكلادوب ممنوعيته دقت ايتمه لری
تنبيه اولنور`,
            tr: `Duyuru
Şehir içinde silah atmanın kanunen yasak olduğu bilinmektedir. Ancak özel günlerde bu yasağa uyulmayarak silah atılmaktadır. Bunun yol açtığı zararlar da açıkça ortadadır.
Bu nedenle, bütün mahallelerin imamlarına ve muhtarlarına şimdiden gerekli uyarıların yapılmasına karar verilmiştir. Bayramlarda ve diğer günlerde eğlence amacıyla hiç kimsenin silah atmaması gerekmektedir.
Bu yasağa uymayıp silah atan kişiler, kolluk kuvvetleri tarafından yakalanacak ve on gün hapis cezasına çarptırıldıktan sonra kendilerinden ayrıca para cezası alınacaktır. Bu karar, Vilayet İdare Meclisi tarafından bildirilmiş, kolluk kuvvetlerine de emir verilerek duyurulmuştur.
Bu doğrultuda bütün imam ve muhtarların, mahallelerindeki gençlere hangi gün olursa olsun bundan sonra silah atmanın yasak olduğunu açıkça anlatmaları; yasağa uymayanların hapis ve para cezasıyla cezalandırılacağını bildirmeleri ve herkesin bu yasağa uymasını sağlamaları önemle duyurulur.`,
            translit: `İ'lân

Şehir içinde silâh atması nizâmen memnû' olduğu ma'lûmdur
Halbuki eyyâm-ı mahsûsada işbu memnû'iyetin hilâfına silâh
atılıyor bunun zararları ise meydandadır bu cihetle
şimdiden bilcümle mahallât imâm ve muhtârlarına tenbîhât-ı lâzımenin
icrâsıyla bayramda ve eyyâm-ı sâirede hiçbir kimsenin tefrîh
etmemesi ve şâyet atan olursa zâbıtaca **tutulup**
on gün habs olunduktan sonra cezâ-yı nakdî dahi
alınarak mücâzât edilmesi Meclis-i İdâre-i Vilâyet'ten bi'l-i'lâm
**münzâbıtaya** emr ve teblîğ edilmekin ona göre bütün imâm ve muhtârların
mahallelerindeki delikanlılara bundan sonra hangi gün olursa
olsun silâh atılmayacağını ve şâyet atan olursa habs
ve cezâ olunacağını güzelce anlatıp memnû'iyete dikkat etmeleri
tenbîh olunur`,
            analysis: {
                document_type: "İlan",
                confidence: 95,
                style: "Resmî ve uyarıcı bir dil",
                summary: "Belge, şehir içinde silah atılmasının kanunen yasak olduğunu hatırlatan ve bu yasağa uymayanlara uygulanacak cezaları bildiren resmi bir ilandır. Bayram ve özel günlerde silah atanların on gün hapis ve para cezası ile cezalandırılacağı belirtilerek, mahalle muhtar ve imamlarının gençleri bu konuda uyarması istenmektedir.",
                key_points: [
                    "Şehir içinde silah atılması kanunen kesinlikle yasaktır.",
                    "Yasağa uymayıp silah atanlar kolluk kuvvetlerince yakalanarak on gün hapis ve para cezasına çarptırılacaktır.",
                    "Mahalle imamları ve muhtarları, mahallelerindeki gençleri bu yasak ve cezalar konusunda bilgilendirmekle yükümlüdür."
                ],
                people: [],
                places: [],
                concepts: ["Vilayet İdare Meclisi", "kolluk kuvvetleri", "imam", "muhtar", "para cezası"],
                script_type: "Matbu",
                script_purpose: "Kamuoyunu bilgilendirme ve uyarı",
                period_estimate: "Geç Osmanlı Dönemi",
                date_hijri: "Belirtilmemiş",
                date_gregorian: "Belirtilmemiş",
                notes: "Belge matbu (baskı) harflerle yazılmış resmi bir duyurudur. Bazı kelimeler mürekkep dağılması nedeniyle hafif silik çıksa da bağlamdan net olarak anlaşılmaktadır."
            }
        },
        'gkt': {
            entity_info: {
            "person:kazım karabekir paşa": "Kâzım Karabekir Paşa (1882-1948), Millî Mücadele döneminde Doğu Cephesi (Şark Ordusu) komutanlığı yapmış, Ermenistan'a karşı kazandığı zaferlerle tanınan, daha sonra TBMM'nin kurucu kadrosunda ve Cumhuriyet döneminde önemli görevlerde bulunmuş bir asker ve devlet adamıdır. Bu belgede Kâzım Karabekir Paşa, Rus işgali sırasında Tiflis'e götürülen dinî kitapların geri getirilmesi talebinin iletildiği Şark Ordusu Komutanı olarak anılmaktadır.",
            "concept:hadisi": "Hadis, İslam dininde Hz. Muhammed'in söz, fiil ve onaylarını aktaran rivayetlere verilen addır; Kur'an'dan sonra İslam hukuku ve ahlakının ikinci temel kaynağıdır. Bu belgede yazar, dilekçesine 'insanların hayırlısı, Allah'ın kendisini insanların ihtiyaçlarını karşılamak için görevlendirdiği kişidir' mealindeki bir hadisi hatırlatarak başlamaktadır.",
            "person:ahmed ziyâeddin efendi": "Gümüşhanevî Ahmed Ziyâeddin Efendi (1813-1893), 19. yüzyılın önde gelen Nakşibendî şeyhlerinden olup, İstanbul'da bir medrese ve kütüphane kurmuş, pek çok eser kaleme almış etkili bir âlimdir. Bu belgede kendisi, Of, Rize ve Bayburt'ta bulunan ve Rus işgali sırasında yağmalanan üç kütüphanenin banisi olarak anılmaktadır.",
            "place:rize": "Rize, Doğu Karadeniz kıyısında yer alan bir ildir. Bu belgede Rize, Gümüşhanevî Ahmed Ziyâeddin Efendi'ye ait, Rus işgali sırasında tahrip edilen üç kütüphaneden birinin bulunduğu yerlerden biri olarak Of ve Bayburt ile birlikte anılmaktadır.",
            "place:bayburt": "Bayburt, Doğu Anadolu ile Karadeniz bölgesi arasında, tarihî İpek Yolu güzergâhında yer alan bir ildir; I. Dünya Savaşı sırasında Rus işgaline uğramıştır. Bu belgede Bayburt, Rus kuvvetlerinin kütüphaneleri tahrip ettiği ve kitapları Tiflis'e taşıdığı bölge olarak geçmektedir.",
            "concept:kütüphanesinin": "Kütüphane, kitap ve diğer yazılı eserlerin toplandığı, korunduğu ve okuyuculara sunulduğu kurumdur. Bu belgede kütüphaneler, Gümüşhanevî Ahmed Ziyâeddin Efendi'ye ait, Of, Rize ve Bayburt'ta bulunan ve Rus işgali sırasında yağmalanıp içindeki kitapları Tiflis'e taşınan üç dinî kütüphaneyi ifade etmektedir.",
            "place:tiflis": "Tiflis (günümüzde Tbilisi), Kafkasya'nın önemli şehirlerinden biri olup, günümüzde Gürcistan'ın başkentidir. Bu belgede Tiflis, I. Dünya Savaşı sırasında Rus kuvvetlerinin, Of-Rize-Bayburt bölgesindeki kütüphanelerden yağmaladığı dinî kitapları naklettiği şehir olarak anılmaktadır.",
            "person:hoca ferşad i̇brahim": "Bu belgede Hoca Ferşad İbrahim, Of kazası müderrislerinden, yani Of'ta medrese hocalığı yapan bir din âlimi olup, Gümüşhanevî Ahmed Ziyâeddin Efendi'nin kütüphanelerinin başmütevellisi sıfatıyla, Rusların Tiflis'e götürdüğü kitapların geri getirilmesini Kâzım Karabekir Paşa'dan talep eden dilekçenin yazarıdır."
            },
            word_alternatives: {},
            file: 'assets/gkt.png',
            enhancedFile: 'assets/gkt-enhanced.jpg',
            name: 'gumushanevi_kutuphaneleri_dilekce.png',
            size: '0.03 MB',
            ocr: `شرق اوردوسی قوماندانی دولتو کاظم قره بکر پاشا
حضرتلرینه

دولتو افندم حضرتلری
ناسك خيرلوسى او كمسه در كه جناب حق آنى امتك حوائجنده
استخدام بيورر مآلنده بولنان حديث شريفى خاطر ساميلرينه
كترمك صورتيله عرض حال و استرحام ما فى الباله باشلارم.
كمشخانه وى احمد ضياءالدين افندى قدس سرهنك اوف
ريزه بايبورد مملكتلرنده بولنان اوچ عدد كتبخانه سنك باش
متوليسى بولنان داعيلرى شو استيلاده قصبه لرك بايبورد
جهتنده بولنان روسلر طرفندن امحا و كتابلر بالجمله تفليسه
نقل اولنديغى تحقيقات اخيره داعيانه مله تظاهر ايلمش و
كتابلر كتب دينيه دن اولمغله اهل اسلامجه محترم اولدقلرندن
جلبلرى و ينه وضع استفاده اولنسی و شيخ مشار اليه
حضرتلرينك كتابلرينك هر حالده همم عظيمه يه محتاج
بولنمشدر.
اللهك توفيقى اللهك ديننه نصرت ايده جكلرله برابر
بولنديغى ذات معلومدر. و اشبو مسئلهء معروضه نك خير و
حصوله واصل اولماسى احق همم جليله قابل بولنديغى
داعيلرنجه معلوم بولنديغندن كتب معروضه نك تفليسدن جلب
اولنماسى اسبابنك استكمالنى رجا و نياز ايلرم. فرمان
٥ تشرين ثانى ١٣٣٦
٥ قاسم ١٩٢١
اوف قضاسى مدرسلرندن
خواجه فرشاد ابراهيم`,
            tr: `Şark Ordusu Komutanı Kazım Karabekir Paşa Hazretlerine
Saygıdeğer Paşam,
"İnsanların en hayırlısı, Allah'ın kendisini insanların ihtiyaçlarını karşılamak için görevlendirdiği kişidir." anlamındaki hadisi hatırlatarak durumumu arz etmeye ve içten dileğimi sunmaya başlıyorum.
Gümüşhanevî Ahmed Ziyâeddin Efendi'nin (Allah sırrını kutsal kılsın) Of, Rize ve Bayburt'ta bulunan üç kütüphanesinin başmütevellisi, yani en yetkili yöneticisi olan ben, son araştırmalarım sonucunda bu kasabaların, son işgal sırasında Bayburt yönünde bulunan Rus kuvvetleri tarafından tahrip edildiğini ve kütüphanelerdeki kitapların tamamının Tiflis'e götürüldüğünü öğrenmiş bulunuyorum.
Söz konusu kitaplar dinî eserler olduğundan Müslümanlar tarafından kutsal ve saygın kabul edilmektedir. Bu nedenle kitapların geri getirilerek insanların yeniden yararlanmasına sunulması büyük önem taşımaktadır. Ayrıca adı geçen Şeyh Hazretleri'nin kitaplarının korunması ve kurtarılması için her türlü gayretin gösterilmesi gerektiği açıktır.
Allah'ın yardımının, O'nun dinine yardım edenlerle birlikte olduğu herkesçe bilinen bir gerçektir. Bu meselenin hayırlı bir şekilde sonuçlandırılmasının büyük bir çabayı hak ettiğine inandığımdan, söz konusu kitapların Tiflis'ten geri getirilmesi için gerekli girişimlerin tamamlanmasını saygıyla arz ve rica ederim.
Emir ve takdir yüce makamınıza aittir.
5 Teşrin-i Sânî 1336
Of kazası müderrislerinden Hoca Ferşad İbrahim`,
            translit: `Şark Ordusu Kumandanı Devletlü Kazım Karabekir Paşa
Hazretlerine

Devletlü Efendim Hazretleri
Nâsın hayırlısı o kimsedir ki Cenâb-ı Hakk anı ümmetin havâicinde
istihdâm buyurur meâlinde bulunan hadîs-i şerîfi hâtır-ı sâmîlerine
getirmek sûretiyle arz-ı hâl ve istirhâm-ı mâ-fi'l-bâle başlarım.
Gümüşhanevî Ahmed Ziyâeddin Efendi kuddise sırruhunun Of
Rize Bayburt memleketlerinde bulunan üç aded kütüphanesinin baş
mütevellîsi bulunan dâîleri şu istîlâda kasabaların Bayburt
cihetinde bulunan Ruslar tarafından imhâ ve kitaplar bil-cümle Tiflis'e
nakl olunduğu tahkîkât-ı ahîre-i dâîyânemle tezâhür eylemiş ve
kitaplar kütüb-i dîniyeden olmakla ehl-i İslâmca muhterem olduklarından
celbleri ve yine vaz'-ı istifâde olunması ve Şeyh-i müşârun-ileyh
hazretlerinin kitaplarının her hâlde himem-i azîmeye muhtâç
bulunmuştur.
Allah'ın tevfîki Allah'ın dînine nusret edeceklerle beraber
bulunduğu zât-ı ma'lûmdur. Ve işbu mesele-i ma'rûzenin hayır ve
husûle vâsıl olması ahakk-ı himem-i celîle kabil bulunduğu
dâîlerince ma'lûm bulunduğundan kütüb-i ma'rûzenin Tiflis'ten celb
olunması esbâbının istikmâlini ricâ ve niyâz eylerim. Fermân
5 Teşrîn-i Sânî 1336
5 Kasım 1921
Of kazâsı müderrislerinden
Hoca Ferşad İbrahim`,
            analysis: {
                document_type: "Dilekçe / Resmî Mektup",
                confidence: 98,
                style: "Resmî, hürmetkâr ve rica edici bir üslup kullanılmıştır.",
                summary: "Of kazası müderrislerinden Hoca Ferşad İbrahim, Doğu Ordusu Komutanı Kazım Karabekir Paşa'ya başvurarak Gümüşhanevî Ahmed Ziyâeddin Efendi'nin Of, Rize ve Bayburt'taki kütüphanelerinden Ruslar tarafından Tiflis'e kaçırılan dinî kitapların geri getirilmesini talep etmektedir. Dilekçe sahibi, bu kutsal eserlerin kurtarılması için gerekli girişimlerin başlatılmasını rica etmektedir.",
                key_points: [
                    "Gümüşhanevî Ahmed Ziyâeddin Efendi'ye ait Of, Rize ve Bayburt'taki üç kütüphane Rus işgali sırasında tahrip edilmiştir.",
                    "Kütüphanelerdeki dinî kitapların tamamı Ruslar tarafından Tiflis'e nakledilmiştir.",
                    "Dilekçe sahibi Hoca Ferşad İbrahim, kitapların Müslümanlar için taşıdığı önemi vurgulayarak geri getirilmesini istemektedir.",
                    "Talep, dönemin Doğu Ordusu Komutanı Kazım Karabekir Paşa'ya iletilmiştir."
                ],
                people: ["Kazım Karabekir Paşa", "Ahmed Ziyâeddin Efendi", "Hoca Ferşad İbrahim"],
                places: ["Of", "Rize", "Bayburt", "Tiflis"],
                concepts: ["hadis", "kütüphane", "mütevelli", "müderris"],
                script_type: "Nesih",
                script_purpose: "Resmî yazışma ve dilekçe",
                period_estimate: "Milli Mücadele Dönemi",
                date_hijri: "Belirtilmemiş",
                date_gregorian: "5 Kasım 1921",
                notes: "Belge, matbu (basılı) bir yazı karakterine sahiptir ve oldukça okunaklıdır. Tarih kısmında hem Rumi (1336) hem de Miladi (1921) tarihler yan yana verilmiştir."
            }
        },
        'ase': {
            entity_info: {
            "concept:vezirlere": "Vezir, Osmanlı Devleti'nde padişahtan sonra gelen en yüksek rütbeli devlet adamlarına, özellikle divan üyesi üst düzey yöneticilere verilen unvandır. Bu belgede vezirler, orta kollarda (taşrada) görevli olup kendilerine hitaben çıkarılacak padişah emirlerinin (hatt-ı hümayun) muhatabı olan üst düzey yetkililer olarak zikredilmektedir. Metne göre bu altı adet emrin her biri ayrı ayrı vezirlere hitaben yazılacaktır.",
            "concept:beylerbeylerine": "Beylerbeyi, Osmanlı taşra teşkilatında bir eyaletin en üst düzey askerî ve idari yöneticisine verilen unvandır; vezir rütbesindeki kişiler de genellikle beylerbeyi olarak görev yapardı. Bu belgede beylerbeyleri, vezirler, kadılar ve naiplerle birlikte, askerî sevkiyat ve asayiş düzenlemelerine dair padişah emirlerinin muhatabı olan taşra yöneticileri olarak geçmektedir.",
            "concept:kadılara": "Kadı, Osmanlı adalet sisteminde İslam hukukuna (şer'î hukuka) göre yargı yetkisini kullanan, aynı zamanda bulunduğu kazada çeşitli idari görevleri de yürüten görevlidir. Bu belgede kadılar, askerî sevkiyatla ilgili padişah emirlerinin kendilerine de bildirildiği, bu emirlerin mahkeme sicillerine kaydedilmesinden sorumlu tutulan yerel yetkililer olarak anılmaktadır.",
            "concept:naiplere": "Naip, bir kadının görev bölgesinde onun adına ve yetkisiyle yargı işlerini yürüten vekil/yardımcı görevliye verilen addır. Bu belgede naipler, kadılarla birlikte, padişah emirlerinin muhatabı olan ve bu emirlerin taşradaki uygulanmasında görev alan yerel adli görevliler arasında sayılmaktadır.",
            "concept:mahkeme kayıtlarına": "Mahkeme kayıtları (sicil), kadı mahkemelerinde görülen davaların, verilen hükümlerin ve resmî belgelerin düzenli olarak kaydedildiği defterlerdir; Osmanlı hukuk ve idare tarihinin en önemli birincil kaynaklarından biridir. Bu belgede, çıkarılan padişah emirlerinin korunan ülkelerdeki şehir, köy ve kasabaların mahkeme kayıtlarına geçirilmesi ve sürekli başvurulacak bir referans olarak saklanması istenmektedir.",
            "concept:hatt-ı hümayunların": "Hatt-ı hümayun, padişahın kendi el yazısıyla bir belge veya ferman üzerine yazdığı, o belgeye kesinlik ve resmiyet kazandıran onay/emir yazısıdır. Bu belgede hatt-ı hümayunların, altı adet şerif emrinin her birinin üzerine ayrı ayrı 'gereğince hareket edilsin' anlamında yazılması istenmekte, böylece bu emirlerin padişahın kendi iradesiyle teyit edilmiş resmî statüye kavuşması sağlanmaktadır."
            },
            word_alternatives: {
            "ذخيره يدي": {"alternatives":[],"alternative_details":[],"origin":"Arapça (\"zahîre\" = erzak + \"yed\" = el)","ocr_form":"ذخيره يدي"},
            "zahîre yedi": {"alternatives":[],"alternative_details":[],"origin":"Arapça (\"zahîre\" = erzak + \"yed\" = el)","ocr_form":"ذخيره يدي"},
            "كل ما صدره زير بنات": {"alternatives":[],"alternative_details":[],"origin":"Arapça (ifade belirsiz, olası OCR bozulması)","ocr_form":"كل ما صدره زير بنات"},
            "küll-i mâ sadara zîr-i binât": {"alternatives":[],"alternative_details":[],"origin":"Arapça (ifade belirsiz, olası OCR bozulması)","ocr_form":"كل ما صدره زير بنات"},
            "بي بعض نظام": {"alternatives":[],"alternative_details":[],"origin":"Arapça-Farsça bileşik (\"bî\" = -sız + \"ba'z-ı nizâm\" = bazı düzen)","ocr_form":"بي بعض نظام"},
            "bî-ba'z-ı nizâm": {"alternatives":[],"alternative_details":[],"origin":"Arapça-Farsça bileşik (\"bî\" = -sız + \"ba'z-ı nizâm\" = bazı düzen)","ocr_form":"بي بعض نظام"},
            "انالطرفي": {"alternatives":[],"alternative_details":[],"origin":"Arapça (\"an\" + \"et-tarafeyn\" = iki taraftan)","ocr_form":"انالطرفي"},
            "ani't-tarafeyn": {"alternatives":[],"alternative_details":[],"origin":"Arapça (\"an\" + \"et-tarafeyn\" = iki taraftan)","ocr_form":"انالطرفي"},
            "بيلنك": {"alternatives":[],"alternative_details":[],"origin":"Arapça (\"beyne\" = arasında kökünden)","ocr_form":"بيلنك"},
            "beynin": {"alternatives":[],"alternative_details":[],"origin":"Arapça (\"beyne\" = arasında kökünden)","ocr_form":"بيلنك"},
            "اورته قوللرنده": {"alternatives":[],"alternative_details":[],"origin":"Türkçe (\"orta kol\" = taşra askeri/idari birimi + yer eki)","ocr_form":"اورته قوللرنده"},
            "orta kullarında": {"alternatives":[],"alternative_details":[],"origin":"Türkçe (\"orta kol\" = taşra askeri/idari birimi + yer eki)","ocr_form":"اورته قوللرنده"},
            "قطعه": {"alternatives":[],"alternative_details":[],"origin":"Arapça (\"kıt'a\" = parça, resmî evrakta \"adet\" sayaç anlamında)","ocr_form":"قطعه"},
            "kıt'a": {"alternatives":[],"alternative_details":[],"origin":"Arapça (\"kıt'a\" = parça, resmî evrakta \"adet\" sayaç anlamında)","ocr_form":"قطعه"},
            "سجلو نه": {"alternatives":[],"alternative_details":[],"origin":"Arapça-Türkçe bileşik (\"sicil\" + Türkçe hal eki)","ocr_form":"سجلو نه"},
            "sicilline": {"alternatives":[],"alternative_details":[],"origin":"Arapça-Türkçe bileşik (\"sicil\" + Türkçe hal eki)","ocr_form":"سجلو نه"},
            "بالوزرايه": {"alternatives":[],"alternative_details":[],"origin":"Arapça (\"bi\" + \"el-vüzerâ\" = vezirler ile/vasıtasıyla)","ocr_form":"بالوزرايه"},
            "bi'l-vüzerâye": {"alternatives":[],"alternative_details":[],"origin":"Arapça (\"bi\" + \"el-vüzerâ\" = vezirler ile/vasıtasıyla)","ocr_form":"بالوزرايه"},
            "التي": {"alternatives":["elletî"],"alternative_details":[{"text":"elletî","confidence":0.2,"confidence_percent":20}],"origin":"Türkçe sayı \"altı\" (6) — Arapça ilgi zamiri \"elletî\" (o ki) ile harf şekli benzerliği nedeniyle karıştırılabilir","ocr_form":"التي"},
            "altı": {"alternatives":["elletî"],"alternative_details":[{"text":"elletî","confidence":0.2,"confidence_percent":20}],"origin":"Türkçe sayı \"altı\" (6) — Arapça ilgi zamiri \"elletî\" (o ki) ile harf şekli benzerliği nedeniyle karıştırılabilir","ocr_form":"التي"},
            "هميونلري": {"alternatives":[],"alternative_details":[],"origin":"Farsça-Türkçe bileşik (\"hümâyûn\" = padişaha ait + Türkçe çoğul/iyelik eki)","ocr_form":"هميونلري"},
            "hümâyûnları": {"alternatives":[],"alternative_details":[],"origin":"Farsça-Türkçe bileşik (\"hümâyûn\" = padişaha ait + Türkçe çoğul/iyelik eki)","ocr_form":"هميونلري"}
            },
            file: 'assets/ase.png',
            enhancedFile: 'assets/ase-enhanced.jpg',
            name: 'askeri_sevkiyat_serif_emirler_arz.png',
            size: '0.01 MB',
            ocr: `موجبجه عمل اولنه
دیو امر اولنمشدر

پادشاهم

شوكتلو كرامتلو مهابتلو افندم ولينعمم افندم
عون و عنايت باري ايله بوندن بويله عساکر معينه و مرخصه نك سفره **ذخيره يدي** سوق و تسيير اولنه جق
طوائف عسكريه نك **كل ما صدره زير بنات** و قيام و قرار دن اتفاقا و تاما ايلدكي مصلحتك **بي بعض نظام**
و شروطي حاوي **انالطرفي** و عدم **بيلنك** صالح و معول و **اورته قوللرنده** اولان وزراي عظام و ميرميران
و ضابطان عسكريه و قضات و نوابه خطابا اصدار و افاده اولنمش **قطعه** امر شريفك ممالك محروسه ده اولان
بو و قرا و قصابات واقع محاكم **سجلو نه** قيد و دائما دستور العمل طوتولمق اوزره ايجون **بالوزرايه**
خط همايون ملوكانه‌لري كشيده بيورلمق لازم اولديغندن ذكر اولنان **التي** قطعه امر عالي شريف حضور
لامع النور شاهانه‌لري قيلنمشدر منظور و معلوم **هميونلري** بيورلدقده بشقه بشقه هر برينك **بالوزرايه**
موجبجه عمل اولنه ديو مبارك خط همايونلري كشيده بيورلمق بابنده امر و فرمان شوكتلو كرامتلو
مهابتلو افندم ولينعمم افندم پادشاهم حضرتلرينكدر`,
            tr: `Emredilen hükümlere uygun hareket edilsin.
Padişahım,
Şanlı, yüce, heybetli ve keramet sahibi efendim; velinimetim, padişahım!
Allah'ın yardımı ve desteğiyle bundan böyle sefere gönderilecek askerlerin gerekli yiyecek ve erzakları sağlanarak sevk edilmeleri temin edilecektir.
Askerî birliklerin karşılaştıkları meselelerde ortak kararlar alarak uzlaşma içinde hareket etmeleri ve yapılması gereken işleri eksiksiz yerine getirmeleri amaçlanmaktadır. Bu işlerin düzensizliklerden, anlaşmazlıklardan ve taraflar arasında sorunlara yol açabilecek durumlardan uzak, düzenli ve güvenilir bir biçimde yürütülmesi gerekmektedir.
Bu amaçla, askerlerin bulunduğu orta kollardaki vezirlere, beylerbeylerine, askerî görevlilere, kadılara ve naiplere hitaben çıkarılan altı adet padişah emrinin, korunan ülkelerdeki şehirlerin, köylerin ve kasabalarının mahkeme kayıtlarına geçirilmesi ve sürekli olarak başvurulacak bir rehber olarak kullanılması istenmektedir.
Söz konusu emirlerin uygulanmasını güvence altına almak amacıyla, vezirlere hitaben padişahın kendi el yazısıyla yazılmış hatt-ı hümayunlarının hazırlanması gerekmektedir.
Bu altı adet padişah emri yüce padişahın huzuruna sunulmuştur. Padişahın bilgisine arz edildikten sonra, her bir emrin vezirlere ayrı ayrı hitaben düzenlenmesi ve üzerlerine "Gereğince hareket edilsin" anlamındaki mübarek hatt-ı hümayunların yazılması hususunda emir ve ferman, şanlı, yüce ve heybetli efendim, velinimetim ve padişahım hazretlerinindir.`,
            translit: `Mûcebince amel oluna
deyu emr olunmuşdur

Pâdişâhım

Şevketlü kerâmetlü mehâbetlü efendim veliyy-i ni'metim efendim
Avn ü inâyet-i bârî ile bundan böyle asâkir-i muayyen ve murahhasanın sefere **zahîre yedi** sevk ve tisyâr olunacak
tavâif-i askeriyenin **küll-i mâ sadara zîr-i binât** ve kıyâm ve karârdan ittifâkan ve tämmen eylediği maslahatın **bî-ba'z-ı nizâm**
ve şurûtu hâvî **ani't-tarafeyn** ve adem-i **beynin** sâlih ve muavvel ve **orta kullarında** olan vüzerâ-yı izâm ve mîrimîrân
ve zâbitân-ı askeriyye ve kuzât ve nüvvâba hitâben ısdâr ve ifâde olunmuş **kıt'a** emr-i şerîfin memâlik-i mahrûsede olan
bû ve kurâ ve kasabâtda vâki' mehâkim **sicilline** kayd ve dâimen düstûrü'l-amel tutulmak üzere içün **bi'l-vüzerâye**
hatt-ı hümâyûn-ı mülûkâneleri keşîde buyurulmak lâzım geldiğinden zikr olunan **altı** kıt'a emr-i âlî-i şerîf huzûr-ı
lâmi'ü'n-nûr-ı şâhâneleri kılınmışdır manzûr ve ma'lûm-ı **hümâyûnları** buyuruldukda başka başka her birinin **bi'l-vüzerâye**
mûcebince amel oluna deyu mübârek hatt-ı hümâyûnları keşîde buyurulmak bâbında emr-i fermân şevketlü kerâmetlü
mehâbetlü efendim veliyy-i ni'metim efendim pâdişâhım hazretlerinindir.`,
            analysis: {
                document_type: "Arz / Hatt-ı Hümâyun",
                confidence: 85,
                style: "Resmî, bürokratik ve diplomatik Osmanlı Türkçesi",
                summary: "Belge, askerlerin sefere yiyecek tedarikiyle sevk edilmesi ve askeri sınıfların ittifakla yürüttüğü işlerin düzgünce idare edilmesi amacıyla çıkarılan şerif emirlerin mahkeme sicillerine kaydedilmesini talep etmektedir. Bu doğrultuda hazırlanan altı adet emrin padişahın onayına sunulduğu ve üzerlerine 'gereğince hareket edilsin' şeklinde hatt-ı hümayun yazılması rica edilmektedir.",
                key_points: [
                    "Askerlerin sefere yiyecek tedarikiyle sevk edilmesinin düzenlenmesi.",
                    "Askeri sınıfların ittifakla yürüttüğü işlerin düzgün ve güvenilir şekilde yürütülmesi.",
                    "Çıkarılan şerif emirlerin şehir, köy ve kasabalardaki mahkeme sicillerine kaydedilmesi.",
                    "Hazırlanan altı adet şerif emrin padişahın onayına sunulması ve üzerlerine hatt-ı hümayun yazılmasının talep edilmesi."
                ],
                people: [],
                places: [],
                concepts: ["hatt-ı hümayun", "vezirler", "beylerbeyleri", "mahkeme kayıtları", "kadılar", "naipler"],
                script_type: "Rik'a",
                script_purpose: "Padişaha sunulan arz ve üzerine yazılan hatt-ı hümayun",
                period_estimate: "18. veya 19. Yüzyıl",
                date_hijri: "Belirtilmemiş",
                date_gregorian: "Belirtilmemiş",
                notes: "Belgenin sol üst köşesinde padişahın 'mûcebince amel oluna' şeklindeki hatt-ı hümayunu yer almaktadır."
            }
        },
        'phd': {
            entity_info: {
            "concept:hayat dersi": "Hayat dersi, günlük yaşamdan veya bir deneyimden çıkarılan, insanı bilgece davranmaya yönlendiren öğretici bir çıkarım/ibret anlamına gelir. Bu belgede hayat dersi, bir felsefe profesörünün kavanoz deneyiyle öğrencilerine verdiği, hayattaki önceliklerin doğru sıralanması gerektiğini anlatan dersin kendisidir.",
            "concept:felsefe": "Felsefe, varlık, bilgi, değer, akıl ve dil gibi temel konular üzerine sistemli ve eleştirel düşünme faaliyetidir. Bu belgede felsefe, hikâyedeki profesörün uzmanlık alanı olarak geçmekte, onun sınıfta alışılmadık bir yöntemle (kavanoz deneyiyle) ders vermesine bağlam oluşturmaktadır.",
            "concept:hayatı": "Hayat, bir canlının doğumundan ölümüne kadar geçen süreç, yaşam anlamına gelir. Bu belgede hayat, kavanozun temsil ettiği kavramdır: büyük taşlar hayattaki en önemli değerleri (aile, sağlık, inanç), çakıllar ikincil öncelikleri, kum ise önemsiz ayrıntıları simgelemektedir.",
            "concept:aileniz": "Aile, kan bağı, evlilik veya evlat edinme yoluyla birbirine bağlı, birlikte yaşayan kişilerden oluşan temel toplumsal birimdir. Bu belgede aile, profesörün kavanoz deneyinde 'büyük taşlar' ile simgelenen, hayattaki en önemli değerlerden biri olarak sayılmaktadır.",
            "concept:hayatın": "Hayat, bir canlının doğumundan ölümüne kadar geçen süreç, yaşam anlamına gelir. Bu belgede hayat, kavanozun temsil ettiği kavramdır: büyük taşlar hayattaki en önemli değerleri (aile, sağlık, inanç), çakıllar ikincil öncelikleri, kum ise önemsiz ayrıntıları simgelemektedir.",
            "concept:hayat": "Hayat, bir canlının doğumundan ölümüne kadar geçen süreç, yaşam anlamına gelir. Bu belgede hayat, kavanozun temsil ettiği kavramdır: büyük taşlar hayattaki en önemli değerleri (aile, sağlık, inanç), çakıllar ikincil öncelikleri, kum ise önemsiz ayrıntıları simgelemektedir.",
            "concept:zamanınızı": "Zaman, olayların geçmişten geleceğe doğru sıralandığı, geri döndürülemeyen soyut akış anlamına gelir. Bu belgede zaman, profesörün öğrencilerine, önemsiz şeylere harcanırsa gerçekten değerli olan şeyler için yeterli kalmayacağı konusunda uyardığı kıymetli bir kaynak olarak ele alınmaktadır.",
            "concept:enerjinizi": "Enerji, bir işi yapabilme veya bir faaliyeti sürdürebilme gücüne verilen addır; günlük kullanımda kişinin zihinsel ve bedensel gücünü de ifade eder. Bu belgede enerji, zamanla birlikte, önemsiz şeylere harcanmaması gereken, dikkatli kullanılması gereken bir kaynak olarak anılmaktadır."
            },
            word_alternatives: {
            "اولجه قومی": {"alternatives":[],"alternative_details":[],"origin":"Türkçe (\"evvelce/önce\" + \"kum\" + Türkçe belirtme eki)","ocr_form":"اولجه قومی"},
            "evvelce qumı": {"alternatives":[],"alternative_details":[],"origin":"Türkçe (\"evvelce/önce\" + \"kum\" + Türkçe belirtme eki)","ocr_form":"اولجه قومی"},
            "önce kumu": {"alternatives":[],"alternative_details":[],"origin":"Türkçe (\"evvelce/önce\" + \"kum\" + Türkçe belirtme eki)","ocr_form":"اولجه قومی"}
            },
            file: 'assets/phd.png',
            enhancedFile: 'assets/phd-enhanced.jpg',
            name: 'profesorun_hayat_dersi.png',
            size: '0.01 MB',
            ocr: `پروفیسورك حیات درسی: بر كون بر فلسفه پروفیسوری، كرسی یه چیقدی و اوكنده بر قاچ اشیا
واردی. درسی آلیشیلمامش بیجیمده ایشله‌یه‌جكی بللیدی.
ماصه‌نك اوزرینه بویوك بر جام قاوانوز قویدی. آردندن ماصه‌نك آلتندن بویوك تاشلر چیقاردی و
بو تاشلری قاوانوزك ایچنه تك تك یرلشدیردی. صوكره اوگرنجیلره دونه‌رك قاوانوزك دولو اولوب
اولمادیغنی صوردی. اوگرنجیلر قاوانوزه باقدیلار و دولو اولدوغنی سؤیلدیلر. پروفیسور
بونك اوزرینه ماصه‌نك آلتندن بر قوطو چاقیل تاشی چیقاردی. چاقیللری قاوانوزك ایچنه دوكدی و
صاللادی. چاقیللار، بویوك تاشلرك آراسنده كی بوشلوقلره یرلشدی. پروفیسور
یكیدن قاوانوزك دولو اولوب اولمادیغنی صوردی. اوگرنجیلر بو كز داها ترددلی بر شكلده
دولو اولدوغنی سؤیلدیلر. بونكله یتینمه‌ین پروفیسور، ماصه‌نك آلتندن قوم چیقاردی.
قومی یاواش یاواش قاوانوزك ایچنه دوكدی. قوم، چاقیللرك آراسنده كی اك كوچك بوشلوقلره
قدر صیزدی. پروفیسور تكرار صنفه‌ دوندی و قاوانوزك دولو اولوب اولمادیغنی صوردی. اوگرنجیلر
شاشیردیلار و طولمش اولابیلجگنی سؤیلدیلر. صوك اولارقده پروفیسور بر بارداق
صو چیقاردی و قاوانوزك ایچنه دوكدی.
قومی یاواش یاواش قاوانوزك ایچنه دوكدی. قوم، چاقیللرك آراسنده كی اك كوچك بوشلقلره
قدر صیزدی. پروفسور تكرار صنفه دوندی و قاوانوزك طولو اولوب اولمادیغنی صوردی. اوگرنجیلر
شاشیردیلر و طولمش اولابیلجگنی سویلدیلر. صوك اولارق ده پروفسور بر بارداق
صو چیقاردی و قاوانوزك ایچنه دوكدی.
پروفسور بو دنیدن نه آكلادیقلرینی صوردی. اوگرنجیلری دیكله ین پروفسور شویله دوام ایتدی. بو
قاوانوزك حیاتی تمثیل ایتدیگینی سویلیه رك ایچنده كیلر حیاتكزدەكی دگرلردیر دیدی. بویوك طاشلر
سزك ایچون اك اؤنملیلردیر. یعنی عائلەكز، صاغلیغكز، اشكز، چوجوقلریغز، دوستلریغز و دینی
حیاتكزدیر. چاقیل طاشلری ایسه، اوینز، آرابەكز كبی حیاتكزدەكی دیگر اؤنملى اما ایكنجیل شیلردیر.
قاوانوزه **اولجه قومی** قوم ایسه حیاتك كوچك و اؤنمسز آیرینتیلریدیر. شویله دقت ایدك: " اگر
طولدیرورسه كز بویوك طاشلره و چاقیل طاشلرینه یر قالماز. حیات ده بویله دیر. زمانكزی و انرژیكزی
کوچك شیلره خرجلرسه كز، گرچكدن اؤنملى اولان شیلر
ایچون وقتكز قالمایا جق و ایسراف ایتمش اولاجقسدر. اونك ایچون زمانكزی نریه خرجادیغكزه
دقت ایدك دیدی. www.osmanlicaogren.com`,
            tr: `Profesörün hayat dersi: Bir gün bir felsefe profesörü, kürsüye çıktı ve önünde birkaç eşya vardı. Dersi alışılmamış biçimde işleyeceği belliydi. Masanın üzerine büyük bir cam kavanoz koydu. Ardından masanın altından büyük taşlar çıkardı ve bu taşları kavanozun içine tek tek yerleştirdi. Sonra öğrencilere dönerek kavanozun dolu olup olmadığını sordu. Öğrenciler kavanoza baktılar ve dolu olduğunu söylediler. Profesör bunun üzerine masanın altından bir kutu çakıl taşı çıkardı. Çakılları kavanozun içine döktü ve salladı. Çakıllar, büyük taşların arasındaki boşluklara yerleşti. Profesör yeniden kavanozun dolu olup olmadığını sordu. Öğrenciler bu kez daha tereddütlü bir şekilde dolu olduğunu söylediler. Bununla yetinmeyen profesör, masanın altından kum çıkardı. Kumu yavaş yavaş kavanozun içine döktü. Kum, çakılların arasındaki en küçük boşluklara kadar sızdı. Profesör tekrar sınıfa döndü ve kavanozun dolu olup olmadığını sordu. Öğrenciler şaşırdılar ve dolmuş olabileceğini söylediler. Son olarak da profesör bir bardak su çıkardı ve kavanozun içine döktü.
Kumu yavaş yavaş kavanozun içine döktü. Kum, çakılların arasındaki en küçük boşluklara kadar sızdı. Profesör tekrar sınıfa döndü ve kavanozun dolu olup olmadığını sordu. Öğrenciler şaşırdılar ve dolmuş olabileceğini söylediler. Son olarak da profesör bir bardak su çıkardı ve kavanozun içine döktü. Profesör bu deneyden ne anladıklarını sordu. Öğrencileri dinleyen profesör şöyle devam etti. Bu kavanozun hayatı temsil ettiğini söyleyerek içindekiler hayatınızdaki değerlerdir dedi. Büyük taşlar sizin için en önemlileridir. Yani aileniz, sağlığınız, eşiniz, çocuklarınız, dostlarınız ve dini hayatınızdır. Çakıl taşları ise, eviniz, arabanız gibi hayatınızdaki diğer önemli ama ikincil şeylerdir. Kavanoza **önce kumu** [koyarsanız], kum ise hayatın küçük ve önemsiz ayrıntılarıdır. Şöyle dikkat edin: " Eğer doldurursanız büyük taşlara ve çakıl taşlarına yer kalmaz. Hayat da böyledir. Zamanınızı ve enerjinizi küçük şeylere harcarsanız, gerçekten önemli olan şeyler için vaktiniz kalmayacak ve israf etmiş olacaksınızdır. Onun için zamanınızı nereye harcadığınıza dikkat edin dedi. www.osmanlicaogren.com`,
            translit: `profesörüñ ḥayāt dersi: bir gün bir felsefe profesörü, kürsüye çıḳdı ve öñünde bir ḳaç eşyā
vardı. dersi alışılmamış biçimde işleyecegi belliydi.
maṣanuñ üzerine büyük bir cām ḳavānoz ḳoydu. ardından maṣanuñ altından büyük taşlar çıḳardı ve
bu taşları ḳavānozuñ içine tek tek yerleştirdi. ṣoñra ögrencilere dönerek ḳavānozuñ dolu olup
olmadıġını ṣordu. ögrenciler ḳavānoza baḳdılar ve dolu olduġını söylediler. profesör
bunuñ üzerine maṣanuñ altından bir ḳuṭu çaḳıl taşı çıḳardı. çaḳılları ḳavānozuñ içine döktü ve
ṣalladı. çaḳıllar, büyük taşlaruñ arasındaki boşluḳlara yerleşdi. profesör
yegiden ḳavānozuñ dolu olup olmadıġını ṣordu. ögrenciler bu kez daha tereddüdlü bir şekilde
dolu olduġını söylediler. bununla yetinmeyen profesör, maṣanuñ altından ḳum çıḳardı.
ḳumu yavaş yavaş ḳavānozuñ içine döktü. ḳum, çaḳıllaruñ arasındaki eñ küçük boşluḳlara
ḳadar ṣızdı. profesör tekrār ṣınıfa döndi ve ḳavānozuñ dolu olup olmadıġını ṣordu. ögrenciler
şāşırdılar ve ṭolmuş olabilecegini söylediler. ṣoñ olarak da profesör bir bardaḳ
ṣu çıḳardı ve ḳavānozuñ içine döktü.
Qumı yavaş yavaş qavanozuñ içine dökdi. Qum, çaqıllarıñ arasındaki eñ küçük boşluqlara
qadar sızdı. Profesör tekrar sınıfa döndi ve qavanozuñ dolu olup olmadıġını sordı. Öğrenciler
şaşırdılar ve dolmuş olabilecegini söylediler. Soñ olarak da profesör bir bardaq
su çıqardı ve qavanozuñ içine dökdi.
Profesör bu deneyden ne añladıqlarını sordı. Öğrencileri diñleyen profesör şöyle devam itdi. Bu
qavanozuñ hayatı temsil itdigeni söyleyerek içindekiler hayatıñızdaki degerlerdir didi. Büyük taşlar
sizik içün eñ önemlilerdir. Ya'ni 'aileñiz, saġlıġıñız, eşiñiz, çocuqlarıñız, dostlarıñız ve dini
hayatıñızdır. Çaqıl taşları ise, eviñiz, arabáñız gibi hayatıñızdaki diger önemli ama ikincil şeylerdir.
Qavanoza **evvelce qumı** qum ise hayatıñ küçük ve önemsiz ayrıntılarıdır. Şöyle diqqat idiñ: " Eger
doldurursañız büyük taşlara ve çaqıl taşlarına yer qalmaz. Hayat da böyledir. Zamanıñızı ve enerjiñizi
küçük şeylere harcarsañız, gerçekten önemli olan şeyler
içün vaqtıñız qalmayacaq ve israf itmiş olacaqsınızdır. Onuñ içün zamanıñızı nereye harcadıġıñıza
diqqat idiñ didi. www.osmanlicaogren.com`,
            analysis: {
                document_type: "Hikaye / Kıssa",
                confidence: 99,
                style: "Sade, öğretici ve akıcı bir anlatım dili",
                summary: "Bir felsefe profesörü, sınıfta boş bir kavanozu sırasıyla büyük taşlar, çakıllar, kum ve suyla doldurarak öğrencilerine hayatın öncelikleri hakkında uygulamalı bir ders vermektedir. Bir profesörün sınıfta kavanoz, büyük taşlar, çakıl taşları, kum ve su kullanarak gerçekleştirdiği deney anlatılmaktadır. Bu deney üzerinden öğrencilere hayattaki öncelikleri doğru belirleme ve zamanı verimli kullanma konusunda önemli bir ders verilmektedir.",
                key_points: [
                    "Bir felsefe profesörü, dersi alışılmadık bir yöntemle işlemektedir.",
                    "Kavanoza sırasıyla büyük taşlar, çakıllar, kum ve su doldurulur.",
                    "Öğrenciler her aşamada kavanozun dolup dolmadığını değerlendirir.",
                    "Profesör, kavanozu sırasıyla büyük taşlar, çakıllar, kum ve suyla doldurarak hayatın aşamalarını simgeleyen bir deney yapar.",
                    "Kavanozdaki büyük taşlar aile, sağlık ve inanç gibi en temel değerleri; çakıllar ev ve araba gibi ikincil öncelikleri; kum ise önemsiz ayrıntıları temsil eder.",
                    "Zaman ve enerjinin önemsiz şeylere harcanması durumunda, hayatta gerçekten değer taşıyan unsurlara yer kalmayacağı vurgulanır."
                ],
                people: [],
                places: [],
                concepts: ["hayat dersi", "felsefe", "hayat", "aile", "sağlık", "dini hayat", "zaman", "enerji"],
                script_type: "Matbu",
                script_purpose: "Eğitim / Okuma Parçası",
                period_estimate: "Geç Osmanlı veya Erken Cumhuriyet Dönemi",
                date_hijri: "Belirtilmemiş",
                date_gregorian: "Belirtilmemiş",
                notes: "Metin, modern dönemde basılmış bir Osmanlıca okuma kitabından alınmış son derece net ve okunaklı bir matbu metindir."
            }
        },
        'yeni1': {
            entity_info: {
            "concept:i̇slam": "İslam, 7. yüzyılda Hz. Muhammed tarafından tebliğ edilen, tek tanrı inancına (tevhid) dayanan ve günümüzde dünya genelinde milyarlarca mensubu bulunan bir din olup, aynı zamanda bu dine mensup toplumların oluşturduğu medeniyet ve kültür havzasını da ifade eder. Bu belgede İslam, bir zamanlar güçlü ve medeniyet bakımından ileri olan, ancak yazıldığı dönemde düşkünlük içinde tasvir edilen bir dünya/coğrafya olarak ele alınmaktadır.",
            "concept:sefaleti": "Sefalet, aşırı yoksulluk, perişanlık ve maddi/manevi çöküntü hâline verilen addır. Bu belgede sefalet, bir zamanlar güçlü olan Müslüman toplumların yazıldığı dönemde içine düştüğü yoksulluk ve perişanlık durumunu anlatmak için tekrar tekrar kullanılan ana temalardan biridir.",
            "concept:müslümanlar": "Müslüman, İslam dinine mensup, bu dinin inanç esaslarını benimseyen kişiye verilen addır. Bu belgede Müslümanlar, geçmişte dünyanın en güçlü ve gelişmiş milletlerinden biriyken, metnin yazıldığı dönemde sefalet, esaret ve durgunluk içinde tasvir edilen bir toplum olarak ele alınmaktadır.",
            "concept:sefalet": "Sefalet, aşırı yoksulluk, perişanlık ve maddi/manevi çöküntü hâline verilen addır. Bu belgede sefalet, bir zamanlar güçlü olan Müslüman toplumların yazıldığı dönemde içine düştüğü yoksulluk ve perişanlık durumunu anlatmak için tekrar tekrar kullanılan ana temalardan biridir.",
            "concept:esaretin": "Esaret, özgürlüğün kaybedilmesi, bir başkasının (kişi, güç veya devletin) boyunduruğu altına girme durumuna verilen addır. Bu belgede esaret, bir zamanlar dünyaya hükmeden Müslümanların yazıldığı dönemde düştüğü aşağılanmış ve bağımlı durumu ifade etmek için kullanılmaktadır.",
            "concept:esaret": "Esaret, özgürlüğün kaybedilmesi, bir başkasının (kişi, güç veya devletin) boyunduruğu altına girme durumuna verilen addır. Bu belgede esaret, bir zamanlar dünyaya hükmeden Müslümanların yazıldığı dönemde düştüğü aşağılanmış ve bağımlı durumu ifade etmek için kullanılmaktadır.",
            "concept:medeniyet": "Medeniyet, bir toplumun ulaştığı maddi ve manevi gelişmişlik düzeyini, kurduğu kurumları, bilim, sanat ve şehir hayatındaki ilerlemeyi ifade eden kavramdır. Bu belgede medeniyet, geçmişte İslam ülkelerinin her birinin birer merkezi olduğu, ancak yazıldığı dönemde harabeye döndüğü belirtilen gelişmişlik düzeyini ifade etmektedir.",
            "concept:müslümanların": "Müslüman, İslam dinine mensup, bu dinin inanç esaslarını benimseyen kişiye verilen addır. Bu belgede Müslümanlar, geçmişte dünyanın en güçlü ve gelişmiş milletlerinden biriyken, metnin yazıldığı dönemde sefalet, esaret ve durgunluk içinde tasvir edilen bir toplum olarak ele alınmaktadır."
            },
            word_alternatives: {},
            file: 'assets/yeni1.png',
            enhancedFile: 'assets/yeni1-enhanced.jpg',
            name: 'islam_dunyasinin_gerilemesi.png',
            size: '0.06 MB',
            ocr: `باشلا نفیج
اسلام نامی التنده یاشایان كتله بشریهنك سفالت حیاتیهسنی
كورون، انین و ایسیننی دیكلهین متحس بر وجدان تصور
ایدیلهمز كه بو فجیعهلره قارشی لاقید قالهبیلسون، اوانینلره
معكس اولان دماغنده قوپان طوقانلرله موجودیتنك صارصیلدیغنی
حس ایتمسون!
بر وقتلر جهانك اك حاكم و اك مترقی بر ملتی حالنده یاشامش
اولان مسلمانلر، بوكون، ذلیل و سفیل چامورلرده سورونیور،
حقیر و اسیر طوقانلر التنده ایكلیورلر!
بر زمانلر دنیایه شانلر یاغدیران رایت اسلام، بوكون
سرنكون اولمش، عصرلرجه جهانلری تیترهتن مسامانلر، بوكون
تخت اسارت و ذلته سقوط ایتمشلر!۔
ماضیده هر بری بر معموره مدنیت اولان بلاد اسلامیه؛
بوكون، قسوت انكیز برر خرابه حالنی المش، قوای طبیعیهیه
میدان اوقویهجق قدر شهامت كوسترن مسامانلرك حفیدلری اك
ملوث سفالت چامورلرینه دوشمشلر، اك قورقویج عطالت
كردابلرینه یووارلاتمشلر! بر حالده كه دیار اسلام واسع بر مزارستانه،
مسلمانلرده جانلی و مسكین برر جنازهیه دولمش!۔۔۔`,
            tr: `İslam adı altında yaşayan insanların içinde bulunduğu sefaleti gören, feryatlarını duyan ve bu acıları yüreğinde hisseden duyarlı bir insanın, yaşanan bu korkunç olaylara kayıtsız kalması mümkün değildir. Bu feryatların zihninde yarattığı sarsıntılar karşısında kendi varlığının da sarsıldığını hissetmemesi düşünülemez!
Bir zamanlar dünyanın en güçlü ve en gelişmiş milletlerinden biri olan Müslümanlar, bugün aşağılanmış ve perişan bir hâlde sefalet içinde yaşamaktadır. Hor görülmenin ve esaretin ağır darbeleri altında ezilmektedirler.
Bir zamanlar dünyaya şan ve şeref kazandıran İslam bayrağı, bugün yere düşmüştür. Yüzyıllar boyunca dünyaya hükmeden ve herkese gücünü hissettiren Müslümanlar, artık esaret ve aşağılanma içinde yaşamaktadır.
Geçmişte her biri birer medeniyet merkezi olan İslam ülkeleri, bugün içler acısı birer harabeye dönüşmüştür. Bir zamanlar doğanın güçlerine bile meydan okuyacak kadar cesur olan Müslümanların torunları, bugün en ağır yoksulluk ve sefalet koşulları içinde yaşamaktadır. Üstelik toplum, insanları hareketsizliğe ve gelişememeye sürükleyen korkunç bir durgunluğun içine düşmüştür.
Öyle bir noktaya gelinmiştir ki İslam ülkeleri uçsuz bucaksız bir mezarlığı, Müslümanlar ise hayatta oldukları hâlde hiçbir şey yapamayan, umudunu ve hareket gücünü kaybetmiş insanları andırmaktadır.`,
            translit: `başla nefy
İslâm namı altında yaşayan kitle-i beşeriyenin sefalet-i hayatiyesini
gören, enîn ü enînini dinleyen mütehassis bir vicdân-ı tasavvur
edilemez ki bu fecîalara karşı lâkayd kalabilsin, o enînlere
makes olan dimâğında kopan tokatlarla mevcûdiyetinin sarsıldığını
his itmesin !
bir vakitler cihânın en hâkim ve en müterakkî bir milleti hâlinde yaşamış
olan Müslümanlar, bugün, zelil ve sefil çamurlarda sürünüyor,
hakîr ve esîr tokatlar altında iniliyorlar!
Bir zamanlar dünyaya şanlar yağdıran râyet-i İslâm, bugün
ser-nigûn olmuş, asırlarca cihanları titreten müsâmanlar, bugün
taht-ı esâret ve zillete sukût etmişler!
mâzîde her biri bir mamûre-i medeniyet olan bilâd-ı İslâmiye;
bugün, kasvet-engîz birer harâbe hâlini almış, kuvâ-yı tabîiyeye
meydan okuyacak kadar şehâmet gösteren müsâmanların hafitleri en
mülevves sefâlet çamurlarına düşmüşler, en korkunç atâlet
girdâblarına yuvarlatmışlar! Bir halde ki diyâr-ı İslâm vâsi bir mezaristana,
Müslümanlar da canlı ve miskin birer cenazeye dolmuş!...`,
            analysis: {
                document_type: "Matbu Makale / Deneme",
                confidence: 78,
                style: "Hitabet üslubu, duygusal ve eleştirel bir deneme/makale dili",
                summary: "Metin, İslam dünyasının ve Müslümanların geçmişteki güç ve medeniyet düzeyiyle içinde bulunduğu dönemin düşkünlüğünü karşılaştıran, hüzünlü ve eleştirel bir deneme/makaledir. Bir zamanlar dünyaya hükmeden Müslümanların bugün sefalet, esaret ve durgunluk içinde olduğu, eski medeniyet merkezlerinin harabeye döndüğü vurgulanmaktadır.",
                key_points: [
                    "Yazar, İslam adı altında yaşayan toplumun içinde bulunduğu sefalete duyarsız kalınamayacağını vurgulamaktadır.",
                    "Bir zamanlar dünyanın en güçlü milletlerinden olan Müslümanların bugün aşağılanmış ve esaret altında yaşadığı anlatılmaktadır.",
                    "Geçmişte birer medeniyet merkezi olan İslam ülkelerinin bugün harabeye döndüğü belirtilmektedir.",
                    "Metin, toplumun içine düştüğü durgunluk ve gelişememe durumunu bir 'mezaristan' benzetmesiyle anlatmaktadır."
                ],
                people: [],
                places: [],
                concepts: ["İslam", "Müslüman", "sefalet", "esaret", "medeniyet"],
                script_type: "Matbu",
                script_purpose: "Siyasi-sosyal eleştiri içeren makale/deneme",
                period_estimate: "Belirtilmemiş",
                date_hijri: "Belirtilmemiş",
                date_gregorian: "Belirtilmemiş",
                notes: "Verilen metinde yazar adı ve tarih bilgisi yer almamaktadır. OCR çıktısında bazı kelimeler (örn. 'مسامانلر') muhtemelen 'مسلمانلر' (Müslümanlar) kelimesinin hatalı okunmuş hâlidir; transkripsiyonda bu tutarsızlık korunmuştur."
            }
        },
        'svs': {
            entity_info: {
            "person:muhammed": "Hz. Muhammed, İslam dininin peygamberi olup Mekke'de doğmuş (yaklaşık 570-632), İslam inancına göre Allah'ın son elçisidir. Bu belgede Hz. Muhammed, üzerine salavat (övgü ve rahmet duası) getirilmesi gereken, şanı ve değeri yüceltilen merkezi şahsiyet olarak anılmakta; metin onun adının anılmasıyla ilgili dinî âdâbı açıklamaktadır.",
            "concept:ümmetinin": "Ümmet, İslam dininde bir peygambere inanan ve onun yolundan giden topluluğa, özellikle Hz. Muhammed'e inanan tüm Müslümanlara verilen addır. Bu belgede ümmet, Hz. Muhammed'in ailesinden sayılan takipçileri, yani ona ve soyuna bağlı olan mümin topluluğunu ifade etmek için kullanılmaktadır."
            },
            word_alternatives: {
            "كأنه جيم": {"alternatives":[],"alternative_details":[],"origin":"Arapça (metin tenkidi notu, nüsha farkına işaret eder)","ocr_form":"كأنه جيم"},
            "kâ-ennehu cîm": {"alternatives":[],"alternative_details":[],"origin":"Arapça (metin tenkidi notu, nüsha farkına işaret eder)","ocr_form":"كأنه جيم"},
            "\"sanki cîm harfi gibi\"": {"alternatives":[],"alternative_details":[],"origin":"Arapça ifadenin Türkçe karşılığı (metin tenkidi notu)","ocr_form":"كأنه جيم"},
            "لعميم": {"alternatives":[],"alternative_details":[],"origin":"Arapça (\"umûm/âmm\" kökünden, kapsamlılık anlamında)","ocr_form":"لعميم"},
            "li-amîmi": {"alternatives":[],"alternative_details":[],"origin":"Arapça (\"umûm/âmm\" kökünden, kapsamlılık anlamında)","ocr_form":"لعميم"},
            "geniş kapsamlı": {"alternatives":[],"alternative_details":[],"origin":"Arapça kökenli terimin Türkçe karşılığı (\"umûm/âmm\")","ocr_form":"لعميم"},
            "نعم": {"alternatives":[],"alternative_details":[],"origin":"Arapça (\"ni'met\" = nimet)","ocr_form":"نعم"},
            "na'm": {"alternatives":[],"alternative_details":[],"origin":"Arapça (\"ni'met\" = nimet)","ocr_form":"نعم"},
            "nimet": {"alternatives":[],"alternative_details":[],"origin":"Arapça kökenli terimin Türkçe karşılığı (\"ni'met\")","ocr_form":"نعم"}
            },
            file: 'assets/svs.jpg',
            enhancedFile: 'assets/svs-enhanced.jpg',
            name: 'salavat_serhi_sayfasi.jpg',
            size: '0.05 MB',
            ocr: `جل شانه معبود راضی اولور أن يُصلي صلوة اولمدن عليه
محمد عليه الصلوة والسلام اوزرینه صلوة اولمدن داهی
اولديغی صلوة مثللو صلوة ایله محمد عليه الصلوة والسلام
والتحيينك اوزرینه صلوة تعظيم وتحية تكريم انزاليله
معزز ومحترم ایده بعض نسخهٔ معتمده لرده **كأنه جيم**
ایله واقع اولمشدر اللهم ای ذو الجلال والاكرام اولان
الله جل شانه وعم نواله صلّ من صلاة ایله علی محمد محمد عليه
الصلوة والسلام اوزرینه وعلی ال محمد دخی حضرت محمد عليه
الصلوة والسلامك ال اولان اتباع امت لری اوزرینه صلوة
ایله كما ينبغی **لعميم** شأن عالیسنه لایق علو قدرنه مناسب
اولور صلوة ایده صلوة ایله أن يُصلي صلوة اولنمق معناده
محمد عليه الصلوة والسلام اوزرینه لایق ومناسب اولنور
صلوة مثللو صلوة ایله سرور عالم وزين بني ادم محمد
عليه السلام والتحيينك اوزرینه موافق صلوة تحيه انزاليله
اكرام واجلال ایده اللهم ای قاضی الحاجات وای مجيب الدعوات
اولان الله جل شانه صلّ من صلوة ایله علی محمد محمد عليه
الصلوة والسلام اوزرینه وعلی ال محمد دخی محمد عليه الصلوة
والسلامك آل لری اوزرینه صلوة ایده حتی لا يبقى **نعم** باقی
قالميه`,
            tr: `Şanı yüce olan Allah, Hz. Muhammed (s.a.v.) üzerine henüz salavat getirilmeden önce yapılmış olan salavatlar gibi bir salavatla, Hz. Muhammed ve selam sahiplerinin üzerine yüceltme salavatı ve ağırlama selamı indirerek onu değerli ve saygın kılar. Bazı güvenilir nüshalarda bu kısım **"sanki cîm harfi gibi"** şeklinde geçmektedir. "Allah'ım! Ey celal ve ikram sahibi olan Allah!" -şanı yüce ve lütfu bol olsun- "Hz. Muhammed'e ve onun ailesine, ayrıca Hz. Muhammed'in ailesinden sayılan ümmetinin takipçilerine, onun yüce şanına layık ve yüksek değerine uygun olacak şekilde **geniş kapsamlı** bir salavatla salat eyle." "En yusallî" (salavat getirmek) ifadesi, salavat getirilmek anlamında olup, Hz. Muhammed'e layık ve uygun olan salavat gibi bir salavatla, alemin neşesi ve Âdemoğlunun süsü olan Hz. Muhammed'in ve selam sahiplerinin üzerine uygun bir salavat ve selam indirerek ikram ve yücelik ihsan eyle. "Allah'ım! Ey ihtiyaçları karşılayan ve duaları kabul eden Allah!" -şanı yüce olsun- "Hz. Muhammed'e, onun ailesine ve takipçilerine öyle bir salavat eyle ki, geriye hiçbir **nimet** eksik kalmasın.`,
            trans_en: `The Almighty God is pleased to make Muhammed (peace be upon him) honored and respected by sending down a prayer of glorification and a greeting of honor upon him and the recipients of greetings, just like the prayers offered before. In some reliable copies, this part appears as **"as if it were the letter Jeem"**. "O Allah! O Owner of Majesty and Honor!" -may His glory be exalted and His bounty be abundant- "send blessings upon Muhammed, upon the family of Muhammed, and upon the followers of his Ummah who are of his family, with a **comprehensive** blessing that is worthy of his exalted status and suitable for his high value." The phrase "an yusallî" means to be blessed, and by sending down a suitable blessing and greeting upon Muhammed, who is the joy of the universe and the ornament of the children of Adam, and upon the recipients of greetings, may He bestow honor and glory. "O Allah! O Fulfiller of needs and O Answerer of prayers!" -may His glory be exalted- "send blessings upon Muhammed, upon the family of Muhammed, and upon his followers so that no **bounty** remains ungranted.`,
            translit: `Celle şânühü ma'bûd râzî olur en yusallî salâten olmadan aleyhi
Muhammed aleyhi's-salâtü ve's-selâm üzerine salât olmadan dahî
olduğı salât misillü salât ile Muhammed aleyhi's-salâtü ve's-selâm
ve't-tahiyyînüñ üzerine salât ta'zîm ve tahiyyet-i tekrîm inzâliyle
mu'azzez ve muhterem ide ba'zı nüsha-i mu'temedelerde **kâ-ennehu cîm**
ile vâki' olmışdur Allâhümme ey zü'l-celâli ve'l-ikrâm olan
Allâh celle şânühü ve amme nevâlühü salli min salâtin ile alâ Muhammed Muhammed aleyhi
ve's-salâtü ve's-selâm üzerine ve alâ âli Muhammed dahî Hazret-i Muhammed aleyhi
ve's-salâtü ve's-selâmıñ âli olan etbâ'-ı ümmetleri üzerine salât
ile kemâ yenbeğî **li-amîmi** şe'n-i âlîsine lâyık uluvv-i kadrine münâsib
olur salât ide salât ile en yusallî salât olunmak ma'nâda
Muhammed aleyhi's-salâtü ve's-selâm üzerine lâyık ve münâsib olunur
salât misillü salât ile sürûr-ı âlem ve zeyn-i benî Âdem Muhammed
aleyhi's-selâm ve't-tahiyyînüñ üzerine muvâfık salât tahiyye inzâliyle
ikrâm ve iclâl ide Allâhümme ey kâdiye'l-hâcât ve ey mucîbe'd-da'avât
olan Allâh celle şânühü salli min salâtin ile alâ Muhammed Muhammed aleyhi
ve's-salâtü ve's-selâm üzerine ve alâ âli Muhammed dahî Muhammed aleyhi's-salâtü
ve's-selâmıñ âlleri üzerine salât ide hattâ lâ yebkâ **na'm** bâkî
kalmaya`,
            analysis: {
                document_type: "Dini Metin / Şerh",
                confidence: 95,
                style: "Nesir, Dini-Açıklayıcı (Şerh)",
                summary: "Belge, Hz. Muhammed'e ve onun ailesine (âline) getirilecek salavatların mahiyetini, faziletini ve bu duaların nasıl yapılması gerektiğini açıklayan dini bir şerh metnidir. Metinde duaların kabulü, Allah'ın sıfatları ve salavatın lafzi tahlilleri üzerinde durulmaktadır.",
                key_points: [
                    "Hz. Muhammed'e ve onun ailesine (âline) getirilen salavatların önemi ve fazileti açıklanmaktadır.",
                    "Bazı nüshalardaki yazım farklılıklarına ve 'kâ-ennehu cîm' gibi ibarelere değinilerek metin tenkidi yapılmaktadır.",
                    "Allah'ın 'Zü'l-Celâli ve'l-İkrâm', 'Kâdiye'l-Hâcât' ve 'Mucîbe'd-Da'avât' gibi esmaları anılarak dualar edilmektedir."
                ],
                people: ["Muhammed", "Hazret-i Muhammed"],
                places: [],
                concepts: ["salât", "tahiyye", "ümmet", "Zü'l-Celâli ve'l-İkrâm", "Kâdiye'l-Hâcât", "Mucîbe'd-Da'avât"],
                script_type: "Nesih",
                script_purpose: "Dini eğitim ve ibadet (Şerh kitabı sayfası)",
                period_estimate: "Osmanlı Dönemi (18-19. Yüzyıl)",
                date_hijri: "Belirtilmemiş",
                date_gregorian: "Belirtilmemiş",
                notes: "Metin, Delâilü'l-Hayrât veya benzeri bir salavat mecmuasının Türkçe şerhine ait bir sayfadır. Arapça ibarelerin Türkçe açıklamaları yapılmıştır. Bu örnek, kullanıcının kendi fotoğrafladığı bir belge üzerinde sistemin gerçek OCR/çeviri motoru çalıştırılarak eklenmiştir."
            }
        },
        'rzk': {
            entity_info: {
            "concept:rızık": "Rızık, İslami gelenekte Allah tarafından insana ve diğer canlılara bahşedilen geçim kaynağı, nasip ve yaşam için gerekli olan her türlü nimete verilen addır. Bu belgede rızık, insanın kapı kapı dolaşarak değil, yalnızca Allah'a güvenip dua ederek elde edebileceği bir lütuf olarak tasvir edilmekte, tevekkül düşüncesiyle iç içe işlenmektedir. Şiirin ana teması, rızkın gerçek kaynağının Allah olduğu ve başkalarının yalnızca görünürde bir aracı rolü oynadığıdır.",
            "concept:dergâhına": "Dergâh, Arapça-Farsça kökenli bir kelime olup aslen bir tarikat şeyhinin/mürşidin bulunduğu tekke, manevi eğitim merkezi anlamına gelir; mecazi olarak 'yüce kapı', 'huzur' anlamında da (özellikle Allah'a veya padişaha atfen) kullanılır. Bu belgede dergâh, Allah'ın 'yüce dergâhı' anlamında, kulun yüzünü çevirip dua etmesi gereken manevi makamı ifade etmektedir."
            },
            word_alternatives: {
            "یاره": {"alternatives":[],"alternative_details":[],"origin":"Farsça (\"yâr\" = dost/sevgili + Türkçe yönelme eki)","ocr_form":"یاره"},
            "yâre": {"alternatives":[],"alternative_details":[],"origin":"Farsça (\"yâr\" = dost/sevgili + Türkçe yönelme eki)","ocr_form":"یاره"},
            "ارزاق": {"alternatives":[],"alternative_details":[],"origin":"Arapça (\"rızk\" kelimesinin çoğulu, rızıklar)","ocr_form":"ارزاق"},
            "erzâk": {"alternatives":[],"alternative_details":[],"origin":"Arapça (\"rızk\" kelimesinin çoğulu, rızıklar)","ocr_form":"ارزاق"}
            },
            file: 'assets/rzk.jpg',
            enhancedFile: 'assets/rzk-enhanced.jpg',
            name: 'gulzar_i_sufiyye_rizik_manzumesi.jpg',
            size: '0.07 MB',
            ocr: `هو
رزق ایچون ایلمه دور ابواب - در احسان خدا نعم الباب
یوزیکی سور اولو درگاهه - قیل خشوعیله نیاز الله
دائماً حقه توکل ایله - کیمسه **یاره** توسل ایله
غیردن اومما وار ایسه لطف خدا - آکا محتاج بتون شاه و گدا
بیله سن جمله یی عبد عاجz - اوله ماز رزقله کیمسه حاجز
ظاهراً غیریسی ده اولسه سبب - لطف و احسان خدانکدر هب
کریم اسمایه توسل لازم - اعتقادک اوله اما جازم
که حقیقتده مدار رزق - او ایدر عالمی انچق **ارزاق**
غیری یی مانع و معطی صانما - ظاهر هر حاله باقوب المدام
گلزار صوفیه ص ١١٠`,
            tr: `Rızık elde etmek için insanları kapı kapı dolaşma. Allah'ın lütuf kapısı, kapıların en güzelidir. Yüzünü O'nun yüce dergâhına çevir ve içtenlikle Allah'a dua et.
Her zaman Allah'a güven ve O'na dayan; başkalarına sığınıp onlardan medet umma. Bir iyilik elde edeceksen bunun Allah'ın lütfu olduğunu bil ve iyiliği başkalarından bekleme. Çünkü hükümdarlar da dilenciler de Allah'a muhtaçtır.
Herkesin aciz birer kul olduğunu bil. Hiç kimse Allah'ın vereceği rızka engel olamaz. Görünüşte rızkının başkaları aracılığıyla geldiğini düşünsen bile, asıl iyilik ve lütfun Allah'tan geldiğini unutma.
Allah'ın güzel isimlerini anarak dua etmelisin; ancak bu konudaki inancın kesin ve sağlam olmalıdır. Çünkü rızkın gerçek kaynağı Allah'tır ve bütün dünyayı rızıklandıran O'dur.
Başkalarını rızık veren veya rızka engel olan kişiler olarak görme. Olayların yalnızca görünen yönüne bakarak yanılgıya düşme.
Kaynak: Gülzâr-ı Sûfiyye, s. 110.`,
            trans_en: `He (God)
Do not wander from door to door for sustenance; the door of God's bounty is the best of doors.
Rub your face against that great threshold and pray to God with deep humility.
Always trust in God; do not make recourse to **anyone else**.
Do not expect from others if there is God's grace; all kings and beggars are in need of Him.
Know everyone as a helpless servant; no one can prevent sustenance.
Even if outwardly someone else seems to be the cause, grace and bounty belong entirely to God.
It is necessary to resort to the Generous Names (of God); but your belief must be firm.
For in reality, the source of sustenance is Him; He alone **provides** for the universe.
Do not think of anyone else as the preventer or the giver; do not constantly look at the outward appearance of every situation.
Gülzâr-ı Sûfiyye, page 110.`,
            translit: `Hû
Rızk içün eyleme devr-i ebvâb - der-i ihsân-ı Hudâ ni'me'l-bâb
Yüzüñi sür ulu dergâha - kıl huşû'ıla niyâz Allâh
Dâ'imâ Hakka tevekkül eyle - kimse **yâre** tevessül eyle
Gayrdan umma var ise lutf-ı Hudâ - aña muhtâc bütün şâh u gedâ
Bilesin cümleyi 'abd-i 'âciz - olamaz rızkla kimse hâciz
Zâhiren gayrisi de olsa sebeb - lutf u ihsân Hudânıñdır hep
Kerîm esmâya tevessül lâzım - i'tikâdıñ ola ammâ câzim
Ki hakîkatde medâr-ı rızk - o eder 'âlemi ancak **erzâk**
Gayrıyı mâni' ve mu'tî ṣanma - zâhir her hâle bakup el-mudâm
Gülzâr-ı Sûfiyye ṣ. 110`,
            analysis: {
                document_type: "Şiir / Manzume",
                confidence: 95,
                style: "Tasavvufi, didaktik, manzum",
                summary: "Belge, Gülzâr-ı Sûfiyye adlı eserden alıntılanmış, rızık ve tevekkül konularını işleyen tasavvufi bir şiirdir. İnsanın rızık arayışında yalnızca Allah'a yönelmesi, O'na güvenmesi ve başkalarından beklentiye girmemesi gerektiği öğütlenmektedir.",
                key_points: [
                    "Rızık arayışında kapı kapı dolaşmak yerine yalnızca Allah'ın dergahına sığınılmalıdır.",
                    "Dünyadaki tüm varlıklar, hükümdarlar ve dilenciler dahil olmak üzere Allah'a muhtaçtır.",
                    "Görünüşte rızka başkaları vesile olsa bile, gerçek lütuf ve ihsan yalnızca Allah'tan gelir.",
                    "Allah'ın güzel isimlerine sığınarak dua edilmeli ve bu konudaki inanç tam olmalıdır."
                ],
                people: [],
                places: [],
                concepts: ["rızık", "dergâh"],
                script_type: "Rik'a",
                script_purpose: "Edebi/Tasavvufi Metin Kaydı",
                period_estimate: "Geç Osmanlı Dönemi",
                date_hijri: "Belirtilmemiş",
                date_gregorian: "Belirtilmemiş",
                notes: "Metin, Gülzâr-ı Sûfiyye isimli tasavvufi bir eserin 110. sayfasından alıntılanmış manzum bir nasihatnamedir."
            }
        },
        'srg': {
            entity_info: {
            "place:batum": "Batum (Batumi), Karadeniz kıyısında, günümüzde Gürcistan sınırları içinde yer alan, 19. yüzyılda Osmanlı-Rus sınır bölgesinde önemli bir liman şehridir. Bu belgede Batum, köleleştirilmiş kadınları taşıyan vapurun yola çıktığı liman olarak anılmakta, dönemin Kafkasya üzerinden İstanbul'a uzanan köle ticareti güzergâhına işaret etmektedir.",
            "place:tophane": "Tophane, İstanbul'da Boğaz kıyısında, adını Osmanlı döneminde burada bulunan top dökümhanesinden alan tarihî bir semt ve iskele bölgesidir; 19. yüzyılda önemli bir liman ve iskele noktasıydı. Bu belgede Tophane, Rusya Kumpanyası'na ait bir vapurun yanaştığı ve köleleştirilmiş kadınların karaya çıkarıldığı iskele olarak sahnenin geçtiği mekândır.",
            "concept:çerkeslere": "Çerkesler, Kafkasya kökenli bir halktır; 19. yüzyılda Rus işgali ve sürgünleri (özellikle 1864 Çerkes Sürgünü) sonrasında çok sayıda Çerkes Osmanlı topraklarına göç etmiş, bu dönemde bazı Çerkesler köle ticaretiyle de ilişkilendirilmiştir. Bu belgede Çerkes, köleleştirilmiş kadınları vapurla getirip pazarlayan kişi olarak sahnede yer almakta; roman bu sahneyle dönemin kölelik/cariyelik kurumunu eleştirel bir gözle ele almaktadır.",
            "concept:çerkes": "Çerkesler, Kafkasya kökenli bir halktır; 19. yüzyılda Rus işgali ve sürgünleri (özellikle 1864 Çerkes Sürgünü) sonrasında çok sayıda Çerkes Osmanlı topraklarına göç etmiş, bu dönemde bazı Çerkesler köle ticaretiyle de ilişkilendirilmiştir. Bu belgede Çerkes, köleleştirilmiş kadınları vapurla getirip pazarlayan kişi olarak sahnede yer almakta; roman bu sahneyle dönemin kölelik/cariyelik kurumunu eleştirel bir gözle ele almaktadır.",
            "concept:köleler": "Köle, bir başkasının mülkiyeti altında, hukuki kişiliği kısıtlanmış şekilde çalıştırılan veya satılan kişiye verilen addır; Osmanlı toplumunda kölelik 19. yüzyıl sonuna kadar hukuken var olan bir kurumdu. Bu belgede köleleştirilmiş kadınlar, Batum'dan gelen bir vapurla İstanbul'a getirilip bir Çerkes tüccar tarafından teslim edilen kişiler olarak tasvir edilmekte; roman bu sahneyle kölelik kurumunu eleştirel biçimde okura tanıtmaktadır."
            },
            word_alternatives: {},
            file: 'assets/srg.jpg',
            enhancedFile: 'assets/srg-enhanced.jpg',
            name: 'serguzest_acilis_sahnesi.jpg',
            size: '0.19 MB',
            ocr: `روسیا کومپانیاسین باتومدن گیلن بر وپورو توپخانە‌نین اونونه یاناشدیغی زمان دنیزین اوزرینده صابرسزلقله بکلینن برکچ کیشی سندللردن وپوروڭ ایچینه آتمشلردی.

بونلردن بریسی اوزون بویلی، گنیش اوموزلی، بر سی سیاه بیولی، اتکلری آیاقلارنه قدر اوزون، بلی غایت دار بر چرکز پالتوسو گیمیش...

یاننده کَندی قَوْمِنین قلپاغی، الینده بر گوموشلی قِرْباچی اولان چرکزه:

— صفا گلدیز. جاریەلر نرده؟
— ایشتە بوردە...
— قاچ تانە؟
— اوچ...
— گوزل می؟

چرکز، اسیرلردن برینی گوستردەرک: شو مائی گوزلره باق! بر پاشا بونا بر خزینە ویرر.

چرکزله بو هرِف بر سندلە، جاریەلر ده دیگرینە بینەرک توپخانە اسکلسنه دوغرو وپوردن آچلدیلر.`,
            tr: `Rusya Kumpanyası'na ait, Batum'dan gelen bir vapur Tophane'nin önüne yanaştığında, denizde bekleyen birkaç kişi sabırsızlıkla sandallardan vapura atladı.
Bunlardan biri uzun boylu, geniş omuzlu ve seyrek siyah bıyıklıydı. Ayaklarına kadar uzanan etekleri ve oldukça dar beli olan, Çerkeslere özgü bir palto giyiyordu.
Başında kendi halkına özgü bir kalpak, elinde ise gümüş işlemeli bir kırbaç vardı. Çerkes'e şöyle seslendiler:
— Hoş geldiniz. Kadın köleler nerede?
— İşte burada...
— Kaç kişiler?
— Üç...
— Güzeller mi?
Çerkes, köleleştirilmiş kadınlardan birini göstererek şöyle dedi:
— Şu mavi gözlere bak! Bir paşa bu kadın için bir hazine verir.
Çerkes ile diğer adam bir sandala, köleleştirilmiş kadınlar ise başka bir sandala bindiler. Ardından vapurdan ayrılarak Tophane İskelesi'ne doğru ilerlediler.`,
            translit: `Rusya kumpanyasının Batum'dan gelen bir vapuru Tophane'nin önüne yanaştığı zaman denizin üzerinde sabırsızlıkla bekleyen birkaç kişi sandallardan vapurun içine atılmışlardı.

Bunlardan birisi uzun boylu, geniş omuzlu, seyrek siyah bıyıklı, etekleri ayaklarına kadar uzun, beli gayet dar bir Çerkez paltosu giymiş...

Yanında kendi kavminin kalpağı, elinde bir gümüşlü kırbacı olan Çerkez'e:

— Safa geldiniz. Cariyeler nerede?
— İşte burada...
— Kaç tane?
— Üç...
— Güzel mi?

Çerkez, esirlerden birini göstererek: Şu mâî gözlere bak! Bir paşa buna bir hazine verir.

Çerkez'le bu herif bir sandala, cariyeler de diğerine binerek Tophane İskelesi'ne doğru vapurdan açıldılar.`,
            analysis: {
                document_type: "Roman (Matbu Sayfa)",
                confidence: 90,
                style: "Realist/natüralist anlatım, diyalog ağırlıklı roman nesri",
                summary: "Samipaşazade Sezai'nin 1888'de yayımlanan 'Sergüzeşt' adlı romanının açılış sahnesi. Rusya Kumpanyası'na ait bir vapur Batum'dan Tophane'ye yanaşır; güvertede bekleyen bir Çerkez tüccar, beraberindeki cariyeleri sandallarla karaya çıkarır ve onların güzelliği üzerine kısa bir diyalog geçer. Sahne, romanın konusu olan cariyelik/kölelik meselesini daha ilk sayfada okura tanıtır.",
                key_points: [
                    "Eser, Samipaşazade Sezai'nin 1888'de yayımlanan ve Türk edebiyatının ilk realist/natüralist romanlarından sayılan 'Sergüzeşt' adlı romanının açılış sahnesidir.",
                    "Sahne, Kafkasya'dan (Batum üzerinden) İstanbul'a getirilen cariyelerin Tophane'de bir vapurdan indirilip bir Çerkez tüccar tarafından teslim alınışını anlatır.",
                    "Roman, dönemin kölelik/cariyelik kurumunu eleştirel bir gözle ele alması bakımından Tanzimat sonrası Türk edebiyatında önemli bir dönüm noktasıdır.",
                    "Sahnedeki diyalog, cariyelerin bir mal gibi alınıp satılmasını ve güzelliklerinin bir pazarlık unsuru olarak konuşulmasını doğrudan okura aktarır."
                ],
                people: [],
                places: ["Tophane", "Batum"],
                concepts: ["köle", "Çerkes"],
                script_type: "Matbu",
                script_purpose: "Edebî eser / roman",
                period_estimate: "Tanzimat Sonrası Dönem (1888)",
                date_hijri: "Belirtilmemiş",
                date_gregorian: "1888",
                notes: "Metin, kullanıcı tarafından sağlanan okuma esas alınarak eklenmiştir; www.bendelimiyim.com filigranlı bir matbu baskıdan alınmıştır. 'Sergüzeşt', Dilber adlı bir cariyenin trajik hikâyesini anlatır ve Türk edebiyatında kölelik karşıtı ilk eserlerden biri olarak kabul edilir."
            }
        },
        'sbm': {
            entity_info: {
            "person:şehzade bayezid": "Şehzade Bayezid (1525-1562), Kanuni Sultan Süleyman'ın oğlu olup, ağabeyi Şehzade Selim (sonradan II. Selim) ile giriştiği taht mücadelesini kaybetmiş, Safevi topraklarına sığınmak zorunda kalmış ve 1561-1562'de babasının emriyle İran'da idam edilmiştir. Bu belgede Bayezid, babası Kanuni Sultan Süleyman'a hitaben yazdığı, masumiyetini savunduğu ve merhamet dilediği duygusal bir şiirin yazarı olarak anılmaktadır.",
            "person:kanûnî sultan süleyman": "Kanûnî Sultan Süleyman (1494-1566), Osmanlı Devleti'nin en uzun süre tahtta kalan padişahlarından biri olup, hem askerî başarıları hem de hukuki/idari düzenlemeleriyle (kanunlarıyla) tanınır; Avrupa'da 'Muhteşem Süleyman' olarak bilinir. Bu belgede Kanûnî, oğlu Şehzade Bayezid'in taht mücadelesi sırasında kendisine yazdığı yalvarış şiirinin muhatabı olan baba/padişah figürü olarak yer almaktadır.",
            "concept:şiirdir": "Şiir, duygu ve düşüncelerin ölçülü, kafiyeli veya belirli bir estetik düzen içinde dille ifade edildiği edebî türdür. Bu belgede şiir, Şehzade Bayezid'in babası Kanuni Sultan Süleyman'a yazdığı, masumiyetini savunan ve merhamet dileyen, her kıtası aynı nakarat mısraıyla biten duygusal bir yalvarış şiirini ifade etmektedir.",
            "date:30 nisan 1918": "Tarih ve Edebiyat Mecmuası'nın yayımlandığı 30 Nisan 1918 tarihi, Miladi takvime göre I. Dünya Savaşı'nın son yılına, Osmanlı Devleti'nin Mondros Mütarekesi'nden birkaç ay önceki dönemine denk gelir; aynı zamanda Rumi takvimde 1334 yılına karşılık gelmektedir. Bu belgede 30 Nisan 1918, Şehzade Bayezid'in 16. yüzyılda yazdığı şiirin yeniden yayımlandığı derginin baskı tarihidir — şiirin kendisinin yazıldığı 1559-1561 taht mücadelesi dönemiyle karıştırılmamalıdır; belge aslında çok daha eski bir metnin erken 20. yüzyıldaki bir neşridir."
            },
            word_alternatives: {},
            file: 'assets/sbm.jpg',
            enhancedFile: 'assets/sbm-enhanced.jpg',
            name: 'sehzade_bayezid_siiri_tarih_ve_edebiyat.jpg',
            size: '0.26 MB',
            ocr: `تاریخ و ادبیات
مجموعه‌سی
سنه : ١ — ٣٠ نیسان ١٣٣٤ — عدد : ٢

شهزاده بایزیدك پدرلری قانونی سلطان سلیمان خان حضرتلرینه ارسال ایدلک نظم منظومه‌در [١]

ای سراسر عالمه سلطان سلیمانم بابا
تنده جانم جانمك ایچنده جانانم بابا
بایزیده قییار میسك بنم جانم بابا
بی‌گناهم حق بیلور دولتلو سلطانم بابا

انبیا سر دفتری یعنی که آدم حقیچون
هم دخی موسی ایله عیسی و مریم حقیچون
کائناتك سروری اول روح اعظم حقیچون
بی‌گناهم حق بیلور دولتلو سلطانم بابا

سانکه مجنونم بکا داغلر باشی اولدی طوراق
آیریلوب بالجمله مال و ملکدن دوشدم ایراق
دوکرم گوز یاشی واحسرتا داد الفراق
بی‌گناهم حق بیلور دولتلو سلطانم بابا

[١] شهزاده بایزید، شهزاده جم و شهزاده قورقودکی شعرای شهزادگان خاندان عثمانیه‌دندر؛ مخلص نجیبانه‌لری (شاهی) در ترکی و فارسی ایکی عدد دیوان اشعار بلیغانه‌لری ومتفرق بعض آثاری وبرکتاب ظهرنده خط دست عارفانه‌لری ملت کتبخانه‌سنده موجوددر معارف‌پرور بر شهزاده اولدیغندن نامیلرینه بك چوق کتابلر تألیف وترکجه یه ترجمه اولنمشدر.`,
            tr: `Tarih ve Edebiyat Mecmuası
1. Yıl — 30 Nisan 1918 — Sayı: 2
Şehzade Bayezid'in babası Kanûnî Sultan Süleyman Han'a gönderdiği şiirdir.
Ey bütün dünyanın hükümdarı olan Süleyman'ım, babam!
Bedenimdeki canım, canımın içindeki sevgilim olan babam!
Canım babam, kendi oğlun Bayezid'e kıyar mısın?
Ben suçsuzum; Allah biliyor, ey yüce sultanım, babam!
Peygamberlerin ilki olan Âdem'in hatırı için,
Musa, İsa ve Meryem'in hatırı için,
Bütün kâinatın efendisi Hz. Muhammed'in yüce ruhu hatırı için,
Ben suçsuzum; Allah biliyor, ey yüce sultanım, babam!
Tıpkı Mecnun gibi, dağ başları benim yuvam oldu.
Bütün malımdan ve mülkümden ayrılarak uzaklara düştüm.
Gözyaşları döküyor, "Ah, özlem! Ey ayrılık, yetiş imdadıma!" diye feryat ediyorum.
Ben suçsuzum; Allah biliyor, ey yüce sultanım, babam!`,
            translit: `Târîh ve Edebiyât Mecmû'ası
Sene: 1 — 30 Nisan 1334 — Aded: 2

Şehzâde Bâyezîd'in pederleri Kânûnî Sultân Süleymân Han hazretlerine irsâl eyledikleri nazm-ı manzûmedir [1]

Ey serâser âleme sultân Süleymânım baba
Tende cânım, cânımın içinde cânânım baba
Bâyezîd'ine kıyar mısın benim cânım baba
Bî-günâhım, Hak bilür, devletlü sultânım baba

Enbiyâ ser-defteri, ya'nî ki Âdem hakkıçün
Hem dahî Mûsâ ile Îsâ vü Meryem hakkıçün
Kâinâtın serveri, ol rûh-ı a'zam hakkıçün
Bî-günâhım, Hak bilür, devletlü sultânım baba

Sanki Mecnûn'um, bana dağlar başı oldu durak
Ayrılub bi'l-cümle mâl ü mülkden düştüm ırak
Dökerüm göz yaşı, vâ-hasretâ, dâd el-firâk
Bî-günâhım, Hak bilür, devletlü sultânım baba

[1] Şehzâde Bâyezîd, Şehzâde Cem ve Şehzâde Korkud gibi şehzadegân-ı hânedân-ı Osmâniyyeden şairlerin mahlas-ı necîbâneleri (Şâhî) olup, Türkçe ve Farsça iki adet divan-ı eş'âr-ı belîğâneleri ve müteferrik ba'zı âsârı ve bir kitap zahrında hatt-ı destleri Millet Kütüphanesi'nde mevcuttur; maârif-perver bir şehzade olduğundan, nâmlarına pek çok kitaplar te'lîf ve Türkçeye tercüme olunmuştur.`,
            analysis: {
                document_type: "Dergi Sayfası / Tarihî Manzume",
                confidence: 88,
                style: "Matbu dergi sayfası; nesih hatla dizilmiş, hüzünlü ve yalvarış tonlu bir manzume",
                summary: "Bu sayfa, 'Tarih ve Edebiyat Mecmuası'nın 30 Nisan 1334 (1918) tarihli 2. sayısından olup, Şehzade Bayezid'in (mahlası: Şâhî) 1559-1561 taht mücadelesi sırasında babası Kanuni Sultan Süleyman'a gönderdiği, masumiyetini savunan meşhur yalvarış şiirini içerir. Bayezid, bu şiirde babasına 'bî-günahım' (günahsızım) diyerek merhamet dilemektedir.",
                key_points: [
                    "Şehzade Bayezid, ağabeyi Şehzade Selim (sonradan II. Selim) ile giriştiği taht mücadelesini kaybedip Safevi topraklarına (İran'a) sığınmak zorunda kalmıştı.",
                    "Bu manzume, Bayezid'in babası Kanuni Sultan Süleyman'ın merhametine sığınarak masumiyetini savunduğu duygusal bir yalvarış şiiridir.",
                    "Bayezid, 1561-1562'de Kazvin'de (İran) babasının emriyle İran şahının eliyle idam edilmiştir; bu şiir idamından önceki umutsuz çağrılarından biridir.",
                    "Dipnotta, Bayezid'in 'Şâhî' mahlasıyla şiirler yazdığı, Türkçe ve Farsça iki divanının bulunduğu ve el yazısının Millet Kütüphanesi'nde korunduğu belirtilmektedir.",
                    "Sayfa, 'Tarih ve Edebiyat Mecmuası'nın 30 Nisan 1334 (1918) tarihli 2. sayısından alınmıştır; üzerinde Büyük Millet Meclisi Kütüphanesi mührü bulunmaktadır."
                ],
                people: ["Şehzade Bayezid", "Kanûnî Sultan Süleyman"],
                places: [],
                concepts: ["şehzade", "şiir"],
                script_type: "Matbu (nesih dizgi)",
                script_purpose: "Tarihî belge yayını / edebiyat mecmuası",
                period_estimate: "Yayın: 1334 (1918) — Şiirin aslı: 1559-1561 taht mücadelesi dönemi",
                date_hijri: "Belirtilmemiş",
                date_gregorian: "30 Nisan 1918 (1334 Rumi)",
                notes: "Metin, kullanıcının Vikikaynak'taki yayımlanmış transkripsiyonla karşılaştırarak sağladığı okuma esas alınarak eklenmiştir. Görseldeki mühür 'Büyük Millet Meclisi Kütüphanesi'ne aittir. Şiirin tamamı üç kıta olup her kıta aynı nakarat mısraıyla ('Bî-günâhım, Hak bilür, devletlü sultânım baba') bitmektedir; bu sayfada şiirin üçü de görünmektedir."
            }
        },
        'klm': {
            entity_info: {
            "concept:kadı": "Kadı, Osmanlı adalet sisteminde İslam hukukuna (şer'î hukuka) göre yargı yetkisini kullanan, aynı zamanda bulunduğu kazada çeşitli idari ve dinî görevleri de yürüten görevlidir. Bu belgede kadı, hem belgeyi düzenleyen Söğüt kadısı Seyyid Mehmed'i hem de genel olarak böyle bir ilâmı yazma yetkisine sahip görevliyi ifade etmektedir.",
            "concept:arz": "Arz, Osmanlı bürokrasisinde bir alt makamdan üst makama (genellikle merkeze veya padişaha) sunulan resmî bildirim, talep veya rapor niteliğindeki yazıya verilen genel addır. Bu belgede arz, Söğüt kadısının, boşalan imamlık görevine dair durumu ve önerdiği adayı merkeze (dergâh-ı saadete) bildirdiği resmî yazıyı ifade etmektedir.",
            "place:söğüt": "Söğüt, Bilecik ili sınırları içinde, Osmanlı Devleti'nin kuruluş yeri olarak bilinen tarihî bir kasabadır; Osman Gazi'nin beyliğini burada kurduğuna inanılır. Bu belgede Söğüt, imamlık göreviyle ilgili kadı ilâmının düzenlendiği kaza merkezi olarak geçmektedir.",
            "place:sofular köyünde": "Bu belgede Sofular köyü, Söğüt kazasına bağlı, günlük beş akçe maaşla bir imamın görev yaptığı küçük bir yerleşim yeri olarak anılmaktadır; belgenin konusu bu köydeki imamlık görevinin boşalması ve yeniden doldurulmasıdır.",
            "concept:akçe": "Akçe, Osmanlı Devleti'nin uzun süre temel para birimi olarak kullandığı gümüş sikkeye verilen addır. Bu belgede akçe, Sofular köyündeki imamın aldığı günlük beş akçelik maaşı ifade etmek için kullanılmaktadır.",
            "concept:imamlık": "İmamlık, bir camide cemaate namaz kıldırma görevine ve bu görevin resmî statüsüne verilen addır; Osmanlı taşra teşkilatında imamlar genellikle vakıf veya cemaat gelirlerinden günlük/aylık bir ücretle görevlendirilirdi. Bu belgenin konusu, Sofular köyündeki imamlık görevinin, önceki imam Musa'nın vefatı üzerine boşalması ve yerine ehil görülen birinin atanması talebidir.",
            "person:musa": "Bu belgede adı geçen Musa, Söğüt kazasına bağlı Sofular köyünde günlük beş akçe maaşla imamlık görevini yürüten, belgenin düzenlendiği 921 (1515) yılında vefat ettiği belirtilen yerel bir din görevlisidir. Belgenin konusu, onun vefatıyla boşalan imamlık görevine yeni birinin atanması talebidir; kendisi hakkında bundan başka bir bilgi metinde yer almamaktadır.",
            "concept:kadısı": "Kadı, Osmanlı adalet sisteminde İslam hukukuna (şer'î hukuka) göre yargı yetkisini kullanan, aynı zamanda bulunduğu kazada çeşitli idari ve dinî görevleri de yürüten görevlidir. Bu belgede kadı, hem belgeyi düzenleyen Söğüt kadısı Seyyid Mehmed'i hem de genel olarak böyle bir ilâmı yazma yetkisine sahip görevliyi ifade etmektedir.",
            "person:seyyid mehmed": "Bu belgede Seyyid Mehmed, Söğüt kadısı olarak belgeyi yazıp mühürleyen, dolayısıyla Söğüt kazasının o dönemki (921/1515) şer'î yargı ve idare işlerinden sorumlu görevlisidir. 'Seyyid' unvanı, kendisinin Hz. Muhammed soyundan geldiğine inanılan bir aileye mensup olduğunu göstermektedir.",
            "date:921": "Hicrî 921 yılı, Miladi takvimde yaklaşık 1515 yılına karşılık gelir ve Yavuz Sultan Selim'in saltanatının (1512-1520) erken dönemine rastlar; bu dönem Osmanlı Devleti'nin Mısır ve İran seferleriyle hızla büyüdüğü yıllardır. Bu belgede 921 tarihi, Söğüt kazasındaki bir imamlık görevinin boşalması üzerine düzenlenen kadı ilâmının yazıldığı yılı, yani belgenin resmî tarihini belirtmektedir."
            },
            word_alternatives: {},
            file: 'assets/klm.jpg',
            enhancedFile: 'assets/klm-enhanced.jpg',
            name: 'sogud_kadisi_imamet_ilami_921.jpg',
            size: '0.12 MB',
            ocr: `هو

در دست / اعلام

درگاه عالیه و بارگاه اعلایه لازال عالیاً عرض بنده بی‌مقدار و خاکسار بودر کی

سگود قضاسنده صوفیلر نام قریه‌ده یومی بش آقچه ایله امام اولان موسی فوت اولوب

اولوب امامت مذکوره خالی قالمغله اشبو رافع رقعه عبودیت صداقت حقیقت

محله و ولایته اهلیتی توجیه اولنوب در سعادته عرض اولندی که باقی فرمان

درگاه سعادته معلومدر تحریراً فی اواسط المحرم الحرام سنه احدی و عشرین و تسعمائة (٩٢١)

الداعی للدولة العلیة السید محمد القاضی ببقعة سگود`,
            tr: `(Allah'ın adıyla)
İşleme alınmıştır – Kadı Raporu
Allah'ın şanı daim olsun. Yüce makama, değersiz ve mütevazı kulunuz tarafından arz olunur ki:
Söğüt kazasının Sofular köyünde günlük beş akçe karşılığında imamlık yapan Musa vefat etmiştir.
Söz konusu imamlık görevi boş kaldığından, bu dilekçeyi sunan ve doğruluğu ile güvenilirliği bilinen kişi, söz konusu mahalle ve bölgenin ihtiyaçlarını karşılayabilecek yeterlilikte görülerek merkeze arz edilmiştir.
Bu konudaki nihai karar, yüce ve kutlu makama aittir.
Bu belge, 921 yılı Muharrem ayının ortalarında (1515 yılı) yazılmıştır.
Söğüt kadısı Seyyid Mehmed
Yüce devlete dua eder.`,
            translit: `Hû

Der-dest / İ'lâm

Dergâh-ı âliyye ve bârgâh-ı a'lâya lâ-zâl âliyen arz-ı bende-i bî-mikdâr ü hâksâr budur ki

Söğüd kazâsında Sofular nâm karyede yevmî beş akçe ile imâm olan Mûsâ fevt olub

İmâmet-i mezbûre hâlî kalmağla işbu râfi'-i rık'a-i 'ubûdiyyet sadâkat hakîkat

Mahalle ve vilâyete ehliyeti tevcîh olunub der-i sa'âdete arz olundu ki bâkî fermân

Dergâh-ı sa'âdete ma'lûmdur tahrîren fî evâsiti'l-Muharremi'l-harâm sene ihdâ ve 'işrîn ve tis'a-mi'e (921)

Ed-dâ'î li'd-devleti'l-'aliyye es-Seyyid Muhammed el-kâdî bi-buk'ati Söğüd`,
            analysis: {
                document_type: "Kadı İlâmı (Arz)",
                confidence: 85,
                style: "Resmî, hukukî-dinî arz/ilâm üslubu",
                summary: "1515 (H. 921) tarihli bu kadı ilâmı, Söğüt kazasına bağlı Sofular köyünde günlük 5 akçe maaşla görev yapan imam Musa'nın vefatı üzerine, yerine ehil görülen bir kişinin atanması için merkeze (dergâh-ı sa'âdete) yapılan resmî arzdır. Belgeyi Söğüt kadısı Seyyid Mehmed yazıp mühürlemiştir.",
                key_points: [
                    "Belge, Söğüt kazasına bağlı Sofular köyündeki imamlık makamının boşalması üzerine düzenlenmiş bir kadı ilâmıdır (arzıdır).",
                    "Önceki imam Musa'nın vefat ettiği ve günlük 5 akçelik bir maaşla görev yaptığı belirtilmektedir.",
                    "Yeni adayın ehliyeti ve sadakati vurgulanarak atanması için merkeze (dergâh-ı sa'âdete) arzda bulunulmuştur.",
                    "Belge, Hicrî 921 (Milâdî 1515) yılında Söğüt kadısı Seyyid Mehmed tarafından yazılıp mühürlenmiştir.",
                    "Söğüt, Osmanlı Devleti'nin kuruluş yeri olarak bilinir; bu belge, kuruluşun hemen ardından bölgedeki idarî-dinî teşkilatlanmanın küçük ölçekli bir örneğidir."
                ],
                people: ["Musa", "Seyyid Mehmed"],
                places: ["Söğüt", "Sofular köyü"],
                concepts: ["kadı", "imamlık", "arz", "akçe"],
                script_type: "Divânî/Rik'a karışımı el yazısı",
                script_purpose: "Hukukî-idarî arz / tayin belgesi",
                period_estimate: "Yavuz Sultan Selim Dönemi (Erken 16. Yüzyıl)",
                date_hijri: "921 (evâsıt-ı Muharrem)",
                date_gregorian: "Şubat-Mart 1515 (tahminî)",
                notes: "Metin, kullanıcı tarafından satır satır kontrol edilerek sağlanan okuma esas alınarak eklenmiştir. Belge, Osmanlı taşra idaresinde küçük ölçekli dinî görevlerin (imamet) nasıl merkeze arz edilerek dolduruldığunu gösteren tipik bir kadı ilâmı örneğidir."
            }
        },
        'smt': {
            entity_info: {
            "concept:sinematograf": "Sinematograf, 19. yüzyılın sonunda Lumière kardeşler tarafından geliştirilen, hareketli görüntüleri hem çeken hem de gösterebilen erken dönem sinema makinesine verilen addır. Bu belgede sinematograf, bir şehirdeki olay ve toplantıları kaydeden, görüntülerinin padişaha sunulmak üzere fotoğraflara dönüştürüldüğü cihaz olarak anılmaktadır.",
            "concept:özel kalem müdürlüğüne": "Özel Kalem Müdürlüğü (Mâbeyn-i Hümâyûn Başkitâbeti), padişahın saraydaki özel yazışma ve sekretarya işlerini yürüten, resmî yazışmaların padişaha ulaştırılmasından sorumlu birimdir. Bu belgede Özel Kalem Müdürlüğü, sinematograf görüntülerine dair fotoğrafların sunulduğu, yazının hitap ettiği makam olarak anılmaktadır.",
            "concept:arz": "Arz, Osmanlı bürokrasisinde bir alt makamdan üst makama (genellikle padişaha) sunulan resmî bildirim veya rapor niteliğindeki yazıya verilen genel addır. Bu belgenin kendisi, sinematograf görüntülerine dair fotoğrafların padişaha sunulmasını bildiren böyle bir arzdır.",
            "concept:fotoğraflardan": "Fotoğraf, bir görüntünün ışığa duyarlı bir yüzey üzerine kaydedilmesiyle elde edilen sabit resimdir; burada sinematograf görüntülerinden alınan kareleri ifade etmektedir. Bu belgede fotoğraflar, bir şehirdeki olaylara ve toplantılara dair sahnelerden seçilerek padişaha vekâleten sunulan görsel belgelerdir.",
            "concept:fotoğrafların": "Fotoğraf, bir görüntünün ışığa duyarlı bir yüzey üzerine kaydedilmesiyle elde edilen sabit resimdir; burada sinematograf görüntülerinden alınan kareleri ifade etmektedir. Bu belgede fotoğraflar, bir şehirdeki olaylara ve toplantılara dair sahnelerden seçilerek padişaha vekâleten sunulan görsel belgelerdir.",
            "concept:fotoğraflar": "Fotoğraf, bir görüntünün ışığa duyarlı bir yüzey üzerine kaydedilmesiyle elde edilen sabit resimdir; burada sinematograf görüntülerinden alınan kareleri ifade etmektedir. Bu belgede fotoğraflar, bir şehirdeki olaylara ve toplantılara dair sahnelerden seçilerek padişaha vekâleten sunulan görsel belgelerdir.",
            "person:padişah hazretlerinin": "Bu belgede Padişah Hazretleri, sinematograf görüntülerine dair fotoğrafların vekâleten sunulduğu, bu konuda nihai karar ve emir yetkisine sahip olan hükümdar olarak anılmaktadır; belge üzerindeki mühürden dönemin padişahının Sultan Mehmed Reşad olabileceği tahmin edilmektedir.",
            "person:padişah hazretlerine": "Bu belgede Padişah Hazretleri, sinematograf görüntülerine dair fotoğrafların vekâleten sunulduğu, bu konuda nihai karar ve emir yetkisine sahip olan hükümdar olarak anılmaktadır; belge üzerindeki mühürden dönemin padişahının Sultan Mehmed Reşad olabileceği tahmin edilmektedir.",
            "person:padişahın baş yaveri": "Baş Yaver, padişahın maiyetinde görev yapan, onunla üst düzey komuta kademesi arasında irtibatı sağlayan en kıdemli yaver subaydır. Bu belgede Padişahın Baş Yaveri, belgeyi Ferik (tümgeneral benzeri rütbe) sıfatıyla imzalayan, ancak adı okunamayan üst düzey asker olarak anılmaktadır.",
            "date:12 cemâziyelevvel 1328": "Hicrî 12 Cemâziyelevvel 1328, Miladi takvimde yaklaşık Mayıs-Haziran 1910 tarihine, II. Meşrutiyet döneminin ortalarına karşılık gelir. Bu belgede 12 Cemâziyelevvel 1328, arzın (resmî yazının) üzerindeki tarih olarak geçmektedir.",
            "date:mayıs": "Mayıs, Miladi takvimin beşinci ayıdır. Bu belgede Mayıs, arzın Hicrî 12 Cemâziyelevvel 1328 tarihinin karşılığı olarak tahmin edilen 'Mayıs-Haziran 1910 civarı' ifadesinin bir parçasıdır.",
            "date:haziran 1910": "Haziran 1910, Miladi takvimde II. Meşrutiyet döneminin ortalarına, Hicrî 12 Cemâziyelevvel 1328 tarihinin karşılığı olarak tahmin edilen döneme denk gelir. Bu belgede Haziran 1910, arzın yaklaşık yazılış tarihini belirtmek için kullanılmaktadır.",
            "concept:ferik": "Ferik, Osmanlı askerî rütbe sisteminde günümüzün tümgeneral rütbesine karşılık gelen üst düzey bir askerî unvandır. Bu belgede Ferik, belgeyi imzalayan Padişahın Baş Yaveri'nin taşıdığı askerî rütbe olarak geçmektedir."
            },
            word_alternatives: {
            "ایدیلمکده اولان": {"alternatives":[],"alternative_details":[],"origin":"Türkçe (edilgen çatı + sürerlilik eki, \"yapılmakta olan\")","ocr_form":"ایدیلمکده اولان"},
            "edilmekte olan": {"alternatives":[],"alternative_details":[],"origin":"Türkçe (edilgen çatı + sürerlilik eki, \"yapılmakta olan\")","ocr_form":"ایدیلمکده اولان"},
            "برقاچی": {"alternatives":[],"alternative_details":[],"origin":"Türkçe (\"birkaç\" + iyelik eki, \"birkaçı\")","ocr_form":"برقاچی"},
            "birkaçı": {"alternatives":[],"alternative_details":[],"origin":"Türkçe (\"birkaç\" + iyelik eki, \"birkaçı\")","ocr_form":"برقاچی"},
            "اوزره آلتی هفته ظرفنده اتمام ایدیلرک تقدیم اولنمق اوزره": {"alternatives":[],"alternative_details":[],"origin":"Arapça-Türkçe bileşik (resmî yazışma kalıbı, \"altı hafta içinde tamamlanıp sunulmak üzere\")","ocr_form":"اوزره آلتی هفته ظرفنده اتمام ایدیلرک تقدیم اولنمق اوزره"},
            "üzere altı hafta zarfında itmâm edilerek takdîm olunmak üzere": {"alternatives":[],"alternative_details":[],"origin":"Arapça-Türkçe bileşik (resmî yazışma kalıbı, \"altı hafta içinde tamamlanıp sunulmak üzere\")","ocr_form":"اوزره آلتی هفته ظرفنده اتمام ایدیلرک تقدیم اولنمق اوزره"},
            "[imza - okunamadı]": {"alternatives":[],"alternative_details":[],"origin":"Transkripsiyon notu (orijinal belge metni değil; belgeyi okuyanın, imza kısmının okunamadığını belirtmek için eklediği köşeli parantezli bir açıklamadır)","ocr_form":"[imza - okunamadı]"}
            },
            file: "assets/smt.jpg",
            enhancedFile: "assets/smt-enhanced.jpg",
            name: "mabeyn_sinematograf_arzi_1328.jpg",
            size: "0.15 MB",
            ocr: `مابين همايون باشكتابت جليله‌سنه

عطوفتلو افندم حضرتلری

سینماتوغراف ماكینه‌سی واسطه‌سيله صحنه‌ی تماشایه وضع **ایدیلمکده اولان** رسملرڭ بلده‌ی مذکوره‌ده و عظیمه‌ی جمعیه احوال و مخابراتی

مناظر مختلفه‌سی صور و فوطوغرافلرندن **برقاچی** بالنیابه تقدیم اولندوغی اراده‌ی سنیه‌ی جناب خلافت‌پناهی مقتضای عالیسندن

اولدوغی تحریراتِ علیه‌لرینه کرم‌کارلری زیور تکریم اولارق جمیع احوال و مخابراته دائر فوطوغرافلردن برر صورتی

آرانیلدیغی ایسه ده بولندیریلامامش اولدیغندن مهمچه‌سی لفاً تقدیم قلینمش اولنمغله دنیلن انتخاب اولندیغی تقدیرده

همان معامله‌ی سیاره اولنمق **اوزره آلتی هفته ظرفنده اتمام ایدیلرک تقدیم اولنمق اوزره** عرض و مجبور قلینمغله اول بابده

امر و اراده حضرت ولی‌الامرندر. فی ۱۲ جمادی‌الاولی سنه ۱۳۲۸

یاور خاص حضرت شهریاری فریق **[imza - okunamadı]**`,
            tr: `Yüce Padişahın Özel Kalem Müdürlüğüne,
Saygıdeğer Efendim,
Sinematograf makinesiyle halka gösterilen görüntüler arasında, adı geçen şehirdeki olayları ve toplantıları anlatan çeşitli sahnelere ait resim ve fotoğraflardan birkaçının vekâleten sunulduğu bildirilmiştir. Bunun, Halife ve Padişah Hazretlerinin isteği doğrultusunda yapıldığı belirtilmiştir.
Yüce makama saygı göstergesi olarak, olayları ve haberleri anlatan fotoğrafların her birinden birer örnek temin edilmeye çalışılmış; ancak bunların tamamı bulunamamıştır. Bu nedenle, önemli görülen fotoğraflar yazının ekinde sunulmuştur.
Sunulan fotoğraflar arasından seçim yapılması hâlinde, gerekli işlemlerin hemen başlatılarak altı hafta içinde tamamlanması ve sonuçların sunulması hususu bilgilerinize arz olunur.
Bu konuda karar verme ve emir buyurma yetkisi Padişah Hazretlerine aittir.
Tarih: 12 Cemâziyelevvel 1328 (Miladi takvimde Mayıs-Haziran 1910 civarı)
İmzalayan: Padişahın Baş Yaveri, Ferik (korgeneral rütbesine karşılık gelen askerî rütbe)`,
            translit: `Mâbeyn-i Hümâyûn Başkitâbet-i Celîlesine

Âtıfetlü Efendim Hazretleri

Sinematograf makinesi vasıtasıyla sahne-i temâşâya vaz' **edilmekte olan** resimlerin belde-i mezkûrede ve azîme-i cem'iyye ahvâl ve muhâberâtı

menâzır-ı muhtelifesi suver ve fotoğraflarından **birkaçı** bi'n-niyâbe takdîm olunduğu irâde-i seniyye-i cenâb-ı hilâfet-penâhî muktezâ-yı 'âlîsinden

olduğu tahrîrât-ı 'aliyyelerine keremkârîleri zîver-i tekrîm olarak cemî' ahvâl ve muhâberâta dâir fotoğraflardan birer sûreti

arandığı ise de bulundurulamamış olduğundan mühimçesi leffen takdîm kılınmış olunmakla denilen intihâb olunduğu takdîrde

hemân mu'âmele-i seyyâre olunmak **üzere altı hafta zarfında itmâm edilerek takdîm olunmak üzere** arz u mecbûr kılınmakla ol bâbda

emr ü irâde hazret-i veliyyü'l-emrindir. Fî 12 Cemâziye'l-ûlâ sene 1328

Yâver-i Hâs Hazret-i Şehriyârî Ferîk **[imza - okunamadı]**`,
            analysis: {
                document_type: "Mâbeyn-i Hümâyûn Yazışması (Arz Tezkiresi)",
                confidence: 68,
                style: "Resmî saray yazışma üslubu, Rık'a hattı",
                summary: "12 Cemâziyelevvel 1328 (y. 1910) tarihli bu belge, bir şehirde sinematograf makinesiyle gösterime konan görüntülere ve toplumsal olaylara dair fotoğrafların vekâleten padişaha sunulduğunu, eksik kalanların altı hafta içinde tamamlanıp gönderilmesinin istendiğini bildiren, Mâbeyn-i Hümâyûn Başkitâbeti'ne yazılmış resmî bir arzdır. Padişahın Has Yaveri bir Ferik tarafından imzalanmıştır.",
                key_points: ["Belge, Mâbeyn-i Hümâyûn Başkitâbeti'ne (Saray Özel Kalemi) hitaben yazılmış resmî bir arz/üst yazıdır.", "Sinematograf (sinema) makinesiyle gösterime konan görüntülerin, bir şehirdeki olaylar ve toplantılarla ilgili çeşitli fotoğraflarının vekâleten (temsilen) padişaha sunulduğu bildirilmektedir.", "Bu sunumun, halifelik makamındaki padişahın yüksek iradesi gereği yapıldığı vurgulanmaktadır.", "Tüm olaylara dair fotoğraflardan birer örneğin arandığı, bulunamayanlar yerine önemli görülenlerin ilişikte gönderildiği belirtilmektedir.", "Seçim yapılması hâlinde gerekli işlemin altı hafta içinde tamamlanarak sunulması isteniyor; belge Padişahın Has Yaveri bir Ferik (Tümgeneral) tarafından imzalanmıştır.", "Belge, 12 Cemâziyelevvel 1328 (1910 civarı) tarihli olup erken dönem sinema/fotoğraf malzemesinin saray tarafından nasıl denetlendiğine/takip edildiğine dair bir örnektir."],
                people: ["Padişah Hazretleri", "Padişahın Baş Yaveri"],
                places: [],
                concepts: ["sinematograf", "Özel Kalem Müdürlüğü", "arz", "fotoğraf", "Ferik"],
                script_type: "Rık'a (saray yazışma hattı)",
                script_purpose: "Resmî saray/mâbeyn yazışması — arz tezkiresi",
                period_estimate: "II. Meşrutiyet Dönemi, muhtemelen Sultan Mehmed Reşad saltanatı (Erken 20. Yüzyıl)",
                date_hijri: "12 Cemâziyelevvel 1328",
                date_gregorian: "Mayıs/Haziran 1910 (tahminî)",
                notes: "Bu belgenin bir kısmı (işaretli **kalın** kelimeler) kullanıcının paylaştığı okumada Latin harfleriyle bırakılmış, eksik kalan Arap harfli bölümler ise yapay zekâ tarafından bağlama ve standart Osmanlıca kalıp ifadelere dayanılarak tamamlanmıştır — bu kısımlar %100 piksel-piksel doğrulanmış değildir. Sağ üstteki oval mühürde 'Reşad' ibaresi seçilebildiğinden belge, Sultan Mehmed Reşad dönemine (1909-1918) ait olmalı; bu da '1328' tarihini (1318 değil) destekler. İmza ve mühür metinleri tam okunamamıştır."
            }
        }
    };

    // --- Smooth Scroll (native browser smooth-scroll; no wheel-hijacking library) ---
    function smoothScrollTo(target, options = {}) {
        const el = typeof target === 'string' ? document.querySelector(target) : target;
        if (!el) return;
        el.scrollIntoView({ behavior: 'smooth', block: options.block || 'start' });
    }

    // --- Scroll Reveal (fade + slide up once, the first time an element enters the viewport) ---
    const revealObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('is-visible');
                revealObserver.unobserve(entry.target);
            }
        });
    }, { threshold: 0.15 });

    document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));

    // --- Theme Toggle (defaults to dark unless the user explicitly chose light) ---
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

    // --- File Handling & Drag Drop ---
    heroStartBtn.addEventListener('click', () => {
        smoothScrollTo(dropZone);
    });

    // Shows either the original upload or the enhanced version inside the
    // SAME preview box (previewImage) based on the toggle — no separate column.
    function updatePreviewImage() {
        if (enhancedToggle.checked && state.enhancedImageUrl) {
            previewImage.src = state.enhancedImageUrl;
        } else if (state.imageDataUrl) {
            previewImage.src = state.imageDataUrl;
        }
    }

    enhancedToggle.addEventListener('change', updatePreviewImage);


    // --- Output columns: Osmanlıca (Arapça Harfler) ve Türkçe Harfler
    // (Okunuş) daima yan yana görünür; Günümüz Türkçesi sütunu içinde küçük
    // bir Türkçe/İngilizce geçişi var; "Bilgi" (belge analizi) ise 4 sütunun
    // altında aç/kapa bir bölüm (bkz. renderResultsPanel / clearInfoTab).

    // ocr/translit sütunları artık daima görünür; setOutputTab() sadece
    // Günümüz Türkçesi sütunu içindeki Türkçe/İngilizce geçişini ('trans'/
    // 'en') yönetiyor. 'info' değeri artık ayrı bir sekme değil — Bilgi
    // bölümünü açmak için setInfoExpanded(true) kullanılıyor.
    function setOutputTab(tab) {
        closeEntityPopover();
        closeWordAlternativesPopover();
        closeEntityFilterDropdown();
        resetEntityFilter();

        if (tab === 'info') {
            setInfoExpanded(true);
            return;
        }
        if (tab !== 'trans' && tab !== 'en') return;

        document.querySelectorAll('.trans-lang-btn').forEach(b => {
            b.classList.toggle('active', b.getAttribute('data-output-tab') === tab);
        });
        document.querySelectorAll('.output-tab-tools[data-tools-for="trans"], .output-tab-tools[data-tools-for="en"]').forEach(t => {
            t.classList.toggle('tab-active', t.getAttribute('data-tools-for') === tab);
        });
        transOutputBox.classList.toggle('hidden', tab !== 'trans');
        enOutputBox.classList.toggle('hidden', tab !== 'en');
    }

    // "Bilgi" (belge analizi), 4 sütunun altında tek tıkla açılıp kapanan
    // bir bölüm — expanded=true iken infoOutputBox görünür, header'ın
    // caret'i döner; infoTabBtn kendisi (bkz. clearInfoTab/renderResultsPanel)
    // gösterecek bir şey olmadığında zaten tamamen gizleniyor.
    function setInfoExpanded(expanded) {
        infoOutputBox.classList.toggle('hidden', !expanded);
        infoTabBtn.classList.toggle('expanded', expanded);
        infoTabBtn.setAttribute('aria-expanded', String(expanded));
    }

    infoTabBtn.addEventListener('click', () => {
        setInfoExpanded(infoOutputBox.classList.contains('hidden'));
    });

    transLangToggle.addEventListener('click', (e) => {
        const btn = e.target.closest('.trans-lang-btn');
        if (!btn) return;
        setOutputTab(btn.getAttribute('data-output-tab'));
    });

    // entityFilterTrigger/entityFilterMenu ("Kategoriye Göre Filtrele") kendi
    // aç/kapa ve dış-tıklama mantığını kullanır — menü içeriği sabit olmayıp
    // her açılışta renderEntityFilterMenu() ile yeniden kurulur (bkz.
    // aşağıdaki "Kategoriye Göre Filtrele" bölümü), çünkü kategori listesi
    // belgeye göre değişiyor. setOutputTab() ÇAĞIRMAZ — panel içindeki bir
    // kategoriye tıklamak sekme değiştirmez, sadece transTextDisplay'e bir
    // filtre attribute'u uygular.
    // Menü artık <body>'nin altında bir "portal" (bkz. index.html) — hiçbir
    // sütunun overflow:hidden/sabit yükseklikli başlığının içinde değil,
    // position:fixed ile açıldığı anda tetikleyici butonun ekrandaki gerçek
    // konumuna göre yerleştiriliyor. Önceki tasarımda menü .col-header'ın
    // içindeydi ve o kutunun overflow:hidden'ı menüyü bazı tarayıcı/ekran
    // kombinasyonlarında (Windows'ta bildirilen "hiç görünmüyor" sorunu)
    // tamamen görünmez kılabiliyordu.
    function positionEntityFilterMenu() {
        const rect = entityFilterTrigger.getBoundingClientRect();
        const menuWidth = entityFilterMenu.offsetWidth || 200;
        let left = rect.right - menuWidth;
        left = Math.max(8, Math.min(left, window.innerWidth - menuWidth - 8));
        entityFilterMenu.style.top = `${rect.bottom + 6}px`;
        entityFilterMenu.style.left = `${left}px`;
    }

    entityFilterTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        closeEntityPopover();
        closeWordAlternativesPopover();
        const isOpen = !entityFilterMenu.classList.contains('hidden');
        if (isOpen) {
            closeEntityFilterDropdown();
            return;
        }
        renderEntityFilterMenu();
        entityFilterMenu.classList.remove('hidden');
        positionEntityFilterMenu();
        entityFilterTrigger.setAttribute('aria-expanded', 'true');
    });

    window.addEventListener('resize', () => {
        if (!entityFilterMenu.classList.contains('hidden')) positionEntityFilterMenu();
    });
    window.addEventListener('scroll', () => {
        if (!entityFilterMenu.classList.contains('hidden')) positionEntityFilterMenu();
    }, true);

    document.addEventListener('click', (e) => {
        if (!entityFilterTrigger.contains(e.target) && !entityFilterMenu.contains(e.target)) {
            closeEntityFilterDropdown();
        }
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

        await runImageEnhancement(state.selectedFile, documentProfile.value);
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
    async function enhanceUploadedImage(file, profile = 'auto') {
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

    // Orijinal dosyanın (iyileştirmeden ÖNCEki hâlinin) SHA-256 hash'i —
    // iyileştirme adımı bit-birebir deterministik olmayabildiği için
    // "aynı belge mi" kontrolünü buna değil, bu değişmez orijinal hash'e
    // dayandırıyoruz.
    async function computeFileHash(file) {
        const buffer = await file.arrayBuffer();
        const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
        return Array.from(new Uint8Array(hashBuffer))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
    }

    // Giriş yapılmış kullanıcı için, bu hash'e sahip daha önce kaydedilmiş
    // bir belge var mı diye backend'e sorar. Giriş yapılmamışsa (Belgelerim
    // zaten kullanılamayacağı için) hiç sormaya gerek yok.
    async function checkDuplicateDocument(fileHash) {
        if (!state.authToken) return null;
        try {
            const res = await fetchWithTimeout(`${API_BASE_URL}/api/documents/check-duplicate`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${state.authToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ file_hash: fileHash })
            }, 10000);
            if (!res.ok) return null;
            const data = await res.json();
            return data.duplicate ? data : null;
        } catch (err) {
            return null;
        }
    }

    async function handleFileSelect(file) {
        if (!file.type.match('image.*')) {
            alert('Lütfen geçerli bir görsel dosyası (JPG, PNG, WEBP) seçin.');
            return;
        }

        hardStopTts();

        assistantHistory.length = 0;
        assistantSelectedContext = null;
        assistantMessages.innerHTML = '';

        state.selectedFile = file;
        state.activeSampleKey = null;
        state.ocrText = '';
        state.transText = '';
        state.transTextEn = '';
        state.translitText = '';
        state.dbDocumentId = null;
        state.originalFileHash = null;
        state.pendingOverwriteDocumentId = null;

        clearProcessingFailure();

        ocrTextDisplay.textContent = '';
        translitTextDisplay.textContent = '';
        transTextDisplay.textContent = '';
        enTextDisplay.textContent = '';

        ocrTextDisplay.classList.add('hidden');
        translitTextDisplay.classList.add('hidden');
        transTextDisplay.classList.add('hidden');
        enTextDisplay.classList.add('hidden');

        ocrEmptyState.classList.remove('hidden');
        translitEmptyState.classList.remove('hidden');
        transEmptyState.classList.remove('hidden');
        enEmptyState.classList.remove('hidden');

        ocrTools.classList.remove('tools-ready');
        translitTools.classList.remove('tools-ready');
        transTools.classList.remove('tools-ready');
        enTools.classList.remove('tools-ready');

        clearInfoTab();
        setOutputTab('trans');
        fileName.textContent = file.name;
        fileSize.textContent = (file.size / (1024 * 1024)).toFixed(2) + ' MB';

        const reader = new FileReader();
        reader.onload = (e) => {
            state.imageDataUrl = e.target.result;
            openFileChoiceModal();
        };
        reader.readAsDataURL(file);
    }

    // Dosya seçildikten (veya kırpıldıktan) sonra mevcut enhance+çeviri
    // akışını başlatan ortak fonksiyon — "Direkt Yükle" ve kırpma sonrası
    // "Tamam" YOLLARININ İKİSİ DE buraya düşer, böylece enhance/OCR/çeviri
    // tarafında hiçbir şey değişmiyor; değişen sadece hangi dosyanın/
    // görüntünün gönderildiği (orijinal ya da kırpılmış).
    async function startEnhanceAndTranslate() {
        previewImage.src = state.imageDataUrl;
        // Kırpma sonrası dosya boyutu değişmiş olabilir (isim aynı kalıyor);
        // burada güncellemek "Direkt Yükle" için de zararsız (aynı değerler).
        fileName.textContent = state.selectedFile.name;
        fileSize.textContent = (state.selectedFile.size / (1024 * 1024)).toFixed(2) + ' MB';

        uploadIdleState.classList.add('hidden');
        uploadActiveState.classList.remove('hidden');

        state.originalFileHash = await computeFileHash(state.selectedFile);
        state.pendingOverwriteDocumentId = null;
        const duplicate = await checkDuplicateDocument(state.originalFileHash);

        if (duplicate) {
            const existingDate = duplicate.existing_uploaded_at
                ? new Date(duplicate.existing_uploaded_at).toLocaleString('tr-TR')
                : '';
            const wantsExisting = confirm(
                `Bu belgeyi daha önce çevirmiş ve kaydetmişsiniz: "${duplicate.existing_title}"${existingDate ? ` (${existingDate})` : ''}.\n\n` +
                `Mevcut çeviriyi görüntülemek için Tamam'a, yeniden çevirip güncellemek için İptal'e basın.`
            );

            if (wantsExisting) {
                try {
                    const res = await fetchWithTimeout(`${API_BASE_URL}/api/documents/${duplicate.existing_document_id}/analyze`, {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${state.authToken}` }
                    }, 30000);
                    const data = await res.json().catch(() => ({}));
                    if (res.ok) {
                        state.dbDocumentId = duplicate.existing_document_id;
                        await processTranslation({
                            ocr: data.ocr,
                            tr: data.trans_modern || data.trans,
                            trans_en: data.trans_en,
                            translit: data.translit,
                            analysis: data
                        });
                        return;
                    }
                } catch (err) {
                    console.warn('Mevcut belge yüklenemedi, yeniden çevriliyor:', err);
                }
            } else {
                // Yeniden çevrilip aynı belgenin üzerine yazılacak —
                // saveTranslationToBackend'e bunu ayrıca sormasına gerek
                // kalmadan doğrudan iletiyoruz.
                state.pendingOverwriteDocumentId = duplicate.existing_document_id;
            }
        }

        const enhanced = await runImageEnhancement(state.selectedFile, documentProfile.value);

        // İlk (otomatik) iyileştirme başarılı olduysa, kullanıcı hiçbir
        // butona basmadan çeviriyi kendiliğinden başlat. Bu SADECE bu
        // ilk enhance için geçerli — documentProfile'ın 'change'
        // dinleyicisi kendi runImageEnhancement çağrısını doğrudan
        // yapıyor (bu fonksiyonun içinden geçmiyor), bu yüzden profil
        // sonradan değiştirildiğinde otomatik çeviri tetiklenmez.
        // Başarısız olursa (enhanced === false) runImageEnhancement
        // zaten showProcessingFailure'ı kendi içinde çağırmış olur —
        // burada ekstra bir şey yapmaya gerek yok, sadece devam etmeyiz.
        if (enhanced) {
            statusMessage.textContent = 'Görüntü iyileştirme tamamlandı, çeviri hazırlanıyor...';
            await processTranslation();
        }
    }

    // --- Dosya Seçimi: Düzenle / Direkt Yükle modalı ---
    function openFileChoiceModal() {
        fileChoicePreviewImg.src = state.imageDataUrl;
        fileChoiceFileName.textContent = state.selectedFile.name;
        fileChoiceFileSize.textContent = (state.selectedFile.size / (1024 * 1024)).toFixed(2) + ' MB';
        fileChoiceModal.classList.remove('hidden');
    }

    function closeFileChoiceModal() {
        fileChoiceModal.classList.add('hidden');
    }

    fileChoiceDirectBtn.addEventListener('click', () => {
        closeFileChoiceModal();
        startEnhanceAndTranslate();
    });

    fileChoiceEditBtn.addEventListener('click', () => {
        closeFileChoiceModal();
        openCropModal();
    });

    // --- Görsel Kırpma (Cropper.js) modalı ---
    function openCropModal() {
        cropImage.src = state.imageDataUrl;
        cropModal.classList.remove('hidden');

        if (cropperInstance) {
            cropperInstance.destroy();
            cropperInstance = null;
        }

        cropperInstance = new Cropper(cropImage, {
            viewMode: 1,
            dragMode: 'move',
            aspectRatio: NaN,
            autoCropArea: 1,
            background: false,
            responsive: true
        });
    }

    function closeCropModal() {
        if (cropperInstance) {
            cropperInstance.destroy();
            cropperInstance = null;
        }
        cropModal.classList.add('hidden');
    }

    cropConfirmBtn.addEventListener('click', () => {
        if (!cropperInstance) return;

        const canvas = cropperInstance.getCroppedCanvas();
        if (!canvas) return;

        const outputType = state.selectedFile.type && state.selectedFile.type.startsWith('image/')
            ? state.selectedFile.type
            : 'image/png';

        canvas.toBlob((blob) => {
            if (!blob) return;

            const croppedFile = new File([blob], state.selectedFile.name, { type: blob.type || outputType });
            const croppedDataUrl = canvas.toDataURL(blob.type || outputType);

            closeCropModal();

            state.selectedFile = croppedFile;
            state.imageDataUrl = croppedDataUrl;
            startEnhanceAndTranslate();
        }, outputType);
    });

    function cancelCropAndReturnToChoice() {
        closeCropModal();
        openFileChoiceModal();
    }

    cropCancelBtn.addEventListener('click', cancelCropAndReturnToChoice);
    cropCloseBtn.addEventListener('click', cancelCropAndReturnToChoice);
    cropModal.addEventListener('click', (e) => {
        if (e.target === cropModal) cancelCropAndReturnToChoice();
    });

    // --- Örnek belgeler: ilk 14'ten sonrasını "Daha Fazla Göster" arkasına
    // gizle — örnek sayısı arttıkça ana sayfanın altı aşırı uzamasın diye.
    // Kart sayısı 14'ü geçmiyorsa buton zaten gösterilmez.
    (function setupSamplesPagination() {
        const INITIAL_VISIBLE = 14;
        const allCards = Array.from(document.querySelectorAll('.sample-card'));
        const moreBtn = document.getElementById('samplesMoreBtn');
        if (!moreBtn || allCards.length <= INITIAL_VISIBLE) return;

        allCards.slice(INITIAL_VISIBLE).forEach(card => card.classList.add('hidden'));
        moreBtn.classList.remove('hidden');
        moreBtn.addEventListener('click', () => {
            allCards.slice(INITIAL_VISIBLE).forEach(card => card.classList.remove('hidden'));
            moreBtn.classList.add('hidden');
        });
    })();

    // --- Sample Image Click Handlers ---
    document.querySelectorAll('.sample-card').forEach(card => {
        card.addEventListener('click', () => {
            const key = card.getAttribute('data-sample');
            const sample = sampleDatabase[key];
            if (sample) {
                state.activeSampleKey = key;
                assistantHistory.length = 0;
                assistantSelectedContext = null;
                assistantMessages.innerHTML = '';
                state.selectedFile = { name: sample.name };
                state.imageDataUrl = sample.file;
                // Çoğu örnekte tek görsel var (file iyileştirilmiş hâliyle
                // aynı); bazı örnekler (örn. "svs") gerçek bir önce/sonra
                // farkı göstersin diye ayrı bir enhancedFile taşıyabilir —
                // "İyileştirilmiş Görüntüyü Göster" açılınca o görünür.
                state.enhancedImageUrl = sample.enhancedFile || sample.file;
                fileName.textContent = sample.name;
                fileSize.textContent = sample.size;
                previewImage.src = sample.file;
                uploadIdleState.classList.add('hidden');
                uploadActiveState.classList.remove('hidden');

                smoothScrollTo(dropZone);

                // Auto process sample
                processTranslation(sample);
            }
        });
    });

    // map.html'deki şehir kartlarındaki "Tam sayfada aç" linki
    // (index.html?sample=X) buraya geldiğinde, o örnek belgeyi yukarıdaki
    // .sample-card tıklama mantığıyla birebir aynı şekilde otomatik yükler.
    const deepLinkParams = new URLSearchParams(window.location.search);
    const deepLinkSampleKey = deepLinkParams.get('sample');
    if (deepLinkSampleKey) {
        const targetCard = document.querySelector(`.sample-card[data-sample="${CSS.escape(deepLinkSampleKey)}"]`);
        if (targetCard) targetCard.click();

        // Harita, belgeyi sadece burada önizlemekle kalmayıp doğrudan
        // "Belgelerim"de gösterip oraya kaydetmek istediğinde
        // &saveToDocuments=1 ekliyor (bkz. map.js renderDocDetailHtml).
        // Giriş yapılmamışsa kaydedecek bir hesap olmadığından sadece
        // burada (demo gibi) gösterilip kullanıcı bilgilendiriliyor —
        // diğer tüm kayıtsız-çeviri akışlarıyla aynı mesaj.
        if (deepLinkParams.get('saveToDocuments') === '1') {
            const sample = sampleDatabase[deepLinkSampleKey];
            if (sample) {
                if (!state.authToken) {
                    alert('Bu belgeyi Belgelerim\'e kaydetmek için giriş yapmalısınız.');
                } else {
                    saveMapSampleToDocuments(deepLinkSampleKey, sample);
                }
            }
        }
    }

    // Harita üzerinden "Tam sayfada aç"a tıklanan bir örnek belgeyi,
    // sample kartlarının aksine (bkz. saveTranslationToBackend çağrı
    // noktası — presetData'da hiç çağrılmaz) bilerek doğrudan
    // "Belgelerim"e kaydeder ve kayıt biter bitmez oradaki belge
    // görünümüne yönlendirir — kullanıcı index.html'deki demo önizlemesini
    // hiç görmeden doğrudan kendi belgeleri arasında bu belgeyi bulur.
    async function saveMapSampleToDocuments(key, sample) {
        try {
            const imgRes = await fetch(sample.enhancedFile || sample.file);
            if (!imgRes.ok) throw new Error('Örnek görsel yüklenemedi.');
            const imgBlob = await imgRes.blob();

            const resultData = {
                ocr: sample.ocr || '',
                trans: sample.tr || '',
                trans_modern: sample.tr || '',
                translit: sample.translit || '',
                trans_en: sample.trans_en || '',
                title: sample.name || null,
                ...(sample.analysis || {})
            };

            const formData = new FormData();
            formData.append('image', imgBlob, sample.name || `${key}.jpg`);
            formData.append('result', JSON.stringify(resultData));

            const res = await fetchWithTimeout(`${API_BASE_URL}/api/translations/save`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${state.authToken}` },
                body: formData
            }, 30000);
            const data = await res.json().catch(() => ({}));

            if (res.status === 409 && data.duplicate && data.existing_document_id) {
                // Bu örnek bu kullanıcı için zaten kayıtlıysa yeni bir
                // kopya oluşturmadan doğrudan mevcut kayda gidiyoruz.
                window.location.href = `documents.html?open=${encodeURIComponent(data.existing_document_id)}`;
                return;
            }

            if (!res.ok || !data.document_id) {
                alert('Belge Belgelerim\'e kaydedilemedi: ' + (data.error || 'bilinmeyen bir hata oluştu.'));
                return;
            }

            window.location.href = `documents.html?open=${encodeURIComponent(data.document_id)}`;
        } catch (err) {
            console.error('[MAP SAMPLE SAVE]', err);
            alert('Belge Belgelerim\'e kaydedilirken bir hata oluştu.');
        }
    }

    function resetState() {
        hardStopTts();
        closeEntityPopover();
        closeWordAlternativesPopover();
        closeEntityFilterDropdown();
        resetEntityFilter();
        state.selectedFile = null;
        state.imageDataUrl = null;
        state.dbDocumentId = null;

        state.ocrText = '';
        state.transText = '';
        state.transTextEn = '';
        state.translitText = '';
        state.lastAnalysis = null;

        assistantHistory.length = 0;
        assistantSelectedContext = null;
        assistantMessages.innerHTML = '';
        statusHint.classList.add('hidden');
        statusBadge.classList.add('hidden');
        clearProcessingFailure();
        fileInput.value = '';
        uploadIdleState.classList.remove('hidden');
        uploadActiveState.classList.add('hidden');

        ocrEmptyState.classList.remove('hidden');
        ocrTextDisplay.classList.add('hidden');
        ocrTools.classList.remove('tools-ready');
        ocrTextDisplay.textContent = '';

        translitEmptyState.classList.remove('hidden');
        translitTextDisplay.classList.add('hidden');
        translitTools.classList.remove('tools-ready');
        translitTextDisplay.textContent = '';

        transEmptyState.classList.remove('hidden');
        transTextDisplay.classList.add('hidden');
        transTools.classList.remove('tools-ready');
        transTextDisplay.textContent = '';

        enEmptyState.classList.remove('hidden');
        enTextDisplay.classList.add('hidden');
        enTools.classList.remove('tools-ready');
        enTextDisplay.textContent = '';

        if (state.enhancedImageUrl) {
            URL.revokeObjectURL(state.enhancedImageUrl);
        }

        state.enhancedImageBlob = null;
        state.enhancedImageUrl = null;

        enhanceStatusIcon.classList.remove('spinning', 'done');

        clearInfoTab();
        setOutputTab('trans');
    }

    // Clears the "Bilgi" tab back to its empty state and hides the tab
    // button itself — there's nothing useful to show until a translation
    // with analysis data has completed.
    function clearInfoTab() {
        infoEmptyState.classList.remove('hidden');
        infoContentWrapper.classList.add('hidden');
        infoTabBtn.classList.add('hidden');
        // "Filtrele" menüsü de aynı "henüz gösterecek bir şey yok" anlarında
        // (yeni belge seçildi/sıfırlandı/işlem başarısız oldu) sıfırlanmalı
        // — clearInfoTab() zaten tam bu 4 noktada çağrıldığı için buraya
        // eklemek, ayrı bir fonksiyonu aynı 4 yerde çağırmayı unutma
        // riskinden kaçınıyor. Menü içeriği processTranslation'da,
        // transTextDisplay'de gerçekten entity-tag var mı diye bakılarak
        // yeniden kuruluyor (bkz. aşağısı).
        resetEntityFilter();
        entityFilterMenu.innerHTML = '';
        closeEntityFilterDropdown();
        // AI Belge Araçları da Bilgi ile aynı anlarda gizlenir — araçların
        // dayandığı state.transText artık geçersiz.
        aiToolsTabBtn.classList.add('hidden');
        setAiToolsExpanded(false);
    }

    // Renders a list of tag pills (people/places/concepts). Each entry can be
    // a plain string or an { name, role } object. Mirrors documents.js'in
    // _renderDocDetailTagList'i — belge analizi kartı her iki sayfada da
    // aynı görünüme sahip olsun diye.
    function renderTagListHtml(entities) {
        const labels = (entities || [])
            .map(e => (typeof e === 'string' ? e : (e && e.name) || ''))
            .filter(l => l.trim());
        if (labels.length === 0) {
            return '<p class="doc-detail-empty">Tespit edilemedi.</p>';
        }
        return `<div class="doc-detail-tag-list">${labels.map(l => `<span class="doc-detail-tag">${escapeHtml(l)}</span>`).join('')}</div>`;
    }

    function miniBoxHtml(label, value, full) {
        if (!value) return '';
        return `
            <div class="doc-analysis-mini-box${full ? ' full' : ''}">
                <div class="doc-analysis-mini-label">${escapeHtml(label)}</div>
                <div class="doc-analysis-mini-value">${escapeHtml(String(value))}</div>
            </div>
        `;
    }

    // data is the parsed analysis object (see backend /api/translate response
    // and sampleDatabase entries below). Only ocr/trans are guaranteed; every
    // other field is optional and rendered defensively. Bilgi paneli,
    // documents.js'teki belge detay kartıyla aynı 3 sütunlu düzeni kullanır
    // (bkz. _renderDocDetailAnalysisCard) — üstteki "Bilgi (Belge Analizi)"
    // başlığı zaten infoTabBtn'de olduğundan kartın kendi başlığı tekrar
    // edilmiyor, sadece rozetler sağda gösteriliyor.
    function renderResultsPanel(data) {
        const hasConfidence = typeof data.confidence === 'number';

        infoAnalysisCard.innerHTML = `
            <div class="doc-analysis-header">
                ${data.document_type ? `<span class="doc-detail-tag">${escapeHtml(data.document_type)}</span>` : ''}
                ${hasConfidence ? `<span class="doc-detail-confidence-badge">Güven Skoru %${Math.round(data.confidence)}</span>` : ''}
            </div>
            <div class="doc-analysis-grid">
                <div class="doc-analysis-col">
                    <h4>Kısa Özet</h4>
                    <p>${escapeHtml(data.summary || 'Bu belge için özet oluşturulamadı.')}</p>
                    <h4>Belge Bilgileri</h4>
                    <div class="doc-analysis-mini-grid">
                        ${miniBoxHtml('Belge Türü', data.document_type)}
                        ${miniBoxHtml('Tahmini Dönem', data.period_estimate)}
                    </div>
                    ${data.style ? `
                        <div class="doc-analysis-mini-grid" style="margin-top:0.6rem;">
                            ${miniBoxHtml('Dil / Üslup', data.style, true)}
                        </div>
                    ` : ''}
                </div>
                <div class="doc-analysis-col">
                    <h4>Önemli Bilgiler</h4>
                    ${(data.key_points && data.key_points.length)
                        ? `<ul>${data.key_points.map(point => `<li>${escapeHtml(point)}</li>`).join('')}</ul>`
                        : `<p class="doc-detail-empty">Bu belge için önemli bilgi çıkarılamadı.</p>`}
                    <h4>👤 Kişiler</h4>
                    ${renderTagListHtml(data.people)}
                </div>
                <div class="doc-analysis-col">
                    <h4>🖋️ Yazı &amp; Dil</h4>
                    <div class="doc-analysis-mini-grid" style="grid-template-columns: 1fr;">
                        ${miniBoxHtml('Yazı Tipi (Hat)', data.script_type)}
                        ${miniBoxHtml('Yazının Amacı', data.script_purpose)}
                    </div>
                    <h4>🗓️ Tarih &amp; Bağlam</h4>
                    <div class="doc-analysis-mini-grid" style="grid-template-columns: 1fr;">
                        ${miniBoxHtml('Tahmini Dönem', data.period_estimate)}
                        ${miniBoxHtml('Tarih (Hicrî)', data.date_hijri)}
                        ${miniBoxHtml('Tarih (Miladî)', data.date_gregorian)}
                    </div>
                    <h4>💡 Kavramlar</h4>
                    ${renderTagListHtml(data.concepts)}
                </div>
            </div>
            <div class="doc-analysis-full-row">
                <div class="doc-analysis-col">
                    <h4>📍 Yerler</h4>
                    ${renderTagListHtml(data.places)}
                </div>
            </div>
            ${data.notes ? `
                <div class="doc-analysis-notes">
                    <span>📌</span>
                    <span><strong>Notlar &amp; Sistem Notları:</strong> ${escapeHtml(data.notes)}</span>
                </div>
            ` : ''}
        `;

        infoTabBtn.classList.remove('hidden');
        infoEmptyState.classList.add('hidden');
        infoContentWrapper.classList.remove('hidden');
    }

// --- Translation Engine Execution ---
    // Manuel bir "Çeviriyi Başlat" butonu artık yok — süreç, görsel
    // seçilir seçilmez handleFileSelect() içinde otomatik başlıyor (bkz.
    // reader.onload). processTranslation() buradan sample kartları ve
    // handleFileSelect'in otomatik akışı tarafından çağrılıyor.

    // Backend hata mesajları (bkz. backend.py) zaten anlaşılır Türkçe metinler
    // döndürüyor — zaman aşımı, dosya/görsel çok büyük, API kotası/rate limit,
    // modelin token sınırına takılması (uzun/karmaşık metin) gibi durumların her
    // biri için ayrı bir mesaj var. Burada sadece tarayıcı kaynaklı, İngilizce ve
    // anlaşılmaz ağ hatalarını ("Failed to fetch" vb.) kullanıcı dostu Türkçe bir
    // mesaja çeviriyoruz; backend'den gelen mesajı olduğu gibi kullanıyoruz.
    function classifyTranslationError(err) {
        const message = (err && err.message) ? err.message : String(err || '');

        if (/failed to fetch|networkerror|load failed/i.test(message)) {
            return 'Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.';
        }

        return message || 'Çeviri sırasında beklenmeyen bir hata oluştu.';
    }

    // Görüntü iyileştirme ya da OCR/çeviri isteği gerçekten başarısız olduğunda,
    // sahte/örnek bir sonuç göstermek ya da hatayı yalnızca durum rozetinde
    // bırakmak yerine, "Çeviri sonucu burada görüntülenecek." gibi boş-durum
    // metinlerinin yerine nedenini yazar — kullanıcı hatayı sağdaki sonuç
    // panelinde, tam çevirinin görüneceği yerde görür. Tekrar deneme yolu
    // "Yeniden Seç" (reselectBtn) ile sağlanıyor — yeni bir dosya seçmek
    // handleFileSelect()'i baştan çalıştırır.
    function showProcessingFailure(reasonMessage) {
        statusBadge.classList.add('status-error');
        statusMessage.textContent = 'İşlem başarısız oldu.';
        statusHint.classList.add('hidden');

        clearInfoTab();

        const errorText = 'Hata: ' + reasonMessage;

        ocrEmptyStateText.textContent = errorText;
        ocrEmptyState.classList.remove('hidden');
        ocrEmptyState.classList.add('state-error');
        ocrTextDisplay.classList.add('hidden');
        ocrTools.classList.remove('tools-ready');

        transEmptyStateText.textContent = errorText;
        transEmptyState.classList.remove('hidden');
        transEmptyState.classList.add('state-error');
        transTextDisplay.classList.add('hidden');
        transTools.classList.remove('tools-ready');

        enEmptyState.classList.remove('hidden');
        enTextDisplay.classList.add('hidden');

        scanLine.classList.remove('scanning');
        enhanceStatusIcon.classList.remove('spinning', 'done');
        state.isProcessing = false;
    }

    // Bir önceki denemeden kalmış olabilecek hata metnini ve stilini, boş-durum
    // alanlarını orijinal placeholder metnine döndürerek temizler.
    function clearProcessingFailure() {
        statusBadge.classList.remove('status-error');
        ocrEmptyStateText.textContent = ocrEmptyStateDefaultText;
        ocrEmptyState.classList.remove('state-error');
        transEmptyStateText.textContent = transEmptyStateDefaultText;
        transEmptyState.classList.remove('state-error');
    }

    // Görüntüyü backend'in /api/enhance uç noktasında iyileştirir ve state'i
    // günceller. handleFileSelect, belge profili değiştiğinde ve
    // processTranslation (iyileştirme daha önce başarısız kaldıysa, "Çeviriyi
    // Başlat" butonuna tekrar basıldığında yeniden denemek için) tarafından
    // ortak olarak kullanılır — böylece hata her yerde aynı şekilde (sağdaki
    // panelde, Türkçe olarak) gösterilir ve buton asla kalıcı olarak kilitli
    // kalmaz.
    async function runImageEnhancement(file, profile) {
        statusBadge.classList.remove('hidden');
        clearProcessingFailure();
        statusMessage.textContent = 'Görüntü iyileştiriliyor...';
        enhanceStatusIcon.classList.remove('done');
        enhanceStatusIcon.classList.add('spinning');

        try {
            const enhancedResult = await enhanceUploadedImage(file, profile);

            if (state.enhancedImageUrl) {
                URL.revokeObjectURL(state.enhancedImageUrl);
            }

            state.enhancedImageBlob = enhancedResult.blob;
            state.enhancedImageUrl = enhancedResult.url;

            statusMessage.textContent = 'Görüntü iyileştirme tamamlandı.';
            updatePreviewImage();
            enhanceStatusIcon.classList.remove('spinning');
            enhanceStatusIcon.classList.add('done');
            return true;
        } catch (error) {
            console.error('Enhancement error:', error);
            showProcessingFailure(classifyTranslationError(error));
            return false;
        }
    }

    async function processTranslation(presetData = null) {
        hardStopTts();
        closeEntityPopover();
        closeWordAlternativesPopover();
        closeEntityFilterDropdown();
        resetEntityFilter();
        state.isProcessing = true;
        statusBadge.classList.remove('hidden');
        clearProcessingFailure();
        statusHint.classList.remove('hidden');
        scanLine.classList.add('scanning');

        // processTranslation() sadece iki yerden çağrılıyor: sample
        // kartları (presetData ile, görüntü iyileştirmeye ihtiyaç duymaz)
        // ve handleFileSelect()'in otomatik akışı (runImageEnhancement
        // başarıyla bitip state.enhancedImageBlob dolduktan SONRA
        // çağırıyor) — yani buraya gelindiğinde biri mutlaka doğru.

        // Step 2: OCR Extraction
        statusMessage.textContent = 'Görüntü iyileştirme tamamlandı. Yapay Zeka ile Türkçe çeviri oluşturuluyor...';
        await new Promise(r => setTimeout(r, 1200));

        // Step 3: AI Translation
        statusMessage.textContent = 'Görüntü iyileştirme tamamlandı. Yapay Zeka ile Türkçe çeviri oluşturuluyor...';
        await new Promise(r => setTimeout(r, 1400));

        let finalOcr = '';
        let finalTrans = '';
        let finalTransEn = '';
        let finalTranslit = '';
        let finalAnalysis = null; // optional richer data for the results panel

        if (presetData) {
            finalOcr = presetData.ocr;
            finalTrans = presetData.tr;
            finalTranslit = presetData.translit || '';
            finalTransEn = presetData.trans_en || '';
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

                // Backend can now retry on repetition (2 attempts), then
                // fall back to a split-image strategy (2 parallel halves,
                // each with its own retry) and finally a different model —
                // worst case is several relay calls, so this needs more
                // headroom than the default 45s. The backend's own internal
                // time budget aborts the cascade cleanly at 350s and its
                // gunicorn --timeout is 400s (Dockerfile); 360s here sits
                // just above the backend's clean-abort point so the app
                // waits long enough to receive that JSON error response
                // instead of timing out on the frontend first.
                const apiRes = await fetchWithTimeout('https://ottoman-text-ai.onrender.com/api/translate', {
                    method: 'POST',
                    body: formData
                }, 360000);

                if (!apiRes.ok) {
                    const errorData = await apiRes.json().catch(() => ({}));
                    // Include the backend's detailed error (e.g. the relay's raw
                    // response) so the user can see the real cause directly in
                    // the output box, without needing to open DevTools.
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
                    // "Türkçe Çeviri" kolonunda sade/modern çeviriyi
                    // (trans_modern) göster; model bu alanı döndürmezse
                    // sadık/edebi çeviriye (trans) geri düş.
                    finalTrans = data.trans_modern || data.trans;
                    finalTransEn = data.trans_en || '';
                    finalTranslit = data.translit || '';
                    // DEBUG: backend response'daki translit alanının ham hali.
                    console.log('[TTS DEBUG] Backend /api/translate response — data.translit:', data.translit);
                    // Everything besides ocr/trans is optional analysis data;
                    // pass the whole payload through and let renderResultsPanel
                    // render only what's actually present.
                    finalAnalysis = data;
                    success = true;
                }
            } catch (err) {
                console.error('Backend OCR / translation error:', err);
                showProcessingFailure(classifyTranslationError(err));
                return;
            }

            if (!success) {
                showProcessingFailure('Sunucudan geçerli bir çeviri sonucu alınamadı. Lütfen tekrar deneyin.');
                return;
            }
        }

        // Display Results
        // Belge kimliği: kelime düzeltmelerini (bkz. saveWordCorrection)
        // localStorage'da bu belgeye özgü saklayabilmek için, belgenin
        // OCR/translit/trans metinlerinden türetilen kararlı bir hash.
        // Aynı belge tekrar açıldığında aynı id üretilir, düzeltmeler
        // otomatik geri uygulanabilir (bkz. applyStoredWordCorrections).
        state.documentId = hashText(`${finalOcr}${finalTranslit}${finalTrans}`);

        // Entity işaretleme (kişi/yer/kavram/olay renklendirmesi + tıklanabilirlik
        // + filtre) SADECE Modern Türkçe Çeviri (trans) kolonunda uygulanır — üç
        // kolonda tutarlılığı garanti etmeye çalışmak hem kırılgan hem maliyetli
        // çıktı, model zaten en doğru entity tespitini bu kolonun metninde
        // yapabiliyor. Kelime alternatifi (.uncertain-word tıklanabilirliği) ise
        // entity işaretlemesinden BAĞIMSIZ bir özellik — ocr ve translit
        // kolonlarında da kendi field'larıyla ('ocr' / 'translit') çalışır (bkz.
        // aşağıdaki showWordAlternativesPopover kablolaması).
        const transEntities = buildEntityIndex(finalAnalysis);

        ocrEmptyState.classList.add('hidden');
        ocrTextDisplay.classList.remove('hidden');
        renderWithGuessMarkers(ocrTextDisplay, finalOcr, { clickableGuesses: true, field: 'ocr' });
        applyStoredWordCorrections(state.documentId, 'ocr', ocrTextDisplay);
        ocrTools.classList.add('tools-ready');

        if (finalTranslit) {
            translitEmptyState.classList.add('hidden');
            translitTextDisplay.classList.remove('hidden');
            renderWithGuessMarkers(translitTextDisplay, finalTranslit, { clickableGuesses: true, field: 'translit' });
            applyStoredWordCorrections(state.documentId, 'translit', translitTextDisplay);
            translitTools.classList.add('tools-ready');
        } else {
            translitEmptyState.classList.remove('hidden');
            translitTextDisplay.classList.add('hidden');
            translitTools.classList.remove('tools-ready');
        }

        transEmptyState.classList.add('hidden');
        transTextDisplay.classList.remove('hidden');
        renderColumnWithEntities(transTextDisplay, finalTrans, transEntities, { clickableGuesses: true, field: 'trans' });
        applyStoredWordCorrections(state.documentId, 'trans', transTextDisplay);
        transTools.classList.add('tools-ready');

        // "Filtrele" menüsü bu belgedeki gerçek kategorilerle (kaç kişi,
        // kaç yer vb.) yeniden kuruluyor — menü kapalıyken sadece içeriği
        // tazeleniyor, bir sonraki açılışta renderEntityFilterMenu() zaten
        // tekrar çağrılacak ama burada da güncel tutmak buton metninin/sayaç
        // ihtiyacı olursa diye zararsız bir ön-yükleme.
        renderEntityFilterMenu();

        if (finalTransEn) {
            enEmptyState.classList.add('hidden');
            enTextDisplay.classList.remove('hidden');
            renderWithGuessMarkers(enTextDisplay, finalTransEn);
            // Diğer üç grup (ocr/translit/trans) gibi: araç çubuğu
            // (kopyala + enTtsBtn/enStopTtsBtn) .tools-ready OLMADAN asla
            // görünmez (bkz. style.css .output-tab-tools kuralı — sadece
            // .tools-ready VE .tab-active birlikteyken display:flex olur).
            // Bu satır eksikti; enTools hiçbir zaman .tools-ready almadığı
            // için İngilizce sekmesindeki tüm araçlar (kopyala dahil)
            // kalıcı olarak gizli kalıyordu.
            enTools.classList.add('tools-ready');
        } else {
            enEmptyState.classList.remove('hidden');
            enTextDisplay.classList.add('hidden');
            enTools.classList.remove('tools-ready');
        }

        state.ocrText = finalOcr;
        state.transText = finalTrans;
        state.transTextEn = finalTransEn;
        state.translitText = finalTranslit;
        state.lastAnalysis = finalAnalysis;

        // Index translated document for AI/RAG features
    if (finalTrans && finalTrans.trim()) {
        try {
            const indexResponse = await fetchWithTimeout(
                'https://ottoman-text-ai.onrender.com/api/ai/index-document',
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        text: finalTrans
                    })
                },
                45000
            );

            const indexData = await indexResponse.json();

            if (!indexResponse.ok) {
                console.warn(
                    '[AI INDEX]',
                    indexData.error || 'Document could not be indexed.'
                );
            } else {
                console.log('[AI INDEX] Document indexed successfully.');
            }

        } catch (error) {
            console.warn(
                '[AI INDEX] Index request failed:',
                error
            );
        }
    }

        // "Bilgi" bölümü — sadece gerçekten analiz verisi varsa doldurulup
        // gösterilir; çeviri tamamlanır tamamlanmaz kullanıcı ayrıca tıklamak
        // zorunda kalmadan AÇIK gelir (bkz. setInfoExpanded). AI Belge
        // Araçları da aynı anda, aynı şekilde açılır — eskiden sohbet
        // asistanının içinde ayrıca tıklanması gereken bir modaldı.
        if (finalAnalysis) {
            renderResultsPanel(finalAnalysis);
            setInfoExpanded(true);
            aiToolsTabBtn.classList.remove('hidden');
            setAiToolsExpanded(true);
        } else {
            clearInfoTab();
        }
        setOutputTab('trans');
        smoothScrollTo(transOutputBox);

        // Step 4: Completed
        statusMessage.textContent = 'Çeviri tamamlandı!';
        statusHint.classList.add('hidden');
        scanLine.classList.remove('scanning');

        state.isProcessing = false;

        // Giriş yapılmışsa çeviriyi arka planda veritabanına kaydet (best
        // effort, kullanıcıyı bekletmez); giriş yapılmamışsa "Belgelerim"e
        // kaydedilmediğini bir pop-up ile bildir. Örnek kartlar ve
        // "Belgelerim"den yeniden açılan kayıtlı çeviriler presetData
        // üzerinden geldiği için bu blok onlarda hiç çalışmaz.
        if (!presetData) {
            if (state.authToken) {
                saveTranslationToBackend(finalAnalysis, state.enhancedImageBlob, state.pendingOverwriteDocumentId);
            } else {
                alert('Bu çeviri veritabanına kaydedilmedi. Belgelerinizi kaydedip daha sonra görüntüleyebilmek için giriş yapın.');
            }
        }
    }

    // --- Interactive Tools & Actions ---
    copyOcrBtn.addEventListener('click', () => copyToClipboard(ocrTextDisplay.textContent, 'Osmanlıca metin kopyalandı!'));
    copyTranslitBtn.addEventListener('click', () => copyToClipboard(translitTextDisplay.textContent, 'Okunuş metni kopyalandı!'));
    copyTransBtn.addEventListener('click', () => copyToClipboard(transTextDisplay.textContent, 'Türkçe çeviri kopyalandı!'));
    copyEnBtn.addEventListener('click', () => copyToClipboard(enTextDisplay.textContent, 'English translation copied!'));

    function escapeHtml(text) {
        return (text || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    function escapeRegExp(text) {
        return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    // JS'in /i (case-insensitive) regex bayrağı Türkçe'ye özgü dört harfi
    // (İ/i noktalı, I/ı noktasız) doğru eşleştirmiyor: 'İ'.toLowerCase()
    // düz 'i' değil, 'i' + ayrı birleştirici nokta işareti (2 karakter)
    // veriyor; bu yüzden örn. "İklim" entity'si metinde küçük harfle geçen
    // "iklim" ile hiç eşleşmiyordu (sessizce kırık vurgulama). Bu fonksiyon,
    // escape edilmiş entity metnindeki i/İ/I/ı karakterlerini açık
    // [iİ]/[Iı] karakter sınıflarına çevirerek bunu regex SEVİYESİNDE
    // düzeltir — aranan metne (escapedText) hiç dokunulmaz, sadece
    // buildEntityAlternationSource'un ürettiği pattern değişir. Bu yüzden
    // SADECE trans/tr kolonundaki entity vurgulamasını etkiler; cümle
    // bölme, TTS ve diğer regex'ler bu fonksiyonu hiç kullanmaz.
    function turkishCaseInsensitiveSource(text) {
        return escapeRegExp(text).replace(
            /[iİIı]/g,
            (ch) => (ch === 'i' || ch === 'İ') ? '[iİ]' : '[Iı]'
        );
    }

    // rawText'i, TTS'in kullandığı AYNI kurala göre (yalnızca . ! ? — satır
    // sonları sayılmaz) art arda gelen, kayıpsız birleştirilebilir (yani
    // parçaları concat edince rawText'i tam olarak veren) parçalara böler.
    // speakText()'in ürettiği cümle listesiyle 1:1 hizalı kalması için bölme
    // mantığı splitIntoSentences() ile birebir aynı iskelet üzerine kurulu;
    // tek fark burada parçalar TRIM EDİLMEDEN (baştaki/sondaki boşluk ve \n
    // korunarak) döner, çünkü bu parçalar doğrudan ekrana (pre-wrap) yazılan
    // <span class="tts-sentence"> içeriği olacak.
    function partitionSentencesRaw(text) {
        const pieces = text.split(/([.!?]+)/);
        const parts = [];
        let current = '';
        for (const piece of pieces) {
            current += piece;
            if (/[.!?]/.test(piece) && current.trim()) {
                parts.push(current);
                current = '';
            }
        }
        if (current) parts.push(current);
        return parts.length ? parts : [text];
    }

    // Backend, modelin tahmin ettiği (okuyamadığı ama bağlamdan tahmin
    // ettiği) kelime/ifadeleri **böyle** işaretleyerek gönderiyor. Burada
    // bunu güvenli şekilde <strong>'e çevirip gösteriyoruz — önce HTML'i
    // escape edip sonra sadece **...** çiftlerini kalınlaştırıyoruz, ham
    // model çıktısını doğrudan innerHTML'e basmıyoruz (XSS'e karşı).
    //
    // Ayrıca her cümleyi (partitionSentencesRaw ile) ayrı bir
    // <span class="tts-sentence" data-tts-idx="N"> içine sarar, böylece
    // speakText() o an okunan cümleyi aynı N indeksiyle vurgulayabilir
    // (bkz. TTS bölümü). entities verilirse (Türkçe çeviri sekmesi), her
    // cümle içinde ayrıca kişi/yer/tarih vurgulaması da uygulanır.
    //
    // options.clickableGuesses true ise (ocr/translit/trans kolonlarında),
    // her **tahmin** işaretli <strong>, tıklanabilir bir "belirsiz kelime"
    // olarak data-word-idx (bu render içinde 0'dan başlayan, HER ÇAĞRIYA ÖZEL
    // bir sayaç — yani ocr/translit/trans'ın kendi word-idx'leri birbirinden
    // bağımsız) ve data-word-field ('ocr'/'translit'/'trans', options.field'dan
    // gelir) ile işaretlenir — bkz. showWordAlternativesPopover(). options
    // verilmezse (en sekmesi) davranış sade <strong> kalır — tıklanabilirlik yok.
    function renderSentenceSpansHtml(rawText, entities, options) {
        const clickableGuesses = !!(options && options.clickableGuesses);
        const wordField = (options && options.field) || '';
        let guessIndex = 0;

        // "guess-marker" class'ı, tıklanabilirlikten (clickableGuesses)
        // BAĞIMSIZ olarak HER kolonda ekleniyor — "AI Belirsizliği" filtresinin
        // (bkz. getEntityFilterCategories/applyEntityFilter) hedef alacağı
        // ortak class budur. "uncertain-word" ise SADECE clickableGuesses
        // true iken (yani sadece trans_modern'de) eklenir ve tıklanabilir
        // alt çizgi stilini (bkz. style.css) tetikler — bu davranış değişmedi.
        function renderGuess(text) {
            if (!clickableGuesses) return `<strong class="guess-marker">${text}</strong>`;
            const wordIdx = guessIndex++;
            return `<strong class="guess-marker uncertain-word" data-word-idx="${wordIdx}" data-word-field="${wordField}">${text}</strong>`;
        }

        // Aynı entity (örn. "İstanbul") bu metin içinde birden fazla kez
        // geçse bile SADECE İLK geçtiği yerde işaretlensin diye — bu Set,
        // tüm cümleler boyunca (aşağıdaki .map döngüsü sırasında) paylaşılan
        // tek bir "bu render çağrısında zaten kullanıldı" kaydıdır. Her
        // renderSentenceSpansHtml() çağrısı kendi taze Set'ini oluşturduğu
        // için bu sayaç sadece TEK bir render çağrısı (yani transTextDisplay
        // için tek bir işlem) boyunca geçerlidir.
        const usedEntityKeys = new Set();

        const parts = partitionSentencesRaw(rawText || '');
        return parts.map((raw, idx) => {
            const escaped = escapeHtml(raw);
            let inner;
            if (entities && entities.length) {
                const segments = splitGuessSegments(escaped);
                inner = segments
                    .map(seg => seg.bold
                        ? renderGuess(seg.text)
                        : highlightEntitiesInSegment(seg.text, entities, usedEntityKeys))
                    .join('');
            } else {
                // entities yok (ocr/translit/en) — ama "AI Belirsizliği"
                // filtresinin bu kolonlarda da çalışabilmesi için düz metin
                // parçaları da (trans_modern'daki .entity-plain deseniyle
                // aynı şekilde) sarmalanır; splitGuessSegments zaten
                // entities'ten bağımsız, genel bir bölme yardımcısı.
                const segments = splitGuessSegments(escaped);
                inner = segments
                    .map(seg => seg.bold ? renderGuess(seg.text) : wrapPlainText(seg.text))
                    .join('');
            }
            return `<span class="tts-sentence" data-tts-idx="${idx}">${inner}</span>`;
        }).join('');
    }

    function renderWithGuessMarkers(el, rawText, options) {
        el.innerHTML = renderSentenceSpansHtml(rawText, null, options);
    }

    // transTextDisplay'e (bkz. buildEntityIndex), entity vurgulamasıyla
    // birlikte render eder. Entity işaretleme/tıklanabilirlik SADECE bu
    // kolonda kullanılıyor — ocr/translit kolonları sade renderWithGuessMarkers
    // kullanır. entities boşsa davranış renderWithGuessMarkers ile birebir
    // aynı kalır — sade <strong> tahmin işaretleri.
    function renderColumnWithEntities(el, rawText, entities, options) {
        el.innerHTML = renderSentenceSpansHtml(rawText, entities && entities.length ? entities : null, options);
    }

    const ENTITY_TYPE_LABELS = { person: 'Kişi', place: 'Yer', date: 'Tarih', concept: 'Kavram', event: 'Olay' };

    // "Fatih Sultan Mehmed (Sultan Mehmed Han)" gibi bir analiz girdisinden,
    // çeviri metninde gerçekten geçebilecek adayları çıkarır: parantez
    // içindeki takma adı ayrı bir aday olarak, "/" ile ayrılmış isimleri de
    // ayrı adaylar olarak ele alır.
    function extractEntityCandidates(rawText) {
        let candidates = [rawText];
        const parenMatch = rawText.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
        if (parenMatch) {
            candidates = [parenMatch[1], parenMatch[2]];
        }
        return candidates
            .flatMap(c => c.split('/'))
            .map(c => c.trim())
            .filter(Boolean);
    }

    // Bir belge analizinden (bkz. backend /api/translate yanıtı ve
    // sampleDatabase'deki "analysis" alanları), çeviri metninde vurgulanacak
    // kişi/yer/tarih/kavram adaylarını çıkarır. En uzun eşleşme önce
    // denenmesi için (örn. "Sultan Mehmed Han" ifadesi, içindeki tek başına
    // "Mehmed" kelimesinden önce eşleşsin diye) uzunluğa göre azalan sırada
    // döner.
    function buildEntityIndex(analysis) {
        if (!analysis) return [];
        const raw = [];

        (analysis.people || []).forEach(p => raw.push({ raw: p, type: 'person' }));
        (analysis.places || []).forEach(p => raw.push({ raw: p, type: 'place' }));
        (analysis.concepts || []).forEach(p => raw.push({ raw: p, type: 'concept' }));
        (analysis.events || []).forEach(p => raw.push({ raw: p, type: 'event' }));
        if (analysis.date_hijri) raw.push({ raw: analysis.date_hijri, type: 'date' });
        if (analysis.date_gregorian) raw.push({ raw: analysis.date_gregorian, type: 'date' });

        const seen = new Set();
        const entries = [];

        raw.forEach(({ raw: rawEntry, type }) => {
            if (typeof rawEntry !== 'string') return;
            extractEntityCandidates(rawEntry).forEach(text => {
                if (text.length < 3) return;
                const key = text.toLowerCase();
                if (seen.has(key)) return;
                seen.add(key);
                entries.push({ text, type });
            });
        });

        return entries.sort((a, b) => b.text.length - a.text.length);
    }

    // "**tahmin**" işaretlerini <strong>'e çeviren bölünme mantığını
    // renderWithGuessMarkers ile aynı tutar, ama parçaları birleştirmeden
    // önce her düz-metin parçasına ayrıca entity vurgulaması uygulayabilmek
    // için segment listesi olarak döner.
    function splitGuessSegments(escapedText) {
        const segments = [];
        const re = /\*\*(.+?)\*\*/gs;
        let lastIndex = 0;
        let match;

        while ((match = re.exec(escapedText)) !== null) {
            if (match.index > lastIndex) {
                segments.push({ bold: false, text: escapedText.slice(lastIndex, match.index) });
            }
            segments.push({ bold: true, text: match[1] });
            lastIndex = re.lastIndex;
        }

        if (lastIndex < escapedText.length) {
            segments.push({ bold: false, text: escapedText.slice(lastIndex) });
        }

        return segments;
    }

    function wrapPlainText(text) {
        return text ? `<span class="entity-plain">${text}</span>` : '';
    }

    // entities'teki her aday için AYRI bir named capture group ("e0",
    // "e1", ...) üretir. Amaç: eşleşme bulunduğunda tipi (person/place/...)
    // eşleşen METNİ aday listesiyle KARŞILAŞTIRARAK değil, regex'te HANGİ
    // GRUBUN eşleştiğine bakarak belirlemek — bu, buildEntityIndex()'ten
    // gelen TEK type kaynağının doğru şekilde kullanılmasını garanti eder.
    function buildEntityAlternationSource(entities) {
        return entities
            .map((e, i) => `(?<e${i}>${turkishCaseInsensitiveSource(escapeHtml(e.text))})`)
            .join('|');
    }

    // escapedText zaten HTML-escape edilmiş düz metin olmalı. entities,
    // buildEntityIndex()'ten gelen {text, type} listesidir (text'ler de
    // escape edilmemiş orijinal hâlleriyle karşılaştırılabilmesi için burada
    // ayrıca escape edilir).
    //
    // Eşleşmeyen (entity olmayan) parçalar da artık .entity-plain içine
    // sarılıyor — bunun tek amacı, kategori filtresinin (bkz.
    // renderEntityFilterMenu/applyEntityFilter) CSS opacity'yi entity-
    // tag'lerden bağımsız olarak düz metne de uygulayabilmesi: opacity,
    // üst elemente uygulandığında alt elemente "kendi opacity'sini" geri
    // kazandıramaz (stacking context çarpımsaldır), bu yüzden
    // soluklaştırılacak her parçanın KENDİ elementi olması gerekiyor.
    // usedEntityKeys: renderSentenceSpansHtml() tarafından TÜM cümleler
    // boyunca paylaşılan bir Set — aynı entity metni (küçük harfe çevrilmiş
    // hâliyle) bu Set'te zaten varsa, bu geçiş .entity-tag OLARAK DEĞİL,
    // düz metin (.entity-plain) olarak render edilir (bkz. "aynı kelime
    // sadece ilk geçişte işaretlensin" kuralı). İlk eşleşmede Set'e eklenir.
    function highlightEntitiesInSegment(escapedText, entities, usedEntityKeys) {
        if (!entities.length) return wrapPlainText(escapedText);

        const alternation = buildEntityAlternationSource(entities);

        if (!alternation) return wrapPlainText(escapedText);

        // Kelime sınırı: eşleşmenin hemen ÖNCESİNDE başka bir harf/rakam
        // OLMAMALI — yoksa kısa bir aday (örn. "Karaman") daha uzun,
        // alakasız bir kelimenin (örn. "Karamanoğlu") içinde yanlışlıkla
        // eşleşebilir. Bu taraf sıkı tutuluyor: entity hâlâ kelimenin TAM
        // BAŞINDA olmak zorunda (örn. "Aliye" içinde "Ali" yine eşleşmez).
        //
        // SONDA ise tam kelime sınırı yerine, Türkçe çekim eklerine izin
        // veren daha esnek bir kural var: entity'den hemen sonra 0-6
        // karakterlik küçük harf (a-z + çğıöşü) dizisi varsa eşleşmeye
        // DAHİL edilir (örn. "Hoşgörü" + "de" -> "Hoşgörüde" bütünüyle
        // vurgulanır). Karakter sınıfı zaten yalnızca küçük harfle
        // eşleştiği için büyük harf/rakam/boşluk gelirse ek otomatik
        // olarak 0 karakterde durur; sondaki `(?![\p{L}\p{N}])` de hâlâ
        // eşleşmenin (entity + varsa ek) bir harf/rakamın ORTASINDA değil,
        // tam bir kelime sınırında bitmesini garanti eder — 6 karakterden
        // uzun bir ek varsa (örn. "Hoşgörüsüzlükle") bu sınır hiç
        // sağlanamayacağı için eşleşme tamamen reddedilir, yanlış/yarım
        // bir vurgulama olmaz.
        const re = new RegExp(
            `(?<![\\p{L}\\p{N}])(?:${alternation})[a-zçğıöşü]{0,6}(?![\\p{L}\\p{N}])`,
            'giu'
        );
        const parts = [];
        let lastIndex = 0;
        let match;

        while ((match = re.exec(escapedText)) !== null) {
            if (match.index > lastIndex) {
                parts.push(wrapPlainText(escapedText.slice(lastIndex, match.index)));
            }

            const matched = match[0];
            const key = matched.toLowerCase();

            if (usedEntityKeys.has(key)) {
                parts.push(wrapPlainText(matched));
            } else {
                usedEntityKeys.add(key);

                let matchedEntity = null;
                for (let i = 0; i < entities.length; i++) {
                    if (match.groups[`e${i}`] !== undefined) {
                        matchedEntity = entities[i];
                        break;
                    }
                }

                const type = matchedEntity ? matchedEntity.type : 'concept';
                const safeAttr = matched.replace(/"/g, '&quot;');
                parts.push(`<span class="entity-tag entity-${type}" data-entity="${safeAttr}" data-type="${type}">${matched}</span>`);
            }

            lastIndex = re.lastIndex;
        }

        if (lastIndex < escapedText.length) {
            parts.push(wrapPlainText(escapedText.slice(lastIndex)));
        }

        return parts.join('');
    }

    // İki popover türü de (entity kartı ve aşağıdaki kelime-alternatifleri
    // kartı) aynı "hedef elemanın hemen altına, ekran dışına taşmadan
    // konumlan" mantığını paylaşır — tek yerde tutulur, ikisi de kullanır.
    function positionPopoverNear(popover, targetEl) {
        const rect = targetEl.getBoundingClientRect();
        const popRect = popover.getBoundingClientRect();
        const maxLeft = window.scrollX + document.documentElement.clientWidth - popRect.width - 12;
        const left = Math.max(12, Math.min(rect.left + window.scrollX, maxLeft));
        const top = rect.bottom + window.scrollY + 8;

        popover.style.left = `${left}px`;
        popover.style.top = `${top}px`;
    }

    let activeEntityPopover = null;
    // entity metni+tipine göre önbellek — aynı entity'ye tekrar
    // tıklandığında /api/entity-info'yu tekrar çağırmadan önceki cevabı
    // gösterir. Sadece bu sayfa yüklemesi boyunca geçerli (state'e değil,
    // düz bir JS objesine yazılıyor — kalıcı saklamaya gerek yok, bkz.
    // word-alternatives'teki localStorage'dan farklı olarak burası sadece
    // aynı oturumda gereksiz istek tekrarını önlemek için).
    const entityInfoCache = {};
    // wordPopoverToken ile aynı desen: her showEntityPopover() çağrısı bu
    // sayacı artırır; async /api/entity-info cevabı geldiğinde kart hâlâ
    // AYNI açılışa mı ait diye bununla kontrol edilir — kullanıcı kart
    // yanıt gelmeden kapatır ya da başka bir entity'ye tıklarsa, bayat
    // cevabın yanlış karta yazılmasını önler.
    let entityPopoverToken = 0;

    function closeEntityPopover() {
        if (activeEntityPopover) {
            activeEntityPopover.remove();
            activeEntityPopover = null;
        }
        entityPopoverToken++;
    }

    async function showEntityPopover(targetEl) {
        closeEntityPopover();
        closeWordAlternativesPopover();
        closeEntityFilterDropdown();

        const myToken = entityPopoverToken;
        const type = targetEl.dataset.type;
        const text = targetEl.dataset.entity;
        const label = ENTITY_TYPE_LABELS[type] || 'Bilgi';
        const sentenceEl = targetEl.closest('.tts-sentence');
        const sentenceText = sentenceEl ? sentenceEl.textContent : text;
        const cacheKey = `${type}:${text.toLowerCase()}`;

        const popover = document.createElement('div');
        popover.className = 'entity-popover';

        const typeEl = document.createElement('div');
        typeEl.className = `entity-popover-type entity-popover-type-${type}`;
        typeEl.textContent = label;
        popover.appendChild(typeEl);

        const textEl = document.createElement('div');
        textEl.className = 'entity-popover-text';
        textEl.textContent = text;
        popover.appendChild(textEl);

        const contextEl = document.createElement('div');
        contextEl.className = 'entity-popover-context';
        popover.appendChild(contextEl);

        document.body.appendChild(popover);
        positionPopoverNear(popover, targetEl);
        activeEntityPopover = popover;

        // Şu an bir örnek belge açıksa ve o örneğin entity_info'sunda bu
        // entity için statik bir metin varsa, API'ye hiç gitmeden onu
        // göster — entityInfoCache'e yazmaya da gerek yok, kaynağı zaten
        // sampleDatabase (bkz. state.activeSampleKey tanımı).
        const sampleEntityInfo = state.activeSampleKey
            ? sampleDatabase[state.activeSampleKey]?.entity_info?.[cacheKey]
            : null;
        if (sampleEntityInfo) {
            contextEl.textContent = sampleEntityInfo;
            return;
        }

        // Önbellekte varsa, ağ isteği atmadan doğrudan göster.
        if (entityInfoCache[cacheKey]) {
            contextEl.textContent = entityInfoCache[cacheKey];
            return;
        }

        contextEl.textContent = 'Bilgi yükleniyor...';
        contextEl.classList.add('entity-popover-loading');

        let infoText = '';
        let errorMessage = '';

        try {
            const response = await fetchWithTimeout(
                'https://ottoman-text-ai.onrender.com/api/entity-info',
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        entity: text,
                        entity_type: type,
                        sentence: sentenceText
                    })
                },
                30000
            );
            const data = await response.json();
            if (!response.ok || !data.success) {
                throw new Error(data.error || 'Bilgi alınamadı.');
            }
            infoText = (data.info || '').trim();
        } catch (err) {
            errorMessage = err.message || 'Bilgi alınamadı.';
        }

        // Bu arada kart kapatıldıysa ya da başka bir entity için yeniden
        // açıldıysa, bu cevabı artık hiçbir yere yazma.
        if (myToken !== entityPopoverToken || activeEntityPopover !== popover) return;

        contextEl.classList.remove('entity-popover-loading');

        if (infoText) {
            entityInfoCache[cacheKey] = infoText;
            contextEl.textContent = infoText;
        } else {
            contextEl.textContent = errorMessage || 'Bu öğe için bilgi alınamadı.';
            contextEl.classList.add('entity-popover-error');
        }
    }

    // Entity popover SADECE Modern Türkçe Çeviri (trans) kolonunda açılır —
    // .entity-tag zaten sadece bu kolonda üretiliyor.
    transTextDisplay.addEventListener('click', (e) => {
        const tag = e.target.closest('.entity-tag');
        if (!tag) return;
        e.stopPropagation();
        showEntityPopover(tag);
    });

    document.addEventListener('click', (e) => {
        if (!activeEntityPopover) return;
        if (activeEntityPopover.contains(e.target) || e.target.closest('.entity-tag')) return;
        closeEntityPopover();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeEntityPopover();
            closeWordAlternativesPopover();
            closeEntityFilterDropdown();
        }
    });

    // Cmd/Ctrl+A varsayılan olarak tüm sayfayı seçiyor — kullanıcı OCR/çeviri
    // sütunlarından birinde metin seçiliyken "tümünü seç" yapmak istediğinde
    // bunun yerine sadece içinde bulunduğu metin kutusunu (sütunu) seçelim,
    // sayfanın geri kalanını (menü, başlıklar vb.) değil.
    document.addEventListener('keydown', (e) => {
        if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'a') return;

        // Bir input/textarea'da yazıyorsa (arama kutusu, profil formu vb.)
        // karışma — tarayıcının o alana özgü normal "tümünü seç" davranışı
        // zaten doğru olanı yapıyor.
        const active = document.activeElement;
        if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) return;

        const selection = window.getSelection();
        const anchor = selection && selection.anchorNode;
        if (!anchor) return;
        const anchorEl = anchor.nodeType === Node.TEXT_NODE ? anchor.parentElement : anchor;
        const scope = anchorEl && anchorEl.closest('.text-display, #infoAnalysisCard');
        if (!scope) return;

        e.preventDefault();
        const range = document.createRange();
        range.selectNodeContents(scope);
        selection.removeAllRanges();
        selection.addRange(range);
    });

    // --- Kategoriye Göre Filtrele (entity filter) ---
    // "Filtrele ▾" (entityFilterTrigger/entityFilterMenu), ortak
    // .lang-dropdown/.lang-dropdown-trigger/.lang-dropdown-menu HTML/CSS
    // kalıbını kullanan, Günümüz Türkçesi sütununun başlığına entegre bir
    // dropdown'dur (bkz. yukarıdaki aç/kapa/dış-tıklama kablolaması). Menü
    // içeriği SABİT değil — her açılışta
    // renderEntityFilterMenu() ile, belgede GERÇEKTEN bulunan kategoriler
    // (Kişiler/Yerler/Tarihler/Kavramlar/Olaylar — hangisinden en az 1
    // entity-tag varsa) sayılarıyla yeniden kurulur. Bir kategoriye
    // tıklanınca DOM yeniden render EDİLMEZ — sadece transTextDisplay'e
    // data-entity-filter attribute'u eklenir/kaldırılır, geri kalanı
    // tamamen CSS'te (style.css'teki [data-entity-filter] kuralları)
    // halledilir. Entity işaretleme/filtreleme SADECE Modern Türkçe Çeviri
    // (trans) kolonunda çalışır — ocr/translit kolonlarında hiç entity-tag
    // üretilmediği için bu özellik onları etkilemez.
    // null: filtre yok. 'person' | 'place' | 'date' | 'concept' | 'event':
    // aktif kategori. Sekme değişince/yeni belge işlenince sıfırlanır (bkz.
    // resetEntityFilter, setOutputTab/resetState/processTranslation'daki
    // çağrılar).
    let activeEntityFilterType = null;

    function closeEntityFilterDropdown() {
        entityFilterMenu.classList.add('hidden');
        entityFilterTrigger.setAttribute('aria-expanded', 'false');
    }

    // Aktif filtreyi tamamen kaldırır (metni normale döndürür) — TTS'e,
    // kelime alternatifi kartına, entity popover'a dokunmaz, onlar filtre
    // aktifken de tamamen normal çalışmaya devam eder (opacity/vurgu
    // dışında hiçbir davranışları değişmiyor zaten).
    function resetEntityFilter() {
        activeEntityFilterType = null;
        transTextDisplay.removeAttribute('data-entity-filter');
        ocrTextDisplay.removeAttribute('data-entity-filter');
        translitTextDisplay.removeAttribute('data-entity-filter');
    }

    // Filtre uygulanabilecek kategorileri, ekranda GERÇEKTEN render edilmiş
    // .entity-tag sayısından belirlemek için kullanılan buton başına belge
    // içindeki gerçek dağılımı yansıtır — backend'in people/places/concepts/
    // events listesinden değil (bir isim analizde geçse bile çeviri
    // metninde birebir eşleşmemiş olabilir; kullanıcıya sadece gerçekten
    // tıklayıp göreceği kategoriler gösterilmeli).
    function getEntityFilterCategories() {
        const entityCategories = [
            { type: 'person', label: 'Kişiler' },
            { type: 'place', label: 'Yerler' },
            { type: 'date', label: 'Tarihler' },
            { type: 'concept', label: 'Kavramlar' },
            { type: 'event', label: 'Olaylar' },
        ].map(cat => ({
            ...cat,
            count: transTextDisplay.querySelectorAll(`.entity-tag[data-type="${cat.type}"]`).length
        }));

        // "AI Belirsizliği": diğer kategorilerin aksine tek bir .entity-tag
        // tipine değil, HER ÜÇ kolondaki (ocr/translit/trans_modern)
        // .guess-marker span'larına bakar — bkz. applyEntityFilter().
        const guessCategory = {
            type: 'guess',
            label: 'AI Belirsizliği',
            count: (
                ocrTextDisplay.querySelectorAll('.guess-marker').length +
                translitTextDisplay.querySelectorAll('.guess-marker').length +
                transTextDisplay.querySelectorAll('.guess-marker').length
            )
        };

        return [...entityCategories, guessCategory].filter(cat => cat.count > 0);
    }

    // entityFilterMenu'yü (dropdown içeriğini) sıfırdan kurar — hem menü
    // ilk açıldığında hem bir kategori seçimi/temizleme sonrası (aktif/
    // "Tümünü Göster" durumlarını güncel tutmak için) çağrılır.
    function renderEntityFilterMenu() {
        entityFilterMenu.innerHTML = '';

        const categories = getEntityFilterCategories();

        if (categories.length === 0) {
            const emptyEl = document.createElement('div');
            emptyEl.className = 'entity-filter-empty';
            emptyEl.textContent = 'Bu belgede filtrelenecek bir kategori bulunamadı.';
            entityFilterMenu.appendChild(emptyEl);
            return;
        }

        categories.forEach(cat => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'entity-filter-option';
            btn.dataset.filterType = cat.type;
            btn.classList.toggle('active', activeEntityFilterType === cat.type);
            btn.textContent = `${cat.label} (${cat.count})`;
            btn.addEventListener('click', () => applyEntityFilter(cat.type));
            entityFilterMenu.appendChild(btn);
        });

        const clearBtn = document.createElement('button');
        clearBtn.type = 'button';
        clearBtn.className = 'entity-filter-clear';
        clearBtn.classList.toggle('hidden', !activeEntityFilterType);
        clearBtn.textContent = 'Tümünü Göster';
        clearBtn.addEventListener('click', () => applyEntityFilter(null));
        entityFilterMenu.appendChild(clearBtn);
    }

    // type: 'person' | 'place' | 'date' | 'concept' | 'event' | null. Aynı
    // kategoriye tekrar basılırsa filtre kapanır (spec: "aynı kategoriye
    // tekrar tıklarsa filtre kaldırılsın").
    function applyEntityFilter(type) {
        activeEntityFilterType = (activeEntityFilterType === type) ? null : type;

        if (activeEntityFilterType) {
            transTextDisplay.setAttribute('data-entity-filter', activeEntityFilterType);
        } else {
            transTextDisplay.removeAttribute('data-entity-filter');
        }

        // "AI Belirsizliği" (guess) filtresi TEK BAŞINA ocr/translit
        // kolonlarını da kapsar — diğer kategoriler (person/place/...) her
        // zaman SADECE trans_modern'de çalışmaya devam eder, buradaki
        // davranışları değişmedi.
        if (activeEntityFilterType === 'guess') {
            ocrTextDisplay.setAttribute('data-entity-filter', 'guess');
            translitTextDisplay.setAttribute('data-entity-filter', 'guess');
        } else {
            ocrTextDisplay.removeAttribute('data-entity-filter');
            translitTextDisplay.removeAttribute('data-entity-filter');
        }

        if (!entityFilterMenu.classList.contains('hidden')) {
            renderEntityFilterMenu();
        }
    }

    // --- Belirsiz Kelime Alternatifleri (uncertain-word) ---
    // Osmanlıca (ocr), Translit ve Türkçe çeviri (trans) kolonlarındaki
    // **tahmin** işaretli (.uncertain-word) kelimelere tıklanınca, kelimenin
    // yakınında küçük bir kart açılır: OCR/Osmanlıca hali, kökeni ve en fazla 3 alternatif
    // okuma — bunlar ANA çeviri isteğinde değil, tıklama anında YENİ ve
    // küçük bir istekle (/api/word-alternatives) tembel yüklenir (ana
    // çeviriyi yavaşlatmamak, token limitini zorlamamak için). TTS'e hiç
    // dokunmaz: speechSynthesis'i durdurmaz/duraklatmaz, okuma sürerken de
    // açılabilir.

    // Belge içeriğinden kararlı, basit bir kimlik üretir (kriptografik
    // değil — sadece "bu aynı belge mi" ayrımı için yeterli). localStorage
    // anahtarlaması için kullanılır (bkz. saveWordCorrection).
    function hashText(text) {
        let hash = 0;
        for (let i = 0; i < text.length; i++) {
            hash = (hash * 31 + text.charCodeAt(i)) | 0;
        }
        return (hash >>> 0).toString(36);
    }

    const WORD_CORRECTIONS_STORAGE_KEY = 'divane_word_corrections';

    function readWordCorrectionsStore() {
        try {
            return JSON.parse(localStorage.getItem(WORD_CORRECTIONS_STORAGE_KEY) || '{}');
        } catch (err) {
            return {};
        }
    }

    function writeWordCorrectionsStore(store) {
        localStorage.setItem(WORD_CORRECTIONS_STORAGE_KEY, JSON.stringify(store));
    }

    // Kullanıcının onayladığı bir kelime düzeltmesini kalıcı hale getirir.
    // İÇİ şu an localStorage kullanıyor; ÇAĞIRAN KOD (kart/onay butonu) bu
    // fonksiyonun içinde ne olduğunu bilmiyor/önemsemiyor — ileride
    // localStorage yerine gerçek bir backend'e geçmek istenirse, sadece bu
    // fonksiyonun (ve loadWordCorrections'ın) gövdesi değişecek.
    function saveWordCorrection(documentId, field, wordIdx, chosenReading) {
        if (!documentId) return;
        const store = readWordCorrectionsStore();
        if (!store[documentId]) store[documentId] = {};
        if (!store[documentId][field]) store[documentId][field] = {};
        store[documentId][field][wordIdx] = chosenReading;
        writeWordCorrectionsStore(store);
    }

    function loadWordCorrections(documentId, field) {
        if (!documentId) return {};
        const store = readWordCorrectionsStore();
        return (store[documentId] && store[documentId][field]) || {};
    }

    // Her kolon (ocr/translit/trans) kendi render'ından hemen sonra kendi
    // field'ıyla çağırır: daha önce bu belge + bu kolon için kaydedilmiş
    // düzeltmeleri ekrana geri uygular (sayfa yenilense/belge tekrar açılsa
    // bile düzeltmeler kaybolmasın). field ayrı olduğu için kolonlar
    // birbirinin düzeltmesini asla geri uygulamaz/ezmez.
    function applyStoredWordCorrections(documentId, field, containerEl) {
        const corrections = loadWordCorrections(documentId, field);
        Object.keys(corrections).forEach(wordIdx => {
            const span = containerEl.querySelector(`.uncertain-word[data-word-idx="${wordIdx}"]`);
            if (span) span.textContent = corrections[wordIdx];
        });
    }

    let activeWordPopover = null;
    // Popover her açılışta/kapanışta artar; async /api/word-alternatives
    // cevabı geldiğinde kart hâlâ AYNI açılışa mı ait diye bunu kontrol
    // ederiz — kullanıcı kart yanıt gelmeden kapatır ya da başka bir
    // kelimeye tıklarsa, eski (bayat) cevabın yanlış karta yazılmasını
    // önler.
    let wordPopoverToken = 0;

    function closeWordAlternativesPopover() {
        if (activeWordPopover) {
            activeWordPopover.remove();
            activeWordPopover = null;
        }
        wordPopoverToken++;
    }

    async function showWordAlternativesPopover(targetEl) {
        closeEntityPopover();
        closeWordAlternativesPopover();
        closeEntityFilterDropdown();

        const myToken = wordPopoverToken;
        const wordText = targetEl.textContent;
        const field = targetEl.dataset.wordField;
        const sentenceEl = targetEl.closest('.tts-sentence');
        const sentenceText = sentenceEl ? sentenceEl.textContent : wordText;

        const popover = document.createElement('div');
        popover.className = 'word-alt-popover';

        const wordEl = document.createElement('div');
        wordEl.className = 'word-alt-popover-word';
        wordEl.textContent = wordText;
        popover.appendChild(wordEl);

        const loadingEl = document.createElement('div');
        loadingEl.className = 'word-alt-popover-loading';
        loadingEl.textContent = 'Alternatifler yükleniyor...';
        popover.appendChild(loadingEl);

        document.body.appendChild(popover);
        positionPopoverNear(popover, targetEl);
        activeWordPopover = popover;

        // Şu an bir örnek belge açıksa ve o örneğin word_alternatives'inde
        // bu kelime için statik veri varsa (tam string eşleşmesi, büyük/
        // küçük harf duyarsız), API'ye hiç gitmeden doğrudan onu göster.
        const sampleWordAlternatives = state.activeSampleKey
            ? sampleDatabase[state.activeSampleKey]?.word_alternatives
            : null;
        const sampleWordKey = sampleWordAlternatives
            ? Object.keys(sampleWordAlternatives).find(k => k.toLowerCase() === wordText.toLowerCase())
            : null;
        if (sampleWordKey) {
            renderWordAlternativesForm(popover, targetEl, sampleWordAlternatives[sampleWordKey]);
            positionPopoverNear(popover, targetEl);
            return;
        }

        let data = null;
        let errorMessage = '';

        try {
            const response = await fetchWithTimeout(
                'https://ottoman-text-ai.onrender.com/api/word-alternatives',
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        word: wordText,
                        sentence: sentenceText,
                        ocr_context: state.ocrText || '',
                        target_lang: field
                    })
                },
                30000
            );
            const json = await response.json();
            if (!response.ok || !json.success) {
                throw new Error(json.error || 'Alternatifler alınamadı.');
            }
            data = json;
        } catch (err) {
            errorMessage = err.message || 'Alternatifler alınamadı.';
        }

        // Bu arada kart kapatıldıysa ya da başka bir kelime için yeniden
        // açıldıysa, bu cevabı artık hiçbir yere yazma.
        if (myToken !== wordPopoverToken || activeWordPopover !== popover) return;

        if (!data) {
            loadingEl.textContent = errorMessage;
            loadingEl.classList.add('word-alt-popover-error');
            return;
        }

        renderWordAlternativesForm(popover, targetEl, data);
        positionPopoverNear(popover, targetEl);
    }

    function renderWordAlternativesForm(popover, targetEl, data) {
        popover.innerHTML = '';

        const wordEl = document.createElement('div');
        wordEl.className = 'word-alt-popover-word';
        wordEl.textContent = targetEl.textContent;
        popover.appendChild(wordEl);

        if (data.ocr_form) {
            const ocrEl = document.createElement('div');
            ocrEl.className = 'word-alt-popover-ocr';
            ocrEl.dir = 'rtl';
            ocrEl.lang = 'ota';
            ocrEl.textContent = data.ocr_form;
            popover.appendChild(ocrEl);
        }

        if (data.origin) {
            const originEl = document.createElement('div');
            originEl.className = 'word-alt-popover-origin';
            originEl.textContent = data.origin;
            popover.appendChild(originEl);
        }

        // Backend (word_alternatives.py) her alternatif için zaten bir
        // confidence_percent (0-100) üretiyor — alternative_details bunu
        // taşır. Eski/beklenmedik bir yanıt şekli gelirse (alternative_details
        // yoksa) düz data.alternatives'e (confidence'sız) geri düşülür,
        // kart yine de boş kalmaz.
        const alternativeDetails = (Array.isArray(data.alternative_details) ? data.alternative_details : [])
            .map(item => ({
                text: (item && typeof item.text === 'string' ? item.text : '').trim(),
                confidencePercent: item && Number.isFinite(item.confidence_percent)
                    ? item.confidence_percent
                    : null,
            }))
            .filter(item => item.text)
            .slice(0, 3);

        const alternatives = alternativeDetails.length
            ? alternativeDetails
            : (Array.isArray(data.alternatives) ? data.alternatives : [])
                .map(item => (typeof item === 'string' ? item : (item && item.text) || ''))
                .map(text => text.trim())
                .filter(Boolean)
                .slice(0, 3)
                .map(text => ({ text, confidencePercent: null }));

        const form = document.createElement('form');
        form.className = 'word-alt-popover-form';

        const radioName = `word-alt-choice-${Date.now()}`;

        alternatives.forEach((option, i) => {
            const label = document.createElement('label');
            label.className = 'word-alt-option';

            const radio = document.createElement('input');
            radio.type = 'radio';
            radio.name = radioName;
            radio.value = option.text;
            if (i === 0) radio.checked = true;
            label.appendChild(radio);

            const span = document.createElement('span');
            span.textContent = option.text;
            label.appendChild(span);

            if (option.confidencePercent !== null) {
                const confEl = document.createElement('span');
                confEl.className = 'word-alt-confidence';
                confEl.textContent = `%${option.confidencePercent}`;
                label.appendChild(confEl);
            }

            form.appendChild(label);
        });

        const customLabel = document.createElement('label');
        customLabel.className = 'word-alt-option word-alt-option-custom';

        const customRadio = document.createElement('input');
        customRadio.type = 'radio';
        customRadio.name = radioName;
        customRadio.value = '';
        if (alternatives.length === 0) customRadio.checked = true;
        customLabel.appendChild(customRadio);

        const customInput = document.createElement('input');
        customInput.type = 'text';
        customInput.className = 'word-alt-custom-input';
        customInput.placeholder = 'Kendi okumanızı yazın...';
        customInput.addEventListener('focus', () => { customRadio.checked = true; });
        customLabel.appendChild(customInput);

        form.appendChild(customLabel);

        const confirmBtn = document.createElement('button');
        confirmBtn.type = 'submit';
        confirmBtn.className = 'word-alt-confirm-btn';
        confirmBtn.textContent = 'Bu seçimi onayla';
        form.appendChild(confirmBtn);

        form.addEventListener('submit', (e) => {
            e.preventDefault();

            const checked = form.querySelector(`input[name="${radioName}"]:checked`);
            const chosen = (checked === customRadio ? customInput.value : (checked ? checked.value : '')).trim();
            if (!chosen) return;

            targetEl.textContent = chosen;
            saveWordCorrection(state.documentId, targetEl.dataset.wordField, targetEl.dataset.wordIdx, chosen);
            closeWordAlternativesPopover();
        });

        popover.appendChild(form);
    }

    // Kelime alternatifi kartı (.uncertain-word) her üç kolonda (ocr/translit/
    // trans) da aynı şekilde tetiklenir — hangi kolonda tıklandığı targetEl'in
    // data-word-field'ından ('ocr'/'translit'/'trans') anlaşılır, o field
    // showWordAlternativesPopover içinde hem /api/word-alternatives isteğine
    // target_lang olarak hem de saveWordCorrection/applyStoredWordCorrections'a
    // ayırt edici anahtar olarak gider — kolonlar birbirini ezmez.
    [ocrTextDisplay, translitTextDisplay, transTextDisplay].forEach(displayEl => {
        displayEl.addEventListener('click', (e) => {
            const wordEl = e.target.closest('.uncertain-word');
            if (!wordEl) return;
            e.stopPropagation();
            showWordAlternativesPopover(wordEl);
        });
    });

    document.addEventListener('click', (e) => {
        if (!activeWordPopover) return;
        if (activeWordPopover.contains(e.target) || e.target.closest('.uncertain-word')) return;
        closeWordAlternativesPopover();
    });

    function copyToClipboard(text, msg) {
        navigator.clipboard.writeText(text).then(() => {
            alert(msg);
        });
    }

    // Text To Speech
    // Üç sekme de (Osmanlıca Metin grubu, Türkçe Çeviri, İngilizce Çeviri)
    // aynı speakText()/handleTtsToggle() altyapısını, sadece dil/metin/
    // buton parametreleri farklı olacak şekilde paylaşır. Ana ses butonları
    // (ocrTtsBtn, translitTtsBtn, ttsBtn, enTtsBtn) 🔊 ↔ ⏸ ↔ ▶ arasında
    // duraklat/devam ettir davranışı gösterir; ayrı "Sesi Durdur" (⏹)
    // butonları (ocrStopTtsBtn, translitStopTtsBtn, transStopTtsBtn,
    // enStopTtsBtn) bu toggle mantığının tamamen DIŞINDADIR ve her zaman
    // tam durdurma yapar (bkz. stopSpeaking).

    // Uzun metinlerde tek bir SpeechSynthesisUtterance tarayıcılarda sessizce
    // başarısız olabiliyor (bilinen bir speechSynthesis kısıtı). Bunu önlemek
    // için metni cümlelere bölüp her cümleyi ayrı bir utterance olarak, bir
    // öncekinin bitişini (onend) bekleyerek sırayla okutuyoruz.
    //
    // Bölme SADECE gerçek noktalama işaretlerine (. ! ?) göre yapılır; satır
    // sonları (\n) cümle bitişi SAYILMAZ — bölmeden önce tüm \n'ler tek bir
    // boşluğa çevrilir, böylece satır kesmeleri sadece görsel bir birleştirme
    // noktası olur, okumada duraksama yaratmaz. Bu iskelet, ekrandaki cümle
    // span'lerini üreten partitionSentencesRaw() (yukarıda) ile birebir
    // aynıdır — ikisi de aynı sayıda/sırada cümle üretir, böylece highlight
    // her zaman doğru <span data-tts-idx>'e denk gelir.
    function splitIntoSentences(text) {
        const normalized = text.replace(/\n+/g, ' ');
        const pieces = normalized.split(/([.!?]+)/);
        const sentences = [];
        let current = '';
        for (const piece of pieces) {
            current += piece;
            if (/[.!?]/.test(piece)) {
                const trimmed = current.trim();
                if (trimmed) sentences.push(trimmed);
                current = '';
            }
        }
        const trimmedRest = current.trim();
        if (trimmedRest) sentences.push(trimmedRest);
        return sentences.length > 0 ? sentences : (text.trim() ? [text.trim()] : []);
    }

    // Her speakText() çağrısına ait zincirin kimliği. window.speechSynthesis
    // .cancel() çağrıldığında tarayıcı, o an konuşmakta/kuyrukta olan
    // utterance için "error" (canceled/interrupted) olayını tetikleyebilir —
    // bu da onerror handler'ımız üzerinden ESKİ zincirin speakNext()'ini
    // tekrar tetikleyip, az önce cancel() ile durdurulmuş metni YENİ
    // başlayan okumayla aynı anda/iç içe okutmaya devam ettirebiliyordu.
    // Sonuç: bazı cümleler iki kez (eski zincirin kalanı + yeni zincirin
    // baştan okuması) duyulabiliyordu. ttsPlaybackId, her speakText()
    // çağrısını bir öncekinden ayırt ederek eski zincirin artık geçersiz
    // sayılıp sessizce durmasını sağlıyor.
    let ttsPlaybackId = 0;
    // 'osmanli' | 'trans' | 'en' — o an okuyan/duraklatılmış olan kanal.
    // Osmanlıca grubu (ocrTtsBtn + translitTtsBtn) TEK bir kanalı paylaşır,
    // ikisinin ikonu da birlikte güncellenir.
    let ttsActiveChannel = null;
    let ttsState = 'idle'; // 'idle' | 'speaking' | 'paused'

    function setTtsIcon(buttons, icon) {
        buttons.forEach(btn => { if (btn) btn.textContent = icon; });
    }

    // O an vurgulanan tek kelimeyi saran <mark class="tts-word-active">
    // elemanı (bkz. highlightWordInDisplay). Cümle vurgusunun (CSS class,
    // hep var olan span üzerine eklenip çıkarılıyor) aksine kelime vurgusu
    // DOM'a dinamik olarak eklenen bir eleman olduğu için, bir önceki
    // kelimeyi "unwrap" edip orijinal metin düğümüne geri döndürmemiz
    // gerekiyor — clearWordHighlight bunu yapar.
    let currentWordMark = null;

    function clearWordHighlight() {
        if (currentWordMark && currentWordMark.parentNode) {
            const parent = currentWordMark.parentNode;
            parent.replaceChild(document.createTextNode(currentWordMark.textContent), currentWordMark);
            parent.normalize();
        }
        currentWordMark = null;
    }

    // Tüm ana ses butonlarını 🔊'e sıfırlar ve ekrandaki cümle vurgularını
    // temizler. "Sesi Durdur" butonlarına VE bir okuma zinciri sonuna
    // gelindiğinde çağrılır.
    function resetAllTtsUi() {
        setTtsIcon([ocrTtsBtn, translitTtsBtn, ttsBtn, enTtsBtn], '🔊');
        document.querySelectorAll('.tts-sentence-active').forEach(el => el.classList.remove('tts-sentence-active'));
        clearWordHighlight();
        ttsActiveChannel = null;
        ttsState = 'idle';
    }

    function highlightSentence(displays, idx) {
        document.querySelectorAll('.tts-sentence-active').forEach(el => el.classList.remove('tts-sentence-active'));
        clearWordHighlight();
        displays.forEach(displayEl => {
            if (!displayEl) return;
            const span = displayEl.querySelector(`.tts-sentence[data-tts-idx="${idx}"]`);
            if (span) {
                span.classList.add('tts-sentence-active');
                span.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        });
    }

    // utterance'a giden düz metindeki charIndex'in (speechSynthesis'in
    // word-boundary event'iyle verdiği, o an başlayan kelimenin metin
    // içindeki karakter konumu) hangi kelimeye denk geldiğini bulur.
    // Kelimeler \S+ ile ayrılır (Latin ve Arap harfli metinde de kelimeler
    // boşlukla ayrılır). match.index <= charIndex olan SON kelime, o an
    // seslendirilen kelimedir. Eşleşen kelime yoksa -1 döner.
    function wordIndexAtCharIndex(text, charIndex) {
        const wordRe = /\S+/g;
        let match;
        let result = -1;
        let idx = 0;
        while ((match = wordRe.exec(text))) {
            if (match.index <= charIndex) {
                result = idx;
            } else {
                break;
            }
            idx++;
        }
        return result;
    }

    // Belirtilen displayEl içindeki idx'inci .tts-sentence span'ının metin
    // düğümlerini (TreeWalker ile) sırayla gezip, wordIndex'inci \S+
    // eşleşmesini bulur ve bir <mark class="tts-word-active"> ile sarar.
    // "Basit yaklaşım": eşleştirme SADECE düz metin/kelime sayımına göre
    // yapılır — span içinde entity/tahmin (**...**) gibi iç içe HTML olsa
    // bile, o HTML'in İÇİNDEKİ metin düğümü de walker tarafından normal
    // şekilde gezilir, yani kelime en yakın metin düğümünde vurgulanır.
    // Tüm DOM işlemleri (özellikle Range.surroundContents) try/catch ile
    // sarılı: bir DOMException (ör. beklenmedik bir iç içe HTML yapısı
    // yüzünden) burada fırlarsa, hatayı yutup sadece loglarız — kelime
    // vurgusunun başarısız olması, çağıran kodun (speakNext/highlightSentence
    // zinciri, genel TTS akışı) geri kalanını ASLA engellememeli.
    function highlightWordInDisplay(displayEl, sentenceIdx, wordIndex) {
        try {
            clearWordHighlight();
            if (!displayEl || wordIndex < 0) return;

            const sentenceSpan = displayEl.querySelector(`.tts-sentence[data-tts-idx="${sentenceIdx}"]`);
            if (!sentenceSpan) return;

            const walker = document.createTreeWalker(sentenceSpan, NodeFilter.SHOW_TEXT);
            const wordRe = /\S+/g;
            let seenWords = 0;
            let node;

            while ((node = walker.nextNode())) {
                wordRe.lastIndex = 0;
                const text = node.textContent;
                let match;
                while ((match = wordRe.exec(text))) {
                    if (seenWords === wordIndex) {
                        const range = document.createRange();
                        range.setStart(node, match.index);
                        range.setEnd(node, match.index + match[0].length);
                        const mark = document.createElement('mark');
                        mark.className = 'tts-word-active';
                        range.surroundContents(mark);
                        currentWordMark = mark;
                        mark.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                        return;
                    }
                    seenWords++;
                }
            }
        } catch (error) {
            console.warn(
                `[TTS] word highlight failed: sentenceIdx=${sentenceIdx} wordIndex=${wordIndex}`,
                error
            );
        }
    }

    // text: okunacak düz metin (\n içerebilir, splitIntoSentences içinde
    // normalize edilir). channelKey/buttons: bu okumanın ait olduğu ana ses
    // butonu/butonları (ikon burada güncellenir — osmanlı grubunda ikisi
    // birden). displays: cümle vurgusunun uygulandığı eleman(lar) (osmanlı
    // kanalında ocr + translit birlikte). wordHighlightDisplay: kelime
    // vurgusunun uygulandığı TEK eleman — verilmezse displays[0] kullanılır.
    // Osmanlı kanalında bilerek translitTextDisplay'e sabitlenir (bkz. çağrı
    // noktası), çünkü charIndex, TTS'e giden translit metnine göre hesaplanır
    // ve ocr (Arap harfli) metinle kelime sayısı/sırası birebir örtüşmez.
    function speakText(text, { lang = 'tr-TR', displays = [], buttons = [], channelKey = null, wordHighlightDisplay = null } = {}) {
        if (!text) return;
        if (!('speechSynthesis' in window)) {
            alert('Tarayıcınız sesli okuma özelliğini desteklemiyor.');
            return;
        }

        // Sıra kritik: id'yi cancel()'dan ÖNCE artırıyoruz, çünkü cancel()
        // eski utterance'ın onerror'unu SENKRON tetikleyebilir — id daha
        // sonra artırılsaydı, o senkron çağrı anında eski zincir hâlâ
        // "güncel" görünüp devam ederdi.
        const myPlaybackId = ++ttsPlaybackId;
        window.speechSynthesis.cancel();
        resetAllTtsUi();

        const sentences = splitIntoSentences(text);
        const wordDisplay = wordHighlightDisplay || displays[0] || null;
        let index = 0;

        ttsState = 'speaking';
        ttsActiveChannel = channelKey;
        setTtsIcon(buttons, '⏸');

        function speakNext() {
            // Bu zincir, aradan başka bir speakText() çağrısı yapılarak
            // (cancel() ile) geçersiz kılınmışsa burada dur.
            if (myPlaybackId !== ttsPlaybackId) return;
            if (index >= sentences.length) {
                resetAllTtsUi();
                return;
            }

            const currentIdx = index;
            const currentSentenceText = sentences[currentIdx];
            highlightSentence(displays, currentIdx);

            const utterance = new SpeechSynthesisUtterance(currentSentenceText);
            utterance.lang = lang;
            // Osmanlıca (ocr+translit, channelKey 'osmanli') kanalı Arap
            // harfli/eski yazım kökenli kelimeler içerdiği için diğer
            // kanallardan (trans/en, 0.9'da kalır) biraz daha yavaş okunur.
            utterance.rate = (channelKey === 'osmanli') ? 0.8 : 0.9;
            index++;

            // Kelime seviyesi vurgu: SADECE ses/tarayıcı word-boundary
            // event'i verirse çalışır (ek bir katman). event.name
            // 'sentence' gelirse veya onboundary hiç ateşlenmezse hiçbir
            // şey yapılmaz — mevcut cümle-bazlı highlight (yukarıdaki
            // highlightSentence çağrısı) zaten devrede olduğu için otomatik
            // olarak ona geri düşülmüş olur.
            utterance.onboundary = (event) => {
                if (myPlaybackId !== ttsPlaybackId) return;
                if (event.name && event.name !== 'word') return;
                // Stale/geç gelen event koruması: bazı seslerde bir
                // utterance biterken fazladan/geç bir word-boundary event'i
                // ateşlenebiliyor. Bu ESKİ event, artık aktif olmayan bir
                // cümle için currentIdx/currentSentenceText'e (closure'dan)
                // hâlâ erişebildiğinden, kontrolsüz bırakılırsa YENİ
                // (o an gerçekten aktif) cümlenin kelime vurgusunu silip
                // yerine ESKİ cümlede yanlış bir vurgu koyabilir. Bunu
                // önlemek için, bu utterance'ın cümlesi hâlâ ekranda
                // .tts-sentence-active olarak işaretli DEĞİLSE (yani
                // highlightSentence() çoktan bir sonraki cümleye geçmişse)
                // sessizce çık.
                const activeSpan = wordDisplay && wordDisplay.querySelector('.tts-sentence-active');
                if (!activeSpan || activeSpan.getAttribute('data-tts-idx') !== String(currentIdx)) return;
                const wIdx = wordIndexAtCharIndex(currentSentenceText, event.charIndex);
                highlightWordInDisplay(wordDisplay, currentIdx, wIdx);
            };

            // Bazı tarayıcılarda tek bir utterance için hem onend hem
            // onerror ateşlenebiliyor; bu koruma speakNext()'in aynı
            // utterance için yalnızca BİR kez tetiklenmesini garanti eder.
            let advanced = false;
            const advanceOnce = () => {
                if (advanced) return;
                advanced = true;
                if (myPlaybackId !== ttsPlaybackId) return;
                // Cümleler arasında kısa, doğal bir bekleme.
                setTimeout(() => {
                    if (myPlaybackId !== ttsPlaybackId) return;
                    speakNext();
                }, 180);
            };
            utterance.onend = advanceOnce;
            utterance.onerror = advanceOnce;

            window.speechSynthesis.speak(utterance);
        }

        speakNext();
    }

    // Konuşmayı hemen durdurur ve zinciri geçersiz kılar (bkz. ttsPlaybackId
    // yorumu yukarıda) — "Sesi Durdur" (⏹) butonlarına basıldığında, henüz
    // sırada bekleyen cümlelerin çalmaya devam etmesini engeller ve tüm ana
    // ses butonlarını/highlight'ı sıfırlar. Bu davranış ana ses butonlarının
    // duraklat/devam ettir toggle'ından TAMAMEN AYRIDIR ve değişmez.
    function stopSpeaking() {
        ttsPlaybackId++;
        window.speechSynthesis.cancel();
        resetAllTtsUi();
    }

    // Yeni bir belge seçildiğinde/işlenmeye başlarken önceki okumanın
    // kesintisiz durmasını garanti eder — iki farklı belgenin sesi asla üst
    // üste binmemeli (bkz. handleFileSelect / processTranslation).
    function hardStopTts() {
        if (ttsState !== 'idle') stopSpeaking();
    }

    // Ana ses butonları için ortak toggle mantığı: metin yoksa uyarı verir;
    // bu kanal zaten okuyorsa duraklatır, duraklatılmışsa kaldığı yerden
    // devam ettirir; başka bir kanal aktifse (ya da hiç okuma yoksa) eski
    // okumayı tamamen durdurup yenisini baştan başlatır — asla iki ses
    // üst üste binmez.
    function handleTtsToggle({ getText, lang, displays, buttons, channelKey, emptyMessage, wordHighlightDisplay }) {
        if (ttsActiveChannel === channelKey && ttsState === 'speaking') {
            window.speechSynthesis.pause();
            ttsState = 'paused';
            setTtsIcon(buttons, '▶');
            return;
        }
        if (ttsActiveChannel === channelKey && ttsState === 'paused') {
            window.speechSynthesis.resume();
            ttsState = 'speaking';
            setTtsIcon(buttons, '⏸');
            return;
        }

        const text = getText();
        if (!text) {
            alert(emptyMessage);
            return;
        }
        speakText(text, { lang, displays, buttons, channelKey, wordHighlightDisplay });
    }

    ttsBtn.addEventListener('click', () => handleTtsToggle({
        getText: () => expandAbbreviationsForTts(transTextDisplay.textContent).normalize('NFC').replace(/[\u0300-\u036f]/g, ''),
        lang: 'tr-TR',
        displays: [transTextDisplay],
        buttons: [ttsBtn],
        channelKey: 'trans',
        emptyMessage: 'Bu belge için sesli okuma verisi bulunamadı.'
    }));
    transStopTtsBtn.addEventListener('click', stopSpeaking);

    // Osmanlıca transliterasyonuna özgü diyakritikli harfleri (ḳ, ġ, ā, ḥ,
    // ṣ, ṭ, ñ vb.) TTS motorunun tanıyabildiği düz Türkçe harflere çevirir.
    // Standart Türkçe harfler (ü, ö, ç, ş, ı, İ) dokunulmadan kalır. Bu
    // sadece TTS'e giden metni etkiler, ekranda hiçbir şey değişmez.
    // Ekranda "Hz." ve "s.a.v." aynen görünmeye devam eder — bu sadece
    // TTS'e giden metni etkiler. Cümle bölme (splitIntoSentences/
    // partitionSentencesRaw) "." işaretini cümle sonu sayıyor; "Hz." ve
    // "s.a.v." içindeki noktalar bu yüzden gereksiz duraksamalara yol
    // açıyordu. Üç TTS kanalının (trans, osmanli, en) PAYLAŞTIĞI tek
    // nokta burası — her kanalın kendi normalize/diyakritik temizliğinden
    // ÖNCE çağrılarak, nokta içeren kısaltmalar cümle bölünmeden önce
    // noktasız karşılıklarına dönüştürülmüş olur.
    function expandAbbreviationsForTts(text) {
        if (!text) return text;
        return text
            .replace(/\bs\.a\.v\.\s*/gi, 'sallallahu aleyhi ve sellem ')
            .replace(/\bHz\.\s*/gi, 'Hazreti ');
    }

    function cleanTranslitForTts(text) {
        if (!text) return text;
        text = expandAbbreviationsForTts(text);
        // â/û/î gibi harflerin NFD (ayrışık: harf + birleştirici işaret)
        // biçiminde gelip TTS motoru tarafından sessizce atlanma
        // ihtimaline karşı önce NFC'ye normalize edilir. Ardından, modelin
        // bazen ürettiği anormal/fazladan kombinleyici işaretleri (normal
        // bir NFD ayrışması değil, örn. zaten precomposed bir harfin
        // üzerine binen fazladan işaret) tamamen kaldırır — precomposed
        // karakterlere (ā, ī vb.) dokunmaz, çünkü onlar kombinleyici işaret
        // İÇERMEZ.
        text = text.normalize('NFC').replace(/[\u0300-\u036f]/g, '');
        const diacriticMap = {
            'ā': 'a', 'Ā': 'A',
            'ḳ': 'k', 'Ḳ': 'K',
            'ġ': 'ğ', 'Ġ': 'Ğ',
            'ḥ': 'h', 'Ḥ': 'H',
            'ḫ': 'h', 'Ḫ': 'H',
            'ṣ': 's', 'Ṣ': 'S',
            'ṭ': 't', 'Ṭ': 'T',
            'ñ': 'n', 'Ñ': 'N',
            'ū': 'u', 'Ū': 'U',
            'ī': 'i', 'Ī': 'İ',
            'ż': 'z', 'Ż': 'Z',
            'ḍ': 'd', 'Ḍ': 'D',
            'ʿ': '', 'ʾ': '', 'ʻ': '', 'ʼ': ''
        };
        text = text.replace(/[āĀḳḲġĠḥḤḫḪṣṢṭṬñÑūŪīĪżŻḍḌʿʾʻʼ]/g, (ch) => diacriticMap[ch] ?? ch);
        // GEÇİCİ TEŞHİS LOGU — â/û/î sessizliği sorununu teşhis etmek için,
        // kalıcı değil, sorun bulunduktan sonra kaldırılacak.
        console.log('[TTS DEBUG] cleaned text:', JSON.stringify(text), [...text].map(c => c.codePointAt(0).toString(16)));
        return text;
    }

    // Osmanlıca (Arap harfli) metin doğrudan seslendirilemediği için, hem
    // "Transkript" sekmesindeki Arapça harfli görünümün hem de Türkçe
    // harfli (okunuş) görünümün sesli oku butonu aynı temizlenmiş okunuş
    // metnini, AYNI paylaşılan 'osmanli' kanalı üzerinden kullanır —
    // kullanıcı hangi yazıyı görüntülüyorsa görüntülesin sesli dinleyebilir
    // ve iki butonun ikonu (🔊/⏸/▶) her zaman birlikte güncellenir; hangi
    // panel görünürse görünsün highlight ilgili panelde uygulanır.
    function handleOsmanliTtsToggle() {
        handleTtsToggle({
            getText: () => cleanTranslitForTts(state.translitText),
            lang: 'tr-TR',
            displays: [ocrTextDisplay, translitTextDisplay],
            buttons: [ocrTtsBtn, translitTtsBtn],
            channelKey: 'osmanli',
            emptyMessage: 'Bu belge için sesli okuma verisi bulunamadı.',
            // charIndex, TTS'e giden translit metnine göre hesaplanıyor;
            // ocr (Arap harfli) metinle kelime sayısı/sırası birebir
            // örtüşmediği için kelime vurgusu SADECE translit panelinde
            // uygulanır (ocr panelinde mevcut cümle-bazlı vurgu kalır).
            wordHighlightDisplay: translitTextDisplay
        });
    }

    ocrTtsBtn.addEventListener('click', handleOsmanliTtsToggle);
    translitTtsBtn.addEventListener('click', handleOsmanliTtsToggle);
    ocrStopTtsBtn.addEventListener('click', stopSpeaking);
    translitStopTtsBtn.addEventListener('click', stopSpeaking);

    // İngilizce çeviri sekmesi — o belgede İngilizce çeviri yoksa (state
    // boşsa) diğer iki dilden bağımsız, ayrı bir uyarı gösterir (bkz.
    // handleTtsToggle'daki emptyMessage kontrolü).
    enTtsBtn.addEventListener('click', () => handleTtsToggle({
        getText: () => expandAbbreviationsForTts(enTextDisplay.textContent).normalize('NFC').replace(/[\u0300-\u036f]/g, ''),
        lang: 'en-US',
        displays: [enTextDisplay],
        buttons: [enTtsBtn],
        channelKey: 'en',
        emptyMessage: 'Bu belge için İngilizce çeviri bulunamadı.'
    }));
    enStopTtsBtn.addEventListener('click', stopSpeaking);

    // Download Report
    downloadReportBtn.addEventListener('click', () => {
        const content = `================================================
DIVANE - BELGE RAPORU
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
        a.download = `Divane_Rapor_${Date.now()}.txt`;
        a.click();
    });

    // --- Belgelerim (backend.py: /api/documents, /api/documents/<id>/analyze,
    // /api/translations/save) — giriş yapılmadan görüntülenemez/kaydedilmez. ---

    // Bir çeviri tamamlandığında (yalnızca gerçek yüklemeler için — örnek
    // kartlar ve "Belgelerim"den yeniden açılan kayıtlı çeviriler bu
    // fonksiyonu hiç çağırmaz), giriş yapmış kullanıcının hesabına best
    // effort olarak kaydeder. Kullanıcıyı bekletmemek için await edilmez;
    // başarısız olursa sessizce konsola loglanır.
    //
    // overwriteDocumentId/forceNew: backend aynı kullanıcının aynı görseli
    // (byte-birebir, SHA-256 ile) daha önce kaydettiğini tespit ederse 409
    // + {duplicate:true, existing_document_id, existing_title,
    // existing_uploaded_at} döner (bkz. backend.py save_translation). Bu
    // durumda kullanıcıya basit bir confirm() ile sorulur; "Tamam" =
    // üzerine yaz (aynı isteği overwrite_document_id ile tekrar atar),
    // "İptal" = yeni kayıt (aynı isteği force_new=true ile tekrar atar,
    // backend hash kontrolünü bir daha yapmaz). Her iki tekrar deneme de
    // bu fonksiyonun kendisini çağırır, sonsuz döngü riski yok çünkü ikinci
    // istek artık 409 dönmeyecek şekilde işaretli.
    async function saveTranslationToBackend(resultData, imageBlob, overwriteDocumentId, forceNew) {
        if (!imageBlob || !resultData) return;
        try {
            const formData = new FormData();
            formData.append('image', imageBlob, 'enhanced.png');
            formData.append('result', JSON.stringify(resultData));
            if (state.originalFileHash) {
                formData.append('file_hash', state.originalFileHash);
            }
            if (overwriteDocumentId) {
                formData.append('overwrite_document_id', String(overwriteDocumentId));
            } else if (forceNew) {
                formData.append('force_new', 'true');
            }

            const res = await fetchWithTimeout(`${API_BASE_URL}/api/translations/save`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${state.authToken}` },
                body: formData
            }, 30000);

            const data = await res.json().catch(() => ({}));

            if (res.status === 409 && data.duplicate) {
                const existingLabel = data.existing_title || 'Adsız belge';
                const existingDate = data.existing_uploaded_at
                    ? new Date(data.existing_uploaded_at).toLocaleString('tr-TR')
                    : '';
                const wantsOverwrite = confirm(
                    `Bu belge zaten kayıtlı görünüyor: "${existingLabel}"${existingDate ? ` (${existingDate})` : ''}.\n\n` +
                    `Üzerine yazmak için Tamam'a, yeni bir kayıt olarak eklemek için İptal'e basın.`
                );
                if (wantsOverwrite) {
                    await saveTranslationToBackend(resultData, imageBlob, data.existing_document_id, false);
                } else {
                    await saveTranslationToBackend(resultData, imageBlob, null, true);
                }
                return;
            }

            if (!res.ok) {
                console.warn(
                    'Çeviri veritabanına kaydedilemedi:',
                    data.error || res.status
                );
                return;
            }

            state.dbDocumentId = data.document_id || null;

            if (state.dbDocumentId) {
                localStorage.setItem(
                    'active_document_id',
                    String(state.dbDocumentId)
                );
            }
            console.log(
                '[DOCUMENT SAVE] DB document id:',
                state.dbDocumentId
            );

            statusMessage.textContent =
                (statusMessage.textContent || '') +
                ' (Belgelerime kaydedildi)';
        } catch (err) {
            console.warn('Çeviri veritabanına kaydedilemedi:', err);
        }
    }

       async function addAiResultToNotes(
    noteText,
    sourceType = 'manual'
) {
    const content = String(noteText || '').trim();

    if (!content) {
        alert('Eklenecek not içeriği bulunamadı.');
        return false;
    }

    // -----------------------------
    // GİRİŞ YAPMAMIŞ KULLANICI
    // -----------------------------
    // Not oluşturma girişle korunur (misafir modu kaldırıldı, bkz.
    // notes.js) — burada da aynı kurala uyuluyor.
    if (!state.authToken) {
        alert('Not eklemek için giriş yapmalısınız.');
        return false;
    }

    // -----------------------------
    // GİRİŞ YAPMIŞ KULLANICI
    // -----------------------------
    if (!state.dbDocumentId) {
        alert(
            'Belge henüz hesabınıza kaydedilmedi. ' +
            'Lütfen birkaç saniye sonra tekrar deneyin.'
        );

        return false;
    }

    try {
        const response = await fetchWithTimeout(
            `${API_BASE_URL}/api/documents/${state.dbDocumentId}/notes`,
            {
                method: 'POST',
                headers: {
                    'Content-Type':
                        'application/json',

                    'Authorization':
                        `Bearer ${state.authToken}`
                },

                body: JSON.stringify({
                    content:
                        content,

                    source_type:
                        sourceType
                })
            },
            30000
        );

        const data = await response
            .json()
            .catch(() => ({}));

        if (!response.ok) {
            throw new Error(
                data.error ||
                'Not kaydedilemedi.'
            );
        }

        return true;

    } catch (error) {
        console.error(
            '[NOTES]',
            error
        );

        alert(
            'Not kaydedilemedi: ' +
            error.message
        );

        return false;
    }
}

    function attachNoteAction(
    card,
    item,
    sourceType
) {
    if (
        !item ||
        item.note_suitable !== true ||
        !String(item.note_text || '').trim()
    ) {
        return;
    }

    card.classList.add('ai-note-enabled');

    const noteAction = document.createElement('span');
    noteAction.className = 'ai-note-action';
    noteAction.textContent = '＋ Notlarıma Ekle';

    noteAction.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();

        if (noteAction.dataset.saving === 'true') {
            return;
        }

        noteAction.dataset.saving = 'true';

        const oldText = noteAction.textContent;
        noteAction.textContent = 'Ekleniyor...';

        const success = await addAiResultToNotes(
            item.note_text,
            sourceType
        );

        if (success) {
            noteAction.textContent = '✓ Notlarıma Eklendi';
            noteAction.classList.add('saved');

            setTimeout(() => {
                noteAction.textContent = 'Notlarıma Git →';
                noteAction.classList.add('go-to-notes');
            }, 1000);

            noteAction.onclick = (event) => {
                event.preventDefault();
                event.stopPropagation();
           
            localStorage.setItem(
                'divane_translation_state',
                JSON.stringify({
                    dbDocumentId: state.dbDocumentId,
                    ocrText: state.ocrText,
                    translitText: state.translitText,
                    transText: state.transText,
                    transTextEn: state.transTextEn,
                    lastAnalysis: state.lastAnalysis,
                    activeEntityFilterType: activeEntityFilterType
                })
            );

            window.location.href = 'notes.html';
            };

        } else {
            noteAction.textContent = oldText;
            noteAction.dataset.saving = 'false';
        }
    });

    card.appendChild(noteAction);
}
    // --- Sol Menü Çekmecesi ---
    // Sol üstteki hamburger butonuna tıklayınca soldan kayarak açılır ve
    // arkasındaki sayfa #sideDrawerOverlay ile karartılır (ekip
    // arkadaşlarının istediği tıkla-aç/kapa modeli). İçindeki
    // .side-drawer-item butonları zaten data-modal taşıdığı için aşağıdaki
    // genel [data-modal] kablolaması onları da açar — burada sadece
    // çekmeceyi açma/kapama ve bir öğeye tıklanınca kendini kapatma
    // davranışı ekleniyor.
    // İlk ziyarette hamburger'ın üzerinde küçük bir nabız noktası gösterip
    // menüyü fark ettiriyor; çekmece bir kere açılınca kalıcı olarak
    // kayboluyor (localStorage'da işaretlenir, tekrar gösterilmez).
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

    document.querySelectorAll('.side-drawer-item').forEach(item => {
        item.addEventListener('click', closeSideDrawer);
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

                if (!state.authToken) {
                    navSearchResults.innerHTML = dictHtml || `<p class="nav-search-empty">Eşleşen kelime bulunamadı. Belgelerinizde aramak için giriş yapmalısınız.</p>`;
                    return;
                }
                try {
                    const res = await fetch(`${API_BASE_URL}/api/documents?per_page=4&q=${encodeURIComponent(query)}`, {
                        headers: { 'Authorization': `Bearer ${state.authToken}` }
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

    // --- Modal Management ---
    document.querySelectorAll('[data-modal]').forEach(trigger => {
        trigger.addEventListener('click', (e) => {
            e.preventDefault();
            const modalId = trigger.getAttribute('data-modal');
            const targetModal = document.getElementById(modalId);
            if (targetModal) {
                targetModal.classList.remove('hidden');
                if (modalId === 'authModal') updateAuthUI();
            }
        });
    });

    document.querySelectorAll('[data-close]').forEach(btn => {
        btn.addEventListener('click', () => {
            const modalId = btn.getAttribute('data-close');
            document.getElementById(modalId)?.classList.add('hidden');
        });
    });

    // Close modal on backdrop click
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.classList.add('hidden');
        });
    });

    // --- Hesap: Giriş / Kayıt / Çıkış (backend.py'deki /api/auth/*) ---
    function setAuthTab(tab) {
        document.querySelectorAll('#authTabs [data-auth-tab]').forEach(b => {
            b.classList.toggle('active', b.getAttribute('data-auth-tab') === tab);
        });
        loginForm.classList.toggle('hidden', tab !== 'login');
        registerForm.classList.toggle('hidden', tab !== 'register');
        clearAuthError();
    }

    function showAuthError(message) {
        authError.textContent = message;
        authError.classList.remove('hidden');
    }

    function clearAuthError() {
        authError.textContent = '';
        authError.classList.add('hidden');
    }

    // Modal her açıldığında ve oturum durumu her değiştiğinde çağrılır;
    // giriş yapılmışsa hesap bilgisini, yapılmamışsa giriş/kayıt formlarını
    // gösterir.
    function updateAuthUI() {
        const loggedIn = !!state.authToken;
        authLoggedOutView.classList.toggle('hidden', loggedIn);
        authLoggedInView.classList.toggle('hidden', !loggedIn);
        profileBtn.classList.toggle('is-authenticated', loggedIn);
        profileBtn.title = loggedIn ? 'Çıkış Yap' : 'Giriş Yap';

        if (loggedIn) {
            authUserEmail.textContent = state.authEmail || '';
        } else {
            setAuthTab('login');
        }
    }

    function setAuthSession(token, email) {
        state.authToken = token;
        state.authEmail = email;
        localStorage.setItem('auth_token', token);
        localStorage.setItem('auth_email', email);

        updateAuthUI();
    }

    function promptProfileCompletion() {
        profilePromptModal.classList.remove('hidden');
    }

    function clearAuthSession() {
        state.authToken = null;
        state.authEmail = null;
        localStorage.removeItem('auth_token');
        localStorage.removeItem('auth_email');
        updateAuthUI();
    }

    // Sayfa ilk açıldığında navbar'daki profil ikonunun rengi/title'ı
    // (Giriş Yap / Çıkış Yap) modal hiç açılmadan da doğru görünsün diye.
    updateAuthUI();

    authTabs.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-auth-tab]');
        if (!btn) return;
        setAuthTab(btn.getAttribute('data-auth-tab'));
    });

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearAuthError();
        loginSubmitBtn.disabled = true;
        loginSubmitBtn.textContent = 'Giriş yapılıyor...';

        try {
            const res = await fetchWithTimeout(`${API_BASE_URL}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: loginEmail.value.trim(),
                    password: loginPassword.value
                })
            });
            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
                showAuthError(data.error || 'Giriş yapılamadı. Lütfen tekrar deneyin.');
                return;
            }

            setAuthSession(data.token, data.email);
            loginForm.reset();
            authModal.classList.add('hidden');
            promptProfileCompletion();
        } catch (err) {
            showAuthError(classifyTranslationError(err));
        } finally {
            loginSubmitBtn.disabled = false;
            loginSubmitBtn.textContent = 'Giriş Yap';
        }
    });

    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearAuthError();

        const fullName = registerFullName.value.trim();
        const email = registerEmail.value.trim();
        const password = registerPassword.value;

        if (password !== registerPasswordConfirm.value) {
            showAuthError('Şifreler eşleşmiyor.');
            return;
        }

        registerSubmitBtn.disabled = true;
        registerSubmitBtn.textContent = 'Kayıt olunuyor...';

        try {
            const res = await fetchWithTimeout(`${API_BASE_URL}/api/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password, full_name: fullName })
            });
            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
                showAuthError(data.error || 'Kayıt oluşturulamadı. Lütfen tekrar deneyin.');
                return;
            }

            // Kayıt başarılıysa kullanıcıyı ikinci kez bilgi girmeye
            // zorlamadan doğrudan giriş yaptırıyoruz.
            const loginRes = await fetchWithTimeout(`${API_BASE_URL}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            const loginData = await loginRes.json().catch(() => ({}));

            if (loginRes.ok) {
                setAuthSession(loginData.token, loginData.email);
                registerForm.reset();
                authModal.classList.add('hidden');
                promptProfileCompletion();
            } else {
                setAuthTab('login');
                loginEmail.value = email;
                showAuthError('Kaydınız oluşturuldu. Lütfen giriş yapın.');
            }
        } catch (err) {
            showAuthError(classifyTranslationError(err));
        } finally {
            registerSubmitBtn.disabled = false;
            registerSubmitBtn.textContent = 'Kayıt Ol';
        }
    });

    const contactForm = document.getElementById('contactForm');
    if (contactForm) {
        const contactSubmitBtn = contactForm.querySelector('button[type="submit"]');
        contactForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const name = document.getElementById('contactName').value.trim();
            const email = document.getElementById('contactEmail').value.trim();
            const message = document.getElementById('contactMsg').value.trim();

            const originalBtnText = contactSubmitBtn.textContent;
            contactSubmitBtn.disabled = true;
            contactSubmitBtn.textContent = 'Gönderiliyor...';

            try {
                const res = await fetchWithTimeout(`${API_BASE_URL}/api/contact`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, email, message })
                });

                if (!res.ok) {
                    throw new Error('Mesaj gönderilemedi');
                }

                contactForm.reset();
                contactSubmitBtn.textContent = 'Mesajınız Alındı ✓';
                setTimeout(() => {
                    document.getElementById('contactModal').classList.add('hidden');
                    contactSubmitBtn.textContent = originalBtnText;
                }, 1200);
            } catch (err) {
                alert('Mesajınız gönderilemedi. Lütfen daha sonra tekrar deneyin.');
                contactSubmitBtn.textContent = originalBtnText;
            } finally {
                contactSubmitBtn.disabled = false;
            }
        });
    }

    function performLogout() {
        // Önce yerelde ANINDA çıkış yaptırıyoruz — sunucunun (özellikle
        // Render'ın soğuk başlangıcında 30-60 saniye sürebilen) yanıtını
        // beklemek butonun "çalışmıyormuş" gibi hissettirmesine sebep
        // oluyordu. clearAuthSession() zaten updateAuthUI()'yi çağırıp
        // modalı giriş/kayıt görünümüne döndürüyor — modalı kapatmıyoruz ki
        // kullanıcı isterse hemen tekrar giriş yapabilsin.
        const tokenToInvalidate = state.authToken;
        clearAuthSession();

        if (tokenToInvalidate) {
            fetchWithTimeout(`${API_BASE_URL}/api/auth/logout`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${tokenToInvalidate}` }
            }, 10000).catch(() => {
                // Sunucuya ulaşılamasa da yerel oturum zaten temizlendi;
                // sunucu tarafındaki token er ya da geç kendiliğinden
                // (7 günlük süre dolunca) geçersiz olacaktır.
            });
        }
    }

    logoutBtn.addEventListener('click', performLogout);

    // Üst navbar'daki profil ikonu artık oturum durumuna göre iki farklı işi
    // tek tıklamada yapıyor: çıkış yapılmışsa giriş modalını açar, giriş
    // yapılmışsa modalı hiç açmadan doğrudan çıkış yapar (bkz. updateAuthUI
    // içindeki title/ikon güncellemesi).
    profileBtn.addEventListener('click', () => {
        if (state.authToken) {
            performLogout();
        } else {
            authModal.classList.remove('hidden');
            updateAuthUI();
        }
    });

    // Sayfa her açıldığında, önceden kaydedilmiş bir oturum varsa hâlâ
    // geçerli mi diye sunucuya sorar; süresi dolmuş/geçersizse sessizce
    // çıkış yapılmış hale getirir.
    if (state.authToken) {
        fetchWithTimeout(`${API_BASE_URL}/api/auth/me`, {
            headers: { 'Authorization': `Bearer ${state.authToken}` }
        }).then(res => {
            if (!res.ok) { clearAuthSession(); return null; }
            return res.json();
        }).then(profile => {
            if (profile) renderSidebarProfileCard(profile);
        }).catch(() => {});
    }

    // Wake the backend up as soon as the page loads (silent, no UI change)
    // so the assistant's first real reply isn't delayed by Render's cold start.
    fetch('https://ottoman-text-ai.onrender.com/api/health').catch(() => {});

    // --- AI Assistant Widget ---
    const assistantFabBtn = document.getElementById('assistantFabBtn');
    const assistantPanel = document.getElementById('assistantPanel');
    const assistantCloseBtn = document.getElementById('assistantCloseBtn');
    const assistantMessages = document.getElementById('assistantMessages');
    const assistantInput = document.getElementById('assistantInput');
    const assistantSendBtn = document.getElementById('assistantSendBtn');

    const assistantHistory = [];
    let assistantSelectedContext = null;

    function appendAssistantMessage(role, text) {
        const msg = document.createElement('div');
        msg.className = 'assistant-msg ' + (role === 'user' ? 'assistant-msg-user' : 'assistant-msg-bot');
        msg.textContent = text;
        assistantMessages.appendChild(msg);
        assistantMessages.scrollTop = assistantMessages.scrollHeight;
    }

    assistantFabBtn.addEventListener('click', () => {
        assistantPanel.classList.toggle('hidden');
        if (!assistantPanel.classList.contains('hidden')) {
            assistantInput.focus();
        }
    });

    assistantCloseBtn.addEventListener('click', () => {
        assistantPanel.classList.add('hidden');
    });

    async function sendAssistantMessage() {
        const text = assistantInput.value.trim();
        if (!text) return;

        appendAssistantMessage('user', text);
        assistantHistory.push({
            role: 'user',
            content: text
        });
        assistantInput.value = '';
        assistantInput.disabled = true;
        assistantSendBtn.disabled = true;

        const loadingMsg = document.createElement('div');
        loadingMsg.className = 'assistant-msg assistant-msg-loading';
        loadingMsg.textContent = 'Yanıt hazırlanıyor...'; 
        assistantMessages.appendChild(loadingMsg);
        assistantMessages.scrollTop = assistantMessages.scrollHeight;

        try {
            const res = await fetchWithTimeout('https://ottoman-text-ai.onrender.com/api/assistant', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                message: text,
                history: assistantHistory.slice(-10),
                selected_context: assistantSelectedContext,
                document_text: state.transText || ''
                })
            }, 45000);

            loadingMsg.remove();

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                appendAssistantMessage('bot', errData.error || 'Bir hata oluştu, lütfen tekrar deneyin.');
            } else {
                const data = await res.json();
                const reply = data.reply || 'Bir yanıt alınamadı.';

                let displayedReply = reply;

               let relatedInfo = '';

            if (Array.isArray(data.related_information)) {
                relatedInfo = data.related_information
                    .filter(Boolean)
                    .join('\n');
            } else if (typeof data.related_information === 'string') {
                relatedInfo = data.related_information.trim();
            }

            if (data.answer_type === 'related' && relatedInfo) {
                displayedReply +=
                    '\n\nBelgedeki ilgili bilgiler:\n' +
                    relatedInfo;
            }

                appendAssistantMessage('bot', displayedReply);

                assistantHistory.push({
                    role: 'assistant',
                    content: displayedReply
                });
            }
        } catch (err) {
            loadingMsg.remove();
            appendAssistantMessage('bot', 'Bağlantı hatası: ' + err.message);
        } finally {
            assistantInput.disabled = false;
            assistantSendBtn.disabled = false;
            assistantInput.focus();
        }
    }

    assistantSendBtn.addEventListener('click', sendAssistantMessage);

    const aiPredictionsBtn = document.getElementById('aiPredictionsBtn');
    const aiFeatureResult = document.getElementById('aiFeatureResult');

    // AI Belge Araçları artık sohbet asistanının içinde açılan bir modal
    // değil — Bilgi'nin altında, çeviri tamamlanınca otomatik açılan aynı
    // tarz bir bölüm (bkz. setInfoExpanded / index.html'deki
    // #aiToolsCollapsibleSection). Araçların kendisi zaten state.transText
    // üzerinden çalıştığı için ayrıca bir "aç" tetikleyicisine gerek yok —
    // aiToolsTabBtn sadece bu bölümü aç/kapa ediyor.
    const aiToolsTabBtn = document.getElementById('aiToolsTabBtn');
    const aiToolsContent = document.getElementById('aiToolsContent');

    function setAiToolsExpanded(expanded) {
        aiToolsContent.classList.toggle('hidden', !expanded);
        aiToolsTabBtn.classList.toggle('expanded', expanded);
        aiToolsTabBtn.setAttribute('aria-expanded', String(expanded));
    }

    aiToolsTabBtn.addEventListener('click', () => {
        setAiToolsExpanded(aiToolsContent.classList.contains('hidden'));
    });

    async function runAiPredictions() {
        if (!state.transText || !state.transText.trim()) {
            aiFeatureResult.textContent =
                'Önce bir belgeyi çevirmeniz gerekiyor.';
            return;
        }

        aiPredictionsBtn.disabled = true;
        aiFeatureResult.textContent =
            'AI tahmin ve önerileri hazırlanıyor...';

        try {
            const response = await fetchWithTimeout(
                'https://ottoman-text-ai.onrender.com/api/ai/predictions',
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        document_text: state.transText
                    })
                },
                45000
            );

            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(
                    data.details ||
                    data.error ||
                    'AI tahmin isteği başarısız oldu.'
                );
            }

            const result = data.analysis || {};
            const predictions = Array.isArray(result.predictions)
                ? result.predictions
                : [];

            const recommendations = Array.isArray(result.recommendations)
                ? result.recommendations
                : [];

            aiFeatureResult.innerHTML = '';

            aiFeatureResult.innerHTML = '';

            // Ana başlık
            const header = document.createElement('div');
            header.className = 'ai-result-header';
            header.textContent = 'Tahminler ve Öneriler';
            aiFeatureResult.appendChild(header);

            // TAHMİNLER
            const predictionsSection = document.createElement('div');
            predictionsSection.className = 'ai-result-section';

            const predictionsTitle = document.createElement('div');
            predictionsTitle.className = 'ai-result-section-title';
            predictionsTitle.textContent = 'Tahminler';
            predictionsSection.appendChild(predictionsTitle);

            if (predictions.length === 0) {
                const empty = document.createElement('div');
                empty.className = 'ai-result-empty';
                empty.textContent = 'Tahmin bulunamadı.';
                predictionsSection.appendChild(empty);
            } else {
                predictions.forEach((item, index) => {
                    const predictionText =
                        item.prediction || 'Tahmin';

                    const percent = Math.round(
                        (Number(item.confidence) || 0) * 100
                    );

                    const card = document.createElement('button');
                    card.type = 'button';
                    card.className = 'ai-result-card';

                    const top = document.createElement('div');
                    top.className = 'ai-result-card-top';

                    const number = document.createElement('span');
                    number.className = 'ai-result-number';
                    number.textContent = index + 1;

                    const text = document.createElement('span');
                    text.className = 'ai-result-card-title';
                    text.textContent = predictionText;

                    top.appendChild(number);
                    top.appendChild(text);

                    const meta = document.createElement('div');
                    meta.className = 'ai-result-meta';

                    const confidence = document.createElement('span');
                    confidence.className = 'ai-confidence-badge';
                    confidence.textContent = `Güven %${percent}`;

                    meta.appendChild(confidence);

                    const reason = document.createElement('div');
                    reason.className = 'ai-result-reason';
                    reason.textContent =
                        item.reason || 'Açıklama bulunamadı.';

                    card.appendChild(top);
                    card.appendChild(meta);
                    card.appendChild(reason);

                    attachNoteAction(
                        card,
                        item,
                        'prediction'
                    );

                    card.addEventListener('click', () => {
                        assistantSelectedContext = {
                            type: 'prediction',
                            text: predictionText,
                            details: item.reason || ''
                        };

                        assistantPanel.classList.remove('hidden');

                        assistantInput.placeholder =
                            `"${predictionText}" hakkında sor...`;

                        assistantInput.focus();
                    });

                    predictionsSection.appendChild(card);
                });
            }

            aiFeatureResult.appendChild(predictionsSection);

            // ÖNERİLER
            const recommendationsSection =
                document.createElement('div');

            recommendationsSection.className =
                'ai-result-section';

            const recommendationsTitle =
                document.createElement('div');

            recommendationsTitle.className =
                'ai-result-section-title';

            recommendationsTitle.textContent = 'Öneriler';

            recommendationsSection.appendChild(
                recommendationsTitle
            );

            if (recommendations.length === 0) {
                const empty = document.createElement('div');
                empty.className = 'ai-result-empty';
                empty.textContent = 'Öneri bulunamadı.';
                recommendationsSection.appendChild(empty);
            } else {
                recommendations.forEach((item, index) => {
                    const recommendationText =
                        item.recommendation || 'Öneri';

                    const card = document.createElement('button');
                    card.type = 'button';
                    card.className = 'ai-result-card';

                    const top = document.createElement('div');
                    top.className = 'ai-result-card-top';

                    const number = document.createElement('span');
                    number.className = 'ai-result-number';
                    number.textContent = index + 1;

                    const text = document.createElement('span');
                    text.className = 'ai-result-card-title';
                    text.textContent = recommendationText;

                    top.appendChild(number);
                    top.appendChild(text);

                    const reason = document.createElement('div');
                    reason.className = 'ai-result-reason';
                    reason.textContent =
                        item.reason || 'Açıklama bulunamadı.';

                    card.appendChild(top);
                    card.appendChild(reason);

                    attachNoteAction(
                        card,
                        item,
                        'recommendation'
                    );

                    card.addEventListener('click', () => {
                        assistantSelectedContext = {
                            type: 'recommendation',
                            text: recommendationText,
                            details: item.reason || ''
                        };

                        assistantPanel.classList.remove('hidden');

                        assistantInput.placeholder =
                            `"${recommendationText}" hakkında sor...`;

                        assistantInput.focus();
                    });

                    recommendationsSection.appendChild(card);
                });
            }

            aiFeatureResult.appendChild(
                recommendationsSection
            );

        } catch (error) {
            console.error('[AI PREDICTIONS]', error);

            aiFeatureResult.textContent =
                'Tahmin ve öneriler alınamadı: ' +
                error.message;

        } finally {
            aiPredictionsBtn.disabled = false;
        }
    }

    if (aiPredictionsBtn) {
        aiPredictionsBtn.addEventListener(
            'click',
            runAiPredictions
        );
    }
    const aiQuestionsBtn = document.getElementById('aiQuestionsBtn');

    async function runAiSuggestedQuestions() {
        if (!state.transText || !state.transText.trim()) {
            aiFeatureResult.textContent =
                'Önce bir belgeyi çevirmeniz gerekiyor.';
            return;
        }

        aiQuestionsBtn.disabled = true;
        aiFeatureResult.textContent =
            'Belge için hazır sorular oluşturuluyor...';

        try {
            const response = await fetchWithTimeout(
                'https://ottoman-text-ai.onrender.com/api/ai/suggested-questions',
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        document_text: state.transText
                    })
                },
                75000
            );

            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(
                    data.error || 'Hazır sorular oluşturulamadı.'
                );
            }

            const questions = Array.isArray(data.questions)
                ? data.questions
                : [];

            if (questions.length === 0) {
                aiFeatureResult.textContent =
                    'Bu belge için hazır soru üretilemedi.';
                return;
            }

            aiFeatureResult.innerHTML = '';

            const title = document.createElement('div');
            title.textContent = 'HAZIR SORULAR';
            title.style.fontWeight = '700';
            title.style.marginBottom = '10px';

            aiFeatureResult.appendChild(title);

            questions.forEach((question, index) => {
                const button = document.createElement('button');

                button.type = 'button';
                button.style.display = 'block';
                button.style.width = '100%';
                button.style.textAlign = 'left';
                button.style.marginBottom = '8px';
                button.style.padding = '8px';
                button.style.cursor = 'pointer';

                button.textContent =
                    `${index + 1}. ${question}`;

                button.addEventListener('click', () => {
                    // Chatbox'ı aç
                    assistantPanel.classList.remove('hidden');

                    // Soruyu chatbox'a yaz
                    assistantInput.value = question;
                    assistantInput.focus();

                    // Otomatik gönder
                    sendAssistantMessage();
                });

                aiFeatureResult.appendChild(button);
            });

        } catch (error) {
            console.error('[AI QUESTIONS]', error);

            aiFeatureResult.textContent =
                'Hazır sorular alınamadı: ' +
                error.message;

        } finally {
            aiQuestionsBtn.disabled = false;
        }
    }
   
    const aiResearchBtn = document.getElementById('aiResearchBtn');

    async function runAiResearchSuggestions() {
        if (!state.transText || !state.transText.trim()) {
            aiFeatureResult.textContent =
                'Önce bir belgeyi çevirmeniz gerekiyor.';
            return;
        }

        aiResearchBtn.disabled = true;
        aiFeatureResult.textContent =
            'Araştırma önerileri hazırlanıyor...';

        try {
            const response = await fetchWithTimeout(
                'https://ottoman-text-ai.onrender.com/api/ai/research-suggestions',
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        document_text: state.transText
                    })
                },
                45000
            );

            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(
                    data.error || 'Araştırma önerileri oluşturulamadı.'
                );
            }

            let suggestions = data.suggestions;

            if (!suggestions) {
                aiFeatureResult.textContent =
                    'Araştırma önerisi bulunamadı.';
                return;
            }
        if (typeof suggestions === 'object') {
            suggestions = Object.values(suggestions)
                .flat()
                .filter(Boolean);
        }
// Liste dönerse okunabilir ve tıklanabilir şekilde göster
if (Array.isArray(suggestions)) {
    aiFeatureResult.innerHTML = '';

    const title = document.createElement('div');
    title.textContent = 'ARAŞTIRMA ÖNERİLERİ';
    title.style.fontWeight = '700';
    title.style.marginBottom = '10px';

    aiFeatureResult.appendChild(title);

    const researchTypeLabels = {
        person: 'Kişi',
        place: 'Yer',
        event: 'Olay',
        concept: 'Kavram',
        date: 'Tarih',
        work: 'Eser',
        organization: 'Kurum',
        research: 'Araştırma'
    };
    suggestions.forEach((item, index) => {
        const suggestion =
            typeof item === 'string'
                ? {
                    title: item,
                    query: item,
                    reason: '',
                    type: 'research'
                }
                : item;

        const button = document.createElement('button');

        button.type = 'button';
        button.style.display = 'block';
        button.style.width = '100%';
        button.style.textAlign = 'left';
        button.style.marginBottom = '10px';
        button.style.padding = '8px';
        button.style.cursor = 'pointer';

        const titleText =
            suggestion.title ||
            suggestion.query ||
            'Araştırma önerisi';

        let text =
            `${index + 1}. ${titleText}`;

        if (suggestion.query) {
            text += `\nAraştırma: ${suggestion.query}`;
        }

        if (suggestion.reason) {
            text += `\nNeden: ${suggestion.reason}`;
        }

        if (suggestion.type) {
            const typeLabel =
                researchTypeLabels[suggestion.type] ||
                suggestion.type;

            text += `\nTür: ${typeLabel}`;
        }

        button.textContent = text;

        attachNoteAction(
            button,
            suggestion,
            'research_suggestion'
        );
        button.addEventListener('click', () => {
            assistantSelectedContext = {
                type: suggestion.type || 'research',
                text: titleText,
                details:
                    suggestion.reason ||
                    suggestion.query ||
                    ''
            };

            assistantPanel.classList.remove('hidden');

            assistantInput.placeholder =
                `"${titleText}" hakkında sor...`;

            assistantInput.focus();
        });

        aiFeatureResult.appendChild(button);
    });

    return;
}

            // Object dönerse test aşamasında JSON olarak göster
        if (typeof suggestions === 'object') {
            const objectSuggestions = Object.values(suggestions)
                .flat()
                .filter(Boolean);

            suggestions = objectSuggestions;
        }



            aiFeatureResult.textContent =
                'ARAŞTIRMA ÖNERİLERİ\n\n' +
                String(suggestions);

        } catch (error) {
            console.error(
                '[AI RESEARCH SUGGESTIONS]',
                error
            );

            aiFeatureResult.textContent =
                'Araştırma önerileri alınamadı: ' +
                error.message;

        } finally {
            aiResearchBtn.disabled = false;
        }
    }

const aiEntitiesBtn = document.getElementById('aiEntitiesBtn');

async function runAiEntityFilter() {
    if (!state.transText || !state.transText.trim()) {
        aiFeatureResult.textContent =
            'Önce bir belgeyi çevirmeniz gerekiyor.';
        return;
    }

    aiEntitiesBtn.disabled = true;
    aiFeatureResult.textContent =
        'Belgedeki varlıklar analiz ediliyor...';

    try {
        const response = await fetchWithTimeout(
            'https://ottoman-text-ai.onrender.com/api/ai/entity-filter',
            {
                method: 'GET'
            },
            45000
        );

        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(
                data.error || 'Varlık analizi başarısız oldu.'
            );
        }

        let entities = data.entities;

        if (!entities) {
            aiFeatureResult.textContent =
                'Belgede sınıflandırılabilecek varlık bulunamadı.';
            return;
        }

        if (typeof entities === 'object' && !Array.isArray(entities)) {
            entities = Object.values(entities)
                .flat()
                .filter(Boolean);
        }

if (Array.isArray(entities)) {
    aiFeatureResult.innerHTML = '';

    const title = document.createElement('div');
    title.className = 'ai-result-header';
    title.textContent = 'Varlık Analizi';

    aiFeatureResult.appendChild(title);

    if (entities.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'ai-result-empty';
        empty.textContent =
            'Belgede sınıflandırılabilecek varlık bulunamadı.';

        aiFeatureResult.appendChild(empty);
        return;
    }

    const categoryLabels = {
        person: 'Kişi',
        place: 'Yer',
        date: 'Tarih',
        event: 'Olay',
        concept: 'Kavram',
        institution: 'Kurum',
        organization: 'Kurum',
        role: 'Unvan / Rol',
        work: 'Eser / Belge',
        entity: 'Varlık'
    };

    const importanceLabels = {
        high: 'Yüksek önem',
        medium: 'Orta önem',
        low: 'Düşük önem'
    };

    entities.forEach((item, index) => {
        const entity =
            typeof item === 'string'
                ? {
                    text: item,
                    category: 'entity',
                    subtype: '',
                    importance: 'medium',
                    role: '',
                    context: '',
                    mentions: null,
                    confidence: null
                }
                : item;

        const entityText =
            entity.text ||
            entity.name ||
            'Varlık';

        const categoryText =
            categoryLabels[entity.category] ||
            entity.category ||
            'Varlık';

        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'ai-result-card';

        // Üst kısım
        const top = document.createElement('div');
        top.className = 'ai-result-card-top';

        const number = document.createElement('span');
        number.className = 'ai-result-number';
        number.textContent = index + 1;

        const nameArea = document.createElement('div');
        nameArea.style.flex = '1';

        const name = document.createElement('div');
        name.className = 'ai-result-card-title';
        name.textContent = entityText;

        const type = document.createElement('div');
        type.className = 'ai-entity-type';

        if (entity.subtype) {
            type.textContent =
                `${categoryText} · ${entity.subtype}`;
        } else {
            type.textContent = categoryText;
        }

        nameArea.appendChild(name);
        nameArea.appendChild(type);

        top.appendChild(number);
        top.appendChild(nameArea);

        card.appendChild(top);

        // Badge alanı
        const meta = document.createElement('div');
        meta.className = 'ai-result-meta';

        if (entity.importance) {
            const importance = document.createElement('span');
            importance.className =
                `ai-importance-badge ai-importance-${entity.importance}`;

            importance.textContent =
                importanceLabels[entity.importance] ||
                entity.importance;

            meta.appendChild(importance);
        }

        if (
            entity.confidence !== null &&
            entity.confidence !== undefined
        ) {
            const confidencePercent = Math.round(
                (Number(entity.confidence) || 0) * 100
            );

            const confidence = document.createElement('span');
            confidence.className = 'ai-confidence-badge';
            confidence.textContent =
                `Güven %${confidencePercent}`;

            meta.appendChild(confidence);
        }

        if (
            entity.mentions !== null &&
            entity.mentions !== undefined
        ) {
            const mentions = document.createElement('span');
            mentions.className = 'ai-entity-mentions';
            mentions.textContent =
                `${entity.mentions} kez geçiyor`;

            meta.appendChild(mentions);
        }

        if (meta.children.length > 0) {
            card.appendChild(meta);
        }

        // Rol
        if (entity.role) {
            const role = document.createElement('div');
            role.className = 'ai-result-reason';

            const roleLabel = document.createElement('strong');
            roleLabel.textContent = 'Rol: ';

            role.appendChild(roleLabel);
            role.appendChild(
                document.createTextNode(entity.role)
            );

            card.appendChild(role);
        }

        // Bağlam
        if (entity.context) {
            const context = document.createElement('div');
            context.className = 'ai-result-reason';

            const contextLabel = document.createElement('strong');
            contextLabel.textContent = 'Bağlam: ';

            context.appendChild(contextLabel);
            context.appendChild(
                document.createTextNode(entity.context)
            );

            card.appendChild(context);
        }

        card.addEventListener('click', () => {
            assistantSelectedContext = {
                type: entity.category || 'entity',
                text: entityText,
                details: [
                    entity.subtype,
                    entity.role,
                    entity.context
                ]
                    .filter(Boolean)
                    .join(' - ')
            };

            assistantPanel.classList.remove('hidden');

            assistantInput.placeholder =
                `"${entityText}" hakkında sor...`;

            assistantInput.focus();
        });

        aiFeatureResult.appendChild(card);
    });

    return;

}

aiFeatureResult.textContent =
    'VARLIK ANALİZİ\n\n' +
    String(entities);

    } catch (error) {
        console.error('[AI ENTITY FILTER]', error);

        aiFeatureResult.textContent =
            'Varlık analizi alınamadı: ' +
            error.message;

    } finally {
        aiEntitiesBtn.disabled = false;
    }
}

if (aiEntitiesBtn) {
    aiEntitiesBtn.addEventListener(
        'click',
        runAiEntityFilter
    );
}

const aiAnalyzeSelectionBtn =
    document.getElementById('aiAnalyzeSelectionBtn');

const aiSelectedTextInput =
    document.getElementById('aiSelectedTextInput');

async function runAiSelectedTextAnalysis() {
    const selectedText =
        aiSelectedTextInput.value.trim();

    if (!selectedText) {
        aiFeatureResult.textContent =
            'Analiz etmek için bir metin girin.';
        return;
    }

    aiAnalyzeSelectionBtn.disabled = true;

    aiFeatureResult.textContent =
        'Seçili metin analiz ediliyor...';

    try {
        const response = await fetchWithTimeout(
            'https://ottoman-text-ai.onrender.com/api/ai/analyze-selection',
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    text: selectedText
                })
            },
            45000
        );

        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(
                data.error ||
                'Seçili metin analizi başarısız oldu.'
            );
        }

        const analysis = data.analysis;

        if (!analysis) {
            aiFeatureResult.textContent =
                'Analiz sonucu oluşturulamadı.';
            return;
        }

aiFeatureResult.innerHTML = '';

const title = document.createElement('div');
title.textContent = 'SEÇİLİ METİN ANALİZİ';
title.style.fontWeight = '700';
title.style.marginBottom = '10px';

aiFeatureResult.appendChild(title);

const mainButton = document.createElement('button');
mainButton.type = 'button';
mainButton.style.display = 'block';
mainButton.style.width = '100%';
mainButton.style.textAlign = 'left';
mainButton.style.marginBottom = '10px';
mainButton.style.padding = '8px';
mainButton.style.cursor = 'pointer';

let mainText =
    `Metin: ${selectedText}`;

mainText +=
    `\nAçıklama: ${
        analysis.explanation ||
        'Açıklama oluşturulamadı.'
    }`;

mainText +=
    `\nSadeleştirilmiş: ${
        analysis.simplified ||
        'Sadeleştirme oluşturulamadı.'
    }`;

mainText +=
    `\nBağlam: ${
        analysis.context ||
        'Bu seçim için yeterli bağlam belirlenemedi.'
    }`;

mainButton.textContent = mainText;

mainButton.addEventListener('click', () => {
    assistantSelectedContext = {
        type: 'selected_text',
        text: selectedText,
        details:
            analysis.explanation ||
            analysis.context ||
            ''
    };

    assistantPanel.classList.remove('hidden');

    assistantInput.placeholder =
        `"${selectedText}" hakkında sor...`;

    assistantInput.focus();
});

aiFeatureResult.appendChild(mainButton);

const sections = [
    ['Anahtar Kelimeler', analysis.keywords, 'concept'],
    ['Kişiler', analysis.people, 'person'],
    ['Yerler', analysis.places, 'place'],
    ['Tarihler', analysis.dates, 'date'],
    ['Olaylar', analysis.events, 'event'],
    ['Belirsiz Noktalar', analysis.uncertain_points, 'uncertain']
];

sections.forEach(([label, items, type]) => {
    if (!Array.isArray(items) || items.length === 0) {
        return;
    }

    const sectionTitle = document.createElement('div');
    sectionTitle.textContent = label;
    sectionTitle.style.fontWeight = '600';
    sectionTitle.style.margin =
        '10px 0 6px 0';

    aiFeatureResult.appendChild(sectionTitle);

    items.forEach((item) => {
        const itemText =
            typeof item === 'string'
                ? item
                : item.text ||
                  item.name ||
                  JSON.stringify(item);

        const button = document.createElement('button');

        button.type = 'button';
        button.style.display = 'block';
        button.style.width = '100%';
        button.style.textAlign = 'left';
        button.style.marginBottom = '6px';
        button.style.padding = '7px';
        button.style.cursor = 'pointer';

        button.textContent = itemText;

        button.addEventListener('click', () => {
            assistantSelectedContext = {
                type: type,
                text: itemText,
                details: [
                    analysis.explanation,
                    analysis.simplified,
                    analysis.context
                ]
                    .filter(Boolean)
                    .join(' | ')
            };

            assistantPanel.classList.remove('hidden');

            assistantInput.placeholder =
                `"${itemText}" hakkında sor...`;

            assistantInput.focus();
        });

        aiFeatureResult.appendChild(button);
    });
});

    } catch (error) {
        console.error(
            '[AI SELECTED TEXT]',
            error
        );

        aiFeatureResult.textContent =
            'Seçili metin analizi alınamadı: ' +
            error.message;

    } finally {
        aiAnalyzeSelectionBtn.disabled = false;
    }
}

const aiSuggestionsBtn =
    document.getElementById('aiSuggestionsBtn');

const aiSuggestionEditInput =
    document.getElementById('aiSuggestionEditInput');

const aiReviewSuggestionBtn =
    document.getElementById('aiReviewSuggestionBtn');

let lastAiSuggestion = null;

if (aiSelectedTextInput) {
    aiSelectedTextInput.addEventListener('input', () => {
        lastAiSuggestion = null;

        if (aiSuggestionEditInput) {
            aiSuggestionEditInput.value = '';
        }
    });
}

async function runAiSuggestions() {
    const selectedText =
        aiSelectedTextInput.value.trim();

    if (!selectedText) {
        aiFeatureResult.textContent =
            'Alternatif üretmek için bir metin girin.';
        return;
    }

    aiSuggestionsBtn.disabled = true;

    aiFeatureResult.textContent =
        'AI alternatifleri hazırlanıyor...';

    try {
        const response = await fetchWithTimeout(
            'https://ottoman-text-ai.onrender.com/api/ai/suggestions',
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    text: selectedText
                })
            },
            45000
        );

        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(
                data.error ||
                'Alternatif öneriler oluşturulamadı.'
            );
        }

        const suggestion = data.suggestion;

        if (!suggestion) {
            aiFeatureResult.textContent =
                'AI alternatif öneri oluşturamadı.';
            return;
        }

                let suggestedText = '';

        if (
            suggestion.recommended &&
            typeof suggestion.recommended === 'object'
        ) {
            suggestedText =
                suggestion.recommended.text ||
                suggestion.recommended.suggestion ||
                suggestion.recommended.recommendation ||
                '';
        } else if (
            typeof suggestion.recommended === 'string'
        ) {
            suggestedText = suggestion.recommended;
        }

        if (
            !suggestedText &&
            Array.isArray(suggestion.alternatives) &&
            suggestion.alternatives.length > 0
        ) {
            const firstAlternative =
                suggestion.alternatives[0];

            if (typeof firstAlternative === 'string') {
                suggestedText = firstAlternative;
            } else if (
                firstAlternative &&
                typeof firstAlternative === 'object'
            ) {
                suggestedText =
                    firstAlternative.text ||
                    firstAlternative.suggestion ||
                    firstAlternative.recommendation ||
                    '';
            }
        }

        lastAiSuggestion = {
            originalText: selectedText,
            aiSuggestion: suggestedText
        };

        if (aiSuggestionEditInput) {
            aiSuggestionEditInput.value =
                suggestedText;
        }

    aiFeatureResult.innerHTML = '';

    const title = document.createElement('div');
    title.textContent = 'AI ALTERNATİF ÖNERİLERİ';
    title.style.fontWeight = '700';
    title.style.marginBottom = '10px';

    aiFeatureResult.appendChild(title);


    // Önerilen ana metin
    if (suggestedText) {
        const recommendedButton =
            document.createElement('button');

        recommendedButton.type = 'button';
        recommendedButton.style.display = 'block';
        recommendedButton.style.width = '100%';
        recommendedButton.style.textAlign = 'left';
        recommendedButton.style.marginBottom = '10px';
        recommendedButton.style.padding = '8px';
        recommendedButton.style.cursor = 'pointer';

        let recommendedDetails = '';

        if (
            suggestion.recommended &&
            typeof suggestion.recommended === 'object'
        ) {
            recommendedDetails =
                suggestion.recommended.reason ||
                suggestion.recommended.explanation ||
                '';
        }

        recommendedButton.textContent =
            `Önerilen: ${suggestedText}` +
            (
                recommendedDetails
                    ? `\nAçıklama: ${recommendedDetails}`
                    : ''
            );

        recommendedButton.addEventListener(
            'click',
            () => {
                assistantSelectedContext = {
                    type: 'ai_suggestion',
                    text: suggestedText,
                    details: recommendedDetails
                };

                assistantPanel.classList.remove('hidden');

                assistantInput.placeholder =
                    `"${suggestedText}" hakkında sor...`;

                assistantInput.focus();
            }
        );

        aiFeatureResult.appendChild(
            recommendedButton
        );
    }


    // Diğer alternatifler
    const alternatives =
        Array.isArray(suggestion.alternatives)
            ? suggestion.alternatives
            : [];

    if (alternatives.length > 0) {
        const alternativesTitle =
            document.createElement('div');

        alternativesTitle.textContent =
            'Diğer Alternatifler';

        alternativesTitle.style.fontWeight = '600';
        alternativesTitle.style.margin =
            '10px 0 6px 0';

        aiFeatureResult.appendChild(
            alternativesTitle
        );

        alternatives.forEach((item, index) => {
            const alternativeText =
                typeof item === 'string'
                    ? item
                    : (
                        item.text ||
                        item.suggestion ||
                        item.recommendation ||
                        ''
                    );

            if (!alternativeText) {
                return;
            }

            const details =
                typeof item === 'object'
                    ? (
                        item.reason ||
                        item.explanation ||
                        ''
                    )
                    : '';

            const button =
                document.createElement('button');

            button.type = 'button';
            button.style.display = 'block';
            button.style.width = '100%';
            button.style.textAlign = 'left';
            button.style.marginBottom = '6px';
            button.style.padding = '7px';
            button.style.cursor = 'pointer';

            button.textContent =
                `${index + 1}. ${alternativeText}` +
                (
                    details
                        ? `\nAçıklama: ${details}`
                        : ''
                );

            button.addEventListener(
                'click',
                () => {
                    assistantSelectedContext = {
                        type: 'ai_alternative',
                        text: alternativeText,
                        details: details
                    };

                    assistantPanel.classList.remove(
                        'hidden'
                    );

                    assistantInput.placeholder =
                        `"${alternativeText}" hakkında sor...`;

                    assistantInput.focus();
                }
            );

            aiFeatureResult.appendChild(button);
        });
    }

    } catch (error) {
        console.error(
            '[AI SUGGESTIONS]',
            error
        );

        aiFeatureResult.textContent =
            'Alternatif öneriler alınamadı: ' +
            error.message;

    } finally {
        aiSuggestionsBtn.disabled = false;
    }
}

async function runAiSuggestionReview() {
    if (!lastAiSuggestion) {
        aiFeatureResult.textContent =
            'Önce AI alternatif önerisi oluşturun.';
        return;
    }

    const userEdit =
        aiSuggestionEditInput
            ? aiSuggestionEditInput.value.trim()
            : '';

    if (!userEdit) {
        aiFeatureResult.textContent =
            'Değerlendirmek için düzenlenmiş metni girin.';
        return;
    }

    aiReviewSuggestionBtn.disabled = true;

    aiFeatureResult.textContent =
        'Kullanıcı düzenlemesi AI tarafından değerlendiriliyor...';

    try {
        const response = await fetchWithTimeout(
            'https://ottoman-text-ai.onrender.com/api/ai/review-suggestion',
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    original_text:
                        lastAiSuggestion.originalText,
                    ai_suggestion:
                        lastAiSuggestion.aiSuggestion,
                    user_edit:
                        userEdit
                })
            },
            45000
        );

        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(
                data.error ||
                'AI düzenleme değerlendirmesi başarısız oldu.'
            );
        }

        const review = data.review;

        if (!review) {
            aiFeatureResult.textContent =
                'AI değerlendirme sonucu oluşturulamadı.';
            return;
        }

        const confidence = Math.round(
            (Number(review.confidence) || 0) * 100
        );

aiFeatureResult.innerHTML = '';

const title = document.createElement('div');
title.textContent = 'AI DÜZENLEME DEĞERLENDİRMESİ';
title.style.fontWeight = '700';
title.style.marginBottom = '10px';

aiFeatureResult.appendChild(title);


const reviewButton = document.createElement('button');

reviewButton.type = 'button';
reviewButton.style.display = 'block';
reviewButton.style.width = '100%';
reviewButton.style.textAlign = 'left';
reviewButton.style.padding = '8px';
reviewButton.style.cursor = 'pointer';

const finalText =
    review.recommended_text ||
    userEdit;

reviewButton.textContent =
    `Kabul edildi: ${review.accepted ? 'Evet' : 'Hayır'}\n` +
    `Güven: %${confidence}\n` +
    `Açıklama: ${review.reason || '-'}\n` +
    `Önerilen son metin: ${finalText || '-'}\n` +
    `AI önerisi değiştirildi: ${
        review.changed_from_ai ? 'Evet' : 'Hayır'
    }`;

reviewButton.addEventListener('click', () => {
    assistantSelectedContext = {
        type: 'reviewed_suggestion',
        text: finalText,
        details: review.reason || ''
    };

    assistantPanel.classList.remove('hidden');

    assistantInput.placeholder =
        `"${finalText}" hakkında sor...`;

    assistantInput.focus();
});

aiFeatureResult.appendChild(reviewButton);

    } catch (error) {
        console.error(
            '[AI SUGGESTION REVIEW]',
            error
        );

        aiFeatureResult.textContent =
            'Düzenleme değerlendirilemedi: ' +
            error.message;

    } finally {
        aiReviewSuggestionBtn.disabled = false;
    }
}
if (aiSuggestionsBtn) {
    aiSuggestionsBtn.addEventListener(
        'click',
        runAiSuggestions
    );
}
if (aiReviewSuggestionBtn) {
    aiReviewSuggestionBtn.addEventListener(
        'click',
        runAiSuggestionReview
    );
}

if (aiAnalyzeSelectionBtn) {
    aiAnalyzeSelectionBtn.addEventListener(
        'click',
        runAiSelectedTextAnalysis
    );
}

    if (aiResearchBtn) {
        aiResearchBtn.addEventListener(
            'click',
            runAiResearchSuggestions
        );
    }
    if (aiQuestionsBtn) {
        aiQuestionsBtn.addEventListener(
            'click',
            runAiSuggestedQuestions
        );
    }

    assistantInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            sendAssistantMessage();
        }
    });

    // Notes sayfasından dönüldüyse kayıtlı çeviriyi geri yükle.
    // Tüm UI değişkenleri initialize edildikten sonra çalışmalıdır.
    restoreTranslationState();
    renderRestoredTranslation();
});

