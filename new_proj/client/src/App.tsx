import { useState, useEffect, useCallback } from 'react';
import type { Bookmark, BookmarkFormData } from './types/bookmark';
import { fetchBookmarks, createBookmark, updateBookmark, deleteBookmark } from './api/bookmarks';
import AddBookmark from './components/AddBookmark';
import BookmarkList from './components/BookmarkList';
import TagFilter from './components/TagFilter';

function App() {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const loadBookmarks = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchBookmarks();
      setBookmarks(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load bookmarks.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBookmarks();
  }, [loadBookmarks]);

  const allTags = Array.from(
    new Set(bookmarks.flatMap((b) => b.tags))
  ).sort();

  async function handleAdd(data: BookmarkFormData): Promise<void> {
    const created = await createBookmark(data);
    setBookmarks((prev) => [created, ...prev]);
  }

  async function handleEdit(id: string, data: BookmarkFormData): Promise<void> {
    const updated = await updateBookmark(id, data);
    setBookmarks((prev) => prev.map((b) => (b.id === id ? updated : b)));
  }

  async function handleDelete(id: string): Promise<void> {
    await deleteBookmark(id);
    setBookmarks((prev) => prev.filter((b) => b.id !== id));
    // Remove from selected tags if no remaining bookmarks have those tags
    setSelectedTags((prev) =>
      prev.filter((tag) =>
        bookmarks.some((b) => b.id !== id && b.tags.includes(tag))
      )
    );
  }

  function handleToggleTag(tag: string) {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  }

  function handleClearTags() {
    setSelectedTags([]);
  }

  function handleTagClick(tag: string) {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev : [...prev, tag]
    );
  }

  return (
    <div className="app">
      <header className="app__header" role="banner">
        <h1 className="app__title">Bookmark Manager</h1>
        <p className="app__subtitle">Save and organize your favorite links</p>
      </header>
      <main className="app__main">
        <AddBookmark onAdd={handleAdd} />
        <TagFilter
          tags={allTags}
          selectedTags={selectedTags}
          onToggleTag={handleToggleTag}
          onClearAll={handleClearTags}
        />
        <BookmarkList
          bookmarks={bookmarks}
          isLoading={isLoading}
          error={error}
          selectedTags={selectedTags}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onTagClick={handleTagClick}
        />
      </main>
      <footer className="app__footer" role="contentinfo">
        <p>Bookmark Manager &mdash; {new Date().getFullYear()}</p>
      </footer>
    </div>
  );
}

export default App;
