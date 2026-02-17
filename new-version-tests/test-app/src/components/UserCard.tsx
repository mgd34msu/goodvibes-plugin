import { useState } from 'react';

/**
 * User entity interface
 */
export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
}

/**
 * UserCard component props
 */
export interface UserCardProps {
  /** User data to display */
  user: User;
  /** Callback when user is successfully deleted */
  onDelete: (userId: string) => void;
  /** Optional CSS class name */
  className?: string;
}

/**
 * Displays user information in a card format with delete functionality
 * 
 * @example
 * ```tsx
 * <UserCard 
 *   user={{ id: '1', name: 'John', email: 'john@example.com', role: 'admin' }}
 *   onDelete={(id) => console.log('Deleted:', id)}
 * />
 * ```
 */
export function UserCard({ user, onDelete, className = '' }: UserCardProps) {
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: 'DELETE',
      });
      
      if (!res.ok) {
        // Parse error response if available
        let errorMessage = `Failed to delete user: ${res.statusText}`;
        try {
          const errorData = await res.json();
          if (errorData.error) {
            errorMessage = errorData.error;
          }
        } catch {
          // If response isn't JSON, use status text
        }
        throw new Error(errorMessage);
      }
      
      onDelete(user.id);
    } catch (e) {
      const errorMessage = e instanceof Error 
        ? e.message 
        : 'An unknown error occurred while deleting the user';
      setError(errorMessage);
      console.error('UserCard delete error:', e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div 
      className={`user-card ${className}`}
      style={{
        border: '1px solid #e5e7eb',
        borderRadius: '8px',
        padding: '16px',
        margin: '8px',
        backgroundColor: '#ffffff',
      }}
      role="article"
      aria-labelledby={`user-name-${user.id}`}
    >
      <h3 id={`user-name-${user.id}`} style={{ margin: '0 0 8px 0' }}>
        {user.name}
      </h3>
      <p style={{ margin: '4px 0', color: '#6b7280' }}>
        {user.email}
      </p>
      <p style={{ margin: '4px 0', color: '#6b7280' }}>
        Role: <strong>{user.role}</strong>
      </p>
      
      {error && (
        <div 
          role="alert" 
          aria-live="assertive"
          style={{
            color: '#dc2626',
            backgroundColor: '#fee2e2',
            padding: '8px',
            borderRadius: '4px',
            marginTop: '8px',
            fontSize: '14px',
          }}
        >
          {error}
        </div>
      )}
      
      <button
        type="button"
        onClick={handleDelete}
        disabled={loading}
        aria-busy={loading}
        aria-label={`Delete user ${user.name}`}
        style={{
          marginTop: '12px',
          padding: '8px 16px',
          backgroundColor: loading ? '#9ca3af' : '#ef4444',
          color: '#ffffff',
          border: 'none',
          borderRadius: '4px',
          cursor: loading ? 'not-allowed' : 'pointer',
          fontSize: '14px',
          fontWeight: '500',
          transition: 'background-color 0.2s',
        }}
      >
        {loading ? 'Deleting...' : 'Delete'}
      </button>
    </div>
  );
}
