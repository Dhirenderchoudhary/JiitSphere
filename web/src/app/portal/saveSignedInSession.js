import { TOKEN_KEY, LAST_PORTAL_USER_ID, PORTAL_VERIFIED_KEY } from './constants';

export default function saveSignedInSession(token, userId) {
  window.localStorage.setItem(TOKEN_KEY, token);
  window.localStorage.setItem(LAST_PORTAL_USER_ID, userId);
  window.localStorage.setItem(PORTAL_VERIFIED_KEY, 'true');
  window.localStorage.setItem('jaypee_buddy_identity_mode', 'portal');
  window.localStorage.removeItem('jaypee_buddy_cached_photo');
  window.localStorage.removeItem('jaypee_buddy_cached_profile_name');
  window.dispatchEvent(new Event('jaypee-buddy-identity-updated'));
}
