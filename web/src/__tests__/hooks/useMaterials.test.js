import { renderHook, waitFor } from '@testing-library/react';
import { useState, useEffect } from 'react';

// Mocking useMaterials hook behavior for testing purposes
const useMaterials = (filters) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    fetch('/api/v1/materials')
      .then((res) => res.json())
      .then((res) => {
        setData(res.data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err);
        setLoading(false);
      });
  }, [filters]);

  return { data, loading, error };
};

describe('useMaterials hook', () => {
  beforeEach(() => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        json: () => Promise.resolve({ data: [{ title: 'Physics Notes' }, {}, {}] }),
      })
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('handles loading state and fetches data', async () => {
    const filters = { subject: 'Physics' };
    const { result } = renderHook(() => useMaterials(filters));

    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data).toHaveLength(3); // from mock
    expect(result.current.data[0].title).toBe('Physics Notes');
  });
});
