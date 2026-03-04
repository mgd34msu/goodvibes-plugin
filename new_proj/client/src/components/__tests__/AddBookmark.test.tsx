import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AddBookmark from '../AddBookmark';
import type { BookmarkFormData } from '../../types/bookmark';

describe('AddBookmark', () => {
  const onAdd = vi.fn<(data: BookmarkFormData) => Promise<void>>();

  beforeEach(() => {
    vi.clearAllMocks();
    onAdd.mockResolvedValue(undefined);
  });

  function renderComponent() {
    return render(<AddBookmark onAdd={onAdd} />);
  }

  it('renders the form with all fields', () => {
    renderComponent();
    expect(screen.getByLabelText(/url/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/title/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/description/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/tags/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add bookmark/i })).toBeInTheDocument();
  });

  it('submits form with correct data', async () => {
    renderComponent();
    await userEvent.type(screen.getByLabelText(/url/i), 'https://example.com');
    await userEvent.type(screen.getByLabelText(/title/i), 'Test Bookmark');
    await userEvent.type(screen.getByLabelText(/description/i), 'A description');
    await userEvent.type(screen.getByLabelText(/tags/i), 'tag1, tag2');
    await userEvent.click(screen.getByRole('button', { name: /add bookmark/i }));
    await waitFor(() => {
      expect(onAdd).toHaveBeenCalledWith({
        url: 'https://example.com',
        title: 'Test Bookmark',
        description: 'A description',
        tags: 'tag1, tag2',
      });
    });
  });

  it('shows error when URL is missing', async () => {
    renderComponent();
    await userEvent.type(screen.getByLabelText(/title/i), 'Test');
    await userEvent.click(screen.getByRole('button', { name: /add bookmark/i }));
    expect(screen.getByRole('alert')).toHaveTextContent('URL is required');
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('shows error when title is missing', async () => {
    renderComponent();
    await userEvent.type(screen.getByLabelText(/url/i), 'https://example.com');
    await userEvent.click(screen.getByRole('button', { name: /add bookmark/i }));
    expect(screen.getByRole('alert')).toHaveTextContent('Title is required');
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('shows error from API failure', async () => {
    onAdd.mockRejectedValue(new Error('Server error'));
    renderComponent();
    await userEvent.type(screen.getByLabelText(/url/i), 'https://example.com');
    await userEvent.type(screen.getByLabelText(/title/i), 'Test');
    await userEvent.click(screen.getByRole('button', { name: /add bookmark/i }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Server error');
    });
  });

  it('clears form after successful submission', async () => {
    renderComponent();
    await userEvent.type(screen.getByLabelText(/url/i), 'https://example.com');
    await userEvent.type(screen.getByLabelText(/title/i), 'Test Bookmark');
    await userEvent.click(screen.getByRole('button', { name: /add bookmark/i }));
    await waitFor(() => {
      expect(screen.getByLabelText(/url/i)).toHaveValue('');
      expect(screen.getByLabelText(/title/i)).toHaveValue('');
    });
  });

  it('shows success message after adding', async () => {
    renderComponent();
    await userEvent.type(screen.getByLabelText(/url/i), 'https://example.com');
    await userEvent.type(screen.getByLabelText(/title/i), 'Test');
    await userEvent.click(screen.getByRole('button', { name: /add bookmark/i }));
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Bookmark added successfully');
    });
  });

  it('disables form fields while submitting', async () => {
    let resolve: () => void = () => undefined;
    onAdd.mockImplementation(
      () => new Promise<void>((res) => { resolve = res; })
    );
    renderComponent();
    await userEvent.type(screen.getByLabelText(/url/i), 'https://example.com');
    await userEvent.type(screen.getByLabelText(/title/i), 'Test');
    await userEvent.click(screen.getByRole('button', { name: /add bookmark/i }));
    expect(screen.getByLabelText(/url/i)).toBeDisabled();
    expect(screen.getByRole('button', { name: /add bookmark/i })).toBeDisabled();
    resolve();
  });
});
