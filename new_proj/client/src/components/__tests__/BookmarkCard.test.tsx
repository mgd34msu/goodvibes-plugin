import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BookmarkCard from '../BookmarkCard';
import type { Bookmark, BookmarkFormData } from '../../types/bookmark';

const mockBookmark: Bookmark = {
  id: '1',
  url: 'https://example.com',
  title: 'Example Site',
  description: 'A test description',
  tags: ['web', 'test'],
  createdAt: '2024-01-15T12:00:00.000Z',
};

describe('BookmarkCard', () => {
  const onEdit = vi.fn<(id: string, data: BookmarkFormData) => Promise<void>>();
  const onDelete = vi.fn<(id: string) => Promise<void>>();
  const onTagClick = vi.fn<(tag: string) => void>();

  beforeEach(() => {
    vi.clearAllMocks();
    onEdit.mockResolvedValue(undefined);
    onDelete.mockResolvedValue(undefined);
  });

  function renderCard(overrides?: Partial<Bookmark>) {
    const bookmark = { ...mockBookmark, ...overrides };
    return render(
      <BookmarkCard
        bookmark={bookmark}
        onEdit={onEdit}
        onDelete={onDelete}
        onTagClick={onTagClick}
      />
    );
  }

  it('renders bookmark title as a link', () => {
    renderCard();
    const link = screen.getByRole('link', { name: /open example site in new tab/i });
    expect(link).toHaveAttribute('href', 'https://example.com');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('renders bookmark url', () => {
    renderCard();
    expect(screen.getByText('https://example.com')).toBeInTheDocument();
  });

  it('renders bookmark description', () => {
    renderCard();
    expect(screen.getByText('A test description')).toBeInTheDocument();
  });

  it('renders tags as buttons', () => {
    renderCard();
    expect(screen.getByRole('button', { name: /filter by tag: web/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /filter by tag: test/i })).toBeInTheDocument();
  });

  it('calls onTagClick when tag is clicked', async () => {
    renderCard();
    await userEvent.click(screen.getByRole('button', { name: /filter by tag: web/i }));
    expect(onTagClick).toHaveBeenCalledWith('web');
  });

  it('does not render description section when description is undefined', () => {
    renderCard({ description: undefined });
    expect(screen.queryByText('A test description')).not.toBeInTheDocument();
  });

  it('does not render tags section when tags is empty', () => {
    renderCard({ tags: [] });
    expect(screen.queryByRole('button', { name: /filter by tag/i })).not.toBeInTheDocument();
  });

  describe('edit mode', () => {
    it('enters edit mode on Edit button click', async () => {
      renderCard();
      await userEvent.click(screen.getByRole('button', { name: /edit bookmark: example site/i }));
      expect(screen.getByLabelText(/url/i)).toBeInTheDocument();
      expect(screen.getByDisplayValue('https://example.com')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Example Site')).toBeInTheDocument();
    });

    it('cancels edit mode on Cancel click', async () => {
      renderCard();
      await userEvent.click(screen.getByRole('button', { name: /edit bookmark: example site/i }));
      await userEvent.click(screen.getByRole('button', { name: /cancel editing/i }));
      expect(screen.queryByRole('button', { name: /cancel editing/i })).not.toBeInTheDocument();
      expect(screen.getByRole('link', { name: /open example site in new tab/i })).toBeInTheDocument();
    });

    it('calls onEdit with updated data on Save', async () => {
      renderCard();
      await userEvent.click(screen.getByRole('button', { name: /edit bookmark: example site/i }));
      const titleInput = screen.getByDisplayValue('Example Site');
      await userEvent.clear(titleInput);
      await userEvent.type(titleInput, 'Updated Title');
      await userEvent.click(screen.getByRole('button', { name: /save bookmark changes/i }));
      await waitFor(() => {
        expect(onEdit).toHaveBeenCalledWith('1', expect.objectContaining({ title: 'Updated Title' }));
      });
    });

    it('shows validation error when URL is empty', async () => {
      renderCard();
      await userEvent.click(screen.getByRole('button', { name: /edit bookmark: example site/i }));
      const urlInput = screen.getByDisplayValue('https://example.com');
      await userEvent.clear(urlInput);
      await userEvent.click(screen.getByRole('button', { name: /save bookmark changes/i }));
      expect(screen.getByRole('alert')).toHaveTextContent('URL and title are required');
      expect(onEdit).not.toHaveBeenCalled();
    });

    it('shows error on save failure', async () => {
      onEdit.mockRejectedValue(new Error('Network error'));
      renderCard();
      await userEvent.click(screen.getByRole('button', { name: /edit bookmark: example site/i }));
      await userEvent.click(screen.getByRole('button', { name: /save bookmark changes/i }));
      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent('Network error');
      });
    });
  });

  describe('delete', () => {
    it('calls onDelete after confirmation', async () => {
      vi.stubGlobal('confirm', () => true);
      renderCard();
      await userEvent.click(screen.getByRole('button', { name: /delete bookmark: example site/i }));
      await waitFor(() => {
        expect(onDelete).toHaveBeenCalledWith('1');
      });
      vi.unstubAllGlobals();
    });

    it('does not call onDelete when confirmation is cancelled', async () => {
      vi.stubGlobal('confirm', () => false);
      renderCard();
      await userEvent.click(screen.getByRole('button', { name: /delete bookmark: example site/i }));
      expect(onDelete).not.toHaveBeenCalled();
      vi.unstubAllGlobals();
    });

    it('shows error on delete failure', async () => {
      vi.stubGlobal('confirm', () => true);
      onDelete.mockRejectedValue(new Error('Delete failed'));
      renderCard();
      await userEvent.click(screen.getByRole('button', { name: /delete bookmark: example site/i }));
      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent('Delete failed');
      });
      vi.unstubAllGlobals();
    });
  });
});
