import { fireEvent, render, screen } from '@testing-library/react';
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

  // Bug-lot fix (#1/#2): a broken/401 avatar URL now falls back to the
  // initial-letter placeholder via an onError handler, instead of showing the
  // browser's broken-image glyph. This is the self-hosted-GitLab 401 case the
  // app exists to handle. Fire a real `error` event and assert the placeholder
  // takes over.
  it('falls back to the initial-letter placeholder when the <img> errors (bug-lot fix: self-hosted 401 avatars)', () => {
    render(<Avatar src="https://example.com/broken.png" name="Cyril" size="item" />);
    const img = screen.getByRole('img', { name: 'Cyril' });
    fireEvent.error(img);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('C')).toBeInTheDocument();
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

  // Bug-lot fix (#8): the mini-avatar placeholder was `name![0]` with no
  // guard, so an empty/missing name from the live GitLab response threw --
  // and with no error boundary in the tree, that blanked the whole window.
  // Now guarded with '?' like the item size (index.html:2784).
  it('renders "?" for an empty mini-avatar name instead of crashing (bug-lot fix #8)', () => {
    render(<Avatar src={undefined} name="" size="mini" />);
    expect(screen.getByText('?')).toBeInTheDocument();
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
