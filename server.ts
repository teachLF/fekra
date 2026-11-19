import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import multer from 'multer';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { db, initDatabase, UPLOADS_DIR } from './server/db.ts';
import type { UserRole } from './src/types.ts';

initDatabase();

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '25mb' }));
app.use(cookieParser());

// Configure Multer for protected uploads
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeName = `${crypto.randomUUID()}${ext}`;
    cb(null, safeName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 250 * 1024 * 1024 }, // 250MB max
});

interface AuthUser {
  id: number;
  username: string;
  full_name: string;
  role: UserRole;
  grade_id: number | null;
  grade_name: string | null;
  points: number;
  is_active: number;
  created_at: string;
}

interface AuthedRequest extends Request {
  user?: AuthUser;
  sessionToken?: string;
}

function extractToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  const headerToken = req.headers['x-session-token'];
  if (typeof headerToken === 'string' && headerToken.trim()) {
    return headerToken.trim();
  }
  if (req.cookies && typeof req.cookies.sid === 'string' && req.cookies.sid.trim()) {
    return req.cookies.sid.trim();
  }
  if (typeof req.query.token === 'string' && req.query.token.trim()) {
    return req.query.token.trim();
  }
  return null;
}

function getUserByToken(token: string | null): AuthUser | null {
  if (!token) return null;
  const row = db
    .prepare(
      `SELECT u.id, u.username, u.full_name, u.role, u.grade_id, g.name as grade_name, u.points, u.is_active, u.created_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       LEFT JOIN grades g ON g.id = u.grade_id
       WHERE s.token = ? AND datetime(s.expires_at) > datetime('now') AND u.is_active = 1`
    )
    .get(token) as AuthUser | undefined;
  return row ?? null;
}

function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const token = extractToken(req);
  const user = getUserByToken(token);
  if (!user) {
    res.status(401).json({ error: 'يرجى تسجيل الدخول أولاً' });
    return;
  }
  req.user = user;
  req.sessionToken = token ?? undefined;
  next();
}

function requireRoles(...roles: UserRole[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ error: 'ليس لديك صلاحية للوصول إلى هذا القسم' });
      return;
    }
    next();
  };
}

const PRIVATE_SETTING_KEYS = new Set([
  'external_api_key',
  'remote_sync_url',
  'remote_sync_api_key',
  'webhook_url',
  'auto_sync_enabled',
]);

function getSettingValue(key: string, fallback = ''): string {
  const row = db.prepare('SELECT value FROM site_settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined;
  return row ? row.value : fallback;
}

function setSettingValue(key: string, value: string) {
  db.prepare(
    `INSERT INTO site_settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(key, value);
}

function logSync(direction: string, status: string, summary: string) {
  db.prepare('INSERT INTO sync_logs (direction, status, summary) VALUES (?, ?, ?)').run(
    direction,
    status,
    summary
  );
}

async function dispatchUserWebhook(event: 'user.created' | 'user.updated' | 'user.deleted', payload: unknown) {
  const enabled = getSettingValue('auto_sync_enabled', '0') === '1';
  const webhookUrl = getSettingValue('webhook_url', '').trim();
  if (!enabled || !webhookUrl) return;

  const remoteKey = getSettingValue('remote_sync_api_key', '').trim();
  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(remoteKey ? { 'X-API-Key': remoteKey, Authorization: `Bearer ${remoteKey}` } : {}),
      },
      body: JSON.stringify({ event, source: 'fekra-platform', timestamp: new Date().toISOString(), user: payload }),
    });
    logSync('webhook', res.ok ? 'success' : 'error', `إشعار (${event}) -> HTTP ${res.status}`);
  } catch (err) {
    logSync('webhook', 'error', `فشل إرسال إشعار (${event}): ${(err as Error).message}`);
  }
}

function getAllSettings(): Record<string, string | number> {
  const rows = db.prepare('SELECT key, value FROM site_settings').all() as Array<{
    key: string;
    value: string;
  }>;
  const result: Record<string, string | number> = {};
  for (const row of rows) {
    if (PRIVATE_SETTING_KEYS.has(row.key)) continue;
    if (
      row.key === 'announcement_enabled' ||
      row.key === 'hero_interval_ms' ||
      row.key === 'anti_capture_enabled'
    ) {
      result[row.key] = Number(row.value);
    } else {
      result[row.key] = row.value;
    }
  }
  return result;
}

// ==========================================
// PUBLIC BRANDING & AUTH ROUTES
// ==========================================

app.get('/api/public/branding', (_req, res) => {
  const settings = getAllSettings();
  res.json({
    site_name: settings.site_name,
    logo_url: settings.logo_url,
    primary_color: settings.primary_color,
    accent_color: settings.accent_color,
    login_title: settings.login_title,
    login_subtitle: settings.login_subtitle,
    protection_message: settings.protection_message,
    anti_capture_enabled: settings.anti_capture_enabled,
    footer_text: settings.footer_text,
  });
});

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body ?? {};
  if (typeof username !== 'string' || typeof password !== 'string' || !username.trim() || !password) {
    res.status(400).json({ error: 'يرجى إدخال الاسم وكلمة السر' });
    return;
  }

  const cleanUsername = username.trim();
  const userRow = db
    .prepare(
      `SELECT u.*, g.name as grade_name
       FROM users u
       LEFT JOIN grades g ON g.id = u.grade_id
       WHERE u.username = ?`
    )
    .get(cleanUsername) as (AuthUser & { password_hash: string }) | undefined;

  if (!userRow || !bcrypt.compareSync(password, userRow.password_hash)) {
    res.status(401).json({ error: 'الاسم أو كلمة السر غير صحيحة' });
    return;
  }

  if (!userRow.is_active) {
    res.status(403).json({ error: 'تم إيقاف هذا الحساب من قبل إدارة المنصة' });
    return;
  }

  const token = crypto.randomBytes(32).toString('hex');
  db.prepare(`INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, datetime('now', '+7 days'))`).run(
    token,
    userRow.id
  );

  res.cookie('sid', token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });

  const { password_hash: _ignored, ...safeUser } = userRow;
  res.json({ token, user: safeUser });
});

app.post('/api/auth/logout', (req: AuthedRequest, res) => {
  const token = extractToken(req);
  if (token) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  }
  res.clearCookie('sid', { path: '/' });
  res.json({ ok: true });
});

app.get('/api/auth/me', requireAuth, (req: AuthedRequest, res) => {
  res.json({ user: req.user });
});

// ==========================================
// SITE SETTINGS & HERO SLIDES & GRADES
// ==========================================

app.get('/api/bootstrap', requireAuth, (req: AuthedRequest, res) => {
  const user = req.user!;
  const settings = getAllSettings();
  const grades = db.prepare('SELECT * FROM grades ORDER BY sort_order ASC, id ASC').all();
  const heroSlides = db
    .prepare(
      user.role === 'student'
        ? 'SELECT * FROM hero_slides WHERE is_active = 1 ORDER BY sort_order ASC, id ASC'
        : 'SELECT * FROM hero_slides ORDER BY sort_order ASC, id ASC'
    )
    .all();

  let myGrade = null;
  if (user.grade_id) {
    myGrade = db.prepare('SELECT * FROM grades WHERE id = ?').get(user.grade_id) ?? null;
  }

  res.json({
    user,
    settings,
    grades,
    myGrade,
    heroSlides,
  });
});

app.put('/api/settings', requireAuth, requireRoles('admin'), (req: AuthedRequest, res) => {
  const allowedKeys = [
    'site_name',
    'logo_url',
    'primary_color',
    'accent_color',
    'welcome_heading',
    'welcome_subheading',
    'announcement_text',
    'announcement_enabled',
    'footer_text',
    'hero_interval_ms',
    'login_title',
    'login_subtitle',
    'protection_message',
    'anti_capture_enabled',
  ];

  const upsert = db.prepare(
    `INSERT INTO site_settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  );

  const body = req.body ?? {};
  const tx = db.transaction(() => {
    for (const key of allowedKeys) {
      if (body[key] !== undefined && body[key] !== null) {
        upsert.run(key, String(body[key]));
      }
    }
  });
  tx();

  res.json({ settings: getAllSettings() });
});

// Grades CRUD (Admin only for mutations)
app.get('/api/grades', requireAuth, (_req, res) => {
  const grades = db.prepare('SELECT * FROM grades ORDER BY sort_order ASC, id ASC').all();
  res.json({ grades });
});

app.post('/api/grades', requireAuth, requireRoles('admin'), (req, res) => {
  const { name, sort_order, banner_image, banner_title, banner_subtitle } = req.body ?? {};
  if (!name || typeof name !== 'string' || !name.trim()) {
    res.status(400).json({ error: 'اسم الصف مطلوب' });
    return;
  }
  try {
    const info = db
      .prepare(
        `INSERT INTO grades (name, sort_order, banner_image, banner_title, banner_subtitle)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(
        name.trim(),
        Number(sort_order) || 99,
        banner_image || '/src/assets/images/grade_banner_default_1795021613504.jpg',
        banner_title || `بوابة الصف ${name.trim()}`,
        banner_subtitle || `الدروس والاختبارات المخصصة لطلاب ${name.trim()}`
      );
    const grade = db.prepare('SELECT * FROM grades WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json({ grade });
  } catch {
    res.status(409).json({ error: 'اسم الصف موجود مسبقاً' });
  }
});

app.put('/api/grades/:id', requireAuth, requireRoles('admin'), (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM grades WHERE id = ?').get(id);
  if (!existing) {
    res.status(404).json({ error: 'الصف غير موجود' });
    return;
  }
  const { name, sort_order, banner_image, banner_title, banner_subtitle } = req.body ?? {};
  try {
    db.prepare(
      `UPDATE grades
       SET name = COALESCE(?, name),
           sort_order = COALESCE(?, sort_order),
           banner_image = COALESCE(?, banner_image),
           banner_title = COALESCE(?, banner_title),
           banner_subtitle = COALESCE(?, banner_subtitle)
       WHERE id = ?`
    ).run(
      name ? String(name).trim() : null,
      sort_order !== undefined ? Number(sort_order) : null,
      banner_image ?? null,
      banner_title ?? null,
      banner_subtitle ?? null,
      id
    );
    const grade = db.prepare('SELECT * FROM grades WHERE id = ?').get(id);
    res.json({ grade });
  } catch {
    res.status(409).json({ error: 'تعارض في اسم الصف' });
  }
});

app.delete('/api/grades/:id', requireAuth, requireRoles('admin'), (req, res) => {
  const id = Number(req.params.id);
  db.prepare('DELETE FROM grades WHERE id = ?').run(id);
  res.json({ ok: true });
});

// Hero Rotating Banner Slides (Admin only)
app.get('/api/hero-slides', requireAuth, (_req, res) => {
  const slides = db.prepare('SELECT * FROM hero_slides ORDER BY sort_order ASC, id ASC').all();
  res.json({ slides });
});

app.post('/api/hero-slides', requireAuth, requireRoles('admin'), (req, res) => {
  const { image_url, title, subtitle, link_section, sort_order, is_active } = req.body ?? {};
  if (!image_url) {
    res.status(400).json({ error: 'صورة البانر مطلوبة' });
    return;
  }
  const info = db
    .prepare(
      `INSERT INTO hero_slides (image_url, title, subtitle, link_section, sort_order, is_active)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      image_url,
      title || '',
      subtitle || '',
      link_section || 'videos',
      Number(sort_order) || 1,
      is_active !== undefined ? Number(is_active) : 1
    );
  const slide = db.prepare('SELECT * FROM hero_slides WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ slide });
});

app.put('/api/hero-slides/:id', requireAuth, requireRoles('admin'), (req, res) => {
  const id = Number(req.params.id);
  const { image_url, title, subtitle, link_section, sort_order, is_active } = req.body ?? {};
  db.prepare(
    `UPDATE hero_slides
     SET image_url = COALESCE(?, image_url),
         title = COALESCE(?, title),
         subtitle = COALESCE(?, subtitle),
         link_section = COALESCE(?, link_section),
         sort_order = COALESCE(?, sort_order),
         is_active = COALESCE(?, is_active)
     WHERE id = ?`
  ).run(
    image_url ?? null,
    title ?? null,
    subtitle ?? null,
    link_section ?? null,
    sort_order !== undefined ? Number(sort_order) : null,
    is_active !== undefined ? Number(is_active) : null,
    id
  );
  const slide = db.prepare('SELECT * FROM hero_slides WHERE id = ?').get(id);
  res.json({ slide });
});

app.delete('/api/hero-slides/:id', requireAuth, requireRoles('admin'), (req, res) => {
  const id = Number(req.params.id);
  db.prepare('DELETE FROM hero_slides WHERE id = ?').run(id);
  res.json({ ok: true });
});

// ==========================================
// USER MANAGEMENT (ADMIN CREATES STUDENTS & SUPERVISORS)
// ==========================================

app.get('/api/users', requireAuth, requireRoles('admin', 'supervisor'), (req: AuthedRequest, res) => {
  const users = db
    .prepare(
      `SELECT u.id, u.username, u.full_name, u.role, u.grade_id, g.name as grade_name, u.points, u.is_active, u.created_at
       FROM users u
       LEFT JOIN grades g ON g.id = u.grade_id
       ORDER BY CASE u.role WHEN 'admin' THEN 0 WHEN 'supervisor' THEN 1 ELSE 2 END, u.id DESC`
    )
    .all();
  res.json({ users });
});

app.post('/api/users', requireAuth, requireRoles('admin'), (req: AuthedRequest, res) => {
  const { username, password, full_name, role, grade_id } = req.body ?? {};
  if (!username || !password || !full_name || !role) {
    res.status(400).json({ error: 'يرجى تعبئة الاسم واسم الدخول وكلمة السر والرتبة' });
    return;
  }
  if (!['student', 'supervisor', 'admin'].includes(role)) {
    res.status(400).json({ error: 'نوع الحساب غير صالح' });
    return;
  }
  if (role === 'student' && !grade_id) {
    res.status(400).json({ error: 'يجب تحديد الصف الدراسي للطالب' });
    return;
  }

  const cleanUsername = String(username).trim();
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(cleanUsername);
  if (existing) {
    res.status(409).json({ error: 'اسم الدخول مستخدم بالفعل، اختر اسماً آخر' });
    return;
  }

  const hash = bcrypt.hashSync(String(password), 10);
  const info = db
    .prepare(
      `INSERT INTO users (username, password_hash, full_name, role, grade_id, points, is_active)
       VALUES (?, ?, ?, ?, ?, 0, 1)`
    )
    .run(cleanUsername, hash, String(full_name).trim(), role, role === 'student' ? Number(grade_id) : null);

  const created = db
    .prepare(
      `SELECT u.id, u.username, u.full_name, u.role, u.grade_id, g.name as grade_name, u.points, u.is_active, u.created_at
       FROM users u LEFT JOIN grades g ON g.id = u.grade_id WHERE u.id = ?`
    )
    .get(info.lastInsertRowid);
  void dispatchUserWebhook('user.created', created);
  res.status(201).json({ user: created });
});

app.put('/api/users/:id', requireAuth, requireRoles('admin'), (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as
    | { id: number; username: string; role: UserRole }
    | undefined;
  if (!target) {
    res.status(404).json({ error: 'المستخدم غير موجود' });
    return;
  }

  const { username, password, full_name, role, grade_id, is_active } = req.body ?? {};

  if (target.username === 'fekra@n' && role && role !== 'admin') {
    res.status(400).json({ error: 'لا يمكن تغيير رتبة الأدمن الرئيسي' });
    return;
  }
  if (target.username === 'fekra@n' && is_active === 0) {
    res.status(400).json({ error: 'لا يمكن تعطيل حساب الأدمن الرئيسي' });
    return;
  }

  try {
    if (password && String(password).trim().length > 0) {
      const hash = bcrypt.hashSync(String(password), 10);
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, id);
    }

    const nextRole = role && ['admin', 'supervisor', 'student'].includes(role) ? role : target.role;
    db.prepare(
      `UPDATE users
       SET username = COALESCE(?, username),
           full_name = COALESCE(?, full_name),
           role = ?,
           grade_id = ?,
           is_active = COALESCE(?, is_active)
       WHERE id = ?`
    ).run(
      username ? String(username).trim() : null,
      full_name ? String(full_name).trim() : null,
      nextRole,
      nextRole === 'student' ? (grade_id ? Number(grade_id) : null) : null,
      is_active !== undefined ? Number(is_active) : null,
      id
    );

    const updated = db
      .prepare(
        `SELECT u.id, u.username, u.full_name, u.role, u.grade_id, g.name as grade_name, u.points, u.is_active, u.created_at
         FROM users u LEFT JOIN grades g ON g.id = u.grade_id WHERE u.id = ?`
      )
      .get(id);
    void dispatchUserWebhook('user.updated', updated);
    res.json({ user: updated });
  } catch {
    res.status(409).json({ error: 'اسم الدخول مستخدم لحساب آخر' });
  }
});

app.delete('/api/users/:id', requireAuth, requireRoles('admin'), (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as
    | { id: number; username: string; full_name: string; role: UserRole }
    | undefined;
  if (!target) {
    res.status(404).json({ error: 'الحساب غير موجود' });
    return;
  }
  if (target.username === 'fekra@n' || target.id === req.user!.id) {
    res.status(400).json({ error: 'لا يمكن حذف حساب الأدمن الأساسي' });
    return;
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  void dispatchUserWebhook('user.deleted', { id: target.id, username: target.username, role: target.role });
  res.json({ ok: true });
});

// ==========================================
// PROTECTED FILE UPLOADS & STREAMING
// ==========================================

app.post(
  '/api/upload',
  requireAuth,
  requireRoles('admin', 'supervisor'),
  upload.single('file'),
  (req: AuthedRequest, res) => {
    if (!req.file) {
      res.status(400).json({ error: 'لم يتم إرفاق أي ملف' });
      return;
    }
    const kind = String(req.body?.kind || 'image');
    const filename = req.file.filename;
    let url = `/api/media/image/${filename}`;
    if (kind === 'video') {
      url = filename; // stored as internal filename in videos table
    } else if (kind === 'pdf') {
      url = filename; // stored as internal filename in pdfs table
    }
    res.json({
      filename,
      url,
      originalName: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype,
    });
  }
);

// Serve uploaded images (logos, banners) cleanly inline without download disposition
app.get('/api/media/image/:filename', (req, res) => {
  const safeName = path.basename(req.params.filename);
  const filePath = path.join(UPLOADS_DIR, safeName);
  if (!fs.existsSync(filePath)) {
    res.status(404).end();
    return;
  }
  res.setHeader('Content-Disposition', 'inline');
  res.setHeader('Cache-Control', 'no-store, private');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.sendFile(filePath);
});

// Protected video streaming with Range support & grade verification
app.get('/api/media/video/:id', requireAuth, (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const video = db.prepare('SELECT * FROM videos WHERE id = ?').get(id) as
    | { id: number; grade_id: number; source_type: string; media_path: string }
    | undefined;

  if (!video || video.source_type !== 'upload') {
    res.status(404).end();
    return;
  }

  if (req.user!.role === 'student' && req.user!.grade_id !== video.grade_id) {
    res.status(403).json({ error: 'هذا الفيديو غير مخصص لصفك الدراسي' });
    return;
  }

  const safeName = path.basename(video.media_path);
  const filePath = path.join(UPLOADS_DIR, safeName);
  if (!fs.existsSync(filePath)) {
    res.status(404).end();
    return;
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const ext = path.extname(filePath).toLowerCase();
  const mimeMap: Record<string, string> = {
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.ogg': 'video/ogg',
    '.mov': 'video/quicktime',
  };
  const contentType = mimeMap[ext] || 'video/mp4';
  const range = req.headers.range;

  res.setHeader('Content-Disposition', 'inline');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunkSize = end - start + 1;
    const file = fs.createReadStream(filePath, { start, end });
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': contentType,
    });
    file.pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Content-Type': contentType,
    });
    fs.createReadStream(filePath).pipe(res);
  }
});

// Protected PDF byte stream for canvas-based pdfjs rendering (never triggers browser download)
app.get('/api/media/pdf/:id', requireAuth, (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const pdf = db.prepare('SELECT * FROM pdfs WHERE id = ?').get(id) as
    | { id: number; grade_id: number; source_type: string; file_path: string }
    | undefined;

  if (!pdf || pdf.source_type !== 'upload') {
    res.status(404).end();
    return;
  }

  if (req.user!.role === 'student' && req.user!.grade_id !== pdf.grade_id) {
    res.status(403).json({ error: 'هذا الملف غير مخصص لصفك الدراسي' });
    return;
  }

  const safeName = path.basename(pdf.file_path);
  const filePath = path.join(UPLOADS_DIR, safeName);
  if (!fs.existsSync(filePath)) {
    res.status(404).end();
    return;
  }

  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', 'inline');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  fs.createReadStream(filePath).pipe(res);
});

// ==========================================
// VIDEOS CRUD & VIEW TRACKING
// ==========================================

app.get('/api/videos', requireAuth, (req: AuthedRequest, res) => {
  const user = req.user!;
  if (user.role === 'student') {
    const videos = db
      .prepare(
        `SELECT v.id, v.grade_id, g.name as grade_name, v.title, v.description,
                v.source_type,
                CASE WHEN v.source_type = 'upload' THEN ('/api/media/video/' || v.id) ELSE v.media_path END as media_path,
                v.thumbnail_url, v.duration_label, v.sort_order, v.created_at,
                CASE WHEN vv.id IS NOT NULL THEN 1 ELSE 0 END as watched
         FROM videos v
         JOIN grades g ON g.id = v.grade_id
         LEFT JOIN video_views vv ON vv.video_id = v.id AND vv.user_id = ?
         WHERE v.grade_id = ?
         ORDER BY v.sort_order ASC, v.id DESC`
      )
      .all(user.id, user.grade_id ?? -1);
    res.json({ videos });
    return;
  }

  const videos = db
    .prepare(
      `SELECT v.id, v.grade_id, g.name as grade_name, v.title, v.description,
              v.source_type,
              CASE WHEN v.source_type = 'upload' THEN ('/api/media/video/' || v.id) ELSE v.media_path END as media_path,
              v.thumbnail_url, v.duration_label, v.sort_order, v.created_at,
              COUNT(DISTINCT vv.user_id) as unique_viewers,
              COALESCE(SUM(vv.view_count), 0) as total_views
       FROM videos v
       JOIN grades g ON g.id = v.grade_id
       LEFT JOIN video_views vv ON vv.video_id = v.id
       GROUP BY v.id
       ORDER BY v.sort_order ASC, v.id DESC`
    )
    .all();
  res.json({ videos });
});

app.post('/api/videos', requireAuth, requireRoles('admin', 'supervisor'), (req: AuthedRequest, res) => {
  const { grade_id, title, description, source_type, media_path, thumbnail_url, duration_label, sort_order } =
    req.body ?? {};
  if (!grade_id || !title || !media_path) {
    res.status(400).json({ error: 'يرجى تحديد الصف وعنوان الفيديو ومصدره' });
    return;
  }
  const type = source_type === 'upload' ? 'upload' : 'url';
  const info = db
    .prepare(
      `INSERT INTO videos (grade_id, title, description, source_type, media_path, thumbnail_url, duration_label, sort_order, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      Number(grade_id),
      String(title).trim(),
      description ? String(description).trim() : '',
      type,
      String(media_path).trim(),
      thumbnail_url ? String(thumbnail_url).trim() : '',
      duration_label ? String(duration_label).trim() : 'درس مرئي',
      Number(sort_order) || 0,
      req.user!.id
    );
  const video = db.prepare('SELECT * FROM videos WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ video });
});

app.put('/api/videos/:id', requireAuth, requireRoles('admin', 'supervisor'), (req, res) => {
  const id = Number(req.params.id);
  const { grade_id, title, description, source_type, media_path, thumbnail_url, duration_label, sort_order } =
    req.body ?? {};
  db.prepare(
    `UPDATE videos
     SET grade_id = COALESCE(?, grade_id),
         title = COALESCE(?, title),
         description = COALESCE(?, description),
         source_type = COALESCE(?, source_type),
         media_path = COALESCE(?, media_path),
         thumbnail_url = COALESCE(?, thumbnail_url),
         duration_label = COALESCE(?, duration_label),
         sort_order = COALESCE(?, sort_order)
     WHERE id = ?`
  ).run(
    grade_id ? Number(grade_id) : null,
    title ? String(title).trim() : null,
    description ?? null,
    source_type ?? null,
    media_path ?? null,
    thumbnail_url ?? null,
    duration_label ?? null,
    sort_order !== undefined ? Number(sort_order) : null,
    id
  );
  res.json({ ok: true });
});

app.delete('/api/videos/:id', requireAuth, requireRoles('admin', 'supervisor'), (req, res) => {
  const id = Number(req.params.id);
  db.prepare('DELETE FROM videos WHERE id = ?').run(id);
  res.json({ ok: true });
});

app.post('/api/videos/:id/view', requireAuth, (req: AuthedRequest, res) => {
  const videoId = Number(req.params.id);
  const user = req.user!;
  const video = db.prepare('SELECT id, grade_id FROM videos WHERE id = ?').get(videoId) as
    | { id: number; grade_id: number }
    | undefined;
  if (!video) {
    res.status(404).json({ error: 'الفيديو غير موجود' });
    return;
  }
  if (user.role === 'student' && user.grade_id !== video.grade_id) {
    res.status(403).json({ error: 'غير مصرح لك بمشاهدة هذا الفيديو' });
    return;
  }

  const existing = db
    .prepare('SELECT id FROM video_views WHERE video_id = ? AND user_id = ?')
    .get(videoId, user.id);

  if (existing) {
    db.prepare(
      `UPDATE video_views SET view_count = view_count + 1, last_watched_at = datetime('now')
       WHERE video_id = ? AND user_id = ?`
    ).run(videoId, user.id);
  } else {
    db.prepare(`INSERT INTO video_views (video_id, user_id, view_count) VALUES (?, ?, 1)`).run(
      videoId,
      user.id
    );
    if (user.role === 'student') {
      db.prepare('UPDATE users SET points = points + 15 WHERE id = ?').run(user.id);
    }
  }
  res.json({ ok: true, firstWatchBonus: !existing && user.role === 'student' ? 15 : 0 });
});

// ==========================================
// PDFs CRUD & VIEW TRACKING
// ==========================================

app.get('/api/pdfs', requireAuth, (req: AuthedRequest, res) => {
  const user = req.user!;
  if (user.role === 'student') {
    const pdfs = db
      .prepare(
        `SELECT p.id, p.grade_id, g.name as grade_name, p.title, p.description,
                p.source_type,
                CASE WHEN p.source_type = 'upload' THEN ('/api/media/pdf/' || p.id) ELSE p.file_path END as file_path,
                p.created_at,
                CASE WHEN pv.id IS NOT NULL THEN 1 ELSE 0 END as viewed
         FROM pdfs p
         JOIN grades g ON g.id = p.grade_id
         LEFT JOIN pdf_views pv ON pv.pdf_id = p.id AND pv.user_id = ?
         WHERE p.grade_id = ?
         ORDER BY p.id DESC`
      )
      .all(user.id, user.grade_id ?? -1);
    res.json({ pdfs });
    return;
  }

  const pdfs = db
    .prepare(
      `SELECT p.id, p.grade_id, g.name as grade_name, p.title, p.description,
              p.source_type,
              CASE WHEN p.source_type = 'upload' THEN ('/api/media/pdf/' || p.id) ELSE p.file_path END as file_path,
              p.created_at,
              COUNT(DISTINCT pv.user_id) as unique_viewers,
              COALESCE(SUM(pv.view_count), 0) as total_views
       FROM pdfs p
       JOIN grades g ON g.id = p.grade_id
       LEFT JOIN pdf_views pv ON pv.pdf_id = p.id
       GROUP BY p.id
       ORDER BY p.id DESC`
    )
    .all();
  res.json({ pdfs });
});

app.post('/api/pdfs', requireAuth, requireRoles('admin', 'supervisor'), (req: AuthedRequest, res) => {
  const { grade_id, title, description, source_type, file_path } = req.body ?? {};
  if (!grade_id || !title || !file_path) {
    res.status(400).json({ error: 'يرجى تحديد الصف وعنوان الملف ومصدره' });
    return;
  }
  const type = source_type === 'upload' ? 'upload' : 'url';
  const info = db
    .prepare(
      `INSERT INTO pdfs (grade_id, title, description, source_type, file_path, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      Number(grade_id),
      String(title).trim(),
      description ? String(description).trim() : '',
      type,
      String(file_path).trim(),
      req.user!.id
    );
  const pdf = db.prepare('SELECT * FROM pdfs WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ pdf });
});

app.delete('/api/pdfs/:id', requireAuth, requireRoles('admin', 'supervisor'), (req, res) => {
  const id = Number(req.params.id);
  db.prepare('DELETE FROM pdfs WHERE id = ?').run(id);
  res.json({ ok: true });
});

app.post('/api/pdfs/:id/view', requireAuth, (req: AuthedRequest, res) => {
  const pdfId = Number(req.params.id);
  const user = req.user!;
  const existing = db.prepare('SELECT id FROM pdf_views WHERE pdf_id = ? AND user_id = ?').get(pdfId, user.id);
  if (existing) {
    db.prepare(
      `UPDATE pdf_views SET view_count = view_count + 1, last_viewed_at = datetime('now')
       WHERE pdf_id = ? AND user_id = ?`
    ).run(pdfId, user.id);
  } else {
    db.prepare(`INSERT INTO pdf_views (pdf_id, user_id, view_count) VALUES (?, ?, 1)`).run(pdfId, user.id);
    if (user.role === 'student') {
      db.prepare('UPDATE users SET points = points + 10 WHERE id = ?').run(user.id);
    }
  }
  res.json({ ok: true });
});

// ==========================================
// QUIZZES CRUD & GRADING ENGINE
// ==========================================

app.get('/api/quizzes', requireAuth, (req: AuthedRequest, res) => {
  const user = req.user!;
  if (user.role === 'student') {
    const quizzes = db
      .prepare(
        `SELECT q.id, q.grade_id, g.name as grade_name, q.title, q.description,
                q.time_limit_minutes, q.pass_percentage, q.is_published, q.created_at,
                (SELECT COUNT(*) FROM quiz_questions qq WHERE qq.quiz_id = q.id) as question_count
         FROM quizzes q
         JOIN grades g ON g.id = q.grade_id
         WHERE q.grade_id = ? AND q.is_published = 1
         ORDER BY q.id DESC`
      )
      .all(user.grade_id ?? -1) as Array<Record<string, unknown>>;

    const withAttempts = quizzes.map((q) => {
      const best = db
        .prepare(
          `SELECT score, total_questions, percentage, passed, completed_at
           FROM quiz_attempts
           WHERE quiz_id = ? AND user_id = ?
           ORDER BY percentage DESC, id DESC LIMIT 1`
        )
        .get(q.id, user.id);
      return { ...q, my_best_attempt: best ?? null };
    });

    res.json({ quizzes: withAttempts });
    return;
  }

  const quizzes = db
    .prepare(
      `SELECT q.id, q.grade_id, g.name as grade_name, q.title, q.description,
              q.time_limit_minutes, q.pass_percentage, q.is_published, q.created_at,
              (SELECT COUNT(*) FROM quiz_questions qq WHERE qq.quiz_id = q.id) as question_count,
              (SELECT COUNT(DISTINCT qa.user_id) FROM quiz_attempts qa WHERE qa.quiz_id = q.id) as unique_solvers,
              (SELECT COUNT(*) FROM quiz_attempts qa WHERE qa.quiz_id = q.id) as attempt_count
       FROM quizzes q
       JOIN grades g ON g.id = q.grade_id
       ORDER BY q.id DESC`
    )
    .all();
  res.json({ quizzes });
});

app.get('/api/quizzes/:id', requireAuth, (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const user = req.user!;
  const quiz = db
    .prepare(
      `SELECT q.*, g.name as grade_name
       FROM quizzes q JOIN grades g ON g.id = q.grade_id
       WHERE q.id = ?`
    )
    .get(id) as Record<string, unknown> | undefined;

  if (!quiz) {
    res.status(404).json({ error: 'الكويز غير موجود' });
    return;
  }

  if (user.role === 'student' && (quiz.grade_id !== user.grade_id || !quiz.is_published)) {
    res.status(403).json({ error: 'غير مصرح لك بدخول هذا الكويز' });
    return;
  }

  const rawQuestions = db
    .prepare('SELECT * FROM quiz_questions WHERE quiz_id = ? ORDER BY sort_order ASC, id ASC')
    .all(id) as Array<{
    id: number;
    quiz_id: number;
    question_text: string;
    options_json: string;
    correct_index: number;
    explanation: string;
    sort_order: number;
  }>;

  const questions = rawQuestions.map((q) => ({
    id: q.id,
    quiz_id: q.quiz_id,
    question_text: q.question_text,
    options: JSON.parse(q.options_json) as string[],
    // Never expose correct_index to students before submission!
    ...(user.role !== 'student' ? { correct_index: q.correct_index, explanation: q.explanation } : {}),
    sort_order: q.sort_order,
  }));

  res.json({ quiz: { ...quiz, questions } });
});

app.post('/api/quizzes', requireAuth, requireRoles('admin', 'supervisor'), (req: AuthedRequest, res) => {
  const { grade_id, title, description, time_limit_minutes, pass_percentage, is_published, questions } =
    req.body ?? {};
  if (!grade_id || !title || !Array.isArray(questions) || questions.length === 0) {
    res.status(400).json({ error: 'يرجى إدخال اسم الكويز وتحديد الصف وإضافة سؤال واحد على الأقل' });
    return;
  }

  const tx = db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO quizzes (grade_id, title, description, time_limit_minutes, pass_percentage, is_published, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        Number(grade_id),
        String(title).trim(),
        description ? String(description).trim() : '',
        Number(time_limit_minutes) || 10,
        Number(pass_percentage) || 60,
        is_published !== undefined ? Number(is_published) : 1,
        req.user!.id
      );
    const quizId = Number(info.lastInsertRowid);
    const insertQ = db.prepare(
      `INSERT INTO quiz_questions (quiz_id, question_text, options_json, correct_index, explanation, sort_order)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    questions.forEach((q: { question_text: string; options: string[]; correct_index: number; explanation?: string }, idx: number) => {
      insertQ.run(
        quizId,
        String(q.question_text).trim(),
        JSON.stringify(q.options.map((o) => String(o).trim())),
        Number(q.correct_index) || 0,
        q.explanation ? String(q.explanation).trim() : '',
        idx + 1
      );
    });
    return quizId;
  });

  const quizId = tx();
  res.status(201).json({ id: quizId });
});

app.put('/api/quizzes/:id', requireAuth, requireRoles('admin', 'supervisor'), (req, res) => {
  const id = Number(req.params.id);
  const { grade_id, title, description, time_limit_minutes, pass_percentage, is_published, questions } =
    req.body ?? {};

  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE quizzes
       SET grade_id = COALESCE(?, grade_id),
           title = COALESCE(?, title),
           description = COALESCE(?, description),
           time_limit_minutes = COALESCE(?, time_limit_minutes),
           pass_percentage = COALESCE(?, pass_percentage),
           is_published = COALESCE(?, is_published)
       WHERE id = ?`
    ).run(
      grade_id ? Number(grade_id) : null,
      title ? String(title).trim() : null,
      description ?? null,
      time_limit_minutes ? Number(time_limit_minutes) : null,
      pass_percentage !== undefined ? Number(pass_percentage) : null,
      is_published !== undefined ? Number(is_published) : null,
      id
    );

    if (Array.isArray(questions) && questions.length > 0) {
      db.prepare('DELETE FROM quiz_questions WHERE quiz_id = ?').run(id);
      const insertQ = db.prepare(
        `INSERT INTO quiz_questions (quiz_id, question_text, options_json, correct_index, explanation, sort_order)
         VALUES (?, ?, ?, ?, ?, ?)`
      );
      questions.forEach((q: { question_text: string; options: string[]; correct_index: number; explanation?: string }, idx: number) => {
        insertQ.run(
          id,
          String(q.question_text).trim(),
          JSON.stringify(q.options.map((o) => String(o).trim())),
          Number(q.correct_index) || 0,
          q.explanation ? String(q.explanation).trim() : '',
          idx + 1
        );
      });
    }
  });

  tx();
  res.json({ ok: true });
});

app.delete('/api/quizzes/:id', requireAuth, requireRoles('admin', 'supervisor'), (req, res) => {
  const id = Number(req.params.id);
  db.prepare('DELETE FROM quizzes WHERE id = ?').run(id);
  res.json({ ok: true });
});

app.post('/api/quizzes/:id/submit', requireAuth, (req: AuthedRequest, res) => {
  const quizId = Number(req.params.id);
  const user = req.user!;
  const quiz = db.prepare('SELECT * FROM quizzes WHERE id = ?').get(quizId) as
    | { id: number; grade_id: number; pass_percentage: number; title: string }
    | undefined;

  if (!quiz) {
    res.status(404).json({ error: 'الكويز غير موجود' });
    return;
  }
  if (user.role === 'student' && user.grade_id !== quiz.grade_id) {
    res.status(403).json({ error: 'هذا الكويز غير مخصص لصفك الدراسي' });
    return;
  }

  const questions = db
    .prepare('SELECT * FROM quiz_questions WHERE quiz_id = ? ORDER BY sort_order ASC, id ASC')
    .all(quizId) as Array<{
    id: number;
    question_text: string;
    options_json: string;
    correct_index: number;
    explanation: string;
  }>;

  const answers = (req.body?.answers ?? {}) as Record<string, number>;
  let score = 0;
  const breakdown = questions.map((q) => {
    const selected = answers[String(q.id)] ?? -1;
    const isCorrect = Number(selected) === q.correct_index;
    if (isCorrect) score++;
    return {
      question_id: q.id,
      question_text: q.question_text,
      options: JSON.parse(q.options_json) as string[],
      selected_index: Number(selected),
      correct_index: q.correct_index,
      is_correct: isCorrect,
      explanation: q.explanation,
    };
  });

  const total = questions.length;
  const percentage = total > 0 ? Math.round((score / total) * 100) : 0;
  const passed = percentage >= quiz.pass_percentage ? 1 : 0;

  const priorPass = db
    .prepare('SELECT id FROM quiz_attempts WHERE quiz_id = ? AND user_id = ? AND passed = 1')
    .get(quizId, user.id);

  db.prepare(
    `INSERT INTO quiz_attempts (quiz_id, user_id, score, total_questions, percentage, passed, answers_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(quizId, user.id, score, total, percentage, passed, JSON.stringify(answers));

  let pointsEarned = 0;
  if (user.role === 'student') {
    if (passed && !priorPass) {
      pointsEarned = 30 + Math.round(percentage / 5);
    } else if (!priorPass) {
      pointsEarned = 5;
    }
    if (pointsEarned > 0) {
      db.prepare('UPDATE users SET points = points + ? WHERE id = ?').run(pointsEarned, user.id);
    }
  }

  res.json({
    score,
    total_questions: total,
    percentage,
    passed: Boolean(passed),
    points_earned: pointsEarned,
    breakdown,
  });
});

// ==========================================
// PRIVATE ANALYTICS (ADMIN & SUPERVISORS ONLY!)
// ==========================================

app.get('/api/analytics', requireAuth, requireRoles('admin', 'supervisor'), (_req, res) => {
  const total_students = (
    db.prepare(`SELECT COUNT(*) as c FROM users WHERE role = 'student'`).get() as { c: number }
  ).c;
  const total_supervisors = (
    db.prepare(`SELECT COUNT(*) as c FROM users WHERE role = 'supervisor'`).get() as { c: number }
  ).c;
  const total_videos = (db.prepare(`SELECT COUNT(*) as c FROM videos`).get() as { c: number }).c;
  const total_pdfs = (db.prepare(`SELECT COUNT(*) as c FROM pdfs`).get() as { c: number }).c;
  const total_quizzes = (db.prepare(`SELECT COUNT(*) as c FROM quizzes`).get() as { c: number }).c;
  const total_video_views = (
    db.prepare(`SELECT COALESCE(SUM(view_count), 0) as c FROM video_views`).get() as { c: number }
  ).c;
  const total_quiz_attempts = (
    db.prepare(`SELECT COUNT(*) as c FROM quiz_attempts`).get() as { c: number }
  ).c;

  const videos = db
    .prepare(
      `SELECT v.id, v.title, g.name as grade_name,
              COUNT(DISTINCT vv.user_id) as unique_viewers,
              COALESCE(SUM(vv.view_count), 0) as total_views
       FROM videos v
       JOIN grades g ON g.id = v.grade_id
       LEFT JOIN video_views vv ON vv.video_id = v.id
       GROUP BY v.id
       ORDER BY unique_viewers DESC, v.id DESC`
    )
    .all() as Array<{
    id: number;
    title: string;
    grade_name: string;
    unique_viewers: number;
    total_views: number;
  }>;

  const video_stats = videos.map((v) => {
    const viewers = db
      .prepare(
        `SELECT u.full_name, u.username, vv.view_count, vv.last_watched_at
         FROM video_views vv
         JOIN users u ON u.id = vv.user_id
         WHERE vv.video_id = ?
         ORDER BY vv.last_watched_at DESC`
      )
      .all(v.id);
    return { ...v, viewers };
  });

  const quizzes = db
    .prepare(
      `SELECT q.id, q.title, g.name as grade_name,
              COUNT(DISTINCT qa.user_id) as unique_solvers,
              COUNT(qa.id) as total_attempts,
              COALESCE(ROUND(AVG(qa.percentage)), 0) as avg_percentage
       FROM quizzes q
       JOIN grades g ON g.id = q.grade_id
       LEFT JOIN quiz_attempts qa ON qa.quiz_id = q.id
       GROUP BY q.id
       ORDER BY total_attempts DESC, q.id DESC`
    )
    .all() as Array<{
    id: number;
    title: string;
    grade_name: string;
    unique_solvers: number;
    total_attempts: number;
    avg_percentage: number;
  }>;

  const quiz_stats = quizzes.map((q) => {
    const attempts = db
      .prepare(
        `SELECT qa.id, qa.quiz_id, ? as quiz_title, qa.user_id, u.username, u.full_name,
                COALESCE(g.name, '-') as grade_name, qa.score, qa.total_questions,
                qa.percentage, qa.passed, qa.completed_at
         FROM quiz_attempts qa
         JOIN users u ON u.id = qa.user_id
         LEFT JOIN grades g ON g.id = u.grade_id
         WHERE qa.quiz_id = ?
         ORDER BY qa.completed_at DESC`
      )
      .all(q.title, q.id);
    return { ...q, attempts };
  });

  res.json({
    total_students,
    total_supervisors,
    total_videos,
    total_pdfs,
    total_quizzes,
    total_video_views,
    total_quiz_attempts,
    video_stats,
    quiz_stats,
  });
});

// ==========================================
// MESSAGING (STUDENT MAX 3 MESSAGES -> ADMIN & SUPERVISORS)
// ==========================================

app.get('/api/messages', requireAuth, (req: AuthedRequest, res) => {
  const user = req.user!;
  if (user.role === 'student') {
    const messages = db
      .prepare(
        `SELECT m.*, r.full_name as replied_by_name
         FROM messages m
         LEFT JOIN users r ON r.id = m.replied_by
         WHERE m.student_id = ?
         ORDER BY m.id DESC`
      )
      .all(user.id);
    res.json({
      messages,
      sent_count: messages.length,
      max_limit: 3,
      remaining_count: Math.max(0, 3 - messages.length),
    });
    return;
  }

  const messages = db
    .prepare(
      `SELECT m.*, u.username as student_username, u.full_name as student_name,
              COALESCE(g.name, '-') as grade_name, r.full_name as replied_by_name
       FROM messages m
       JOIN users u ON u.id = m.student_id
       LEFT JOIN grades g ON g.id = u.grade_id
       LEFT JOIN users r ON r.id = m.replied_by
       ORDER BY CASE WHEN m.reply_body IS NULL THEN 0 ELSE 1 END, m.id DESC`
    )
    .all();
  res.json({ messages });
});

app.post('/api/messages', requireAuth, (req: AuthedRequest, res) => {
  const user = req.user!;
  if (user.role !== 'student') {
    res.status(403).json({ error: 'إرسال الرسائل متاح للطلاب فقط؛ يمكنك الرد من صندوق الوارد' });
    return;
  }

  const sentCount = (
    db.prepare('SELECT COUNT(*) as c FROM messages WHERE student_id = ?').get(user.id) as { c: number }
  ).c;

  if (sentCount >= 3) {
    res.status(403).json({ error: 'لقد وصلت للحد الأقصى المسموح به (3 رسائل فقط)' });
    return;
  }

  const { subject, body } = req.body ?? {};
  if (!subject || !body || !String(subject).trim() || !String(body).trim()) {
    res.status(400).json({ error: 'يرجى كتابة عنوان الرسالة ومحتواها' });
    return;
  }

  const info = db
    .prepare(`INSERT INTO messages (student_id, subject, body) VALUES (?, ?, ?)`)
    .run(user.id, String(subject).trim(), String(body).trim());

  const message = db.prepare('SELECT * FROM messages WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({
    message,
    remaining_count: Math.max(0, 3 - (sentCount + 1)),
  });
});

app.post('/api/messages/:id/reply', requireAuth, requireRoles('admin', 'supervisor'), (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const { reply_body } = req.body ?? {};
  if (!reply_body || !String(reply_body).trim()) {
    res.status(400).json({ error: 'يرجى كتابة نص الرد' });
    return;
  }
  db.prepare(
    `UPDATE messages SET reply_body = ?, replied_by = ?, replied_at = datetime('now') WHERE id = ?`
  ).run(String(reply_body).trim(), req.user!.id, id);
  res.json({ ok: true });
});

// ==========================================
// EXTRAS: LEADERBOARD, NOTES, FAVORITES
// ==========================================

app.get('/api/leaderboard', requireAuth, (req: AuthedRequest, res) => {
  const user = req.user!;
  if (user.role === 'student' && user.grade_id) {
    const entries = db
      .prepare(
        `SELECT u.id, u.full_name, u.username, u.points, COALESCE(g.name, '') as grade_name
         FROM users u LEFT JOIN grades g ON g.id = u.grade_id
         WHERE u.role = 'student' AND u.grade_id = ? AND u.is_active = 1
         ORDER BY u.points DESC, u.id ASC LIMIT 10`
      )
      .all(user.grade_id);
    res.json({ entries });
    return;
  }
  const entries = db
    .prepare(
      `SELECT u.id, u.full_name, u.username, u.points, COALESCE(g.name, '') as grade_name
       FROM users u LEFT JOIN grades g ON g.id = u.grade_id
       WHERE u.role = 'student' AND u.is_active = 1
       ORDER BY u.points DESC, u.id ASC LIMIT 15`
    )
    .all();
  res.json({ entries });
});

app.get('/api/notes', requireAuth, (req: AuthedRequest, res) => {
  const notes = db
    .prepare('SELECT * FROM student_notes WHERE user_id = ? ORDER BY updated_at DESC')
    .all(req.user!.id);
  res.json({ notes });
});

app.post('/api/notes', requireAuth, (req: AuthedRequest, res) => {
  const { content_type, content_id, note_text } = req.body ?? {};
  if (!['video', 'pdf'].includes(content_type) || !content_id) {
    res.status(400).json({ error: 'بيانات الملاحظة غير مكتملة' });
    return;
  }
  db.prepare(
    `INSERT INTO student_notes (user_id, content_type, content_id, note_text, updated_at)
     VALUES (?, ?, ?, ?, datetime('now'))
     ON CONFLICT(user_id, content_type, content_id)
     DO UPDATE SET note_text = excluded.note_text, updated_at = datetime('now')`
  ).run(req.user!.id, content_type, Number(content_id), String(note_text || ''));
  res.json({ ok: true });
});

app.get('/api/favorites', requireAuth, (req: AuthedRequest, res) => {
  const favorites = db
    .prepare('SELECT content_type, content_id FROM student_favorites WHERE user_id = ?')
    .all(req.user!.id);
  res.json({ favorites });
});

app.post('/api/favorites/toggle', requireAuth, (req: AuthedRequest, res) => {
  const { content_type, content_id } = req.body ?? {};
  if (!['video', 'pdf', 'quiz'].includes(content_type) || !content_id) {
    res.status(400).json({ error: 'بيانات غير صالحة' });
    return;
  }
  const existing = db
    .prepare('SELECT id FROM student_favorites WHERE user_id = ? AND content_type = ? AND content_id = ?')
    .get(req.user!.id, content_type, Number(content_id));
  if (existing) {
    db.prepare('DELETE FROM student_favorites WHERE user_id = ? AND content_type = ? AND content_id = ?').run(
      req.user!.id,
      content_type,
      Number(content_id)
    );
    res.json({ favorited: false });
  } else {
    db.prepare('INSERT INTO student_favorites (user_id, content_type, content_id) VALUES (?, ?, ?)').run(
      req.user!.id,
      content_type,
      Number(content_id)
    );
    res.json({ favorited: true });
  }
});

// ==========================================
// EXTERNAL CROSS-APP INTEGRATION API (/api/external/*)
// ==========================================

app.use('/api/external', (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key, Authorization');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const providedKey =
    (typeof req.headers['x-api-key'] === 'string' && req.headers['x-api-key'].trim()) ||
    (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7).trim() : '') ||
    (typeof req.query.api_key === 'string' ? req.query.api_key.trim() : '');

  const expectedKey = getSettingValue('external_api_key');
  const envKey = process.env.EXTERNAL_API_KEY?.trim() || '';
  const isValid =
    (expectedKey && providedKey === expectedKey) || (envKey && providedKey === envKey);
  if (!isValid) {
    res.status(401).json({ error: 'Invalid or missing X-API-Key' });
    return;
  }
  next();
});

app.get('/api/external/health', (_req, res) => {
  const totalUsers = (db.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number }).c;
  res.json({ ok: true, service: 'fekra-platform', total_users: totalUsers });
});

app.get('/api/external/grades', (_req, res) => {
  const grades = db.prepare('SELECT id, name, sort_order FROM grades ORDER BY sort_order ASC, id ASC').all();
  res.json({ grades });
});

app.get('/api/external/users', (req, res) => {
  const role = typeof req.query.role === 'string' ? req.query.role.trim() : '';
  const gradeId = req.query.grade_id ? Number(req.query.grade_id) : null;
  const includeHashes = req.query.include_hashes === '1' || req.query.include_passwords === '1';

  let sql = `
    SELECT u.id, u.username, u.full_name, u.role, u.grade_id, g.name as grade_name, u.points, u.is_active, u.created_at${
      includeHashes ? ', u.password_hash' : ''
    }
    FROM users u
    LEFT JOIN grades g ON g.id = u.grade_id
    WHERE 1 = 1
  `;
  const params: Array<string | number> = [];

  if (role && ['admin', 'supervisor', 'student'].includes(role)) {
    sql += ' AND u.role = ?';
    params.push(role);
  }
  if (gradeId) {
    sql += ' AND u.grade_id = ?';
    params.push(gradeId);
  }
  sql += ` ORDER BY CASE u.role WHEN 'admin' THEN 0 WHEN 'supervisor' THEN 1 ELSE 2 END, u.id ASC`;

  const users = db.prepare(sql).all(...params);
  res.json({ users });
});

function resolveGradeId(grade_id?: unknown, grade_name?: unknown): number | null {
  if (grade_id) {
    const g = db.prepare('SELECT id FROM grades WHERE id = ?').get(Number(grade_id)) as { id: number } | undefined;
    if (g) return g.id;
  }
  if (typeof grade_name === 'string' && grade_name.trim()) {
    const clean = grade_name.trim();
    const existing = db.prepare('SELECT id FROM grades WHERE name = ?').get(clean) as { id: number } | undefined;
    if (existing) return existing.id;
    const info = db
      .prepare(
        `INSERT INTO grades (name, sort_order, banner_image, banner_title, banner_subtitle)
         VALUES (?, 99, '/src/assets/images/grade_banner_default_1795021613504.jpg', ?, ?)`
      )
      .run(clean, `بوابة الصف ${clean}`, `المحتوى التعليمي المخصص لصف ${clean}`);
    return Number(info.lastInsertRowid);
  }
  const firstGrade = db.prepare('SELECT id FROM grades ORDER BY sort_order ASC, id ASC LIMIT 1').get() as
    | { id: number }
    | undefined;
  return firstGrade ? firstGrade.id : null;
}

app.post('/api/external/users', (req, res) => {
  const { username, password, full_name, role, grade_id, grade_name, is_active } = req.body ?? {};
  if (!username || !full_name) {
    res.status(400).json({ error: 'username and full_name are required' });
    return;
  }
  const cleanUsername = String(username).trim();
  const nextRole: UserRole =
    role && ['admin', 'supervisor', 'student'].includes(String(role))
      ? (String(role) as UserRole)
      : 'student';

  const resolvedGradeId = nextRole === 'student' ? resolveGradeId(grade_id, grade_name) : null;
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(cleanUsername) as
    | { id: number }
    | undefined;

  if (existing) {
    if (password && String(password).trim()) {
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(
        bcrypt.hashSync(String(password), 10),
        existing.id
      );
    }
    db.prepare(
      `UPDATE users SET full_name = ?, role = ?, grade_id = ?, is_active = COALESCE(?, is_active) WHERE id = ?`
    ).run(
      String(full_name).trim(),
      nextRole,
      resolvedGradeId,
      is_active !== undefined ? Number(is_active) : null,
      existing.id
    );
    const updated = db
      .prepare(
        `SELECT u.id, u.username, u.full_name, u.role, u.grade_id, g.name as grade_name, u.points, u.is_active, u.created_at
         FROM users u LEFT JOIN grades g ON g.id = u.grade_id WHERE u.id = ?`
      )
      .get(existing.id);
    logSync('inbound', 'success', `تحديث حساب عبر API: ${cleanUsername}`);
    res.json({ user: updated, updated: true });
    return;
  }

  const rawPass = password && String(password).trim() ? String(password) : crypto.randomBytes(6).toString('hex');
  const hash = bcrypt.hashSync(rawPass, 10);
  const info = db
    .prepare(
      `INSERT INTO users (username, password_hash, full_name, role, grade_id, points, is_active)
       VALUES (?, ?, ?, ?, ?, 0, ?)`
    )
    .run(
      cleanUsername,
      hash,
      String(full_name).trim(),
      nextRole,
      resolvedGradeId,
      is_active !== undefined ? Number(is_active) : 1
    );
  const created = db
    .prepare(
      `SELECT u.id, u.username, u.full_name, u.role, u.grade_id, g.name as grade_name, u.points, u.is_active, u.created_at
       FROM users u LEFT JOIN grades g ON g.id = u.grade_id WHERE u.id = ?`
    )
    .get(info.lastInsertRowid);
  logSync('inbound', 'success', `إضافة حساب جديد عبر API: ${cleanUsername}`);
  res.status(201).json({ user: created, created: true });
});

app.put('/api/external/users/:username', (req, res) => {
  const cleanUsername = String(req.params.username).trim();
  const target = db.prepare('SELECT * FROM users WHERE username = ?').get(cleanUsername) as
    | { id: number; username: string; role: UserRole }
    | undefined;
  if (!target) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  const { full_name, password, role, grade_id, grade_name, is_active } = req.body ?? {};
  const nextRole =
    role && ['admin', 'supervisor', 'student'].includes(String(role))
      ? (String(role) as UserRole)
      : target.role;

  if (target.username === 'fekra@n' && nextRole !== 'admin') {
    res.status(400).json({ error: 'Cannot demote primary admin' });
    return;
  }

  if (password && String(password).trim()) {
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(
      bcrypt.hashSync(String(password), 10),
      target.id
    );
  }
  const resolvedGradeId =
    nextRole === 'student' ? resolveGradeId(grade_id, grade_name) : null;

  db.prepare(
    `UPDATE users SET full_name = COALESCE(?, full_name), role = ?, grade_id = ?, is_active = COALESCE(?, is_active) WHERE id = ?`
  ).run(
    full_name ? String(full_name).trim() : null,
    nextRole,
    resolvedGradeId,
    is_active !== undefined ? Number(is_active) : null,
    target.id
  );
  const updated = db
    .prepare(
      `SELECT u.id, u.username, u.full_name, u.role, u.grade_id, g.name as grade_name, u.points, u.is_active, u.created_at
       FROM users u LEFT JOIN grades g ON g.id = u.grade_id WHERE u.id = ?`
    )
    .get(target.id);
  logSync('inbound', 'success', `تعديل حساب عبر API: ${cleanUsername}`);
  res.json({ user: updated });
});

app.delete('/api/external/users/:username', (req, res) => {
  const cleanUsername = String(req.params.username).trim();
  if (cleanUsername === 'fekra@n') {
    res.status(400).json({ error: 'Cannot delete primary admin' });
    return;
  }
  const info = db.prepare('DELETE FROM users WHERE username = ?').run(cleanUsername);
  if (info.changes === 0) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  logSync('inbound', 'success', `حذف حساب عبر API: ${cleanUsername}`);
  res.json({ ok: true });
});

app.post('/api/external/verify-login', (req, res) => {
  const { username, password } = req.body ?? {};
  if (!username || !password) {
    res.status(400).json({ valid: false, error: 'username and password required' });
    return;
  }
  const row = db
    .prepare(
      `SELECT u.*, g.name as grade_name
       FROM users u LEFT JOIN grades g ON g.id = u.grade_id
       WHERE u.username = ?`
    )
    .get(String(username).trim()) as (AuthUser & { password_hash: string }) | undefined;

  if (!row || !row.is_active || !bcrypt.compareSync(String(password), row.password_hash)) {
    res.status(401).json({ valid: false, error: 'Invalid credentials' });
    return;
  }

  const { password_hash: _ignored, ...safeUser } = row;
  res.json({ valid: true, user: safeUser });
});

// ==========================================
// ADMIN INTEGRATION HUB ROUTES
// ==========================================

app.get('/api/integration/config', requireAuth, requireRoles('admin'), (_req, res) => {
  const logs = db.prepare('SELECT * FROM sync_logs ORDER BY id DESC LIMIT 20').all();
  res.json({
    external_api_key: getSettingValue('external_api_key'),
    remote_sync_url: getSettingValue('remote_sync_url'),
    remote_sync_api_key: getSettingValue('remote_sync_api_key'),
    webhook_url: getSettingValue('webhook_url'),
    auto_sync_enabled: Number(getSettingValue('auto_sync_enabled', '0')),
    logs,
  });
});

app.put('/api/integration/config', requireAuth, requireRoles('admin'), (req, res) => {
  const { external_api_key, remote_sync_url, remote_sync_api_key, webhook_url, auto_sync_enabled } =
    req.body ?? {};
  if (external_api_key !== undefined && String(external_api_key).trim().length >= 6) {
    setSettingValue('external_api_key', String(external_api_key).trim());
  }
  if (remote_sync_url !== undefined) setSettingValue('remote_sync_url', String(remote_sync_url).trim());
  if (remote_sync_api_key !== undefined)
    setSettingValue('remote_sync_api_key', String(remote_sync_api_key).trim());
  if (webhook_url !== undefined) setSettingValue('webhook_url', String(webhook_url).trim());
  if (auto_sync_enabled !== undefined) setSettingValue('auto_sync_enabled', auto_sync_enabled ? '1' : '0');
  res.json({ ok: true });
});

app.post('/api/integration/rotate-key', requireAuth, requireRoles('admin'), (_req, res) => {
  const newKey = `fekra_${crypto.randomBytes(16).toString('hex')}`;
  setSettingValue('external_api_key', newKey);
  logSync('system', 'success', 'تم توليد مفتاح ربط API جديد');
  res.json({ external_api_key: newKey });
});

function upsertImportedUsers(items: Array<Record<string, unknown>>): { created: number; updated: number } {
  let created = 0;
  let updated = 0;
  const tx = db.transaction(() => {
    for (const item of items) {
      const username = String(item.username || item.user_name || '').trim();
      const full_name = String(item.full_name || item.name || item.fullName || username).trim();
      if (!username || !full_name) continue;
      if (username === 'fekra@n') continue; // keep primary admin protected

      const rawRole = String(item.role || 'student').toLowerCase();
      const role: UserRole =
        rawRole === 'admin' || rawRole === 'supervisor' || rawRole === 'student' ? rawRole : 'student';
      const gradeId = role === 'student' ? resolveGradeId(item.grade_id, item.grade_name || item.grade) : null;
      const isActive = item.is_active !== undefined ? Number(item.is_active) : 1;

      const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username) as
        | { id: number }
        | undefined;
      if (existing) {
        db.prepare('UPDATE users SET full_name = ?, role = ?, grade_id = ?, is_active = ? WHERE id = ?').run(
          full_name,
          role,
          gradeId,
          isActive,
          existing.id
        );
        if (item.password && String(item.password).trim()) {
          db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(
            bcrypt.hashSync(String(item.password), 10),
            existing.id
          );
        } else if (item.password_hash && String(item.password_hash).startsWith('$2')) {
          db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(
            String(item.password_hash),
            existing.id
          );
        }
        updated++;
      } else {
        const nextHash =
          item.password && String(item.password).trim()
            ? bcrypt.hashSync(String(item.password), 10)
            : item.password_hash && String(item.password_hash).startsWith('$2')
            ? String(item.password_hash)
            : bcrypt.hashSync(crypto.randomBytes(6).toString('hex'), 10);
        db.prepare(
          `INSERT INTO users (username, password_hash, full_name, role, grade_id, points, is_active)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).run(
          username,
          nextHash,
          full_name,
          role,
          gradeId,
          Number(item.points) || 0,
          isActive
        );
        created++;
      }
    }
  });
  tx();
  return { created, updated };
}

app.post('/api/integration/pull', requireAuth, requireRoles('admin'), async (req, res) => {
  const url = String(req.body?.url || getSettingValue('remote_sync_url')).trim();
  const key = String(req.body?.api_key || getSettingValue('remote_sync_api_key')).trim();
  if (!url) {
    res.status(400).json({ error: 'يرجى إدخال رابط API الموقع الآخر أولاً' });
    return;
  }

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        ...(key ? { 'X-API-Key': key, Authorization: `Bearer ${key}` } : {}),
      },
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = (await response.json()) as Record<string, unknown>;
    const list = Array.isArray(data)
      ? data
      : Array.isArray(data.users)
      ? data.users
      : Array.isArray(data.data)
      ? data.data
      : null;

    if (!list) {
      throw new Error('صيغة الاستجابة لا تحتوي على مصفوفة users');
    }

    const { created, updated } = upsertImportedUsers(list as Array<Record<string, unknown>>);
    const summary = `تم سحب البيانات بنجاح: ${created} حساب جديد، ${updated} حساب محدث`;
    logSync('pull', 'success', summary);
    res.json({ ok: true, created, updated, summary });
  } catch (err) {
    const msg = `فشل السحب من الموقع الآخر: ${(err as Error).message}`;
    logSync('pull', 'error', msg);
    res.status(502).json({ error: msg });
  }
});

app.post('/api/integration/push', requireAuth, requireRoles('admin'), async (req, res) => {
  const url = String(req.body?.url || getSettingValue('remote_sync_url')).trim();
  const key = String(req.body?.api_key || getSettingValue('remote_sync_api_key')).trim();
  if (!url) {
    res.status(400).json({ error: 'يرجى إدخال رابط API الموقع الآخر أولاً' });
    return;
  }

  const users = db
    .prepare(
      `SELECT u.id, u.username, u.full_name, u.role, u.grade_id, g.name as grade_name, u.points, u.is_active, u.password_hash, u.created_at
       FROM users u LEFT JOIN grades g ON g.id = u.grade_id`
    )
    .all();

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(key ? { 'X-API-Key': key, Authorization: `Bearer ${key}` } : {}),
      },
      body: JSON.stringify({ source: 'fekra-platform', users }),
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const summary = `تم إرسال ${users.length} حساب (طلاب ومشرفين وأدمن) إلى الموقع الآخر`;
    logSync('push', 'success', summary);
    res.json({ ok: true, count: users.length, summary });
  } catch (err) {
    const msg = `فشل إرسال البيانات للموقع الآخر: ${(err as Error).message}`;
    logSync('push', 'error', msg);
    res.status(502).json({ error: msg });
  }
});

app.post('/api/integration/import-json', requireAuth, requireRoles('admin'), (req, res) => {
  const list = Array.isArray(req.body?.users) ? req.body.users : Array.isArray(req.body) ? req.body : null;
  if (!list) {
    res.status(400).json({ error: 'يرجى تزويد مصفوفة JSON صالحة للحسابات' });
    return;
  }
  const { created, updated } = upsertImportedUsers(list);
  const summary = `استيراد يدوي: ${created} حساب جديد، ${updated} حساب محدث`;
  logSync('import', 'success', summary);
  res.json({ ok: true, created, updated, summary });
});

// ==========================================
// VITE DEV MIDDLEWARE / STATIC PRODUCTION
// ==========================================

async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';
  const httpServer = http.createServer(app);

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        ws: { server: httpServer },
        watch: null,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    const srcAssetsDir = path.resolve(process.cwd(), 'src/assets');
    if (fs.existsSync(srcAssetsDir)) {
      app.use('/src/assets', express.static(srcAssetsDir));
    }
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Platform server running on http://localhost:${PORT}`);
  });
}

startServer();
