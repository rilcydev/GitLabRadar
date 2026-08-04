import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ItemCard } from './ItemCard';
import styles from './ItemCard.module.css';

// Source: index.html:442-476 (.item shell used by MR, pipeline and release
// rows -- index.html:2830, :3010, :3234).
describe('ItemCard', () => {
  it('renders its children', () => {
    render(
      <ItemCard>
        <span>MR title</span>
      </ItemCard>
    );
    expect(screen.getByText('MR title')).toBeInTheDocument();
  });

  it('applies the base .item shell class', () => {
    const { container } = render(<ItemCard>content</ItemCard>);
    expect(container.firstChild).toHaveClass(styles.item);
  });

  it('calls onClick when the card is clicked (index.html:2830-2538 openExternal wiring)', () => {
    const onClick = vi.fn();
    render(<ItemCard onClick={onClick}>content</ItemCard>);
    fireEvent.click(screen.getByText('content'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('merges an extra className onto the base shell', () => {
    const { container } = render(<ItemCard className="mrAgeFresh">content</ItemCard>);
    expect(container.firstChild).toHaveClass(styles.item);
    expect(container.firstChild).toHaveClass('mrAgeFresh');
  });

  it('lets a child stop propagation so it does not also trigger onClick (dismiss-button pattern)', () => {
    const onClick = vi.fn();
    const onDismiss = vi.fn();
    render(
      <ItemCard onClick={onClick}>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDismiss();
          }}
        >
          Dismiss
        </button>
      </ItemCard>
    );
    fireEvent.click(screen.getByText('Dismiss'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onClick).not.toHaveBeenCalled();
  });
});
