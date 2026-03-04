import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import * as api from './api/bookmarks';
import type { Bookmark } from './types/bookmark';

vi.mock('./api/bookmarks');

const mockBookmarks: Bookmark[] = [
  {
    id: '1',
    url: 'https://example.com',
    title: 'Example Site',
    description: 'A description',
    tags: ['web'],
    createdAt: '2024-01-01T00:00:00.000Z',
  },
  {
    id: '2',
    url: 'https://react.dev',
    title: 'React Docs',
    tags: ['react', 'web'],
    createdAt: '2024-01-02T00:00:00.000Z',
  },
];

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.fetchBookmarks).mockResolvedValue(mockBookmarks);
    vi.mocked(api.createBookmark).mockResolvedValue({
      id: '3',
      url: 'https://new.com',
      title: 'New Bookmark',
      tags: [],
      createdAt: new Date().toISOString(),
    });
    vi.mocked(api.updateBookmark).mockResolvedValue(mockBookmarks[0]);
    vi.mocked(api.deleteBookmark).mockResolvedValue(undefined);
  });

  it('renders the app header', async () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /bookmark manager/i, level: 1 })).toBeInTheDocument();
    await waitFor(() => expect(api.fetchBookmarks).toHaveBeenCalledOnce());
  });

  it('loads and displays bookmarks', async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText('Example Site')).toBeInTheDocument();
      expect(screen.getByText('React Docs')).toBeInTheDocument();
    });
  });

  it('shows error state when API fails', async () => {
    vi.mocked(api.fetchBookmarks).mockRejectedValue(new Error('Network error'));
    render(<App />);
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Network error');
    });
  });

  it('adds a new bookmark', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText('Example Site')).toBeInTheDocument());

    // Scope queries to the add bookmark form section (landmark region)
    const addSection = screen.getByRole('region', { name: /add bookmark/i });
    await userEvent.type(within(addSection).getByLabelText(/url/i), 'https://new.com');
    await userEvent.type(within(addSection).getByLabelText(/title/i), 'New Bookmark');
    await userEvent.click(within(addSection).getByRole('button', { name: /add bookmark/i }));

    await waitFor(() => {
      expect(api.createBookmark).toHaveBeenCalledWith(
        expect.objectContaining({ url: 'https://new.com', title: 'New Bookmark' })
      );
    });
    await waitFor(() => {
      expect(screen.getByText('New Bookmark')).toBeInTheDocument();
    });
  });

  it('displays tag filter with available tags', async () => {
    render(<App />);
    // TagFilter only appears after bookmarks load (tags derived from bookmarks)
    const tagFilterGroup = await screen.findByRole('group', { name: /filter bookmarks by tag/i });
    expect(within(tagFilterGroup).getByRole('button', { name: /filter by tag: web/i })).toBeInTheDocument();
    expect(within(tagFilterGroup).getByRole('button', { name: /filter by tag: react/i })).toBeInTheDocument();
  });

  it('filters bookmarks by tag when tag filter is clicked', async () => {
    render(<App />);
    // Wait for tag filter to appear (after bookmarks load)
    const tagFilterGroup = await screen.findByRole('group', { name: /filter bookmarks by tag/i });

    // Click the react tag in the filter bar only
    await userEvent.click(within(tagFilterGroup).getByRole('button', { name: /filter by tag: react/i }));

    await waitFor(() => {
      expect(screen.queryByText('Example Site')).not.toBeInTheDocument();
      expect(screen.getByText('React Docs')).toBeInTheDocument();
    });
  });

  it('deletes a bookmark', async () => {
    vi.stubGlobal('confirm', () => true);
    render(<App />);
    await waitFor(() => expect(screen.getByText('Example Site')).toBeInTheDocument());
    const deleteButtons = screen.getAllByRole('button', { name: /delete bookmark: example site/i });
    await userEvent.click(deleteButtons[0]);
    await waitFor(() => {
      expect(api.deleteBookmark).toHaveBeenCalledWith('1');
      expect(screen.queryByText('Example Site')).not.toBeInTheDocument();
    });
    vi.unstubAllGlobals();
  });
});
