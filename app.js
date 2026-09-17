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
    const entityFilterDropdown = document.getElementById('entityFilterDropdown');
    const entityFilterTrigger = document.getElementById('entityFilterTrigger');
    const entityFilterMenu = document.getElementById('entityFilterMenu');

    // "Bilgi" output tab (belge analizi) elements
    const infoTabBtn = document.getElementById('infoTabBtn');
    const infoOutputBox = document.getElementById('infoOutputBox');
    const infoEmptyState = document.getElementById('infoEmptyState');
    const infoContentWrapper = document.getElementById('infoContentWrapper');
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
    const resultScriptDetails = document.getElementById('resultScriptDetails');
    const resultDateDetails = document.getElementById('resultDateDetails');
    const resultNotes = document.getElementById('resultNotes');
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

        // Entity / AI Belirsizliği filtresi
        const hasFilterableEntities =
            getEntityFilterCategories().length > 0;

        entityFilterDropdown.classList.toggle(
            'hidden',
            !hasFilterableEntities
        );
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
            file: 'assets/fsma.png',
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
            file: 'assets/im.png',
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
            file: 'assets/sk.png',
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
            file: 'assets/mdo.png',
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
            file: 'assets/svf.png',
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
            tr: `1 Emirlerin emiri, kerem ve kadir sahibi büyüklerin en büyüğü, **izzet ve celal madeni**
2 Sivas beylerbeyi **olan** **seçkinlerin örneği**
3 Sivas kadısı -**fazileti artsın**- **yüce padişah fermanı ulaştığında malum ola ki**
4 Yüce padişah fermanı ulaştığında malum ola ki **padişah hükmünün içeriği**
5 **Tevliyet ve nezaret** işlerinin **vakfiye** **gereğince** **yerine getirilmesi**
6 Sivas'ta **Süleyman Paşa** **vakfı** **şartları** **gereğince**
7 **Zapt ve idare olunup** **aksine** **hareket olunmaması**
8 **Vakfiye** **gereğince** **amel olunması** **talep** **olundukta**
9 **Gereğince** **amel oluna** **diye** **padişah hükmü**
10 **Mühr-i şerif** **gereğince** **amel oluna**
11 **Vakıf şartları** **gereğince** **amel oluna**
12 **Gereğince** **amel oluna** **muhalefet** **hakkında**
13 **Yeni** **vakfiye** **gereğince** **amel oluna**
14 **Padişah hükmünün içeriği** **gereğince** **amel oluna**
15 **Gereğince** **amel oluna** **diye** **padişah hükmü**
16 **Yerine getirilip** **aksine** **hareket olunmaması**
17 **Şaban ayının ortalarında** **sene** **doksan dokuz**`,
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
                concepts: ["Ferman", "Vakıf", "Tevliyet", "Nezaret", "Defter-i Cedid", "Şurût-ı Vakfiye", "Beylerbeyi", "Kadı"],
                script_type: "Divanî",
                script_purpose: "Devlet kararlarının ve emirlerinin taşradaki görevlilere tebliği",
                period_estimate: "17. Yüzyıl Sonu (Sultan II. Süleyman veya Sultan II. Ahmed dönemi)",
                date_hijri: "Evâsıt-ı Şa'bân 1099",
                date_gregorian: "Haziran 1688",
                notes: "Belge, Sivas'taki Süleyman Paşa Vakfı'nın idari ve mali işleyişine dair padişah fermanıdır. Metinde vakfiye şartlarına uyulması ve muhalif hareket edilmemesi mükerrer şekilde vurgulanmıştır."
            }
        },
        'sbh': {
            file: 'assets/sbh.png',
            name: 'sam_baalbek_halep_muhimme.png',
            size: '0.20 MB',
            ocr: `٤٢ شام بگلربگیسی و دفتدارنه مکتوب : حالیا صددینی عسکر **نصفندن** **محلنده** **قصر** **موقوفات** **صاحب** **کفایت**...
يرنده دفعی مکرر اولنمش حافظ سنان کچن شهاب اوغلی قاسم نام کسه **فساد و شقاوت**...
نامدار دفتری باشنده تفتیش ایدوب باقی قالان **اوزرنده** **قبض** **ایتدوروب**...
سنان نايب سنان عتبان نام کسه **عمارت** **ایتدیروب**...
قبض ایتدوروب باقیه اولنان اسامی **تفتیش** **اولنوب**...
و نصف رومی سرحد و رومی روجالی و ددکندرلو **محللرنده** **تابع** **رعایا**...
و نصف قلعه سنه تابع حاصل اولان **موقوفات**...
خازندار اولان و ارباب نوبت کبی **فسادندن** **عن** **عمدة** **قاتل**...
کامل قتل مقتدر اولان بگلر شاه و **قوزغون** **اولان** **جرملر**...
قدر لری واقع اولur که ذکر اولنان **اشقیایه** **رحم** **اولنمیوب**...
تربیه مأدب طوب کافر لره گوندرب **دفع** **فتنه** **اولنوب**...
اوزرنده اولان قدر شرعی غایب اولانلر **فانی** **اولوب**...
و کلانسی اولمیان منقضی شرعی **عادل** **اولوب**...
كتب في اواسط جمادى الآخرة سنة ٩٨٠

٤٣ بعلبك قاضيسنه و وقوفلريله كچن **قولی** **همایوننده** **مفرده** **مکتوب**...
لأجل المصلحة ضبط ایتدرمک **و مساحه** **قیاس** **مال** **ایدیلمک**...
و ارضی لایق اولوب **سماحتندن** **اولوب**...
بیوردم که : وصول بولدقده **مذکور** **وقف**...
حق اوزره و بالوجه الحسن **امورنده** **اولوب**...
حقدار لره ویروب و ضبط **ایتدرمک**...
مقتصد طالب و تحصیل **ایدوب**...
عقده کوکب **و شرف**...
رأی شریف والام **ارادت**...
ایریوب کیم فکر **ایتدرمسی**...

٤٤ حلب بگلربگيسنه مکتوب : بنده اقتضا **اولنوب** **سند** **حاکم** **اولوب**...
محکوم و عسکر و قلاع **تفتیش** **اولنوب**...
التمس اولنمش کاین **محلده** **تفتیش**...
بر وجه تفتیش و بر یلغوه **کوندرلمندر**...
کوندر لمندر ربیع الآخر **سنه** **مزبوره**...
اربع اوزرنه اوزاق **تفتیش**...
زید قدره **مکتوب**...`,
            tr: `42 Şam beylerbeyi ve defterdarına mektup: Şam askerinin **yarısından** **yerinde** **vazgeçilen** **vakıfların** **yeterli** **sahibi**...
yerinde defalarca uzaklaştırılmış olan Hafız Sinan, geçen Şihab oğlu Kasım adlı kimsenin **fesat ve eşkıyalığı**...
defter başında teftiş edilip geri kalan miktarın **üzerine** **tahsil** **ettirilip**...
Sinan naibi Sinan Atban adlı kimseye **imar** **ettirilip**...
tahsil ettirilip geriye kalan isimlerin **teftiş** **olunup**...
ve Rumi sınırının yarısı ile Rumi adamları ve Dedekenderli **yerlerindeki** **tabi** **reaya**...
ve kalesinin yarısına tabi hasıl olan **vakıflar**...
hazinedar olan ve nöbet ehli gibi **fesadından** **dolayı** **katil**...
tamamen katle muktedir olan beyler, şah ve **kuzgun** **olan** **cerimeler**...
durumları vaki olur ki zikredilen **eşkıyaya** **merhamet** **edilmeyip**...
terbiye edilerek kafirlere gönderilip **fitnenin** **ortadan** **kaldırılması**...
üzerinde olan şer'i miktar, kayıp olanlar **yok** **olup**...
ve geriye kalanı olmayan şer'i süresi dolmuş olanlar **adil** **olup**...
980 yılı Cemaziyelahir ayının ortalarında yazılmıştır.

43 Baalbek kadısına ve vakıf durumlarına dair **padişahın fermanı uyarınca yazılan mektup**...
Maslahat gereği kontrol altına alınması **ve arazinin ölçülerek değerinin belirlenmesi**...
ve arazisi uygun olup **cömertliğinden** **olup**...
buyurdum ki: ulaştığında **adı geçen** **vakıf**...
hak üzere ve en iyi şekilde **işleriyle** **ilgilenip**...
hak sahiplerine verip ve kontrolünü **sağlamak**...
tasarruflu talep eden ve tahsil **edip**...
yıldızların düğümü **ve şerefi**...
yüce ve şerefli görüşümün **iradesi**...
ulaşıp kimin fikir **yürütmesi**...

44 Halep beylerbeyine mektup: bende gereklilik **görülüp** **belge** **hakim** **olup**...
hüküm giyenler, askerler ve kaleler **teftiş** **edilip**...
talep edilmiş olan mevcut **yerinde** **teftiş**...
bir teftiş yöntemi ve bir emir **gönderilmelidir**...
adı geçen yılın Rebiülahir ayında **gönderilmelidir**...
dört üzerine uzak **teftiş**...
adı geçen kişiye **mektup**...`,
            translit: `42 Şam beglerbegisi ve defterdarına mektub : haliyen saddedini asker **nısfından** **mahallinde** **kasr** **mevkufat** **sahib** **kifayet**...
yerinde def'i mükerrer olunmuş hafız Sinan geçen Şihab oğlu Kasım nam kimesne **fesad ve şekavet**...
namdar defteri başında teftiş idüb baki kalan **üzerinde** **kabz** **itdirüb**...
Sinan naib Sinan 'Atban nam kimesne **'imaret** **itdirüb**...
kabz itdirdüb bakiye olunan esami **teftiş** **olunub**...
ve nısf-ı Rumi serhad ve Rumi ricali ve Dedekenderlü **mahallerinde** **tabi'** **re'aya**...
ve nısf-ı kal'asına tabi' hasıl olan **mevkufat**...
hazinedar olan ve erbab-ı nevbet gibi **fesadından** **'an** **'umdet** **katil**...
kamil katl muktedir olan begler şah ve **kuzgun** **olan** **cerimeler**...
kaderleri vaki' olur ki zikr olunan **eşkiyaya** **rahm** **olunmayub**...
terbiye-i mü'eddeb tob kafirlere gönderüb **def'-i** **fitne** **olunub**...
üzerinde olan kader-i şer'i gayib olanlar **fani** **olub**...
ve kalanı olmayan münkazı-i şer'i **'adil** **olub**...
Kütibe fi evasıt-ı Cemaziye'l-Ahire sene 980

43 Ba'lebek kadısına ve vukuflarıyla geçen **kavli hümayununda müfrede mektub**...
li-ecli'l-maslaha zabt itdirmek **ve mesaha** **kıyas** **mal** **idilmek**...
ve arzı layık olub **semahâtından** **olub**...
buyurdum ki : vusul buldukda **mezkur** **vakıf**...
hakk üzere ve bi'l-vechi'l-hasen **umurunda** **olub**...
hakdarlara virüb ve zabt **itdirmek**...
muktesid talib ve tahsil **idüb**...
'ukde-i kevkeb **ve şeref**...
re'y-i şerif-i vâlâm **iradet**...
iriyüb kim fikr **itdirmesi**...

44 Haleb beglerbegisine mektub : bende iktiza **olunub** **sened** **hakim** **olub**...
mahkum ve asker ve kıla' **teftiş** **olunub**...
iltimas olunmuş kâyin **mahallinde** **teftiş**...
bir vech-i teftiş ve bir yelgove **gönderilmelidir**...
gönderilmelidir Rebi'ü'l-Ahir **sene** **mezbure**...
erba' üzerine uzak **teftiş**...
zeyd kadre **mektub**...`,
            analysis: {
                document_type: "Resmî Yazı",
                confidence: 85,
                style: "Resmî, bürokratik ve hukuki Osmanlı diplomatik dili",
                summary: "Belge, Şam, Baalbek ve Halep bölgelerindeki idari, mali ve asayiş konularına ilişkin divan kararlarını içermektedir. Özellikle Şam'da asayişi bozan eşkıyalık faaliyetlerinin önlenmesi, vakıf gelirlerinin denetlenmesi ve bölgedeki şer'i davaların adilce çözülmesi emredilmektedir.",
                key_points: [
                    "Şam beylerbeyi ve defterdarına gönderilen hükümde, bölgedeki askerlerin ve vakıf gelirlerinin durumu ele alınmaktadır.",
                    "Hafız Sinan ve Şihab oğlu Kasım gibi şahısların çıkardığı fesat ve eşkıyalık olaylarının bastırılması emredilmiştir.",
                    "Baalbek kadısına yönelik hükümde, vakıf arazilerinin tespiti ve adil paylaşımı üzerinde durulmaktadır.",
                    "Halep beylerbeyine yazılan hükümde ise askeri ve idari teftişlerin yapılması talep edilmektedir."
                ],
                people: ["Hafız Sinan", "Kasım", "Sinan Atban"],
                places: ["Şam", "Baalbek", "Halep"],
                concepts: ["Beylerbeyi", "Defterdar", "Qadi", "Mevkufat", "Teftiş"],
                script_type: "Divanî",
                script_purpose: "Mühimme Defteri Kaydı",
                period_estimate: "16. Yüzyıl (II. Selim Dönemi)",
                date_hijri: "Cemaziyelahir 980",
                date_gregorian: "Ekim 1572",
                notes: "Belge, 16. yüzyıl Osmanlı eyalet idaresindeki asayiş sorunlarını, vakıf denetimlerini ve yerel yöneticilerin sorumluluklarını gösteren önemli bir arşiv kaydıdır."
            }
        },
        'hbv': {
            file: 'assets/hbv.png',
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
            tr: `Hacı Bayram Veli yolunda, bu yüce padişahlık nişanını taşıyan, salihlerin **ve süluk edenlerin** örneği, müteveffa Tayyib Baba'nın oğlu es-Seyyid Muhammed Said Baba, zamanımızda en layık ve olgun olanlardan olup, takvasının temizliğiyle Divan-ı Hümayun'a dilekçe sunup Ankara'da bulunan Hacı Bayram Veli Vakfı'nın belirlenmiş vazife ile tevliyet ve meşihatına ve belirlenmiş vazife ile zaviyedarlığına önceden beri şart koşulduğu üzere babasının gelirinden tasarruf etmekte iken ve görevden alınmasını gerektirecek hiçbir hareketi yokken, garaz sahiplerinden es-Seyyid **Halil** Baba'nın oğlu es-Seyyid Kasım Baba en layık evlat ve akraba olduğunu iddia ederek bir yolunu bulup berat ve fetva ile hatt-ı hümayun çıkarttırıp **tarafından** tamamen görevden alınmasına ve ailesiyle perişan olmasına sebep olduğundan, tevliyet, meşihat ve zaviyedarlığın **tarafından** önceden olduğu gibi kendisine ve babasının naiplerine verilmesi ricasıyla lütuf talep etmiştir. Adı geçenin talebi üzerine müsamaha gösterilmesi hususunda padişahın iradesi çıktığından, dilekçesi doğrultusunda işlem yapılmak üzere, derin alimlerin en bilgini, takva sahiplerinin en faziletlisi olan fiilen Şeyhülislam Mevlana Ahmed Esad (Allah faziletlerini daim etsin) işaret ettiğinden, bu işaret uyarınca görevin iade edilmesi fermanım olmuştur. Kendisine padişahlık lütfumun bir nişanesi olarak bin iki yüz yirmi üç senesi Receb ayının dokuzuncu günü tarihiyle tarihlenen ve rûs-ı hümayunum gereğince bu berat-ı hümayunumu verdim ve buyurdum ki: Adı geçenin evlatlarından en olgun ve layık olan müteveffa Tayyib Baba oğlu es-Seyyid Muhammed Said Baba gidip adı geçen vakfın dörtte bir ve yarım hisselerinin tevliyet, meşihat ve zaviyedarlığına şart koşulduğu üzere tasarruf edip hizmetini yerine getirdikten sonra, bundan önce söz konusu görevlerin belirlenmiş maaşlarını alarak tasarruf ettiği gibi yine aynı şekilde belirlenmiş maaşlarını adı geçen vakıfların gelirinden alıp tasarruf ede ve bu yüce beratıma aykırı olarak görevden el çektirilmeye, başkaları tarafından hiçbir müdahale olunmaya...`,
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
                people: ["Mevlana Ahmed Esad", "es-Seyyid Muhammed Said Baba", "Tayyib Baba", "es-Seyyid Kasım Baba", "es-Seyyid Halil Baba"],
                places: ["Ankara"],
                concepts: ["tevliyet", "meşihat", "zâviyedarlık", "berât-ı hümâyûn", "vakıf", "Şeyhülislâm"],
                script_type: "Dîvânî",
                script_purpose: "Atama ve Hak İadesi Beratı",
                period_estimate: "II. Mahmud Dönemi",
                date_hijri: "9 Receb 1223",
                date_gregorian: "31 Ağustos 1808",
                notes: "Belge, Hacı Bayram Veli soyundan gelenler arasındaki vakıf görevleri ihtilafını ve Şeyhülislamın müdahalesiyle hakkın iade edilmesini konu almaktadır."
            }
        },
        'hmg': {
            file: 'assets/hmg.png',
            name: 'hanimlara_mahsus_gazete.png',
            size: '0.04 MB',
            ocr: `خاتونلره مخصوص غزته‌نك
خانملره مخصوص
قسمی
نومرو ٣     فی ٥ مارت سنه ٣١٣
غزته‌مزك بوقسمی «ابكار و امهات» ه خدمت مخصوصه اولمق اوزره تشكيل ايدلمشدر
اعتلاى امتك سرمايه‌سى دختران معرفت آثاردور
**شهير مجموعه الايكاددر مانكيزيك فضائلى ارات**

منكشه
اى رنك روى بهار اولان منكشه
بودر فضيلت و محجوبيت
حزين بر قلبك مؤثر و طاتلى بر خيالى
بكرسين!!.. شو چمنلر آره سندن
نشر ايلديكك رايحه لطيفه انسايه تازه،
طاتلى حيات بخش ايدييور. يشيل بر
ميشه آغاجنك سايه صفا آورنده
نظر تحسيندن كيزلنمك ايچون جلا
ساز عيون اولان صيق چمنلر آره سنه
صوقيلورسين! فقط نشر ايتديکك
كوزل قوقولرله معطر هواى نسيمى
بكا بولديغك محلى درعقب اخطار
و افهام ايدييور!.
قورقمه! قورقمه! بن سنك يالكز
مفتون لطافت و حقارتكم، چمنلر
اوزرنده كى مناظر طبيعه نك بنى دها
زياده مفتون ايده بيليور. بن سنك
قيمتكى تقدير ايتديكم ايچون بهار حياتكه
صاله دست غدر ايتمكى مصماً روا
كورمهم. بك ضعیف اولان جسمكله
انسانلرك روح و فكرينه القا ايلديكك
حسيات لطيفه حقيقةً بك فوق العاده،
بك شاعرانه در.
سنك مزيت و خدمتك حق بين
اولانلر نزدنده محافظه حياتكى تأمين
ايدر. عمر طبيعندن استفاده ايده
مييلر هيچ بر مزيته. بو قيمته مالك
اولميانلردر.
كافة ذيروحك نباتاتدن هيچ بر
فرقى يوقدر. هم نوعنه خدمت ايتمك
ايچون كوچكلکنده چاليشه‌رق حليه
فضل و كمال ايله تزيين ذات و صفات
ايدن انسانلرك سنك كبى قوقولى و
لطيف چيچكلردن فرقى يوقدر. جاهل
و قسمت معارفدن محروم قالانلر ايسه
احاله نظره بيله تنزل ايدلمين خار
و خاشاك مثلندندر
سيروزلو رجائى خليل حلوى
افندى كريمه‌سى
لمان

ایکی محرره بیننده مکالمه
خديجه خانم ايله سميحه خانم
خ — همشهريم كچن هفته غالباً
سهو ترتيب اوله‌رق سوزلرمز بربرينه
قاريشدى.
س — اويله اولمش اما ضررى
يوق، مقصدينه يتدى. همده بنده كز
والده كزك او كوزل سوزينه قارشى`,
            tr: `Hatunlara mahsus gazetenin
Hanımlara Mahsus
Kısmı
Numara 3     5 Mart sene 1313
Gazetemizin bu kısmı "genç kızlar ve anneler"e özel hizmet etmek üzere oluşturulmuştur.
Milletin yükselmesinin sermayesi, marifet eserleri gösteren kızlardır.
**Şehir mecmuası el-İkad'dır mankizik fezaili erat**

Menekşe
Ey baharın yüzünün rengi olan menekşe!
Budur fazilet ve mahcubiyet.
Hüzünlü bir kalbin etkileyici ve tatlı bir hayali gibi
Beklersin!!.. Şu çimenler arasından
Yaydığın o hoş koku insana taze,
Tatlı bir hayat bahşediyor. Yeşil bir
Meşe ağacının safa veren gölgesinde,
Beğeni dolu bakışlardan gizlenmek için gözleri süsleyen
Sık çimenler arasına
Sokulursun! Fakat yaydığın
Güzel kokularla bezenmiş rüzgarın havası,
Bana bulunduğun yeri hemen haber veriyor
Ve anlatıyor!.
Korkma! Korkma! Ben senin yalnızca
Güzelliğine ve alçakgönüllülüğüne hayranım; çimenler
Üzerindeki doğal manzaralar beni daha
Çok büyüleyebilir. Ben senin
Değerini takdir ettiğim için, hayatının baharına
Haksızlık elini uzatmayı asla uygun
Görmem. Pek zayıf olan bedeninle
İnsanların ruhuna ve fikrine aşıladığın
O hoş duygular gerçekten pek fevkalade,
Pek şairanedir.
Senin meziyetin ve hizmetin, hakkı görenler
Nezdinde hayatının korunmasını temin
Eder. Doğal ömründen istifade edemeyenler
Hiçbir meziyete, bu değere sahip
Olmayanlardır.
Bütün canlıların bitkilerden hiçbir
Farkı yoktur. Kendi türüne hizmet etmek
İçin küçüklüğünde çalışarak erdem ve olgunluk
Süsüyle kendi zatını ve sıfatlarını süsleyen
İnsanların, senin gibi kokulu ve
Hoş çiçeklerden farkı yoktur. Cahil
Ve bilgi nasibinden mahrum kalanlar ise,
Bakmaya bile tenezzül edilmeyen diken
Ve çer çöp gibidir.
Sirozlu Recai Halil Halvi
Efendi'nin kızı
Leman

İki Kadın Yazar Arasında Konuşma
Hatice Hanım ile Semiha Hanım
H — Hemşehrim, geçen hafta galiba
Dizgi hatası olarak sözlerimiz birbirine
Karıştı.
S — Öyle olmuş ama zararı
Yok, amacına ulaştı. Hem de bendeniz
Annenizin o güzel sözüne karşı`,
            translit: `Hatunlara mahsus gazetenin
Hanımlara Mahsus
Kısmı
Numara 3     Fi 5 Mart sene 313
Gazetemizin bu kısmı "ebkâr ve ümmehât"a hizmet-i mahsusa olmak üzere teşkil edilmiştir
İ'tilâ-yı ümmetin sermayesi duhterân-ı ma'rifet-âsârdır
**Şehir mecmuası el-İkad'dır mankizik fezaili erat**

Menekşe
Ey reng-i rû-yı bahar olan menekşe
Budur fazilet ve mahcubiyet
Hazin bir kalbin müessir ve tatlı bir hayali
Beklersin!!.. Şu çemenler arasından
Neşr eylediğin rayiha-i latife insana taze,
Tatlı hayat bahş ediyor. Yeşil bir
Meşe ağacının saye-i safa-âverinde
Nazar-ı tahsinden gizlenmek için cilâ
Sâz-ı uyûn olan sık çemenler arasına
Sokulursun! Fakat neşr ettiğin
Güzel kokularla muattar havâ-yı nesîmi
Bana bulduğun mahalli der-akab ihtar
Ve ifham ediyor!.
Korkma! Korkma! Ben senin yalnız
Meftun-ı letafet ve hakaretinim, çemenler
Üzerindeki menâzır-ı tabiiyenin beni daha
Ziyade meftun edebiliyor. Ben senin
Kıymetini takdir ettiğim için bahar-ı hayatına
Sâle-i dest-i gadr etmeyi musammem-i revâ
Görmem. Pek zaif olan cisminle
İnsanların ruh ve fikrine ilka eylediğin
Hissiyat-ı latife hakikaten pek fevkalade,
Pek şairanedir.
Senin meziyet ve hizmetin hak-bîn
Olanlar nezdinde muhafaza-i hayatını temin
Eder. Ömr-i tabiinden istifade ede
meyeler hiçbir meziyete. Bu kıymete malik
Olmayanlardır.
Kâffe-i zî-rûhun nebatattan hiçbir
Farkı yoktur. Hem-nev'ine hizmet etmek
İçin küçüklüğünde çalışarak hilye-i
Fazl u kemal ile tezyin-i zat ve sıfat
Eden insanların senin gibi kokulu ve
Latif çiçeklerden farkı yoktur. Cahil
Ver kısmet-i maariften mahrum kalanlar ise
İhale-i nazara bile tenezzül edilmeyen har
Ve haşak mislindendir
Sirozlu Recai Halil Halvi
Efendi kerimesi
Leman

İki muharrire beyninde mükâleme
Hatice Hanım ile Semiha Hanım
Ha — Hemşehrim geçen hafta galiba
Sehv-i tertib olarak sözlerimiz birbirine
Karıştı.
Se — Öyle olmuş ama zararı
Yok, maksadına yetti. Hem de bendeniz
Validenizin o güzel sözüne karşı`,
            analysis: {
                document_type: "Gazete / Dergi",
                confidence: 92,
                style: "Edebi, öğretici ve söyleşi tarzında kaleme alınmış bir dille yazılmıştır.",
                summary: "Hanımlara Mahsus Gazete'nin bu ekinde genç kızlar ve anneler için eğitici ve edebi yazılar sunulmaktadır. Sayfada Leman Hanım'ın ahlaki ve felsefi çıkarımlar içeren 'Menekşe' başlıklı yazısı ile Hatice Hanım ve Semiha Hanım arasındaki edebi söyleşi yer almaktadır.",
                key_points: [
                    "Gazetenin bu özel bölümü genç kızların ve annelerin eğitimine katkı sağlamak amacıyla çıkarılmıştır.",
                    "Leman Hanım, menekşe çiçeği üzerinden alçakgönüllülük, erdem ve cehalet kavramlarını sorgulamaktadır.",
                    "Eğitimden mahrum kalan cahil insanlar, doğadaki değersiz diken ve çer çöpe benzetilmiştir.",
                    "Hatice Hanım ve Semiha Hanım arasındaki diyalogda bir önceki sayıdaki dizgi hatasından bahsedilmektedir."
                ],
                people: ["Leman", "Recai Halil Halvi Efendi", "Hatice Hanım", "Semiha Hanım"],
                places: ["Siroz"],
                concepts: ["ebkâr ve ümmehât", "maarif", "fazl u kemal"],
                script_type: "Matbu",
                script_purpose: "Süreli Yayın / Gazete",
                period_estimate: "II. Abdülhamid Dönemi",
                date_hijri: "Belirtilmemiş",
                date_gregorian: "17 Mart 1898",
                notes: "Belgenin sağ tarafındaki dikey dize oldukça yıpranmış ve silik olduğundan tahmini olarak okunmuştur."
            }
        },
        'tah': {
            file: 'assets/tah.png',
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
            tr: `Tercüman-ı Ahval
11 Şevval Pazar 1277 Sayı 25
İşbu gazete iç ve dış her türlü haberler ile fen ve sanayiye dair konuları içerecek şekilde **iki günde bir** pazar, salı ve perşembe günleri çıkar. Abonelik isteyenler İstanbul'da Bahçekapısı üzerinde bulunan matbaasına müracaat etsinler. İstanbul için **üç aylığı** (150) ve altı aylığı (80) kuruştur. Taşra için postahane ücreti de eklenir. Bir nüshası (40) paradır.

İç Haberler
Tercüman-ı Ahval şimdiye kadar haftada bir kere olarak çıkarılmış ise de bu gazetenin ortaya çıkışından beri diğer yerel gazetelerde görülen ilerleme eserlerine bakılarak bundan sonra bizim bu durumda devam etmemiz uygun görülmez. Haftada bir kere yayınlanması yeterli olamayacağından daha sık çıkarılması gerekmiştir. Çünkü medeniyet eserlerini en yüksek dereceye ulaştırarak geçmiş asırlara her bakımdan üstünlüğü açık olan zamanımızda, telgraf odası vasıtasıyla dünyanın her tarafından alınan önemli siyasi haberlerin yayınlanmasının hafta başına kadar geciktirilmesi faydalı işler hakkında bir haksızlık olmaktadır. İşte bu genel faydaya dayanarak bundan böyle Tercüman-ı Ahval'in de haftada üç kere yani pazar, salı ve perşembe günleri çıkarılması ve bazı dostlarımızın yardımıyla yazım ve düzenlenmesine eskisinden daha fazla dikkat edilmesi bir görev sayılmıştır. Bu şekilde basılarak **okunmasına** ilgi gösteren kişilerin memnuniyetinin kazanılması en büyük amacımızdır.

Atamalar
Devletli İsmail Paşa hazretlerinin rahatsız **olduğuna** dayanarak bu sene İpek Teftiş Komisyonu başkanlığı ek göreviyle Rumeli ve Balkan ve Ordu-yı Hümayun müşirliği yüksek meclislerine memur devletli refetli Ömer Paşa hazretlerine
Hazine-i Hassa-i Şahane bakanlığı devletli Hasib Paşa hazretlerine
Erzurum valisi devletli Edhem Paşa hazretlerinin görevden ayrılması üzerine adı geçen eyalete ve **tamamen** eski Sivas valisi devletli Hayreddin Paşa hazretlerine
Maliye Meclisi Tanzimat üyeliği eski Hazine-i Hassa bakanı atufetli Rıza Efendi hazretlerine
Kapı kâtipliği Murtaza Ali Efendi tarafından vekaleten yürütüldüğünden, söz konusu muhasebeciliğe eski Rumeli muhasebecisi izzetli Emin Efendi'ye
Halep muhasebecisi izzetli Hertin Efendi'nin görevden ayrılmasıyla adı geçen muhasebeciliğe eski Rufe muhasebecisi rıfatlı Seyfi Efendi'ye

(Bazı yerlere memur edilen naipler)
Direli Debdebe Azmi Efendi - Noveberde'ye
Kavala müftüsü Lebib Mehmed Emin Efendi - Sultan Selim Debre-i Kefe ambarına
Menufak Ahmed Şakir Efendi - Travnik'e
Ergirili Ahmed Şahin Efendi - Sjenica'ya
İstanbul mahkemesi kâtiplerinden Abdülkerim Şemi Efendi - Budaközü'ne`,
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
                places: ["İstanbul", "Rumeli", "Balkan", "Erzurum", "Sivas", "Halep", "Kavala", "Travnik", "Budaközü"],
                concepts: ["Havadis-i Dahiliye", "Tevcihat", "Hazine-i Hassa-i Şahane", "Meclis-i Maliye", "Nâib"],
                script_type: "Matbu",
                script_purpose: "Haber ve İlan",
                period_estimate: "Osmanlı Tanzimat Dönemi",
                date_hijri: "11 Şevval 1277",
                date_gregorian: "21 Nisan 1861",
                notes: "Belgenin alt kısımlarında bazı isimler ve yer adları matbaa baskısından dolayı hafif silik çıkmıştır."
            }
        },
        'ssp': {
            file: 'assets/ssp.png',
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
            tr: `Gecede tam on iki cam ışık bulup aydınlanır ve adı geçen şekillerin hepsi bu şekildedir ki gelecek sayfada resmedilmiş ve yazılmıştır.

İkinci fasıl, sözü edilen işler için gerekli olan hazne, iki kase ve memleketlerin durumunu açıklar; öncelikle gerekli olan huni (kap) bakırdan yapılmış olup boğazındaki uzunluğu altmış **arşın** ve genişliği beş karış olup, adı geçen kabın alt tarafında bir delik vardır ki o kapta dolu olan suyun, **kovanın** enleminin en uzun gününün saatleri süresince o delikten tamamen çıkması lazımdır; **su saati** dördüncü iklimde kurulursa, onun en uzun günü on dört buçuk saat ve gündüzdür.`,
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
                concepts: ["Pengâh", "Su Saati", "Hazne", "İklim", "Hiyel"],
                script_type: "Nesih",
                script_purpose: "Bilimsel ve teknik bilgi aktarımı",
                period_estimate: "Osmanlı Dönemi (18. veya 19. yüzyıl)",
                date_hijri: "Belirtilmemiş",
                date_gregorian: "Belirtilmemiş",
                notes: "Metin, Banu Musa kardeşlerin veya El-Cezeri'nin hiyel (mekanik) kitaplarının Osmanlıca tercümelerinden (muhtemelen Tercüme-i Hiyel) bir sayfadır. Satır aralarında sonradan yapılmış düzeltmeler (derkenar/düzeltme notları) bulunmaktadır."
            }
        },
        'sya': {
            file: 'assets/sya.png',
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
            tr: `İlan

Şehir içinde silah atılmasının kanunen yasak olduğu bilinmektedir.
Halbuki özel günlerde bu yasağın aksine silah
atılmaktadır, bunun zararları ise ortadadır. Bu sebeple
şimdiden bütün mahallelerin imam ve muhtarlarına gerekli uyarıların
yapılmasıyla bayramda ve diğer günlerde hiçbir kimsenin şenlik için (silah)
atmaması ve şayet atan olursa zabıtaca **tutulup**
on gün hapsedildikten sonra para cezası da
alınarak cezalandırılması Vilayet İdare Meclisi'nden bildirilerek
**kolluk kuvvetlerine** emredilip tebliğ edilmiş olmakla, ona göre bütün imam ve muhtarların
mahallelerindeki delikanlılara bundan sonra hangi gün olursa
olsun silah atılmayacağını ve şayet atan olursa hapis
ve ceza uygulanacağını güzelce anlatıp yasağa dikkat etmeleri
tembih olunur.`,
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
                concepts: ["Meclis-i İdâre-i Vilâyet", "münzâbıta", "imâm", "muhtâr", "cezâ-yı nakdî"],
                script_type: "Matbu",
                script_purpose: "Kamuoyunu bilgilendirme ve uyarı",
                period_estimate: "Geç Osmanlı Dönemi",
                date_hijri: "Belirtilmemiş",
                date_gregorian: "Belirtilmemiş",
                notes: "Belge matbu (baskı) harflerle yazılmış resmi bir duyurudur. Bazı kelimeler mürekkep dağılması nedeniyle hafif silik çıksa da bağlamdan net olarak anlaşılmaktadır."
            }
        },
        'gkt': {
            file: 'assets/gkt.png',
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
            tr: `Şark Ordusu Kumandanı Devletlü Kazım Karabekir Paşa Hazretlerine

Devletlü Efendim Hazretleri,
'İnsanların hayırlısı, Cenâb-ı Hakk'ın kendisini ümmetin ihtiyaçlarında istihdam ettiği kimsedir' mealindeki hadîs-i şerîfi yüksek hatırınıza getirmek suretiyle arz-ı hâl ve içimdeki istirhamı sunmaya başlarım.
Gümüşhanevî Ahmed Ziyâeddin Efendi (kuddise sırruhû) hazretlerinin Of, Rize ve Bayburt memleketlerinde bulunan üç adet kütüphanesinin başmütevellîsi olan duacınız, son işgal sırasında bu kasabaların Bayburt tarafında bulunan Ruslar tarafından tahrip edildiğini ve kitapların tamamen Tiflis'e nakledildiğini son araştırmalarımla ortaya çıkarmış bulunmaktayım. Bu kitaplar dinî kitaplar olduğundan ve Müslümanlarca kutsal/saygın kabul edildiğinden, geri getirilerek yeniden istifadeye sunulması ve adı geçen Şeyh Hazretlerinin kitaplarının her hâlükârda büyük gayretlere muhtaç olduğu görülmüştür.
Allah'ın yardımının, O'nun dinine yardım edeceklerle beraber olduğu herkesçe bilinen bir gerçektir. Bu arz edilen meselenin hayırla sonuçlanması, yüce gayretlerin en çok hak ettiği bir durum olduğu duacınızca bilindiğinden, söz konusu kitapların Tiflis'ten geri getirilmesi için gerekli girişimlerin tamamlanmasını rica ve niyaz ederim. Fermân [efendimindir].
5 Teşrîn-i Sânî 1336
5 Kasım 1921
Of kazası müderrislerinden
Hoca Ferşad İbrahim`,
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
                concepts: ["hadîs-i şerîf", "kütüphane", "mütevellî", "müderris"],
                script_type: "Nesih",
                script_purpose: "Resmî yazışma ve dilekçe",
                period_estimate: "Milli Mücadele Dönemi",
                date_hijri: "Belirtilmemiş",
                date_gregorian: "5 Kasım 1921",
                notes: "Belge, matbu (basılı) bir yazı karakterine sahiptir ve oldukça okunaklıdır. Tarih kısmında hem Rumi (1336) hem de Miladi (1921) tarihler yan yana verilmiştir."
            }
        },
        'ase': {
            file: 'assets/ase.png',
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
            tr: `Gereğince amel olunsun
diye emredilmiştir.

Padişahım

Şevketli, kerametli, heybetli efendim, velinimetim efendim,
Allah'ın yardımı ve inayetiyle bundan böyle belirli ve izinli askerlerin sefere **yiyecek tedarikiyle** sevk ve gönderilmesi sağlanacaktır.
Askeri sınıfların **ortaya çıkan tüm meselelerde temel** ve karar birliğiyle ittifak halinde ve tamamen gerçekleştirdiği işlerin **bazı nizamsızlıklardan**
ve her iki tarafı da içeren şartlardan uzak, aralarında anlaşmazlık olmaksızın, düzgün ve güvenilir bir şekilde yürütülmesi için, orta kollarında bulunan yüce vezirler, beylerbeyleri,
askeri zabitler, kadılar ve naiblere hitaben çıkarılmış ve ifade edilmiş olan şerif emirlerin, korunan memleketlerde bulunan
şehir, köy ve kasabalardaki mahkeme **sicillerine** kaydedilmesi ve daima kılavuz edinilmesi amacıyla, vezirlere hitaben
padişahın hatt-ı hümayununun yazılması gerektiğinden, bahsedilen **altı** adet şerif emrin padişahın
nurlu huzuruna sunulduğu, padişahın bilgisi dahilinde olduğunda her birinin vezirlere hitaben ayrı ayrı
"gereğince amel olunsun" şeklinde mübarek hatt-ı hümayunlarının yazılması hususunda emir ve ferman şevketli, kerametli,
heybetli efendim, velinimetim efendim padişahım hazretlerinindir.`,
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
                concepts: ["hatt-ı hümayun", "vezirler", "beylerbeyleri", "sicil", "kadılar", "naibler"],
                script_type: "Rik'a",
                script_purpose: "Padişaha sunulan arz ve üzerine yazılan hatt-ı hümayun",
                period_estimate: "18. veya 19. Yüzyıl",
                date_hijri: "Belirtilmemiş",
                date_gregorian: "Belirtilmemiş",
                notes: "Belgenin sol üst köşesinde padişahın 'mûcebince amel oluna' şeklindeki hatt-ı hümayunu yer almaktadır."
            }
        },
        'phd': {
            file: 'assets/phd.png',
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

    // entityFilterTrigger/entityFilterMenu ("Filtrele ▾") kendi aç/kapa ve
    // dış-tıklama mantığını kullanır — menü içeriği sabit olmayıp her
    // açılışta renderEntityFilterMenu() ile yeniden kurulur (bkz. aşağıdaki
    // "Kategoriye Göre Filtrele" bölümü), çünkü kategori listesi belgeye
    // göre değişiyor. setOutputTab() ÇAĞIRMAZ — panel içindeki bir
    // kategoriye tıklamak sekme değiştirmez, sadece transTextDisplay'e bir
    // filtre attribute'u uygular.
    entityFilterTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        closeEntityPopover();
        closeWordAlternativesPopover();
        const isOpen = !entityFilterMenu.classList.contains('hidden');
        if (!isOpen) renderEntityFilterMenu();
        entityFilterMenu.classList.toggle('hidden', isOpen);
        entityFilterTrigger.setAttribute('aria-expanded', String(!isOpen));
    });

    document.addEventListener('click', (e) => {
        if (!entityFilterDropdown.contains(e.target)) closeEntityFilterDropdown();
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

    // --- Sample Image Click Handlers ---
    document.querySelectorAll('.sample-card').forEach(card => {
        card.addEventListener('click', () => {
            const key = card.getAttribute('data-sample');
            const sample = sampleDatabase[key];
            if (sample) {
                assistantHistory.length = 0;
                assistantSelectedContext = null;
                assistantMessages.innerHTML = '';
                state.selectedFile = { name: sample.name };
                state.imageDataUrl = sample.file;
                state.enhancedImageUrl = sample.file;
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

    // map.html'deki şehir kartlarındaki "İlgili Eser" linki
    // (index.html?sample=X) buraya geldiğinde, o örnek belgeyi yukarıdaki
    // .sample-card tıklama mantığıyla birebir aynı şekilde otomatik yükler.
    const deepLinkSampleKey = new URLSearchParams(window.location.search).get('sample');
    if (deepLinkSampleKey) {
        const targetCard = document.querySelector(`.sample-card[data-sample="${CSS.escape(deepLinkSampleKey)}"]`);
        if (targetCard) targetCard.click();
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

    // Clears the "Bilgi" tab back to its empty state and hides the tab
    // button itself — there's nothing useful to show until a translation
    // with analysis data has completed.
    function clearInfoTab() {
        infoEmptyState.classList.remove('hidden');
        infoContentWrapper.classList.add('hidden');
        infoTabBtn.classList.add('hidden');
        // "Filtrele ▾" de aynı "henüz gösterecek bir şey yok" anlarında
        // (yeni belge seçildi/sıfırlandı/işlem başarısız oldu) gizlenmeli
        // — clearInfoTab() zaten tam bu 4 noktada çağrıldığı için buraya
        // eklemek, ayrı bir fonksiyonu aynı 4 yerde çağırmayı unutma
        // riskinden kaçınıyor. Gösterme kararı processTranslation'da,
        // transTextDisplay'de gerçekten entity-tag var mı diye bakılarak
        // ayrıca veriliyor (bkz. aşağısı).
        entityFilterDropdown.classList.add('hidden');
        closeEntityFilterDropdown();
        // AI Belge Araçları da Bilgi ile aynı anlarda gizlenir — araçların
        // dayandığı state.transText artık geçersiz.
        aiToolsTabBtn.classList.add('hidden');
        setAiToolsExpanded(false);
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

    // Renders "Etiket: değer" lines (used for Yazı & Dil / Tarih & Bağlam,
    // now shown inline inside İçerik Analizi instead of their own tabs).
    function buildDetailLines(container, fields) {
        container.innerHTML = '';
        const usable = fields.filter(f => f.value !== undefined && f.value !== null && String(f.value).trim() !== '');

        if (usable.length === 0) {
            container.innerHTML = '<span class="entity-empty-text">Tespit edilemedi</span>';
            return;
        }

        usable.forEach(f => {
            const line = document.createElement('div');
            line.className = 'detail-line';
            line.innerHTML = `<span class="detail-line-label"></span> <span class="detail-line-value"></span>`;
            line.querySelector('.detail-line-label').textContent = f.label + ':';
            line.querySelector('.detail-line-value').textContent = f.value;
            container.appendChild(line);
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

        // Yazı & Dil (İçerik Analizi sekmesi içinde, Kişiler/Yerler/Kavramlar yanında)
        buildDetailLines(resultScriptDetails, [
            { label: 'Yazı Tipi (Hat)', value: data.script_type },
            { label: 'Yazının Amacı', value: data.script_purpose },
        ]);

        // Tarih & Bağlam (İçerik Analizi sekmesi içinde)
        buildDetailLines(resultDateDetails, [
            { label: 'Tarih (Hicrî)', value: data.date_hijri },
            { label: 'Tarih (Miladî)', value: data.date_gregorian },
            { label: 'Tahmini Dönem', value: data.period_estimate },
        ]);

        // Notlar
        resultNotes.textContent = data.notes || 'Bu belge için ek not bulunmuyor.';

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

        // "Filtrele ▾" sekme çubuğunda sadece gerçekten filtrelenecek bir
        // şey varsa görünsün — backend'in people/places/concepts dediğine
        // değil, ekranda (SADECE trans kolonunda) fiilen render edilmiş
        // .entity-tag sayısına bak.
        const hasFilterableEntities = transTextDisplay.querySelector('.entity-tag') !== null;
        entityFilterDropdown.classList.toggle('hidden', !hasFilterableEntities);

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
            .map((e, i) => `(?<e${i}>${escapeRegExp(escapeHtml(e.text))})`)
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
        getText: () => transTextDisplay.textContent.normalize('NFC').replace(/[\u0300-\u036f]/g, ''),
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
    function cleanTranslitForTts(text) {
        if (!text) return text;
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
        getText: () => enTextDisplay.textContent.normalize('NFC').replace(/[\u0300-\u036f]/g, ''),
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
    if (!state.authToken) {
        const GUEST_NOTES_KEY = 'divane_guest_notes';
        const GUEST_AI_NOTE_USED_KEY =
            'divane_guest_ai_note_used';

        const aiNoteAlreadyUsed =
            localStorage.getItem(
                GUEST_AI_NOTE_USED_KEY
            ) === 'true';

        if (aiNoteAlreadyUsed) {
            alert(
                'Misafir olarak yalnızca 1 AI sonucunu ' +
                'notlarınıza ekleyebilirsiniz. ' +
                'Daha fazla AI notu kaydetmek için giriş yapın.'
            );

            return false;
        }

        let guestNotes = [];

        try {
            const storedNotes = JSON.parse(
                localStorage.getItem(
                    GUEST_NOTES_KEY
                ) || '[]'
            );

            guestNotes =
                Array.isArray(storedNotes)
                    ? storedNotes
                    : [];

        } catch (error) {
            guestNotes = [];
        }

        guestNotes.push({
            id:
                'guest_ai_' +
                Date.now(),

            content:
                content,

            source_type:
                sourceType,

            is_completed:
                false,

            created_at:
                new Date().toISOString()
        });

        localStorage.setItem(
            GUEST_NOTES_KEY,
            JSON.stringify(guestNotes)
        );

        localStorage.setItem(
            GUEST_AI_NOTE_USED_KEY,
            'true'
        );

        return true;
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

        function renderNavSearchResults(docs, query) {
            if (!docs.length) {
                navSearchResults.innerHTML = `<p class="nav-search-empty">Eşleşen belge bulunamadı.</p>`;
                return;
            }
            const itemsHtml = docs.slice(0, 4).map(doc => `
                <button type="button" class="nav-search-result-item" data-doc-id="${doc.id}">
                    <span class="nav-search-result-thumb">${doc.thumbnail_url ? `<img src="${doc.thumbnail_url}" alt="">` : '📄'}</span>
                    <span class="nav-search-result-title">${escapeHtml(doc.title || doc.filename || '')}</span>
                </button>
            `).join('');
            navSearchResults.innerHTML = itemsHtml + `<a href="#" class="nav-search-more" data-query="${escapeHtml(query)}">Daha fazlası →</a>`;
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
            if (!state.authToken) {
                navSearchResults.innerHTML = `<p class="nav-search-empty">Arama için giriş yapmalısınız.</p>`;
                return;
            }
            navSearchTimer = setTimeout(async () => {
                const requestId = ++navSearchRequestId;
                try {
                    const res = await fetch(`${API_BASE_URL}/api/documents?per_page=4&q=${encodeURIComponent(query)}`, {
                        headers: { 'Authorization': `Bearer ${state.authToken}` }
                    });
                    if (requestId !== navSearchRequestId) return;
                    if (!res.ok) { navSearchResults.innerHTML = ''; return; }
                    const data = await res.json();
                    renderNavSearchResults(data.documents || [], query);
                } catch (err) {
                    navSearchResults.innerHTML = '';
                }
            }, 350);
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
            const item = e.target.closest('.nav-search-result-item');
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
                appendAssistantMessage('bot', reply);
                assistantHistory.push({
                    role: 'assistant',
                    content: reply
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

