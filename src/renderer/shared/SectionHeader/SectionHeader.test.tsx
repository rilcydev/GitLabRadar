import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SectionHeader } from './SectionHeader';
import styles from './SectionHeader.module.css';

// Source: index.html:397-437, and renderSection at :2771-2779.
describe('SectionHeader', () => {
  it('renders the title verbatim', () => {
    render(<SectionHeader title="To review" count={3} />);
    expect(screen.getByText('To review')).toBeInTheDocument();
  });

  it('renders the count', () => {
    render(<SectionHeader title="To review" count={3} />);
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('renders with only title and count, matching the brief\'s minimal example', () => {
    const { container } = render(<SectionHeader title="Assigned" count={0} />);
    expect(container.querySelector(`.${styles.sectionIcon}`)).toBeNull();
  });

  it('renders the icon box with the given background when both are provided', () => {
    const { container } = render(
      <SectionHeader title="To review" count={2} icon={<svg data-testid="icon" />} iconBackground="var(--gradient-orange)" />
    );
    const iconBox = container.querySelector(`.${styles.sectionIcon}`);
    expect(iconBox).not.toBeNull();
    expect(iconBox).toHaveStyle({ background: 'var(--gradient-orange)' });
    expect(screen.getByTestId('icon')).toBeInTheDocument();
  });
});
