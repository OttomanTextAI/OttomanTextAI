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

    // Sol menüdeki hesap kartı — /api/auth/me'den gelen full_name/title/
    // avatar_url ile dolduruluyor; giriş yoksa placeholder (silüet +
    // "Profilim") olduğu gibi kalır.
    const authToken = localStorage.getItem('auth_token');

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
        fetch('https://ottoman-text-ai.onrender.com/api/auth/me', {
            headers: { 'Authorization': `Bearer ${authToken}` }
        })
            .then(res => res.ok ? res.json() : null)
            .then(renderSidebarProfileCard)
            .catch(() => {});
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

        function escapeHtml(text) {
            return (text || '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');
        }

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
            if (!authToken) {
                navSearchResults.innerHTML = `<p class="nav-search-empty">Arama için giriş yapmalısınız.</p>`;
                return;
            }
            navSearchTimer = setTimeout(async () => {
                const requestId = ++navSearchRequestId;
                try {
                    const res = await fetch(`https://ottoman-text-ai.onrender.com/api/documents?per_page=4&q=${encodeURIComponent(query)}`, {
                        headers: { 'Authorization': `Bearer ${authToken}` }
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
            cover: 'assets/sehirler/edirne.jpg',
            era: 'Başkent (1365–1453)',
            blurb: 'Roma ve Bizans döneminde Hadrianopolis adıyla bilinen şehir, 1361 civarında Osmanlı topraklarına katıldı ve 1453\'te İstanbul fethedilene kadar imparatorluğun başkenti oldu. Başkent İstanbul\'a taşındıktan sonra da önemini kaybetmedi: 17. yüzyılda IV. Mehmed döneminde sultanların av ve dinlenme mevsimlerini geçirdiği âdeta "ikinci başkent" hâline geldi ve 1575\'te Mimar Sinan\'ın "ustalık eserim" dediği Selimiye Camii burada tamamlandı. 19. ve 20. yüzyıllarda ise sınır şehri olmanın bedelini ödedi; 1829, 1878 ve Balkan Savaşları\'nda birkaç kez kısa süreliğine elden çıktı ve geri alındı.',
        },
        {
            id: 'istanbul', name: 'İstanbul', lat: 41.0082, lng: 28.9784,
            era: 'Başkent (1453–1922)',
            blurb: 'Bizans İmparatorluğu\'nun bin yılı aşkın başkenti Konstantinopolis, 29 Mayıs 1453\'te II. Mehmed tarafından fethedilerek Osmanlı\'nın yeni başkenti oldu. 16. yüzyılda Kanuni Sultan Süleyman döneminde nüfusu ve imarı doruğa çıktı; Süleymaniye Camii ve çevresindeki külliye bu "altın çağın" simgelerinden biridir. 19. yüzyılda Tanzimat reformlarıyla birlikte Pera ve Galata modern bir Avrupa şehri gibi dönüşürken, Birinci Dünya Savaşı sonunda 1918-1923 arasında İtilaf devletlerince işgal edildi. Cumhuriyet\'in ilanıyla başkentlik unvanını Ankara\'ya bıraksa da, imparatorluğun 470 yıllık siyasi, kültürel ve ticari kalbi olmaya devam etti.',
            cover: 'assets/3-suleymaniye-camii-ve-cevresi-gouffier.jpg',
            documents: [
                { key: 'tah', file: 'assets/tah.png', title: 'Tercüman-ı Ahval Gazetesi\'nin 25. Sayısı' },
            ],
        },
        {
            id: 'bursa', name: 'Bursa', lat: 40.1826, lng: 29.0665,
            cover: 'assets/sehirler/bursa.jpg',
            era: 'Başkent (1326–1365)',
            blurb: 'Roma dönemindeki adıyla Prusa, 1326\'da Orhan Gazi tarafından fethedilerek genç Osmanlı Beyliği\'nin ilk başkenti oldu ve bu unvanı 1365\'e, başkentin Edirne\'ye taşınmasına kadar taşıdı. Başkent olmaktan çıktıktan sonra da imparatorluğun en zengin şehirlerinden biri olarak kaldı; İran ve Uzakdoğu\'dan gelen ipeğin Avrupa\'ya açılan kapısı hâline geldi ve yüzyıllar boyunca Osmanlı ipekli dokumacılığının merkezi oldu. Yıldırım Bayezid ve Çelebi Mehmed dönemlerinde inşa edilen Ulu Cami ile Yeşil Cami ve Türbe, erken Osmanlı mimarisinin en önemli örnekleri arasında sayılır.',
        },
        {
            id: 'ankara', name: 'Ankara', lat: 39.9334, lng: 32.8597,
            cover: 'assets/sehirler/ankara.jpg',
            era: 'Osmanlı Anadolusu / Kurtuluş Savaşı Başkenti',
            blurb: 'Roma ve Bizans döneminde Ankyra adıyla bilinen, Selçuklu ve beylikler devrinden sonra 14. yüzyılda Osmanlı topraklarına katılan şehir, yüzyıllarca tiftik keçisinden elde edilen "sof" (Ankara yünü) ticaretiyle tanınan mütevazı bir Anadolu kasabası olarak kaldı. Bu sakin taşra hayatı 1919-1920\'de kökten değişti: Mustafa Kemal Paşa\'nın Millî Mücadele\'yi örgütlemek için merkez seçmesiyle 23 Nisan 1920\'de Büyük Millet Meclisi burada açıldı ve şehir savaşın fiilî başkenti oldu. 1923\'te Cumhuriyet\'in ilanıyla birlikte resmî başkent unvanını alarak İstanbul\'un yerini aldı.',
            documents: [
                { key: 'hbv', file: 'assets/hbv.png', title: 'Hacı Bayram Veli Vakfı Tevliyet ve Meşihat Beratı' },
                { key: '1', file: 'assets/im.png', title: 'İstiklâl Marşı' },
            ],
        },
        {
            id: 'konya', name: 'Konya', lat: 37.8746, lng: 32.4932,
            cover: 'assets/sehirler/konya.jpg',
            era: 'Anadolu Beylikleri – Osmanlı',
            blurb: 'Bizans döneminde Ikonion adıyla bilinen şehir, 12. ve 13. yüzyıllarda Anadolu Selçuklu Devleti\'nin başkenti olarak altın çağını yaşadı; Mevlânâ Celâleddîn-i Rûmî 1228\'de buraya yerleşerek şehri tasavvuf düşüncesinin merkezi hâline getirdi. Selçuklu Devleti\'nin dağılmasının ardından bölge önce Karamanoğulları Beyliği\'nin elinde kaldı, 15. yüzyılın ikinci yarısında Fatih Sultan Mehmed ve II. Bayezid dönemlerinde kesin olarak Osmanlı topraklarına katıldı. Osmanlı asırları boyunca Mevlevî tarikatının merkezi ve önemli bir ilim şehri olma özelliğini korudu.',
        },
        {
            id: 'sivas', name: 'Sivas', lat: 39.7477, lng: 37.0179,
            cover: 'assets/sehirler/sivas.jpg',
            era: 'Osmanlı Anadolusu / Sivas Kongresi (Eylül 1919)',
            blurb: 'Roma-Bizans döneminde Sebasteia olarak bilinen şehir, Selçuklu ve Danişmendli devirlerinde İpek Yolu\'nun Anadolu\'daki önemli konaklarından biriydi; Gök Medrese ve Çifte Minareli Medrese gibi 13. yüzyıl yapıları bu döneme tanıklık eder. Osmanlı idaresi altında doğu Anadolu\'nun idari ve vakıf merkezlerinden biri olarak varlığını sürdürdü. Yüzyıllar sonra, Eylül 1919\'da burada toplanan Sivas Kongresi, Erzurum Kongresi kararlarını tüm ülkeyi kapsayacak şekilde genişleterek Millî Mücadele\'nin tek elden yürütülmesini sağladı ve Türkiye tarihinin dönüm noktalarından biri oldu.',
            documents: [
                { key: 'svf', file: 'assets/svf.png', title: 'Sivas\'taki Vakıf Şartlarına Dair Ferman' },
                { key: 'tah', file: 'assets/tah.png', title: 'Tercüman-ı Ahval Gazetesi\'nin 25. Sayısı' },
            ],
        },
        {
            id: 'halep', name: 'Halep', lat: 36.2021, lng: 37.1343,
            cover: 'assets/sehirler/halep.jpg',
            era: 'Osmanlı Suriyesi',
            blurb: 'Kadim bir ticaret şehri olan Halep, 1516\'da Yavuz Sultan Selim\'in Mercidabık Zaferi\'yle Memlük topraklarından Osmanlı\'ya katıldı. 16. ve 17. yüzyıllarda Venedik, İngiliz ve Fransız tüccarların açtığı konsolosluklar ve hanlarla İpek Yolu\'nun Akdeniz\'e açılan en zengin uğrak noktalarından biri hâline geldi; bu dönemde İstanbul ve Kahire\'den sonra imparatorluğun üçüncü büyük şehri sayılırdı. Birinci Dünya Savaşı\'nın ardından 1918\'de İngiliz-Arap kuvvetlerinin eline geçti ve Fransız Suriye mandası sınırları içinde kaldı.',
            documents: [
                { key: 'sbh', file: 'assets/sbh.png', title: 'Şam, Baalbek ve Halep Mühimme Hükümleri' },
                { key: 'tah', file: 'assets/tah.png', title: 'Tercüman-ı Ahval Gazetesi\'nin 25. Sayısı' },
            ],
        },
        {
            id: 'sam', name: 'Şam', lat: 33.5138, lng: 36.2765,
            cover: 'assets/sehirler/sam.jpg',
            coverPosition: 'center bottom',
            era: 'Osmanlı Suriyesi',
            blurb: 'Emevi Camii gibi İslam\'ın en eski anıtlarına ev sahipliği yapan Şam, 1516\'da Halep ile aynı sefer sırasında Osmanlı topraklarına katıldı. Yüzyıllar boyunca Şam Eyaleti\'nin idari merkezi olmasının yanında, her yıl Mekke ve Medine\'ye giden büyük hac kervanının toplanma noktası olarak da özel bir öneme sahipti; bu görev şehre "Şam-ı Şerif" unvanını kazandırdı. Birinci Dünya Savaşı sonunda, 1918\'de Arap ayaklanması ve İngiliz kuvvetlerinin ilerleyişiyle Osmanlı idaresinden çıktı.',
            documents: [
                { key: 'sbh', file: 'assets/sbh.png', title: 'Şam, Baalbek ve Halep Mühimme Hükümleri' },
            ],
        },
        {
            id: 'bagdat', name: 'Bağdat', lat: 33.3152, lng: 44.3661,
            cover: 'assets/sehirler/bagdat.jpg',
            era: 'Osmanlı Irak\'ı',
            blurb: 'Abbasi halifeliğinin eski başkenti Bağdat, 16. yüzyılda Osmanlı ve Safevi İran arasında defalarca el değiştirdi; Kanuni Sultan Süleyman 1534\'te şehri aldı, IV. Murad ise 1638\'deki kesin fetihle Osmanlı hâkimiyetini kalıcı hâle getirdi ve bunu 1639 Kasr-ı Şirin Antlaşması pekiştirdi. Bu yüzyıllar boyunca Fuzûlî gibi büyük divan şairlerinin yaşadığı, Osmanlı Irak\'ının en önemli kültür ve ilim merkezi olma özelliğini korudu. Birinci Dünya Savaşı\'nda Mezopotamya Cephesi\'nin odağı hâline geldi ve Mart 1917\'de İngiliz kuvvetlerinin eline geçti.',
            documents: [
                { key: 'hero', file: 'assets/sk.png', title: 'Fuzûlî\'nin Su Kasidesi' },
            ],
        },
        {
            id: 'kahire', name: 'Kahire', lat: 30.0444, lng: 31.2357,
            cover: 'assets/sehirler/kahire.jpg',
            era: 'Osmanlı Mısır\'ı (1517–1914)',
            blurb: '1517\'de Yavuz Sultan Selim\'in Ridaniye Zaferi\'yle Memlük Sultanlığı\'na son vererek Osmanlı topraklarına kattığı Kahire, halifelik unvanının da sembolik olarak İstanbul\'a taşınmasına vesile oldu. Yüzyıllarca Mısır Eyaleti\'nin başkenti ve imparatorluğun en zengin tahıl ambarlarından biri olarak kaldı. 1805\'ten itibaren Kavalalı Mehmed Ali Paşa ve hanedanı altında giderek özerkleşti; 1882\'de İngiliz işgaline uğrayan şehir, resmî olarak Birinci Dünya Savaşı sırasında Osmanlı\'dan tamamen koptu.',
        },
        {
            id: 'selanik', name: 'Selanik', lat: 40.6401, lng: 22.9444,
            cover: 'assets/sehirler/selanik.jpg',
            era: 'Osmanlı Rumelisi (1430–1912)',
            blurb: '1430\'da II. Murad tarafından fethedilen Selanik, 1492\'de İspanya\'dan sürülen Sefarad Yahudilerinin büyük kitleler hâlinde yerleşmesiyle imparatorluğun en kozmopolit liman şehirlerinden birine dönüştü. 19. yüzyılda tütün ve tekstil ticaretiyle büyüyen şehir, aynı zamanda 1881\'de Mustafa Kemal\'in doğduğu yer ve 1889\'da kurulan İttihat ve Terakki Cemiyeti\'nin doğum yeri olarak yakın tarihte kritik bir rol oynadı. Birinci Balkan Savaşı sırasında, Kasım 1912\'de Yunan kuvvetlerinin eline geçerek beş asırlık Osmanlı idaresi sona erdi.',
            documents: [
                { key: 'hmg', file: 'assets/hmg.png', title: 'Hanımlara Mahsus Gazete Eki' },
            ],
        },
        {
            id: 'izmir', name: 'İzmir', lat: 38.4237, lng: 27.1428,
            cover: 'assets/sehirler/izmir.jpg',
            era: 'Osmanlı Ege Limanı / Kurtuluşu (9 Eylül 1922)',
            blurb: 'Osmanlı döneminde nispeten mütevazı bir liman kasabası olan İzmir, özellikle 17. yüzyıldan itibaren Avrupa ile Levant ticaretinin merkezi hâline gelerek hızla büyüdü; kalabalık Rum, Ermeni, Yahudi ve Levanten nüfusuyla "Gâvur İzmir" lakabını kazandı. 15 Mayıs 1919\'da Yunan kuvvetlerince işgal edilmesi Millî Mücadele\'nin fiilî tetikleyicilerinden biri oldu. 9 Eylül 1922\'de Türk ordusunca kurtarılan şehir, ardından çıkan büyük yangınla eski çok kültürlü dokusunun önemli bir bölümünü kaybetti; bu tarih bugün de Kurtuluş Savaşı\'nın zaferle noktalandığı gün olarak anılır.',
        },
        {
            id: 'kudus', name: 'Kudüs', lat: 31.7683, lng: 35.2137,
            cover: 'assets/sehirler/kudus.jpg',
            era: 'Osmanlı Filistini (1517–1917)',
            blurb: 'Üç semavi din için de kutsal kabul edilen Kudüs, 1517\'de Yavuz Sultan Selim döneminde Osmanlı topraklarına katıldı. Kanuni Sultan Süleyman 1530\'larda ve 1540\'larda şehrin surlarını baştan inşa ettirdi; bugün görülen sur hattı büyük ölçüde bu döneme aittir. Yaklaşık dört asır süren görece istikrarlı Osmanlı idaresi, Birinci Dünya Savaşı\'nda Aralık 1917\'de General Allenby komutasındaki İngiliz kuvvetlerinin şehre girmesiyle sona erdi.',
        },
        {
            id: 'mekke', name: 'Mekke', lat: 21.3891, lng: 39.8579,
            cover: 'assets/sehirler/mekke.jpg',
            era: 'Hicaz Eyaleti — Haremeyn',
            blurb: 'İslam\'ın en kutsal şehri olan Mekke, doğrudan bir eyalet merkezi olarak değil, 1517\'den itibaren Osmanlı himayesindeki yerel Mekke Şerifleri eliyle yönetildi; bu sorumluluk Osmanlı padişahlarına "Haremeyn\'in Hizmetkârı" (Hâdimü\'l-Haremeyn) unvanını kazandırdı. 20. yüzyılın başında hac yolculuğunu kolaylaştırmak için inşa edilen Hicaz Demiryolu, Şam\'ı Medine\'ye bağlayarak bölgeyi imparatorluğun geri kalanına yakınlaştırdı. 1916\'da Şerif Hüseyin önderliğindeki Arap İsyanı\'yla birlikte Osmanlı idaresi sona erdi.',
        },
        {
            id: 'medine', name: 'Medine', lat: 24.5247, lng: 39.5692,
            cover: 'assets/sehirler/medine.jpg',
            era: 'Hicaz Eyaleti — Haremeyn',
            blurb: 'Hz. Muhammed\'in kabrini ve Mescid-i Nebevî\'yi barındıran Medine, Mekke gibi 1517\'den itibaren Osmanlı himayesi altına girdi ve hac güzergâhının en kutsal duraklarından biri olarak özel bir statüde yönetildi. 1908\'de tamamlanan Hicaz Demiryolu\'nun son durağı olan şehir, Birinci Dünya Savaşı\'nda Fahreddin Paşa komutasındaki Osmanlı garnizonunun efsanevi savunmasına sahne oldu; Osmanlı Mondros Mütarekesi\'ni imzaladıktan sonra bile aylarca kuşatma altında direnen şehir ancak 1919\'da teslim oldu.',
        },
        {
            id: 'belgrad', name: 'Belgrad', lat: 44.7866, lng: 20.4489,
            cover: 'assets/sehirler/belgrad.jpg',
            era: 'Osmanlı Sınır Kalesi (1521–1867)',
            blurb: 'Kanuni Sultan Süleyman\'ın 1521\'de fethettiği Belgrad, bundan önce 1456\'da II. Mehmed\'in kuşatmasına direnmiş stratejik bir Tuna kalesiydi. Yüzyıllar boyunca Osmanlı\'nın Orta Avrupa\'ya açılan kapısı ve Habsburglarla girişilen savaşların en önemli cephe kalesi oldu; 17. ve 18. yüzyıllarda birkaç kez Avusturya kuvvetlerince alınıp (1688, 1717) yeniden Osmanlı\'ya geri kazanıldı (1739). Sırp özerklik hareketleri sonucunda 1867\'de son Osmanlı garnizonu da kaleyi terk ederek bölgedeki 346 yıllık hâkimiyet sona erdi.',
        },
        {
            id: 'saraybosna', name: 'Saraybosna', lat: 43.8563, lng: 18.4131,
            cover: 'assets/sehirler/saraybosna.jpg',
            era: 'Bosna Eyaleti',
            blurb: '1461\'de Osmanlı fethinin ardından İsa Bey İshakoviç tarafından adeta sıfırdan kurulup geliştirilen Saraybosna, kısa sürede Bosna Eyaleti\'nin idari ve ticari merkezi hâline geldi; 15. ve 16. yüzyıllarda inşa edilen camiler, bedesten ve hanlarla Osmanlı şehirciliğinin Balkanlar\'daki en güzel örneklerinden biri oldu. 1878 Berlin Kongresi\'yle fiilî yönetim Avusturya-Macaristan\'a geçse de şehir hukuken 1908\'e, resmî ilhaka kadar Osmanlı toprağı sayıldı.',
            documents: [
                { key: '2', file: 'assets/fsma.png', title: 'Fatih Sultan Mehmed\'in Ahidnamesi' },
            ],
        },
        {
            id: 'trabzon', name: 'Trabzon', lat: 41.0027, lng: 39.7168,
            cover: 'assets/sehirler/trabzon.jpg',
            era: 'Osmanlı Karadeniz Limanı (1461–)',
            blurb: 'Bizans\'ın son büyük artığı olan bağımsız Trabzon Rum İmparatorluğu\'nun başkenti olan şehir, 1461\'de Fatih Sultan Mehmed tarafından fethedilerek Osmanlı topraklarına katıldı; bu, Bizans mirasının Anadolu\'daki son kalıntısının da sonu oldu. Yüzyıllar boyunca İran ve Kafkasya ticaretini Karadeniz üzerinden Avrupa\'ya bağlayan önemli bir liman kenti olarak kaldı. Birinci Dünya Savaşı\'nda 1916-1918 arasında Rus kuvvetlerince işgal edildi, savaş sonunda geri alındı.',
            documents: [
                { key: 'gkt', file: 'assets/gkt.png', title: 'Gümüşhanevî Kütüphanelerindeki Kitapların Tiflis\'ten Geri Getirilmesi Talebi' },
            ],
        },
        {
            id: 'diyarbakir', name: 'Diyarbakır', lat: 37.9144, lng: 40.2306,
            cover: 'assets/sehirler/diyarbakir.jpg',
            era: 'Osmanlı Doğu Anadolusu',
            blurb: 'Roma ve Bizans döneminden kalma kara bazalt surlarıyla tanınan Diyarbakır (eski adıyla Amid), 1515\'te Yavuz Sultan Selim\'in seferi ve İdris-i Bitlisî\'nin diplomatik çabalarıyla, bölgedeki Kürt beyliklerinin gönüllü katılımı sağlanarak Osmanlı topraklarına katıldı. Bu barışçıl ilhak modeli, imparatorluğun doğu sınırının Safevi İran\'a karşı güvence altına alınmasında kritik rol oynadı. Sonraki yüzyıllarda Yukarı Mezopotamya\'nın idari ve ticari merkezi olarak önemini korudu.',
        },
        {
            id: 'musul', name: 'Musul', lat: 36.3489, lng: 43.1189,
            cover: 'assets/sehirler/musul.jpg',
            era: 'Osmanlı Irak\'ı — Musul Eyaleti',
            blurb: '16. yüzyılda Osmanlı-Safevi mücadeleleri sırasında el değiştirerek nihayetinde Osmanlı topraklarına katılan Musul, Dicle kıyısındaki konumu sayesinde ticaret ve özellikle ince pamuklu dokuma üretimiyle tanındı; Avrupa dillerine geçen "muslin" kumaş adı buradan gelir. 20. yüzyıl başında bölgedeki petrol yataklarının fark edilmesiyle stratejik önemi arttı. Birinci Dünya Savaşı\'nın hemen sonrasında İngiliz kuvvetlerince işgal edildi ve 1926\'da Milletler Cemiyeti kararıyla yeni kurulan Irak Krallığı\'na bırakıldı — Türkiye Cumhuriyeti\'nin sınır iddiasına rağmen.',
        },
        {
            id: 'basra', name: 'Basra', lat: 30.5085, lng: 47.7835,
            cover: 'assets/sehirler/basra.jpg',
            era: 'Osmanlı Irak\'ı — Basra Eyaleti',
            blurb: 'Basra Körfezi\'ne açılan konumu sayesinde Hindistan ve Uzakdoğu ile deniz ticaretinin Osmanlı topraklarına açılan kapısı olan Basra, 16. yüzyıldan itibaren zaman zaman doğrudan, zaman zaman yerel hanedanlar eliyle Osmanlı idaresinde kaldı. 19. yüzyılın ikinci yarısından itibaren artan İngiliz nüfuzu, Birinci Dünya Savaşı\'nın başında, Kasım 1914\'te şehrin İngiliz kuvvetlerince işgaliyle sonuçlandı ve Mezopotamya Cephesi böylece açılmış oldu.',
        },
        {
            id: 'tiflis', name: 'Tiflis', lat: 41.7151, lng: 44.8271,
            cover: 'assets/sehirler/tiflis.jpg',
            coverPosition: 'center bottom',
            era: 'Kafkasya — Osmanlı-Safevi Sınır Bölgesi',
            blurb: 'Kafkasya\'nın önemli bir merkezi olan Tiflis, Osmanlı-Safevi (ve sonrasında Osmanlı-İran) mücadeleleri sırasında birkaç kez Osmanlı ordularınca ele geçirilip idare edildi; özellikle 1578-1580\'ler ve 1723-1735 yılları arasındaki dönemlerde şehir doğrudan Osmanlı kontrolündeydi. Ancak bu hâkimiyet hiçbir zaman kalıcı olmadı ve 1801\'de Rusya İmparatorluğu\'nun ilhakıyla birlikte bölge tamamen Osmanlı nüfuz alanının dışına çıktı.',
            documents: [
                { key: 'gkt', file: 'assets/gkt.png', title: 'Gümüşhanevî Kütüphanelerindeki Kitapların Tiflis\'ten Geri Getirilmesi Talebi' },
            ],
        },
        {
            id: 'cezayir', name: 'Cezayir', lat: 36.7538, lng: 3.0588,
            cover: 'assets/sehirler/cezayir.jpg',
            era: 'Cezayir Ocağı (1516–1830)',
            blurb: '1516\'da Barbaros Kardeşler\'in (Oruç ve Hızır Hayreddin Reis) bölgeye hâkim olmasıyla Osmanlı himayesine giren Cezayir, sultana bağlı ancak geniş özerkliğe sahip bir ocak/eyalet olarak yönetildi. Yüzyıllar boyunca Barbaros Hayreddin Paşa\'nın da mirasını taşıyan güçlü bir donanmayla Akdeniz\'de Osmanlı deniz gücünün ve korsanlık faaliyetlerinin en önemli üssü oldu. 1830\'da Fransa\'nın işgaliyle üç asırlık Osmanlı bağı sona erdi.',
        },
        {
            id: 'tunus', name: 'Tunus', lat: 36.8065, lng: 10.1815,
            cover: 'assets/sehirler/tunus.jpg',
            era: 'Tunus Eyaleti (1574–1881)',
            blurb: '1574\'te Kaptan-ı Derya Sinan Paşa\'nın seferiyle İspanya destekli son Hafsî kalıntılarına son verilerek Osmanlı topraklarına katılan Tunus, 1705\'ten itibaren Hüseynî hanedanının Bey unvanıyla yönettiği, pratikte giderek özerkleşen bir eyalet hâline geldi. Hafsî mirası üzerine kurulan canlı bir Akdeniz liman şehri olarak ticari önemini korudu. 1881\'de Fransız işgaliyle protektora statüsüne geçerek fiilî Osmanlı bağı kopmuş oldu.',
        },

        // --- Trablusgarp Savaşı ve Birinci Dünya Savaşı (1911–1918) ---
        // category:'wwi' — legend'de ayrı bir başlık altında gruplanır (bkz.
        // aşağıdaki CATEGORY_META).
        {
            id: 'trablusgarp', name: 'Trablusgarp', lat: 32.8872, lng: 13.1913,
            cover: 'assets/sehirler/trablusgarp.jpg',
            coverPosition: 'center top',
            era: 'Trablusgarp Savaşı (1911–1912)',
            blurb: '1551\'de Turgut Reis\'in fethiyle Osmanlı topraklarına katılan Trablusgarp, 18. ve 19. yüzyıllarda Karamanlı hanedanının özerk yönetiminden geçerek yüzyılın ortasında yeniden doğrudan Osmanlı idaresine döndü. 1911-1912 Trablusgarp Savaşı\'nda İtalyan işgaline karşı verilen savunmaya, aralarında Mustafa Kemal ve Enver Bey\'in de bulunduğu genç subaylar gönüllü olarak katıldı; savaş, yerel direnişe rağmen bölgenin İtalya\'ya bırakılmasıyla sonuçlandı ve imparatorluğun Kuzey Afrika\'daki son toprağının kaybı anlamına geldi.',
            category: 'wwi',
        },
        {
            id: 'canakkale', name: 'Çanakkale', lat: 40.1553, lng: 26.4142,
            cover: 'assets/sehirler/canakkale.jpg',
            era: 'Birinci Dünya Savaşı — Çanakkale Savaşı (1915)',
            blurb: 'Antik çağlardan beri stratejik önemi bilinen Çanakkale Boğazı, II. Mehmed döneminden itibaren kıyı kaleleriyle tahkim edilmişti. Birinci Dünya Savaşı\'nda, 1915\'te İtilaf donanmasının Boğaz\'ı zorlayarak İstanbul\'a ulaşma girişimi önce deniz muharebelerinde, ardından aylar süren ve on binlerce kayıpla sonuçlanan kara savaşında durduruldu. Bu büyük savunma zaferi, hem imparatorluğun çöküşünü geciktirdi hem de Mustafa Kemal\'in millî bir lider olarak öne çıkmasını sağladı.',
            category: 'wwi',
        },
        {
            id: 'kanal', name: 'Kanal Cephesi', lat: 30.5852, lng: 32.2654,
            cover: 'assets/sehirler/kanal.jpg',
            era: 'Sina Cephesi — Kanal Harekâtı (1915)',
            blurb: '1915\'te Cemal Paşa ve Alman danışmanların planladığı harekâtla Osmanlı kuvvetleri, İngiliz kontrolündeki Süveyş Kanalı\'nı Sina Çölü\'nü aşarak geçmeyi denedi. Harekât askerî olarak başarısız olsa da, İngilizlerin Filistin\'e yönelik karşı taarruzunu tetikleyerek savaşın sonraki yıllarında imparatorluğu ağır kayıplara uğratacak Sina-Filistin Cephesi\'nin fiilen açılmasına yol açtı.',
            category: 'wwi',
        },
        {
            id: 'kutulamare', name: 'Kûtülamâre', lat: 32.5122, lng: 45.8235,
            cover: 'assets/sehirler/kutulamare.jpg',
            era: 'Irak Cephesi — Kûtülamâre Kuşatması ve Zaferi (1915–1916)',
            blurb: '1915 sonunda Bağdat\'a ilerleyen General Townshend komutasındaki İngiliz-Hint kuvvetleri, Osmanlı ordusunca Kûtülamâre\'de kuşatma altına alındı. Aylar süren kuşatmanın ardından Nisan 1916\'da yaklaşık 13 bin kişilik İngiliz garnizonu teslim oldu; bu, İkinci Dünya Savaşı\'ndaki Singapur\'a kadar İngiliz tarihinin en büyük teslimiyetlerinden biri olarak kaldı ve Osmanlı ordusuna Mezopotamya Cephesi\'nde parlak bir zafer kazandırdı.',
            category: 'wwi',
        },
        {
            id: 'gazze', name: 'Gazze', lat: 31.5017, lng: 34.4668,
            cover: 'assets/sehirler/gazze.jpg',
            era: 'Filistin Cephesi — Gazze Muharebeleri (1917)',
            blurb: '1917 yılında üç kez sahne olduğu Gazze Muharebeleri, Filistin Cephesi\'nin kaderini belirledi. Mart ve Nisan 1917\'deki ilk iki çarpışmada Osmanlı savunması İngiliz ilerleyişini durdurmayı başarsa da, General Allenby komutasındaki üçüncü taarruzda (Ekim-Kasım 1917) cephe yarıldı; bu gelişme birkaç hafta sonra Kudüs\'ün kaybına giden sürecin başlangıcı oldu.',
            category: 'wwi',
        },
        {
            id: 'yemen', name: 'Yemen Cephesi', lat: 15.3694, lng: 44.1910,
            cover: 'assets/sehirler/yemen.jpg',
            era: 'Birinci Dünya Savaşı — Yemen Cephesi',
            blurb: 'İmparatorluğun en uzak ve zorlu coğrafyalarından biri olan Yemen, ilk kez 1538\'de Osmanlı topraklarına katıldı, ancak dağlık iç kesimlerdeki Zeydî direnişi yüzünden 1636\'da büyük ölçüde terk edildi. 1872\'de yeniden ve daha kalıcı biçimde ilhak edilen bölge, Birinci Dünya Savaşı boyunca İstanbul\'la bağlantısı kesilmiş, izole bir garnizon tarafından savunuldu; Osmanlı ordusu burada Mondros Mütarekesi\'nden aylar sonra, 1918\'in sonunda resmen teslim oldu.',
            category: 'wwi',
        },
        {
            id: 'hatay', name: 'Hatay', lat: 36.2023, lng: 36.1613,
            cover: 'assets/sehirler/hatay.jpg',
            era: 'Fransız Mandası ve Hatay Sorunu (1918–1939)',
            blurb: 'Yüzyıllarca Halep vilayetinin bir parçası olan bu bölge, Birinci Dünya Savaşı sonrasında yeni Türkiye sınırlarının dışında kalarak Fransız Suriye mandasına bağlı İskenderun Sancağı adını aldı. Yerel halkın uzun süren direnişi ve Atatürk\'ün yakından takip ettiği diplomatik mücadele sonucunda 1938\'de önce özerk Hatay Devleti kuruldu, ardından yapılan halk oylamasıyla 1939\'da Türkiye Cumhuriyeti\'ne katıldı.',
            category: 'wwi',
        },

        // --- Kurtuluş Savaşı (1919–1922) ---
        // category:'independence' — legend'de ayrı bir başlık altında
        // gruplanır (bkz. aşağıdaki CATEGORY_META).
        {
            id: 'samsun', name: 'Samsun', lat: 41.2867, lng: 36.3300,
            cover: 'assets/sehirler/samsun.jpg',
            era: 'Kurtuluş Savaşı — Millî Mücadele\'nin Başlangıcı (19 Mayıs 1919)',
            blurb: 'Antik çağda Amisos adıyla bilinen, Osmanlı döneminde mütevazı bir Karadeniz limanı olan Samsun, Mustafa Kemal Paşa\'nın 19 Mayıs 1919\'da buraya çıkmasıyla Türk tarihinde eşsiz bir sembolik öneme kavuştu. Bu tarih, işgal altındaki imparatorluğun enkazından yeni bir millî direnişin doğuşu olarak kabul edilir ve bugün Gençlik ve Spor Bayramı olarak kutlanır.',
            category: 'independence',
        },
        {
            id: 'amasya', name: 'Amasya', lat: 40.6499, lng: 35.8353,
            cover: 'assets/sehirler/amasya.jpg',
            era: 'Kurtuluş Savaşı — Amasya Genelgesi (Haziran 1919)',
            blurb: 'Yeşilırmak vadisindeki bu kadim şehir, Osmanlı döneminde özellikle şehzadelerin sancak eğitimi gördüğü önemli merkezlerden biriydi; genç yaşta Fatih Sultan Mehmed ve Kanuni Sultan Süleyman gibi gelecekteki padişahlar burada valilik yaptı. 1555\'te imzalanan Amasya Antlaşması, Osmanlı-Safevi savaşlarına ilk kez resmî bir son vermişti. Yüzyıllar sonra, Haziran 1919\'da yayımlanan Amasya Genelgesi ile Millî Mücadele\'nin gerekçesi ve örgütlenme kararı ilan edildi.',
            category: 'independence',
        },
        {
            id: 'erzurum', name: 'Erzurum', lat: 39.9000, lng: 41.2700,
            cover: 'assets/sehirler/erzurum.jpg',
            era: 'Kurtuluş Savaşı — Erzurum Kongresi (Temmuz–Ağustos 1919)',
            blurb: 'Yüzyıllar boyunca doğuda Safevi İran\'a, sonraları Rusya\'ya karşı imparatorluğun en önemli sınır kalelerinden biri olan Erzurum, bu konumu nedeniyle 1829, 1878 ve 1916-1918\'de birkaç kez Rus işgaline uğradı ve her defasında geri alındı. Temmuz-Ağustos 1919\'da burada toplanan Erzurum Kongresi, doğu vilayetlerinin temsilcilerini bir araya getirerek millî iradeyi esas alan ilk büyük kongrelerden biri oldu ve Sivas Kongresi\'nin de zeminini hazırladı.',
            category: 'independence',
        },
        {
            id: 'inonu', name: 'İnönü', lat: 39.8264, lng: 30.1544,
            cover: 'assets/sehirler/inonu.jpg',
            coverPosition: 'center bottom',
            era: 'Kurtuluş Savaşı — İnönü Muharebeleri (1921)',
            blurb: 'Eskişehir yakınlarındaki bu küçük yerleşim, 1921\'de gerçekleşen Birinci ve İkinci İnönü Muharebeleri\'ne sahne oldu; henüz yeni kurulmakta olan düzenli Türk ordusunun Yunan kuvvetlerine karşı kazandığı bu ilk zaferler, Millî Mücadele\'nin moral açıdan dönüm noktalarından biri oldu. Zaferi yöneten İsmet Paşa, yıllar sonra bu zaferin anısına "İnönü" soyadını aldı.',
            category: 'independence',
        },
        {
            id: 'sakarya', name: 'Sakarya', lat: 39.5836, lng: 32.1462,
            cover: 'assets/sehirler/sakarya.jpg',
            era: 'Kurtuluş Savaşı — Sakarya Meydan Muharebesi (Ağustos–Eylül 1921)',
            blurb: 'Ankara\'ya en yakın cephe hattı olan Sakarya, Ağustos-Eylül 1921\'de yirmi iki gün süren Sakarya Meydan Muharebesi\'ne sahne oldu; Mustafa Kemal Paşa\'nın bizzat cephede kaldığı bu çarpışma, Yunan ilerleyişinin durdurulduğu ve savaşın stratejik üstünlüğünün Türk tarafına geçtiği dönüm noktası oldu. Zaferin ardından Mustafa Kemal\'e TBMM tarafından mareşallik rütbesi ve gazilik unvanı verildi.',
            category: 'independence',
        },
        {
            id: 'afyonkarahisar', name: 'Afyonkarahisar', lat: 38.7507, lng: 30.5567,
            cover: 'assets/sehirler/afyonkarahisar.jpg',
            coverPosition: 'center bottom',
            era: 'Kurtuluş Savaşı — Büyük Taarruz\'un Başlangıcı (26 Ağustos 1922)',
            blurb: 'Frigya ve Bizans döneminden kalma kayalık kalesiyle bilinen bu Osmanlı taşra şehri, haşhaş (afyon) yetiştiriciliğiyle tanınırdı. 26 Ağustos 1922\'de, yakınındaki Kocatepe\'de karargâh kuran Mustafa Kemal\'in komutasında başlatılan Büyük Taarruz, burada Yunan cephesini yararak Kurtuluş Savaşı\'nın son ve kesin safhasını başlattı.',
            category: 'independence',
        },
        {
            id: 'dumlupinar', name: 'Dumlupınar', lat: 39.1667, lng: 29.8500,
            cover: 'assets/sehirler/dumlupinar.jpg',
            era: 'Kurtuluş Savaşı — Başkumandanlık Meydan Muharebesi (30 Ağustos 1922)',
            blurb: 'Kütahya yakınlarındaki bu küçük yerleşim, 30 Ağustos 1922\'de gerçekleşen ve Yunan ana ordusunun büyük ölçüde imha edildiği Başkumandanlık Meydan Muharebesi\'ne sahne oldu. Savaşın kesin sonucunu belirleyen bu zafer sayesinde Türk ordusu birkaç hafta içinde İzmir\'e ulaştı; 30 Ağustos bugün de Türkiye\'de Zafer Bayramı olarak kutlanmaktadır.',
            category: 'independence',
        },
        {
            id: 'mudanya', name: 'Mudanya', lat: 40.3756, lng: 28.8828,
            cover: 'assets/sehirler/mudanya.jpg',
            era: 'Kurtuluş Savaşı — Mudanya Ateşkesi (Ekim 1922)',
            blurb: 'Marmara kıyısındaki bu küçük liman kasabası, Büyük Taarruz\'un ardından Ekim 1922\'de yapılan görüşmelere ev sahipliği yaptı; imzalanan Mudanya Ateşkes Antlaşması, Kurtuluş Savaşı\'nın fiilî sona erişini ve Lozan Barış Konferansı\'na giden sürecin başlangıcını simgeler.',
            category: 'independence',
        },
        {
            id: 'gaziantep', name: 'Gaziantep', lat: 37.0662, lng: 37.3833,
            cover: 'assets/sehirler/gaziantep.jpg',
            era: 'Kurtuluş Savaşı — Antep Savunması',
            blurb: 'Osmanlı döneminde Ayıntab adıyla bilinen şehir, Birinci Dünya Savaşı sonrasında Fransız işgaline uğradı; halkın yaklaşık on ay süren direnişi 1921\'de Fransız kuvvetlerinin çekilmesiyle sonuçlandı. TBMM bu kahramanlık karşısında şehre "Gazi" unvanını verdi ve kentin bugünkü adı buradan gelir.',
            category: 'independence',
        },
        {
            id: 'maras', name: 'Kahramanmaraş', lat: 37.5753, lng: 36.9228,
            cover: 'assets/sehirler/maras.jpg',
            era: 'Kurtuluş Savaşı — Maraş Savunması',
            blurb: 'Osmanlı döneminde önemli bir Anadolu şehri olan Maraş, Birinci Dünya Savaşı sonrasında Fransız ve onlara bağlı Ermeni lejyoner kuvvetlerinin işgaline uğradı. Ocak-Şubat 1920\'de halkın örgütlediği direniş sonucunda işgalciler şehri terk etmek zorunda kaldı; bu direniş anısına kente sonradan "Kahraman" unvanı verilerek adı Kahramanmaraş oldu.',
            category: 'independence',
        },
        {
            id: 'urfa', name: 'Şanlıurfa', lat: 37.1591, lng: 38.7969,
            cover: 'assets/sehirler/urfa.jpg',
            era: 'Kurtuluş Savaşı — Urfa Savunması',
            blurb: 'Kadim bir Yukarı Mezopotamya şehri olan Urfa, Birinci Dünya Savaşı sonrasında kısa süreli Fransız işgaline uğradı; 1920\'de halkın direnişi sonucunda işgalciler şehri terk etti. Bu direnişin anısına kente sonradan "Şanlı" unvanı verilerek adı Şanlıurfa oldu.',
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

    // city.category alttaki şehir dizininde grup başlığı olarak kullanılıyor
    // (bkz. buildLegend()) — işaretler/rozetler hepsi aynı (altın) renkte,
    // kategoriye göre renk farkı yok. 'default' = category alanı olmayan
    // (Osmanlı imparatorluk dönemi) şehirler.
    const CATEGORY_META = {
        default: { label: 'Osmanlı Şehirleri' },
        wwi: { label: 'Trablusgarp ve Birinci Dünya Savaşı (1911–1918)' },
        independence: { label: 'Kurtuluş Savaşı (1919–1922)' },
    };
    const CATEGORY_ORDER = ['default', 'wwi', 'independence'];

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
            cityModalCover.style.objectPosition = city.coverPosition || 'center';
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

    // Şehir başına marker + hover önizlemesi kuruluyor; şehir dizini
    // (aşağıdaki buildLegend()) ayrı bir geçişte, kategoriye göre gruplayıp
    // alfabetik sıralayarak oluşturuluyor — bu yüzden her şehrin marker'ına
    // sonradan (dizinden) erişebilmek için id'ye göre saklanıyor.
    const markersById = {};
    const itemsById = {};

    CITIES.forEach(city => {
        const marker = L.marker([city.lat, city.lng], { icon: cityIcon(city), keyboard: true, title: city.name })
            .addTo(map);

        // Üzerine gelince (tıklamadan önce) hafif bir önizleme — büyük
        // pencere (openCityModal) sadece tıklanınca açılır. Blurb'lar artık
        // birkaç cümlelik ayrıntılı metinler olduğu için ("hafif" önizleme
        // olarak kalsın diye) burada sadece ilk cümle gösteriliyor; tamamı
        // tıklanınca açılan büyük pencerede.
        const teaser = (city.blurb.match(/^[^.]+\./) || [city.blurb])[0];
        marker.bindTooltip(`
            <span class="map-city-popover-era">${city.era}</span>
            <div class="entity-popover-text">${city.name}</div>
            <div class="entity-popover-context">${teaser}</div>
            ${renderDocsHtml(city.documents || [])}
        `, { className: 'map-city-hover', direction: 'top', offset: [0, -12] });

        markersById[city.id] = marker;
    });

    // --- Şehir dizini (alttaki liste) ---
    // Kategoriye göre gruplanır (Osmanlı Şehirleri / Trablusgarp ve I. Dünya
    // Savaşı / Kurtuluş Savaşı), her grup içinde Türkçe alfabetik sıraya
    // dizilir — 42 şehri tek bir düzensiz "chip bulutu" yerine taranabilir
    // bir dizin gibi göstermek için.
    function buildLegend() {
        const groups = new Map();
        CATEGORY_ORDER.forEach(key => groups.set(key, []));
        CITIES.forEach(city => {
            const key = city.category && CATEGORY_META[city.category] ? city.category : 'default';
            groups.get(key).push(city);
        });

        CATEGORY_ORDER.forEach(key => {
            const cities = groups.get(key);
            if (!cities.length) return;
            cities.sort((a, b) => a.name.localeCompare(b.name, 'tr'));

            const group = document.createElement('div');
            group.className = 'map-legend-group';

            const heading = document.createElement('span');
            heading.className = 'map-legend-heading';
            heading.textContent = CATEGORY_META[key].label;
            group.appendChild(heading);

            const list = document.createElement('div');
            list.className = 'map-legend-list';

            cities.forEach(city => {
                const marker = markersById[city.id];
                const item = document.createElement('button');
                item.type = 'button';
                item.className = 'map-legend-item';
                item.textContent = city.name;
                item.addEventListener('click', () => {
                    map.flyTo([city.lat, city.lng], Math.max(map.getZoom(), map.getMinZoom() + 2), { duration: 0.6 });
                    openCityModal(city, item, marker.getElement());
                });
                list.appendChild(item);
                itemsById[city.id] = item;
            });

            group.appendChild(list);
            mapLegend.appendChild(group);
        });
    }

    buildLegend();

    // Marker'a doğrudan (dizinden değil) tıklanınca da aynı pencere açılır —
    // dizindeki karşılığı da (itemsById) vurgulansın diye bu kablolama
    // buildLegend()'den SONRA yapılıyor.
    CITIES.forEach(city => {
        markersById[city.id].on('click', () => {
            openCityModal(city, itemsById[city.id], markersById[city.id].getElement());
        });
    });
});
