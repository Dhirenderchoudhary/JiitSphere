// Runs inside the portal page so it can see the portal's own network answers.
// It watches for a successful login, whichever way the student signed in, and
// hands the session fields to portal-relay.js. Nothing leaves the browser from
// here; background.js decides whether JiitSphere asked for it.
(() => {
  const loginFrom = (raw) => {
    let body = raw;
    try {
      if (typeof raw === 'string') body = JSON.parse(raw);
    } catch {
      return null;
    }
    if (body?.status?.responseStatus !== 'Success') return null;

    const res = body.response || {};
    // Google sign-in answers with flat fields; password sign-in nests them in regdata.
    const flat = res.regdata
      ? { ...res.regdata, value: res.regdata.institutelist?.[0]?.value, label: res.regdata.institutelist?.[0]?.label }
      : res;
    return flat.token && flat.value ? flat : null;
  };

  const report = (raw) => {
    const login = loginFrom(raw);
    if (login) window.postMessage({ jiitsphere: 'portal-login', login }, location.origin);
  };

  const send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function (...args) {
    this.addEventListener('load', () => {
      if (this.responseType === 'json') report(this.response);
      else if (this.responseType === '' || this.responseType === 'text') report(this.responseText);
    });
    return send.apply(this, args);
  };

  const nativeFetch = window.fetch;
  window.fetch = async (...args) => {
    const response = await nativeFetch(...args);
    if ((response.headers.get('content-type') || '').includes('json')) {
      response.clone().text().then(report, () => {});
    }
    return response;
  };
})();
