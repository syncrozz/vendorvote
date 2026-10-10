const $ = id => document.getElementById(id);

function esc(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

// ----------------------------------------------------
// Mod Admin State & Auth Management
// ----------------------------------------------------
const ADMIN_STORAGE_KEY = 'vendorvote_admin_active';

function isAdminModeActive() {
  return sessionStorage.getItem(ADMIN_STORAGE_KEY) === 'true';
}

function getAdminAuthHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (isAdminModeActive()) {
    headers['x-admin-pin'] = '5313';
  }
  return headers;
}

function applyAdminModeUI() {
  const active = isAdminModeActive();
  const lockScreen = $('adminLockScreen');
  const contentContainer = $('adminContentContainer');
  const btn = $('adminModeBtn');
  const statusSpan = $('adminModeStatus');
  const vendorNotice = $('vendorLockNotice');
  const rosterNotice = $('rosterLockNotice');

  if (active) {
    if (lockScreen) lockScreen.hidden = true;
    if (contentContainer) contentContainer.hidden = false;
    if (btn && statusSpan) {
      btn.classList.add('active');
      statusSpan.textContent = '🟢 Admin Mode Aktif';
      btn.title = 'Mod Admin aktif. Klik untuk mengunci semula.';
    }
  } else {
    if (lockScreen) {
      lockScreen.hidden = false;
      const lockInput = $('lockScreenPinInput');
      if (lockInput) {
        lockInput.value = '';
        setTimeout(() => lockInput.focus(), 60);
      }
    }
    if (contentContainer) contentContainer.hidden = true;
    if (btn && statusSpan) {
      btn.classList.remove('active');
      statusSpan.textContent = '🔒 Akses Mod Admin';
      btn.title = 'Klik untuk membuka akses Mod Admin dengan PIN keselamatan.';
    }
  }

  // Gate administrative actions (Edit, Tambah, Ubah, Padam, Import)
  if (vendorNotice) vendorNotice.hidden = active;
  if (rosterNotice) rosterNotice.hidden = active;

  const importVendorsBtn = $('importVendorsBtn');
  const loadKpmbpSampleBtn = $('loadKpmbpSampleBtn');
  const vendorCsvText = $('vendorCsvText');
  const vendorDropZone = $('vendorDropZone');

  const importRosterBtn = $('importBtn');
  const loadKpmbpRosterBtn = $('loadKpmbpRosterBtn');
  const rosterText = $('roster');
  const rosterDropZone = $('rosterDropZone');

  if (importVendorsBtn) importVendorsBtn.disabled = !active;
  if (loadKpmbpSampleBtn) loadKpmbpSampleBtn.disabled = !active;
  if (vendorCsvText) vendorCsvText.disabled = !active;
  if (vendorDropZone) {
    if (active) vendorDropZone.classList.remove('admin-locked-action');
    else vendorDropZone.classList.add('admin-locked-action');
  }

  if (importRosterBtn) importRosterBtn.disabled = !active;
  if (loadKpmbpRosterBtn) loadKpmbpRosterBtn.disabled = !active;
  if (rosterText) rosterText.disabled = !active;
  if (rosterDropZone) {
    if (active) rosterDropZone.classList.remove('admin-locked-action');
    else rosterDropZone.classList.add('admin-locked-action');
  }
}

// ----------------------------------------------------
// Modal & PIN Validation Logic (Single Source of Truth)
// ----------------------------------------------------
function openPinModal() {
  const modal = $('adminPinModal');
  const input = $('adminPinInput');
  const error = $('pinErrorMsg');
  if (!modal || !input) return;

  modal.hidden = false;
  input.value = '';
  if (error) {
    error.hidden = true;
    error.textContent = '';
  }
  input.classList.remove('error-shake');
  // Auto-focus apabila modal dibuka
  setTimeout(() => input.focus(), 60);
}

function closePinModal() {
  const modal = $('adminPinModal');
  const input = $('adminPinInput');
  const error = $('pinErrorMsg');
  if (!modal) return;

  modal.hidden = true;
  if (input) input.value = '';
  if (error) {
    error.hidden = true;
    error.textContent = '';
  }
}

function validateAdminPin(rawPin, isModal = false) {
  const cleanPin = String(rawPin || '').trim();
  const input = isModal ? $('adminPinInput') : $('lockScreenPinInput');
  const error = isModal ? $('pinErrorMsg') : $('lockScreenPinError');

  // Gunakan PIN 5313 untuk validation
  const TARGET_PIN = '5313';

  if (cleanPin === TARGET_PIN) {
    // PIN betul: Tutup modal / lock screen → aktifkan Admin Mode
    sessionStorage.setItem(ADMIN_STORAGE_KEY, 'true');
    if (isModal) closePinModal();
    applyAdminModeUI();
    load();
    return true;
  } else {
    // PIN salah:
    // * Paparkan error ringkas
    // * Kosongkan input
    // * Focus kembali ke input PIN
    // * Modal / skrin kekal terbuka
    // * Pengguna boleh terus menaip semula
    if (error) {
      error.textContent = 'PIN keselamatan tidak tepat. Sila cuba lagi.';
      error.hidden = false;
    }
    if (input) {
      input.classList.remove('error-shake');
      void input.offsetWidth;
      input.classList.add('error-shake');
      input.value = '';
      input.focus();
    }
    return false;
  }
}

async function load() {
  if (!isAdminModeActive()) {
    applyAdminModeUI();
    return;
  }

  try {
    const r = await fetch('/api/admin-dashboard', {
      headers: getAdminAuthHeaders()
    });
    if (r.status === 401 || r.status === 403) {
      sessionStorage.removeItem(ADMIN_STORAGE_KEY);
      applyAdminModeUI();
      return;
    }
    if (!r.ok) throw new Error('Gagal memuatkan data papan pemuka.');

    const d = await r.json();
    $('adminStatus').hidden = true;
    $('dashboard').hidden = false;

    const active = d.sessions.find(s => s.status === 'open') || d.sessions[0];
    const total = (d.totals || []).find(t => t.session_id === active?.id)?.total_voters || 0;
    const activeVendors = (d.vendors || []).filter(v => v.active);

    // Stats Bar
    $('stats').innerHTML = `
      <div class="stat"><strong>${total}</strong><span>Pelajar telah mengundi</span></div>
      <div class="stat"><strong>${d.eligibleStudents || 0}</strong><span>ID pelajar layak</span></div>
      <div class="stat"><strong>${activeVendors.length}</strong><span>Peniaga aktif (Sesi Semasa)</span></div>
    `;

    if ($('rosterExportBadge')) {
      $('rosterExportBadge').textContent = `(${d.eligibleStudents || 0} Pelajar)`;
    }

    // Results table
    const results = (d.results || []).filter(x => x.session_id === active?.id);
    const maxVotes = Math.max(1, ...results.map(x => x.votes));

    $('results').innerHTML = results.map(v => `
      <tr>
        <td><code>${esc(v.vendor_id)}</code></td>
        <td><strong>${esc(v.name)}</strong></td>
        <td>
          <div style="font-size:11px;color:var(--muted)">${esc(v.menu_description || 'Tiada deskripsi')}</div>
          ${v.phone ? `<div style="font-size:10.5px;color:var(--green)">📞 ${esc(v.phone)}</div>` : ''}
        </td>
        <td><strong>${v.votes}</strong></td>
        <td>${v.min_votes}</td>
        <td>${v.votes >= v.min_votes
          ? '<span style="color:#147d5b;font-weight:700">✓ Mencapai had</span>'
          : '<span style="color:#b7791f">Belum mencapai</span>'}
        </td>
        <td>
          <div class="bar">
            <span style="width:${Math.min(100, (v.votes / maxVotes) * 100)}%"></span>
          </div>
        </td>
      </tr>
    `).join('') || '<tr><td colspan="7">Belum ada data undian bagi sesi ini.</td></tr>';

    // Sessions table
    $('sessions').innerHTML = d.sessions.map(s => `
      <tr>
        <td><strong>${esc(s.title)}</strong></td>
        <td><code>${esc(s.status)}</code></td>
        <td>${new Date(s.starts_at).toLocaleString('ms-MY')}</td>
        <td>${new Date(s.ends_at).toLocaleString('ms-MY')}</td>
        <td>${s.min_votes}</td>
        <td>${s.max_choices || 5}</td>
      </tr>
    `).join('');

    // All Vendors list
    if ($('allVendorsList')) {
      $('vendorCountBadge').textContent = d.vendors.length;
      $('allVendorsList').innerHTML = d.vendors.map(v => `
        <tr>
          <td><code>${esc(v.id)}</code></td>
          <td>
            <img src="${esc(v.image_url || 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=400&h=400&q=80')}" alt="${esc(v.name)}" class="admin-vendor-thumb" onerror="this.src='https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=400&h=400&q=80'">
          </td>
          <td><strong>${esc(v.name)}</strong></td>
          <td><div style="max-width:240px;white-space:normal;font-size:11px">${esc(v.menu_description || '-')}</div></td>
          <td>
            <a href="/${esc(v.slug || v.id.toLowerCase())}" target="_blank" style="font-size:11.5px;color:#116850;font-weight:750;text-decoration:none;display:inline-flex;align-items:center;gap:4px;background:#eef6f3;padding:3px 8px;border-radius:6px;border:1px solid #d2e7de">
              /${esc(v.slug || v.id.toLowerCase())} <span style="font-size:10px">↗</span>
            </a>
          </td>
          <td>${v.phone ? `<code>${esc(v.phone)}</code>` : '<span style="color:var(--muted)">-</span>'}</td>
          <td>${v.active
            ? '<span style="color:#147d5b;font-weight:700">● Aktif</span>'
            : '<span style="color:#b42318">○ Tidak Aktif</span>'}
          </td>
          <td>
            <div style="display:flex;gap:5px;flex-wrap:wrap">
              <button type="button" class="btn-secondary vendor-slug-qr-btn" data-id="${esc(v.id)}" data-name="${esc(v.name)}" data-menu="${esc(v.menu_description || '')}" data-slug="${esc(v.slug || '')}" data-img="${esc(v.image_url || '')}" style="font-size:11px;padding:5px 8px;border-radius:8px;border-color:#116850;color:#116850;font-weight:700">
                📱 Slug &amp; QR
              </button>
              <button type="button" class="btn-secondary edit-vendor-img-btn" data-id="${esc(v.id)}" data-name="${esc(v.name)}" data-img="${esc(v.image_url || '')}" style="font-size:11px;padding:5px 8px;border-radius:8px">
                📷 Gambar
              </button>
            </div>
          </td>
        </tr>
      `).join('');

      // Wire up butang tukar gambar
      document.querySelectorAll('.edit-vendor-img-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          if (!isAdminModeActive()) {
            openPinModal();
            return;
          }
          openVendorImageModal(btn.dataset.id, btn.dataset.name, btn.dataset.img);
        });
      });

      // Wire up butang Slug & QR
      document.querySelectorAll('.vendor-slug-qr-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          if (!isAdminModeActive()) {
            openPinModal();
            return;
          }
          openVendorSlugQrModal({
            id: btn.dataset.id,
            name: btn.dataset.name,
            menu: btn.dataset.menu,
            slug: btn.dataset.slug,
            image: btn.dataset.img
          });
        });
      });
    }

  } catch (e) {
    $('adminStatus').textContent = 'Tidak dapat memuatkan papan pemuka. Sambungan terganggu atau akses belum dibenarkan.';
  }
}

// Setup File Inputs and CSV import
function setupCsvHandlers() {
  const dropZone = $('vendorDropZone');
  const fileInput = $('vendorCsvFileInput');
  const textArea = $('vendorCsvText');
  const fileNameDisplay = $('selectedVendorFileName');
  const importBtn = $('importVendorsBtn');
  const statusDisplay = $('vendorImportStatus');

  if (dropZone && fileInput) {
    dropZone.addEventListener('click', () => fileInput.click());

    dropZone.addEventListener('dragover', e => {
      e.preventDefault();
      dropZone.style.borderColor = 'var(--green)';
    });

    dropZone.addEventListener('dragleave', () => {
      dropZone.style.borderColor = '#cbd8df';
    });

    dropZone.addEventListener('drop', e => {
      e.preventDefault();
      dropZone.style.borderColor = '#cbd8df';
      if (e.dataTransfer.files.length > 0) {
        handleVendorFile(e.dataTransfer.files[0]);
      }
    });

    fileInput.addEventListener('change', e => {
      if (e.target.files.length > 0) {
        handleVendorFile(e.target.files[0]);
      }
    });
  }

  function handleVendorFile(file) {
    if (!file.name.toLowerCase().endsWith('.csv') && file.type !== 'text/csv' && file.type !== 'text/plain') {
      statusDisplay.textContent = 'Sila pilih fail berformat .CSV yang sah.';
      return;
    }
    fileNameDisplay.textContent = `Fail dipilih: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
    const reader = new FileReader();
    reader.onload = evt => {
      textArea.value = evt.target.result;
      statusDisplay.textContent = 'Fail berjaya dibaca ke dalam kotak teks. Klik butang di bawah untuk memproses.';
    };
    reader.onerror = () => {
      statusDisplay.textContent = 'Gagal membaca fail CSV.';
    };
    reader.readAsText(file);
  }

  if (importBtn) {
    importBtn.addEventListener('click', async () => {
      const csvText = textArea.value.trim();
      if (!csvText) {
        statusDisplay.textContent = 'Sila pilih fail CSV atau tampal teks CSV peniaga terlebih dahulu.';
        return;
      }

      importBtn.disabled = true;
      statusDisplay.textContent = 'Sedang memproses dan mengimport rekod peniaga...';

      try {
        const res = await fetch('/api/admin-import-vendors', {
          method: 'POST',
          headers: getAdminAuthHeaders(),
          body: JSON.stringify({ csvText })
        });
        const data = await res.json();
        if (res.ok) {
          statusDisplay.innerHTML = `<span style="color:#147d5b;font-weight:700">✓ ${esc(data.message)}</span>`;
          load();
        } else {
          statusDisplay.textContent = data.error || 'Import CSV peniaga gagal.';
        }
      } catch (err) {
        statusDisplay.textContent = 'Ralat sambungan semasa mengimport CSV peniaga.';
      } finally {
        importBtn.disabled = false;
      }
    });
  }

  // Load bundled KPMBP 61 vendors CSV sample
  const sampleBtn = $('loadKpmbpSampleBtn');
  if (sampleBtn) {
    sampleBtn.addEventListener('click', async () => {
      sampleBtn.disabled = true;
      statusDisplay.textContent = 'Sedang memuat turun data 61 peniaga rasmi KPMBP...';
      try {
        const res = await fetch('/data/vendors_kpmbp.csv');
        if (!res.ok) throw new Error('Gagal memuat fail template.');
        const csvText = await res.text();
        textArea.value = csvText;
        fileNameDisplay.textContent = 'Fail dipilih: vendors_kpmbp.csv (61 peniaga rasmi)';
        statusDisplay.textContent = 'Data 61 peniaga KPMBP sedia dimuatkan. Klik "Proses & Import Peniaga CSV".';
      } catch (err) {
        statusDisplay.textContent = 'Gagal memuat fail peniaga KPMBP sedia ada.';
      } finally {
        sampleBtn.disabled = false;
      }
    });
  }

  // Roster file handling & drag-drop
  const rosterDropZone = $('rosterDropZone');
  const rosterFileInput = $('rosterCsvFileInput');
  const rosterText = $('roster');
  const rosterFileNameDisplay = $('selectedRosterFileName');
  const rosterStatus = $('importStatus');
  const importRosterBtn = $('importBtn');
  const loadKpmbpRosterBtn = $('loadKpmbpRosterBtn');

  if (rosterDropZone && rosterFileInput) {
    rosterDropZone.addEventListener('click', () => rosterFileInput.click());

    rosterDropZone.addEventListener('dragover', e => {
      e.preventDefault();
      rosterDropZone.style.borderColor = 'var(--green)';
    });

    rosterDropZone.addEventListener('dragleave', () => {
      rosterDropZone.style.borderColor = '#cbd8df';
    });

    rosterDropZone.addEventListener('drop', e => {
      e.preventDefault();
      rosterDropZone.style.borderColor = '#cbd8df';
      if (e.dataTransfer.files.length > 0) {
        handleRosterFile(e.dataTransfer.files[0]);
      }
    });

    rosterFileInput.addEventListener('change', e => {
      if (e.target.files.length > 0) {
        handleRosterFile(e.target.files[0]);
      }
    });
  }

  function handleRosterFile(file) {
    if (!file.name.toLowerCase().endsWith('.csv') && file.type !== 'text/csv' && file.type !== 'text/plain') {
      rosterStatus.textContent = 'Sila pilih fail berformat .CSV atau .TXT yang sah.';
      return;
    }
    rosterFileNameDisplay.textContent = `Fail dipilih: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
    const reader = new FileReader();
    reader.onload = evt => {
      rosterText.value = evt.target.result;
      rosterStatus.textContent = 'Fail roster berjaya dibaca ke dalam kotak teks. Sedia untuk diproses.';
    };
    reader.onerror = () => {
      rosterStatus.textContent = 'Gagal membaca fail roster.';
    };
    reader.readAsText(file);
  }

  // Load bundled KPMBP official 680 students CSV
  if (loadKpmbpRosterBtn) {
    loadKpmbpRosterBtn.addEventListener('click', async () => {
      loadKpmbpRosterBtn.disabled = true;
      rosterStatus.textContent = 'Sedang memuat turun data 680 ID pelajar rasmi KPMBP...';
      try {
        const res = await fetch('/data/pelajar_kpmbp.csv');
        if (!res.ok) throw new Error('Gagal memuat fail pelajar.');
        const csvText = await res.text();
        rosterText.value = csvText;
        rosterFileNameDisplay.textContent = 'Fail dipilih: pelajar_kpmbp.csv (680 Pelajar Rasmi KPMBP)';
        rosterStatus.textContent = 'Data 680 pelajar KPMBP sedia dimuatkan. Klik "Proses & Import Roster Pelajar".';
      } catch (err) {
        rosterStatus.textContent = 'Gagal memuat fail pelajar KPMBP sedia ada.';
      } finally {
        loadKpmbpRosterBtn.disabled = false;
      }
    });
  }

  if (importRosterBtn) {
    importRosterBtn.addEventListener('click', async () => {
      const csvText = rosterText.value.trim();
      if (!csvText) {
        rosterStatus.textContent = 'Sila pilih fail CSV atau masukkan senarai ID pelajar terlebih dahulu.';
        return;
      }

      importRosterBtn.disabled = true;
      rosterStatus.textContent = 'Sedang memproses dan mengimport rekod pelajar...';

      try {
        const res = await fetch('/api/admin-roster', {
          method: 'POST',
          headers: getAdminAuthHeaders(),
          body: JSON.stringify({ csvText })
        });
        const data = await res.json();
        if (res.ok) {
          rosterStatus.innerHTML = `<span style="color:#147d5b;font-weight:700">✓ ${esc(data.message)}</span>`;
          rosterText.value = '';
          if (rosterFileNameDisplay) rosterFileNameDisplay.textContent = '';
          load();
        } else {
          rosterStatus.textContent = data.error || 'Import roster gagal.';
        }
      } catch (err) {
        rosterStatus.textContent = 'Ralat sambungan semasa mengimport roster pelajar.';
      } finally {
        importRosterBtn.disabled = false;
      }
    });
  }
}

// ----------------------------------------------------
// Setup Event Listeners untuk Akses Mod Admin & Keyboard
// ----------------------------------------------------
function setupAdminModeEvents() {
  const adminBtn = $('adminModeBtn');
  const modal = $('adminPinModal');
  const modalClose = $('adminModalClose');
  const pinInput = $('adminPinInput');
  const pinForm = $('adminPinForm');
  const pinSubmitBtn = $('adminPinSubmitBtn');

  // Lock Screen elements
  const lockInput = $('lockScreenPinInput');
  const lockForm = $('lockScreenPinForm');
  const lockSubmitBtn = $('lockScreenSubmitBtn');

  // Lock Screen events
  if (lockInput) {
    lockInput.addEventListener('input', () => {
      const sanitized = lockInput.value.replace(/\D/g, '').slice(0, 4);
      lockInput.value = sanitized;

      // Auto Submit apabila digit ke-4 dimasukkan
      if (sanitized.length === 4) {
        validateAdminPin(sanitized, false);
      }
    });

    lockInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        validateAdminPin(lockInput.value, false);
      }
    });
  }

  if (lockForm) {
    lockForm.addEventListener('submit', e => {
      e.preventDefault();
      if (lockInput) validateAdminPin(lockInput.value, false);
    });
  }

  if (lockSubmitBtn) {
    lockSubmitBtn.addEventListener('click', e => {
      e.preventDefault();
      if (lockInput) validateAdminPin(lockInput.value, false);
    });
  }

  // Apabila pengguna tekan pautan ke halaman pelajar, kunci semula mod admin
  const studentLinks = document.querySelectorAll('a[href="/"], a[href="/index.html"]');
  studentLinks.forEach(link => {
    link.addEventListener('click', () => {
      sessionStorage.removeItem(ADMIN_STORAGE_KEY);
      sessionStorage.removeItem('vendorvote_admin_token');
    });
  });

  // Klik butang Akses Mod Admin di header
  if (adminBtn) {
    adminBtn.addEventListener('click', () => {
      if (isAdminModeActive()) {
        const sure = confirm('Kunci semula Mod Admin sekarang?');
        if (sure) {
          sessionStorage.removeItem(ADMIN_STORAGE_KEY);
          applyAdminModeUI();
        }
      } else {
        openPinModal();
      }
    });
  }

  // Butang tutup modal
  if (modalClose) {
    modalClose.addEventListener('click', closePinModal);
  }

  // Klik backdrop luar modal untuk tutup
  if (modal) {
    modal.addEventListener('click', e => {
      if (e.target === modal) {
        closePinModal();
      }
    });
  }

  // Keyboard navigation global
  document.addEventListener('keydown', e => {
    if (modal && !modal.hidden) {
      // Escape -> tutup modal
      if (e.key === 'Escape') {
        closePinModal();
      }
    }
  });

  if (pinInput) {
    // Input event: hanya menerima nombor, maksimum 4 digit
    pinInput.addEventListener('input', () => {
      const sanitized = pinInput.value.replace(/\D/g, '').slice(0, 4);
      pinInput.value = sanitized;

      // Auto Submit: Apabila digit ke-4 dimasukkan, terus validate PIN secara automatik
      if (sanitized.length === 4) {
        validateAdminPin(sanitized, true);
      }
    });

    // Enter -> validate PIN
    pinInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        validateAdminPin(pinInput.value, true);
      }
    });
  }

  // Form submit & button alternatif
  if (pinForm) {
    pinForm.addEventListener('submit', e => {
      e.preventDefault();
      if (pinInput) validateAdminPin(pinInput.value, true);
    });
  }

  if (pinSubmitBtn) {
    pinSubmitBtn.addEventListener('click', e => {
      e.preventDefault();
      if (pinInput) validateAdminPin(pinInput.value, true);
    });
  }
}

function openVendorImageModal(id, name, imgUrl) {
  const modal = $('vendorImageModal');
  if (!modal) return;
  $('vendorImageTargetId').value = id;
  $('vendorImageTargetName').textContent = `${name} (${id})`;
  $('vendorImageUrlInput').value = imgUrl || '';
  $('vendorImagePreview').src = imgUrl || 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=400&h=400&q=80';
  $('vendorImageMsg').textContent = '';
  $('vendorImageFileInput').value = '';
  modal.hidden = false;
}

function closeVendorImageModal() {
  const modal = $('vendorImageModal');
  if (modal) modal.hidden = true;
}

function setupVendorImageHandlers() {
  const modal = $('vendorImageModal');
  const closeBtn = $('closeVendorImageModalBtn');
  const cancelBtn = $('cancelVendorImageBtn');
  const urlInput = $('vendorImageUrlInput');
  const fileInput = $('vendorImageFileInput');
  const form = $('vendorImageForm');
  const preview = $('vendorImagePreview');
  const msg = $('vendorImageMsg');

  if (closeBtn) closeBtn.addEventListener('click', closeVendorImageModal);
  if (cancelBtn) cancelBtn.addEventListener('click', closeVendorImageModal);

  if (modal) {
    modal.addEventListener('click', e => {
      if (e.target === modal) closeVendorImageModal();
    });
  }

  if (urlInput) {
    urlInput.addEventListener('input', () => {
      const val = urlInput.value.trim();
      if (val) preview.src = val;
    });
  }

  if (fileInput) {
    fileInput.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = e => {
          preview.src = e.target.result;
          urlInput.value = e.target.result;
        };
        reader.readAsDataURL(file);
      }
    });
  }

  if (form) {
    form.addEventListener('submit', async e => {
      e.preventDefault();
      if (!isAdminModeActive()) {
        openPinModal();
        return;
      }
      const vendorId = $('vendorImageTargetId').value;
      const imageUrl = urlInput.value.trim();

      msg.textContent = 'Menyimpan gambar 1:1...';
      msg.style.color = 'var(--muted)';

      try {
        const res = await fetch('/api/admin-manage', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...getAdminAuthHeaders()
          },
          body: JSON.stringify({
            action: 'update_vendor_image',
            vendorId,
            imageUrl
          })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Gagal mengemas kini gambar.');

        msg.textContent = '✓ Gambar 1:1 berjaya dikemas kini!';
        msg.style.color = 'var(--green)';

        setTimeout(() => {
          closeVendorImageModal();
          load();
        }, 500);
      } catch (err) {
        msg.textContent = err.message;
        msg.style.color = '#b42318';
      }
    });
  }
}

// ==========================================
// Slug & Kod QR Gerai Peniaga
// ==========================================
let currentSlugTargetVendor = null;

function openVendorSlugQrModal(vendor) {
  const modal = $('vendorSlugQrModal');
  if (!modal) return;
  currentSlugTargetVendor = vendor;

  const targetIdInput = $('vendorSlugTargetId');
  const targetInfo = $('vendorSlugTargetInfo');
  const slugInput = $('vendorCustomSlugInput');
  const qrImg = $('vendorQrPreviewImg');
  const urlBadge = $('vendorQrUrlBadge');
  const msg = $('vendorSlugMsg');

  if (targetIdInput) targetIdInput.value = vendor.id;
  if (targetInfo) targetInfo.textContent = `[${vendor.id}] ${vendor.name} — ${vendor.menu || 'Pasar Malam KPMBP'}`;
  
  const currentSlug = vendor.slug || vendor.id.toLowerCase();
  if (slugInput) slugInput.value = currentSlug;

  const fullUrl = `${window.location.origin}/${currentSlug}`;
  if (urlBadge) urlBadge.textContent = fullUrl;
  if (qrImg) {
    qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(fullUrl)}`;
  }
  if (msg) {
    msg.textContent = '';
  }

  modal.hidden = false;
  setTimeout(() => {
    if (slugInput) slugInput.focus();
  }, 60);
}

function closeVendorSlugQrModal() {
  const modal = $('vendorSlugQrModal');
  if (modal) modal.hidden = true;
  currentSlugTargetVendor = null;
}

function setupVendorSlugQrHandlers() {
  const modal = $('vendorSlugQrModal');
  const closeBtn = $('closeVendorSlugQrModalBtn');
  const slugInput = $('vendorCustomSlugInput');
  const form = $('vendorSlugForm');
  const qrImg = $('vendorQrPreviewImg');
  const urlBadge = $('vendorQrUrlBadge');
  const msg = $('vendorSlugMsg');
  const copyBtn = $('copyVendorSlugUrlBtn');
  const openBtn = $('openVendorSlugUrlBtn');
  const printBtn = $('printVendorStandeeBtn');

  if (closeBtn) closeBtn.addEventListener('click', closeVendorSlugQrModal);
  if (modal) {
    modal.addEventListener('click', e => {
      if (e.target === modal) closeVendorSlugQrModal();
    });
  }

  // Live update QR when typing
  if (slugInput) {
    slugInput.addEventListener('input', () => {
      let slug = slugInput.value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
      const fullUrl = `${window.location.origin}/${slug || 'pilihan'}`;
      if (urlBadge) urlBadge.textContent = fullUrl;
      if (qrImg) {
        qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(fullUrl)}`;
      }
    });
  }

  // Copy URL
  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      const slug = slugInput.value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-') || currentSlugTargetVendor?.slug || currentSlugTargetVendor?.id.toLowerCase();
      const fullUrl = `${window.location.origin}/${slug}`;
      try {
        await navigator.clipboard.writeText(fullUrl);
        copyBtn.textContent = '✓ Disalin!';
        setTimeout(() => { copyBtn.textContent = '📋 Salin Pautan'; }, 2000);
      } catch {
        prompt('Salin pautan slug peniaga:', fullUrl);
      }
    });
  }

  // Open URL
  if (openBtn) {
    openBtn.addEventListener('click', () => {
      const slug = slugInput.value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-') || currentSlugTargetVendor?.slug || currentSlugTargetVendor?.id.toLowerCase();
      window.open(`/${slug}`, '_blank');
    });
  }

  // Print Standee QR
  if (printBtn) {
    printBtn.addEventListener('click', () => {
      if (!currentSlugTargetVendor) return;
      const slug = slugInput.value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-') || currentSlugTargetVendor.slug || currentSlugTargetVendor.id.toLowerCase();
      const fullUrl = `${window.location.origin}/${slug}`;
      const qrCodeSrc = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(fullUrl)}`;

      const printWin = window.open('', '_blank', 'width=750,height=900');
      if (!printWin) {
        alert('Sila benarkan popup untuk mencetak standee.');
        return;
      }

      printWin.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Standee QR Gerai — ${esc(currentSlugTargetVendor.name)}</title>
          <style>
            @page { size: A4 portrait; margin: 15mm; }
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; text-align: center; color: #1e293b; margin: 0; padding: 20px; }
            .card { border: 3px solid #116850; border-radius: 24px; padding: 36px 24px; max-width: 520px; margin: 0 auto; box-shadow: 0 10px 30px rgba(0,0,0,0.06); }
            .event-badge { display: inline-block; background: #eef6f3; color: #116850; font-weight: 800; font-size: 14px; padding: 6px 16px; border-radius: 999px; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 16px; border: 1px solid #c2e2d5; }
            .booth-pill { display: inline-block; background: #f7a93b; color: #351c00; font-weight: 900; font-size: 16px; padding: 4px 14px; border-radius: 8px; margin-bottom: 12px; }
            h1 { margin: 0 0 8px; font-size: 28px; font-weight: 900; color: #0b4937; letter-spacing: -0.5px; }
            .menu { font-size: 15px; color: #64748b; margin: 0 0 24px; font-weight: 600; line-height: 1.4; }
            .qr-frame { background: white; border: 2px dashed #116850; border-radius: 20px; padding: 18px; display: inline-block; margin-bottom: 20px; box-shadow: 0 4px 16px rgba(0,0,0,0.05); }
            .qr-frame img { width: 260px; height: 260px; display: block; border-radius: 12px; }
            .cta { font-size: 18px; font-weight: 800; color: #116850; margin-bottom: 6px; }
            .cta-sub { font-size: 13.5px; color: #64748b; margin-bottom: 20px; line-height: 1.4; max-width: 400px; margin-left: auto; margin-right: auto; }
            .url-box { font-family: monospace; font-size: 14px; font-weight: 700; color: #0b4937; background: #f1f5f9; padding: 8px 14px; border-radius: 8px; display: inline-block; }
            .footer { margin-top: 24px; font-size: 11px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; }
            @media print { .no-print { display: none !important; } }
          </style>
        </head>
        <body>
          <div class="no-print" style="margin-bottom: 20px;">
            <button onclick="window.print()" style="background:#116850;color:white;border:none;padding:10px 20px;font-size:15px;font-weight:700;border-radius:10px;cursor:pointer;">🖨️ Cetak Standee Sekarang</button>
            <button onclick="window.close()" style="margin-left:8px;background:#e2e8f0;border:none;padding:10px 16px;font-size:15px;font-weight:700;border-radius:10px;cursor:pointer;">Tutup</button>
          </div>
          <div class="card">
            <div class="event-badge">Pasar Malam KPMBP Rasmi</div>
            <br>
            <div class="booth-pill">NO. GERAI: ${esc(currentSlugTargetVendor.id)}</div>
            <h1>${esc(currentSlugTargetVendor.name)}</h1>
            <p class="menu">${esc(currentSlugTargetVendor.menu || 'Pilihan Makanan & Minuman Istimewa')}</p>
            <div class="qr-frame">
              <img src="${qrCodeSrc}" alt="Kod QR Gerai">
            </div>
            <div class="cta">📱 IMBAS &amp; UNDI GERAI KAMI</div>
            <p class="cta-sub">Buka kamera telefon anda untuk terus mengundi gerai ini dalam sistem VendorVote!</p>
            <div class="url-box">${esc(fullUrl)}</div>
            <div class="footer">VendorVote KPMBP · Dikuasakan oleh Urus Setia Pasar Malam</div>
          </div>
        </body>
        </html>
      `);
      printWin.document.close();
    });
  }

  // Save slug
  if (form) {
    form.addEventListener('submit', async e => {
      e.preventDefault();
      if (!isAdminModeActive()) {
        openPinModal();
        return;
      }
      const vendorId = $('vendorSlugTargetId').value;
      let slug = slugInput.value.trim().toLowerCase();
      slug = slug.replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');

      if (!slug) {
        msg.textContent = 'Sila masukkan slug yang sah (huruf kecil, nombor, tanda sempang).';
        msg.style.color = '#b42318';
        return;
      }

      msg.textContent = 'Menyimpan slug peniaga...';
      msg.style.color = 'var(--muted)';

      try {
        const res = await fetch('/api/admin-manage', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...getAdminAuthHeaders()
          },
          body: JSON.stringify({
            action: 'update_vendor_slug',
            vendorId,
            slug
          })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Gagal mengemas kini slug.');

        msg.textContent = `✓ Berjaya! Pautan peniaga kini di /${slug}`;
        msg.style.color = 'var(--green)';

        const fullUrl = `${window.location.origin}/${slug}`;
        if (urlBadge) urlBadge.textContent = fullUrl;
        if (qrImg) {
          qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(fullUrl)}`;
        }

        setTimeout(() => {
          load();
        }, 600);
      } catch (err) {
        msg.textContent = err.message;
        msg.style.color = '#b42318';
      }
    });
  }
}

// Inisialisasi
setupAdminModeEvents();
applyAdminModeUI();
setupCsvHandlers();
setupVendorImageHandlers();
setupVendorSlugQrHandlers();
load();

