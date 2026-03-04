import { useState, type FC, type FormEvent } from 'react';
import type { BookmarkFormData } from '../types/bookmark';

interface AddBookmarkProps {
  onAdd: (data: BookmarkFormData) => Promise<void>;
}

const initialForm: BookmarkFormData = {
  url: '',
  title: '',
  description: '',
  tags: '',
};

const AddBookmark: FC<AddBookmarkProps> = ({ onAdd }) => {
  const [formData, setFormData] = useState<BookmarkFormData>(initialForm);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (!formData.url.trim()) {
      setError('URL is required.');
      return;
    }
    if (!formData.url.startsWith('http://') && !formData.url.startsWith('https://')) {
      setError('URL must start with http:// or https://');
      return;
    }
    if (!formData.title.trim()) {
      setError('Title is required.');
      return;
    }

    setIsSubmitting(true);
    try {
      await onAdd(formData);
      setFormData(initialForm);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add bookmark.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="add-bookmark" aria-labelledby="add-bookmark-heading">
      <h2 id="add-bookmark-heading" className="add-bookmark__heading">
        Add Bookmark
      </h2>
      {error && (
        <div className="add-bookmark__error" role="alert" aria-live="assertive">
          {error}
        </div>
      )}
      {success && (
        <div className="add-bookmark__success" role="status" aria-live="polite">
          Bookmark added successfully!
        </div>
      )}
      <form
        className="add-bookmark__form"
        onSubmit={(e) => void handleSubmit(e)}
        noValidate
        aria-label="Add bookmark form"
      >
        <div className="add-bookmark__field">
          <label htmlFor="add-url" className="add-bookmark__label">
            URL <span aria-hidden="true">*</span>
          </label>
          <input
            id="add-url"
            type="url"
            className="add-bookmark__input"
            value={formData.url}
            onChange={(e) => setFormData((d) => ({ ...d, url: e.target.value }))}
            placeholder="https://example.com"
            required
            aria-required="true"
            disabled={isSubmitting}
            autoComplete="url"
          />
        </div>
        <div className="add-bookmark__field">
          <label htmlFor="add-title" className="add-bookmark__label">
            Title <span aria-hidden="true">*</span>
          </label>
          <input
            id="add-title"
            type="text"
            className="add-bookmark__input"
            value={formData.title}
            onChange={(e) => setFormData((d) => ({ ...d, title: e.target.value }))}
            placeholder="My Bookmark"
            required
            aria-required="true"
            disabled={isSubmitting}
          />
        </div>
        <div className="add-bookmark__field">
          <label htmlFor="add-description" className="add-bookmark__label">
            Description
          </label>
          <textarea
            id="add-description"
            className="add-bookmark__input add-bookmark__textarea"
            value={formData.description}
            onChange={(e) => setFormData((d) => ({ ...d, description: e.target.value }))}
            placeholder="Optional description"
            rows={3}
            disabled={isSubmitting}
          />
        </div>
        <div className="add-bookmark__field">
          <label htmlFor="add-tags" className="add-bookmark__label">
            Tags
          </label>
          <input
            id="add-tags"
            type="text"
            className="add-bookmark__input"
            value={formData.tags}
            onChange={(e) => setFormData((d) => ({ ...d, tags: e.target.value }))}
            placeholder="e.g. react, typescript, web"
            disabled={isSubmitting}
            aria-describedby="add-tags-hint"
          />
          <span className="add-bookmark__hint" id="add-tags-hint">
            Separate multiple tags with commas
          </span>
        </div>
        <button
          type="submit"
          className="add-bookmark__submit"
          disabled={isSubmitting}
          aria-label="Add bookmark"
        >
          {isSubmitting ? 'Adding...' : 'Add Bookmark'}
        </button>
      </form>
    </section>
  );
};

export default AddBookmark;
