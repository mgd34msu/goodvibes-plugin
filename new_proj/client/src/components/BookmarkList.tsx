import type { FC } from 'react';
import type { Bookmark, BookmarkFormData } from '../types/bookmark';
import BookmarkCard from './BookmarkCard';

interface BookmarkListProps {
  bookmarks: Bookmark[];
  isLoading: boolean;
  error: string | null;
  selectedTags: string[];
  onEdit: (id: string, data: BookmarkFormData) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onTagClick: (tag: string) => void;
}

const BookmarkList: FC<BookmarkListProps> = ({
  bookmarks,
  isLoading,
  error,
  selectedTags,
  onEdit,
  onDelete,
  onTagClick,
}) => {
  if (isLoading) {
    return (
      <div className="bookmark-list__status" role="status" aria-live="polite">
        <span className="bookmark-list__spinner" aria-hidden="true" />
        Loading bookmarks...
      </div>
    );
  }

  if (error) {
    return (
      <div className="bookmark-list__error" role="alert">
        <strong>Error:</strong> {error}
      </div>
    );
  }

  const filtered =
    selectedTags.length > 0
      ? bookmarks.filter((b) => selectedTags.every((tag) => b.tags.includes(tag)))
      : bookmarks;

  if (filtered.length === 0) {
    return (
      <div className="bookmark-list__empty" role="status" aria-live="polite">
        {selectedTags.length > 0
          ? 'No bookmarks match the selected tags.'
          : 'No bookmarks yet. Add your first bookmark above!'}
      </div>
    );
  }

  return (
    <section aria-label="Bookmarks">
      <p className="bookmark-list__count" aria-live="polite">
        Showing {filtered.length} bookmark{filtered.length !== 1 ? 's' : ''}
        {selectedTags.length > 0 ? ` tagged with: ${selectedTags.join(', ')}` : ''}
      </p>
      <div className="bookmark-list__grid" role="list">
        {filtered.map((bookmark) => (
          <div key={bookmark.id} role="listitem">
            <BookmarkCard
              bookmark={bookmark}
              onEdit={onEdit}
              onDelete={onDelete}
              onTagClick={onTagClick}
            />
          </div>
        ))}
      </div>
    </section>
  );
};

export default BookmarkList;
