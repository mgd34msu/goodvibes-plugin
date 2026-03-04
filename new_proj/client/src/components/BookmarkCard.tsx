import { useState, type FC } from 'react';
import type { Bookmark, BookmarkFormData } from '../types/bookmark';

interface BookmarkCardProps {
  bookmark: Bookmark;
  onEdit: (id: string, data: BookmarkFormData) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onTagClick: (tag: string) => void;
}

const BookmarkCard: FC<BookmarkCardProps> = ({ bookmark, onEdit, onDelete, onTagClick }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState<BookmarkFormData>({
    url: bookmark.url,
    title: bookmark.title,
    description: bookmark.description ?? '',
    tags: bookmark.tags.join(', '),
  });

  function handleEditStart() {
    setFormData({
      url: bookmark.url,
      title: bookmark.title,
      description: bookmark.description ?? '',
      tags: bookmark.tags.join(', '),
    });
    setError(null);
    setIsEditing(true);
  }

  function handleCancel() {
    setIsEditing(false);
    setError(null);
  }

  async function handleSave() {
    if (!formData.url.trim() || !formData.title.trim()) {
      setError('URL and title are required.');
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      await onEdit(bookmark.id, formData);
      setIsEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save bookmark.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete bookmark "${bookmark.title}"?`)) return;
    setIsDeleting(true);
    setError(null);
    try {
      await onDelete(bookmark.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete bookmark.');
      setIsDeleting(false);
    }
  }

  const formattedDate = new Date(bookmark.createdAt).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  if (isEditing) {
    return (
      <article
        className="bookmark-card bookmark-card--editing"
        aria-label={`Editing bookmark: ${bookmark.title}`}
      >
        {error && (
          <div className="bookmark-card__error" role="alert">
            {error}
          </div>
        )}
        <div className="bookmark-card__field">
          <label htmlFor={`edit-url-${bookmark.id}`} className="bookmark-card__field-label">
            URL *
          </label>
          <input
            id={`edit-url-${bookmark.id}`}
            type="url"
            className="bookmark-card__input"
            value={formData.url}
            onChange={(e) => setFormData((d) => ({ ...d, url: e.target.value }))}
            required
            aria-required="true"
            disabled={isSaving}
          />
        </div>
        <div className="bookmark-card__field">
          <label htmlFor={`edit-title-${bookmark.id}`} className="bookmark-card__field-label">
            Title *
          </label>
          <input
            id={`edit-title-${bookmark.id}`}
            type="text"
            className="bookmark-card__input"
            value={formData.title}
            onChange={(e) => setFormData((d) => ({ ...d, title: e.target.value }))}
            required
            aria-required="true"
            disabled={isSaving}
          />
        </div>
        <div className="bookmark-card__field">
          <label htmlFor={`edit-desc-${bookmark.id}`} className="bookmark-card__field-label">
            Description
          </label>
          <textarea
            id={`edit-desc-${bookmark.id}`}
            className="bookmark-card__input bookmark-card__textarea"
            value={formData.description}
            onChange={(e) => setFormData((d) => ({ ...d, description: e.target.value }))}
            rows={3}
            disabled={isSaving}
          />
        </div>
        <div className="bookmark-card__field">
          <label htmlFor={`edit-tags-${bookmark.id}`} className="bookmark-card__field-label">
            Tags (comma-separated)
          </label>
          <input
            id={`edit-tags-${bookmark.id}`}
            type="text"
            className="bookmark-card__input"
            value={formData.tags}
            onChange={(e) => setFormData((d) => ({ ...d, tags: e.target.value }))}
            placeholder="e.g. react, typescript"
            disabled={isSaving}
          />
        </div>
        <div className="bookmark-card__actions">
          <button
            className="bookmark-card__btn bookmark-card__btn--primary"
            onClick={handleSave}
            disabled={isSaving}
            aria-label="Save bookmark changes"
          >
            {isSaving ? 'Saving...' : 'Save'}
          </button>
          <button
            className="bookmark-card__btn bookmark-card__btn--secondary"
            onClick={handleCancel}
            disabled={isSaving}
            aria-label="Cancel editing"
          >
            Cancel
          </button>
        </div>
      </article>
    );
  }

  return (
    <article className="bookmark-card" aria-label={`Bookmark: ${bookmark.title}`}>
      {error && (
        <div className="bookmark-card__error" role="alert">
          {error}
        </div>
      )}
      <header className="bookmark-card__header">
        <h2 className="bookmark-card__title">
          <a
            href={bookmark.url}
            target="_blank"
            rel="noopener noreferrer"
            className="bookmark-card__link"
            aria-label={`Open ${bookmark.title} in new tab`}
          >
            {bookmark.title}
          </a>
        </h2>
        <time className="bookmark-card__date" dateTime={bookmark.createdAt}>
          {formattedDate}
        </time>
      </header>
      <p className="bookmark-card__url" aria-label="URL">
        {bookmark.url}
      </p>
      {bookmark.description && (
        <p className="bookmark-card__description">{bookmark.description}</p>
      )}
      {bookmark.tags.length > 0 && (
        <div className="bookmark-card__tags" aria-label="Tags">
          {bookmark.tags.map((tag) => (
            <button
              key={tag}
              className="bookmark-card__tag"
              onClick={() => onTagClick(tag)}
              aria-label={`Filter by tag: ${tag}`}
            >
              {tag}
            </button>
          ))}
        </div>
      )}
      <div className="bookmark-card__actions">
        <button
          className="bookmark-card__btn bookmark-card__btn--secondary"
          onClick={handleEditStart}
          aria-label={`Edit bookmark: ${bookmark.title}`}
        >
          Edit
        </button>
        <button
          className="bookmark-card__btn bookmark-card__btn--danger"
          onClick={() => void handleDelete()}
          disabled={isDeleting}
          aria-label={`Delete bookmark: ${bookmark.title}`}
        >
          {isDeleting ? 'Deleting...' : 'Delete'}
        </button>
      </div>
    </article>
  );
};

export default BookmarkCard;
