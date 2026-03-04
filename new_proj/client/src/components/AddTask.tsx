import { useState, type FormEvent } from 'react';
import type { CreateTaskInput } from '../types/task';

interface AddTaskProps {
  onAdd: (input: CreateTaskInput) => Promise<void>;
}

export function AddTask({ onAdd }: AddTaskProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;

    setSubmitting(true);
    setError(null);
    try {
      await onAdd({
        title: trimmedTitle,
        description: description.trim() || undefined,
      });
      setTitle('');
      setDescription('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add task');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="add-task" onSubmit={handleSubmit}>
      <h2 className="add-task__heading">Add Task</h2>
      {error && <p className="add-task__error" role="alert">{error}</p>}
      <div className="add-task__fields">
        <input
          className="add-task__input"
          type="text"
          placeholder="Task title *"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          disabled={submitting}
        />
        <input
          className="add-task__input"
          type="text"
          placeholder="Description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={submitting}
        />
        <button
          className="add-task__submit"
          type="submit"
          disabled={submitting || !title.trim()}
        >
          {submitting ? 'Adding...' : 'Add Task'}
        </button>
      </div>
    </form>
  );
}
