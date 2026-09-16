document.addEventListener('DOMContentLoaded', () => {
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

    // --- Şehir verisi ---
    // 'sample' alanı, ana sayfadaki "Örnek Osmanlıca Belgeler" bölümündeki
    // gerçek belgelerden birine karşılık geliyorsa dolduruluyor (bkz.
    // index.html'deki .sample-card[data-sample] ve app.js'teki sampleDatabase/
    // handleSampleDeepLink). lat/lng artık GERÇEK coğrafi koordinatlar —
    // Leaflet standart Web Mercator (EPSG:3857) projeksiyonu kullanıyor,
    // piksel tahminine gerek yok.
    const CITIES = [
        {
            id: 'edirne', name: 'Edirne', lat: 41.6771, lng: 26.5557,
            era: 'Başkent (1365–1453)',
            blurb: 'İstanbul\'un fethinden önce imparatorluğun başkentiydi; Selimiye Camii gibi başyapıtlara ev sahipliği yapar.',
        },
        {
            id: 'istanbul', name: 'İstanbul', lat: 41.0082, lng: 28.9784,
            era: 'Başkent (1453–1922)',
            blurb: '1453\'te fethedilerek İmparatorluğun başkenti oldu; siyasi, kültürel ve ticari hayatın merkeziydi.',
            cover: 'assets/3-suleymaniye-camii-ve-cevresi-gouffier.jpg',
            documents: [
                { key: 'tah', file: 'assets/tah.png', title: 'Tercüman-ı Ahval Gazetesi\'nin 25. Sayısı' },
            ],
        },
        {
            id: 'bursa', name: 'Bursa', lat: 40.1826, lng: 29.0665,
            era: 'Başkent (1326–1365)',
            blurb: 'Osmanlı Beyliği\'nin ilk başkentiydi; erken dönem cami ve külliyeleriyle tanınır.',
        },
        {
            id: 'ankara', name: 'Ankara', lat: 39.9334, lng: 32.8597,
            era: 'Osmanlı Anadolusu / Kurtuluş Savaşı Başkenti',
            blurb: 'Anadolu ticaret yollarının kesiştiği önemli bir merkezdi; Hacı Bayram Veli\'nin vakfı burada kuruldu. 23 Nisan 1920\'de Büyük Millet Meclisi burada açıldı ve şehir Kurtuluş Savaşı\'nın fiilî başkenti oldu.',
            documents: [
                { key: 'hbv', file: 'assets/hbv.png', title: 'Hacı Bayram Veli Vakfı Tevliyet ve Meşihat Beratı' },
                { key: '1', file: 'assets/im.png', title: 'İstiklâl Marşı' },
            ],
        },
        {
            id: 'konya', name: 'Konya', lat: 37.8746, lng: 32.4932,
            era: 'Anadolu Beylikleri – Osmanlı',
            blurb: 'Selçuklu mirasının ve Mevlevîlik kültürünün merkezi; Osmanlı döneminde de önemli bir ilim şehri oldu.',
        },
        {
            id: 'sivas', name: 'Sivas', lat: 39.7477, lng: 37.0179,
            era: 'Osmanlı Anadolusu / Sivas Kongresi (Eylül 1919)',
            blurb: 'Anadolu\'nun doğusunda önemli bir vakıf ve idare merkeziydi. Eylül 1919\'da toplanan Sivas Kongresi, Erzurum Kongresi kararlarını tüm ülke için genişleterek Millî Mücadele\'nin tek elden yürütülmesini sağladı.',
            documents: [
                { key: 'svf', file: 'assets/svf.png', title: 'Sivas\'taki Vakıf Şartlarına Dair Ferman' },
                { key: 'tah', file: 'assets/tah.png', title: 'Tercüman-ı Ahval Gazetesi\'nin 25. Sayısı' },
            ],
        },
        {
            id: 'halep', name: 'Halep', lat: 36.2021, lng: 37.1343,
            era: 'Osmanlı Suriyesi',
            blurb: 'Ticaret yollarının kesiştiği kadim bir şehir; Osmanlı idaresinde önemli bir eyalet merkeziydi.',
            documents: [
                { key: 'sbh', file: 'assets/sbh.png', title: 'Şam, Baalbek ve Halep Mühimme Hükümleri' },
                { key: 'tah', file: 'assets/tah.png', title: 'Tercüman-ı Ahval Gazetesi\'nin 25. Sayısı' },
            ],
        },
        {
            id: 'sam', name: 'Şam', lat: 33.5138, lng: 36.2765,
            era: 'Osmanlı Suriyesi',
            blurb: 'Osmanlı Suriyesi\'nin idari merkezlerinden biri ve hac yolunun önemli bir durağıydı.',
            documents: [
                { key: 'sbh', file: 'assets/sbh.png', title: 'Şam, Baalbek ve Halep Mühimme Hükümleri' },
            ],
        },
        {
            id: 'bagdat', name: 'Bağdat', lat: 33.3152, lng: 44.3661,
            era: 'Osmanlı Irak\'ı',
            blurb: 'Fuzûlî gibi büyük divan şairlerinin yaşadığı, Osmanlı Irak\'ının kültürel merkeziydi.',
            documents: [
                { key: 'hero', file: 'assets/sk.png', title: 'Fuzûlî\'nin Su Kasidesi' },
            ],
        },
        {
            id: 'kahire', name: 'Kahire', lat: 30.0444, lng: 31.2357,
            era: 'Osmanlı Mısır\'ı (1517–1914)',
            blurb: '1517\'de Osmanlı topraklarına katıldı; Mısır eyaletinin başkenti ve önemli bir İslam ilim merkeziydi.',
        },
        {
            id: 'selanik', name: 'Selanik', lat: 40.6401, lng: 22.9444,
            era: 'Osmanlı Rumelisi (1430–1912)',
            blurb: 'Balkanlar\'ın en kalabalık liman şehirlerinden biriydi; canlı bir Yahudi cemaatine ve tütün ticaretine ev sahipliği yaptı.',
            documents: [
                { key: 'hmg', file: 'assets/hmg.png', title: 'Hanımlara Mahsus Gazete Eki' },
            ],
        },
        {
            id: 'izmir', name: 'İzmir', lat: 38.4237, lng: 27.1428,
            era: 'Osmanlı Ege Limanı / Kurtuluşu (9 Eylül 1922)',
            blurb: 'Ege kıyısının en işlek ticaret limanıydı; Levanten tüccarların ve çok dilli bir nüfusun buluşma noktasıydı. 15 Mayıs 1919\'da Yunan işgaline uğradı, 9 Eylül 1922\'de Türk ordusunca kurtarılarak Kurtuluş Savaşı fiilen sona erdi.',
        },
        {
            id: 'kudus', name: 'Kudüs', lat: 31.7683, lng: 35.2137,
            era: 'Osmanlı Filistini (1517–1917)',
            blurb: 'Üç semavi din için kutsal kabul edilen şehir; surları Kanuni Sultan Süleyman döneminde yeniden inşa edildi.',
        },
        {
            id: 'mekke', name: 'Mekke', lat: 21.3891, lng: 39.8579,
            era: 'Hicaz Eyaleti — Haremeyn',
            blurb: 'İslam\'ın en kutsal şehri; Osmanlı padişahları bu yüzden "Haremeyn\'in Hizmetkârı" unvanını taşıdı.',
        },
        {
            id: 'medine', name: 'Medine', lat: 24.5247, lng: 39.5692,
            era: 'Hicaz Eyaleti — Haremeyn',
            blurb: 'Hz. Muhammed\'in kabrini barındırır; Hicaz Demiryolu ile İstanbul\'a bağlanan hac güzergâhının son durağıydı.',
        },
        {
            id: 'belgrad', name: 'Belgrad', lat: 44.7866, lng: 20.4489,
            era: 'Osmanlı Sınır Kalesi (1521–1867)',
            blurb: 'Balkanlar\'a açılan kapı ve stratejik bir serhad kalesiydi; Kanuni\'nin 1521\'deki fethiyle imparatorluğa katıldı.',
        },
        {
            id: 'saraybosna', name: 'Saraybosna', lat: 43.8563, lng: 18.4131,
            era: 'Bosna Eyaleti',
            blurb: 'Bosna Eyaleti\'nin idari merkeziydi; cami, bedesten ve hanlarıyla Osmanlı şehirciliğinin Balkanlar\'daki örneklerinden biri oldu.',
            documents: [
                { key: '2', file: 'assets/fsma.png', title: 'Fatih Sultan Mehmed\'in Ahidnamesi' },
            ],
        },
        {
            id: 'trabzon', name: 'Trabzon', lat: 41.0027, lng: 39.7168,
            era: 'Osmanlı Karadeniz Limanı (1461–)',
            blurb: 'Trabzon Rum İmparatorluğu\'nun fethiyle Osmanlı\'ya katıldı; Karadeniz ticaretinin ve İpek Yolu\'nun önemli bir durağıydı.',
            documents: [
                { key: 'gkt', file: 'assets/gkt.png', title: 'Gümüşhanevî Kütüphanelerindeki Kitapların Tiflis\'ten Geri Getirilmesi Talebi' },
            ],
        },
        {
            id: 'diyarbakir', name: 'Diyarbakır', lat: 37.9144, lng: 40.2306,
            era: 'Osmanlı Doğu Anadolusu',
            blurb: 'Yukarı Mezopotamya\'nın idari ve ticari merkeziydi; kara bazalt surlarıyla tanınır.',
        },
        {
            id: 'musul', name: 'Musul', lat: 36.3489, lng: 43.1189,
            era: 'Osmanlı Irak\'ı — Musul Eyaleti',
            blurb: 'Dicle kıyısında ticaret ve dokumacılıkla öne çıktı; "muslin" kumaşı adını bu şehirden alır.',
        },
        {
            id: 'basra', name: 'Basra', lat: 30.5085, lng: 47.7835,
            era: 'Osmanlı Irak\'ı — Basra Eyaleti',
            blurb: 'Basra Körfezi\'ne açılan liman şehri; Hindistan ve Uzakdoğu ile deniz ticaretinin batıya açılan kapısıydı.',
        },
        {
            id: 'tiflis', name: 'Tiflis', lat: 41.7151, lng: 44.8271,
            era: 'Kafkasya — Osmanlı-Safevi Sınır Bölgesi',
            blurb: 'Kafkasya\'nın önemli bir merkeziydi; Osmanlı orduları tarafından zaman zaman ele geçirildi ve idare edildi.',
            documents: [
                { key: 'gkt', file: 'assets/gkt.png', title: 'Gümüşhanevî Kütüphanelerindeki Kitapların Tiflis\'ten Geri Getirilmesi Talebi' },
            ],
        },
        {
            id: 'cezayir', name: 'Cezayir', lat: 36.7538, lng: 3.0588,
            era: 'Cezayir Ocağı (1516–1830)',
            blurb: 'Osmanlı\'ya bağlı yarı özerk bir ocak/eyalet olarak Akdeniz\'de deniz gücünün merkeziydi.',
        },
        {
            id: 'tunus', name: 'Tunus', lat: 36.8065, lng: 10.1815,
            era: 'Tunus Eyaleti (1574–1881)',
            blurb: 'Kuzey Afrika\'daki Osmanlı eyaletlerinden biriydi; Hafsî mirası üzerine kurulan canlı bir liman şehriydi.',
        },

        // --- Trablusgarp Savaşı ve Birinci Dünya Savaşı (1911–1918) ---
        // category:'wwi' — legend'de ayrı bir başlık altında gruplanır (bkz.
        // aşağıdaki CATEGORY_META).
        {
            id: 'trablusgarp', name: 'Trablusgarp', lat: 32.8872, lng: 13.1913,
            era: 'Trablusgarp Savaşı (1911–1912)',
            blurb: 'İtalya\'nın işgaline karşı verilen savunma savaşı burada yaşandı; Mustafa Kemal ve Enver Bey gibi subaylar gönüllü olarak burada görev aldı.',
            category: 'wwi',
        },
        {
            id: 'canakkale', name: 'Çanakkale', lat: 40.1553, lng: 26.4142,
            era: 'Birinci Dünya Savaşı — Çanakkale Savaşı (1915)',
            blurb: 'İtilaf donanmasının Boğaz\'ı geçme girişimi ve ardından aylar süren kara savaşı burada yaşandı; Osmanlı ordusu için büyük bir savunma zaferiydi.',
            category: 'wwi',
        },
        {
            id: 'sarikamis', name: 'Sarıkamış', lat: 40.3369, lng: 42.5967,
            era: 'Kafkas Cephesi — Sarıkamış Harekâtı (Aralık 1914 – Ocak 1915)',
            blurb: 'Kış koşullarında girişilen kuşatma harekâtı ağır kayıplarla sonuçlandı; Osmanlı ordusunun cephelerdeki en büyük felaketlerinden biriydi.',
            category: 'wwi',
        },
        {
            id: 'kanal', name: 'Kanal Cephesi', lat: 30.5852, lng: 32.2654,
            era: 'Sina Cephesi — Kanal Harekâtı (1915)',
            blurb: 'Osmanlı kuvvetleri, İngiliz kontrolündeki Süveyş Kanalı\'nı geçmeyi denedi; bu harekât Sina-Filistin Cephesi\'nin başlangıcı oldu.',
            category: 'wwi',
        },
        {
            id: 'kutulamare', name: 'Kûtülamâre', lat: 32.5122, lng: 45.8235,
            era: 'Irak Cephesi — Kûtülamâre Kuşatması ve Zaferi (1915–1916)',
            blurb: 'Osmanlı kuvvetleri, İngiliz General Townshend komutasındaki orduyu kuşatarak teslim aldı; dönemin en büyük İngiliz yenilgilerinden biriydi.',
            category: 'wwi',
        },
        {
            id: 'gazze', name: 'Gazze', lat: 31.5017, lng: 34.4668,
            era: 'Filistin Cephesi — Gazze Muharebeleri (1917)',
            blurb: 'İngiliz ilerleyişine karşı üç kez savunulan cephe hattıydı; sonunda Kudüs\'ün kaybına giden sürecin başlangıcı oldu.',
            category: 'wwi',
        },
        {
            id: 'yemen', name: 'Yemen Cephesi', lat: 15.3694, lng: 44.1910,
            era: 'Birinci Dünya Savaşı — Yemen Cephesi',
            blurb: 'İmparatorluğun en uzak ve izole cephelerinden biriydi; Osmanlı birlikleri burada savaş boyunca zor koşullar altında görev yaptı.',
            category: 'wwi',
        },
        {
            id: 'hatay', name: 'Hatay', lat: 36.2023, lng: 36.1613,
            era: 'Fransız Mandası ve Hatay Sorunu (1918–1939)',
            blurb: 'Savaş sonrası Fransız mandası altına girdi; halkın direnişi ve uzun bir diplomatik mücadele sonunda 1939\'da Türkiye\'ye katıldı.',
            category: 'wwi',
        },

        // --- Kurtuluş Savaşı (1919–1922) ---
        // category:'independence' — legend'de ayrı bir başlık altında
        // gruplanır (bkz. aşağıdaki CATEGORY_META).
        {
            id: 'samsun', name: 'Samsun', lat: 41.2867, lng: 36.3300,
            era: 'Kurtuluş Savaşı — Millî Mücadele\'nin Başlangıcı (19 Mayıs 1919)',
            blurb: 'Mustafa Kemal Paşa\'nın 19 Mayıs 1919\'da çıktığı liman şehri; bu tarih Millî Mücadele\'nin sembolik başlangıcı kabul edilir.',
            category: 'independence',
        },
        {
            id: 'amasya', name: 'Amasya', lat: 40.6499, lng: 35.8353,
            era: 'Kurtuluş Savaşı — Amasya Genelgesi (Haziran 1919)',
            blurb: 'Millî Mücadele\'nin gerekçesinin ve örgütlenme kararının ilan edildiği Amasya Genelgesi burada yayımlandı.',
            category: 'independence',
        },
        {
            id: 'erzurum', name: 'Erzurum', lat: 39.9000, lng: 41.2700,
            era: 'Kurtuluş Savaşı — Erzurum Kongresi (Temmuz–Ağustos 1919)',
            blurb: 'Doğu vilayetlerinin temsilcilerinin toplandığı, millî iradeyi esas alan ilk kongrelerden biri burada yapıldı.',
            category: 'independence',
        },
        {
            id: 'inonu', name: 'İnönü', lat: 39.8264, lng: 30.1544,
            era: 'Kurtuluş Savaşı — İnönü Muharebeleri (1921)',
            blurb: 'Birinci ve İkinci İnönü Muharebeleri\'nin yapıldığı, düzenli ordunun ilk büyük zaferlerini kazandığı cephe.',
            category: 'independence',
        },
        {
            id: 'sakarya', name: 'Sakarya', lat: 39.5836, lng: 32.1462,
            era: 'Kurtuluş Savaşı — Sakarya Meydan Muharebesi (Ağustos–Eylül 1921)',
            blurb: 'Ankara\'ya en yakın cephe hattıydı; savaşın dönüm noktalarından Sakarya Meydan Muharebesi burada kazanıldı.',
            category: 'independence',
        },
        {
            id: 'afyonkarahisar', name: 'Afyonkarahisar', lat: 38.7507, lng: 30.5567,
            era: 'Kurtuluş Savaşı — Büyük Taarruz\'un Başlangıcı (26 Ağustos 1922)',
            blurb: 'Büyük Taarruz, Mustafa Kemal\'in karargâh kurduğu Kocatepe\'den, buradan başlatıldı.',
            category: 'independence',
        },
        {
            id: 'dumlupinar', name: 'Dumlupınar', lat: 39.1667, lng: 29.8500,
            era: 'Kurtuluş Savaşı — Başkumandanlık Meydan Muharebesi (30 Ağustos 1922)',
            blurb: 'Savaşın kesin sonucunu belirleyen meydan muharebesi burada kazanıldı; 30 Ağustos bugün Zafer Bayramı olarak kutlanır.',
            category: 'independence',
        },
        {
            id: 'mudanya', name: 'Mudanya', lat: 40.3756, lng: 28.8828,
            era: 'Kurtuluş Savaşı — Mudanya Ateşkesi (Ekim 1922)',
            blurb: 'Savaşı fiilen sona erdiren Mudanya Ateşkes Antlaşması burada imzalandı.',
            category: 'independence',
        },
        {
            id: 'gaziantep', name: 'Gaziantep', lat: 37.0662, lng: 37.3833,
            era: 'Kurtuluş Savaşı — Antep Savunması',
            blurb: 'Fransız işgaline karşı direnişiyle "Gazi" unvanını aldı; şehrin bugünkü adı buradan gelir.',
            category: 'independence',
        },
        {
            id: 'maras', name: 'Kahramanmaraş', lat: 37.5753, lng: 36.9228,
            era: 'Kurtuluş Savaşı — Maraş Savunması',
            blurb: 'Fransız ve müttefik kuvvetlere karşı direnişiyle "Kahraman" unvanını aldı.',
            category: 'independence',
        },
        {
            id: 'urfa', name: 'Şanlıurfa', lat: 37.1591, lng: 38.7969,
            era: 'Kurtuluş Savaşı — Urfa Savunması',
            blurb: 'İşgale karşı direnişiyle "Şanlı" unvanını aldı.',
            category: 'independence',
        },
    ];

    // Osmanlı coğrafyasını ve yakın komşularını kapsayan "kör harita" —
    // Natural Earth sınır verisinden (world-atlas npm paketi, jsDelivr CDN
    // üzerinden) sadece bu bölgedeki ülkeler süzülüyor; dünyanın geri kalanı
    // hiç çizilmiyor. İsimler dosyanın kendi (İngilizce) properties.name
    // alanıyla birebir eşleşmeli.
    const REGION_COUNTRIES = new Set([
        'United Kingdom', 'Ireland', 'France', 'Spain', 'Portugal', 'Andorra', 'Monaco',
        'Germany', 'Netherlands', 'Belgium', 'Luxembourg', 'Switzerland', 'Austria',
        'Liechtenstein', 'Czechia', 'Poland', 'Slovakia', 'Hungary', 'Denmark',
        'Estonia', 'Latvia', 'Lithuania', 'Finland', 'Sweden', 'Norway', 'Belarus',
        'Italy', 'Slovenia', 'Croatia', 'Bosnia and Herz.', 'Serbia', 'Montenegro',
        'Kosovo', 'Macedonia', 'Albania', 'Greece', 'Bulgaria', 'Romania',
        'San Marino', 'Vatican',
        'Ukraine', 'Moldova', 'Russia',
        'Cyprus', 'N. Cyprus', 'Malta',
        'Georgia', 'Armenia', 'Azerbaijan',
        'Turkey', 'Syria', 'Lebanon', 'Israel', 'Palestine', 'Jordan', 'Iraq', 'Iran',
        'Saudi Arabia', 'Yemen', 'Oman', 'United Arab Emirates', 'Qatar', 'Kuwait', 'Bahrain',
        'Egypt', 'Libya', 'Tunisia', 'Algeria', 'Morocco', 'W. Sahara', 'Sudan',
        'Turkmenistan', 'Kazakhstan', 'Uzbekistan', 'Afghanistan', 'Pakistan',
    ]);

    // Haritanın kapsadığı sabit bölge — kullanıcı bunun dışına sürüklenip
    // boş dünyaya çıkamasın diye maxBounds burada da kullanılıyor.
    const REGION_BOUNDS = L.latLngBounds([[8, -14], [51, 66]]);

    const mapLegend = document.getElementById('mapLegend');

    const map = L.map('mapContainer', {
        attributionControl: false,
        minZoom: 3,
        maxZoom: 9,
        worldCopyJump: false,
    });
    map.fitBounds(REGION_BOUNDS);
    map.setMinZoom(map.getZoom());
    map.setMaxBounds(REGION_BOUNDS.pad(0.15));

    L.control.attribution({ prefix: false, position: 'bottomright' })
        .addAttribution('Sınır verisi: <a href="https://www.naturalearthdata.com/" target="_blank" rel="noopener">Natural Earth</a>')
        .addTo(map);

    // Ülke sınırları — jsDelivr üzerinden TopoJSON olarak çekilip
    // topojson-client ile GeoJSON'a çevriliyor, sonra yukarıdaki bölge
    // listesine göre süzülüyor. Harita şehir işaretleri bu veriyi
    // beklemeden hemen görünür; sınırlar yüklenince altına yerleşir.
    fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json')
        .then(res => res.json())
        .then(topology => {
            const geo = topojson.feature(topology, topology.objects.countries);
            const regionFeatures = geo.features.filter(f => REGION_COUNTRIES.has(f.properties && f.properties.name));
            L.geoJSON(regionFeatures, {
                // fill/stroke rengi BİLEREK burada verilmiyor — Leaflet bunları
                // setAttribute('fill', ...) ile ham SVG attribute'u olarak
                // yazıyor (inline style değil), bu da CSS custom property
                // (var(--color-gold)) her tarayıcıda güvenilir şekilde
                // çözülmeyebilir demek. Renk yerine map.html'deki
                // ".map-country-shape" CSS kuralı devreye giriyor — normal bir
                // yazar (author) CSS kuralı, SVG presentation attribute'unu
                // her zaman ezer, tema (açık/koyu) değişince de otomatik günceller.
                interactive: false,
                style: {
                    className: 'map-country-shape',
                    fillOpacity: 0.1,
                    weight: 1,
                    opacity: 0.55,
                },
            }).addTo(map);
        })
        .catch(() => {
            // Sınır verisi yüklenemezse (ör. bağlantı yok) harita boş
            // zeminde şehir işaretleriyle kullanılabilir kalmaya devam eder.
        });

    // --- Yıla göre imparatorluk sınırı şeridi ---
    // aourednik/historical-basemaps (GitHub, jsDelivr üzerinden) her yıl
    // için TÜM dünyanın siyasi sınırlarını içeren ayrı bir GeoJSON dosyası
    // sunuyor (~1-3.5MB); biz sadece "Ottoman Empire" (1920'de "Ottoman
    // Sultanate") adlı feature'ı süzüp saklıyoruz, geri kalanını atıyoruz.
    // Her yıl ilk kez seçildiğinde indirilip yearBoundaryCache'e yazılır,
    // sonraki seçimlerde tekrar indirilmez.
    const TIMELINE_YEARS = [1400, 1492, 1500, 1530, 1600, 1650, 1700, 1715, 1783, 1800, 1815, 1878, 1880, 1900, 1914, 1920];
    const yearBoundaryCache = {};
    let ottomanBoundaryLayer = null;
    let boundaryLoadToken = 0;

    const yearSlider = document.getElementById('mapYearSlider');
    const yearLabel = document.getElementById('mapTimelineYear');
    const yearStatus = document.getElementById('mapTimelineStatus');
    const yearTicks = document.getElementById('mapTimelineTicks');
    yearSlider.max = String(TIMELINE_YEARS.length - 1);

    // Termometre gibi yıl çentikleri — her TIMELINE_YEARS girdisi için bir
    // tane, index'e göre eşit aralıklı. Slider hareket ettikçe en yakın
    // çentik 'active' sınıfıyla vurgulanır (bkz. setActiveTick()).
    const tickEls = TIMELINE_YEARS.map((year, i) => {
        const tick = document.createElement('span');
        tick.className = 'map-timeline-tick';
        tick.style.left = (TIMELINE_YEARS.length === 1 ? 50 : (i / (TIMELINE_YEARS.length - 1)) * 100) + '%';
        const label = document.createElement('span');
        label.textContent = year;
        tick.appendChild(label);
        yearTicks.appendChild(tick);
        return tick;
    });

    function setActiveTick(index) {
        tickEls.forEach((tick, i) => tick.classList.toggle('active', i === index));
    }

    function ottomanFeatureName(year) {
        return year >= 1920 ? 'Ottoman Sultanate' : 'Ottoman Empire';
    }

    async function loadYearBoundary(year) {
        const token = ++boundaryLoadToken;
        yearStatus.hidden = false;
        try {
            let features = yearBoundaryCache[year];
            if (!features) {
                const res = await fetch(`https://cdn.jsdelivr.net/gh/aourednik/historical-basemaps@master/geojson/world_${year}.geojson`);
                const geo = await res.json();
                const targetName = ottomanFeatureName(year);
                features = geo.features.filter(f => f.properties && f.properties.NAME === targetName);
                yearBoundaryCache[year] = features;
            }
            if (token !== boundaryLoadToken) return; // kullanıcı bu arada başka bir yıla geçti
            if (ottomanBoundaryLayer) {
                map.removeLayer(ottomanBoundaryLayer);
                ottomanBoundaryLayer = null;
            }
            if (features.length) {
                ottomanBoundaryLayer = L.geoJSON(features, {
                    interactive: false,
                    style: {
                        className: 'map-ottoman-boundary',
                        fillOpacity: 0.22,
                        weight: 2,
                        opacity: 0.85,
                    },
                }).addTo(map);
                ottomanBoundaryLayer.bringToFront();
            }
        } catch (e) {
            // Bağlantı sorunu olursa sessizce geç — harita şehir
            // işaretleriyle zaten kullanılabilir durumda.
        } finally {
            if (token === boundaryLoadToken) yearStatus.hidden = true;
        }
    }

    function updateYearLabel() {
        const index = Number(yearSlider.value);
        const year = TIMELINE_YEARS[index];
        yearLabel.textContent = year;
        setActiveTick(index);
        return year;
    }

    let yearDebounce = null;
    yearSlider.addEventListener('input', () => {
        const year = updateYearLabel();
        clearTimeout(yearDebounce);
        yearDebounce = setTimeout(() => loadYearBoundary(year), 150);
    });

    loadYearBoundary(updateYearLabel());

    // city.category sadece alt başlık gruplaması için kullanılıyor (bkz.
    // aşağıdaki headingsShown) — işaretler/rozetler artık hepsi aynı
    // (altın) renkte, kategoriye göre renk farkı yok.
    const CATEGORY_META = {
        wwi: { label: 'Trablusgarp ve Birinci Dünya Savaşı (1911–1918)' },
        independence: { label: 'Kurtuluş Savaşı (1919–1922)' },
    };

    function cityIcon(city) {
        return L.divIcon({
            className: 'map-city-marker',
            html: `<span class="map-city-dot"></span><span class="map-city-label">${city.name}</span>`,
            iconSize: [0, 0],
            iconAnchor: [0, 0],
        });
    }

    // --- Şehir bilgi penceresi (modal) ---
    // Leaflet'in küçük popup'ı yerine, tıklanan şehir için "Genel Bilgiler"
    // ve "Belgeler" sekmeli tam bir pencere açılıyor — sitenin zaten
    // kullandığı .modal-overlay/.modal-card/.results-tabs bileşenleriyle
    // aynı görünüm (bkz. style.css).
    const cityModal = document.getElementById('cityModal');
    const cityModalCard = document.getElementById('cityModalCard');
    const cityModalCoverLink = document.getElementById('cityModalCoverLink');
    const cityModalCover = document.getElementById('cityModalCover');
    const cityModalClose = document.getElementById('cityModalClose');
    const cityModalTitle = document.getElementById('cityModalTitle');
    const cityModalEra = document.getElementById('cityModalEra');
    const cityModalBlurb = document.getElementById('cityModalBlurb');
    const cityModalDocs = document.getElementById('cityModalDocs');
    const cityModalTabs = cityModal.querySelectorAll('[data-city-tab]');
    const cityModalPanels = cityModal.querySelectorAll('[data-city-panel]');

    function setCityModalTab(tab) {
        cityModalTabs.forEach(btn => btn.classList.toggle('active', btn.getAttribute('data-city-tab') === tab));
        cityModalPanels.forEach(panel => panel.classList.toggle('active', panel.getAttribute('data-city-panel') === tab));
    }

    cityModalTabs.forEach(btn => {
        btn.addEventListener('click', () => setCityModalTab(btn.getAttribute('data-city-tab')));
    });

    let activeChip = null;
    let activeMarkerEl = null;

    function setActive(chip, markerEl) {
        if (activeChip) activeChip.classList.remove('active');
        if (activeMarkerEl) activeMarkerEl.classList.remove('active');
        activeChip = chip;
        activeMarkerEl = markerEl;
        if (chip) chip.classList.add('active');
        if (markerEl) markerEl.classList.add('active');
    }

    function closeCityModal() {
        cityModal.classList.add('hidden');
        setActive(null, null);
    }

    // Hem büyük pencerenin "Belgeler" sekmesinde hem de hover önizlemesinde
    // kullanılan ortak belge listesi — bkz. openCityModal() ve
    // marker.bindTooltip() aşağıda.
    function renderDocsHtml(docs, emptyMessage) {
        if (!docs.length) return emptyMessage ? `<p class="map-city-modal-empty">${emptyMessage}</p>` : '';
        return docs.map(doc => `
            <a class="map-city-popover-sample" href="index.html?sample=${encodeURIComponent(doc.key)}">
                <img src="${doc.file}" alt="">
                <span>
                    <span class="map-city-popover-sample-label" style="display:block;">İlgili Eser</span>
                    <span class="map-city-popover-sample-title">${doc.title}</span>
                </span>
            </a>`).join('');
    }

    function openCityModal(city, chip, markerEl) {
        cityModalTitle.textContent = city.name;
        cityModalEra.textContent = city.era;
        cityModalBlurb.textContent = city.blurb;

        const docs = city.documents || [];

        // Modal'ın üstündeki "kapak" görseli — önce city.cover (şehrin
        // kendi temsili görseli, varsa), yoksa ilişkili belgelerden ilkinin
        // görseli kullanılır; hiçbiri yoksa modal düz metinle açılır, kapak
        // alanı hiç yer kaplamaz. city.cover bir belgeye bağlı olmadığından
        // tıklanabilir değildir; belge görseli olduğunda ilgili örneğe götürür.
        const coverSrc = city.cover || (docs.length ? docs[0].file : null);
        if (coverSrc) {
            cityModalCover.alt = city.cover ? city.name : docs[0].title;
            cityModalCover.src = coverSrc;
            // Class'ı kaldırıp bir reflow sonrası geri eklemek, aynı <img>
            // elemanı şehirden şehre yeniden kullanıldığında animasyonun her
            // açılışta baştan oynamasını sağlıyor (senkron — görsel önbellekte
            // olsa da olmasa da her zaman tetiklenir, 'load' olayına bağlı
            // değil, böylece görsel hiçbir zaman görünmez kalmaz).
            cityModalCover.classList.remove('map-city-modal-cover-fade');
            void cityModalCover.offsetWidth;
            cityModalCover.classList.add('map-city-modal-cover-fade');

            if (city.cover) {
                cityModalCoverLink.removeAttribute('href');
            } else {
                cityModalCoverLink.href = `index.html?sample=${encodeURIComponent(docs[0].key)}`;
            }
            cityModalCoverLink.hidden = false;
            cityModalCard.classList.add('has-cover');
        } else {
            cityModalCoverLink.hidden = true;
            cityModalCard.classList.remove('has-cover');
        }

        cityModalDocs.innerHTML = renderDocsHtml(docs, 'Bu şehirle ilişkilendirilmiş bir örnek belge henüz yok.');

        setCityModalTab('info');
        cityModal.classList.remove('hidden');
        setActive(chip, markerEl);
    }

    cityModalClose.addEventListener('click', closeCityModal);
    cityModal.addEventListener('click', (e) => {
        if (e.target === cityModal) closeCityModal();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !cityModal.classList.contains('hidden')) closeCityModal();
    });

    const headingsShown = new Set();

    CITIES.forEach(city => {
        const marker = L.marker([city.lat, city.lng], { icon: cityIcon(city), keyboard: true, title: city.name })
            .addTo(map);

        // Üzerine gelince (tıklamadan önce) hafif bir önizleme — büyük
        // pencere (openCityModal) sadece tıklanınca açılır. Belgeler de
        // burada (varsa) küçük kartlar olarak gösterilir.
        marker.bindTooltip(`
            <span class="map-city-popover-era">${city.era}</span>
            <div class="entity-popover-text">${city.name}</div>
            <div class="entity-popover-context">${city.blurb}</div>
            ${renderDocsHtml(city.documents || [])}
        `, { className: 'map-city-hover', direction: 'top', offset: [0, -12] });

        const categoryMeta = city.category && CATEGORY_META[city.category];
        if (categoryMeta && !headingsShown.has(city.category)) {
            const heading = document.createElement('span');
            heading.className = 'map-legend-heading';
            heading.textContent = categoryMeta.label;
            mapLegend.appendChild(heading);
            headingsShown.add(city.category);
        }

        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'map-legend-chip';
        chip.textContent = city.name;
        mapLegend.appendChild(chip);

        marker.on('click', () => openCityModal(city, chip, marker.getElement()));
        chip.addEventListener('click', () => {
            map.flyTo([city.lat, city.lng], Math.max(map.getZoom(), map.getMinZoom() + 2), { duration: 0.6 });
            openCityModal(city, chip, marker.getElement());
        });
    });
});
