import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import BookmarkList from '../BookmarkList';
import type { Bookmark, BookmarkFormData } from '../../types/bookmark';

const mockBookmarks: Bookmark[] = [
  {
    id: '1',
    url: 'https://example.com',
    title: 'Example',
    tags: ['web'],
    createdAt: '2024-01-01T00:00:00.000Z',
  },
  {
    id: '2',
    url: 'https://react.dev',
    title: 'React Docs',
    description: 'Official React documentation',
    tags: ['react', 'web'],
    createdAt: '2024-01-02T00:00:00.000Z',
  },
];

const defaultProps = {
  bookmarks: mockBookmarks,
  isLoading: false,
  error: null,
  selectedTags: [],
  onEdit: vi.fn<(id: string, data: BookmarkFormData) => Promise<void>>().mockResolvedValue(undefined),
  onDelete: vi.fn<(id: string) => Promise<void>>().mockResolvedValue(undefined),
  onTagClick: vi.fn<(tag: string) => void>(),
};

describe('BookmarkList', () => {
  it('renders all bookmarks when no tag filter', () => {
    render(<BookmarkList {...defaultProps} />);
    expect(screen.getByText('Example')).toBeInTheDocument();
    expect(screen.getByText('React Docs')).toBeInTheDocument();
  });

  it('shows loading state', () => {
    render(<BookmarkList {...defaultProps} isLoading={true} bookmarks={[]} />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading bookmarks');
  });

  it('shows error state', () => {
    render(<BookmarkList {...defaultProps} error="Network failure" bookmarks={[]} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Network failure');
  });

  it('shows empty state when no bookmarks', () => {
    render(<BookmarkList {...defaultProps} bookmarks={[]} />);
    expect(screen.getByText(/no bookmarks yet/i)).toBeInTheDocument();
  });

  it('shows empty state when no bookmarks match tag filter', () => {
    render(<BookmarkList {...defaultProps} selectedTags={['nonexistent']} />);
    expect(screen.getByText(/no bookmarks match/i)).toBeInTheDocument();
  });

  it('filters bookmarks by single tag', () => {
    render(<BookmarkList {...defaultProps} selectedTags={['react']} />);
    expect(screen.queryByText('Example')).not.toBeInTheDocument();
    expect(screen.getByText('React Docs')).toBeInTheDocument();
  });

  it('filters bookmarks by multiple tags (AND logic)', () => {
    render(<BookmarkList {...defaultProps} selectedTags={['react', 'web']} />);
    expect(screen.queryByText('Example')).not.toBeInTheDocument();
    expect(screen.getByText('React Docs')).toBeInTheDocument();
  });

  it('shows count of displayed bookmarks', () => {
    render(<BookmarkList {...defaultProps} />);
    expect(screen.getByText(/showing 2 bookmarks/i)).toBeInTheDocument();
  });

  it('shows singular count for one bookmark', () => {
    render(<BookmarkList {...defaultProps} selectedTags={['react']} />);
    expect(screen.getByText(/showing 1 bookmark/i)).toBeInTheDocument();
  });

  it('shows tag info in count when filtering', () => {
    render(<BookmarkList {...defaultProps} selectedTags={['web']} />);
    expect(screen.getByText(/tagged with: web/i)).toBeInTheDocument();
  });
});
