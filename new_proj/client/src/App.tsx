import { useState, useEffect, useCallback } from 'react';
import './App.css';
import type { Task, CreateTaskInput } from './types/task';
import { fetchTasks, createTask, toggleTask, deleteTask } from './api/tasks';
import { TaskList } from './components/TaskList';
import { AddTask } from './components/AddTask';

export default function App() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadTasks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchTasks();
      setTasks(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tasks');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  const handleAdd = useCallback(async (input: CreateTaskInput) => {
    try {
      const task = await createTask(input);
      setTasks((prev) => [task, ...prev]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add task');
    }
  }, []);

  const handleToggle = useCallback(async (id: string, completed: boolean) => {
    try {
      const updated = await toggleTask(id, completed);
      setTasks((prev) => prev.map((t) => (t.id === id ? updated : t)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update task');
    }
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    try {
      await deleteTask(id);
      setTasks((prev) => prev.filter((t) => t.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete task');
    }
  }, []);

  const completedCount = tasks.filter((t) => t.completed).length;

  return (
    <div className="app">
      <header className="app__header">
        <h1 className="app__title">Task Manager</h1>
        {!loading && (
          <span className="app__stats">
            {completedCount} / {tasks.length} completed
          </span>
        )}
      </header>

      <main className="app__main">
        <AddTask onAdd={handleAdd} />

        <section className="app__tasks">
          <h2 className="app__tasks-heading">Tasks</h2>
          {error && (
            <div className="app__error" role="alert" aria-live="assertive">
              <p>{error}</p>
              <button onClick={() => void loadTasks()}>Retry</button>
            </div>
          )}
          {loading ? (
            <p className="app__loading">Loading tasks...</p>
          ) : (
            <TaskList
              tasks={tasks}
              onToggle={handleToggle}
              onDelete={handleDelete}
            />
          )}
        </section>
      </main>
    </div>
  );
}
