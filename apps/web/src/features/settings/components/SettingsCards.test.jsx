/**
 * The Settings cards, after they were pulled out of one 353-line page.
 *
 * These assert what a student can see and do - the labels, the wiring of a
 * click to a handler, the disabled states - rather than how the components are
 * put together. That is the point: the split must not have changed any of it,
 * and a test that only checked structure would pass either way.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import AppearanceCard from './AppearanceCard';
import FinanceModeCard from './FinanceModeCard';
import LanguageCard from './LanguageCard';
import CategoriesCard from './CategoriesCard';
import SecurityCard from './SecurityCard';
import DeleteAccountModal from './DeleteAccountModal';
import InstallAppCard from './InstallAppCard';

describe('AppearanceCard', () => {
  it('offers both premium theme choices', () => {
    render(<AppearanceCard theme="light" onChange={() => {}} />);

    expect(screen.getByRole('button', { name: /light/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /dark/i })).toBeInTheDocument();
  });

  it('reports which theme was picked', async () => {
    const onChange = vi.fn();
    render(<AppearanceCard theme="light" onChange={onChange} />);

    await userEvent.click(screen.getByRole('button', { name: /dark/i }));

    expect(onChange).toHaveBeenCalledWith('dark');
  });
});

describe('CategoriesCard', () => {
  const props = {
    categories: ['Mess/Food', 'Travel', 'Gym'],
    custom: ['Gym'],
    newCategory: '',
    onNewCategoryChange: () => {},
    onAdd: () => {},
    onRemove: () => {},
  };

  it('shows the custom categories alongside the built-in ones', () => {
    render(<CategoriesCard {...props} />);

    expect(screen.getByText('Mess/Food')).toBeInTheDocument();
    expect(screen.getByText('Gym')).toBeInTheDocument();
  });

  it('says how many are available and what removal costs', () => {
    render(<CategoriesCard {...props} />);
    expect(screen.getByText(/3 categories available/i)).toBeInTheDocument();
    expect(screen.getByText(/can only be removed once no expense uses it/i)).toBeInTheDocument();
  });

  it('only a custom category can be removed', () => {
    render(<CategoriesCard {...props} />);

    // Gym is the student's own, so it gets a remove control.
    expect(screen.getByRole('button', { name: 'Remove Gym' })).toBeInTheDocument();
    // Travel is built in, so it must not.
    expect(screen.queryByRole('button', { name: 'Remove Travel' })).not.toBeInTheDocument();
  });

  it('removing names the category it is removing', async () => {
    const onRemove = vi.fn();
    render(<CategoriesCard {...props} onRemove={onRemove} />);

    await userEvent.click(screen.getByRole('button', { name: 'Remove Gym' }));

    expect(onRemove).toHaveBeenCalledWith('Gym');
  });

  it('will not add an empty category', () => {
    render(<CategoriesCard {...props} newCategory="   " />);
    expect(screen.getByRole('button', { name: /add/i })).toBeDisabled();
  });

  it('adds on Enter as well as on the button', async () => {
    const onAdd = vi.fn();
    render(<CategoriesCard {...props} newCategory="Laundry" onAdd={onAdd} />);

    await userEvent.type(screen.getByLabelText(/new category name/i), '{Enter}');

    expect(onAdd).toHaveBeenCalled();
  });

  it('reports what was typed', async () => {
    const onNewCategoryChange = vi.fn();
    render(<CategoriesCard {...props} onNewCategoryChange={onNewCategoryChange} />);

    await userEvent.type(screen.getByLabelText(/new category name/i), 'G');

    expect(onNewCategoryChange).toHaveBeenCalledWith('G');
  });
});

describe('SecurityCard', () => {
  it('warns that changing a password signs other devices out', () => {
    render(<SecurityCard onChangePassword={() => {}} onExport={() => {}} onDelete={() => {}} />);
    expect(screen.getByText(/signs you out everywhere else/i)).toBeInTheDocument();
  });

  it('says deleting is permanent before it is clicked', () => {
    render(<SecurityCard onChangePassword={() => {}} onExport={() => {}} onDelete={() => {}} />);
    expect(screen.getByText(/permanently removes your account/i)).toBeInTheDocument();
  });

  it('each action calls its own handler', async () => {
    const onChangePassword = vi.fn();
    const onExport = vi.fn();
    const onDelete = vi.fn();
    render(<SecurityCard {...{ onChangePassword, onExport, onDelete }} />);

    await userEvent.click(screen.getByRole('button', { name: /change password/i }));
    await userEvent.click(screen.getByRole('button', { name: /download/i }));
    await userEvent.click(screen.getByRole('button', { name: /^delete$/i }));

    expect(onChangePassword).toHaveBeenCalledOnce();
    expect(onExport).toHaveBeenCalledOnce();
    expect(onDelete).toHaveBeenCalledOnce();
  });
});

describe('DeleteAccountModal', () => {
  const props = {
    open: true,
    onClose: () => {},
    password: '',
    onPasswordChange: () => {},
    onConfirm: () => {},
    busy: false,
  };

  it('cannot be confirmed without a password', () => {
    render(<DeleteAccountModal {...props} />);
    expect(screen.getByRole('button', { name: /delete forever/i })).toBeDisabled();
  });

  it('can be confirmed once a password is typed', () => {
    render(<DeleteAccountModal {...props} password="hunter2" />);
    expect(screen.getByRole('button', { name: /delete forever/i })).toBeEnabled();
  });

  it('suggests exporting first, because after this there is nothing to export', () => {
    render(<DeleteAccountModal {...props} />);
    expect(screen.getByText(/consider exporting your data first/i)).toBeInTheDocument();
  });

  it('offers a way out that is not destructive', async () => {
    const onClose = vi.fn();
    render(<DeleteAccountModal {...props} onClose={onClose} />);

    await userEvent.click(screen.getByRole('button', { name: /keep my account/i }));

    expect(onClose).toHaveBeenCalled();
  });

  it('locks both buttons while the delete is in flight', () => {
    render(<DeleteAccountModal {...props} password="hunter2" busy />);
    expect(screen.getByRole('button', { name: /keep my account/i })).toBeDisabled();
  });

  it('shows nothing when closed', () => {
    render(<DeleteAccountModal {...props} open={false} />);
    expect(screen.queryByText(/delete your account/i)).not.toBeInTheDocument();
  });
});

describe('FinanceModeCard', () => {
  it('offers both ways of keeping the books', () => {
    render(<FinanceModeCard mode="student" onSelect={() => {}} />);

    expect(screen.getByRole('button', { name: /student/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /householder/i })).toBeInTheDocument();
  });

  it('marks the mode currently in use', () => {
    render(<FinanceModeCard mode="householder" onSelect={() => {}} />);

    expect(screen.getByRole('button', { name: /householder/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /student/i })).toHaveAttribute('aria-pressed', 'false');
  });

  it('asks for the other mode, and does not re-ask for the current one', async () => {
    // Picking the mode you are already in should do nothing at all - not
    // confirm, not save, not toast.
    const onSelect = vi.fn();
    render(<FinanceModeCard mode="student" onSelect={onSelect} />);

    await userEvent.click(screen.getByRole('button', { name: /student/i }));
    expect(onSelect).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: /householder/i }));
    expect(onSelect).toHaveBeenCalledWith('householder');
  });

  it('promises that switching keeps both sets of records', () => {
    // The one thing a person with two years of history needs to read before
    // touching this. If this line ever goes missing the card is a trap.
    render(<FinanceModeCard mode="student" onSelect={() => {}} />);

    expect(screen.getByText(/nothing is deleted/i)).toBeInTheDocument();
  });
});

describe('LanguageCard', () => {
  it('names each language in itself, not only in the active one', () => {
    // Someone who landed in the wrong language has to be able to recognise
    // their way out, so the samples do not go through t().
    render(<LanguageCard language="en" onChange={() => {}} />);

    expect(screen.getByRole('button', { name: /english/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /mujhe paise dene hain/i })).toBeInTheDocument();
  });

  it('reports the language that was picked', async () => {
    const onChange = vi.fn();
    render(<LanguageCard language="en" onChange={onChange} />);

    await userEvent.click(screen.getByRole('button', { name: /roman urdu/i }));

    expect(onChange).toHaveBeenCalledWith('roman_ur');
  });

  it('does nothing when the active language is picked again', async () => {
    const onChange = vi.fn();
    render(<LanguageCard language="en" onChange={onChange} />);

    await userEvent.click(screen.getByRole('button', { name: /english/i }));

    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('InstallAppCard', () => {
  it('renders InstallAppCard on Settings screen', () => {
    render(<InstallAppCard />);
    expect(screen.getByText('App & Installation')).toBeInTheDocument();
    expect(screen.getByText('HisabKi Kitab App')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /install app/i })).toBeInTheDocument();
  });
});
