window.addEventListener('message', (event) => {
  if (event.source !== window || event.data?.jiitsphere !== 'portal-login') return;
  chrome.runtime.sendMessage({ kind: 'portal-login', login: event.data.login });
});
