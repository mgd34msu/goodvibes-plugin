import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TaskItem } from './TaskItem';
import type { Task } from '../types/task';

const baseTask: Task = {
  id: '1',
  title: 'Test task',
  completed: false,
  createdAt: new Date().toISOString(),
};

describe('TaskItem', () => {
  it('renders task title', () => {
    render(<TaskItem task={baseTask} onToggle={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText('Test task')).toBeInTheDocument();
  });

  it('renders description when provided', () => {
    render(
      <TaskItem
        task={{ ...baseTask, description: 'A description' }}
        onToggle={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByText('A description')).toBeInTheDocument();
  });

  it('calls onToggle with inverted completed when toggle button clicked', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(<TaskItem task={baseTask} onToggle={onToggle} onDelete={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Mark complete' }));
    expect(onToggle).toHaveBeenCalledWith('1', true);
  });

  it('calls onDelete when delete button clicked', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    render(<TaskItem task={baseTask} onToggle={vi.fn()} onDelete={onDelete} />);

    await user.click(screen.getByRole('button', { name: 'Delete task' }));
    expect(onDelete).toHaveBeenCalledWith('1');
  });

  it('shows completed aria-label when task is completed', () => {
    render(
      <TaskItem
        task={{ ...baseTask, completed: true }}
        onToggle={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Mark incomplete' })).toBeInTheDocument();
  });
});
