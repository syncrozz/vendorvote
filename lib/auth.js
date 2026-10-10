// Server-side Admin Authorization for VendorVote
export const ADMIN_PIN = '5313';

export function verifyAdminAuth(req) {
  const secret = process.env.ADMIN_SECRET;
  const pin = ADMIN_PIN;

  const authHeader = req.headers?.['authorization'] || '';
  let queryPin = req.query?.pin;
  let queryKey = req.query?.key;
  if ((!queryPin || !queryKey) && req.url && req.url.includes('?')) {
    try {
      const u = new URL(req.url, 'http://localhost');
      if (!queryPin) queryPin = u.searchParams.get('pin');
      if (!queryKey) queryKey = u.searchParams.get('key');
    } catch (_) {}
  }
  const adminKey = req.headers?.['x-admin-key'] || queryKey || queryPin;
  const adminPin = req.headers?.['x-admin-pin'] || queryPin;

  // 1. Check valid Admin PIN
  if (adminPin === pin || adminKey === pin || authHeader === `Bearer ${pin}`) {
    return {
      ok: true,
      member: {
        email: process.env.ADMIN_EMAIL || 'admin@kpmbp.edu.my',
        role: 'admin'
      }
    };
  }

  // 2. Check ADMIN_SECRET if configured in environment
  if (secret && (adminKey === secret || authHeader === `Bearer ${secret}`)) {
    return {
      ok: true,
      member: {
        email: process.env.ADMIN_EMAIL || 'admin@kpmbp.edu.my',
        role: 'admin'
      }
    };
  }

  return {
    ok: false,
    error: 'Akses ditolak. Sila masukkan PIN keselamatan pentadbir yang sah.'
  };
}

export function requireAdmin(req, res, next) {
  const auth = verifyAdminAuth(req);
  if (!auth.ok) {
    res.status(403).json({ error: auth.error });
    return false;
  }
  req.member = auth.member;
  if (typeof next === 'function') {
    next();
  }
  return true;
}
