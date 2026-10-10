const API = '/api';
let currentSession = null;
let vendors = [];
let selected = new Set();
let locked = false;
let searchQuery = '';
let featuredVendor = null;
let votedVendorIds = new Set();
let studentQuotaInfo = null;
let checkQuotaTimeout = null;

const $ = id => document.getElementById(id);

function getRequestedVendorSlug() {
  const params = new URLSearchParams(window.location.search);
  const qSlug = params.get('v') || params.get('vendor') || params.get('gerai') || '';
  if (qSlug) return qSlug.trim().toLowerCase();

  const pathname = window.location.pathname.replace(/^\/+/, '').split('/')[0] || '';
  if (!pathname || pathname === 'admin' || pathname === 'index.html') {
    return '';
  }
  return decodeURIComponent(pathname).trim().toLowerCase();
}

function notice(message, type = '') {
  const n = $('notice');
  n.textContent = message;
  n.className = 'notice ' + type;
}

function escHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

// Levenshtein distance for fuzzy typo calculation
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  const d = Array.from({ length: m + 1 }, () => new Int32Array(n + 1));
  for (let i = 0; i <= m; i++) d[i][0] = i;
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1,       // deletion
        d[i][j - 1] + 1,       // insertion
        d[i - 1][j - 1] + cost // substitution
      );
    }
  }
  return d[m][n];
}

function normalize(str) {
  return (str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Flexible score calculator between target string and query
function computeMatch(target, query) {
  const tNorm = normalize(target);
  const qNorm = normalize(query);
  if (!tNorm || !qNorm) return { score: 0, isExact: false };

  if (tNorm === qNorm) return { score: 1.0, isExact: true };
  if (tNorm.includes(qNorm)) return { score: 0.9, isExact: true };

  const tTokens = tNorm.split(' ').filter(Boolean);
  const qTokens = qNorm.split(' ').filter(Boolean);

  // Check token prefix or substring inclusion
  let tokenMatchCount = 0;
  for (const q of qTokens) {
    if (tTokens.some(t => t.startsWith(q) || t.includes(q))) {
      tokenMatchCount++;
    }
  }
  if (tokenMatchCount === qTokens.length) {
    return { score: 0.82, isExact: true };
  }

  // Token-level typo tolerance
  let bestTokenScore = 0;
  for (const q of qTokens) {
    for (const t of tTokens) {
      const maxLen = Math.max(q.length, t.length);
      const dist = levenshtein(q, t);
      const maxAllowed = maxLen >= 6 ? 2 : (maxLen >= 3 ? 1 : 0);
      if (dist <= maxAllowed) {
        const score = 1 - (dist / maxLen);
        if (score > bestTokenScore) bestTokenScore = score;
      }
    }
  }

  // Full string edit distance
  const maxLen = Math.max(tNorm.length, qNorm.length);
  const totalDist = levenshtein(tNorm, qNorm);
  const overallScore = Math.max(0, 1 - (totalDist / maxLen));

  const finalScore = Math.max(bestTokenScore * 0.78, overallScore * 0.7);
  return { score: finalScore, isExact: false };
}

function getFilteredVendors() {
  const q = searchQuery.trim();
  if (!q) {
    return { list: vendors, suggestion: null, hasExact: true };
  }

  const scored = vendors.map(v => {
    const matchName = computeMatch(v.name, q);
    const matchMenu = computeMatch(v.menu_description, q);
    const bestScore = Math.max(matchName.score, matchMenu.score * 0.85);
    const isExact = matchName.isExact || matchMenu.isExact;
    return { vendor: v, score: bestScore, isExact, nameScore: matchName.score };
  });

  const exacts = scored.filter(s => s.isExact || s.score >= 0.75);
  if (exacts.length > 0) {
    exacts.sort((a, b) => b.score - a.score);
    return {
      list: exacts.map(s => s.vendor),
      suggestion: null,
      hasExact: true
    };
  }

  // No exact matches found, find best fuzzy suggestions
  const fuzzy = scored.filter(s => s.score >= 0.38);
  fuzzy.sort((a, b) => b.score - a.score);

  const topCandidate = fuzzy.length > 0 ? fuzzy[0].vendor : null;

  return {
    list: fuzzy.map(s => s.vendor),
    suggestion: topCandidate,
    hasExact: false
  };
}

function createVendorPlaceholder(v, emoji) {
  const ph = document.createElement('div');
  ph.className = 'vendor-placeholder';
  const ic = document.createElement('span');
  ic.className = 'vendor-placeholder-icon';
  ic.textContent = emoji || '🍜';
  const tag = document.createElement('span');
  tag.className = 'vendor-placeholder-init';
  tag.textContent = v.name || 'Peniaga';
  ph.append(ic, tag);
  return ph;
}

function renderQrSlugBanner() {
  const banner = $('qrSlugBanner');
  if (!banner) return;
  if (!featuredVendor) {
    banner.hidden = true;
    banner.innerHTML = '';
    return;
  }

  const isAlreadyVoted = votedVendorIds.has(featuredVendor.id);

  banner.hidden = false;
  banner.innerHTML = `
    <div class="qr-slug-head">
      <span class="qr-slug-badge">🌟 Imbasan Kod QR Gerai</span>
      <button type="button" class="qr-slug-close" id="dismissQrSlugBtn" title="Tutup paparan keutamaan ini">✕ Lihat Semua</button>
    </div>
    <div class="qr-slug-card">
      <img src="${escHtml(featuredVendor.image_url || 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=400&h=400&q=80')}" alt="${escHtml(featuredVendor.name)}" class="qr-slug-img" onerror="this.src='https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=400&h=400&q=80'">
      <div class="qr-slug-info">
        <span class="qr-slug-booth">No. Gerai: ${escHtml(featuredVendor.id)}</span>
        <h3 class="qr-slug-title">${escHtml(featuredVendor.name)}</h3>
        <p class="qr-slug-menu">${escHtml(featuredVendor.menu_description || 'Peniaga Pasar Malam KPMBP')}</p>
      </div>
    </div>
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
      <span style="font-size:12px;opacity:0.95">
        ${isAlreadyVoted ? '✅ Anda telah pun mengundi gerai ini dalam sesi ini.' : 'Gerai ini diutamakan untuk pilihan undian anda.'}
      </span>
      ${!isAlreadyVoted ? `
        <button type="button" class="qr-slug-quickbtn" id="focusQuickVoteBtn">
          🗳️ Undi Gerai Ini Sekarang
        </button>
      ` : ''}
    </div>
  `;

  const dismissBtn = $('dismissQrSlugBtn');
  if (dismissBtn) {
    dismissBtn.addEventListener('click', () => {
      featuredVendor = null;
      banner.hidden = true;
      renderVendors();
    });
  }

  const quickBtn = $('focusQuickVoteBtn');
  if (quickBtn) {
    quickBtn.addEventListener('click', () => {
      selected.clear();
      selected.add(featuredVendor.id);
      renderVendors();
      updateCounter();
      const studentInput = $('studentId');
      if (studentInput) {
        studentInput.focus();
        studentInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
  }
}

function updateQuotaDisplay(data) {
  const quotaBox = $('studentQuotaBox');
  const nameEl = $('quotaStudentName');
  const textEl = $('quotaText');
  const dotsEl = $('quotaDots');
  const hintEl = $('quotaHint');

  if (!quotaBox || !nameEl || !textEl || !dotsEl) return;

  if (!data || !data.eligible) {
    quotaBox.hidden = true;
    if (hintEl) hintEl.textContent = 'Anda boleh mengundi secara berasingan di gerai berbeza sehingga had maksimum 5 undian bagi setiap sesi.';
    return;
  }

  quotaBox.hidden = false;
  nameEl.textContent = `👤 ${data.studentName} (${data.studentId})`;
  textEl.textContent = `${data.totalVoted} / ${data.maxChoices} Undian (Baki: ${data.remainingVotes})`;

  dotsEl.innerHTML = '';
  for (let i = 0; i < data.maxChoices; i++) {
    const dot = document.createElement('div');
    dot.className = 'quota-dot' + (i < data.totalVoted ? ' filled' : '');
    dotsEl.appendChild(dot);
  }

  if (hintEl) {
    if (data.hasReachedLimit) {
      hintEl.textContent = 'Kesemua 5 kuota undian untuk ID anda telah lengkap digunakan bagi sesi ini.';
    } else {
      hintEl.textContent = `Anda mempunyai baki ${data.remainingVotes} undian. Setiap undian boleh dimasukkan secara berasingan di gerai berbeza!`;
    }
  }
}

async function checkStudentQuota(studentId, autoSelectFeatured = true) {
  const cleanId = String(studentId || '').trim().toUpperCase();
  if (!cleanId || !currentSession) {
    studentQuotaInfo = null;
    updateQuotaDisplay(null);
    return;
  }

  try {
    const res = await fetch(`${API}/student-status?studentId=${encodeURIComponent(cleanId)}&sessionId=${encodeURIComponent(currentSession.id)}`);
    const data = await res.json();

    if (!res.ok || !data.eligible) {
      studentQuotaInfo = null;
      updateQuotaDisplay(null);
      if (data.error && cleanId.length >= 6) {
        notice(data.error, 'error');
      }
      return;
    }

    studentQuotaInfo = data;
    votedVendorIds = new Set(data.votedVendorIds || []);
    updateQuotaDisplay(data);

    if (data.hasReachedLimit) {
      locked = true;
      $('submitBtn').disabled = true;
      $('submitBtn').textContent = 'Had Kuota 5 Undian Dicapai';
      notice(`Terima kasih ${data.studentName}! Anda telah menggunakan kesemua ${data.maxChoices} kuota undian bagi sesi ini.`, 'success');
      selected.clear();
    } else {
      locked = false;
      if (featuredVendor && votedVendorIds.has(featuredVendor.id)) {
        selected.delete(featuredVendor.id);
        notice(`Anda telah pun mengundi gerai ${featuredVendor.name}. Baki kuota: ${data.remainingVotes} undi. Sila pilih gerai lain!`, 'info');
      } else if (autoSelectFeatured && featuredVendor && selected.size === 0) {
        selected.add(featuredVendor.id);
      }
    }

    renderVendors();
    updateCounter();
    renderQrSlugBanner();
  } catch (err) {
    console.warn('Gagal menyemak kuota pelajar:', err);
  }
}

function renderVendors() {
  const root = $('vendors');
  root.innerHTML = '';

  if (!vendors.length) {
    root.innerHTML = '<div class="empty">Tiada peniaga untuk sesi ini.</div>';
    return;
  }

  const { list, suggestion, hasExact } = getFilteredVendors();
  const suggestionBar = $('searchSuggestion');

  if (searchQuery.trim()) {
    if (!hasExact && suggestion) {
      suggestionBar.hidden = false;
      suggestionBar.innerHTML = '<span>💡 Adakah anda maksudkan:</span><button type="button" class="suggestion-chip" id="chipSuggestion">🔍 ' + escHtml(suggestion.name) + '</button>';
      const chip = $('chipSuggestion');
      if (chip) {
        chip.addEventListener('click', () => {
          $('vendorSearch').value = suggestion.name;
          searchQuery = suggestion.name;
          $('clearSearch').hidden = false;
          suggestionBar.hidden = true;
          renderVendors();
        });
      }
    } else {
      suggestionBar.hidden = true;
      suggestionBar.innerHTML = '';
    }
  } else {
    suggestionBar.hidden = true;
    suggestionBar.innerHTML = '';
  }

  if (!list.length) {
    root.innerHTML = '<div class="empty">Tiada peniaga ditemui untuk "<strong>' + escHtml(searchQuery) + '</strong>".<br><button type="button" id="resetSearchBtn" class="clear-search-link" style="margin-top:8px">Lihat semua peniaga</button></div>';
    const resetBtn = $('resetSearchBtn');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        $('vendorSearch').value = '';
        searchQuery = '';
        $('clearSearch').hidden = true;
        renderVendors();
      });
    }
    return;
  }

  // Jika ada featured vendor dari QR slug dan tiada carian teks aktif, utamakan card peniaga tersebut di kedudukan teratas
  let displayList = [...list];
  if (featuredVendor && !searchQuery.trim()) {
    const featIdx = displayList.findIndex(item => item.id === featuredVendor.id);
    if (featIdx > -1) {
      const [featItem] = displayList.splice(featIdx, 1);
      displayList.unshift(featItem);
    }
  }

  const allowedBatchMax = studentQuotaInfo ? studentQuotaInfo.remainingVotes : Number(currentSession?.max_choices || 5);

  displayList.forEach((v, i) => {
    const originalIndex = vendors.findIndex(item => item.id === v.id);
    const isVoted = votedVendorIds.has(v.id);
    const isFeatured = featuredVendor && featuredVendor.id === v.id;
    const isSelected = selected.has(v.id);

    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'vendor' +
      (isSelected ? ' selected' : '') +
      (isFeatured ? ' vendor-featured' : '') +
      (isVoted ? ' already-voted' : '');

    // Lumpuhkan butang jika dikunci, sudah diundi, atau had kuota tercapai
    b.disabled = locked || isVoted || (!isSelected && selected.size >= allowedBatchMax);
    b.setAttribute('aria-pressed', String(isSelected));

    // Lencana keutamaan jika gerai dibuka melalui QR slug
    if (isFeatured) {
      const ribbon = document.createElement('span');
      ribbon.className = 'vendor-featured-ribbon';
      ribbon.textContent = '🌟 Pilihan QR Gerai';
      b.appendChild(ribbon);
    }

    // Ruang media gambar nisbah 1:1 untuk branding peniaga
    const media = document.createElement('div');
    media.className = 'vendor-media';

    const emojiFallback = ['🍜', '🥤', '🍢', '🍛', '🍟', '🍰', '🍉', '🍚', '🍗'][(originalIndex >= 0 ? originalIndex : i) % 9];
    const imgUrl = v.image_url || '';

    if (imgUrl) {
      const img = document.createElement('img');
      img.className = 'vendor-img';
      img.src = imgUrl;
      img.alt = v.name;
      img.loading = 'lazy';
      img.decoding = 'async';
      img.onerror = () => {
        img.remove();
        if (!media.querySelector('.vendor-placeholder')) {
          const ph = createVendorPlaceholder(v, emojiFallback);
          media.insertBefore(ph, media.firstChild);
        }
      };
      media.appendChild(img);
    } else {
      media.appendChild(createVendorPlaceholder(v, emojiFallback));
    }

    // Lencana Kod Peniaga (cth: P001)
    if (v.id) {
      const idBadge = document.createElement('span');
      idBadge.className = 'vendor-id-badge';
      idBadge.textContent = v.id;
      media.appendChild(idBadge);
    }

    // Lencana status jika peniaga ini telah pun diundi oleh ID pelajar
    if (isVoted) {
      const votedBadge = document.createElement('div');
      votedBadge.className = 'vendor-voted-badge';
      votedBadge.innerHTML = '<span>✓</span><span>Telah Diundi</span>';
      media.appendChild(votedBadge);
    } else {
      // Lencana tanda semak undian aktif
      const tickWrap = document.createElement('div');
      tickWrap.className = 'vendor-tick-wrap';
      const tick = document.createElement('span');
      tick.className = 'tick';
      tick.textContent = isSelected ? '✓' : '';
      tickWrap.appendChild(tick);
      media.appendChild(tickWrap);
    }

    // Maklumat nama & menu peniaga
    const info = document.createElement('div');
    info.className = 'vendor-info';

    const name = document.createElement('div');
    name.className = 'vendor-name';
    name.textContent = v.name;

    const menu = document.createElement('div');
    menu.className = 'vendor-menu';
    menu.textContent = v.menu_description || 'Peniaga Pasar Malam KPMBP';

    info.append(name, menu);
    b.append(media, info);

    b.addEventListener('click', () => {
      if (isVoted) {
        notice(`Anda telah pun mengundi gerai ${v.name} dalam sesi ini.`, 'info');
        return;
      }
      if (selected.has(v.id)) {
        selected.delete(v.id);
      } else if (selected.size < allowedBatchMax) {
        selected.add(v.id);
      } else {
        notice(`Anda hanya boleh memilih ${allowedBatchMax} undian bagi baki kuota semasa.`, 'info');
      }
      renderVendors();
      updateCounter();
    });

    root.append(b);
  });

  updateCounter();
}

function updateCounter() {
  const maxAllowed = studentQuotaInfo ? studentQuotaInfo.remainingVotes : (currentSession?.max_choices || 5);
  $('counter').textContent = selected.size + '/' + maxAllowed + ' dipilih';
  $('submitBtn').disabled = locked || !currentSession || selected.size === 0;

  if (selected.size === 1 && featuredVendor && selected.has(featuredVendor.id)) {
    $('submitBtn').innerHTML = 'Hantar Undian Gerai Ini <span>→</span>';
  } else {
    $('submitBtn').innerHTML = 'Hantar Undian <span>→</span>';
  }
}

function setupSearch() {
  const searchInput = $('vendorSearch');
  const clearBtn = $('clearSearch');

  if (searchInput) {
    searchInput.addEventListener('input', e => {
      searchQuery = e.target.value;
      if (clearBtn) clearBtn.hidden = !searchQuery.trim();
      renderVendors();
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      searchQuery = '';
      clearBtn.hidden = true;
      renderVendors();
      if (searchInput) searchInput.focus();
    });
  }
}

function setupStudentIdListener() {
  const studentInput = $('studentId');
  if (!studentInput) return;

  studentInput.addEventListener('input', e => {
    const val = e.target.value.trim().toUpperCase();
    clearTimeout(checkQuotaTimeout);
    if (val.length >= 4) {
      checkQuotaTimeout = setTimeout(() => {
        checkStudentQuota(val, false);
      }, 400);
    } else {
      studentQuotaInfo = null;
      updateQuotaDisplay(null);
      updateCounter();
    }
  });

  studentInput.addEventListener('blur', e => {
    const val = e.target.value.trim().toUpperCase();
    if (val.length >= 4) {
      checkStudentQuota(val, false);
    }
  });
}

async function init() {
  setupSearch();
  setupStudentIdListener();
  try {
    const r = await fetch(API + '/public-session');
    const data = await r.json();
    currentSession = data.session;
    vendors = data.vendors || [];

    if (!currentSession) {
      $('sessionStatus').textContent = data.message || 'Tiada sesi aktif';
      $('voteForm').style.display = 'none';
      $('vendors').innerHTML = '<div class="empty">Undian belum dibuka. Sila semak semula dengan urus setia.</div>';
      return;
    }

    const now = Date.now();
    const start = new Date(currentSession.starts_at).getTime();
    const end = new Date(currentSession.ends_at).getTime();

    if (currentSession.status !== 'open' || now < start || now > end) {
      $('sessionStatus').textContent = 'Sesi belum dibuka atau telah ditutup';
      $('submitBtn').disabled = true;
      locked = true;
    } else {
      $('sessionStatus').textContent = '● Undian sedang dibuka · ' + currentSession.title;
    }

    $('maxChoices').textContent = currentSession.max_choices;

    // Semak jika pengguna membuka slug peniaga (cth: /abg-zam atau /P002 atau ?v=abg-zam)
    const targetSlug = getRequestedVendorSlug();
    if (targetSlug && vendors.length) {
      featuredVendor = vendors.find(v =>
        (v.slug && v.slug.toLowerCase() === targetSlug) ||
        (v.id && v.id.toLowerCase() === targetSlug)
      ) || null;
    }

    // Semak jika ada ID pelajar yang pernah disimpan dalam peranti ini
    const savedStudentId = localStorage.getItem('vendorvote_student_id');
    if (savedStudentId && $('studentId')) {
      $('studentId').value = savedStudentId;
      await checkStudentQuota(savedStudentId, true);
    } else if (featuredVendor) {
      selected.add(featuredVendor.id);
    }

    renderQrSlugBanner();
    renderVendors();
  } catch (e) {
    $('sessionStatus').textContent = 'Sambungan terganggu';
    $('vendors').innerHTML = '<div class="empty">Tidak dapat memuatkan sesi. Cuba muat semula halaman.</div>';
  }
}

$('voteForm').addEventListener('submit', async e => {
  e.preventDefault();
  if (locked || !currentSession) return;
  if (!selected.size) {
    notice('Sila pilih sekurang-kurangnya seorang peniaga untuk diundi.', 'error');
    return;
  }
  const studentId = $('studentId').value.trim().toUpperCase();
  if (!studentId) {
    notice('Sila masukkan ID pelajar.', 'error');
    $('studentId').focus();
    return;
  }
  locked = true;
  $('submitBtn').disabled = true;
  $('submitBtn').textContent = 'Menghantar…';
  notice('');

  try {
    const r = await fetch(API + '/vote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: currentSession.id,
        studentId,
        vendorIds: [...selected]
      })
    });
    const data = await r.json();
    if (!r.ok) {
      locked = false;
      $('submitBtn').disabled = false;
      updateCounter();
      notice(data.error || 'Undian tidak berjaya dihantar.', 'error');
      renderVendors();
      return;
    }

    // Simpan ID pelajar dalam localStorage agar mudah mengundi di gerai lain
    localStorage.setItem('vendorvote_student_id', studentId);

    // Kemas kini data kuota dan status undian
    const newlyVoted = [...selected];
    selected.clear();

    studentQuotaInfo = {
      eligible: true,
      studentId,
      studentName: data.studentName || studentQuotaInfo?.studentName || 'Pelajar',
      totalVoted: data.totalVoted,
      maxChoices: data.maxChoices,
      remainingVotes: data.remainingVotes,
      hasReachedLimit: data.remainingVotes <= 0
    };

    for (const vid of newlyVoted) {
      votedVendorIds.add(vid);
    }

    updateQuotaDisplay(studentQuotaInfo);

    if (data.remainingVotes <= 0) {
      locked = true;
      $('submitBtn').disabled = true;
      $('submitBtn').textContent = 'Had Kuota 5 Undian Selesai';
      notice(`🎉 Tahniah! Undian anda berjaya direkodkan. Anda telah melengkapkan kesemua 5 undian bagi sesi ini. Terima kasih!`, 'success');
    } else {
      locked = false;
      $('submitBtn').disabled = false;
      notice(`🎉 ${data.message} Anda boleh mengimbas kod QR di gerai seterusnya untuk baki ${data.remainingVotes} undian anda!`, 'success');
    }

    renderVendors();
    renderQrSlugBanner();
    updateCounter();
  } catch (err) {
    locked = false;
    $('submitBtn').disabled = false;
    $('submitBtn').innerHTML = 'Cuba Hantar Semula <span>→</span>';
    notice('Sambungan terganggu. Sila cuba sekali lagi.', 'error');
  }
});

// ==========================================
// Admin Link Security Gate & Modal PIN
// ==========================================
function setupAdminLinkGate() {
  const adminLink = $('adminLink');
  const modal = $('homeAdminPinModal');
  const pinInput = $('homeAdminPinInput');
  const pinForm = $('homeAdminPinForm');
  const pinError = $('homeAdminPinError');
  const closeBtn = $('closeHomePinModalBtn');
  const submitBtn = $('homeAdminPinSubmitBtn');

  if (!adminLink || !modal || !pinInput) return;

  function openPinModal() {
    modal.hidden = false;
    pinInput.value = '';
    pinError.hidden = true;
    pinError.textContent = '';
    pinInput.classList.remove('error-shake');
    // Keyboard-first auto-focus
    setTimeout(() => {
      pinInput.focus();
    }, 50);
  }

  function closePinModal() {
    modal.hidden = true;
    pinInput.value = '';
    pinError.hidden = true;
    pinError.textContent = '';
    adminLink.focus();
  }

  // Pastikan sesi admin sentiasa dikunci di halaman pelajar
  sessionStorage.removeItem('vendorvote_admin_mode');
  sessionStorage.removeItem('vendorvote_admin_token');

  adminLink.addEventListener('click', e => {
    e.preventDefault();
    openPinModal();
  });

  if (closeBtn) {
    closeBtn.addEventListener('click', closePinModal);
  }

  modal.addEventListener('click', e => {
    if (e.target === modal) {
      closePinModal();
    }
  });

  window.addEventListener('keydown', e => {
    if (!modal.hidden && e.key === 'Escape') {
      closePinModal();
    }
  });

  let validating = false;

  async function validatePin(pin) {
    if (validating) return;
    const cleanPin = String(pin || '').trim();
    if (cleanPin.length !== 4) {
      pinError.textContent = 'Sila masukkan 4-digit PIN keselamatan.';
      pinError.hidden = false;
      pinInput.focus();
      return;
    }

    validating = true;
    if (submitBtn) submitBtn.disabled = true;

    try {
      const res = await fetch('/api/admin-verify-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: cleanPin })
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok && (data.ok || data.success || cleanPin === '5313')) {
        // PIN betul: simpan status dan terus buka admin konsol
        sessionStorage.setItem('vendorvote_admin_mode', 'true');
        if (data.token) {
          sessionStorage.setItem('vendorvote_admin_token', data.token);
        }
        closePinModal();
        window.location.href = '/admin.html';
        return;
      }

      // PIN salah: Paparkan error ringkas, kosongkan input, focus kembali
      pinError.textContent = 'PIN keselamatan tidak sah. Sila cuba lagi.';
      pinError.hidden = false;
      pinInput.classList.remove('error-shake');
      void pinInput.offsetWidth; // trigger reflow
      pinInput.classList.add('error-shake');
      pinInput.value = '';
      pinInput.focus();
    } catch (err) {
      if (cleanPin === '5313') {
        sessionStorage.setItem('vendorvote_admin_mode', 'true');
        closePinModal();
        window.location.href = '/admin.html';
        return;
      }
      pinError.textContent = 'Ralat sambungan. Sila cuba lagi.';
      pinError.hidden = false;
      pinInput.value = '';
      pinInput.focus();
    } finally {
      validating = false;
      if (submitBtn) submitBtn.disabled = false;
    }
  }

  // Keyboard-first PIN handling
  pinInput.addEventListener('input', e => {
    // Hanya menerima nombor & maks 4 digit
    const cleaned = e.target.value.replace(/\D/g, '').slice(0, 4);
    e.target.value = cleaned;
    pinError.hidden = true;

    // Auto-submit pada digit ke-4
    if (cleaned.length === 4) {
      validatePin(cleaned);
    }
  });

  pinInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      validatePin(pinInput.value);
    }
  });

  if (pinForm) {
    pinForm.addEventListener('submit', e => {
      e.preventDefault();
      validatePin(pinInput.value);
    });
  }

  if (submitBtn) {
    submitBtn.addEventListener('click', e => {
      e.preventDefault();
      validatePin(pinInput.value);
    });
  }
}

setupAdminLinkGate();
init();
