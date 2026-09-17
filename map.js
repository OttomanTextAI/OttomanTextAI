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
                const res = await fetch(`https://ottoman-text-ai.onrender.com/api/dictionary/search?q=${encodeURIComponent(query)}&limit=3`);
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

                if (!authToken) {
                    navSearchResults.innerHTML = dictHtml || `<p class="nav-search-empty">Eşleşen kelime bulunamadı. Belgelerinizde aramak için giriş yapmalısınız.</p>`;
                    return;
                }
                try {
                    const res = await fetch(`https://ottoman-text-ai.onrender.com/api/documents?per_page=4&q=${encodeURIComponent(query)}`, {
                        headers: { 'Authorization': `Bearer ${authToken}` }
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
        {
            id: 'kayseri', name: 'Kayseri', lat: 38.7312, lng: 35.4787,
            era: 'Osmanlı Anadolusu',
            blurb: 'Roma döneminde Caesarea, Selçuklu asrında önemli bir ilim ve mimari merkezi olan Kayseri, 1515\'te Yavuz Sultan Selim\'in Dulkadiroğulları Beyliği\'ne son vermesiyle Osmanlı topraklarına katıldı. Erciyes Dağı eteklerindeki konumu sayesinde yüzyıllar boyunca dokumacılık ve kervan ticaretinin önemli duraklarından biri oldu.',
        },
        {
            id: 'malatya', name: 'Malatya', lat: 38.3552, lng: 38.3095,
            era: 'Osmanlı Anadolusu',
            blurb: 'Bizans-Arap sınır mücadelelerine sahne olan kadim Melitene, Dulkadiroğulları Beyliği\'nin bir parçası olarak 1515-1516\'da Yavuz Sultan Selim döneminde Osmanlı topraklarına katıldı. Fırat havzasındaki bereketli toprakları, özellikle kayısı yetiştiriciliğiyle tanınmasını sağladı.',
        },
        {
            id: 'adana', name: 'Adana', lat: 37.0000, lng: 35.3213,
            era: 'Osmanlı Anadolusu',
            blurb: 'Çukurova\'nın merkezi olan Adana, 1517\'den itibaren Ramazanoğulları Beyliği üzerinden Osmanlı\'ya bağlandı, 1608\'de ise doğrudan idareye alındı. 19. yüzyılda pamuk tarımı ve dokumacılığın hızla gelişmesiyle imparatorluğun önemli bir tarım ve sanayi merkezine dönüştü.',
        },
        {
            id: 'antalya', name: 'Antalya', lat: 36.8969, lng: 30.7133,
            era: 'Osmanlı Akdeniz Limanı',
            blurb: 'Selçuklu döneminde önemli bir Akdeniz limanı olan Antalya (Attaleia), bölgedeki Teke Beyliği\'nin 1390\'larda Osmanlı\'ya katılmasıyla imparatorluk topraklarına girdi. Yüzyıllar boyunca Akdeniz ticaretinin ve hac yoluna deniz bağlantısının önemli bir limanı olarak kaldı.',
        },
        {
            id: 'manisa', name: 'Manisa', lat: 38.6191, lng: 27.4289,
            era: 'Osmanlı Anadolusu — Şehzade Sancağı',
            blurb: 'Saruhanoğulları Beyliği\'nin 1390\'da Osmanlı\'ya katılmasıyla imparatorluk topraklarına giren Manisa, Amasya gibi Osmanlı şehzadelerinin sancak eğitimi gördüğü önemli merkezlerden biri oldu. 16. yüzyıldan bu yana her yıl düzenlenen Mesir Macunu şenliği, şehrin bu döneme uzanan bir geleneğidir.',
        },
        {
            id: 'kutahya', name: 'Kütahya', lat: 39.4242, lng: 29.9833,
            era: 'Osmanlı Anadolusu',
            blurb: 'Germiyanoğulları Beyliği\'nin 1429\'da II. Murad döneminde barışçıl biçimde Osmanlı\'ya katılmasıyla imparatorluk topraklarına giren Kütahya, 17. yüzyıldan itibaren İznik geleneğini sürdüren çini ve seramik üretimiyle tanındı.',
        },
        {
            id: 'kastamonu', name: 'Kastamonu', lat: 41.3887, lng: 33.7827,
            era: 'Osmanlı Anadolusu',
            blurb: 'Candaroğulları (İsfendiyaroğulları) Beyliği\'nin merkezi olan Kastamonu, 15. yüzyılın ikinci yarısında Fatih Sultan Mehmed döneminde Osmanlı topraklarına katıldı. Karadeniz\'in iç kesimlere açılan ticaret yollarının kesişim noktalarından biri oldu.',
        },
        {
            id: 'tokat', name: 'Tokat', lat: 40.3167, lng: 36.5500,
            era: 'Osmanlı Anadolusu',
            blurb: 'İpek Yolu\'nun Anadolu\'daki önemli konaklarından olan Tokat, Yıldırım Bayezid döneminde Osmanlı topraklarına katıldı. Bakırcılık zanaatıyla ve 18. yüzyılda kurulan erken dönem Osmanlı matbaalarından biriyle tanındı.',
        },
        {
            id: 'van', name: 'Van', lat: 38.4891, lng: 43.4089,
            era: 'Osmanlı Doğu Anadolusu',
            blurb: 'Urartu döneminden kalma kalesiyle bilinen Van, 16. yüzyılda Osmanlı-Safevi mücadelelerinde defalarca el değiştirdi; Kanuni Sultan Süleyman\'ın 1548 seferiyle kalıcı olarak Osmanlı topraklarına katıldı. Doğu sınırının en önemli kale şehirlerinden biri olarak kaldı.',
        },
        {
            id: 'mardin', name: 'Mardin', lat: 37.3212, lng: 40.7245,
            era: 'Osmanlı Doğu Anadolusu',
            blurb: 'Artuklu ve Akkoyunlu mirasının sarı taş mimarisiyle bezediği Mardin, 1515\'te Diyarbakır ile aynı sefer sırasında, İdris-i Bitlisî\'nin diplomatik çabalarıyla Osmanlı topraklarına katıldı. Yüzyıllar boyunca farklı din ve dillerden toplulukların bir arada yaşadığı bir Yukarı Mezopotamya şehri oldu.',
        },
        {
            id: 'kars', name: 'Kars', lat: 40.6013, lng: 43.0975,
            era: 'Osmanlı Doğu Sınırı',
            blurb: 'Osmanlı-Safevi ve sonrasında Osmanlı-Rus mücadelelerinin odağındaki bu sınır kalesi, 16. yüzyılda Osmanlı topraklarına katıldı. 1877-78 Osmanlı-Rus Savaşı sonunda Kars, Ardahan ve Batum ile birlikte Rusya\'ya bırakıldı (\"Elviye-i Selâse\"); Birinci Dünya Savaşı\'nın ardından 1921 Kars Antlaşması\'yla yeniden Türkiye\'ye katıldı.',
        },
        {
            id: 'uskup', name: 'Üsküp', lat: 41.9981, lng: 21.4254,
            era: 'Osmanlı Rumelisi (1392–1912)',
            blurb: 'I. Bayezid döneminde 1392\'de fethedilen Üsküp, Rumeli\'nin idari ve askeri merkezlerinden biri olarak beş asra yakın Osmanlı idaresinde kaldı. Balkan Savaşları sırasında, 1912\'de Sırp kuvvetlerinin eline geçti.',
        },
        {
            id: 'manastir', name: 'Manastır', lat: 41.0297, lng: 21.3347,
            era: 'Osmanlı Rumelisi',
            blurb: 'Rumeli\'nin önemli bir idari ve askeri merkezi olan Manastır (bugünkü Bitola), 20. yüzyıl başında Jön Türk hareketinin de canlı olduğu şehirlerden biriydi. Balkan Savaşları sırasında, 1912\'de Sırp kuvvetlerinin eline geçerek beş asırlık Osmanlı idaresi sona erdi.',
        },
        {
            id: 'yanya', name: 'Yanya', lat: 39.6650, lng: 20.8537,
            era: 'Osmanlı Rumelisi (1430–1913)',
            blurb: 'II. Murad döneminde 1430\'da Osmanlı topraklarına katılan Yanya (Ioannina), 18. ve 19. yüzyıl başında Tepedelenli Ali Paşa\'nın merkezî otoriteye rağmen kurduğu yarı bağımsız yönetimle özel bir döneme sahne oldu. Balkan Savaşları sırasında, 1913\'te Yunanistan\'ın eline geçti.',
        },
        {
            id: 'filibe', name: 'Filibe', lat: 42.1354, lng: 24.7453,
            era: 'Osmanlı Rumelisi (1364–1878)',
            blurb: 'Balkanlar\'daki en erken Osmanlı fetihlerinden biri olan Filibe (Plovdiv), I. Murad döneminde 1360\'ların sonunda imparatorluk topraklarına katıldı ve Rumeli\'nin başlıca idari merkezlerinden biri oldu. 1878\'de Bulgaristan\'a özerklik verilmesiyle fiilî Osmanlı idaresi sona erdi.',
        },
        {
            id: 'vidin', name: 'Vidin', lat: 43.9910, lng: 22.8749,
            era: 'Osmanlı Tuna Sınırı (1396–1878)',
            blurb: 'Niğbolu Zaferi\'nin ardından 1396\'da Osmanlı topraklarına katılan bu Tuna kalesi, 18. yüzyılın sonunda Pasvanoğlu Osman Paşa\'nın merkeze başkaldıran yarı bağımsız yönetimine sahne oldu. 1878\'de Bulgaristan\'ın özerkliğiyle Osmanlı idaresinden çıktı.',
        },
        {
            id: 'silistre', name: 'Silistre', lat: 44.1167, lng: 27.2667,
            era: 'Osmanlı Tuna Sınırı (1878\'e kadar)',
            blurb: '\"Tuna\'nın anahtarı\" olarak anılan Silistre, erken Osmanlı döneminden itibaren imparatorluğun kuzey sınırındaki en önemli kalelerinden biriydi. 1809, 1828 ve özellikle Kırım Savaşı sırasındaki 1854 kuşatmasında Rus ordularına karşı direnerek nam saldı; 1878\'de Osmanlı idaresinden çıktı.',
        },
        {
            id: 'kandiye', name: 'Kandiye', lat: 35.3387, lng: 25.1442,
            era: 'Girit Eyaleti (1669–1898)',
            blurb: 'Girit\'in başkenti olan Kandiye (bugünkü Iraklio), tarihin en uzun kuşatmalarından birine, 1648-1669 arasında tam yirmi bir yıl süren Osmanlı kuşatmasına sahne oldu; kuşatmanın sonunda Venedik idaresi burada da sona erdi. Ada, 1898\'de özerklik kazanana, 1913\'te ise resmen Yunanistan\'a katılana kadar Osmanlı toprağı olarak kaldı.',
        },
        {
            id: 'rodos', name: 'Rodos', lat: 36.4341, lng: 28.2176,
            era: 'Osmanlı Ege Adası (1522–1912)',
            blurb: 'Yüzyıllarca Ege\'de Osmanlı deniz ticaretini tehdit eden Rodos Şövalyeleri\'nin kalesi olan ada, Kanuni Sultan Süleyman\'ın 1522\'deki ünlü kuşatmasıyla fethedildi; şövalyeler adayı terk ederek sonradan Malta\'ya yerleşti. Rodos, 1912\'de Trablusgarp Savaşı sırasında İtalya\'nın eline geçene kadar dört asra yakın Osmanlı toprağı olarak kaldı.',
        },
        {
            id: 'kerkuk', name: 'Kerkük', lat: 35.4681, lng: 44.3922,
            era: 'Osmanlı Irak\'ı — Musul Eyaleti',
            blurb: 'Musul Eyaleti\'nin bir parçası olan Kerkük, kalabalık Türkmen nüfusuyla tanınan bir Yukarı Mezopotamya şehriydi. 20. yüzyıl başında bölgedeki petrol yataklarının keşfiyle stratejik önemi arttı; Birinci Dünya Savaşı sonrası Musul ile birlikte 1926\'da Irak Krallığı\'na bırakıldı.',
        },
        {
            id: 'akka', name: 'Akka', lat: 32.9281, lng: 35.0818,
            era: 'Osmanlı Filistini',
            blurb: 'Doğu Akdeniz\'in müstahkem limanlarından olan Akka, 1799\'da Napolyon Bonapart\'ın kuşatmasına Cezzar Ahmed Paşa komutasında direnerek Fransız ordusunun Orta Doğu seferini durduran tarihî bir zafere sahne oldu.',
        },
        {
            id: 'beyrut', name: 'Beyrut', lat: 33.8938, lng: 35.5018,
            era: 'Osmanlı Suriyesi — Beyrut Sancağı',
            blurb: 'Osmanlı döneminde mütevazı bir liman kasabası olan Beyrut, özellikle 19. yüzyılda Fransa ile gelişen ipek ticareti sayesinde hızla büyüdü ve zamanla ayrı bir sancak merkezi hâline geldi. Birinci Dünya Savaşı sonrasında Fransız Suriye mandası sınırları içinde kaldı.',
        },
        {
            id: 'amman', name: 'Amman', lat: 31.9454, lng: 35.9284,
            era: 'Osmanlı Suriyesi',
            blurb: 'Osmanlı döneminin büyük bölümünde küçük bir yerleşim olan Amman, 1878\'de Osmanlı-Rus Savaşı sonrası Kafkasya\'dan göç eden Çerkeslerin buraya iskân edilmesiyle yeniden canlandı. 1900\'lerin başında Hicaz Demiryolu\'nun bir durağı olarak önem kazandı; Osmanlı sonrasında Ürdün\'ün başkenti oldu.',
        },
        {
            id: 'batum', name: 'Batum', lat: 41.6168, lng: 41.6367,
            era: 'Osmanlı Karadeniz Sınırı (1878\'e kadar)',
            blurb: 'Gürcistan kıyısındaki bu Karadeniz limanı, 16. yüzyıldan itibaren Osmanlı topraklarındaydı. 1878 Berlin Antlaşması\'yla Kars ve Ardahan\'la birlikte Rusya\'ya bırakıldı; 1918\'de Brest-Litovsk Antlaşması\'yla kısa süreliğine yeniden Osmanlı idaresine girse de, savaşın kaybedilmesiyle bu kalıcı olmadı.',
        },
    ];

    // Osmanlı sınırları DIŞINDAki önemli merkezler (rakip/komşu güçlerin
    // başkentleri) — coğrafi bağlam için işaretlenir, ama tıklanınca bilgi
    // penceresi AÇILMAZ ve alttaki dizinde YER ALMAZ (bkz. aşağıdaki
    // landmarkIcon()/LANDMARKS.forEach()). Osmanlı sınırları İÇİNDEKİ
    // merkezler zaten yukarıdaki CITIES'te tam bilgiyle yer alıyor.
    const LANDMARKS = [
        { id: 'vienna', name: 'Viyana', lat: 48.2082, lng: 16.3738 },
        { id: 'venice', name: 'Venedik', lat: 45.4408, lng: 12.3155 },
        { id: 'moscow', name: 'Moskova', lat: 55.7558, lng: 37.6173 },
        { id: 'paris', name: 'Paris', lat: 48.8566, lng: 2.3522 },
        { id: 'madrid', name: 'Madrid', lat: 40.4168, lng: -3.7038 },
        { id: 'isfahan', name: 'İsfahan', lat: 32.6546, lng: 51.6680 },
        { id: 'warsaw', name: 'Varşova', lat: 52.2297, lng: 21.0122 },
        { id: 'london', name: 'Londra', lat: 51.5074, lng: -0.1278 },
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

    // --- Tarihî rotalar (İpek Yolu, Baharat Yolu, Hac Yolu) ---
    // CITIES'teki gerçek koordinatları kullanır (ayrı bir koordinat listesi
    // tutmuyor ki şehir konumları değişirse rotalar da otomatik güncellensin).
    // Her rotanın kendi rengi ve sağ üstte kendi düğmesi var; birbirinden
    // bağımsız açılıp kapanır, varsayılan olarak hepsi gizli. Her rota; ana
    // çizginin altında daha soluk/kalın bir "hale" çizgisi, ara şehirlerde
    // küçük konak noktaları ve güzergâhın ortasına yerleştirilmiş, eski
    // harita bölge etiketleri gibi eğik başlıklı bir isim etiketiyle
    // "kabartma harita" hissi vermeye çalışıyor.
    const cityById = {};
    CITIES.forEach(city => { cityById[city.id] = city; });

    const ROUTES = [
        { id: 'ipek-yolu', name: 'İpek Yolu', colorKey: 'ipek', cityIds: ['van', 'erzurum', 'sivas', 'kayseri', 'ankara', 'bursa', 'istanbul'] },
        { id: 'baharat-yolu', name: 'Baharat Yolu', colorKey: 'baharat', cityIds: ['basra', 'bagdat', 'halep', 'istanbul'] },
        { id: 'hac-yolu', name: 'Hac Yolu (Şam Yolu)', colorKey: 'hac', cityIds: ['istanbul', 'sam', 'medine', 'mekke'] },
    ];

    function routeLabelIcon(name, colorKey) {
        return L.divIcon({
            className: `map-route-label-marker map-route-label-marker--${colorKey}`,
            html: `<span>${name}</span>`,
            iconSize: [0, 0],
            iconAnchor: [0, 0],
        });
    }

    const routeLayers = {};
    ROUTES.forEach(route => {
        const points = route.cityIds.map(id => cityById[id]).filter(Boolean);
        const latlngs = points.map(city => [city.lat, city.lng]);
        if (latlngs.length < 2) return;

        const group = L.layerGroup();

        // Hale — ana çizginin altında, daha kalın ve soluk; gravür bir
        // haritada mürekkebin hafifçe yayılmış gibi durmasını taklit eder.
        L.polyline(latlngs, {
            className: `map-route-line-halo map-route-line-halo--${route.colorKey}`,
            weight: 5,
            opacity: 0.35,
            lineCap: 'round',
            lineJoin: 'round',
        }).addTo(group);

        L.polyline(latlngs, {
            className: `map-route-line map-route-line--${route.colorKey}`,
            weight: 2.5,
            opacity: 0.95,
            dashArray: '1 6',
            lineCap: 'round',
            lineJoin: 'round',
        }).addTo(group);

        // Ara şehirlerde küçük "konak" noktaları — başlangıç/bitiş hariç,
        // yol üzerindeki duraklar.
        points.slice(1, -1).forEach(city => {
            L.circleMarker([city.lat, city.lng], {
                className: `map-route-waypoint map-route-waypoint--${route.colorKey}`,
                radius: 3,
                weight: 1,
                interactive: false,
            }).addTo(group);
        });

        // İsim etiketi — güzergâhın orta noktasındaki şehre yerleştirilir.
        const midCity = points[Math.floor((points.length - 1) / 2)];
        L.marker([midCity.lat, midCity.lng], {
            icon: routeLabelIcon(route.name, route.colorKey),
            interactive: false,
            keyboard: false,
        }).addTo(group);

        routeLayers[route.id] = group;
    });

    const RoutePanelControl = L.Control.extend({
        options: { position: 'topright' },
        onAdd: function () {
            const container = L.DomUtil.create('div', 'map-route-panel');
            L.DomEvent.disableClickPropagation(container);
            ROUTES.forEach(route => {
                const group = routeLayers[route.id];
                if (!group) return;
                const button = L.DomUtil.create('button', `map-route-btn map-route-btn--${route.colorKey}`, container);
                button.type = 'button';
                button.innerHTML = `<span class="map-route-btn-dot"></span><span>${route.name}</span>`;
                L.DomEvent.on(button, 'click', () => {
                    if (map.hasLayer(group)) {
                        map.removeLayer(group);
                        button.classList.remove('active');
                    } else {
                        group.addTo(map);
                        button.classList.add('active');
                    }
                });
            });
            return container;
        },
    });
    map.addControl(new RoutePanelControl());

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

    // Şehir modallerindeki belgelere tıklanınca içerik penceresi/sayfaya
    // gitmeden gösterilebilsin diye, haritada kullanılan 9 örnek belgenin
    // gerçek çevirisi/özeti burada — app.js'teki sampleDatabase'in (index.html
    // tarafından yüklenen ayrı script) küçük bir alt kümesi elle kopyalanmış
    // hâli (map.js kendi başına, app.js'siz çalışıyor). ** işaretleri (AI
    // belirsizlik vurgusu) index.html'deki özel render mantığı için;
    // buradaki düz metin önizlemede kaldırıldı.
    const DOCUMENT_CONTENT = {
        '1': {
            documentType: 'Şiir / Millî Marş (Edebî Eser)',
            date: '12 Mart 1921',
            summary: 'Mehmet Âkif Ersoy\'un Millî Mücadele döneminde yazdığı İstiklâl Marşı\'dır. Şiirde Türk milletinin bağımsızlığı, vatan sevgisi, bayrak, şehitlik, iman ve özgürlük temaları işlenmektedir. Marş, TBMM tarafından 12 Mart 1921\'de kabul edilmiştir.',
            text: `Korkma, sönmez bu şafaklarda yüzen al sancak;
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
        },
        '2': {
            documentType: 'Ahidnâme (Ferman niteliğinde)',
            date: '28 Mayıs 1463',
            summary: 'Fatih Sultan Mehmed\'in 1463 yılında Bosna\'daki ruhbanlara (Fransiskenler) verdiği ahidnâmedir. Belgede ruhbanların ve kiliselerinin korunacağı, güven içinde yaşamalarına ve dinî faaliyetlerini sürdürmelerine izin verileceği güvence altına alınmaktadır.',
            text: `Ben Sultan Mehmed Han'ım.
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
        },
        'hero': {
            documentType: 'Kaside (Na\'t-ı Nebevî)',
            date: 'Belirtilmemiş',
            summary: 'Fuzûlî\'nin Su Kasidesi, Hz. Muhammed\'i övmek ve ona duyulan sevgi ile bağlılığı dile getirmek amacıyla yazılmış 32 beyitlik bir na\'ttır. Şair; su, ateş, gül, gözyaşı, Kevser ve rahmet gibi unsurlar üzerinden Hz. Peygamber\'in güzelliğini, üstünlüğünü ve mucizelerini anlatır.',
            text: `Ey göz! Gönlümdeki ateşlere gözyaşından su saçma; çünkü böylesine tutuşmuş ateşlere su çare olmaz.

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
        },
        'svf': {
            documentType: 'Ferman',
            date: 'Haziran 1688',
            summary: 'Sivas Beylerbeyi ve Sivas Kadısı\'na hitaben gönderilen bu ferman, Sivas\'ta bulunan bir vakfın tevliyet, nezaret ve vakıf şartlarına dair yaşanan ihtilafların çözülmesini konu almaktadır. Belgede, vakıf kayıtlarının ve yeni defterlerin incelenerek vakfiyedeki şartlara titizlikle uyulması emredilmektedir.',
            text: `1 Emirlerin emiri, kerem ve kadir sahibi büyüklerin en büyüğü, izzet ve celal madeni
2 Sivas beylerbeyi olan seçkinlerin örneği
3 Sivas kadısı -fazileti artsın- yüce padişah fermanı ulaştığında malum ola ki
4 Yüce padişah fermanı ulaştığında malum ola ki padişah hükmünün içeriği
5 Tevliyet ve nezaret işlerinin vakfiye gereğince yerine getirilmesi
6 Sivas'ta Süleyman Paşa vakfı şartları gereğince
7 Zapt ve idare olunup aksine hareket olunmaması
8 Vakfiye gereğince amel olunması talep olundukta
9 Gereğince amel oluna diye padişah hükmü
10 Mühr-i şerif gereğince amel oluna
11 Vakıf şartları gereğince amel oluna
12 Gereğince amel oluna muhalefet hakkında
13 Yeni vakfiye gereğince amel oluna
14 Padişah hükmünün içeriği gereğince amel oluna
15 Gereğince amel oluna diye padişah hükmü
16 Yerine getirilip aksine hareket olunmaması
17 Şaban ayının ortalarında sene doksan dokuz`,
        },
        'sbh': {
            documentType: 'Resmî Yazı',
            date: 'Ekim 1572',
            summary: 'Belge, Şam, Baalbek ve Halep bölgelerindeki idari, mali ve asayiş konularına ilişkin divan kararlarını içermektedir. Özellikle Şam\'da asayişi bozan eşkıyalık faaliyetlerinin önlenmesi, vakıf gelirlerinin denetlenmesi ve bölgedeki şer\'i davaların adilce çözülmesi emredilmektedir.',
            text: `42 Şam beylerbeyi ve defterdarına mektup: Şam askerinin yarısından yerinde vazgeçilen vakıfların yeterli sahibi...
yerinde defalarca uzaklaştırılmış olan Hafız Sinan, geçen Şihab oğlu Kasım adlı kimsenin fesat ve eşkıyalığı...
defter başında teftiş edilip geri kalan miktarın üzerine tahsil ettirilip...
Sinan naibi Sinan Atban adlı kimseye imar ettirilip...
tahsil ettirilip geriye kalan isimlerin teftiş olunup...
ve Rumi sınırının yarısı ile Rumi adamları ve Dedekenderli yerlerindeki tabi reaya...
ve kalesinin yarısına tabi hasıl olan vakıflar...
hazinedar olan ve nöbet ehli gibi fesadından dolayı katil...
tamamen katle muktedir olan beyler, şah ve kuzgun olan cerimeler...
durumları vaki olur ki zikredilen eşkıyaya merhamet edilmeyip...
terbiye edilerek kafirlere gönderilip fitnenin ortadan kaldırılması...
üzerinde olan şer'i miktar, kayıp olanlar yok olup...
ve geriye kalanı olmayan şer'i süresi dolmuş olanlar adil olup...
980 yılı Cemaziyelahir ayının ortalarında yazılmıştır.

43 Baalbek kadısına ve vakıf durumlarına dair padişahın fermanı uyarınca yazılan mektup...
Maslahat gereği kontrol altına alınması ve arazinin ölçülerek değerinin belirlenmesi...
ve arazisi uygun olup cömertliğinden olup...
buyurdum ki: ulaştığında adı geçen vakıf...
hak üzere ve en iyi şekilde işleriyle ilgilenip...
hak sahiplerine verip ve kontrolünü sağlamak...
tasarruflu talep eden ve tahsil edip...
yıldızların düğümü ve şerefi...
yüce ve şerefli görüşümün iradesi...
ulaşıp kimin fikir yürütmesi...

44 Halep beylerbeyine mektup: bende gereklilik görülüp belge hakim olup...
hüküm giyenler, askerler ve kaleler teftiş edilip...
talep edilmiş olan mevcut yerinde teftiş...
bir teftiş yöntemi ve bir emir gönderilmelidir...
adı geçen yılın Rebiülahir ayında gönderilmelidir...
dört üzerine uzak teftiş...
adı geçen kişiye mektup...`,
        },
        'hbv': {
            documentType: 'Berat',
            date: '31 Ağustos 1808',
            summary: 'Ankara\'da bulunan Hacı Bayram Veli Vakfı\'nın tevliyet, meşihat ve zaviyedarlık görevlerinin, haksız yere elinden alınan es-Seyyid Muhammed Said Baba\'ya Şeyhülislam Ahmed Esad Efendi\'nin işareti ve padişahın iradesiyle iade edildiğine dair berattır.',
            text: `Hacı Bayram Veli yolunda, bu yüce padişahlık nişanını taşıyan, salihlerin ve süluk edenlerin örneği, müteveffa Tayyib Baba'nın oğlu es-Seyyid Muhammed Said Baba, zamanımızda en layık ve olgun olanlardan olup, takvasının temizliğiyle Divan-ı Hümayun'a dilekçe sunup Ankara'da bulunan Hacı Bayram Veli Vakfı'nın belirlenmiş vazife ile tevliyet ve meşihatına ve belirlenmiş vazife ile zaviyedarlığına önceden beri şart koşulduğu üzere babasının gelirinden tasarruf etmekte iken ve görevden alınmasını gerektirecek hiçbir hareketi yokken, garaz sahiplerinden es-Seyyid Halil Baba'nın oğlu es-Seyyid Kasım Baba en layık evlat ve akraba olduğunu iddia ederek bir yolunu bulup berat ve fetva ile hatt-ı hümayun çıkarttırıp tarafından tamamen görevden alınmasına ve ailesiyle perişan olmasına sebep olduğundan, tevliyet, meşihat ve zaviyedarlığın tarafından önceden olduğu gibi kendisine ve babasının naiplerine verilmesi ricasıyla lütuf talep etmiştir. Adı geçenin talebi üzerine müsamaha gösterilmesi hususunda padişahın iradesi çıktığından, dilekçesi doğrultusunda işlem yapılmak üzere, derin alimlerin en bilgini, takva sahiplerinin en faziletlisi olan fiilen Şeyhülislam Mevlana Ahmed Esad (Allah faziletlerini daim etsin) işaret ettiğinden, bu işaret uyarınca görevin iade edilmesi fermanım olmuştur. Kendisine padişahlık lütfumun bir nişanesi olarak bin iki yüz yirmi üç senesi Receb ayının dokuzuncu günü tarihiyle tarihlenen ve rûs-ı hümayunum gereğince bu berat-ı hümayunumu verdim ve buyurdum ki: Adı geçenin evlatlarından en olgun ve layık olan müteveffa Tayyib Baba oğlu es-Seyyid Muhammed Said Baba gidip adı geçen vakfın dörtte bir ve yarım hisselerinin tevliyet, meşihat ve zaviyedarlığına şart koşulduğu üzere tasarruf edip hizmetini yerine getirdikten sonra, bundan önce söz konusu görevlerin belirlenmiş maaşlarını alarak tasarruf ettiği gibi yine aynı şekilde belirlenmiş maaşlarını adı geçen vakıfların gelirinden alıp tasarruf ede ve bu yüce beratıma aykırı olarak görevden el çektirilmeye, başkaları tarafından hiçbir müdahale olunmaya...`,
        },
        'hmg': {
            documentType: 'Gazete / Dergi',
            date: '17 Mart 1898',
            summary: 'Hanımlara Mahsus Gazete\'nin bu ekinde genç kızlar ve anneler için eğitici ve edebi yazılar sunulmaktadır. Sayfada Leman Hanım\'ın ahlaki ve felsefi çıkarımlar içeren \'Menekşe\' başlıklı yazısı ile Hatice Hanım ve Semiha Hanım arasındaki edebi söyleşi yer almaktadır.',
            text: `Hatunlara mahsus gazetenin
Hanımlara Mahsus
Kısmı
Numara 3     5 Mart sene 1313
Gazetemizin bu kısmı "genç kızlar ve anneler"e özel hizmet etmek üzere oluşturulmuştur.
Milletin yükselmesinin sermayesi, marifet eserleri gösteren kızlardır.
Şehir mecmuası el-İkad'dır mankizik fezaili erat

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
        },
        'tah': {
            documentType: 'Gazete',
            date: '21 Nisan 1861',
            summary: 'Tercüman-ı Ahval gazetesinin 11 Şevval 1277 tarihli 25. sayısıdır. Gazetenin yayın periyodunun haftada birden haftada üçe (Pazar, Salı, Perşembe) çıkarıldığı ilan edilmektedir. Ayrıca iç haberler (Havadis-i Dahiliye) kısmında çeşitli devlet görevlerine yapılan yeni atamalar ve tayinler (tevcihat) listelenmektedir.',
            text: `Tercüman-ı Ahval
11 Şevval Pazar 1277 Sayı 25
İşbu gazete iç ve dış her türlü haberler ile fen ve sanayiye dair konuları içerecek şekilde iki günde bir pazar, salı ve perşembe günleri çıkar. Abonelik isteyenler İstanbul'da Bahçekapısı üzerinde bulunan matbaasına müracaat etsinler. İstanbul için üç aylığı (150) ve altı aylığı (80) kuruştur. Taşra için postahane ücreti de eklenir. Bir nüshası (40) paradır.

İç Haberler
Tercüman-ı Ahval şimdiye kadar haftada bir kere olarak çıkarılmış ise de bu gazetenin ortaya çıkışından beri diğer yerel gazetelerde görülen ilerleme eserlerine bakılarak bundan sonra bizim bu durumda devam etmemiz uygun görülmez. Haftada bir kere yayınlanması yeterli olamayacağından daha sık çıkarılması gerekmiştir. Çünkü medeniyet eserlerini en yüksek dereceye ulaştırarak geçmiş asırlara her bakımdan üstünlüğü açık olan zamanımızda, telgraf odası vasıtasıyla dünyanın her tarafından alınan önemli siyasi haberlerin yayınlanmasının hafta başına kadar geciktirilmesi faydalı işler hakkında bir haksızlık olmaktadır. İşte bu genel faydaya dayanarak bundan böyle Tercüman-ı Ahval'in de haftada üç kere yani pazar, salı ve perşembe günleri çıkarılması ve bazı dostlarımızın yardımıyla yazım ve düzenlenmesine eskisinden daha fazla dikkat edilmesi bir görev sayılmıştır. Bu şekilde basılarak okunmasına ilgi gösteren kişilerin memnuniyetinin kazanılması en büyük amacımızdır.

Atamalar
Devletli İsmail Paşa hazretlerinin rahatsız olduğuna dayanarak bu sene İpek Teftiş Komisyonu başkanlığı ek göreviyle Rumeli ve Balkan ve Ordu-yı Hümayun müşirliği yüksek meclislerine memur devletli refetli Ömer Paşa hazretlerine
Hazine-i Hassa-i Şahane bakanlığı devletli Hasib Paşa hazretlerine
Erzurum valisi devletli Edhem Paşa hazretlerinin görevden ayrılması üzerine adı geçen eyalete ve tamamen eski Sivas valisi devletli Hayreddin Paşa hazretlerine
Maliye Meclisi Tanzimat üyeliği eski Hazine-i Hassa bakanı atufetli Rıza Efendi hazretlerine
Kapı kâtipliği Murtaza Ali Efendi tarafından vekaleten yürütüldüğünden, söz konusu muhasebeciliğe eski Rumeli muhasebecisi izzetli Emin Efendi'ye
Halep muhasebecisi izzetli Hertin Efendi'nin görevden ayrılmasıyla adı geçen muhasebeciliğe eski Rufe muhasebecisi rıfatlı Seyfi Efendi'ye

(Bazı yerlere memur edilen naipler)
Direli Debdebe Azmi Efendi - Noveberde'ye
Kavala müftüsü Lebib Mehmed Emin Efendi - Sultan Selim Debre-i Kefe ambarına
Menufak Ahmed Şakir Efendi - Travnik'e
Ergirili Ahmed Şahin Efendi - Sjenica'ya
İstanbul mahkemesi kâtiplerinden Abdülkerim Şemi Efendi - Budaközü'ne`,
        },
        'gkt': {
            documentType: 'Dilekçe / Resmî Mektup',
            date: '5 Kasım 1921',
            summary: 'Of kazası müderrislerinden Hoca Ferşad İbrahim, Doğu Ordusu Komutanı Kazım Karabekir Paşa\'ya başvurarak Gümüşhanevî Ahmed Ziyâeddin Efendi\'nin Of, Rize ve Bayburt\'taki kütüphanelerinden Ruslar tarafından Tiflis\'e kaçırılan dinî kitapların geri getirilmesini talep etmektedir. Dilekçe sahibi, bu kutsal eserlerin kurtarılması için gerekli girişimlerin başlatılmasını rica etmektedir.',
            text: `Şark Ordusu Kumandanı Devletlü Kazım Karabekir Paşa Hazretlerine

Devletlü Efendim Hazretleri,
'İnsanların hayırlısı, Cenâb-ı Hakk'ın kendisini ümmetin ihtiyaçlarında istihdam ettiği kimsedir' mealindeki hadîs-i şerîfi yüksek hatırınıza getirmek suretiyle arz-ı hâl ve içimdeki istirhamı sunmaya başlarım.
Gümüşhanevî Ahmed Ziyâeddin Efendi (kuddise sırruhû) hazretlerinin Of, Rize ve Bayburt memleketlerinde bulunan üç adet kütüphanesinin başmütevellîsi olan duacınız, son işgal sırasında bu kasabaların Bayburt tarafında bulunan Ruslar tarafından tahrip edildiğini ve kitapların tamamen Tiflis'e nakledildiğini son araştırmalarımla ortaya çıkarmış bulunmaktayım. Bu kitaplar dinî kitaplar olduğundan ve Müslümanlarca kutsal/saygın kabul edildiğinden, geri getirilerek yeniden istifadeye sunulması ve adı geçen Şeyh Hazretlerinin kitaplarının her hâlükârda büyük gayretlere muhtaç olduğu görülmüştür.
Allah'ın yardımının, O'nun dinine yardım edeceklerle beraber olduğu herkesçe bilinen bir gerçektir. Bu arz edilen meselenin hayırla sonuçlanması, yüce gayretlerin en çok hak ettiği bir durum olduğu duacınızca bilindiğinden, söz konusu kitapların Tiflis'ten geri getirilmesi için gerekli girişimlerin tamamlanmasını rica ve niyaz ederim. Fermân [efendimindir].
5 Teşrîn-i Sânî 1336
5 Kasım 1921
Of kazası müderrislerinden
Hoca Ferşad İbrahim`,
        },
    };

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

    // Büyük penceredeki "Belgeler" sekmesi — kartlara tıklanınca sayfadan
    // ayrılmadan içerik burada, aynı sekmenin içinde gösterilir (bkz.
    // renderDocDetailHtml() ve cityModalDocs'daki click delegasyonu).
    // Hover önizlemesindeki renderDocsHtml() (yukarıda) kasıtlı olarak ayrı
    // tutuldu — o sadece statik bir kart, tıklama davranışı gerekmiyor.
    let currentModalDocs = [];

    function renderModalDocsList(docs, emptyMessage) {
        if (!docs.length) return `<p class="map-city-modal-empty">${emptyMessage}</p>`;
        return docs.map(doc => `
            <button type="button" class="map-city-popover-sample" data-doc-key="${doc.key}">
                <img src="${doc.file}" alt="">
                <span>
                    <span class="map-city-popover-sample-label" style="display:block;">İlgili Eser</span>
                    <span class="map-city-popover-sample-title">${doc.title}</span>
                </span>
            </button>`).join('');
    }

    function renderDocDetailHtml(doc) {
        const content = DOCUMENT_CONTENT[doc.key];
        if (!content) {
            return `
                <button type="button" class="map-doc-back" data-doc-back>← Listeye dön</button>
                <p class="map-city-modal-empty">Bu belgenin içeriği şu an burada gösterilemiyor.</p>
                <a class="map-doc-fulllink" href="index.html?sample=${encodeURIComponent(doc.key)}">Tam sayfada aç →</a>`;
        }
        const paragraphs = content.text.split(/\n\s*\n/).map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');
        return `
            <button type="button" class="map-doc-back" data-doc-back>← Listeye dön</button>
            <div class="map-doc-detail-header">
                <span class="map-city-popover-era">${content.documentType}${content.date && content.date !== 'Belirtilmemiş' ? ' · ' + content.date : ''}</span>
                <h3>${doc.title}</h3>
            </div>
            <p class="map-doc-summary">${content.summary}</p>
            <div class="map-doc-text">${paragraphs}</div>
            <a class="map-doc-fulllink" href="index.html?sample=${encodeURIComponent(doc.key)}">Tam sayfada aç (Osmanlıca aslı, harf çevirisi ve daha fazlası) →</a>`;
    }

    cityModalDocs.addEventListener('click', (e) => {
        const backBtn = e.target.closest('[data-doc-back]');
        if (backBtn) {
            cityModalDocs.innerHTML = renderModalDocsList(currentModalDocs, 'Bu şehirle ilişkilendirilmiş bir örnek belge henüz yok.');
            return;
        }
        const docBtn = e.target.closest('[data-doc-key]');
        if (docBtn) {
            const doc = currentModalDocs.find(d => d.key === docBtn.getAttribute('data-doc-key'));
            if (doc) cityModalDocs.innerHTML = renderDocDetailHtml(doc);
        }
    });

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

        currentModalDocs = docs;
        cityModalDocs.innerHTML = renderModalDocsList(docs, 'Bu şehirle ilişkilendirilmiş bir örnek belge henüz yok.');

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

    // --- Osmanlı sınırları dışındaki merkezler (LANDMARKS) ---
    // interactive:false ile tıklama/hover tamamen kapalı — bu noktaların
    // tek amacı Osmanlı coğrafyasının rakip/komşu güçlerle bağlamını
    // göstermek, bilgi penceresi ya da dizin girdisi yok.
    function landmarkIcon(name) {
        return L.divIcon({
            className: 'map-landmark-marker',
            html: `<span class="map-landmark-dot"></span><span class="map-landmark-label">${name}</span>`,
            iconSize: [0, 0],
            iconAnchor: [0, 0],
        });
    }

    LANDMARKS.forEach(landmark => {
        L.marker([landmark.lat, landmark.lng], {
            icon: landmarkIcon(landmark.name),
            interactive: false,
            keyboard: false,
        }).addTo(map);
    });
});
