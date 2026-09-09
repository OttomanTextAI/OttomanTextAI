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
        translitText: '',
        lastAnalysis: null,
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

    document.addEventListener('click', (e) => {
        if (!scriptDropdown.contains(e.target)) closeScriptDropdown();
        if (!langDropdown.contains(e.target)) closeLangDropdown();
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

            triggerTranslateBtn.disabled = true;

            await runImageEnhancement(state.selectedFile, documentProfile.value);
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
                state.enhancedImageUrl = sample.file;
                fileName.textContent = sample.name;
                fileSize.textContent = sample.size;
                previewImage.src = sample.file;
                uploadIdleState.classList.add('hidden');
                uploadActiveState.classList.remove('hidden');
                triggerTranslateBtn.disabled = false;

                smoothScrollTo(dropZone);

                // Auto process sample
                processTranslation(sample);
            }
        });
    });

    function resetState() {
        hardStopTts();
        closeEntityPopover();
        state.selectedFile = null;
        state.imageDataUrl = null;
        state.translitText = '';
        state.lastAnalysis = null;
        statusHint.classList.add('hidden');
        statusBadge.classList.add('hidden');
        clearProcessingFailure();
        fileInput.value = '';
        uploadIdleState.classList.remove('hidden');
        uploadActiveState.classList.add('hidden');
        triggerTranslateBtn.disabled = true;

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
    triggerTranslateBtn.addEventListener('click', () => {
        if (!state.imageDataUrl) return;
        processTranslation();
    });

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
    // sahte/örnek bir sonuç göstermek ya da hatayı yalnızca butonun yanındaki küçük
    // durum rozetinde bırakmak yerine, "Çeviri sonucu burada görüntülenecek." gibi
    // boş-durum metinlerinin yerine nedenini yazar — kullanıcı hatayı sağdaki
    // sonuç panelinde, tam çevirinin görüneceği yerde görür. Ayrıca çeviri
    // butonunu tekrar tıklanabilir hale getirir (aşağıdaki processTranslation()
    // eksik kalan iyileştirmeyi kendisi yeniden dener), böylece kullanıcı
    // sayfayı yenilemek zorunda kalmaz.
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
        triggerTranslateBtn.disabled = false;
        actionSpinner.classList.add('hidden');
        translateBtnLabel.textContent = 'Çeviriyi Başlat';
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
            triggerTranslateBtn.disabled = false;
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
        state.isProcessing = true;
        triggerTranslateBtn.disabled = true;
        actionSpinner.classList.remove('hidden');
        translateBtnLabel.textContent = 'İşleniyor...';
        statusBadge.classList.remove('hidden');
        clearProcessingFailure();
        statusHint.classList.remove('hidden');
        scanLine.classList.add('scanning');

        // Görüntü iyileştirme daha önce başarısız olmuş olabilir (ya da hiç
        // çalışmamış olabilir). Kullanıcıyı "Çeviriyi Başlat" butonu kalıcı
        // olarak kilitli kalmış, sayfayı yenilemek zorunda bırakmak yerine
        // burada kendimiz yeniden deneriz; yine başarısız olursa
        // runImageEnhancement hatayı zaten sağ paneldeki boş-durum alanına
        // yazıp butonu tekrar tıklanabilir hale getirir.
        if (!presetData && !state.enhancedImageBlob) {
            const enhanced = await runImageEnhancement(state.selectedFile, documentProfile.value);
            if (!enhanced) {
                return;
            }
            // runImageEnhancement, kendi başarı durumunda butonu tekrar aktif
            // eder (tek başına kullanıldığında bu doğrudur); ama burada çeviri
            // işlemine kesintisiz devam ediyoruz, bu yüzden butonu tekrar
            // kilitliyoruz.
            triggerTranslateBtn.disabled = true;
        }

        // Step 2: OCR Extraction
        statusMessage.textContent = 'Görüntü iyileştiriliyor & Osmanlıca OCR yapılıyor...';
        await new Promise(r => setTimeout(r, 1200));

        // Step 3: AI Translation
        statusMessage.textContent = 'Yapay Zeka ile Türkçe çeviri oluşturuluyor...';
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
        ocrEmptyState.classList.add('hidden');
        ocrTextDisplay.classList.remove('hidden');
        renderWithGuessMarkers(ocrTextDisplay, finalOcr);
        ocrTools.classList.add('tools-ready');

        if (finalTranslit) {
            translitEmptyState.classList.add('hidden');
            translitTextDisplay.classList.remove('hidden');
            renderWithGuessMarkers(translitTextDisplay, finalTranslit);
            translitTools.classList.add('tools-ready');
        } else {
            translitEmptyState.classList.remove('hidden');
            translitTextDisplay.classList.add('hidden');
            translitTools.classList.remove('tools-ready');
        }

        transEmptyState.classList.add('hidden');
        transTextDisplay.classList.remove('hidden');
        renderTranslationWithEntities(transTextDisplay, finalTrans, finalAnalysis);
        transTools.classList.add('tools-ready');

        if (finalTransEn) {
            enEmptyState.classList.add('hidden');
            enTextDisplay.classList.remove('hidden');
            renderWithGuessMarkers(enTextDisplay, finalTransEn);
        } else {
            enEmptyState.classList.remove('hidden');
            enTextDisplay.classList.add('hidden');
        }

        state.ocrText = finalOcr;
        state.transText = finalTrans;
        state.transTextEn = finalTransEn;
        state.translitText = finalTranslit;
        state.lastAnalysis = finalAnalysis;

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
        triggerTranslateBtn.disabled = false;
        actionSpinner.classList.add('hidden');
        translateBtnLabel.textContent = 'Çeviriyi Başlat';

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
    function renderSentenceSpansHtml(rawText, entities) {
        const parts = partitionSentencesRaw(rawText || '');
        return parts.map((raw, idx) => {
            const escaped = escapeHtml(raw);
            let inner;
            if (entities && entities.length) {
                const segments = splitGuessSegments(escaped);
                inner = segments
                    .map(seg => seg.bold
                        ? `<strong>${seg.text}</strong>`
                        : highlightEntitiesInSegment(seg.text, entities))
                    .join('');
            } else {
                inner = escaped.replace(/\*\*(.+?)\*\*/gs, '<strong>$1</strong>');
            }
            return `<span class="tts-sentence" data-tts-idx="${idx}">${inner}</span>`;
        }).join('');
    }

    function renderWithGuessMarkers(el, rawText) {
        el.innerHTML = renderSentenceSpansHtml(rawText, null);
    }

    const ENTITY_TYPE_LABELS = { person: 'Kişi', place: 'Yer', date: 'Tarih' };

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
    // kişi/yer/tarih adaylarını çıkarır. En uzun eşleşme önce denenmesi için
    // (örn. "Sultan Mehmed Han" ifadesi, içindeki tek başına "Mehmed"
    // kelimesinden önce eşleşsin diye) uzunluğa göre azalan sırada döner.
    function buildEntityIndex(analysis) {
        if (!analysis) return [];
        const raw = [];

        (analysis.people || []).forEach(p => raw.push({ raw: p, type: 'person' }));
        (analysis.places || []).forEach(p => raw.push({ raw: p, type: 'place' }));
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

    // escapedText zaten HTML-escape edilmiş düz metin olmalı. entities,
    // buildEntityIndex()'ten gelen {text, type} listesidir (text'ler de
    // escape edilmemiş orijinal hâlleriyle karşılaştırılabilmesi için burada
    // ayrıca escape edilir).
    function highlightEntitiesInSegment(escapedText, entities) {
        if (!entities.length) return escapedText;

        const pattern = entities
            .map(e => escapeRegExp(escapeHtml(e.text)))
            .join('|');

        if (!pattern) return escapedText;

        const re = new RegExp(`(${pattern})`, 'gi');

        return escapedText.replace(re, (matched) => {
            const entity = entities.find(
                e => escapeHtml(e.text).toLowerCase() === matched.toLowerCase()
            );
            const type = entity ? entity.type : 'concept';
            const safeAttr = matched.replace(/"/g, '&quot;');
            return `<span class="entity-tag entity-${type}" data-entity="${safeAttr}" data-type="${type}">${matched}</span>`;
        });
    }

    // transTextDisplay için: **tahmin** kalınlaştırmasını korurken, ayrıca
    // analiz verisindeki kişi/yer/tarihleri metin içinde tıklanabilir şekilde
    // vurgular (bkz. showEntityPopover). Diğer çıktı kutuları (Osmanlıca
    // metin, İngilizce çeviri) hâlâ sade renderWithGuessMarkers kullanır.
    // Cümle bazlı TTS highlight sarmalaması renderSentenceSpansHtml
    // içinde, entity vurgulamasıyla birlikte uygulanır.
    function renderTranslationWithEntities(el, rawText, analysis) {
        const entities = buildEntityIndex(analysis);
        el.innerHTML = renderSentenceSpansHtml(rawText, entities);
    }

    // Bir entity için "ilgili bilgi" olarak, analizin summary/key_points
    // alanlarında o entity'den bahseden ilk cümleyi/maddeyi bulur (varsa).
    function findEntityContext(analysis, entityText) {
        if (!analysis) return '';
        const haystacks = [];

        if (analysis.summary) {
            haystacks.push(...analysis.summary.split(/(?<=[.!?])\s+/));
        }
        if (Array.isArray(analysis.key_points)) {
            haystacks.push(...analysis.key_points);
        }

        const lowerEntity = entityText.toLowerCase();
        return haystacks.find(s => s.toLowerCase().includes(lowerEntity)) || '';
    }

    let activeEntityPopover = null;

    function closeEntityPopover() {
        if (activeEntityPopover) {
            activeEntityPopover.remove();
            activeEntityPopover = null;
        }
    }

    function showEntityPopover(targetEl) {
        closeEntityPopover();

        const type = targetEl.dataset.type;
        const text = targetEl.dataset.entity;
        const label = ENTITY_TYPE_LABELS[type] || 'Bilgi';
        const context = findEntityContext(state.lastAnalysis, text);

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

        if (context) {
            const contextEl = document.createElement('div');
            contextEl.className = 'entity-popover-context';
            contextEl.textContent = context;
            popover.appendChild(contextEl);
        }

        document.body.appendChild(popover);

        const rect = targetEl.getBoundingClientRect();
        const popRect = popover.getBoundingClientRect();
        const maxLeft = window.scrollX + document.documentElement.clientWidth - popRect.width - 12;
        const left = Math.max(12, Math.min(rect.left + window.scrollX, maxLeft));
        const top = rect.bottom + window.scrollY + 8;

        popover.style.left = `${left}px`;
        popover.style.top = `${top}px`;

        activeEntityPopover = popover;
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
        if (e.key === 'Escape') closeEntityPopover();
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
        assistantHistory.push({ role: 'user', text });
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
                    history: assistantHistory.slice(-10)
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
                assistantHistory.push({ role: 'bot', text: reply });
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
    assistantInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            sendAssistantMessage();
        }
    });
});

