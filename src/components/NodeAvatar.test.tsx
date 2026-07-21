import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { initialsFor, NodeAvatar } from './NodeAvatar';

describe('NodeAvatar', () => {
  it('renders the photo when avatarUrl is set', () => {
    render(<NodeAvatar name="Ren Urot" avatarUrl="https://example.com/ren.jpg" />);
    const img = screen.getByRole('img', { name: 'Ren Urot' });
    expect(img).toHaveAttribute('src', 'https://example.com/ren.jpg');
    expect(screen.queryByText('RU')).not.toBeInTheDocument();
  });

  it('falls back to initials when avatarUrl is null', () => {
    render(<NodeAvatar name="Ren Urot" avatarUrl={null} />);
    expect(screen.getByText('RU')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('falls back to initials when avatarUrl is omitted', () => {
    render(<NodeAvatar name="Ren Urot" />);
    expect(screen.getByText('RU')).toBeInTheDocument();
  });
});

describe('initialsFor', () => {
  it('takes the first letter of the first two words', () => {
    expect(initialsFor('Jun Samson')).toBe('JS');
  });

  it('handles a single name', () => {
    expect(initialsFor('Cher')).toBe('C');
  });

  it('collapses extra whitespace', () => {
    expect(initialsFor('  Ren   Urot  ')).toBe('RU');
  });

  it('falls back to "?" for an empty name', () => {
    expect(initialsFor('')).toBe('?');
  });
});
