// Bridge between the JiitSphere page and the extension.
// Page -> extension: { jiitsphere: 'hello' } and { jiitsphere: 'connect' }.
// Extension -> page: { jiitsphere: 'here' }, 'login', 'cancelled'.
const toPage = (message) => window.postMessage(message, location.origin);

window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  if (event.data?.jiitsphere === 'hello') toPage({ jiitsphere: 'here' });
  if (event.data?.jiitsphere === 'connect') chrome.runtime.sendMessage({ kind: 'connect' });
});

chrome.runtime.onMessage.addListener((message) => {
  if (message.kind === 'login') toPage({ jiitsphere: 'login', login: message.login });
  if (message.kind === 'cancelled') toPage({ jiitsphere: 'cancelled' });
});

toPage({ jiitsphere: 'here' });
