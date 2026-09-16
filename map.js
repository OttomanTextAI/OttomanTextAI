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
            sample: { key: 'tah', file: 'assets/tah.png', title: 'Tercüman-ı Ahval Gazetesi\'nin 25. Sayısı' },
        },
        {
            id: 'bursa', name: 'Bursa', lat: 40.1826, lng: 29.0665,
            era: 'Başkent (1326–1365)',
            blurb: 'Osmanlı Beyliği\'nin ilk başkentiydi; erken dönem cami ve külliyeleriyle tanınır.',
        },
        {
            id: 'ankara', name: 'Ankara', lat: 39.9334, lng: 32.8597,
            era: 'Osmanlı Anadolusu',
            blurb: 'Anadolu ticaret yollarının kesiştiği önemli bir merkezdi; Hacı Bayram Veli\'nin vakfı burada kuruldu.',
            sample: { key: 'hbv', file: 'assets/hbv.png', title: 'Hacı Bayram Veli Vakfı Tevliyet ve Meşihat Beratı' },
        },
        {
            id: 'konya', name: 'Konya', lat: 37.8746, lng: 32.4932,
            era: 'Anadolu Beylikleri – Osmanlı',
            blurb: 'Selçuklu mirasının ve Mevlevîlik kültürünün merkezi; Osmanlı döneminde de önemli bir ilim şehri oldu.',
        },
        {
            id: 'sivas', name: 'Sivas', lat: 39.7477, lng: 37.0179,
            era: 'Osmanlı Anadolusu',
            blurb: 'Anadolu\'nun doğusunda önemli bir vakıf ve idare merkeziydi.',
            sample: { key: 'svf', file: 'assets/svf.png', title: 'Sivas\'taki Vakıf Şartlarına Dair Ferman' },
        },
        {
            id: 'halep', name: 'Halep', lat: 36.2021, lng: 37.1343,
            era: 'Osmanlı Suriyesi',
            blurb: 'Ticaret yollarının kesiştiği kadim bir şehir; Osmanlı idaresinde önemli bir eyalet merkeziydi.',
            sample: { key: 'sbh', file: 'assets/sbh.png', title: 'Şam, Baalbek ve Halep Mühimme Hükümleri' },
        },
        {
            id: 'sam', name: 'Şam', lat: 33.5138, lng: 36.2765,
            era: 'Osmanlı Suriyesi',
            blurb: 'Osmanlı Suriyesi\'nin idari merkezlerinden biri ve hac yolunun önemli bir durağıydı.',
            sample: { key: 'sbh', file: 'assets/sbh.png', title: 'Şam, Baalbek ve Halep Mühimme Hükümleri' },
        },
        {
            id: 'bagdat', name: 'Bağdat', lat: 33.3152, lng: 44.3661,
            era: 'Osmanlı Irak\'ı',
            blurb: 'Fuzûlî gibi büyük divan şairlerinin yaşadığı, Osmanlı Irak\'ının kültürel merkeziydi.',
            sample: { key: 'hero', file: 'assets/sk.png', title: 'Fuzûlî\'nin Su Kasidesi' },
        },
        {
            id: 'kahire', name: 'Kahire', lat: 30.0444, lng: 31.2357,
            era: 'Osmanlı Mısır\'ı (1517–1914)',
            blurb: '1517\'de Osmanlı topraklarına katıldı; Mısır eyaletinin başkenti ve önemli bir İslam ilim merkeziydi.',
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

    function cityIcon(city) {
        return L.divIcon({
            className: 'map-city-marker',
            html: `<span class="map-city-dot"></span><span class="map-city-label">${city.name}</span>`,
            iconSize: [0, 0],
            iconAnchor: [0, 0],
        });
    }

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

    CITIES.forEach(city => {
        const marker = L.marker([city.lat, city.lng], { icon: cityIcon(city), keyboard: true, title: city.name })
            .addTo(map);

        let sampleHtml = '';
        if (city.sample) {
            sampleHtml = `
                <a class="map-city-popover-sample" href="index.html?sample=${encodeURIComponent(city.sample.key)}">
                    <img src="${city.sample.file}" alt="">
                    <span>
                        <span class="map-city-popover-sample-label" style="display:block;">İlgili Eser</span>
                        <span class="map-city-popover-sample-title">${city.sample.title}</span>
                    </span>
                </a>`;
        }

        marker.bindPopup(`
            <span class="map-city-popover-era">${city.era}</span>
            <div class="entity-popover-text">${city.name}</div>
            <div class="entity-popover-context">${city.blurb}</div>
            ${sampleHtml}
        `, { className: 'map-city-popup', maxWidth: 280 });

        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'map-legend-chip';
        chip.textContent = city.name;
        chip.addEventListener('click', () => {
            map.flyTo([city.lat, city.lng], Math.max(map.getZoom(), map.getMinZoom() + 2), { duration: 0.6 });
            marker.openPopup();
        });
        mapLegend.appendChild(chip);

        marker.on('popupopen', () => setActive(chip, marker.getElement()));
        marker.on('popupclose', () => setActive(null, null));
    });
});
