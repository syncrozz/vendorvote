import { db } from './db.js';
import { toCSV } from './csv-utils.js';

export const access = 'admin';
export const methods = ['GET'];

export default async function (req, res) {
  const { rows: vendors } = await db.query(
    'SELECT id, name, menu_description, phone, slug, active FROM vendors ORDER BY id'
  );

  const csvRows = vendors.map((v, index) => [
    index + 1,
    v.id,
    v.name,
    v.menu_description || '',
    v.phone || '',
    v.slug ? `/${v.slug}` : '',
    v.active ? 'Aktif' : 'Tidak Aktif'
  ]);

  const headers = ['Bil', 'ID', 'Nama Peniaga', 'Menu', 'No. Telefon', 'Pautan Slug QR', 'Status'];

  const csvContent = '\uFEFF' + toCSV(csvRows, headers);

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="senarai_peniaga_kpmbp_${new Date().toISOString().slice(0, 10)}.csv"`
  );
  return res.send(csvContent);
}
