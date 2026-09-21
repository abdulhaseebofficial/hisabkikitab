import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useNavigate, useLocation } from "react-router-dom";
import { I18nProvider } from "../../../shared/i18n/I18nProvider";
import SharedLivingPage from "../pages/SharedLivingPage";
import Sidebar from "../../../app/layout/Sidebar";
import api from "../api/sharedLivingApi";
import LedgerForm from "./LedgerForm";
vi.mock("../api/sharedLivingApi", () => ({
  default: { spaces: vi.fn(), month: vi.fn(), save: vi.fn(), join: vi.fn() },
}));
vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }) => <div>{children}</div>,
  BarChart: () => null,
  Bar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
}));
const month = new Date().toISOString().slice(0, 7);
const fixture = (role = "admin", closed = false) => ({
  space: { id: "space", name: "My Flat", currency: "PKR", residents: 2, role },
  period: { closed, budget_minor: 10000, food_budget_minor: 5000 },
  periods: [],
  categories: [],
  expenses: [],
  bills: [],
  payments: [],
  shares: [],
  activity: [],
  summary: {
    activeMembers: 2,
    budget: "100.00",
    foodBudget: "50.00",
    collected: "25.00",
    spent: "20.00",
    remainingBudget: "80.00",
    cash: "5.00",
    outstanding: "15.00",
    today: "0.00",
    averageDaily: "1.00",
    recommendedDaily: "2.00",
    remainingFoodBudget: "30.00",
    perPerson: "10.00",
    foodPerPerson: "5.00",
    billsPerPerson: "5.00",
    daily: [{ date: `${month}-01`, amount: "20.00" }],
    highestDay: { date: `${month}-01`, amount: "20.00" },
    categories: [],
    members: [],
  },
});
function HistoryControls() {
  const navigate = useNavigate();
  const location = useLocation();
  return <><button onClick={() => navigate(-1)}>Go back</button><button onClick={() => navigate(1)}>Go forward</button><output data-testid="url">{location.pathname}{location.search}</output></>;
}
const setup = (language = "en", role = "admin", closed = false, entry = '/dashboard') => {
  const data = fixture(role, closed);
  api.spaces.mockResolvedValue([data.space]);
  api.month.mockResolvedValue(data);
  return render(
    <I18nProvider language={language}>
      <MemoryRouter initialEntries={[entry]}>
      <Sidebar mode="shared_living" open={false} onClose={() => {}} />
      <HistoryControls />
      <SharedLivingPage />
      </MemoryRouter>
    </I18nProvider>,
  );
};
beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); });
describe("Shared Living UI", () => {
  it.each([
    [
      "en",
      "Remaining Budget",
      "Current Cash Balance",
      "Outstanding Member Payments",
    ],
    [
      "roman_ur",
      "Baqi Budget",
      "Maujooda Naqad Raqam",
      "Rehne Walon Ki Baqaya Adaigi",
    ],
  ])(
    "shows distinct server totals in %s",
    async (language, budget, cash, outstanding) => {
      setup(language);
      expect(await screen.findByText(budget)).toBeInTheDocument();
      expect(screen.getByText(cash)).toBeInTheDocument();
      expect(screen.getByText(outstanding)).toBeInTheDocument();
      expect(screen.getByText("PKR 80.00")).toBeInTheDocument();
      expect(screen.getByText(cash).parentElement).toHaveTextContent(
        "PKR 5.00",
      );
    },
  );
  it.each([
    ["en", "Bills", "Add bill", "View Only"],
    ["roman_ur", "Bills", "Bill Darj Karein", "Sirf Dekhne Ki Ijazat"],
  ])(
    "Viewer cannot see bill write controls in %s",
    async (language, tab, add, permission) => {
      setup(language, "viewer");
      await screen.findByText(permission);
      await userEvent.click(
        await screen.findByRole("link", { name: tab, exact: true }),
      );
      expect(
        screen.queryByRole("button", { name: add }),
      ).not.toBeInTheDocument();
      expect(api.save).not.toHaveBeenCalled();
    },
  );
  it("closed months hide financial writes from Admin", async () => {
    setup("en", "admin", true);
    await screen.findByText("This month is closed and read only.");
    await userEvent.click(screen.getByRole("link", { name: "Contributions" }));
    expect(
      screen.queryByRole("button", { name: "Record contribution" }),
    ).not.toBeInTheDocument();
  });
  it("daily records use cards with date details, without a wide table", async () => {
    const { container } = setup();
    await screen.findByText("Remaining Budget");
    await userEvent.click(screen.getByRole("link", { name: "Daily Food" }));
    expect(
      screen.getByRole("button", { name: `${month}-01 · PKR 20.00` }),
    ).toBeInTheDocument();
    expect(container.querySelector("table")).toBeNull();
    expect(container.querySelector(".sm\\:grid-cols-2")).not.toBeNull();
  });
  it("Shared Living navigation omits personal screens on desktop and mobile", () => {
    render(
      <MemoryRouter>
        <Sidebar mode="shared_living" open onClose={() => {}} />
      </MemoryRouter>,
    );
    expect(screen.getAllByRole("link", { name: /Dashboard/ })).toHaveLength(2);
    expect(
      screen.queryByRole("link", { name: /Expenses/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /Goals/ }),
    ).not.toBeInTheDocument();
  });
  it("Admin form preserves decimal strings instead of converting to float", async () => {
    const submit = vi.fn();
    render(
      <LedgerForm
        fields={[{ key: "amount", required: true }]}
        initial={{ amount: "0.29" }}
        onSubmit={submit}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(submit).toHaveBeenCalledWith({ amount: "0.29" });
  });
  it("changing a month fetches another period", async () => {
    setup();
    await screen.findByText("Remaining Budget");
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(api.month.mock.calls.length).toBe(2));
    expect(api.month.mock.calls[1][1]).not.toBe(month);
  });
  it('restores the selected group and month for the current user after remount', async () => {
    const first = fixture();
    const second = { ...first.space, id: 'second', name: 'Second Flat', role: 'viewer' };
    api.spaces.mockResolvedValue([first.space, second]);
    api.month.mockImplementation(async (id) => ({ ...fixture(), space: id === 'second' ? second : first.space }));
    const page = () => <MemoryRouter><I18nProvider language="en"><SharedLivingPage userId="owner" /></I18nProvider></MemoryRouter>;
    const mounted = render(page());
    await screen.findByText('Remaining Budget');
    await userEvent.selectOptions(screen.getByLabelText('Shared space'), 'second');
    await screen.findByText('View Only');
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    const selectedMonth = screen.getByLabelText('Month').value;
    mounted.unmount();
    render(page());
    await screen.findByText('Remaining Budget');
    expect(screen.getByLabelText('Shared space')).toHaveValue('second');
    expect(screen.getByLabelText('Month')).toHaveValue(selectedMonth);
    expect(screen.getByText('View Only')).toBeInTheDocument();
  });
  it('does not show an empty-state invitation when loading groups fails', async () => {
    api.spaces.mockRejectedValue(new Error('network unavailable'));
    render(<MemoryRouter><I18nProvider language="en"><SharedLivingPage /></I18nProvider></MemoryRouter>);
    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to complete');
    expect(screen.queryByText('Create a space or enter a join code to begin.')).not.toBeInTheDocument();
  });
  it('links every section without refetching or resetting the selected period, with back/forward support', async () => {
    setup();
    await screen.findByText('Remaining Budget');
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(api.month).toHaveBeenCalledTimes(2));
    await screen.findByText('Remaining Budget');
    const selectedMonth = screen.getByLabelText('Month').value;
    for (const [label, section] of [['Daily Food', 'daily'], ['Bills', 'bills'], ['Members', 'members'], ['Contributions', 'payments'], ['Manage Space', 'manage'], ['Activity History', 'activity']]) {
      await userEvent.click(screen.getByRole('link', { name: label, exact: true }));
      expect(screen.getByTestId('url')).toHaveTextContent(`/dashboard?section=${section}`);
      expect(document.querySelectorAll('a[aria-current="page"]')).toHaveLength(1);
      expect(screen.getByRole('link', { name: new RegExp(label) })).toHaveAttribute('aria-current', 'page');
      expect(screen.getByLabelText('Month')).toHaveValue(selectedMonth);
      expect(screen.getByLabelText('Shared space')).toHaveValue('space');
    }
    expect(api.month).toHaveBeenCalledTimes(2);
    expect(api.spaces).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Go back' }));
    expect(screen.getByRole('link', { name: /Manage Space/ })).toHaveAttribute('aria-current', 'page');
    await userEvent.click(screen.getByRole('button', { name: 'Go forward' }));
    expect(screen.getByRole('link', { name: /Activity History/ })).toHaveAttribute('aria-current', 'page');
    await userEvent.click(screen.getByRole('link', { name: 'Settings' }));
    expect(screen.getByRole('link', { name: /Settings/ })).toHaveAttribute('aria-current', 'page');
    expect(document.querySelectorAll('a[aria-current="page"]')).toHaveLength(1);
  });
  it('opens a deep-linked Manage section without exposing admin controls to viewers', async () => {
    setup('en', 'viewer', false, '/dashboard?section=manage');
    await screen.findByText('View Only');
    expect(screen.getByRole('link', { name: /Manage Space/ })).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByRole('button', { name: 'Edit space' })).not.toBeInTheDocument();
    expect(api.save).not.toHaveBeenCalled();
  });
  it('keeps the existing space and financial dialogs available after sidebar navigation', async () => {
    setup();
    await screen.findByText('Remaining Budget');
    for (const label of ['Create a space', 'Join a space', 'Add food expense', 'Record contribution']) {
      await userEvent.click(screen.getByRole('button', { name: label, exact: true }));
      expect(screen.getByRole('dialog', { name: label })).toBeInTheDocument();
      await userEvent.keyboard('{Escape}');
    }
    await userEvent.click(screen.getByRole('link', { name: 'Manage Space' }));
    await userEvent.click(screen.getByRole('button', { name: 'Edit space' }));
    expect(screen.getByRole('dialog', { name: 'Edit space' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await userEvent.click(screen.getByRole('button', { name: 'Previous' }));
    await waitFor(() => expect(api.month).toHaveBeenCalledTimes(2));
    expect(screen.getByLabelText('Month').value).not.toBe(month);
  });
  it('downloads the existing report after returning to Dashboard', async () => {
    const createObjectURL = vi.fn(() => 'blob:report');
    const revokeObjectURL = vi.fn();
    const NativeURL = URL;
    vi.stubGlobal('URL', class extends NativeURL {
      static createObjectURL = createObjectURL;
      static revokeObjectURL = revokeObjectURL;
    });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    try {
      setup();
      await screen.findByText('Remaining Budget');
      await userEvent.click(screen.getByRole('link', { name: 'Bills' }));
      await userEvent.click(screen.getByRole('link', { name: 'Dashboard' }));
      await userEvent.click(screen.getByRole('button', { name: 'Download report' }));
      expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
      expect(click).toHaveBeenCalledOnce();
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:report');
      expect(screen.getByText('PKR 80.00')).toBeInTheDocument();
    } finally {
      click.mockRestore();
      vi.unstubAllGlobals();
    }
  });
  it('closes the mobile drawer when a Shared Living section is chosen', async () => {
    const onClose = vi.fn();
    render(<MemoryRouter initialEntries={['/dashboard']}><Sidebar mode="shared_living" open onClose={onClose} /></MemoryRouter>);
    const bills = screen.getAllByRole('link', { name: 'Bills' });
    await userEvent.click(bills[1]);
    expect(onClose).toHaveBeenCalledOnce();
    expect(bills[1]).toHaveAttribute('aria-current', 'page');
  });
});
