import { fetchMaterials, fetchPortalProfile, materialAccessUrl, SessionExpiredError } from './api';

describe('Frontend API wrapper', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    global.fetch = jest.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  describe('materialAccessUrl', () => {
    it('returns the correct URL for viewing', () => {
      expect(materialAccessUrl('123', 'view')).toBe('/api/study-material/access/123?action=view');
    });

    it('returns the correct URL for downloading', () => {
      expect(materialAccessUrl('123', 'download')).toBe(
        '/api/study-material/access/123?action=download'
      );
    });
  });

  describe('fetchMaterials', () => {
    it('calls the backend endpoint with correct params and parses JSON', async () => {
      const mockData = { success: true, data: [{ title: 'Notes' }] };

      global.fetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => mockData,
      });

      const params = { subject: 'Math', year: 1 };
      const res = await fetchMaterials(params);

      // The URL includes the cleanParams serialization
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/backend/materials?subject=Math&year=1'),
        expect.any(Object)
      );
      expect(res).toEqual(mockData);
    });

    it('throws an error if response is not ok', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ message: 'Server error' }),
      });

      await expect(fetchMaterials({})).rejects.toThrow('Server error');
    });
  });

  describe('portal data requests', () => {
    const reply = (status, body) => ({
      ok: status < 400,
      status,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => body,
    });

    it('asks for a new sign-in when the backend has lost the portal session', async () => {
      global.fetch.mockResolvedValueOnce(
        reply(404, {
          success: false,
          message: 'Portal session not found. Please login to portal SDK first.',
        })
      );

      await expect(fetchPortalProfile('token-a', false)).rejects.toBeInstanceOf(
        SessionExpiredError
      );
    });

    it('reports other failures as ordinary errors', async () => {
      global.fetch.mockResolvedValueOnce(reply(404, { success: false, message: 'Not found' }));

      await expect(fetchPortalProfile('token-b', false)).rejects.toThrow('Not found');
    });
  });
});
