
const PORTAL_URL = 'https://webportal.jiit.ac.in:6011/studentportal/#/';
const JPORTAL_UI_URL = 'https://yashmalik.tech/jportal/';

const extract = (pattern, value) => {
  const match = value.match(pattern);
  return match?.[1]?.trim() || null;
};

const getPortalStatus = async (_req, res, next) => {
  const controller = new AbortController();
  const timeoutMs = 12000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(PORTAL_URL, { signal: controller.signal });
    const html = await response.text();

    const studentPortalVersion = extract(/Student Portal Version:\s*<\/?[^>]*>\s*([^<\n]+)/i, html);
    const productVersion = extract(/Product version:\s*<\/?[^>]*>\s*([^<\n]+)/i, html);

    const notices = [];
    const noticeMatches = html.match(/ANNOUNCEMENTS[\s\S]*?<\/div>/i)?.[0] || '';
    const noticeTextMatches = noticeMatches.match(/&raquo;|»\s*([^<\n]+)/g) || [];

    noticeTextMatches.forEach((entry) => {
      const line = entry.replace('&raquo;', '').replace('»', '').trim();
      if (line) notices.push(line);
    });

    return res.status(200).json({
      success: true,
      data: {
        portalUrl: PORTAL_URL,
        jportalUiUrl: JPORTAL_UI_URL,
        productVersion,
        studentPortalVersion,
        announcements: notices
      }
    });
  } catch (error) {
    return next(error);
  } finally {
    clearTimeout(timer);
  }
};

module.exports = {
  getPortalStatus
};
