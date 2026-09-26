/**
 * The shell: the fixed rail, the drawer, and the N shortcut.
 *
 * These are the parts a student never thinks about until one of them is wrong -
 * a sidebar that drifts up the page, a menu that lets the page scroll behind
 * it, a shortcut that swallows a letter someone was typing.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import Sidebar from './Sidebar';
import Button from '../../shared/components/ui/Button';
import useQuickAdd, { QuickAddProvider } from '../../shared/hooks/useQuickAdd';

const withRouter = (ui) => render(<MemoryRouter>{ui}</MemoryRouter>);

/* ------------------------------ sidebar ------------------------------- */

describe('the desktop rail', () => {
  it('is a full-height column, so the page scroll cannot move it', () => {
    const { container } = withRouter(<Sidebar open={false} onClose={() => {}} />);
    const rail = container.querySelector('aside');

    expect(rail.className).toContain('lg:h-full');
    // `sticky` was the old approach: the rail slid until it caught.
    expect(rail.className).not.toContain('sticky');
  });

  it('scrolls internally when it is taller than the screen', () => {
    const { container } = withRouter(<Sidebar open={false} onClose={() => {}} />);
    expect(container.querySelector('aside').className).toContain('overflow-y-auto');
  });

  it('still lists every screen', () => {
    withRouter(<Sidebar open={false} onClose={() => {}} />);
    for (const label of ['Dashboard', 'Expenses', 'Income', 'Goals', 'Lending & Borrowing', 'Budget', 'AI Advisor', 'Reports', 'Settings']) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
  });

  it('no longer carries the "press N anywhere" sentence', () => {
    withRouter(<Sidebar open={false} onClose={() => {}} />);
    expect(screen.queryByText(/press\s*N?\s*anywhere/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/anywhere to log an expense/i)).not.toBeInTheDocument();
  });

  it('leaves no empty container behind where the sentence was', () => {
    const { container } = withRouter(<Sidebar open={false} onClose={() => {}} />);
    const rail = container.querySelector('aside');
    // The rail's only child is the nav; nothing hollow was left in its place.
    expect(rail.children).toHaveLength(1);
    expect(rail.querySelector('nav')).toBeTruthy();
    expect(rail.querySelector('kbd')).toBeNull();
  });
});

describe('the mobile drawer', () => {
  afterEach(() => {
    document.body.style.overflow = '';
  });

  it('stays closed until asked', () => {
    withRouter(<Sidebar open={false} onClose={() => {}} />);
    expect(screen.queryByRole('button', { name: /close menu/i })).not.toBeInTheDocument();
  });

  it('opens with the same navigation', () => {
    withRouter(<Sidebar open onClose={() => {}} />);
    expect(screen.getByRole('button', { name: /close menu/i })).toBeInTheDocument();
    expect(screen.getAllByText('Dashboard').length).toBeGreaterThan(0);
  });

  it('stops the page behind it from scrolling', () => {
    const { rerender } = withRouter(<Sidebar open onClose={() => {}} />);
    expect(document.body.style.overflow).toBe('hidden');

    rerender(
      <MemoryRouter>
        <Sidebar open={false} onClose={() => {}} />
      </MemoryRouter>
    );
    expect(document.body.style.overflow).not.toBe('hidden');
  });

  it('restores scrolling when it unmounts, not just when it closes', () => {
    const { unmount } = withRouter(<Sidebar open onClose={() => {}} />);
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).not.toBe('hidden');
  });

  it('closes when a destination is chosen', async () => {
    const onClose = vi.fn();
    withRouter(<Sidebar open onClose={onClose} />);

    const links = screen.getAllByText('Goals');
    await userEvent.click(links[links.length - 1]);
    expect(onClose).toHaveBeenCalled();
  });

  it('focuses the current section and keeps keyboard navigation inside the drawer', async () => {
    render(<MemoryRouter initialEntries={['/dashboard?section=bills']}><Sidebar mode="shared_living" open onClose={() => {}} /></MemoryRouter>);
    const drawer = within(screen.getByRole('dialog'));
    expect(drawer.getByRole('link', { name: /Bills/ })).toHaveFocus();
    drawer.getByRole('link', { name: 'Settings' }).focus();
    await userEvent.tab();
    expect(drawer.getByRole('button', { name: /close menu/i })).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(drawer.getByRole('link', { name: 'Settings' })).toHaveFocus();
  });

  it('closes on Escape and restores focus to the menu opener', async () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    const onClose = vi.fn();
    const { unmount } = withRouter(<Sidebar open onClose={onClose} />);
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledOnce();
    unmount();
    expect(opener).toHaveFocus();
    opener.remove();
  });
});

/* ---------------------------- the N badge ----------------------------- */

describe('the shortcut badge', () => {
  it('sits at the trailing edge of the button, after the label', () => {
    render(<Button shortcut="N">Add expense</Button>);
    const button = screen.getByRole('button');
    const badge = button.querySelector('kbd');

    expect(badge).toBeTruthy();
    expect(badge.textContent).toBe('N');
    // Last element in the button, which is what "right-most inside" means.
    expect(button.textContent.trim().startsWith('Add expense')).toBe(true);
  });

  it('is announced rather than only drawn', () => {
    render(<Button shortcut="N">Add expense</Button>);
    expect(screen.getByRole('button').getAttribute('title')).toMatch(/press N/i);
    expect(screen.getByText(/keyboard shortcut: N/i)).toBeInTheDocument();
  });

  it('hides the badge on phones, where there is no key to press', () => {
    render(<Button shortcut="N">Add expense</Button>);
    const badge = screen.getByRole('button').querySelector('kbd');
    expect(badge.className).toContain('hidden');
    expect(badge.className).toContain('sm:inline-block');
  });

  it('adds nothing when no shortcut is given', () => {
    render(<Button>Add expense</Button>);
    expect(screen.getByRole('button').querySelector('kbd')).toBeNull();
  });
});

/* ------------------------- the shared opener --------------------------- */

function Consumer() {
  const { open, canCreate } = useQuickAdd();
  return (
    <Button shortcut="N" onClick={open} disabled={!canCreate}>
      Add expense
    </Button>
  );
}

describe('click and keypress are the same action', () => {
  it('the button calls the opener the shell provided', async () => {
    const open = vi.fn();
    render(
      <QuickAddProvider open={open}>
        <Consumer />
      </QuickAddProvider>
    );

    await userEvent.click(screen.getByRole('button'));
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('is inert outside the shell instead of throwing', async () => {
    render(<Consumer />);
    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
  });
});
