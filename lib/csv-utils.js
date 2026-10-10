// CSV parser and generator adhering to RFC 4180
export function parseCSV(text) {
  const lines = [];
  let row = [];
  let entry = '';
  let insideQuote = false;

  const cleanText = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  for (let i = 0; i < cleanText.length; i++) {
    const char = cleanText[i];
    const nextChar = cleanText[i + 1];

    if (char === '"') {
      if (insideQuote && nextChar === '"') {
        entry += '"';
        i++; // skip escaped quote
      } else {
        insideQuote = !insideQuote;
      }
    } else if (char === ',' && !insideQuote) {
      row.push(entry.trim());
      entry = '';
    } else if (char === '\n' && !insideQuote) {
      row.push(entry.trim());
      if (row.some(cell => cell.length > 0)) {
        lines.push(row);
      }
      row = [];
      entry = '';
    } else {
      entry += char;
    }
  }

  if (entry.length > 0 || row.length > 0) {
    row.push(entry.trim());
    if (row.some(cell => cell.length > 0)) {
      lines.push(row);
    }
  }

  return lines;
}

export function toCSV(rows, headers = []) {
  const result = [];

  if (headers && headers.length > 0) {
    result.push(headers.map(escapeCSVCell).join(','));
  }

  for (const row of rows) {
    const cells = Array.isArray(row)
      ? row
      : headers.map(h => row[h.key || h]);
    result.push(cells.map(escapeCSVCell).join(','));
  }

  return result.join('\r\n');
}

function escapeCSVCell(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

export function parseVendorsCSV(csvText) {
  const rows = parseCSV(csvText);
  if (rows.length < 2) return [];

  const headerRow = rows[0].map(h => h.toLowerCase().trim());

  // Find column indices
  let idIdx = headerRow.findIndex(h => h === 'id' || h.includes('id peniaga'));
  let nameIdx = headerRow.findIndex(h => h.includes('nama') || h.includes('name') || h === 'peniaga');
  let menuIdx = headerRow.findIndex(h => h.includes('menu') || h.includes('jualan'));
  let phoneIdx = headerRow.findIndex(h => h.includes('telefon') || h.includes('phone') || h.includes('tel') || h.includes('no.'));

  // Fallback default index positions if headers match Bil, ID, Nama Peniaga, Menu, No. Telefon
  if (idIdx === -1) idIdx = 1;
  if (nameIdx === -1) nameIdx = 2;
  if (menuIdx === -1) menuIdx = 3;
  if (phoneIdx === -1) phoneIdx = 4;

  const vendors = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const id = (row[idIdx] || '').trim();
    const name = (row[nameIdx] || '').trim();
    const menu = menuIdx < row.length ? (row[menuIdx] || '').trim() : '';
    const phone = phoneIdx < row.length ? (row[phoneIdx] || '').trim() : '';

    if (name) {
      vendors.push({
        id: id || ('P' + String(i).padStart(3, '0')),
        name,
        menu_description: menu || 'Peniaga Pasar Malam KPMBP',
        phone,
        active: true
      });
    }
  }

  return vendors;
}

export function parseStudentsCSV(csvText) {
  const rows = parseCSV(csvText);
  if (rows.length < 1) return [];

  const firstRow = rows[0].map(h => (h || '').toLowerCase().trim());
  let hasHeader = false;
  let idIdx = firstRow.findIndex(h => h.includes('no_pelajar') || h.includes('pelajar') || h === 'id' || h === 'student_id');
  let nameIdx = firstRow.findIndex(h => h.includes('nama'));
  let classIdx = firstRow.findIndex(h => h.includes('kelas') || h.includes('class'));

  if (idIdx !== -1 || nameIdx !== -1 || classIdx !== -1) {
    hasHeader = true;
  } else if (firstRow.length >= 4 && /^\d+$/.test(firstRow[0])) {
    idIdx = 1;
    nameIdx = 2;
    classIdx = 3;
  } else if (firstRow.length >= 2) {
    idIdx = 0;
    nameIdx = 1;
    classIdx = 2;
  } else {
    idIdx = 0;
  }

  const startIdx = hasHeader ? 1 : 0;
  const students = [];

  for (let i = startIdx; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row.length) continue;
    const id = (row[idIdx >= 0 ? idIdx : 0] || '').trim().toUpperCase();
    const name = nameIdx >= 0 && nameIdx < row.length ? row[nameIdx].trim() : '';
    const className = classIdx >= 0 && classIdx < row.length ? row[classIdx].trim() : '';

    if (id && /^[A-Z0-9-]{5,32}$/.test(id)) {
      students.push({
        id,
        name: name || 'Pelajar KPMBP',
        className: className || '-'
      });
    }
  }

  return students;
}
