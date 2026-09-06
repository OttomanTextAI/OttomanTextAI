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
    const ocrTtsBtn = document.getElementById('ocrTtsBtn');
    const downloadReportBtn = document.getElementById('downloadReportBtn');

    const enOutputBox = document.getElementById('enOutputBox');
    const enEmptyState = document.getElementById('enEmptyState');
    const enTextDisplay = document.getElementById('enTextDisplay');
    const copyEnBtn = document.getElementById('copyEnBtn');

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
    const enhancedToggle = document.getElementById('enhancedToggle');
    const enhanceStatusIcon = document.getElementById('enhanceStatusIcon');
    const workbenchCard = document.querySelector('.workbench-card');
    const heroStartBtn = document.getElementById('heroStartBtn');

    // Belge Bilgileri sidebar elements
    const infoSidebarCol = document.getElementById('infoSidebarCol');
    const resultCardConfidenceBadge = document.getElementById('resultCardConfidenceBadge');
    const resultDetailsLink = document.getElementById('resultDetailsLink');
    const ocrTabBtn = document.getElementById('ocrTabBtn');
    const langDropdown = document.getElementById('langDropdown');
    const langDropdownTrigger = document.getElementById('langDropdownTrigger');
    const langDropdownMenu = document.getElementById('langDropdownMenu');
    const langDropdownLabel = document.getElementById('langDropdownLabel');
    const infoDocType = document.getElementById('infoDocType');
    const infoDocPurpose = document.getElementById('infoDocPurpose');
    const infoScriptType = document.getElementById('infoScriptType');
    const infoPeriod = document.getElementById('infoPeriod');
    const infoStyle = document.getElementById('infoStyle');
    const infoDateHijri = document.getElementById('infoDateHijri');
    const infoDateGregorian = document.getElementById('infoDateGregorian');
    const infoConfidenceValue = document.getElementById('infoConfidenceValue');
    const infoConfidenceBar = document.getElementById('infoConfidenceBar');

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

    
    // --- Workflow Steps: gold highlight follows scroll position through the section ---
    const workflowSection = document.querySelector('.workflow-section');
    const workflowStepCards = [1, 2, 3, 4].map(n => document.getElementById(`stepCard${n}`));

    function setScrollStepHighlight(stepNum) {
        workflowStepCards.forEach((card, i) => {
            if (card) card.classList.toggle('scroll-active', i + 1 === stepNum);
        });
    }

    function updateWorkflowScrollHighlight() {
        if (!workflowSection) return;
        const rect = workflowSection.getBoundingClientRect();
        // Bu çarpanı büyütürsen geçişler daha YAVAŞ (daha fazla scroll gerekir),
        // küçültürsen daha ERKEN/HIZLI olur.
        const sweepDistance = window.innerHeight * 1.4;
        let progress = (window.innerHeight - rect.top) / sweepDistance;
        progress = Math.max(0, Math.min(0.999, progress));
        const stepNum = Math.floor(progress * 4) + 1;
        setScrollStepHighlight(stepNum);
    }
    let workflowScrollTicking = false;
    window.addEventListener('scroll', () => {
        if (!workflowScrollTicking) {
            requestAnimationFrame(() => {
                updateWorkflowScrollHighlight();
                workflowScrollTicking = false;
            });
            workflowScrollTicking = true;
        }
    });
    window.addEventListener('resize', updateWorkflowScrollHighlight);
    updateWorkflowScrollHighlight();

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

    
    // --- Output Selector: standalone "Osmanlıca Metin" button + a
    // translation-language dropdown (Türkçe / İngilizce, more languages
    // can be added to the dropdown later without touching the OCR button).
    const TRANSLATION_TAB_LABELS = {
        trans: 'Türkçe Çeviri',
        en: 'İngilizce Çeviri',
    };

    function setOutputTab(tab) {
        document.querySelectorAll('.output-select-btn').forEach(b => {
            b.classList.toggle('active', b.getAttribute('data-output-tab') === tab);
        });
        document.querySelectorAll('.output-tab-tools').forEach(t => {
            t.classList.toggle('tab-active', t.getAttribute('data-tools-for') === tab);
        });
        ocrOutputBox.classList.toggle('hidden', tab !== 'ocr');
        transOutputBox.classList.toggle('hidden', tab !== 'trans');
        enOutputBox.classList.toggle('hidden', tab !== 'en');

        // The dropdown only ever represents a translation language, so it
        // stays on the last-selected language (and its own highlight)
        // rather than switching to "Osmanlıca Metin" when that button is
        // picked instead.
        if (TRANSLATION_TAB_LABELS[tab]) {
            langDropdownLabel.textContent = TRANSLATION_TAB_LABELS[tab];
        }
        langDropdownTrigger.classList.toggle('active', tab !== 'ocr');
    }

    function closeLangDropdown() {
        langDropdownMenu.classList.add('hidden');
        langDropdownTrigger.setAttribute('aria-expanded', 'false');
    }

    ocrTabBtn.addEventListener('click', () => setOutputTab('ocr'));

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

    document.addEventListener('click', (e) => {
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

        try {
            statusBadge.classList.remove('hidden');
            statusMessage.textContent = 'Yeni belge profiliyle görüntü iyileştiriliyor...';
            enhanceStatusIcon.classList.remove('done');
            enhanceStatusIcon.classList.add('spinning');

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
            updatePreviewImage();
            enhanceStatusIcon.classList.remove('spinning');
            enhanceStatusIcon.classList.add('done');
        } catch (error) {
            console.error('Enhancement error:', error);
            statusMessage.textContent = 'Hata: ' + error.message;
            enhanceStatusIcon.classList.remove('spinning', 'done');
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
        state.ocrText = '';
        state.transText = '';
        state.transTextEn = '';
        state.translitText = '';

        ocrTextDisplay.textContent = '';
        transTextDisplay.textContent = '';
        enTextDisplay.textContent = '';

        ocrTextDisplay.classList.add('hidden');
        transTextDisplay.classList.add('hidden');
        enTextDisplay.classList.add('hidden');

        ocrEmptyState.classList.remove('hidden');
        transEmptyState.classList.remove('hidden');
        enEmptyState.classList.remove('hidden');

        ocrTools.classList.remove('tools-ready');
        transTools.classList.remove('tools-ready');

        hideResultsPanel();
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

            enhancedEmptyState.classList.remove('hidden');
            enhancedImageWrapper.classList.add('hidden');

            setStepActive(1);

            try {
                statusBadge.classList.remove('hidden');
                statusMessage.textContent = 'Görüntü iyileştiriliyor...';
                enhanceStatusIcon.classList.remove('done');
                enhanceStatusIcon.classList.add('spinning');

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
                updatePreviewImage();
                triggerTranslateBtn.disabled = false;
                enhanceStatusIcon.classList.remove('spinning');
                enhanceStatusIcon.classList.add('done');
            } catch (error) {
                console.error('Enhancement error:', error);
                statusMessage.textContent = 'Hata: ' + error.message;
                enhanceStatusIcon.classList.remove('spinning', 'done');
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
                state.enhancedImageUrl = sample.file;
                fileName.textContent = sample.name;
                fileSize.textContent = sample.size;
                previewImage.src = sample.file;
                enhancedImage.src = sample.file;
                enhancedEmptyState.classList.add('hidden');
                enhancedImageWrapper.classList.remove('hidden');
                uploadIdleState.classList.add('hidden');
                uploadActiveState.classList.remove('hidden');
                triggerTranslateBtn.disabled = false;

                smoothScrollTo(dropZone);
                setStepActive(1);

                // Auto process sample
                processTranslation(sample);
            }
        });
    });

    function resetState() {
        state.selectedFile = null;
        state.imageDataUrl = null;
        state.translitText = '';
        fileInput.value = '';
        uploadIdleState.classList.remove('hidden');
        uploadActiveState.classList.add('hidden');
        triggerTranslateBtn.disabled = true;

        ocrEmptyState.classList.remove('hidden');
        ocrTextDisplay.classList.add('hidden');
        ocrTools.classList.remove('tools-ready');
        ocrTextDisplay.textContent = '';

        transEmptyState.classList.remove('hidden');
        transTextDisplay.classList.add('hidden');
        transTools.classList.remove('tools-ready');
        transTextDisplay.textContent = '';

        enEmptyState.classList.remove('hidden');
        enTextDisplay.classList.add('hidden');
        enTextDisplay.textContent = '';

        enhancedEmptyState.classList.remove('hidden');
        enhancedImageWrapper.classList.add('hidden');
        enhancedImage.src = '';

        if (state.enhancedImageUrl) {
            URL.revokeObjectURL(state.enhancedImageUrl);
        }

        state.enhancedImageBlob = null;
        state.enhancedImageUrl = null;

        enhanceStatusIcon.classList.remove('spinning', 'done');

        hideResultsPanel();
        setOutputTab('trans');
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
        hideInfoSidebar();
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

        resultsPanel.classList.remove('hidden');
    }

    // --- Belge Bilgileri Sidebar ---
    // Renders the same analysis payload used by renderResultsPanel() into the
    // sidebar that sits next to the translation tab.
    function renderInfoSidebar(data) {
        infoDocType.textContent = data.document_type || '—';
        infoDocPurpose.textContent = data.script_purpose || '—';
        infoScriptType.textContent = data.script_type || '—';
        infoPeriod.textContent = data.period_estimate || '—';
        infoStyle.textContent = data.style || '—';
        infoDateHijri.textContent = data.date_hijri || '—';
        infoDateGregorian.textContent = data.date_gregorian || '—';

        const confidence = typeof data.confidence === 'number' ? Math.round(data.confidence) : null;
        infoConfidenceBar.classList.remove('confidence-low', 'confidence-mid', 'confidence-high');

        if (confidence !== null) {
            resultCardConfidenceBadge.textContent = `Güven Skoru %${confidence}`;
            infoConfidenceValue.textContent = `%${confidence}`;
            infoConfidenceBar.style.width = `${Math.max(0, Math.min(100, confidence))}%`;

            const tier = confidence < 60 ? 'confidence-low' : confidence < 85 ? 'confidence-mid' : 'confidence-high';
            infoConfidenceBar.classList.add(tier);
        } else {
            resultCardConfidenceBadge.textContent = 'Güven Skoru %—';
            infoConfidenceValue.textContent = '—';
            infoConfidenceBar.style.width = '0%';
        }

        infoSidebarCol.classList.remove('hidden');
    }

    function hideInfoSidebar() {
        infoSidebarCol.classList.add('hidden');
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
        let finalTransEn = '';
        let finalTranslit = '';
        let finalAnalysis = null; // optional richer data for the results panel
        let usedFallback = false;

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
                // headroom than the default 45s. Matches the backend's own
                // gunicorn --timeout (200s in the Dockerfile).
                const apiRes = await fetchWithTimeout('https://ottoman-text-ai.onrender.com/api/translate', {
                    method: 'POST',
                    body: formData
                }, 200000);

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
                    finalTransEn = data.trans_en || '';
                    finalTranslit = data.translit || '';
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
                translateBtnLabel.textContent = 'Çeviriyi Başlat';
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
        renderWithGuessMarkers(ocrTextDisplay, finalOcr);
        ocrTools.classList.add('tools-ready');

        transEmptyState.classList.add('hidden');
        transTextDisplay.classList.remove('hidden');
        renderWithGuessMarkers(transTextDisplay, finalTrans);
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

        // Detailed Results Panel — only show it when we actually have
        // analysis data to display; otherwise leave it hidden rather than
        // rendering an empty/misleading panel.
        if (finalAnalysis) {
            renderInfoSidebar(finalAnalysis);
            renderResultsPanel(finalAnalysis);
            setOutputTab('trans');
            smoothScrollTo(transOutputBox);
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

        // Briefly show all 4 steps as completed, then hand the highlight
        // back to the scroll-based sweep so it keeps working afterwards.
        setTimeout(() => {
            for (let i = 1; i <= 4; i++) {
                const card = document.getElementById(`stepCard${i}`);
                if (card) card.classList.remove('active');
            }
            updateWorkflowScrollHighlight();
        }, 2000);

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
    copyTransBtn.addEventListener('click', () => copyToClipboard(transTextDisplay.textContent, 'Türkçe çeviri kopyalandı!'));
    copyEnBtn.addEventListener('click', () => copyToClipboard(enTextDisplay.textContent, 'English translation copied!'));

    // Backend, modelin tahmin ettiği (okuyamadığı ama bağlamdan tahmin
    // ettiği) kelime/ifadeleri **böyle** işaretleyerek gönderiyor. Burada
    // bunu güvenli şekilde <strong>'e çevirip gösteriyoruz — önce HTML'i
    // escape edip sonra sadece **...** çiftlerini kalınlaştırıyoruz, ham
    // model çıktısını doğrudan innerHTML'e basmıyoruz (XSS'e karşı).
    function renderWithGuessMarkers(el, rawText) {
        const escaped = (rawText || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');

        el.innerHTML = escaped.replace(/\*\*(.+?)\*\*/gs, '<strong>$1</strong>');
    }

    function copyToClipboard(text, msg) {
        navigator.clipboard.writeText(text).then(() => {
            alert(msg);
        });
    }

    // Text To Speech
    // Uzun metinlerde tek bir SpeechSynthesisUtterance tarayıcılarda sessizce
    // başarısız olabiliyor (bilinen bir speechSynthesis kısıtı). Bunu önlemek
    // için metni cümlelere/parçalara bölüp her parçayı ayrı bir utterance
    // olarak, bir öncekinin bitişini (onend) bekleyerek sırayla okutuyoruz.
    // Kısa metinlerde tek parça oluşur, davranış öncekiyle aynı kalır.
    function splitTextForTts(text) {
        // Noktalama işaretlerinden (. ! ? ve satır sonu) sonra böl, işareti
        // parçanın sonunda tut. (Lookbehind kullanmıyoruz, geniş tarayıcı
        // uyumluluğu için split+capture-group ile eşdeğerini elde ediyoruz.)
        const pieces = text.split(/([.!?\n]+)/);
        const chunks = [];
        let current = '';
        for (const piece of pieces) {
            current += piece;
            if (/[.!?\n]/.test(piece)) {
                const trimmed = current.trim();
                if (trimmed) chunks.push(trimmed);
                current = '';
            }
        }
        const trimmedRest = current.trim();
        if (trimmedRest) chunks.push(trimmedRest);
        return chunks.length > 0 ? chunks : [text];
    }

    function speakText(text) {
        if (!text) return;
        if (!('speechSynthesis' in window)) {
            alert('Tarayıcınız sesli okuma özelliğini desteklemiyor.');
            return;
        }

        window.speechSynthesis.cancel();
        const chunks = splitTextForTts(text);
        let index = 0;

        function speakNext() {
            if (index >= chunks.length) return;
            const utterance = new SpeechSynthesisUtterance(chunks[index]);
            utterance.lang = 'tr-TR';
            utterance.rate = 0.9;
            index++;
            utterance.onend = speakNext;
            utterance.onerror = speakNext;
            window.speechSynthesis.speak(utterance);
        }

        speakNext();
    }

    ttsBtn.addEventListener('click', () => speakText(transTextDisplay.textContent));

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

    ocrTtsBtn.addEventListener('click', () => {
        if (!state.translitText) {
            alert('Bu belge için sesli okuma verisi bulunamadı.');
            return;
        }
        speakText(cleanTranslitForTts(state.translitText));
    });


    // "Detayları Gör" — scrolls down to the (unchanged) Detaylı Belge Analizi
    // panel, which is already rendered/visible alongside this card.
    resultDetailsLink.addEventListener('click', (e) => {
        e.preventDefault();
        smoothScrollTo(resultsPanel);
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

