const PORTAL_URL = 'https://webportal.jiit.ac.in:6011/studentportal/';

// The service worker can be stopped between messages, so the pending request
// lives in session storage instead of a variable.
const getPending = async () => (await chrome.storage.session.get('pending')).pending || null;
const setPending = (pending) =>
  pending ? chrome.storage.session.set({ pending }) : chrome.storage.session.remove('pending');

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message.kind === 'connect' && sender.tab) openPortal(sender.tab);
  if (message.kind === 'portal-login' && sender.tab) deliver(sender.tab.id, message.login);
});

async function openPortal(siteTab) {
  const old = await getPending();
  if (old) chrome.tabs.remove(old.portalTabId).catch(() => {});

  const portalTab = await chrome.tabs.create({ url: PORTAL_URL, openerTabId: siteTab.id });
  await setPending({ siteTabId: siteTab.id, siteWindowId: siteTab.windowId, portalTabId: portalTab.id });
}

async function deliver(fromTabId, login) {
  const pending = await getPending();
  // Only the portal tab JiitSphere opened may hand over a session.
  if (!pending || pending.portalTabId !== fromTabId) return;

  await setPending(null);
  await chrome.tabs.sendMessage(pending.siteTabId, { kind: 'login', login }).catch(() => {});
  chrome.tabs.update(pending.siteTabId, { active: true }).catch(() => {});
  chrome.windows.update(pending.siteWindowId, { focused: true }).catch(() => {});
  chrome.tabs.remove(fromTabId).catch(() => {});
}

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const pending = await getPending();
  if (pending?.portalTabId !== tabId) return;
  await setPending(null);
  chrome.tabs.sendMessage(pending.siteTabId, { kind: 'cancelled' }).catch(() => {});
});
