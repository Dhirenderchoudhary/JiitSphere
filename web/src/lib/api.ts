const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5050/api/v1';
const PORTAL_REALTIME_DEFAULT = String(process.env.NEXT_PUBLIC_PORTAL_REALTIME || 'false').toLowerCase() === 'true';
const PORTAL_MARKS_DOWNLOAD_TIMEOUT_MS = Number(process.env.NEXT_PUBLIC_PORTAL_MARKS_DOWNLOAD_TIMEOUT_MS || 25000);
const DEFAULT_API_TIMEOUT_MS = Number(process.env.NEXT_PUBLIC_API_TIMEOUT_MS || 20000);
const DEFAULT_API_RETRIES = Math.max(0, Number(process.env.NEXT_PUBLIC_API_RETRIES || 1));

type Primitive = string | number | boolean;
type QueryValue = Primitive | null | undefined;
type QueryParams = Record<string, QueryValue>;
type JsonObject = Record<string, unknown>;
type FetchWithTimeoutOptions = RequestInit & { timeoutMs?: number; retries?: number };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isRetryableFetchError = (error: unknown): boolean => {
  const err = error as { name?: string; message?: string };
  if (!err) return false;
  if (err.name === 'AbortError') return true;
  return /failed to fetch|networkerror|network request failed/i.test(String(err.message || ''));
};

const fetchWithTimeout = async (url: string, options: FetchWithTimeoutOptions = {}): Promise<Response> => {
  const {
    timeoutMs = DEFAULT_API_TIMEOUT_MS,
    retries = DEFAULT_API_RETRIES,
    ...requestOptions
  } = options;

  let attempt = 0;
  while (true) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(3000, Number(timeoutMs) || DEFAULT_API_TIMEOUT_MS));

    try {
      return await fetch(url, {
        ...requestOptions,
        signal: controller.signal
      });
    } catch (error) {
      if (attempt >= retries || !isRetryableFetchError(error)) {
        throw error;
      }
      attempt += 1;
      await sleep(150 * attempt);
    } finally {
      clearTimeout(timer);
    }
  }
};

/** Thrown when the backend returns 401. Callers should redirect to login. */
export class SessionExpiredError extends Error {
  readonly statusCode = 401;
  constructor() {
    super('TOKEN_EXPIRED');
    this.name = 'SessionExpiredError';
  }
}

const cleanParams = (params: QueryParams = {}): string => {
  const entries = Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '');
  return new URLSearchParams(entries as Array<[string, string]>).toString();
};

const parseJson = async <T = JsonObject>(response: Response): Promise<T> => {
  const contentType = (response.headers.get('content-type') || '').toLowerCase();

  if (!contentType.includes('application/json')) {
    const text = await response.text();
    const preview = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 120);
    throw new Error(
      `Expected JSON from API but got ${contentType || 'unknown'} (HTTP ${response.status}). ${preview ? `Response starts: ${preview}` : ''}`
    );
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new Error(`Invalid JSON response from API (HTTP ${response.status}).`);
  }
};

const authHeader = (token: string): Record<string, string> => ({
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json'
});

const withRealtime = (params: QueryParams = {}, refresh = PORTAL_REALTIME_DEFAULT): QueryParams => ({
  ...(params || {}),
  ...(refresh ? { refresh: 1 } : {})
});

const sdkGet = async <T = JsonObject>(token: string, path: string, params: QueryParams = {}): Promise<T> => {
  const query = cleanParams(params);
  const url = `${API_BASE_URL}${path}${query ? `?${query}` : ''}`;
  const response = await fetchWithTimeout(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
    timeoutMs: DEFAULT_API_TIMEOUT_MS,
    retries: DEFAULT_API_RETRIES
  });
  if (response.status === 401) throw new SessionExpiredError();
  const data = await parseJson<T & { message?: string }>(response);
  if (!response.ok) throw new Error(data.message || 'SDK request failed');
  return data;
};

export const fetchFilterOptions = async () => {
  const response = await fetch(`${API_BASE_URL}/materials/filters/options`, { cache: 'no-store' });
  if (!response.ok) throw new Error('Failed to fetch filter options');
  return parseJson(response);
};

export const fetchBrowseOptions = async (params: QueryParams) => {
  const query = cleanParams(params);
  const response = await fetch(`${API_BASE_URL}/materials/filters/browse?${query}`, { cache: 'no-store' });
  if (!response.ok) throw new Error('Failed to fetch browse options');
  return parseJson(response);
};

export const fetchMaterials = async (params: QueryParams) => {
  const query = cleanParams(params);
  const response = await fetch(`${API_BASE_URL}/materials?${query}`, { cache: 'no-store' });
  if (!response.ok) throw new Error('Failed to fetch materials');
  return parseJson(response);
};

export const fetchMaterialById = async (id: string) => {
  const response = await fetch(`${API_BASE_URL}/materials/${id}`, { cache: 'no-store' });
  if (!response.ok) throw new Error('Failed to fetch material');
  return parseJson(response);
};

export const loginUser = async (payload: JsonObject) => {
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const data = await parseJson<{ message?: string } & JsonObject>(response);
  if (!response.ok) {
    throw new Error(data.message || 'Failed to login');
  }

  return data;
};

export const loginPortalDemo = async () => {
  const response = await fetch(`${API_BASE_URL}/auth/demo-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });

  const data = await parseJson<{ message?: string } & JsonObject>(response);
  if (!response.ok) {
    throw new Error(data.message || 'Failed to start demo session');
  }

  return data;
};

export const fetchPortalStatus = async (token: string) => {
  const profileResponse = await fetch(`${API_BASE_URL}/auth/me`, {
    headers: {
      Authorization: `Bearer ${token}`
    },
    cache: 'no-store'
  });
  if (!profileResponse.ok) throw new Error('Session expired');
  const profile = await parseJson<{ data?: { user?: unknown } }>(profileResponse);

  const response = await fetch(`${API_BASE_URL}/portal/status`, {
    headers: {
      Authorization: `Bearer ${token}`
    },
    cache: 'no-store'
  });
  if (!response.ok) throw new Error('Failed to fetch portal status');
  const status = await parseJson<JsonObject>(response);
  return { ...status, user: profile?.data?.user || null };
};

export const fetchMe = async (token: string) => {
  const response = await fetch(`${API_BASE_URL}/auth/me`, {
    headers: {
      Authorization: `Bearer ${token}`
    },
    cache: 'no-store'
  });
  const data = await parseJson<{ message?: string } & JsonObject>(response);
  if (!response.ok) throw new Error(data.message || 'Failed to fetch user profile');
  return data;
};

export const fetchAdminAnalytics = async (token: string) => {
  const response = await fetch(`${API_BASE_URL}/auth/analytics`, {
    headers: {
      Authorization: `Bearer ${token}`
    },
    cache: 'no-store'
  });
  const data = await parseJson<{ message?: string } & JsonObject>(response);
  if (!response.ok) throw new Error(data.message || 'Failed to fetch analytics');
  return data;
};

export const fetchStudyAnalytics = async () => {
  const response = await fetch('/api/admin/study-analytics', { cache: 'no-store' });
  const data = await parseJson<{ message?: string } & JsonObject>(response);
  if (!response.ok) throw new Error(data.message || 'Failed to fetch study analytics');
  return data;
};

export const startPortalRelaySession = async (token: string) => {
  const response = await fetch(`${API_BASE_URL}/portal/relay/start`, {
    method: 'POST',
    headers: authHeader(token)
  });
  const data = await parseJson<{ message?: string } & JsonObject>(response);
  if (!response.ok) throw new Error(data.message || 'Failed to start relay session');
  return data;
};

export const fetchPortalRelayCaptcha = async (token: string, payload: JsonObject = {}) => {
  const response = await fetch(`${API_BASE_URL}/portal/relay/captcha`, {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify(payload)
  });
  const data = await parseJson<{ message?: string } & JsonObject>(response);
  if (!response.ok) throw new Error(data.message || 'Failed to fetch portal captcha');
  return data;
};

export const tryPortalRelayLogin = async (token: string, payload: JsonObject) => {
  const response = await fetch(`${API_BASE_URL}/portal/relay/try-login`, {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify(payload)
  });
  const data = await parseJson<{ message?: string } & JsonObject>(response);
  if (!response.ok) throw new Error(data.message || 'Relay login failed');
  return data;
};

export const portalRelayRequest = async (token: string, payload: JsonObject) => {
  const response = await fetch(`${API_BASE_URL}/portal/relay/request`, {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify(payload)
  });
  const data = await parseJson<{ message?: string } & JsonObject>(response);
  if (!response.ok) throw new Error(data.message || 'Relay request failed');
  return data;
};

export const portalSdkLogin = async (token: string, payload: JsonObject) => {
  const response = await fetch(`${API_BASE_URL}/portal/sdk/login`, {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify(payload)
  });
  const data = await parseJson<{ message?: string } & JsonObject>(response);
  if (!response.ok) throw new Error(data.message || 'SDK login failed');
  return data;
};

export const fetchPortalSdkSession = async (token: string, refresh = PORTAL_REALTIME_DEFAULT) =>
  sdkGet(token, '/portal/sdk/session', withRealtime({}, refresh));
export const fetchPortalAttendanceMeta = async (token: string, refresh = PORTAL_REALTIME_DEFAULT) =>
  sdkGet(token, '/portal/sdk/attendance/meta', withRealtime({}, refresh));
export const fetchPortalAttendance = async (token: string, semester: string, refresh = PORTAL_REALTIME_DEFAULT) =>
  sdkGet(token, '/portal/sdk/attendance', withRealtime({ semester }, refresh));
export const fetchPortalAttendanceCounts = async (token: string, semester: string, refresh = false) =>
  sdkGet(token, '/portal/sdk/attendance/counts', withRealtime({ semester }, refresh));
export const fetchPortalSubjectAttendance = async (
  token: string,
  semester: string,
  subject: string,
  refresh = false
) => sdkGet(token, '/portal/sdk/attendance/subject', withRealtime({ semester, subject }, refresh));
export const fetchPortalProfile = async (token: string, refresh = PORTAL_REALTIME_DEFAULT) =>
  sdkGet(token, '/portal/sdk/profile', withRealtime({}, refresh));
export const fetchPortalGrades = async (token: string, refresh = PORTAL_REALTIME_DEFAULT) =>
  sdkGet(token, '/portal/sdk/grades', withRealtime({}, refresh));
export const fetchPortalExams = async (token: string, refresh = PORTAL_REALTIME_DEFAULT) =>
  sdkGet(token, '/portal/sdk/exams', withRealtime({}, refresh));
export const fetchPortalSubjects = async (token: string, semester: string, refresh = PORTAL_REALTIME_DEFAULT) =>
  sdkGet(token, '/portal/sdk/subjects', withRealtime({ semester }, refresh));
export const fetchPortalMarksSemesters = async (token: string, refresh = PORTAL_REALTIME_DEFAULT) => {
  const response = await sdkGet<{ data?: unknown }>(token, '/portal/sdk/marks/semesters', withRealtime({}, refresh));
  return Array.isArray(response?.data) ? response.data : [];
};

export const fetchPortalFees = async (token: string, options: boolean | { debug?: boolean; refresh?: boolean } = false) => {
  const debug = typeof options === 'boolean' ? options : Boolean(options?.debug);
  const refresh = typeof options === 'boolean'
    ? PORTAL_REALTIME_DEFAULT
    : options?.refresh !== undefined
      ? Boolean(options?.refresh)
      : PORTAL_REALTIME_DEFAULT;

  return sdkGet(token, '/portal/sdk/fees', {
    ...(debug ? { debug: 1 } : {}),
    ...withRealtime({}, refresh)
  });
};

export const downloadPortalMarks = async (token: string, registration_id: string, registration_code: string) => {
  const query = cleanParams({ registration_id, registration_code });
  const url = `${API_BASE_URL}/portal/sdk/marks/download?${query}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(5000, PORTAL_MARKS_DOWNLOAD_TIMEOUT_MS));

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal: controller.signal
    });
  } catch (error: unknown) {
    const err = error as { name?: string };
    if (err?.name === 'AbortError') {
      throw new Error('Marks PDF request timed out. Please try again.');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({} as { message?: string }));
    throw new Error(errorData.message || 'Failed to download marks PDF');
  }

  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  const blob = await response.blob();
  const hasPdfMime = contentType.includes('pdf') || contentType.includes('octet-stream');

  if (!hasPdfMime) {
    const signature = await blob.slice(0, 5).text().catch(() => '');
    if (!signature.startsWith('%PDF-')) {
      const text = await blob.text().catch(() => '');
      let parsedMessage = '';
      if (text) {
        try {
          const parsed = JSON.parse(text) as { message?: string };
          parsedMessage = String(parsed?.message || '').trim();
        } catch (_error) {
          parsedMessage = '';
        }
      }
      throw new Error(parsedMessage || 'Portal returned an invalid PDF response');
    }
  }

  return blob;
};

export const fetchPortalMarksData = async (
  token: string,
  registration_id: string,
  registration_code: string,
  refresh = false
) => {
  const query = cleanParams({ registration_id, registration_code, ...(refresh ? { refresh: 1 } : {}) });
  const url = `${API_BASE_URL}/portal/sdk/marks/data?${query}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store'
  });
  if (!response.ok) {
    throw new Error('Failed to fetch marks data');
  }
  const json = await response.json();
  return json?.data || { courses: [], exams: [] };
};
