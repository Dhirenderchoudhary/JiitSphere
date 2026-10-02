const env = require('../config/env');
const { generatePortalLocalName } = require('../utils/portalCrypto');

const CONFIG_TTL_MS = 5 * 60 * 1000;

// ponytail: Google only mints this credential for origins the college client
// allows (webportal.jiit.ac.in and :6011). This module just exchanges it.
// If the college allowlists another origin, the same call still works.
let configCache = { at: 0, value: null };
let configInflight = null;

const isGoogleCredential = (value) =>
  typeof value === 'string' &&
  value.length >= 80 &&
  value.length <= 8192 &&
  /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value);

const assertCollegeSsoUrl = (ssoUrl, hostname) => {
  let url;
  try {
    url = new URL(ssoUrl);
  } catch (_error) {
    throw new Error('College sign-in URL is invalid');
  }

  if (url.protocol !== 'https:' || url.hostname !== hostname || url.username || url.password) {
    throw new Error('College sign-in URL is not on the portal host');
  }

  return url.toString();
};

const mapGoogleRegdata = (response) => {
  if (!response || typeof response !== 'object') return null;

  const token = String(response.token || '').trim();
  if (!token) return null;

  const instituteId = String(response.value || response.instituteid || '').trim();
  const userid = String(response.userid || response.Username || response.enrollmentno || '').trim();
  const memberid = String(response.memberid || response.studentid || response.membertype || '').trim();

  return {
    token,
    clientid: response.clientid || null,
    companyid: response.companyid || null,
    instituteid: instituteId || null,
    institutelist: instituteId
      ? [{ value: instituteId, label: response.label || response.institutename || '' }]
      : [],
    name: response.name || null,
    enrollmentno: response.enrollmentno || null,
    userid: userid || null,
    memberid: memberid || null,
    membertype: response.membertype || 'S',
    institutename: response.label || response.institutename || null,
  };
};

const collegeErrorMessage = (data) => {
  const errors = data?.status?.errors;
  if (!Array.isArray(errors)) return '';
  return errors
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .join(' ')
    .slice(0, 180);
};

const portalOrigin = () => new URL(env.portalRelayBaseUrl).origin;

const loadGoogleConfig = async () => {
  const origin = portalOrigin();
  const response = await fetch(`${origin}/StudentPortalAPI/token/getlogoClientWise`, {
    method: 'GET',
    headers: {
      Accept: 'application/json, text/plain, */*',
      Origin: origin,
      Referer: `${origin}/studentportal/#/`,
      'X-Requested-With': 'XMLHttpRequest',
      LocalName: generatePortalLocalName(),
    },
    signal: AbortSignal.timeout(env.portalRequestTimeoutMs || 12000),
  });

  const data = await response.json().catch(() => null);
  const body = data?.response || {};
  const value = {
    enabled: body.loadGoogleButtonShow === 'Y' && Boolean(body.loadGoogleClientId),
    clientId: String(body.loadGoogleClientId || ''),
    ssoUrl: String(body.URLapiBase || ''),
  };

  if (!response.ok || !value.clientId) {
    const error = new Error('College sign-in is unavailable');
    error.statusCode = 503;
    throw error;
  }

  configCache = { at: Date.now(), value };
  return value;
};

const fetchGoogleConfig = () => {
  if (configCache.value && Date.now() - configCache.at < CONFIG_TTL_MS) {
    return Promise.resolve(configCache.value);
  }
  if (!configInflight) {
    configInflight = loadGoogleConfig().finally(() => {
      configInflight = null;
    });
  }
  return configInflight;
};

const exchangeGoogleToken = async (googleToken) => {
  const config = await fetchGoogleConfig();
  if (!config.enabled || !config.ssoUrl) {
    const error = new Error('College Google sign-in is turned off');
    error.statusCode = 503;
    throw error;
  }

  const ssoUrl = assertCollegeSsoUrl(config.ssoUrl, new URL(env.portalRelayBaseUrl).hostname);
  const origin = portalOrigin();
  const response = await fetch(ssoUrl, {
    method: 'POST',
    headers: {
      Accept: 'application/json, text/plain, */*',
      'Content-Type': 'application/json',
      Origin: origin,
      Referer: `${origin}/studentportal/#/`,
      'X-Requested-With': 'XMLHttpRequest',
      LocalName: generatePortalLocalName(),
    },
    body: JSON.stringify({ googleToken, modulename: 'studentportal' }),
    signal: AbortSignal.timeout(env.portalRequestTimeoutMs || 12000),
  });

  const data = await response.json().catch(() => null);
  return { response, data };
};

const resetGoogleConfigCache = () => {
  configCache = { at: 0, value: null };
  configInflight = null;
};

module.exports = {
  isGoogleCredential,
  assertCollegeSsoUrl,
  mapGoogleRegdata,
  collegeErrorMessage,
  fetchGoogleConfig,
  exchangeGoogleToken,
  resetGoogleConfigCache,
};
