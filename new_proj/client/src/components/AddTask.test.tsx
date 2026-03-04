import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AddTask } from './AddTask';

describe('AddTask', () => {
  it('renders form with title and description inputs', () => {
    render(<AddTask onAdd={vi.fn()} />);
    expect(screen.getByPlaceholderText('Task title *')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Description (optional)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add Task' })).toBeInTheDocument();
  });

  it('calls onAdd with title and resets form on success', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn().mockResolvedValue(undefined);
    render(<AddTask onAdd={onAdd} />);

    await user.type(screen.getByPlaceholderText('Task title *'), 'My Task');
    await user.type(screen.getByPlaceholderText('Description (optional)'), 'Some desc');
    await user.click(screen.getByRole('button', { name: 'Add Task' }));

    await waitFor(() => {
      expect(onAdd).toHaveBeenCalledWith({ title: 'My Task', description: 'Some desc' });
    });
    expect(screen.getByPlaceholderText('Task title *')).toHaveValue('');
    expect(screen.getByPlaceholderText('Description (optional)')).toHaveValue('');
  });

  it('shows error message when onAdd rejects', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn().mockRejectedValue(new Error('Network error'));
    render(<AddTask onAdd={onAdd} />);

    await user.type(screen.getByPlaceholderText('Task title *'), 'Fail Task');
    await user.click(screen.getByRole('button', { name: 'Add Task' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Network error');
    });
  });

  it('does not submit when title is empty', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<AddTask onAdd={onAdd} />);

    const btn = screen.getByRole('button', { name: 'Add Task' });
    expect(btn).toBeDisabled();
    await user.click(btn);
    expect(onAdd).not.toHaveBeenCalled();
  });
});
