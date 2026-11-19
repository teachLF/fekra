import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const DATA_DIR = path.resolve(process.cwd(), 'data');
export const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'platform.db');
export const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS grades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      banner_image TEXT NOT NULL DEFAULT '/src/assets/images/grade_banner_default_1795021613504.jpg',
      banner_title TEXT NOT NULL DEFAULT '',
      banner_subtitle TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'supervisor', 'student')),
      grade_id INTEGER REFERENCES grades(id) ON DELETE SET NULL,
      points INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS site_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS hero_slides (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      image_url TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      subtitle TEXT NOT NULL DEFAULT '',
      link_section TEXT NOT NULL DEFAULT 'videos',
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS videos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      grade_id INTEGER NOT NULL REFERENCES grades(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      source_type TEXT NOT NULL CHECK(source_type IN ('upload', 'url')),
      media_path TEXT NOT NULL,
      thumbnail_url TEXT NOT NULL DEFAULT '',
      duration_label TEXT NOT NULL DEFAULT 'درس مرئي',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS video_views (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      video_id INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      view_count INTEGER NOT NULL DEFAULT 1,
      last_watched_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(video_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS pdfs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      grade_id INTEGER NOT NULL REFERENCES grades(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      source_type TEXT NOT NULL CHECK(source_type IN ('upload', 'url')),
      file_path TEXT NOT NULL,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS pdf_views (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pdf_id INTEGER NOT NULL REFERENCES pdfs(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      view_count INTEGER NOT NULL DEFAULT 1,
      last_viewed_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(pdf_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS quizzes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      grade_id INTEGER NOT NULL REFERENCES grades(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      time_limit_minutes INTEGER NOT NULL DEFAULT 10,
      pass_percentage INTEGER NOT NULL DEFAULT 60,
      is_published INTEGER NOT NULL DEFAULT 1,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS quiz_questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quiz_id INTEGER NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
      question_text TEXT NOT NULL,
      options_json TEXT NOT NULL,
      correct_index INTEGER NOT NULL,
      explanation TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS quiz_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quiz_id INTEGER NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      score INTEGER NOT NULL,
      total_questions INTEGER NOT NULL,
      percentage INTEGER NOT NULL,
      passed INTEGER NOT NULL DEFAULT 0,
      answers_json TEXT NOT NULL,
      completed_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      reply_body TEXT,
      replied_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      replied_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS student_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content_type TEXT NOT NULL CHECK(content_type IN ('video', 'pdf')),
      content_id INTEGER NOT NULL,
      note_text TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, content_type, content_id)
    );

    CREATE TABLE IF NOT EXISTS student_favorites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content_type TEXT NOT NULL CHECK(content_type IN ('video', 'pdf', 'quiz')),
      content_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, content_type, content_id)
    );

    CREATE TABLE IF NOT EXISTS sync_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      direction TEXT NOT NULL,
      status TEXT NOT NULL,
      summary TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Seed default grades if empty
  const gradeCount = (db.prepare('SELECT COUNT(*) as count FROM grades').get() as { count: number }).count;
  if (gradeCount === 0) {
    const defaultGrades = [
      'الأول الابتدائي',
      'الثاني الابتدائي',
      'الثالث الابتدائي',
      'الرابع الابتدائي',
      'الخامس الابتدائي',
      'السادس الابتدائي',
      'الأول المتوسط',
      'الثاني المتوسط',
      'الثالث المتوسط',
    ];
    const insertGrade = db.prepare(`
      INSERT INTO grades (name, sort_order, banner_image, banner_title, banner_subtitle)
      VALUES (?, ?, ?, ?, ?)
    `);
    defaultGrades.forEach((name, index) => {
      insertGrade.run(
        name,
        index + 1,
        '/src/assets/images/grade_banner_default_1795021613504.jpg',
        `بوابة الصف ${name}`,
        `جميع الدروس المرئية والملخصات والاختبارات المخصصة لطلاب ${name}`
      );
    });
  }

  // Seed ONLY the initial admin account if no users exist: fekra@n / Nawaf1402@
  const userCount = (db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number }).count;
  if (userCount === 0) {
    const passwordHash = bcrypt.hashSync('Nawaf1402@', 10);
    db.prepare(`
      INSERT INTO users (username, password_hash, full_name, role, grade_id, points, is_active)
      VALUES (?, ?, ?, 'admin', NULL, 0, 1)
    `).run('fekra@n', passwordHash, 'الأدمن الرئيسي');
  }

  // Seed default site settings if missing
  const defaultSettings: Record<string, string> = {
    site_name: 'منصة فكرة التعليمية',
    logo_url: '/src/assets/images/site_logo_emblem_1795021613540.jpg',
    primary_color: '#0F2A4A',
    accent_color: '#B4832E',
    welcome_heading: 'بوابتك الذكية نحو التفوق الدراسي',
    welcome_subheading: 'دروس مرئية محمية، ملخصات PDF منظمة، واختبارات تفاعلية مخصصة حسب صفك الدراسي',
    announcement_text: 'أهلاً بكم في منصة فكرة التعليمية — شاهد دروسك، اجمع نقاط التفوق، واختبر مستواك يومياً.',
    announcement_enabled: '1',
    footer_text: 'جميع الحقوق محفوظة لمنصة فكرة التعليمية — بيئة تعليمية محمية',
    hero_interval_ms: '5000',
    login_title: 'تسجيل الدخول إلى المنصة',
    login_subtitle: 'أدخل الاسم وكلمة السر المرسلة لك من إدارة المنصة',
    protection_message: 'لا يمكنك اخذ المحتوى',
    anti_capture_enabled: '1',
    external_api_key: `fekra_${crypto.randomBytes(16).toString('hex')}`,
    remote_sync_url: '',
    remote_sync_api_key: '',
    webhook_url: '',
    auto_sync_enabled: '0',
  };

  const insertSetting = db.prepare(`INSERT OR IGNORE INTO site_settings (key, value) VALUES (?, ?)`);
  for (const [key, value] of Object.entries(defaultSettings)) {
    insertSetting.run(key, value);
  }

  // Seed default rotating hero slides if empty
  const slideCount = (db.prepare('SELECT COUNT(*) as count FROM hero_slides').get() as { count: number }).count;
  if (slideCount === 0) {
    const insertSlide = db.prepare(`
      INSERT INTO hero_slides (image_url, title, subtitle, link_section, sort_order, is_active)
      VALUES (?, ?, ?, ?, ?, 1)
    `);
    insertSlide.run(
      '/src/assets/images/hero_banner_academy_1795021611755.jpg',
      'تعلّم بتركيز في بيئة محمية ومخصصة لصفك',
      'فيديوهات تعليمية عالية الوضوح مع متابعة مستمرة من المشرفين والأدمن',
      'videos',
      1
    );
    insertSlide.run(
      '/src/assets/images/hero_banner_science_1795021612350.jpg',
      'اختبارات كويز تفاعلية وتقييم فوري',
      'اختبر مستواك في كل مادة واحصل على شهادة إنجاز ونقاط في لوحة الشرف',
      'quizzes',
      2
    );
    insertSlide.run(
      '/src/assets/images/hero_banner_excellence_1795021613688.jpg',
      'ملخصات PDF شاملة وتواصل مباشر',
      'تصفح المذكرات والملفات الدراسية مباشرة من المنصة وأرسل استفساراتك للمشرفين',
      'pdfs',
      3
    );
  }
}
