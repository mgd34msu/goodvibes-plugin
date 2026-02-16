import React from 'react';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface UserCardProps {
  user: User;
  onDelete: (userId: string) => void;
}

const styles = {
  card: {
    border: '1px solid #ccc',
    padding: '16px',
    margin: '8px',
  },
  error: {
    color: 'red',
  },
} as const;

export default function UserCard({ user, onDelete }: UserCardProps) {
  const [loading, setLoading] = React.useState<boolean>(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleDelete = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        throw new Error(`Failed to delete user: ${res.statusText}`);
      }
      onDelete(user.id);
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.card}>
      <h3>{user.name}</h3>
      <p>{user.email}</p>
      <p>Role: {user.role}</p>
      {error && <p style={styles.error}>{error}</p>}
      <button onClick={handleDelete} disabled={loading}>
        {loading ? 'Deleting...' : 'Delete'}
      </button>
    </div>
  );
}
