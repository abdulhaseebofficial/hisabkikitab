import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect } from 'vitest';
import { TemplatesContent } from './pages/TemplatesHubPage';
import { templates, templateFaqs } from './content/templatesData';

describe('TemplatesHubPage', () => {
  const renderPage = () =>
    render(
      <MemoryRouter>
        <TemplatesContent />
      </MemoryRouter>
    );

  it('renders H1 heading, subhead, and trust badges', () => {
    renderPage();
    expect(
      screen.getByRole('heading', { level: 1, name: /free financial planning & budget templates/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/100% offline & private/i)).toBeInTheDocument();
    expect(screen.getByText(/zero macros \/ 100% safe/i)).toBeInTheDocument();
    expect(screen.getByText(/pre-formatted for pkr \(rs\)/i)).toBeInTheDocument();
  });

  it('renders both MVP templates with download actions', () => {
    renderPage();
    expect(
      screen.getByRole('heading', { level: 3, name: /monthly household budget planner/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 3, name: /roommate & hostel expense splitter/i })
    ).toBeInTheDocument();

    const downloadLinks = screen.getAllByRole('link', { name: /download.*in xlsx format/i });
    expect(downloadLinks).toHaveLength(2);

    expect(downloadLinks[0]).toHaveAttribute('href', '/downloads/hisabkikitab-monthly-household-budget.xlsx');
    expect(downloadLinks[0]).toHaveAttribute('download', 'hisabkikitab-monthly-household-budget.xlsx');

    expect(downloadLinks[1]).toHaveAttribute('href', '/downloads/hisabkikitab-roommate-hostel-expense-splitter.xlsx');
    expect(downloadLinks[1]).toHaveAttribute('download', 'hisabkikitab-roommate-hostel-expense-splitter.xlsx');
  });

  it('renders cross-links to online calculators and guides', () => {
    renderPage();
    const budgetCalcLinks = screen.getAllByRole('link', { name: /online calculator/i });
    expect(budgetCalcLinks.length).toBeGreaterThanOrEqual(2);
    expect(budgetCalcLinks[0]).toHaveAttribute('href', '/tools/budget-calculator/');
    expect(budgetCalcLinks[1]).toHaveAttribute('href', '/tools/expense-split-calculator/');
  });

  it('renders interactive preview table with Pakistani rupee benchmarks', () => {
    renderPage();
    expect(
      screen.getByRole('heading', { level: 2, name: /built for pakistani financial life/i })
    ).toBeInTheDocument();
    expect(screen.getByText('Rent / Housing')).toBeInTheDocument();
    expect(screen.getByText('Groceries & Supermarket')).toBeInTheDocument();
  });

  it('renders privacy guarantee note', () => {
    renderPage();
    expect(
      screen.getByRole('heading', { level: 2, name: /privacy & local execution guarantee/i })
    ).toBeInTheDocument();
    expect(
      screen.getByText(/hisabki kitab does not require you to upload your financial figures/i)
    ).toBeInTheDocument();
  });

  it('renders and toggles FAQ accordion items', () => {
    renderPage();
    const firstFaqButton = screen.getByRole('button', { name: templateFaqs[0].question });
    expect(firstFaqButton).toBeInTheDocument();
    expect(firstFaqButton).toHaveAttribute('aria-expanded', 'false');

    // Click to expand
    fireEvent.click(firstFaqButton);
    expect(firstFaqButton).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/yes\. both templates are 100% standalone openxml/i)).toBeInTheDocument();

    // Click to collapse
    fireEvent.click(firstFaqButton);
    expect(firstFaqButton).toHaveAttribute('aria-expanded', 'false');
  });

  it('renders free registration CTA for mobile automated sync', () => {
    renderPage();
    const registerCta = screen.getByRole('link', { name: /create free account/i });
    expect(registerCta).toBeInTheDocument();
    expect(registerCta).toHaveAttribute('href', '/register/');
  });
});
