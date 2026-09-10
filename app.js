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
        apiKey: localStorage.getItem('gemini_api_key') || '',
        engine: localStorage.getItem('translation_engine') || 'gemini-flash',
        history: JSON.parse(localStorage.getItem('translation_history') || '[]'),
        authToken: localStorage.getItem('auth_token') || null,
        authEmail: localStorage.getItem('auth_email') || null
    };

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

    const themeToggleBtn = document.getElementById('themeToggleBtn');
    const settingsBtn = document.getElementById('settingsBtn');
    const settingsModal = document.getElementById('settingsModal');
    const apiKeyInput = document.getElementById('apiKeyInput');
    const modelSelect = document.getElementById('modelSelect');
    const saveSettingsBtn = document.getElementById('saveSettingsBtn');
    const historyList = document.getElementById('historyList');

    // Hesap (Giriş / Kayıt) modalı
    const profileBtn = document.getElementById('profileBtn');
    const authModal = document.getElementById('authModal');
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
    const registerEmail = document.getElementById('registerEmail');
    const registerPassword = document.getElementById('registerPassword');
    const registerPasswordConfirm = document.getElementById('registerPasswordConfirm');
    const registerSubmitBtn = document.getElementById('registerSubmitBtn');
    const logoutBtn = document.getElementById('logoutBtn');

    const documentProfile = document.getElementById('documentProfile');
    const enhancedToggle = document.getElementById('enhancedToggle');
    const enhanceStatusIcon = document.getElementById('enhanceStatusIcon');
    const heroStartBtn = document.getElementById('heroStartBtn');

    // Output tab dropdowns ("Osmanlıca Metin" script dropdown, translation
    // language dropdown) and the "Bilgi" tab.
    const ocrTabBtn = document.getElementById('ocrTabBtn');
    const translitTabBtn = document.getElementById('translitTabBtn');
    const scriptDropdown = document.getElementById('scriptDropdown');
    const scriptDropdownTrigger = document.getElementById('scriptDropdownTrigger');
    const scriptDropdownMenu = document.getElementById('scriptDropdownMenu');
    const langDropdown = document.getElementById('langDropdown');
    const langDropdownTrigger = document.getElementById('langDropdownTrigger');
    const langDropdownMenu = document.getElementById('langDropdownMenu');
    const langDropdownLabel = document.getElementById('langDropdownLabel');
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
        }
    };

    // --- Smooth Scroll (native browser smooth-scroll; no wheel-hijacking library) ---
    function smoothScrollTo(target, options = {}) {
        const el = typeof target === 'string' ? document.querySelector(target) : target;
        if (!el) return;
        el.scrollIntoView({ behavior: 'smooth', block: options.block || 'start' });
    }

    // --- Scroll Reveal (fade + slide up every time an element enters the viewport) ---
    const revealObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            entry.target.classList.toggle('is-visible', entry.isIntersecting);
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

    
    // --- Output Selector: three tab groups side by side, like sheet tabs —
    // "Transkript" dropdown (Osmanlıca Arapça harfler / Türkçe harfler), a
    // translation language dropdown (Türkçe / İngilizce), and a plain
    // "Bilgi" tab for the document analysis (see renderResultsPanel /
    // clearInfoTab). Unlike the language dropdown, the Transkript trigger
    // keeps its static "Transkript" label regardless of which script is
    // selected — it names the category, not the current choice.
    const TRANSLATION_TAB_LABELS = {
        trans: 'Türkçe Çeviri',
        en: 'İngilizce Çeviri',
    };

    function setOutputTab(tab) {
        closeEntityPopover();
        closeWordAlternativesPopover();
        closeEntityFilterDropdown();
        resetEntityFilter();
        document.querySelectorAll('.output-select-btn').forEach(b => {
            b.classList.toggle('active', b.getAttribute('data-output-tab') === tab);
        });
        document.querySelectorAll('.output-tab-tools').forEach(t => {
            t.classList.toggle('tab-active', t.getAttribute('data-tools-for') === tab);
        });
        ocrOutputBox.classList.toggle('hidden', tab !== 'ocr');
        translitOutputBox.classList.toggle('hidden', tab !== 'translit');
        transOutputBox.classList.toggle('hidden', tab !== 'trans');
        enOutputBox.classList.toggle('hidden', tab !== 'en');
        infoOutputBox.classList.toggle('hidden', tab !== 'info');

        // The Transkript trigger's label stays static ("Transkript"); it
        // only highlights "active" while one of its own options (not a
        // sibling group's) is the selected tab.
        scriptDropdownTrigger.classList.toggle('active', tab === 'ocr' || tab === 'translit');

        if (TRANSLATION_TAB_LABELS[tab]) {
            langDropdownLabel.textContent = TRANSLATION_TAB_LABELS[tab];
        }
        langDropdownTrigger.classList.toggle('active', tab === 'trans' || tab === 'en');
    }

    function closeScriptDropdown() {
        scriptDropdownMenu.classList.add('hidden');
        scriptDropdownTrigger.setAttribute('aria-expanded', 'false');
    }

    function closeLangDropdown() {
        langDropdownMenu.classList.add('hidden');
        langDropdownTrigger.setAttribute('aria-expanded', 'false');
    }

    scriptDropdownTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = !scriptDropdownMenu.classList.contains('hidden');
        scriptDropdownMenu.classList.toggle('hidden', isOpen);
        scriptDropdownTrigger.setAttribute('aria-expanded', String(!isOpen));
    });

    scriptDropdownMenu.addEventListener('click', (e) => {
        const item = e.target.closest('.lang-dropdown-item');
        if (!item) return;
        setOutputTab(item.getAttribute('data-output-tab'));
        closeScriptDropdown();
    });

    langDropdownTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = !langDropdownMenu.classList.contains('hidden');
        langDropdownMenu.classList.toggle('hidden', isOpen);
        langDropdownTrigger.setAttribute('aria-expanded', String(!isOpen));
    });

    langDropdownMenu.addEventListener('click', (e) => {
        const item = e.target.closest('.lang-dropdown-item');
        if (!item) return;
        setOutputTab(item.getAttribute('data-output-tab'));
        closeLangDropdown();
    });

    infoTabBtn.addEventListener('click', () => setOutputTab('info'));

    // entityFilterTrigger/entityFilterMenu ("Filtrele ▾") diğer sekme
    // dropdown'larıyla (scriptDropdown/langDropdown) AYNI aç/kapa ve
    // dış-tıklama mantığını kullanır — tek fark, menü içeriğinin sabit
    // olmayıp her açılışta renderEntityFilterMenu() ile yeniden kurulması
    // (bkz. aşağıdaki "Kategoriye Göre Filtrele" bölümü), çünkü kategori
    // listesi belgeye göre değişiyor. setOutputTab() ÇAĞIRMAZ — panel
    // içindeki bir kategoriye tıklamak sekme değiştirmez, sadece
    // transTextDisplay'e bir filtre attribute'u uygular.
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
        if (!scriptDropdown.contains(e.target)) closeScriptDropdown();
        if (!langDropdown.contains(e.target)) closeLangDropdown();
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
        reader.onload = async (e) => {
            state.imageDataUrl = e.target.result;

            previewImage.src = e.target.result;

            uploadIdleState.classList.add('hidden');
            uploadActiveState.classList.remove('hidden');

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
        };
        reader.readAsDataURL(file);
    }

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

    function resetState() {
        hardStopTts();
        closeEntityPopover();
        closeWordAlternativesPopover();
        closeEntityFilterDropdown();
        resetEntityFilter();
        state.selectedFile = null;
        state.imageDataUrl = null;

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
                // time budget aborts the cascade cleanly at 240s and its
                // gunicorn --timeout is 280s (Dockerfile); 250s here sits
                // just above the backend's clean-abort point so the app
                // waits long enough to receive that JSON error response
                // instead of timing out on the frontend first.
                const apiRes = await fetchWithTimeout('https://ottoman-text-ai.onrender.com/api/translate', {
                    method: 'POST',
                    body: formData
                }, 250000);

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
                    finalTrans = data.trans;
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

        ocrEmptyState.classList.add('hidden');
        ocrTextDisplay.classList.remove('hidden');
        renderWithGuessMarkers(ocrTextDisplay, finalOcr);
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
        renderTranslationWithEntities(transTextDisplay, finalTrans, finalAnalysis, { clickableGuesses: true, field: 'trans' });
        applyStoredWordCorrections(state.documentId, 'trans', transTextDisplay);
        transTools.classList.add('tools-ready');

        // "Filtrele ▾" sekme çubuğunda sadece gerçekten filtrelenecek bir
        // şey varsa görünsün — backend'in people/places/concepts dediğine
        // değil, ekranda fiilen render edilmiş .entity-tag sayısına bak.
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

        // "Bilgi" tab — only populate/reveal it when we actually have
        // analysis data; otherwise leave it hidden rather than showing an
        // empty/misleading tab.
        if (finalAnalysis) {
            renderResultsPanel(finalAnalysis);
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
    // options.clickableGuesses true ise (translit ve Türkçe çeviri
    // sekmelerinde), her **tahmin** işaretli <strong>, tıklanabilir bir
    // "belirsiz kelime" olarak data-word-idx (bu render içinde 0'dan
    // başlayan, belge boyunca artan bir sayaç) ve data-word-field
    // (options.field: 'translit' | 'trans') ile işaretlenir — bkz.
    // showWordAlternativesPopover(). options verilmezse (ocr/en
    // sekmeleri) davranış öncekiyle birebir aynı kalır: sade <strong>.
    function renderSentenceSpansHtml(rawText, entities, options) {
        const clickableGuesses = !!(options && options.clickableGuesses);
        const wordField = (options && options.field) || '';
        let guessIndex = 0;

        function renderGuess(text) {
            if (!clickableGuesses) return `<strong>${text}</strong>`;
            const wordIdx = guessIndex++;
            return `<strong class="uncertain-word" data-word-idx="${wordIdx}" data-word-field="${wordField}">${text}</strong>`;
        }

        const parts = partitionSentencesRaw(rawText || '');
        return parts.map((raw, idx) => {
            const escaped = escapeHtml(raw);
            let inner;
            if (entities && entities.length) {
                const segments = splitGuessSegments(escaped);
                inner = segments
                    .map(seg => seg.bold
                        ? renderGuess(seg.text)
                        : highlightEntitiesInSegment(seg.text, entities))
                    .join('');
            } else {
                inner = escaped.replace(/\*\*(.+?)\*\*/gs, (_match, guessed) => renderGuess(guessed));
            }
            return `<span class="tts-sentence" data-tts-idx="${idx}">${inner}</span>`;
        }).join('');
    }

    function renderWithGuessMarkers(el, rawText, options) {
        el.innerHTML = renderSentenceSpansHtml(rawText, null, options);
    }

    const ENTITY_TYPE_LABELS = { person: 'Kişi', place: 'Yer', date: 'Tarih', concept: 'Kavram' };

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
    function highlightEntitiesInSegment(escapedText, entities) {
        if (!entities.length) return wrapPlainText(escapedText);

        const pattern = entities
            .map(e => escapeRegExp(escapeHtml(e.text)))
            .join('|');

        if (!pattern) return wrapPlainText(escapedText);

        const re = new RegExp(`(${pattern})`, 'gi');
        const parts = [];
        let lastIndex = 0;
        let match;

        while ((match = re.exec(escapedText)) !== null) {
            if (match.index > lastIndex) {
                parts.push(wrapPlainText(escapedText.slice(lastIndex, match.index)));
            }

            const matched = match[0];
            const entity = entities.find(
                e => escapeHtml(e.text).toLowerCase() === matched.toLowerCase()
            );
            const type = entity ? entity.type : 'concept';
            const safeAttr = matched.replace(/"/g, '&quot;');
            parts.push(`<span class="entity-tag entity-${type}" data-entity="${safeAttr}" data-type="${type}">${matched}</span>`);

            lastIndex = re.lastIndex;
        }

        if (lastIndex < escapedText.length) {
            parts.push(wrapPlainText(escapedText.slice(lastIndex)));
        }

        return parts.join('');
    }

    // transTextDisplay için: **tahmin** kalınlaştırmasını korurken, ayrıca
    // analiz verisindeki kişi/yer/tarihleri metin içinde tıklanabilir şekilde
    // vurgular (bkz. showEntityPopover). Diğer çıktı kutuları (Osmanlıca
    // metin, İngilizce çeviri) hâlâ sade renderWithGuessMarkers kullanır.
    // Cümle bazlı TTS highlight sarmalaması renderSentenceSpansHtml
    // içinde, entity vurgulamasıyla birlikte uygulanır.
    function renderTranslationWithEntities(el, rawText, analysis, options) {
        const entities = buildEntityIndex(analysis);
        el.innerHTML = renderSentenceSpansHtml(rawText, entities, options);
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
    // "Filtrele ▾" (entityFilterTrigger/entityFilterMenu), scriptDropdown/
    // langDropdown ile AYNI HTML/CSS kalıbını (.lang-dropdown,
    // .lang-dropdown-trigger, .lang-dropdown-menu) kullanan, sekme
    // çubuğuna entegre bir dropdown'dur (bkz. yukarıdaki aç/kapa/dış-
    // tıklama kablolaması). Menü içeriği SABİT değil — her açılışta
    // renderEntityFilterMenu() ile, belgede GERÇEKTEN bulunan kategoriler
    // (Kişiler/Yerler/Tarihler/Kavramlar — hangisinden en az 1 entity-tag
    // varsa) sayılarıyla yeniden kurulur. Bir kategoriye tıklanınca DOM
    // yeniden render EDİLMEZ — sadece transTextDisplay'e data-entity-filter
    // attribute'u eklenir/kaldırılır, geri kalanı tamamen CSS'te
    // (style.css'teki [data-entity-filter] kuralları) halledilir.
    // null: filtre yok. 'person' | 'place' | 'date' | 'concept': aktif
    // kategori. Sekme değişince/yeni belge işlenince sıfırlanır (bkz.
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
    }

    // Filtre uygulanabilecek kategorileri, ekranda GERÇEKTEN render edilmiş
    // .entity-tag sayısından belirlemek için kullanılan buton başına belge
    // içindeki gerçek dağılımı yansıtır — backend'in people/places/concepts
    // listesinden değil (bir isim analizde geçse bile çeviri metninde
    // birebir eşleşmemiş olabilir; kullanıcıya sadece gerçekten tıklayıp
    // göreceği kategoriler gösterilmeli).
    function getEntityFilterCategories() {
        return [
            { type: 'person', label: 'Kişiler' },
            { type: 'place', label: 'Yerler' },
            { type: 'date', label: 'Tarihler' },
            { type: 'concept', label: 'Kavramlar' },
        ]
            .map(cat => ({
                ...cat,
                count: transTextDisplay.querySelectorAll(`.entity-tag[data-type="${cat.type}"]`).length
            }))
            .filter(cat => cat.count > 0);
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

    // type: 'person' | 'place' | 'date' | 'concept' | null. Aynı kategoriye
    // tekrar basılırsa filtre kapanır (spec: "aynı kategoriye tekrar
    // tıklarsa filtre kaldırılsın").
    function applyEntityFilter(type) {
        activeEntityFilterType = (activeEntityFilterType === type) ? null : type;

        if (activeEntityFilterType) {
            transTextDisplay.setAttribute('data-entity-filter', activeEntityFilterType);
        } else {
            transTextDisplay.removeAttribute('data-entity-filter');
        }

        if (!entityFilterMenu.classList.contains('hidden')) {
            renderEntityFilterMenu();
        }
    }

    // --- Belirsiz Kelime Alternatifleri (uncertain-word) ---
    // translit ve Türkçe çeviri sekmelerindeki **tahmin** işaretli
    // (.uncertain-word) kelimelere tıklanınca, kelimenin yakınında küçük
    // bir kart açılır: OCR/Osmanlıca hali, kökeni ve en fazla 3 alternatif
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

    // Bir alan (translit/trans) render edildikten hemen sonra çağrılır:
    // daha önce bu belge için kaydedilmiş düzeltmeleri ekrana geri uygular
    // (sayfa yenilense/belge tekrar açılsa bile düzeltmeler kaybolmasın).
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

        const alternatives = (Array.isArray(data.alternatives) ? data.alternatives : [])
            .map(item => (typeof item === 'string' ? item : (item && item.text) || ''))
            .map(text => text.trim())
            .filter(Boolean)
            .slice(0, 3);

        const form = document.createElement('form');
        form.className = 'word-alt-popover-form';

        const radioName = `word-alt-choice-${Date.now()}`;

        alternatives.forEach((optionText, i) => {
            const label = document.createElement('label');
            label.className = 'word-alt-option';

            const radio = document.createElement('input');
            radio.type = 'radio';
            radio.name = radioName;
            radio.value = optionText;
            if (i === 0) radio.checked = true;
            label.appendChild(radio);

            const span = document.createElement('span');
            span.textContent = optionText;
            label.appendChild(span);

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

    [translitTextDisplay, transTextDisplay].forEach(displayEl => {
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

    // Tüm ana ses butonlarını 🔊'e sıfırlar ve ekrandaki cümle vurgularını
    // temizler. "Sesi Durdur" butonlarına VE bir okuma zinciri sonuna
    // gelindiğinde çağrılır.
    function resetAllTtsUi() {
        setTtsIcon([ocrTtsBtn, translitTtsBtn, ttsBtn, enTtsBtn], '🔊');
        document.querySelectorAll('.tts-sentence-active').forEach(el => el.classList.remove('tts-sentence-active'));
        ttsActiveChannel = null;
        ttsState = 'idle';
    }

    function highlightSentence(displays, idx) {
        document.querySelectorAll('.tts-sentence-active').forEach(el => el.classList.remove('tts-sentence-active'));
        displays.forEach(displayEl => {
            if (!displayEl) return;
            const span = displayEl.querySelector(`.tts-sentence[data-tts-idx="${idx}"]`);
            if (span) {
                span.classList.add('tts-sentence-active');
                span.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        });
    }

    // text: okunacak düz metin (\n içerebilir, splitIntoSentences içinde
    // normalize edilir). channelKey/buttons: bu okumanın ait olduğu ana ses
    // butonu/butonları (ikon burada güncellenir — osmanlı grubunda ikisi
    // birden). displays: highlight uygulanacak eleman(lar).
    function speakText(text, { lang = 'tr-TR', displays = [], buttons = [], channelKey = null } = {}) {
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
            highlightSentence(displays, currentIdx);

            const utterance = new SpeechSynthesisUtterance(sentences[currentIdx]);
            utterance.lang = lang;
            utterance.rate = 0.9;
            index++;

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
    function handleTtsToggle({ getText, lang, displays, buttons, channelKey, emptyMessage }) {
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
        speakText(text, { lang, displays, buttons, channelKey });
    }

    ttsBtn.addEventListener('click', () => handleTtsToggle({
        getText: () => transTextDisplay.textContent,
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
        const diacriticMap = {
            'ā': 'a', 'Ā': 'A',
            'ḳ': 'k', 'Ḳ': 'K',
            'ġ': 'g', 'Ġ': 'G',
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
        return text.replace(/[āĀḳḲġĠḥḤḫḪṣṢṭṬñÑūŪīĪżŻḍḌʿʾʻʼ]/g, (ch) => diacriticMap[ch] ?? ch);
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
            emptyMessage: 'Bu belge için sesli okuma verisi bulunamadı.'
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
        getText: () => enTextDisplay.textContent,
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

    function clearAuthSession() {
        state.authToken = null;
        state.authEmail = null;
        localStorage.removeItem('auth_token');
        localStorage.removeItem('auth_email');
        updateAuthUI();
    }

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
                body: JSON.stringify({ email, password })
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

    logoutBtn.addEventListener('click', async () => {
        if (state.authToken) {
            try {
                await fetchWithTimeout(`${API_BASE_URL}/api/auth/logout`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${state.authToken}` }
                });
            } catch (err) {
                // Sunucuya ulaşılamasa bile yerel oturumu temizlemeye devam
                // ediyoruz — kullanıcı için "çıkış yaptım" tek doğru sonuçtur.
            }
        }
        clearAuthSession();
        authModal.classList.add('hidden');
    });

    // Sayfa her açıldığında, önceden kaydedilmiş bir oturum varsa hâlâ
    // geçerli mi diye sunucuya sorar; süresi dolmuş/geçersizse sessizce
    // çıkış yapılmış hale getirir.
    if (state.authToken) {
        fetchWithTimeout(`${API_BASE_URL}/api/auth/me`, {
            headers: { 'Authorization': `Bearer ${state.authToken}` }
        }).then(res => {
            if (!res.ok) clearAuthSession();
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
                selected_context: assistantSelectedContext
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
    const aiFeatureModal =
        document.getElementById('aiFeatureModal');
    const assistantToolsBtn =
        document.getElementById('assistantToolsBtn');

    const aiFeatureModalClose =
        document.getElementById('aiFeatureModalClose');

        function openAiFeatureModal() {
        aiFeatureModal.classList.remove('hidden');
    }

    function closeAiFeatureModal() {
        aiFeatureModal.classList.add('hidden');
    }

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
                    data.error || 'AI tahmin isteği başarısız oldu.'
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
    if (assistantToolsBtn) {
        assistantToolsBtn.addEventListener('click', () => {
            aiFeatureResult.textContent =
                'Bir AI belge aracı seçin.';

            openAiFeatureModal();
        });
    }

    aiFeatureModalClose.addEventListener(
        'click',
        closeAiFeatureModal
    );

    aiFeatureModal.addEventListener('click', (e) => {
        if (e.target === aiFeatureModal) {
            closeAiFeatureModal();
        }
    });
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
                    method: 'GET'
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
                    assistantPanel.classList.remove('hidden');

                    assistantInput.value = question;
                    assistantInput.focus();

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
                    method: 'GET'
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
            text += `\nTür: ${suggestion.type}`;
        }

        button.textContent = text;

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
});

