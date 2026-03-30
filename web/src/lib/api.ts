const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000/api/v1';
const PORTAL_REALTIME_DEFAULT = String(process.env.NEXT_PUBLIC_PORTAL_REALTIME || 'false').toLowerCase() === 'true';

type Primitive = string | number | boolean;
type QueryValue = Primitive | null | undefined;
type QueryParams = Record<string, QueryValue>;
type JsonObject = Record<string, unknown>;

const cleanParams = (params: QueryParams = {}): string => {
  const entries = Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '');
  return new URLSearchParams(entries as Array<[string, string]>).toString();
};

const parseJson = async <T = JsonObject>(response: Response): Promise<T> => {
  return (await response.json()) as T;
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
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store'
  });
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
export const fetchPortalSubjectAttendance = async (token: string, semester: string, subject: string) =>
  sdkGet(token, '/portal/sdk/attendance/subject', withRealtime({ semester, subject }, PORTAL_REALTIME_DEFAULT));
export const fetchPortalProfile = async (token: string, refresh = PORTAL_REALTIME_DEFAULT) =>
  sdkGet(token, '/portal/sdk/profile', withRealtime({}, refresh));
export const fetchPortalGrades = async (token: string, refresh = PORTAL_REALTIME_DEFAULT) =>
  sdkGet(token, '/portal/sdk/grades', withRealtime({}, refresh));
export const fetchPortalExams = async (token: string, refresh = PORTAL_REALTIME_DEFAULT) =>
  sdkGet(token, '/portal/sdk/exams', withRealtime({}, refresh));
export const fetchPortalSubjects = async (token: string, semester: string, refresh = PORTAL_REALTIME_DEFAULT) =>
  sdkGet(token, '/portal/sdk/subjects', withRealtime({ semester }, refresh));

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
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store'
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({} as { message?: string }));
    throw new Error(errorData.message || 'Failed to download marks PDF');
  }
  return response.blob();
};
