const TOKEN_KEY = 'fekra_session_token';

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string | null) {
  try {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

export function withAuthToken(url: string): string {
  const token = getStoredToken();
  if (!token || !url.startsWith('/api/media/')) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}token=${encodeURIComponent(token)}`;
}

export async function apiFetch<T = unknown>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getStoredToken();
  const headers = new Headers(options.headers || {});
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (!res.ok) {
    let message = 'حدث خطأ أثناء الاتصال بالخادم';
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch {
      // ignore json parse error
    }
    throw new Error(message);
  }

  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return (await res.json()) as T;
  }
  return (await res.text()) as unknown as T;
}

export async function uploadFile(
  file: File,
  kind: 'image' | 'video' | 'pdf'
): Promise<{ filename: string; url: string; originalName: string }> {
  const token = getStoredToken();
  const formData = new FormData();
  formData.append('kind', kind);
  formData.append('file', file);

  const res = await fetch('/api/upload', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
    credentials: 'include',
  });

  if (!res.ok) {
    let message = 'فشل رفع الملف';
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  return res.json();
}
