const PORTAL_URL = 'https://webportal.jiit.ac.in:6011/studentportal/';

// The service worker can be stopped between messages, so the pending request
// lives in session storage instead of a variable.
const getPending = async () => (await chrome.storage.session.get('pending')).pending || null;
const setPending = (pending) =>
  pending ? chrome.storage.session.set({ pending }) : chrome.storage.session.remove('pending');

// The user can close either tab at any point, so tab calls are allowed to fail.
const logTabError = (action) => (error) => console.debug(`JiitSphere Connect: ${action} failed`, error?.message);

// A failed tab or storage call would otherwise leave the JiitSphere page waiting.
const cancelOnFailure = (siteTabId) => () =>
  chrome.tabs.sendMessage(siteTabId, { kind: 'cancelled' }).catch(logTabError('cancel site tab'));

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message.kind === 'connect' && sender.tab) {
    openPortal(sender.tab).catch(cancelOnFailure(sender.tab.id));
  }
  if (message.kind === 'portal-login' && sender.tab) {
    deliver(sender.tab.id, message.login).catch(async () => {
      const pending = await getPending().catch(() => null);
      if (pending) cancelOnFailure(pending.siteTabId)();
    });
  }
});

async function openPortal(siteTab) {
  const old = await getPending();
  if (old) {
    // Forget it before closing its tab, or onRemoved would cancel the new request.
    await setPending(null);
    await chrome.tabs.remove(old.portalTabId).catch(logTabError('close old portal tab'));
    if (old.siteTabId !== siteTab.id) {
      chrome.tabs.sendMessage(old.siteTabId, { kind: 'cancelled' }).catch(logTabError('cancel old site tab'));
    }
  }

  const portalTab = await chrome.tabs.create({ url: PORTAL_URL, openerTabId: siteTab.id });
  await setPending({ siteTabId: siteTab.id, siteWindowId: siteTab.windowId, portalTabId: portalTab.id });
}

async function deliver(fromTabId, login) {
  const pending = await getPending();
  // Only the portal tab JiitSphere opened may hand over a session.
  if (!pending || pending.portalTabId !== fromTabId) return;

  await setPending(null);
  await chrome.tabs.sendMessage(pending.siteTabId, { kind: 'login', login }).catch(logTabError('send login'));
  chrome.tabs.update(pending.siteTabId, { active: true }).catch(logTabError('focus site tab'));
  chrome.windows.update(pending.siteWindowId, { focused: true }).catch(logTabError('focus site window'));
  chrome.tabs.remove(fromTabId).catch(logTabError('close portal tab'));
}

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const pending = await getPending();
  if (pending?.portalTabId !== tabId) return;
  await setPending(null);
  chrome.tabs.sendMessage(pending.siteTabId, { kind: 'cancelled' }).catch(logTabError('cancel site tab'));
});
