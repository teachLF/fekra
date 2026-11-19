export type UserRole = 'admin' | 'supervisor' | 'student';

export interface User {
  id: number;
  username: string;
  full_name: string;
  role: UserRole;
  grade_id: number | null;
  grade_name?: string | null;
  points: number;
  is_active: number;
  created_at: string;
}

export interface Grade {
  id: number;
  name: string;
  sort_order: number;
  banner_image: string;
  banner_title: string;
  banner_subtitle: string;
}

export interface HeroSlide {
  id: number;
  image_url: string;
  title: string;
  subtitle: string;
  link_section: string;
  sort_order: number;
  is_active: number;
}

export interface SiteSettings {
  site_name: string;
  logo_url: string;
  primary_color: string;
  accent_color: string;
  welcome_heading: string;
  welcome_subheading: string;
  announcement_text: string;
  announcement_enabled: number;
  footer_text: string;
  hero_interval_ms: number;
  login_title: string;
  login_subtitle: string;
  protection_message: string;
  anti_capture_enabled: number;
}

export interface VideoItem {
  id: number;
  grade_id: number;
  grade_name?: string;
  title: string;
  description: string;
  source_type: 'upload' | 'url';
  media_path: string;
  thumbnail_url: string;
  duration_label: string;
  sort_order: number;
  created_at: string;
  watched?: boolean;
  total_views?: number;
  unique_viewers?: number;
}

export interface PdfItem {
  id: number;
  grade_id: number;
  grade_name?: string;
  title: string;
  description: string;
  source_type: 'upload' | 'url';
  file_path: string;
  created_at: string;
  viewed?: boolean;
  total_views?: number;
  unique_viewers?: number;
}

export interface QuizQuestion {
  id?: number;
  quiz_id?: number;
  question_text: string;
  options: string[];
  correct_index?: number;
  explanation: string;
  sort_order?: number;
}

export interface Quiz {
  id: number;
  grade_id: number;
  grade_name?: string;
  title: string;
  description: string;
  time_limit_minutes: number;
  pass_percentage: number;
  is_published: number;
  created_at: string;
  questions?: QuizQuestion[];
  question_count?: number;
  attempt_count?: number;
  unique_solvers?: number;
  my_best_attempt?: {
    score: number;
    total_questions: number;
    percentage: number;
    passed: number;
    completed_at: string;
  } | null;
}

export interface QuizAttemptDetail {
  id: number;
  quiz_id: number;
  quiz_title: string;
  user_id: number;
  username: string;
  full_name: string;
  grade_name: string;
  score: number;
  total_questions: number;
  percentage: number;
  passed: number;
  completed_at: string;
}

export interface StudentMessage {
  id: number;
  student_id: number;
  student_username?: string;
  student_name?: string;
  grade_name?: string;
  subject: string;
  body: string;
  reply_body: string | null;
  replied_by_name?: string | null;
  replied_at: string | null;
  created_at: string;
}

export interface AnalyticsOverview {
  total_students: number;
  total_supervisors: number;
  total_videos: number;
  total_pdfs: number;
  total_quizzes: number;
  total_video_views: number;
  total_quiz_attempts: number;
  video_stats: Array<{
    id: number;
    title: string;
    grade_name: string;
    unique_viewers: number;
    total_views: number;
    viewers: Array<{
      full_name: string;
      username: string;
      view_count: number;
      last_watched_at: string;
    }>;
  }>;
  quiz_stats: Array<{
    id: number;
    title: string;
    grade_name: string;
    unique_solvers: number;
    total_attempts: number;
    avg_percentage: number;
    attempts: QuizAttemptDetail[];
  }>;
}

export interface LeaderboardEntry {
  id: number;
  full_name: string;
  username: string;
  points: number;
  grade_name: string;
}

export interface StudentNote {
  id: number;
  content_type: 'video' | 'pdf';
  content_id: number;
  note_text: string;
  updated_at: string;
}

export interface SyncLog {
  id: number;
  direction: string;
  status: string;
  summary: string;
  created_at: string;
}

export interface IntegrationConfig {
  external_api_key: string;
  remote_sync_url: string;
  remote_sync_api_key: string;
  webhook_url: string;
  auto_sync_enabled: number;
  logs: SyncLog[];
}
