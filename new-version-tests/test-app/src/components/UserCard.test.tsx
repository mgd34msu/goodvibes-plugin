import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UserCard } from './UserCard';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
}

describe('UserCard', () => {
  const mockUser: User = {
    id: 'user-123',
    name: 'John Doe',
    email: 'john.doe@example.com',
    role: 'admin',
  };

  const mockOnDelete = vi.fn();

  beforeEach(() => {
    mockOnDelete.mockClear();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Rendering', () => {
    it('renders user information correctly', () => {
      render(<UserCard user={mockUser} onDelete={mockOnDelete} />);

      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.getByText('john.doe@example.com')).toBeInTheDocument();
      // Role is rendered as "Role: <strong>admin</strong>" so text is split across nodes
      expect(screen.getByText('admin')).toBeInTheDocument();
    });

    it('renders delete button with correct initial text', () => {
      render(<UserCard user={mockUser} onDelete={mockOnDelete} />);

      const deleteButton = screen.getByRole('button', { name: /delete/i });
      expect(deleteButton).toBeInTheDocument();
      expect(deleteButton).toHaveTextContent('Delete');
      expect(deleteButton).not.toBeDisabled();
    });

    it('renders user with different role', () => {
      const editorUser = { ...mockUser, role: 'editor' };
      render(<UserCard user={editorUser} onDelete={mockOnDelete} />);

      expect(screen.getByText('editor')).toBeInTheDocument();
    });

    it('renders user with viewer role', () => {
      const viewerUser = { ...mockUser, role: 'viewer' };
      render(<UserCard user={viewerUser} onDelete={mockOnDelete} />);

      expect(screen.getByText('viewer')).toBeInTheDocument();
    });

    it('does not show error message initially', () => {
      render(<UserCard user={mockUser} onDelete={mockOnDelete} />);

      const errorElements = screen.queryAllByText(/failed to delete/i);
      expect(errorElements).toHaveLength(0);
    });
  });

  describe('Delete Functionality', () => {
    it('calls fetch with correct URL and method when delete button is clicked', async () => {
      const user = userEvent.setup();
      (global.fetch as any).mockResolvedValue({
        ok: true,
        statusText: 'OK',
      });

      render(<UserCard user={mockUser} onDelete={mockOnDelete} />);

      const deleteButton = screen.getByRole('button', { name: /delete/i });
      await user.click(deleteButton);

      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(global.fetch).toHaveBeenCalledWith('/api/users/user-123', {
        method: 'DELETE',
      });
    });

    it('calls onDelete callback with user ID on successful deletion', async () => {
      const user = userEvent.setup();
      (global.fetch as any).mockResolvedValue({
        ok: true,
        statusText: 'OK',
      });

      render(<UserCard user={mockUser} onDelete={mockOnDelete} />);

      const deleteButton = screen.getByRole('button', { name: /delete/i });
      await user.click(deleteButton);

      await waitFor(() => {
        expect(mockOnDelete).toHaveBeenCalledTimes(1);
        expect(mockOnDelete).toHaveBeenCalledWith('user-123');
      });
    });

    it('displays error message when deletion fails with non-ok response', async () => {
      const user = userEvent.setup();
      (global.fetch as any).mockResolvedValue({
        ok: false,
        statusText: 'Internal Server Error',
      });

      render(<UserCard user={mockUser} onDelete={mockOnDelete} />);

      const deleteButton = screen.getByRole('button', { name: /delete/i });
      await user.click(deleteButton);

      await waitFor(() => {
        expect(screen.getByText('Failed to delete user: Internal Server Error')).toBeInTheDocument();
      });

      expect(mockOnDelete).not.toHaveBeenCalled();
    });

    it('displays error message when fetch throws an error', async () => {
      const user = userEvent.setup();
      (global.fetch as any).mockRejectedValue(new Error('Network error'));

      render(<UserCard user={mockUser} onDelete={mockOnDelete} />);

      const deleteButton = screen.getByRole('button', { name: /delete/i });
      await user.click(deleteButton);

      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument();
      });

      expect(mockOnDelete).not.toHaveBeenCalled();
    });

    it('displays generic error message when error is not an Error instance', async () => {
      const user = userEvent.setup();
      (global.fetch as any).mockRejectedValue('String error');

      render(<UserCard user={mockUser} onDelete={mockOnDelete} />);

      const deleteButton = screen.getByRole('button', { name: /delete/i });
      await user.click(deleteButton);

      await waitFor(() => {
        expect(screen.getByText('An unknown error occurred while deleting the user')).toBeInTheDocument();
      });

      expect(mockOnDelete).not.toHaveBeenCalled();
    });
  });

  describe('Loading State', () => {
    it('shows loading text and disables button during deletion', async () => {
      const user = userEvent.setup();
      let resolvePromise: (value: any) => void;
      const fetchPromise = new Promise((resolve) => {
        resolvePromise = resolve;
      });
      (global.fetch as any).mockReturnValue(fetchPromise);

      render(<UserCard user={mockUser} onDelete={mockOnDelete} />);

      const deleteButton = screen.getByRole('button', { name: /delete/i });
      await user.click(deleteButton);

      // Check loading state
      await waitFor(() => {
        // Button text changes to 'Deleting...' and becomes disabled
        // aria-label stays as 'Delete user John Doe', so query by text content
        const loadingButton = screen.getByText('Deleting...');
        expect(loadingButton).toBeInTheDocument();
        expect(loadingButton).toBeDisabled();
      });

      // Resolve the fetch
      resolvePromise!({ ok: true, statusText: 'OK' });

      // Check button returns to normal state
      await waitFor(() => {
        const normalButton = screen.getByText('Delete');
        expect(normalButton).toBeInTheDocument();
        expect(normalButton).not.toBeDisabled();
      });
    });

    it('resets loading state after successful deletion', async () => {
      const user = userEvent.setup();
      (global.fetch as any).mockResolvedValue({
        ok: true,
        statusText: 'OK',
      });

      render(<UserCard user={mockUser} onDelete={mockOnDelete} />);

      const deleteButton = screen.getByRole('button', { name: /delete/i });
      await user.click(deleteButton);

      await waitFor(() => {
        expect(mockOnDelete).toHaveBeenCalled();
      });

      // Button should be enabled again
      const finalButton = screen.getByRole('button', { name: /delete/i });
      expect(finalButton).not.toBeDisabled();
    });

    it('resets loading state after failed deletion', async () => {
      const user = userEvent.setup();
      (global.fetch as any).mockResolvedValue({
        ok: false,
        statusText: 'Bad Request',
      });

      render(<UserCard user={mockUser} onDelete={mockOnDelete} />);

      const deleteButton = screen.getByRole('button', { name: /delete/i });
      await user.click(deleteButton);

      await waitFor(() => {
        expect(screen.getByText(/failed to delete/i)).toBeInTheDocument();
      });

      // Button should be enabled again
      const finalButton = screen.getByRole('button', { name: /delete/i });
      expect(finalButton).not.toBeDisabled();
    });
  });

  describe('Error Clearing', () => {
    it('clears previous error when attempting new deletion', async () => {
      const user = userEvent.setup();
      
      // First deletion fails
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        statusText: 'Server Error',
      });

      render(<UserCard user={mockUser} onDelete={mockOnDelete} />);

      const deleteButton = screen.getByRole('button', { name: /delete/i });
      await user.click(deleteButton);

      await waitFor(() => {
        expect(screen.getByText('Failed to delete user: Server Error')).toBeInTheDocument();
      });

      // Second deletion succeeds
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        statusText: 'OK',
      });

      await user.click(deleteButton);

      await waitFor(() => {
        expect(mockOnDelete).toHaveBeenCalledTimes(1);
      });

      // Error should be cleared
      expect(screen.queryByText('Failed to delete user: Server Error')).not.toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('handles user with empty name', () => {
      const userWithEmptyName = { ...mockUser, name: '' };
      render(<UserCard user={userWithEmptyName} onDelete={mockOnDelete} />);

      // Component should still render without crashing
      expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument();
    });

    it('handles user with empty email', () => {
      const userWithEmptyEmail = { ...mockUser, email: '' };
      render(<UserCard user={userWithEmptyEmail} onDelete={mockOnDelete} />);

      // Component should still render without crashing
      expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument();
    });

    it('handles user with empty role', () => {
      const userWithEmptyRole = { ...mockUser, role: '' };
      render(<UserCard user={userWithEmptyRole} onDelete={mockOnDelete} />);

      // Role is rendered as 'Role: <strong>{role}</strong>' where role is empty string
      // The paragraph containing 'Role: ' still renders
      const button = screen.getByRole('button', { name: /delete user/i });
      expect(button).toBeInTheDocument();
    });

    it('handles very long user name', () => {
      const longName = 'A'.repeat(200);
      const userWithLongName = { ...mockUser, name: longName };
      render(<UserCard user={userWithLongName} onDelete={mockOnDelete} />);

      expect(screen.getByText(longName)).toBeInTheDocument();
    });

    it('handles special characters in user data', () => {
      const specialUser = {
        ...mockUser,
        name: "<script>alert('xss')</script>",
        email: 'test+tag@example.com',
        role: 'admin & user',
      };
      render(<UserCard user={specialUser} onDelete={mockOnDelete} />);

      expect(screen.getByText(specialUser.name)).toBeInTheDocument();
      expect(screen.getByText(specialUser.email)).toBeInTheDocument();
      // Role is rendered inside <strong> tag, so find it directly
      expect(screen.getByText(specialUser.role)).toBeInTheDocument();
    });

    it('handles multiple rapid delete clicks', async () => {
      const user = userEvent.setup();
      let callCount = 0;
      (global.fetch as any).mockImplementation(() => {
        callCount++;
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve({ ok: true, statusText: 'OK' });
          }, 100);
        });
      });

      render(<UserCard user={mockUser} onDelete={mockOnDelete} />);

      const deleteButton = screen.getByRole('button', { name: /delete/i });
      
      // Click multiple times rapidly
      await user.click(deleteButton);
      
      // Button should be disabled, preventing second click from registering
      // Button text changes to 'Deleting...' when loading
      const disabledButton = screen.getByText('Deleting...');
      expect(disabledButton).toBeDisabled();
      
      // Try clicking the disabled button (should not trigger another fetch)
      await user.click(disabledButton);
      
      await waitFor(() => {
        expect(mockOnDelete).toHaveBeenCalledTimes(1);
      }, { timeout: 2000 });

      // Only one fetch should have been called
      expect(callCount).toBe(1);
    });
  });

  describe('Component Styling', () => {
    it('applies card styling', () => {
      const { container } = render(<UserCard user={mockUser} onDelete={mockOnDelete} />);
      
      const card = container.querySelector('div[style*="border"]');
      expect(card).toBeInTheDocument();
    });

    it('applies error styling to error message', async () => {
      const user = userEvent.setup();
      (global.fetch as any).mockResolvedValue({
        ok: false,
        statusText: 'Error',
      });

      const { container } = render(<UserCard user={mockUser} onDelete={mockOnDelete} />);

      const deleteButton = screen.getByRole('button', { name: /delete/i });
      await user.click(deleteButton);

      await waitFor(() => {
        const errorDiv = container.querySelector('div[role="alert"]');
        expect(errorDiv).toBeInTheDocument();
      });
    });
  });

  describe('API Response Variations', () => {
    it('handles 404 response', async () => {
      const user = userEvent.setup();
      (global.fetch as any).mockResolvedValue({
        ok: false,
        statusText: 'Not Found',
      });

      render(<UserCard user={mockUser} onDelete={mockOnDelete} />);

      const deleteButton = screen.getByRole('button', { name: /delete/i });
      await user.click(deleteButton);

      await waitFor(() => {
        expect(screen.getByText('Failed to delete user: Not Found')).toBeInTheDocument();
      });
    });

    it('handles 500 response', async () => {
      const user = userEvent.setup();
      (global.fetch as any).mockResolvedValue({
        ok: false,
        statusText: 'Internal Server Error',
      });

      render(<UserCard user={mockUser} onDelete={mockOnDelete} />);

      const deleteButton = screen.getByRole('button', { name: /delete/i });
      await user.click(deleteButton);

      await waitFor(() => {
        expect(screen.getByText('Failed to delete user: Internal Server Error')).toBeInTheDocument();
      });
    });

    it('handles 204 No Content response (ok but no body)', async () => {
      const user = userEvent.setup();
      (global.fetch as any).mockResolvedValue({
        ok: true,
        statusText: 'No Content',
      });

      render(<UserCard user={mockUser} onDelete={mockOnDelete} />);

      const deleteButton = screen.getByRole('button', { name: /delete/i });
      await user.click(deleteButton);

      await waitFor(() => {
        expect(mockOnDelete).toHaveBeenCalledWith('user-123');
      });

      expect(screen.queryByText(/failed/i)).not.toBeInTheDocument();
    });
  });
});
