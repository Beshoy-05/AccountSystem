import { useState, useEffect, useCallback, useRef } from "react";
import {
  Plus,
  Pencil,
  Coins,
  RefreshCw,
  X,
  AlertCircle,
  CheckCircle2,
  Box,
  Percent,
  Trash2,
  Search,
  Wallet,
  Users,
  Database, // أيقونة جديدة للعدد الكلي للحسابات في قاعدة البيانات
} from "lucide-react";

// ---------------------------------------------------------------------------
// Ledger — an account/wallet admin console for the Account API.
// ---------------------------------------------------------------------------

const API_BASE_URL = "https://accountsystem.runasp.net/api/Account";
const FONT_LINK_ID = "ledger-fonts";

function ensureFonts() {
  if (typeof document === "undefined") return;
  if (document.getElementById(FONT_LINK_ID)) return;
  const link = document.createElement("link");
  link.id = FONT_LINK_ID;
  link.rel = "stylesheet";
  link.href =
    "https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;1,6..72,400&family=IBM+Plex+Mono:wght@400;500;600&family=Inter:wght@400;500;600&display=swap";
  document.head.appendChild(link);
}

async function readErrorMessage(res) {
  try {
    const text = await res.text();
    if (!text) return null;
    try {
      const data = JSON.parse(text);
      const raw =
        data.message ||
        data.title ||
        data.error ||
        (typeof data === "string" ? data : null);
      return raw ? cleanExceptionText(raw) : null;
    } catch {
      return cleanExceptionText(text);
    }
  } catch {
    return null;
  }
}

function cleanExceptionText(text) {
  const beforeStack = text.split(/\s+at\s+[A-Z]/)[0];
  const match = beforeStack.match(/(?:Exception|Error)\s*:\s*(.+)$/s);
  const cleaned = (match ? match[1] : beforeStack).trim();
  if (!cleaned || cleaned.length > 200) return null;

  const lower = cleaned.toLowerCase();
  if (lower.includes("already exist"))
    return "This email is already registered.";
  if (lower.includes("account not found") || lower.includes("no account found"))
    return "The account could not be found. It may have already been deleted.";
  if (lower.includes("cannot take negative"))
    return "The page size cannot be negative.";
  if (lower.includes("amount cannot be negative"))
    return "The amount cannot be negative.";
  if (lower.includes("insufficient dollars"))
    return "You don't have enough dollars in this account.";

  return cleaned;
}

const NO_ACCOUNTS_MESSAGE = "there is no accounts";

const money = (n) =>
  (Number.isFinite(n) ? n : 0).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });

function useToasts() {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((tone, text) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, tone, text }]);
    setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
    }, 3800);
  }, []);
  return { toasts, push };
}

export default function App() {
  ensureFonts();

  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);

  const [filterBox, setFilterBox] = useState(false);
  const [filterDiscount, setFilterDiscount] = useState(false);
  const [minDollars, setMinDollars] = useState("");
  const [dollarAmount, setDollarAmount] = useState("");

  const [pageNumber, setPageNumber] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Controls whether the Next button is allowed to request another page.
  const [hasNextPage, setHasNextPage] = useState(false);

  const [searchEmail, setSearchEmail] = useState("");
  const [searchActive, setSearchActive] = useState(false);
  const [searching, setSearching] = useState(false);

  const [totalDollars, setTotalDollars] = useState(null);

  // حالة جديدة لتخزين العدد الكلي للحسابات
  const [totalCount, setTotalCount] = useState(null);

  const [modal, setModal] = useState(null);
  const { toasts, push } = useToasts();

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);

    try {
      const params = new URLSearchParams();

      if (filterBox) params.set("hasBox", "true");
      if (filterDiscount) params.set("hasDiscount", "true");
      if (minDollars !== "") params.set("minDollars", String(minDollars));
      if (dollarAmount !== "") {
        params.set("dollarAmount", String(dollarAmount));
      }

      const hasFilters = [...params.keys()].length > 0;

      params.set("PageSize", String(pageSize));
      params.set("PageNumber", String(pageNumber));

      const url = hasFilters
        ? `${API_BASE_URL}/filter?${params.toString()}`
        : `${API_BASE_URL}?${params.toString()}`;

      const res = await fetch(url);

      if (!res.ok) {
        const msg = await readErrorMessage(res);

        // The current API returns 500 + "There is no accounts" when the
        // requested page is beyond the last page. Treat it as the end,
        // not as a visible application error.
        if (
          pageNumber > 1 &&
          msg &&
          msg.toLowerCase().includes(NO_ACCOUNTS_MESSAGE)
        ) {
          setHasNextPage(false);
          setPageNumber((p) => Math.max(1, p - 1));
          return;
        }

        if (msg && msg.toLowerCase().includes(NO_ACCOUNTS_MESSAGE)) {
          setAccounts([]);
          setHasNextPage(false);
          return;
        }

        throw new Error(msg || "Couldn't load accounts. Please try again.");
      }

      const data = await res.json();
      const results = Array.isArray(data) ? data : [];

      setAccounts(results);

      if (hasFilters) {
        // /Count is the count of all accounts, not the filtered result set.
        // Therefore filters use the current page as a hint. If the next
        // page is empty, the handler above moves us back automatically.
        setHasNextPage(results.length === pageSize);
      } else if (totalCount !== null) {
        // For the normal list we know the exact number of pages.
        setHasNextPage(pageNumber * pageSize < totalCount);
      } else {
        // Fallback while /Count is still loading.
        setHasNextPage(results.length === pageSize);
      }
    } catch (err) {
      setLoadError(
        err instanceof TypeError
          ? "Couldn't reach the API. Check the base URL and that the server is running."
          : err.message || "Something went wrong loading accounts.",
      );
    } finally {
      setLoading(false);
    }
  }, [
    filterBox,
    filterDiscount,
    dollarAmount,
    minDollars,
    pageNumber,
    pageSize,
    totalCount,
  ]);

  const fetchTotalDollars = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/Dollars`);
      if (!res.ok) return;
      const sum = await res.json();
      setTotalDollars(typeof sum === "number" ? sum : Number(sum) || 0);
    } catch {
      // silent
    }
  }, []);

  // دالة جديدة لجلب العدد الكلي للحسابات من الـ API
  const fetchTotalCount = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/Count`);
      if (!res.ok) return;
      const count = await res.json();
      setTotalCount(typeof count === "number" ? count : Number(count) || 0);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    fetchTotalDollars();
    fetchTotalCount();
  }, [fetchTotalDollars, fetchTotalCount]);

  // Once the exact total count is known, calculate the real Next state
  // for the normal (unfiltered) list.
  useEffect(() => {
    const hasFilters =
      filterBox || filterDiscount || minDollars !== "" || dollarAmount !== "";

    if (!searchActive && !hasFilters && totalCount !== null) {
      setHasNextPage(pageNumber * pageSize < totalCount);
    }
  }, [
    totalCount,
    pageNumber,
    pageSize,
    filterBox,
    filterDiscount,
    minDollars,
    dollarAmount,
    searchActive,
  ]);

  async function searchByEmail() {
    const email = searchEmail.trim();

    if (!email) return;

    setSearching(true);
    setLoadError(null);

    try {
      const res = await fetch(
        `${API_BASE_URL}/search?email=${encodeURIComponent(email)}`,
      );

      if (res.status === 404) {
        setSearchActive(true);
        setAccounts([]);
        return;
      }

      if (!res.ok) {
        const msg = await readErrorMessage(res);
        throw new Error(
          msg || "Couldn't search for that account. Please try again.",
        );
      }

      const accounts = await res.json();
      const results = Array.isArray(accounts) ? accounts : [];

      setSearchActive(true);
      setAccounts(results);
      setHasNextPage(false);
      setLoadError(null);
    } catch (err) {
      setLoadError(
        err instanceof TypeError
          ? "Couldn't reach the API. Check the base URL and that the server is running."
          : err.message || "Something went wrong searching for that account.",
      );
    } finally {
      setSearching(false);
    }
  }

  function clearSearch() {
    setSearchEmail("");
    setSearchActive(false);
    setPageNumber(1);
    setHasNextPage(false);
    setLoadError(null);
    load();
  }

  function refresh() {
    fetchTotalDollars();
    fetchTotalCount(); // تحديث العدد الكلي عند طلب التحديث
    return searchActive ? searchByEmail() : load();
  }

  async function addAccount({
    email,
    dollar,
    isHasBox,
    isHasDiscount,
    isBanned,
  }) {
    const res = await fetch(API_BASE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        dollar,
        isHasBox,
        isHasDiscount,
        isBanned,
      }),
    });
    if (!res.ok) {
      const msg = await readErrorMessage(res);
      throw new Error(
        msg ||
          "Couldn't add this account. Please check the details and try again.",
      );
    }
    push("ok", `${email} added to the ledger`);
    setModal(null);
    setSearchActive(false);
    setSearchEmail("");
    setPageNumber(1);
    setHasNextPage(false);
    load();
    fetchTotalDollars();
    fetchTotalCount(); // تحديث العدد الكلي بعد الإضافة
  }

  async function editAccount(
    id,
    { email, dollar, isHasBox, isHasDiscount, isBanned },
  ) {
    const res = await fetch(`${API_BASE_URL}/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        dollar,
        isHasBox,
        isHasDiscount,
        isBanned,
      }),
    });
    if (!res.ok) {
      const msg = await readErrorMessage(res);
      throw new Error(msg || "Couldn't save these changes. Please try again.");
    }
    push("ok", "Account updated");
    setModal(null);
    refresh();
  }

  async function useDollars(id, amount) {
    const res = await fetch(
      `${API_BASE_URL}/${id}/use-dollars?dollarsAmountUsed=${encodeURIComponent(amount)}`,
      { method: "PATCH" },
    );
    if (!res.ok) {
      const msg = await readErrorMessage(res);
      throw new Error(msg || "Couldn't deduct dollars. Please try again.");
    }
    push("ok", `$${amount} deducted`);
    setModal(null);
    refresh();
  }

  async function deleteAccount(id) {
    const res = await fetch(`${API_BASE_URL}/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const msg = await readErrorMessage(res);
      throw new Error(msg || "Couldn't delete this account. Please try again.");
    }
    push("ok", "Account deleted");
    setModal(null);
    if (searchActive) {
      setSearchActive(false);
      setSearchEmail("");
    }

    setPageNumber(1);
    setHasNextPage(false);
    fetchTotalDollars();
    fetchTotalCount(); // تحديث العدد الكلي بعد الحذف
  }

  async function guarded(fn, ...args) {
    try {
      await fn(...args);
    } catch (err) {
      push("err", err.message || "Request failed");
    }
  }

  return (
    <div className="ledger-root">
      <style>{CSS}</style>

      <header className="ledger-header">
        <div className="header-title-area">
          <h1
            onClick={() => window.location.reload()}
            style={{ cursor: "pointer" }}
          >
            Ledger
          </h1>
          <p className="subtitle">
            Manage accounts, balances, and entitlements securely.
          </p>
        </div>

        <div className="header-actions">
          <button
            className="icon-btn"
            onClick={refresh}
            aria-label="Refresh"
            title="Refresh"
          >
            <RefreshCw size={18} className={loading ? "spin" : ""} />
          </button>
          <button
            className="primary-btn pulse-hover"
            onClick={() => setModal({ type: "add" })}
          >
            <Plus size={18} />
            <span>New Account</span>
          </button>
        </div>
      </header>

      {/* لوحة الإحصائيات مع البطاقة الجديدة */}
      <div className="stats-dashboard">
        {totalDollars !== null && (
          <div className="stat-card highlight-card">
            <div className="stat-icon-wrapper wallet-icon">
              <Wallet size={20} />
            </div>
            <div className="stat-info">
              <span className="stat-label">Total System Balance</span>
              <span className="stat-value">{money(totalDollars)}</span>
            </div>
          </div>
        )}

        {/* البطاقة الجديدة لعرض العدد الكلي للحسابات في قاعدة البيانات */}
        {totalCount !== null && (
          <div className="stat-card">
            <div className="stat-icon-wrapper db-icon">
              <Database size={20} />
            </div>
            <div className="stat-info">
              <span className="stat-label">Total Registered Accounts</span>
              <span className="stat-value">{totalCount}</span>
            </div>
          </div>
        )}

        {/* بطاقة الحسابات المعروضة حالياً في الجدول */}
        <div className="stat-card">
          <div className="stat-icon-wrapper users-icon">
            <Users size={20} />
          </div>
          <div className="stat-info">
            <span className="stat-label">Accounts (Current View)</span>
            <span className="stat-value">{accounts.length}</span>
          </div>
        </div>
      </div>

      <div className="controls-section">
        <div className="search-bar">
          <div className="search-input">
            <Search size={16} className="text-muted" />
            <input
              type="text"
              placeholder="Search by email…"
              value={searchEmail}
              onChange={(e) => setSearchEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && searchByEmail()}
            />
          </div>
          <button
            className="ghost-btn"
            onClick={searchByEmail}
            disabled={searching || !searchEmail.trim()}
          >
            {searching ? "Searching…" : "Search"}
          </button>
          {searchActive && (
            <button className="ghost-btn clear-btn" onClick={clearSearch}>
              Clear View
            </button>
          )}
        </div>

        {!searchActive && (
          <div className="toolbar">
            <button
              className={`chip ${filterBox ? "chip-on" : ""}`}
              onClick={() => setFilterBox((v) => !v)}
            >
              <Box size={14} />
              Has box
            </button>
            <button
              className={`chip ${filterDiscount ? "chip-on" : ""}`}
              onClick={() => setFilterDiscount((v) => !v)}
            >
              <Percent size={14} />
              Has discount
            </button>
            <div className="min-dollar">
              <span>Balance over</span>
              <div className="min-dollar-input-wrap">
                <span className="currency-symbol">$</span>
                <input
                  type="number"
                  min="0"
                  placeholder="0"
                  value={minDollars}
                  onChange={(e) => setMinDollars(e.target.value)}
                />
              </div>
            </div>

            <div className="min-dollar">
              <span>Exact balance</span>
              <div className="min-dollar-input-wrap">
                <span className="currency-symbol">$</span>
                <input
                  type="number"
                  min="0"
                  placeholder="0"
                  value={dollarAmount}
                  onChange={(e) => setDollarAmount(e.target.value)}
                />
              </div>
            </div>
            <button
              className="ghost-btn apply-filters"
              onClick={() => {
                setPageNumber(1);
                setHasNextPage(false);
              }}
            >
              Apply filters
            </button>
          </div>
        )}
      </div>

      <main className="ledger-table-wrap">
        {loadError && (
          <div className="banner banner-err">
            <AlertCircle size={18} />
            <span>{loadError}</span>
          </div>
        )}

        {!loadError && accounts.length === 0 && !loading && !searching && (
          <div className="empty-state">
            <div className="empty-icon-wrap">
              <Search size={48} />
            </div>
            <h3>{searchActive ? "Account not found" : "No accounts found"}</h3>
            <p>
              {searchActive
                ? "No account matched that email search."
                : "Try adjusting the filters above, or create a new account to get started."}
            </p>
            {!searchActive && (
              <button
                className="primary-btn"
                onClick={() => setModal({ type: "add" })}
              >
                <Plus size={16} /> Add First Account
              </button>
            )}
          </div>
        )}

        {accounts.length > 0 && (
          <div className="table-responsive">
            <table className="ledger-table">
              <thead>
                <tr>
                  <th className="col-email">Email Address</th>
                  <th className="col-tag">Box</th>
                  <th className="col-tag">Discount</th>
                  <th className="col-tag">Status</th>
                  <th className="col-balance">Balance</th>
                  <th className="col-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((acc) => {
                  const id = acc.id;
                  return (
                    <tr key={id} className="table-row">
                      <td className="col-email font-medium">{acc.email}</td>
                      <td className="col-tag">
                        <span
                          className={`status-badge ${acc.isHasBox ? "badge-box" : "badge-off"}`}
                        >
                          {acc.isHasBox ? "Yes" : "No"}
                        </span>
                      </td>
                      <td className="col-tag">
                        <span
                          className={`status-badge ${acc.isHasDiscount ? "badge-discount" : "badge-off"}`}
                        >
                          {acc.isHasDiscount ? "Active" : "None"}
                        </span>
                      </td>
                      <td className="col-tag">
                        <span
                          className={`status-badge ${acc.isBanned ? "badge-banned" : "badge-safe"}`}
                        >
                          {acc.isBanned ? "Banned" : "Active"}
                        </span>
                      </td>
                      <td className="col-balance">{money(acc.dollar)}</td>
                      <td className="col-actions">
                        <div className="action-buttons">
                          <button
                            className="row-btn"
                            onClick={() =>
                              setModal({ type: "edit", account: acc, id })
                            }
                            title="Edit account"
                          >
                            <Pencil size={14} />
                            <span>Edit</span>
                          </button>
                          <button
                            className="row-btn row-btn-accent"
                            onClick={() =>
                              setModal({ type: "use", account: acc, id })
                            }
                            title="Use dollars"
                          >
                            <Coins size={14} />
                            <span>Use $</span>
                          </button>
                          <button
                            className="row-btn row-btn-danger icon-only"
                            onClick={() =>
                              setModal({ type: "delete", account: acc, id })
                            }
                            title="Delete account"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {!searchActive && accounts.length > 0 && (
          <div className="pagination-bar">
            <div className="page-size">
              <span>Rows per page</span>
              <div className="custom-select">
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPageNumber(1);
                    setHasNextPage(false);
                  }}
                >
                  <option value={5}>5</option>
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                </select>
              </div>
            </div>
            <div className="page-nav">
              <button
                className="ghost-btn nav-btn"
                onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
                disabled={pageNumber <= 1 || loading}
              >
                Previous
              </button>
              <div className="page-indicator">
                <span className="page-label">Page</span>
                <span className="page-number">{pageNumber}</span>
              </div>
              <button
                className="ghost-btn nav-btn"
                onClick={() => {
                  if (hasNextPage && !loading) {
                    setPageNumber((p) => p + 1);
                  }
                }}
                disabled={!hasNextPage || loading}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </main>

      {modal?.type === "add" && (
        <AddModal
          onClose={() => setModal(null)}
          onSubmit={(vals) => guarded(addAccount, vals)}
        />
      )}
      {modal?.type === "edit" && (
        <EditModal
          account={modal.account}
          onClose={() => setModal(null)}
          onSubmit={(vals) => guarded(editAccount, modal.id, vals)}
        />
      )}
      {modal?.type === "use" && (
        <UseDollarsModal
          account={modal.account}
          onClose={() => setModal(null)}
          onSubmit={(amount) => guarded(useDollars, modal.id, amount)}
        />
      )}
      {modal?.type === "delete" && (
        <DeleteModal
          account={modal.account}
          onClose={() => setModal(null)}
          onConfirm={() => guarded(deleteAccount, modal.id)}
        />
      )}

      <div className="toast-stack">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.tone}`}>
            {t.tone === "ok" ? (
              <CheckCircle2 size={18} />
            ) : (
              <AlertCircle size={18} />
            )}
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ModalShell({ title, onClose, children }) {
  const firstRef = useRef(null);
  useEffect(() => {
    firstRef.current?.focus();
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button
            className="icon-btn modal-close-btn"
            onClick={onClose}
            ref={firstRef}
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function AddModal({ onClose, onSubmit }) {
  const [email, setEmail] = useState("");
  const [dollar, setDollar] = useState("");
  const [isHasBox, setIsHasBox] = useState(false);
  const [isHasDiscount, setIsHasDiscount] = useState(false);
  const [isBanned, setIsBanned] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleDollarChange = (e) => {
    const val = e.target.value.replace(/[^0-9.]/g, "");
    setDollar(val);
  };

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    await onSubmit({
      email,
      dollar: Number(dollar) || 0,
      isHasBox,
      isHasDiscount,
      isBanned,
    });
    setBusy(false);
  }

  return (
    <ModalShell title="Create New Account" onClose={onClose}>
      <form className="modal-form" onSubmit={submit}>
        <label>
          Email Address
          <input
            type="text"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name"
          />
        </label>
        <label>
          Starting Balance
          <div className="input-with-icon">
            <span className="input-icon">$</span>
            <input
              type="text"
              inputMode="decimal"
              value={dollar}
              onChange={handleDollarChange}
              placeholder="0.00"
            />
          </div>
        </label>
        <div className="toggle-row">
          <ToggleField
            label="Has Box"
            checked={isHasBox}
            onChange={setIsHasBox}
          />
          <ToggleField
            label="Has Discount"
            checked={isHasDiscount}
            onChange={setIsHasDiscount}
          />
          <ToggleField
            label="Banned"
            checked={isBanned}
            onChange={setIsBanned}
          />
        </div>
        <div className="modal-actions">
          <button type="button" className="ghost-btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            className="primary-btn pulse-hover"
            disabled={busy}
          >
            {busy ? "Creating…" : "Create Account"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

function EditModal({ account, onClose, onSubmit }) {
  const [email, setEmail] = useState(account.email || "");
  const [dollar, setDollar] = useState(String(account.dollar ?? 0));
  const [isHasBox, setIsHasBox] = useState(!!account.isHasBox);
  const [isHasDiscount, setIsHasDiscount] = useState(!!account.isHasDiscount);
  const [isBanned, setIsBanned] = useState(!!account.isBanned);
  const [busy, setBusy] = useState(false);

  const handleDollarChange = (e) => {
    const val = e.target.value.replace(/[^0-9.]/g, "");
    setDollar(val);
  };

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    await onSubmit({
      email,
      dollar: Number(dollar) || 0,
      isHasBox,
      isHasDiscount,
      isBanned,
    });
    setBusy(false);
  }

  return (
    <ModalShell title="Edit Account details" onClose={onClose}>
      <form className="modal-form" onSubmit={submit}>
        <label>
          Email Address
          <input
            type="text"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label>
          Account Balance
          <div className="input-with-icon">
            <span className="input-icon">$</span>
            <input
              type="text"
              inputMode="decimal"
              value={dollar}
              onChange={handleDollarChange}
              placeholder="0.00"
            />
          </div>
        </label>
        <div className="toggle-row">
          <ToggleField
            label="Has Box"
            checked={isHasBox}
            onChange={setIsHasBox}
          />
          <ToggleField
            label="Has Discount"
            checked={isHasDiscount}
            onChange={setIsHasDiscount}
          />
          <ToggleField
            label="Banned"
            checked={isBanned}
            onChange={setIsBanned}
          />
        </div>
        <div className="modal-actions">
          <button type="button" className="ghost-btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            className="primary-btn pulse-hover"
            disabled={busy}
          >
            {busy ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

function UseDollarsModal({ account, onClose, onSubmit }) {
  const [amount, setAmount] = useState("1");
  const [busy, setBusy] = useState(false);
  const current = Number(account.dollar) || 0;
  const amountNum = Number(amount) || 0;
  const invalid = amountNum <= 0 || amountNum > current;

  async function submit(e) {
    e.preventDefault();
    if (invalid) return;

    setBusy(true);
    try {
      await onSubmit(amountNum);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell title="Deduct Funds" onClose={onClose}>
      <form className="modal-form" onSubmit={submit}>
        <div className="balance-preview">
          <span>Current Available Balance</span>
          <strong>{money(current)}</strong>
        </div>
        <label>
          Amount to deduct
          <div className="input-with-icon">
            <span className="input-icon">$</span>
            <input
              type="number"
              min="1"
              max={current}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
        </label>
        {invalid && (
          <p className="hint hint-warn">
            <AlertCircle size={12} /> Please enter an amount between $1 and{" "}
            {money(current)}.
          </p>
        )}
        <div className="modal-actions">
          <button type="button" className="ghost-btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            className="primary-btn pulse-hover"
            disabled={busy || invalid}
          >
            {busy ? "Processing…" : "Confirm Deduction"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

function DeleteModal({ account, onClose, onConfirm }) {
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell title="Delete Account" onClose={onClose}>
      <div className="modal-form">
        <div className="delete-warning">
          <AlertCircle size={32} className="warning-icon" />
          <p>
            Are you completely sure you want to remove{" "}
            <strong>{account.email}</strong>? <br />
            <span>This action cannot be undone and all data will be lost.</span>
          </p>
        </div>
        <div className="modal-actions">
          <button type="button" className="ghost-btn" onClick={onClose}>
            Keep Account
          </button>
          <button
            type="button"
            className="danger-btn"
            onClick={confirm}
            disabled={busy}
          >
            {busy ? "Deleting…" : "Yes, Delete it"}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

function ToggleField({ label, checked, onChange }) {
  return (
    <button
      type="button"
      className={`toggle ${checked ? "toggle-on" : ""}`}
      onClick={() => onChange(!checked)}
      aria-pressed={checked}
    >
      <span className="toggle-track">
        <span className="toggle-thumb" />
      </span>
      <span className="toggle-label">{label}</span>
    </button>
  );
}

// ------------------- UI & UX UPDATES (Advanced CSS) -------------------
const CSS = `
:root {
  /* Modern Color Palette */
  --bg-main: #F8FAFC;
  --bg-card: #FFFFFF;
  --text-main: #0F172A;
  --text-muted: #64748B;
  --border-color: #E2E8F0;
  
  --primary: #3B82F6;
  --primary-hover: #2563EB;
  --primary-light: #EFF6FF;
  
  --danger: #EF4444;
  --danger-hover: #DC2626;
  --danger-light: #FEF2F2;
  
  --success: #10B981;
  --success-light: #ECFDF5;
  
  --warning: #F59E0B;
  --warning-light: #FFFBEB;

  --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
  --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
  --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
  
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-xl: 16px;
  
  --transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

* {
  box-sizing: border-box;
}

*:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 2px;
  border-radius: 4px;
}

.ledger-root {
  min-height: 100vh;
  background: var(--bg-main);
  color: var(--text-main);
  font-family: 'Inter', system-ui, sans-serif;
  padding: 40px clamp(20px, 5vw, 60px) 80px;
}

/* Header */
.ledger-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 20px;
  margin-bottom: 32px;
}

.header-title-area h1 {
  font-family: 'Newsreader', serif;
  font-size: 44px;
  font-weight: 600;
  letter-spacing: -0.02em;
  margin: 0 0 8px;
  color: var(--text-main);
}

.subtitle {
  margin: 0;
  color: var(--text-muted);
  font-size: 15px;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

/* Buttons */
.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  color: var(--text-muted);
  cursor: pointer;
  transition: var(--transition);
  box-shadow: var(--shadow-sm);
}
.icon-btn:hover { border-color: var(--text-muted); color: var(--text-main); }

.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.primary-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: var(--primary);
  color: #FFFFFF;
  border: none;
  border-radius: var(--radius-md);
  padding: 10px 20px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: var(--transition);
  box-shadow: var(--shadow-sm);
}
.primary-btn:hover { background: var(--primary-hover); box-shadow: var(--shadow-md); }
.primary-btn:disabled { opacity: 0.6; cursor: not-allowed; }

.pulse-hover:active { transform: scale(0.96); }

.ghost-btn {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  color: var(--text-main);
  border-radius: var(--radius-md);
  padding: 9px 16px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: var(--transition);
  box-shadow: var(--shadow-sm);
}
.ghost-btn:hover { border-color: var(--text-muted); background: #F1F5F9; }
.ghost-btn:disabled { opacity: 0.5; cursor: not-allowed; box-shadow: none; }

.danger-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: var(--danger);
  color: #FFFFFF;
  border: none;
  border-radius: var(--radius-md);
  padding: 10px 20px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: var(--transition);
}
.danger-btn:hover { background: var(--danger-hover); box-shadow: var(--shadow-md); }
.danger-btn:disabled { opacity: 0.6; cursor: not-allowed; }

/* Dashboard Stats Cards */
.stats-dashboard {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 20px;
  margin-bottom: 32px;
}

.stat-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  padding: 24px;
  display: flex;
  align-items: center;
  gap: 16px;
  box-shadow: var(--shadow-sm);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}
.stat-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}
.highlight-card {
  border-color: var(--primary);
  background: var(--primary-light);
}

.stat-icon-wrapper {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.wallet-icon { background: var(--primary); color: white; }
.users-icon { background: #E2E8F0; color: var(--text-muted); }
.db-icon { background: #FDE68A; color: #92400E; } /* لون مميز للأيقونة الجديدة */

.stat-info { display: flex; flex-direction: column; gap: 4px; }
.stat-label { font-size: 13px; color: var(--text-muted); font-weight: 500; text-transform: uppercase; letter-spacing: 0.05em; }
.stat-value { font-size: 28px; font-weight: 600; font-family: 'IBM Plex Mono', monospace; color: var(--text-main); }


/* Controls (Search & Filters) */
.controls-section {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  padding: 20px;
  margin-bottom: 24px;
  box-shadow: var(--shadow-sm);
}

.search-bar { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.search-input {
  display: flex; align-items: center; gap: 10px; flex: 1; min-width: 260px;
  padding: 10px 16px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-color);
  background: var(--bg-main);
  transition: var(--transition);
}
.search-input:focus-within { border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-light); background: #FFF; }
.search-input input { flex: 1; border: none; background: transparent; outline: none; font-size: 14px; color: var(--text-main); }
.text-muted { color: var(--text-muted); }

.toolbar { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border-color); }
.chip {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 8px 16px;
  border-radius: 999px;
  border: 1px solid var(--border-color);
  background: var(--bg-main);
  color: var(--text-muted);
  font-size: 13px; font-weight: 500;
  cursor: pointer; transition: var(--transition);
}
.chip:hover { background: #E2E8F0; }
.chip-on { border-color: var(--primary); color: var(--primary); background: var(--primary-light); }

.min-dollar { display: flex; align-items: center; gap: 12px; font-size: 14px; font-weight: 500; color: var(--text-muted); }
.min-dollar-input-wrap {
  position: relative;
  display: flex; align-items: center;
}
.currency-symbol { position: absolute; left: 12px; color: var(--text-muted); font-size: 13px; }
.min-dollar input {
  width: 90px;
  padding: 8px 12px 8px 24px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-color);
  background: var(--bg-main);
  font-family: 'IBM Plex Mono', monospace;
  font-size: 14px;
  transition: var(--transition);
}
.min-dollar input:focus { outline: none; border-color: var(--primary); background: #FFF; }

.apply-filters { margin-left: auto; }
.clear-btn { color: var(--danger); }

/* Table */
.table-responsive {
  width: 100%;
  overflow-x: auto;
  overflow-y: auto;
  max-height: 600px; /* Enables Sticky Header on long lists */
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  box-shadow: var(--shadow-sm);
  position: relative;
}

.ledger-table { width: 100%; border-collapse: collapse; min-width: 750px; }
.ledger-table thead th {
  position: sticky;
  top: 0; /* Sticky Header */
  z-index: 10;
  background: #F8FAFC;
  text-align: left;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
  padding: 16px 20px;
  border-bottom: 2px solid var(--border-color);
}
.ledger-table td {
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-color);
  font-size: 14px;
  vertical-align: middle;
  transition: background 0.15s ease;
}
.table-row:hover td { background: var(--primary-light); }
.table-row:last-child td { border-bottom: none; }

.font-medium { font-weight: 500; }
.col-tag { width: 100px; }
.col-balance { text-align: right; font-family: 'IBM Plex Mono', monospace; font-weight: 600; width: 140px; font-size: 15px; }
.col-actions { width: 220px; text-align: right; }

/* Status Badges */
.status-badge {
  display: inline-flex; align-items: center; justify-content: center;
  padding: 4px 10px; border-radius: 999px;
  font-size: 12px; font-weight: 600; letter-spacing: 0.02em;
}
.badge-off { background: #F1F5F9; color: var(--text-muted); }
.badge-box { background: #E0E7FF; color: #4338CA; }
.badge-discount { background: var(--success-light); color: #047857; }
.badge-safe { background: var(--success-light); color: #047857; }
.badge-banned { background: var(--danger-light); color: var(--danger); }

/* Row Buttons */
.action-buttons { display: flex; align-items: center; justify-content: flex-end; gap: 8px; }
.row-btn {
  display: inline-flex; align-items: center; gap: 6px;
  border: 1px solid transparent; background: transparent; color: var(--text-muted);
  font-size: 13px; font-weight: 500; padding: 6px 8px; border-radius: 6px;
  cursor: pointer; transition: var(--transition);
}
.row-btn:hover { background: #F1F5F9; color: var(--text-main); }
.row-btn-accent { color: var(--primary); }
.row-btn-accent:hover { background: var(--primary-light); border-color: #BFDBFE; }
.row-btn-danger { color: var(--danger); }
.row-btn-danger:hover { background: var(--danger-light); border-color: #FECACA; }
.icon-only { padding: 6px; }

/* Empty State / Errors */
.empty-state {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  padding: 80px 20px; text-align: center;
  background: var(--bg-card); border-radius: var(--radius-lg); border: 1px dashed var(--border-color);
}
.empty-icon-wrap {
  width: 80px; height: 80px; background: var(--primary-light); color: var(--primary);
  border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-bottom: 20px;
}
.empty-state h3 { font-size: 20px; font-weight: 600; color: var(--text-main); margin: 0 0 8px; }
.empty-state p { color: var(--text-muted); max-width: 400px; margin: 0 0 24px; line-height: 1.5; }

/* Pagination */
.pagination-bar {
  display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 16px;
  margin-top: 20px; padding: 0 4px;
}
.page-size { display: flex; align-items: center; gap: 12px; font-size: 14px; color: var(--text-muted); font-weight: 500; }
.custom-select select {
  padding: 8px 12px; border-radius: var(--radius-md); border: 1px solid var(--border-color);
  background: var(--bg-card); color: var(--text-main); font-weight: 500; cursor: pointer;
  transition: var(--transition); outline: none;
}
.custom-select select:focus { border-color: var(--primary); }
.page-nav { display: flex; align-items: center; gap: 8px; }
.page-indicator {
  display: flex; align-items: center; gap: 6px; padding: 0 12px;
  font-size: 14px; color: var(--text-muted);
}
.page-number { font-weight: 600; color: var(--text-main); background: var(--bg-card); padding: 4px 12px; border-radius: 6px; border: 1px solid var(--border-color); }

/* Modals */
.modal-overlay {
  position: fixed; inset: 0; background: rgba(15, 23, 42, 0.6);
  backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center;
  padding: 20px; z-index: 100; animation: fadeIn 0.2s ease-out;
}
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

.modal {
  width: 100%; max-width: 420px; background: var(--bg-card);
  border-radius: var(--radius-xl); border: 1px solid var(--border-color);
  padding: 28px; box-shadow: var(--shadow-lg);
  transform: translateY(0); animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}
@keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

.modal-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
.modal-head h2 { font-family: 'Inter', sans-serif; font-size: 20px; font-weight: 600; margin: 0; color: var(--text-main); }
.modal-close-btn { border: none; box-shadow: none; background: #F1F5F9; }
.modal-close-btn:hover { background: #E2E8F0; transform: rotate(90deg); }

.modal-form { display: flex; flex-direction: column; gap: 20px; }
.modal-form label { display: flex; flex-direction: column; gap: 8px; font-size: 14px; color: var(--text-main); font-weight: 500; }
.modal-form input[type="email"], .modal-form input[type="text"], .modal-form input[type="number"] {
  font-family: 'Inter', sans-serif; font-size: 15px; padding: 12px 14px;
  border-radius: var(--radius-md); border: 1px solid var(--border-color); background: var(--bg-main);
  color: var(--text-main); transition: var(--transition);
}
.modal-form input:focus { outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-light); background: #FFF; }

.input-with-icon { position: relative; display: flex; align-items: center; }
.input-icon { position: absolute; left: 14px; color: var(--text-muted); font-weight: 500; }
.input-with-icon input { width: 100%; padding-left: 32px !important; }

.toggle-row { display: flex; flex-direction: column; gap: 12px; background: var(--bg-main); padding: 16px; border-radius: var(--radius-md); border: 1px solid var(--border-color); }
.toggle {
  display: flex; align-items: center; justify-content: space-between; width: 100%;
  background: none; border: none; cursor: pointer; padding: 0;
}
.toggle-label { font-size: 14px; font-weight: 500; color: var(--text-main); }
.toggle-track { width: 40px; height: 22px; border-radius: 999px; background: #CBD5E1; position: relative; transition: var(--transition); }
.toggle-thumb { position: absolute; top: 2px; left: 2px; width: 18px; height: 18px; border-radius: 50%; background: #fff; transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1); box-shadow: var(--shadow-sm); }
.toggle-on .toggle-track { background: var(--primary); }
.toggle-on .toggle-thumb { transform: translateX(18px); }

.balance-preview { display: flex; justify-content: space-between; align-items: center; padding: 16px; background: var(--primary-light); border: 1px solid #BFDBFE; border-radius: var(--radius-md); margin-bottom: 8px; }
.balance-preview span { font-size: 13px; color: var(--primary); font-weight: 500; }
.balance-preview strong { font-size: 18px; color: var(--primary-hover); font-family: 'IBM Plex Mono', monospace; }

.delete-warning { text-align: center; margin-bottom: 10px; }
.warning-icon { color: var(--danger); margin-bottom: 16px; }
.delete-warning p { font-size: 15px; color: var(--text-main); line-height: 1.5; margin: 0; }
.delete-warning span { display: block; margin-top: 8px; font-size: 13px; color: var(--text-muted); }

.modal-actions { display: flex; justify-content: flex-end; gap: 12px; margin-top: 12px; }

/* Toasts */
.toast-stack { position: fixed; bottom: 24px; right: 24px; display: flex; flex-direction: column; gap: 12px; z-index: 200; }
.toast {
  display: flex; align-items: center; gap: 12px; padding: 14px 20px;
  border-radius: var(--radius-lg); font-size: 14px; font-weight: 500;
  box-shadow: var(--shadow-lg); animation: slideInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  background: var(--bg-card); border-left: 4px solid transparent;
}
@keyframes slideInRight { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
.toast-ok { border-left-color: var(--success); color: var(--text-main); }
.toast-ok svg { color: var(--success); }
.toast-err { border-left-color: var(--danger); color: var(--text-main); }
.toast-err svg { color: var(--danger); }

/* Responsive adjustments */
@media (max-width: 768px) {
  .ledger-root { padding: 24px 16px 80px; }
  .header-actions { width: 100%; }
  .header-actions button { flex: 1; justify-content: center; }
  .search-input { min-width: 100%; }
  .apply-filters { margin-left: 0; width: 100%; }
  .controls-section { padding: 16px; }
  .stats-dashboard { grid-template-columns: 1fr; }
}
`;
