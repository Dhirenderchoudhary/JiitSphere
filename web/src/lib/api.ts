const BACKEND_PROXY_BASE_URL = '/api/backend';
const PORTAL_PROXY_BASE_URL = '/api/portal-auth';
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

const portalUrl = (path: string, params: QueryParams = {}): string => {
  const query = cleanParams(params);
  return `${PORTAL_PROXY_BASE_URL}${path}${query ? `?${query}` : ''}`;
};

const backendUrl = (path: string, params: QueryParams = {}): string => {
  const query = cleanParams(params);
  return `${BACKEND_PROXY_BASE_URL}${path}${query ? `?${query}` : ''}`;
};

export const materialAccessUrl = (id: string, action: 'view' | 'download' = 'view'): string =>
  `/api/study-material/access/${encodeURIComponent(id)}?action=${encodeURIComponent(action)}`;

const portalFetch = async (path: string, options: FetchWithTimeoutOptions = {}, params: QueryParams = {}): Promise<Response> =>
  fetchWithTimeout(portalUrl(path, params), {
    cache: 'no-store',
    ...options,
    timeoutMs: options.timeoutMs || DEFAULT_API_TIMEOUT_MS,
    retries: options.retries ?? DEFAULT_API_RETRIES
  });

const portalJsonRequest = async <T = JsonObject>(
  path: string,
  options: FetchWithTimeoutOptions = {},
  params: QueryParams = {}
): Promise<T> => {
  const response = await portalFetch(path, options, params);
  const data = await parseJson<T & { message?: string }>(response);
  if (!response.ok) throw new Error(data.message || 'Portal request failed');
  return data;
};

const backendJsonRequest = async <T = JsonObject>(
  path: string,
  options: FetchWithTimeoutOptions = {},
  params: QueryParams = {}
): Promise<T> => {
  const response = await fetchWithTimeout(backendUrl(path, params), {
    cache: 'no-store',
    ...options,
    timeoutMs: options.timeoutMs || DEFAULT_API_TIMEOUT_MS,
    retries: options.retries ?? DEFAULT_API_RETRIES
  });
  const data = await parseJson<T & { message?: string }>(response);
  if (!response.ok) throw new Error(data.message || 'Backend request failed');
  return data;
};

const withRealtime = (params: QueryParams = {}, refresh = PORTAL_REALTIME_DEFAULT): QueryParams => ({
  ...(params || {}),
  ...(refresh ? { refresh: 1 } : {})
});

const sdkGet = async <T = JsonObject>(token: string, path: string, params: QueryParams = {}): Promise<T> => {
  const response = await portalFetch(path, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
    timeoutMs: DEFAULT_API_TIMEOUT_MS,
    retries: DEFAULT_API_RETRIES
  }, params);
  if (response.status === 401) throw new SessionExpiredError();
  const data = await parseJson<T & { message?: string }>(response);
  if (!response.ok) throw new Error(data.message || 'SDK request failed');
  return data;
};

export const fetchFilterOptions = async () => {
  return backendJsonRequest('/materials/filters/options');
};

export const fetchBrowseOptions = async (params: QueryParams) => {
  return backendJsonRequest('/materials/filters/browse', {}, params);
};

export const fetchMaterials = async (params: QueryParams) => {
  return backendJsonRequest('/materials', {}, params);
};

export const fetchMaterialById = async (id: string) => {
  return backendJsonRequest(`/materials/${id}`);
};

export const loginUser = async (payload: JsonObject) => {
  return portalJsonRequest('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
};

export const loginPortalDemo = async () => {
  return portalJsonRequest('/auth/demo-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
};

export const fetchPortalStatus = async (token: string) => {
  const profile = await portalJsonRequest<{ data?: { user?: unknown } }>('/auth/me', {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  const status = await portalJsonRequest<JsonObject>('/portal/status', {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
  return { ...status, user: profile?.data?.user || null };
};

export const fetchMe = async (token: string) => {
  return portalJsonRequest('/auth/me', {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
};

export const fetchAdminAnalytics = async (token: string) => {
  return portalJsonRequest('/auth/analytics', {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
};

export const fetchStudyAnalytics = async () => {
  const response = await fetch('/api/admin/study-analytics', { cache: 'no-store' });
  const data = await parseJson<{ message?: string } & JsonObject>(response);
  if (!response.ok) throw new Error(data.message || 'Failed to fetch study analytics');
  return data;
};

export const startPortalRelaySession = async (token: string) => {
  return portalJsonRequest('/portal/relay/start', {
    method: 'POST',
    headers: authHeader(token)
  });
};

export const fetchPortalRelayCaptcha = async (token: string, payload: JsonObject = {}) => {
  return portalJsonRequest('/portal/relay/captcha', {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify(payload)
  });
};

export const tryPortalRelayLogin = async (token: string, payload: JsonObject) => {
  return portalJsonRequest('/portal/relay/try-login', {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify(payload)
  });
};

export const portalRelayRequest = async (token: string, payload: JsonObject) => {
  return portalJsonRequest('/portal/relay/request', {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify(payload)
  });
};

export const portalSdkLogin = async (token: string, payload: JsonObject) => {
  return portalJsonRequest('/portal/sdk/login', {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify(payload)
  });
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

export const fetchPortalProfilePhotoBlob = async (token: string, source: string) => {
  const response = await portalFetch('/portal/sdk/profile/photo', {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store'
  }, { source });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({} as { message?: string }));
    throw new Error(errorData.message || 'Failed to fetch official portal profile photo');
  }

  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  const blob = await response.blob();
  if (!contentType.startsWith('image/') || blob.size <= 0) {
    throw new Error('Official portal profile photo response is invalid');
  }
  return blob;
};
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
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(5000, PORTAL_MARKS_DOWNLOAD_TIMEOUT_MS));

  let response: Response;
  try {
    response = await portalFetch('/portal/sdk/marks/download', {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal
    }, { registration_id, registration_code });
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
  const response = await portalFetch('/portal/sdk/marks/data', {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store'
  }, { registration_id, registration_code, ...(refresh ? { refresh: 1 } : {}) });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({} as { message?: string }));
    throw new Error(errorData.message || 'Failed to fetch marks data');
  }
  const json = await response.json();
  return json?.data || { courses: [], exams: [] };
};
