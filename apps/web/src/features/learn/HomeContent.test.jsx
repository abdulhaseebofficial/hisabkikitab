import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterAll, beforeAll, vi } from 'vitest';
import HomeContent from './HomeContent';

const ArticleCard = ({ article }) => <div>{article.title}</div>;

beforeAll(() => vi.stubGlobal('matchMedia', () => ({
  matches: false,
  addEventListener: () => {},
  removeEventListener: () => {},
})));
afterAll(() => vi.unstubAllGlobals());

describe('homepage finance preview', () => {
  it('renders the approved hero, official logo, and three selectable modes', () => {
    render(<MemoryRouter><HomeContent ArticleCard={ArticleCard} /></MemoryRouter>);

    expect(screen.getByRole('heading', { name: /Make sense of your money/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Start Managing Your Money/ })).toHaveAttribute('href', '/register/');
    expect(screen.getByRole('link', { name: 'Sign In' })).toHaveAttribute('href', '/login/');
    expect(screen.getAllByRole('button', { name: /Individual|Household|Shared Living/ })).toHaveLength(3);
    expect(screen.getByLabelText('Individual sample finance preview')).toContainHTML('/logo-512.png');
    expect(screen.getByText('Illustrative PKR figures')).toBeInTheDocument();
  });

  it('keeps the public demo preview separate from authenticated finance actions', () => {
    render(<MemoryRouter initialEntries={['/?demo=preview']}><HomeContent ArticleCard={ArticleCard} /></MemoryRouter>);

    expect(screen.getByText('Demo Preview Mode')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Exit preview and sign in' })).toHaveAttribute('href', '/login/');
    expect(screen.getByRole('button', { name: 'Add Income' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Add Expense' })).toBeDisabled();
  });
});
