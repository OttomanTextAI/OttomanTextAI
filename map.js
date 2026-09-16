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
    // handleSampleDeepLink). x/y koordinatları assets/harita-zemin.webp
    // (1320x961) üzerindeki piksel konumlarına karşılık gelir — gerçek bir
    // kabartma haritanın (Ancient World Mapping Center, Tom Elliott, 2004)
    // üzerine görsel olarak yerleştirildi.
    const CITIES = [
        {
            id: 'edirne', name: 'Edirne', x: 600, y: 400,
            era: 'Başkent (1365–1453)',
            blurb: 'İstanbul\'un fethinden önce imparatorluğun başkentiydi; Selimiye Camii gibi başyapıtlara ev sahipliği yapar.',
        },
        {
            id: 'istanbul', name: 'İstanbul', x: 647, y: 423,
            era: 'Başkent (1453–1922)',
            blurb: '1453\'te fethedilerek İmparatorluğun başkenti oldu; siyasi, kültürel ve ticari hayatın merkeziydi.',
            sample: { key: 'tah', file: 'assets/tah.png', title: 'Tercüman-ı Ahval Gazetesi\'nin 25. Sayısı' },
        },
        {
            id: 'bursa', name: 'Bursa', x: 660, y: 450,
            era: 'Başkent (1326–1365)',
            blurb: 'Osmanlı Beyliği\'nin ilk başkentiydi; erken dönem cami ve külliyeleriyle tanınır.',
        },
        {
            id: 'ankara', name: 'Ankara', x: 760, y: 470,
            era: 'Osmanlı Anadolusu',
            blurb: 'Anadolu ticaret yollarının kesiştiği önemli bir merkezdi; Hacı Bayram Veli\'nin vakfı burada kuruldu.',
            sample: { key: 'hbv', file: 'assets/hbv.png', title: 'Hacı Bayram Veli Vakfı Tevliyet ve Meşihat Beratı' },
        },
        {
            id: 'konya', name: 'Konya', x: 740, y: 520,
            era: 'Anadolu Beylikleri – Osmanlı',
            blurb: 'Selçuklu mirasının ve Mevlevîlik kültürünün merkezi; Osmanlı döneminde de önemli bir ilim şehri oldu.',
        },
        {
            id: 'sivas', name: 'Sivas', x: 850, y: 460,
            era: 'Osmanlı Anadolusu',
            blurb: 'Anadolu\'nun doğusunda önemli bir vakıf ve idare merkeziydi.',
            sample: { key: 'svf', file: 'assets/svf.png', title: 'Sivas\'taki Vakıf Şartlarına Dair Ferman' },
        },
        {
            id: 'halep', name: 'Halep', x: 870, y: 530,
            era: 'Osmanlı Suriyesi',
            blurb: 'Ticaret yollarının kesiştiği kadim bir şehir; Osmanlı idaresinde önemli bir eyalet merkeziydi.',
            sample: { key: 'sbh', file: 'assets/sbh.png', title: 'Şam, Baalbek ve Halep Mühimme Hükümleri' },
        },
        {
            id: 'sam', name: 'Şam', x: 880, y: 580,
            era: 'Osmanlı Suriyesi',
            blurb: 'Osmanlı Suriyesi\'nin idari merkezlerinden biri ve hac yolunun önemli bir durağıydı.',
            sample: { key: 'sbh', file: 'assets/sbh.png', title: 'Şam, Baalbek ve Halep Mühimme Hükümleri' },
        },
        {
            id: 'bagdat', name: 'Bağdat', x: 990, y: 580,
            era: 'Osmanlı Irak\'ı',
            blurb: 'Fuzûlî gibi büyük divan şairlerinin yaşadığı, Osmanlı Irak\'ının kültürel merkeziydi.',
            sample: { key: 'hero', file: 'assets/sk.png', title: 'Fuzûlî\'nin Su Kasidesi' },
        },
        {
            id: 'kahire', name: 'Kahire', x: 780, y: 595,
            era: 'Osmanlı Mısır\'ı (1517–1914)',
            blurb: '1517\'de Osmanlı topraklarına katıldı; Mısır eyaletinin başkenti ve önemli bir İslam ilim merkeziydi.',
        },
    ];

    const SVGNS = 'http://www.w3.org/2000/svg';
    const mapSvg = document.getElementById('mapSvg');
    const citiesGroup = document.getElementById('mapCities');
    const mapFrame = document.querySelector('.map-frame');
    const mapLegend = document.getElementById('mapLegend');

    let tooltipEl = null;
    let activePopover = null;
    let activeCityGroup = null;
    let activeChip = null;

    function svgToFramePoint(x, y) {
        const pt = mapSvg.createSVGPoint();
        pt.x = x;
        pt.y = y;
        const screenPt = pt.matrixTransform(mapSvg.getScreenCTM());
        const frameRect = mapFrame.getBoundingClientRect();
        return { x: screenPt.x - frameRect.left, y: screenPt.y - frameRect.top };
    }

    function getTooltip() {
        if (!tooltipEl) {
            tooltipEl = document.createElement('div');
            tooltipEl.className = 'map-tooltip hidden';
            mapFrame.appendChild(tooltipEl);
        }
        return tooltipEl;
    }

    function showTooltip(city) {
        const tip = getTooltip();
        const pos = svgToFramePoint(city.x, city.y - 12);
        tip.textContent = city.name;
        tip.style.left = pos.x + 'px';
        tip.style.top = pos.y + 'px';
        tip.classList.remove('hidden');
    }

    function hideTooltip() {
        if (tooltipEl) tooltipEl.classList.add('hidden');
    }

    function closePopover() {
        if (activePopover) {
            activePopover.remove();
            activePopover = null;
        }
        if (activeCityGroup) {
            activeCityGroup.classList.remove('active');
            activeCityGroup = null;
        }
        if (activeChip) {
            activeChip.classList.remove('active');
            activeChip = null;
        }
    }

    function openPopover(city, groupEl, chipEl) {
        closePopover();
        hideTooltip();

        const pop = document.createElement('div');
        pop.className = 'entity-popover';

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

        pop.innerHTML = `
            <button type="button" class="map-city-popover-close" aria-label="Kapat">&times;</button>
            <span class="map-city-popover-era">${city.era}</span>
            <div class="entity-popover-text">${city.name}</div>
            <div class="entity-popover-context">${city.blurb}</div>
            ${sampleHtml}
        `;

        mapFrame.appendChild(pop);

        const pos = svgToFramePoint(city.x, city.y);
        const frameRect = mapFrame.getBoundingClientRect();
        const popRect = pop.getBoundingClientRect();

        let left = pos.x + 16;
        let top = pos.y - popRect.height / 2;

        left = Math.max(10, Math.min(left, frameRect.width - popRect.width - 10));
        top = Math.max(10, Math.min(top, frameRect.height - popRect.height - 10));

        pop.style.left = left + 'px';
        pop.style.top = top + 'px';

        pop.querySelector('.map-city-popover-close').addEventListener('click', closePopover);

        activePopover = pop;
        activeCityGroup = groupEl;
        groupEl.classList.add('active');

        if (chipEl) {
            chipEl.classList.add('active');
            activeChip = chipEl;
        }
    }

    CITIES.forEach(city => {
        const g = document.createElementNS(SVGNS, 'g');
        g.classList.add('map-city-group');
        g.setAttribute('tabindex', '0');
        g.setAttribute('role', 'button');
        g.setAttribute('aria-label', city.name);

        const dot = document.createElementNS(SVGNS, 'circle');
        dot.classList.add('map-city-dot');
        dot.setAttribute('cx', city.x);
        dot.setAttribute('cy', city.y);
        dot.setAttribute('r', 6);
        g.appendChild(dot);

        const label = document.createElementNS(SVGNS, 'text');
        label.classList.add('map-city-label');
        label.setAttribute('x', city.x + 10);
        label.setAttribute('y', city.y + 4);
        label.textContent = city.name;
        g.appendChild(label);

        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'map-legend-chip';
        chip.textContent = city.name;
        mapLegend.appendChild(chip);

        g.addEventListener('mouseenter', () => showTooltip(city));
        g.addEventListener('mouseleave', hideTooltip);
        g.addEventListener('click', (e) => {
            e.stopPropagation();
            openPopover(city, g, chip);
        });
        g.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openPopover(city, g, chip);
            }
        });

        chip.addEventListener('click', () => openPopover(city, g, chip));

        citiesGroup.appendChild(g);
    });

    document.addEventListener('click', (e) => {
        if (activePopover && !activePopover.contains(e.target) && !citiesGroup.contains(e.target)) {
            closePopover();
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closePopover();
    });
});
