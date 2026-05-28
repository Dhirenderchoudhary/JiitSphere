import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import DownloadButton from './DownloadButton';

describe('DownloadButton', () => {
  let mockFetch;
  let mockCreateObjectURL;
  let mockRevokeObjectURL;

  beforeEach(() => {
    mockCreateObjectURL = jest.fn(() => 'blob:mock');
    mockRevokeObjectURL = jest.fn();
    global.URL.createObjectURL = mockCreateObjectURL;
    global.URL.revokeObjectURL = mockRevokeObjectURL;

    mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      blob: async () => new Blob(['dummy content']),
    });
    global.fetch = mockFetch;
  });

  afterEach(() => {
    delete global.fetch;
    jest.clearAllMocks();
  });

  it('renders correctly and handles download', async () => {
    render(<DownloadButton fileUrl="http://example.com/file.pdf" filename="test.pdf" />);

    const button = screen.getByRole('button', { name: /download/i });
    expect(button).toBeInTheDocument();

    fireEvent.click(button);
    expect(button).toHaveTextContent('Downloading…');
    expect(button).toBeDisabled();

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('http://example.com/file.pdf');
    });

    await waitFor(() => {
      expect(button).toHaveTextContent('Download');
    });
    expect(button).toBeEnabled();
  });

  it('falls back to window.open if fetch fails', async () => {
    const mockOpen = jest.spyOn(window, 'open').mockImplementation(() => {});
    mockFetch.mockRejectedValue(new Error('Network error'));

    render(<DownloadButton fileUrl="http://example.com/file.pdf" />);

    const button = screen.getByRole('button', { name: /download/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(mockOpen).toHaveBeenCalledWith('http://example.com/file.pdf', '_blank');
    });

    mockOpen.mockRestore();
  });
});
