import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import UserCard from './UserCard';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('UserCard', () => {
  const mockUser = {
    id: 'user-123',
    name: 'John Doe',
    email: 'john.doe@example.com',
    role: 'admin',
  };

  const mockOnDelete = vi.fn();

  beforeEach(() => {
    mockFetch.mockClear();
    mockOnDelete.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // **** Rendering Tests ****
  describe('Rendering', () => {
    it('renders user name correctly', () => {
      render(<UserCard user={mockUser} onDelete={mockOnDelete} />);

      expect(screen.getByRole('heading', { name: 'John Doe' })).toBeInTheDocument();
    });

    it('renders user email correctly', () => {
      render(<UserCard user={mockUser} onDelete={mockOnDelete} />);

      expect(screen.getByText('john.doe@example.com')).toBeInTheDocument();
    });

    it('renders user role correctly', () => {
      render(<UserCard user={mockUser} onDelete={mockOnDelete} />);

      expect(screen.getByText(/Role: admin/i)).toBeInTheDocument();
    });

    it('renders delete button', () => {
      render(<UserCard user={mockUser} onDelete={mockOnDelete} />);

      const button = screen.getByRole('button', { name: /Delete/i, });
      expect(button).toBeInTheDocument();
      expect(button).not.toBeDisabled();
    });

    it('does not render error message initially', () => {
      render(<UserCard user={mockUser} onDelete={mockOnDelete} />);

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  // **** Delete Action Tests ****
  describe('Delete Action', () => {
    it('calls DELETE API endpoint with correct user ID', async () => {
      const user = userEvent.setup();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      } as Response);

      render(<UserCard user={mockUser} onDelete={mockOnDelete} />);

      const button = screen.getByRole('button', { name: /Delete/i });
      await user.click(button);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/users/user-123',
        { method: 'DELETE' }
      );
    });

    it('calls onDelete callback with user ID on success', async () => {
      const user = userEvent.setup();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      } as Response);

      render(<UserCard user={mockUser} onDelete={mockOnDelete} />);

      const button = screen.getByRole('button', { name: /Delete/i });
      await user.click(button);

      await waitFor(() => {
        expect(mockOnDelete).toHaveBeenCalledTimes(1);
      });
      expect(mockOnDelete).toHaveBeenCalledWith('user-123');
    });

    it('does not call onDelete if API fails', async () => {
      const user = userEvent.setup();
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Not found' }),
      } as Response);

      render(<UserCard user={mockUser} onDelete={mockOnDelete} />);

      const button = screen.getByRole('button', { name: /Delete/i });
      await user.click(button);

      await waitFor(() => {
        expect(screen.getByText('Failed')).toBeInTheDocument();
      });

      expect(mockOnDelete).not.toHaveBeenCalled();
    });
  });

  // **** Loading State Tests ****
  describe('Loading State', () => {
    it('shows loading text while deleting', async () => {
      const user = userEvent.setup();
      // Make fetch hang to capture loading state
      mockFetch.mockImplementation(() => 
        new Promise((resolve) => setTimeout(() => resolve({ ok: true } as Response), 100))
      );

      render(<UserCard user={mockUser} onDelete={mockOnDelete} />);

      const button = screen.getByRole('button', { name: /Delete/i, });
      await user.click(button);

      // Check loading state
      expect(screen.getByRole('button', { name: /Deleting\.\.\./i })).toBeInTheDocument();
    });

    it('disables button during loading', async () => {
      const user = userEvent.setup();
      // Make fetch hang to capture loading state
      mockFetch.mockImplementation(() => 
        new Promise((resolve) => setTimeout(() => resolve({ ok: true } as Response), 100))
      );

      render(<UserCard user={mockUser} onDelete={mockOnDelete} />);

      const button = screen.getByRole('button', { name: /Delete/i, });
      await user.click(button);

      // Button should be disabled
      const disabledButton = screen.getByRole('button', { name: /Deleting\.\.\./i });
      expect(disabledButton).toBeDisabled();
    });

    it('restores button state after successful delete', async () => {
      const user = userEvent.setup();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      } as Response);

      render(<UserCard user={mockUser} onDelete={mockOnDelete} />);

      const button = screen.getByRole('button', { name: /Delete/i });
      await user.click(button);

      await waitFor(() => {
        const restoredButton = screen.getByRole('button', { name: /Delete/i });
        expect(restoredButton).not.toBeDisabled();
      });
    });

    it('restores button state after failed delete', async () => {
      const user = userEvent.setup();
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Failed' }),
      } as Response);

      render(<UserCard user={mockUser} onDelete={mockOnDelete} />);

      const button = screen.getByRole('button', { name: /Delete/i });
      await user.click(button);

      await waitFor(() => {
        const restoredButton = screen.getByRole('button', { name: /Delete/i });
        expect(restoredButton).not.toBeDisabled();
      });
    });
  });

  // **** Error State Tests ****
  describe('Error State', () => {
    it('displays error message when API fails', async () => {
      const user = userEvent.setup();
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Not found' }),
      } as Response);

      render(<UserCard user={mockUser} onDelete={mockOnDelete} />);

      const button = screen.getByRole('button', { name: /Delete/i });
      await user.click(button);

      await waitFor(() => {
        expect(screen.getByText('Failed')).toBeInTheDocument();
      });
    });

    it('displays error message when network request throws', async () => {
      const user = userEvent.setup();
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      render(<UserCard user={mockUser} onDelete={mockOnDelete} />);

      const button = screen.getByRole('button', { name: /Delete/i });
      await user.click(button);

      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument();
      });
    });

    it('error message should be red', () => {
      const user = userEvent.setup();
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Failed' }),
      } as Response);

      render(<UserCard user={mockUser} onDelete={mockOnDelete} />);

      const button = screen.getByRole('button', { name: /Delete/i });
      await user.click(button);

      // Wait for error to appear
      await waitFor() => {
        const errorElement = screen.getByText('Failed');
        expect(errorElement).toHaveStyle({ color: 'red' });
      });
    });

    it('does not show error message on successful delete', async () => {
      const user = userEvent.setup();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      } as Response);

      render(<UserCard user={mockUser} onDelete={mockOnDelete} />);

      const button = screen.getByRole('button', { name: /Delete/i });
      await user.click(button);

      await waitFor(() => {
        expect(mockOnDelete).toHaveBeenCalled();
      });

      // Error should not be present
      expect(screen.queryByText('Failed')).not.toBeInTheDocument();
    });
  });

  // **** Edge Cases ****
  describe('Edge Cases', () => {
    it('handles user with special characters in name', () => {
      const specialUser = {
        ...mockUser,
        name: 'John "Jake" Doe',
      };

      render(<UserCard user={specialUser} onDelete={mockOnDelete} />);

      expect(screen.getByRole('heading', { name: /John "Jake" Doe/i, })).toBeInTheDocument();
    });

    it('handles user with empty role', () => {
      const userWithEmptyRole = {
        ...mockUser,
        role: '',
      };

      render(<UserCard user={userWithEmptyRole} onDelete={mockOnDelete} />);

      expect(screen.getByText(/Role:/i)).toBeInTheDocument();
    });

    it('does not allow multiple simultaneous deletes', async () => {
      const user = userEvent.setup();
      // Make fetch hang to keep button disabled
      mockFetch.mockImplementation(() => 
        new Promise((resolve) => setTimeout(() => resolve({ ok: true } as Response), 200))
      );

      render(<UserCard user={mockUser} onDelete={mockOnDelete} />);

      const button = screen.getByRole('button', { name: /Delete/i });
      
      // Click once
      await user.click(button);

      // Try to click again immediately
      const disabledButton = screen.getByRole('button', { name: /Deleting\.\.\./i });
      expect(disabledButton).toBeDisabled();

      // Fetch should only be called once
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });
});
