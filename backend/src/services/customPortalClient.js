class CustomPortalClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
    this.origin = new URL(baseUrl).origin;
  }

  toAbsoluteUrl(path) {
    const rawPath = String(path || '').trim();
    if (/^https?:\/\//i.test(rawPath)) {
      throw new Error('Absolute URLs are not allowed');
    }

    // Root-prefixed paths should resolve against host origin, not /studentportal.
    if (rawPath.startsWith('/')) {
      return new URL(rawPath, this.origin).toString();
    }

    const base = this.baseUrl.endsWith('/') ? this.baseUrl : `${this.baseUrl}/`;
    return new URL(rawPath.replace(/^\/+/, ''), base).toString();
  }

  makeLoginCandidates({ userId, password, captcha, usertype = 'S' }) {
    const candidates = [];

    const payload = {
      username: userId,
      usertype,
      password,
      captcha: { captcha, hidden: 'gmBctEffdSg=' },
    };

    const tokenEndpoints = ['generatewebtoken', 'pretoken-check'];
    tokenEndpoints.forEach((endpoint) => {
      candidates.push({
        path: `/StudentPortalAPI/token/${endpoint}`,
        method: 'POST',
        contentType: 'application/json',
        body: payload,
      });

      // Some installations expect text payloads for token checks.
      candidates.push({
        path: `/StudentPortalAPI/token/${endpoint}`,
        method: 'POST',
        contentType: 'text/plain;charset=UTF-8',
        rawBody: JSON.stringify(payload),
      });
    });

    return candidates;
  }
}

module.exports = CustomPortalClient;
