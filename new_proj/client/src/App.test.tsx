import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import * as taskApi from './api/tasks';
import type { Task } from './types/task';

vi.mock('./api/tasks');

const mockTask: Task = {
  id: '1',
  title: 'Sample task',
  completed: false,
  createdAt: new Date().toISOString(),
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe('App', () => {
  it('shows loading state initially', () => {
    vi.mocked(taskApi.fetchTasks).mockReturnValue(new Promise(() => {}));
    render(<App />);
    expect(screen.getByText(/loading tasks/i)).toBeInTheDocument();
  });

  it('renders tasks after loading', async () => {
    vi.mocked(taskApi.fetchTasks).mockResolvedValue([mockTask]);
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText('Sample task')).toBeInTheDocument();
    });
  });

  it('shows error when fetchTasks fails', async () => {
    vi.mocked(taskApi.fetchTasks).mockRejectedValue(new Error('Server error'));
    render(<App />);
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('Server error')).toBeInTheDocument();
    });
  });

  it('shows error when createTask fails', async () => {
    vi.mocked(taskApi.fetchTasks).mockResolvedValue([]);
    vi.mocked(taskApi.createTask).mockRejectedValue(new Error('Create failed'));
    const user = userEvent.setup();
    render(<App />);
    await waitFor(() => expect(screen.queryByText(/loading/i)).not.toBeInTheDocument());

    await user.type(screen.getByPlaceholderText('Task title *'), 'New Task');
    await user.click(screen.getByRole('button', { name: 'Add Task' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  it('displays completed count in header', async () => {
    const completed = { ...mockTask, id: '2', completed: true };
    vi.mocked(taskApi.fetchTasks).mockResolvedValue([mockTask, completed]);
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText('1 / 2 completed')).toBeInTheDocument();
    });
  });
});
