// Sözlük — bağımsız sayfa. Giriş gerektirmez (herkese açık bir sözlük).

const API_BASE_URL = 'https://ottoman-text-ai.onrender.com';

// Üst navbar'daki tema anahtarı ve sol menü çekmecesi — diğer sayfalarla
// birebir aynı davranış (aynı 'theme' localStorage anahtarı paylaşılır).
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

// Sol menüdeki hesap kartı — giriş yapılmışsa /api/auth/me'den dolan
// isim/unvan/avatar; diğer sayfalardakiyle aynı mantık.
(function renderSidebarProfile() {
    const authToken = localStorage.getItem('auth_token');
    if (!authToken) return;
    fetch(`${API_BASE_URL}/api/auth/me`, { headers: { 'Authorization': `Bearer ${authToken}` } })
        .then(res => res.ok ? res.json() : null)
        .then(profile => {
            if (!profile) return;
            const nameEl = document.getElementById('sidebarProfileName');
            const titleEl = document.getElementById('sidebarProfileTitle');
            const avatarEl = document.getElementById('sidebarProfileAvatar');
            if (!nameEl) return;
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
        })
        .catch(() => {});
})();

// --- Sözlük araması ---
const sozlukSearchInput = document.getElementById('sozlukSearchInput');
const sozlukResults = document.getElementById('sozlukResults');
const sozlukCount = document.getElementById('sozlukCount');
const sozlukRefreshBtn = document.getElementById('sozlukRefreshBtn');

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// Bazı tanımlar "1.devlet. 2.talih. 3.mevki." gibi birden fazla numaralı
// anlamı tek satırda art arda veriyor — bunları ayrı satırlara bölüyoruz.
// Numarasız/tek anlamlı tanımlarda hiçbir şey değişmez (tek parça döner).
function splitSenses(definition) {
    // "1. mamurluk... 2. Hind'in..." (aralıklı) ve "1.devlet. 2.talih." (bitişik)
    // biçimlerinin ikisini de yakalar; eşleşen kısım numara+nokta+varsa boşlukları kapsar.
    const re = /(?:^|\s)(\d{1,2})\.\s*/g;
    const matches = [...definition.matchAll(re)];
    if (matches.length < 2) return [{ num: null, text: definition }];

    const senses = [];
    const firstStart = matches[0].index + matches[0][0].indexOf(matches[0][1]);
    if (firstStart > 0) {
        const prefix = definition.slice(0, firstStart).trim();
        if (prefix) senses.push({ num: null, text: prefix });
    }
    for (let i = 0; i < matches.length; i++) {
        const num = matches[i][1];
        const start = matches[i].index + matches[i][0].length;
        const end = i + 1 < matches.length ? matches[i + 1].index + matches[i + 1][0].indexOf(matches[i + 1][1]) : definition.length;
        const text = definition.slice(start, end).trim();
        if (text) senses.push({ num, text });
    }
    return senses;
}

function escapeRegExp(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Bu sözlük, "kelime-i ek" biçiminde birleşik alt maddeleri (örn. "asel-i Davud",
// "aff-ı hususi") tek bir tanım metninde art arda sıralıyor — sayı içermedikleri
// için splitSenses bunları ayıramıyor ve tek bir bitişik blok gibi görünüyorlar.
// Ana kelimenin kökünü baz alıp bu alt maddeleri de ayrı satırlara bölüyoruz.
function splitCompoundParts(word, text) {
    const root = (word.match(/^[A-Za-zÇĞİÖŞÜçğıöşü]+/) || [null])[0];
    if (!root || root.length < 3) return [{ lead: null, text }];

    const re = new RegExp("(?:^|\\.\\s+)(" + escapeRegExp(root) + "(?:[-’'][\\wÇĞİÖŞÜçğıöşü]+)+)", 'g');
    const matches = [...text.matchAll(re)];
    if (matches.length < 1) return [{ lead: null, text }];

    const parts = [];
    const firstStart = matches[0].index + matches[0][0].indexOf(matches[0][1]);
    if (firstStart > 0) {
        const intro = text.slice(0, firstStart).trim();
        if (intro) parts.push({ lead: null, text: intro });
    }
    for (let i = 0; i < matches.length; i++) {
        const lead = matches[i][1];
        const start = matches[i].index + matches[i][0].indexOf(lead) + lead.length;
        const end = i + 1 < matches.length ? matches[i + 1].index + matches[i + 1][0].indexOf(matches[i + 1][1]) : text.length;
        const rest = text.slice(start, end).trim().replace(/^[:.]\s*/, '');
        if (rest) parts.push({ lead, text: rest });
    }
    return parts.length ? parts : [{ lead: null, text }];
}

// Sözlüğün kendi kısaltmalar sayfasından (Devellioğlu, Osmanlıca-Türkçe
// Ansiklopedik Lûgat) alınan kod -> tam kelime karşılıkları. Madde başındaki
// "(f.b.i.)" gibi kısaltma bloklarını "(Farsça, birleşik, isim)" gibi
// okunur hale getirmek için kullanılıyor.
const ABBR_MAP = {
    a: 'Arapça', f: 'Farsça', t: 'Türkçe', o: 'Osmanlıca',
    fr: 'Fransızca', ing: 'İngilizce', alm: 'Almanca',
    grk: 'Grekçe', lit: 'Latince', yun: 'Yunanca',
    i: 'isim', s: 'sıfat', zf: 'zarf', fi: 'fiil', zm: 'zamir',
    e: 'edat', n: 'nida', b: 'birleşik', c: 'çoğul', cü: 'cümle',
    it: 'isim tamlaması', m: 'masdar', ha: 'harf', hz: 'Hazret-i',
    ed: 'edebiyat', est: 'estetik', fels: 'felsefe', mant: 'mantık',
    huk: 'hukuk', hek: 'hekimlik', müz: 'müzik', zool: 'zooloji',
    bot: 'botanik', kim: 'kimya', tar: 'tarih', tas: 'tasavvuf',
    biy: 'biyoloji', psik: 'psikoloji', ask: 'askerlik',
    den: 'denizcilik', jeol: 'jeoloji', jeod: 'jeodezi',
    anat: 'anatomi', astr: 'astronomi', coğr: 'coğrafya',
    fık: 'fıkıh', fiz: 'fizik', fizy: 'fizyoloji', geo: 'geometri',
    gr: 'gramer', hak: 'hakkında', koz: 'kozmografya',
    leng: 'lengüistik', mad: 'madencilik', mat: 'matematik',
    mec: 'mecazen', mece: 'mecelle', meteor: 'meteoroloji',
    müen: 'müennes', or: 'ormancılık', ö: 'ölüm', ped: 'pedagoji',
    rub: 'rubai', sosy: 'sosyoloji', st: 'sıfat terkibi',
    ter: 'terkip', tic: 'ticaret', top: 'topografya', trig: 'trigonometri',
    vak: 'vakıf', vet: 'veteriner', zir: 'ziraat', dey: 'deyim',
    d: 'doğum', bkz: 'bakınız',
};
const ABBR_SPECIAL2 = {
    'h.i': 'has isim', 'd.huk': 'devlet hukuku',
    'c.c': "cem'inin cem'i", 'g.s': 'güzel sanatlar',
    'v.b': 've başkaları/ve benzerleri',
};

function expandAbbrCode(rawToken) {
    const tok = rawToken.replace(/\.+$/, '');
    if (!tok) return null;
    const parts = tok.split('.');
    if (parts.some(p => !p)) return null;
    const out = [];
    let i = 0;
    while (i < parts.length) {
        const pair = i + 1 < parts.length ? (parts[i] + '.' + parts[i + 1]).toLowerCase() : null;
        if (pair && ABBR_SPECIAL2[pair]) {
            out.push(ABBR_SPECIAL2[pair]);
            i += 2;
        } else {
            const key = parts[i].toLowerCase();
            if (!(key in ABBR_MAP)) return null;
            out.push(ABBR_MAP[key]);
            i += 1;
        }
    }
    return out.join(', ');
}

// Sadece tanımın en başındaki "(...)" bloğunu genişletir — metin içindeki
// "(bkz : X)" gibi sonraki parantezlere dokunmaz.
function expandLeadingTag(definition) {
    const m = definition.match(/^\(([^)]*)\)/);
    if (!m) return definition;
    const tokens = m[1].split(' ');
    const newTokens = tokens.map(t => {
        const trailing = (t.match(/[,;]+$/) || [''])[0];
        const core = trailing ? t.slice(0, -trailing.length) : t;
        const expanded = expandAbbrCode(core);
        return expanded !== null ? expanded + trailing : t;
    });
    return '(' + newTokens.join(' ') + ')' + definition.slice(m[0].length);
}

// Günümüz Türkçesiyle arama yapılıp tanım metninde bulunduğunda ("gemi"
// yazınca "sefine" gibi), eşleşen kısmı vurgulamak için kullanılıyor.
// escapeHtml zaten kaçışlanmış metin üzerinde çalışır, yalnızca görünümü
// etkiler.
let currentSearchQuery = null;

function highlightAndEscape(text) {
    const escaped = escapeHtml(text);
    if (!currentSearchQuery) return escaped;
    const re = new RegExp('(' + escapeRegExp(currentSearchQuery) + ')', 'gi');
    return escaped.replace(re, '<mark class="sozluk-highlight">$1</mark>');
}

function renderSensesHtml(word, definition) {
    definition = expandLeadingTag(definition);
    const senses = splitSenses(definition);
    if (senses.length === 1 && senses[0].num === null) {
        const parts = splitCompoundParts(word, senses[0].text);
        return parts.map(p => `
            <div class="sozluk-sense">
                ${p.lead ? `<span class="sozluk-sense-lead">${escapeHtml(p.lead)}</span>` : ''}
                <span>${highlightAndEscape(p.text)}</span>
            </div>
        `).join('');
    }
    return senses.map(s => `
        <div class="sozluk-sense">
            ${s.num ? `<span class="sozluk-sense-num">${s.num}.</span>` : ''}
            <span>${highlightAndEscape(s.text)}</span>
        </div>
    `).join('');
}

function entryToHtml(e) {
    return `
        <div class="sozluk-entry">
            <div class="sozluk-entry-word">${escapeHtml(e.word)}</div>
            <div class="sozluk-entry-def">${renderSensesHtml(e.word, e.definition)}</div>
        </div>
    `;
}

function renderEntries(entries) {
    sozlukResults.innerHTML = entries.map(entryToHtml).join('');
}

let searchTimer = null;
let requestId = 0;
let currentMode = 'browse'; // 'browse' | 'search' | 'letter'

// --- Harf harf gezinme ---
const sozlukLetterBar = document.getElementById('sozlukLetterBar');
const sozlukLoadMoreBtn = document.getElementById('sozlukLoadMoreBtn');
const TR_ALPHABET = ['A','B','C','Ç','D','E','F','G','Ğ','H','I','İ','J','K','L','M','N','O','Ö','P','R','S','Ş','T','U','Ü','V','Y','Z'];
const LETTER_PAGE_SIZE = 40;
let currentLetter = null;
let letterOffset = 0;
let letterTotal = 0;

function buildLetterBar() {
    sozlukLetterBar.innerHTML = TR_ALPHABET.map(l => `<button type="button" class="sozluk-letter-btn" data-letter="${l}">${l}</button>`).join('');
}
buildLetterBar();

function setActiveLetterBtn(letter) {
    sozlukLetterBar.querySelectorAll('.sozluk-letter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.letter === letter);
    });
}

async function loadLetterPage(letter, { append = false } = {}) {
    currentMode = 'letter';
    currentSearchQuery = null;
    currentLetter = letter;
    setActiveLetterBtn(letter);
    if (!append) {
        letterOffset = 0;
        sozlukResults.innerHTML = '';
    }
    const thisRequestId = ++requestId;
    try {
        const res = await fetch(`${API_BASE_URL}/api/dictionary/letter?letter=${encodeURIComponent(letter)}&offset=${letterOffset}&limit=${LETTER_PAGE_SIZE}`);
        if (thisRequestId !== requestId) return;
        if (!res.ok) throw new Error('letter failed');
        const data = await res.json();
        letterTotal = data.total || 0;
        if (!data.results || !data.results.length) {
            if (!append) {
                sozlukResults.innerHTML = `<p class="sozluk-empty">"${escapeHtml(letter)}" ile başlayan kelime bulunamadı.</p>`;
                sozlukCount.textContent = '';
            }
            sozlukLoadMoreBtn.hidden = true;
            return;
        }
        if (append) {
            sozlukResults.insertAdjacentHTML('beforeend', data.results.map(entryToHtml).join(''));
        } else {
            renderEntries(data.results);
        }
        letterOffset += data.results.length;
        sozlukCount.textContent = `"${letter}" ile başlayan ${letterTotal} kelimeden ${Math.min(letterOffset, letterTotal)} tanesi gösteriliyor`;
        sozlukLoadMoreBtn.hidden = letterOffset >= letterTotal;
    } catch (err) {
        if (!append) {
            sozlukResults.innerHTML = '<p class="sozluk-empty">Sözlük şu an yüklenemedi, lütfen tekrar deneyin.</p>';
            sozlukCount.textContent = '';
        }
        sozlukLoadMoreBtn.hidden = true;
    }
}

sozlukLetterBar.addEventListener('click', (e) => {
    const btn = e.target.closest('.sozluk-letter-btn');
    if (!btn) return;
    const letter = btn.dataset.letter;
    if (currentMode === 'letter' && currentLetter === letter) {
        // aynı harfe tekrar tıklamak: harf gezintisinden çık, göz atmaya dön
        setActiveLetterBtn(null);
        sozlukLoadMoreBtn.hidden = true;
        sozlukSearchInput.value = '';
        loadRandomBatch();
        return;
    }
    sozlukSearchInput.value = '';
    loadLetterPage(letter);
});

sozlukLoadMoreBtn.addEventListener('click', () => {
    if (currentMode === 'letter' && currentLetter) {
        loadLetterPage(currentLetter, { append: true });
    }
});

async function loadRandomBatch() {
    currentMode = 'browse';
    currentSearchQuery = null;
    setActiveLetterBtn(null);
    sozlukLoadMoreBtn.hidden = true;
    const thisRequestId = ++requestId;
    try {
        const res = await fetch(`${API_BASE_URL}/api/dictionary/random?count=24`);
        if (thisRequestId !== requestId) return;
        if (!res.ok) throw new Error('random failed');
        const data = await res.json();
        if (!data.results || !data.results.length) {
            sozlukResults.innerHTML = '<p class="sozluk-empty">Sözlük şu an yüklenemedi, lütfen tekrar deneyin.</p>';
            sozlukCount.textContent = '';
            return;
        }
        renderEntries(data.results);
        sozlukCount.textContent = 'Aramadan önce göz atabileceğiniz rastgele kelimeler';
    } catch (err) {
        sozlukResults.innerHTML = '<p class="sozluk-empty">Sözlük şu an yüklenemedi, lütfen tekrar deneyin.</p>';
        sozlukCount.textContent = '';
    }
}

function runSearch(query) {
    clearTimeout(searchTimer);
    query = query.trim();

    if (!query || query.length < 2) {
        loadRandomBatch();
        return;
    }

    currentMode = 'search';
    setActiveLetterBtn(null);
    sozlukLoadMoreBtn.hidden = true;
    searchTimer = setTimeout(async () => {
        const thisRequestId = ++requestId;
        try {
            const res = await fetch(`${API_BASE_URL}/api/dictionary/search?q=${encodeURIComponent(query)}&limit=50`);
            if (thisRequestId !== requestId) return;
            if (!res.ok) throw new Error('search failed');
            const data = await res.json();
            if (!data.results.length) {
                sozlukResults.innerHTML = '<p class="sozluk-empty">Eşleşen kelime bulunamadı.</p>';
                sozlukCount.textContent = '';
                return;
            }
            currentSearchQuery = query;
            renderEntries(data.results);
            sozlukCount.textContent = data.total_matches > data.results.length
                ? `${data.results.length} / ${data.total_matches} sonuç gösteriliyor`
                : `${data.total_matches} sonuç`;
        } catch (err) {
            sozlukResults.innerHTML = '<p class="sozluk-empty">Sözlük şu an yüklenemedi, lütfen tekrar deneyin.</p>';
            sozlukCount.textContent = '';
        }
    }, 300);
}

sozlukSearchInput.addEventListener('input', () => runSearch(sozlukSearchInput.value));

sozlukRefreshBtn.addEventListener('click', () => {
    if (currentMode === 'search' && sozlukSearchInput.value.trim().length >= 2) {
        runSearch(sozlukSearchInput.value);
    } else if (currentMode === 'letter' && currentLetter) {
        loadLetterPage(currentLetter);
    } else {
        sozlukSearchInput.value = '';
        loadRandomBatch();
    }
});

// URL'de ?q= varsa (navbar aramasından "Sözlükte ara" ile gelinmiş olabilir)
// otomatik doldurup arasın; yoksa sayfa açılır açılmaz rastgele kelimelerle
// (arama yapmadan da göz atılabilsin diye) başlar.
const initialQuery = new URLSearchParams(window.location.search).get('q');
if (initialQuery) {
    sozlukSearchInput.value = initialQuery;
    runSearch(initialQuery);
} else {
    loadRandomBatch();
}
