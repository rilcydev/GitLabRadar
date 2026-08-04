import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Avatar, AvatarOverflow } from './Avatar';

// Source: index.html:2782-2784 (item-size / MR author avatar) and
// index.html:2791-2796,2806-2811 (mini-size assignee/reviewer stacks).
describe('Avatar', () => {
  it('renders an image when a url is given', () => {
    render(<Avatar src="https://example.com/a.png" name="Cyril" size="item" />);
    expect(screen.getByRole('img', { name: 'Cyril' })).toHaveAttribute('src', 'https://example.com/a.png');
  });

  it('falls back to the initial when no url is given', () => {
    render(<Avatar src={undefined} name="cyril" size="item" />);
    expect(screen.getByText('C')).toBeInTheDocument();
  });

  // index.html:2782-2784 has NO onerror handler on the <img> -- a broken
  // avatar URL (e.g. the self-hosted-GitLab 401 case from the human's
  // original complaint) stays a broken image instead of falling back to
  // the initial. This is bug #2 of the plan's preserved-bug list and is
  // DELIBERATE for this phase. Do not "fix" this by adding an onError
  // handler that swaps in the placeholder -- that would silently break
  // parity with the vanilla app.
  it('does not install an error handler (parity: broken images stay broken, index.html:2782-2784 has no onerror)', () => {
    render(<Avatar src="https://example.com/a.png" name="Cyril" size="item" />);
    expect(screen.getByRole('img')).not.toHaveAttribute('onerror');
  });

  // index.html:2784: `(mr.author?.name || '?')[0].toUpperCase()` -- the
  // placeholder defaults to '?' specifically, not e.g. 'Unknown'[0], when
  // the name is missing.
  it('falls back to "?" when the name itself is missing', () => {
    render(<Avatar src={undefined} name={undefined} size="item" />);
    expect(screen.getByText('?')).toBeInTheDocument();
  });

  it('renders at the 28px item size with no title attribute (index.html:1158-1180)', () => {
    render(<Avatar src={undefined} name="Cyril" size="item" />);
    const placeholder = screen.getByText('C');
    expect(placeholder).not.toHaveAttribute('title');
  });

  // index.html:2793,2808: mini avatars (assignee/reviewer stacks) carry a
  // title tooltip with the person's full name; the 28px author avatar does
  // not (index.html:2783 has no title attribute at all).
  it('renders a title tooltip at the mini size (index.html:2793,2808)', () => {
    render(<Avatar src="https://example.com/a.png" name="Cyril" size="mini" />);
    expect(screen.getByRole('img', { name: 'Cyril' })).toHaveAttribute('title', 'Cyril');
  });

  it('renders the mini placeholder with a title tooltip too (index.html:2794,2809)', () => {
    render(<Avatar src={undefined} name="Cyril" size="mini" />);
    const placeholder = screen.getByText('C');
    expect(placeholder).toHaveAttribute('title', 'Cyril');
  });
});

// index.html:2796,2811 -- the "+N" overflow chip reuses the mini-avatar
// placeholder styling but shows the literal "+N" text rather than an
// initial, and is never capped/truncated itself.
describe('AvatarOverflow', () => {
  it('renders a "+N" chip', () => {
    render(<AvatarOverflow count={2} />);
    expect(screen.getByText('+2')).toBeInTheDocument();
  });
});
