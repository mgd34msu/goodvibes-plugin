import React from 'react';

interface ButtonProps {
  onClick: () => void;
  label: string;
}

export const Button: React.FC<ButtonProps> = ({ onClick, label }) => {
  return (
    <button onClick={onClick}>
      {label}
    </button>
  );
};
