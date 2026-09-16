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
} from "lucide-react";

// ---------------------------------------------------------------------------
// Ledger — an account/wallet admin console for the Account API.
//
// Accounts are expected to include: id, email, dollar, isHasBox,
// isHasDiscount, isBanned. The real "id" from the backend is always used
// for edit/use-dollars requests — no index fallback.
// ---------------------------------------------------------------------------

const API_BASE_URL = "http://accountsystem.runasp.net/api/Account";

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
      const raw = data.message || data.title || data.error || (typeof data === "string" ? data : null);
      return raw ? cleanExceptionText(raw) : null;
    } catch {
      return cleanExceptionText(text);
    }
  } catch {
    return null;
  }
}

// ASP.NET's dev exception page dumps the full stack trace as the response
// body (e.g. "System.Exception: There is no accounts at Namespace.Method()
// ..."). Pull out just the human-written exception message.
function cleanExceptionText(text) {
  const beforeStack = text.split(/\s+at\s+[A-Z]/)[0];
  const match = beforeStack.match(/(?:Exception|Error)\s*:\s*(.+)$/s);
  const cleaned = (match ? match[1] : beforeStack).trim();
  if (!cleaned || cleaned.length > 200) return null;
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

  const [pageNumber, setPageNumber] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [searchEmail, setSearchEmail] = useState("");
  const [searchActive, setSearchActive] = useState(false);
  const [searching, setSearching] = useState(false);

  const [totalDollars, setTotalDollars] = useState(null);

  const [modal, setModal] = useState(null); // { type: 'add'|'edit'|'use', account? }
  const { toasts, push } = useToasts();

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const params = new URLSearchParams();
      if (filterBox) params.set("hasBox", "true");
      if (filterDiscount) params.set("hasDiscount", "true");
      if (minDollars !== "") params.set("minDollars", String(minDollars));
      const hasFilters = [...params.keys()].length > 0;
      params.set("PageSize", String(pageSize));
      params.set("PageNumber", String(pageNumber));
      const url = hasFilters ? `${API_BASE_URL}/filter?${params}` : `${API_BASE_URL}?${params}`;
      const res = await fetch(url);
      if (!res.ok) {
        const msg = await readErrorMessage(res);
        if (msg && msg.toLowerCase().includes(NO_ACCOUNTS_MESSAGE)) {
          setAccounts([]);
          return;
        }
        throw new Error(msg || "Couldn't load accounts. Please try again.");
      }
      const data = await res.json();
      setAccounts(Array.isArray(data) ? data : []);
    } catch (err) {
      setLoadError(
        err instanceof TypeError
          ? "Couldn't reach the API. Check the base URL and that the server is running."
          : err.message || "Something went wrong loading accounts."
      );
    } finally {
      setLoading(false);
    }
  }, [filterBox, filterDiscount, minDollars, pageNumber, pageSize]);

  const fetchTotalDollars = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/Dollars`);
      if (!res.ok) return;
      const sum = await res.json();
      setTotalDollars(typeof sum === "number" ? sum : Number(sum) || 0);
    } catch {
      // silent — this is a supplementary figure, not core to the table
    }
  }, []);

  useEffect(() => {
    load();
    fetchTotalDollars();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageNumber, pageSize]);

  async function searchByEmail() {
    const email = searchEmail.trim();
    if (!email) return;
    setSearching(true);
    setLoadError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/search?email=${encodeURIComponent(email)}`);
      if (res.status === 404) {
        setSearchActive(true);
        setAccounts([]);
        return;
      }
      if (!res.ok) {
        const msg = await readErrorMessage(res);
        throw new Error(msg || "Couldn't search for that account. Please try again.");
      }
      const account = await res.json();
      setSearchActive(true);
      setAccounts(account ? [account] : []);
    } catch (err) {
      setLoadError(
        err instanceof TypeError
          ? "Couldn't reach the API. Check the base URL and that the server is running."
          : err.message || "Something went wrong searching for that account."
      );
    } finally {
      setSearching(false);
    }
  }

  function clearSearch() {
    setSearchEmail("");
    setSearchActive(false);
    setLoadError(null);
    load();
  }

  function refresh() {
    fetchTotalDollars();
    return searchActive ? searchByEmail() : load();
  }

  async function addAccount({ email, dollar, isHasBox, isHasDiscount, isBanned }) {
    const res = await fetch(API_BASE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, dollar, isHasBox, isHasDiscount, isBanned }),
    });
    if (!res.ok) {
      const msg = await readErrorMessage(res);
      throw new Error(msg || "Couldn't add this account. Please check the details and try again.");
    }
    push("ok", `${email} added to the ledger`);
    setModal(null);
    setSearchActive(false);
    setSearchEmail("");
    load();
    fetchTotalDollars();
  }

  async function editAccount(id, { email, dollar, isHasBox, isHasDiscount, isBanned }) {
    const res = await fetch(`${API_BASE_URL}/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, dollar, isHasBox, isHasDiscount, isBanned }),
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
      { method: "PATCH" }
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
      load();
    } else {
      load();
    }
    fetchTotalDollars();
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
        <div>
          <h1>Ledger</h1>
          <p className="subtitle">Accounts, balances, and entitlements in one book.</p>
          {totalDollars !== null && (
            <p className="total-dollars">
              Total balance: <strong>{money(totalDollars)}</strong>
            </p>
          )}
        </div>
        <div className="header-actions">
          <button
            className="icon-btn"
            onClick={() => {
              load();
              fetchTotalDollars();
            }}
            aria-label="Refresh"
            title="Refresh"
          >
            <RefreshCw size={18} className={loading ? "spin" : ""} />
          </button>
          <button className="primary-btn" onClick={() => setModal({ type: "add" })}>
            <Plus size={16} />
            New account
          </button>
        </div>
      </header>

      <div className="search-bar">
        <div className="search-input">
          <Search size={15} />
          <input
            type="text"
            placeholder="Search by exact email…"
            value={searchEmail}
            onChange={(e) => setSearchEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && searchByEmail()}
          />
        </div>
        <button className="ghost-btn" onClick={searchByEmail} disabled={searching || !searchEmail.trim()}>
          {searching ? "Searching…" : "Search"}
        </button>
        {searchActive && (
          <button className="ghost-btn" onClick={clearSearch}>
            Clear search
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
            <input
              type="number"
              min="0"
              placeholder="0"
              value={minDollars}
              onChange={(e) => setMinDollars(e.target.value)}
            />
          </div>
          <button
            className="ghost-btn apply-filters"
            onClick={() => {
              setPageNumber(1);
              load();
            }}
          >
            Apply filters
          </button>
        </div>
      )}

      <main className="ledger-table-wrap">
        {loadError && (
          <div className="banner banner-err">
            <AlertCircle size={16} />
            {loadError}
          </div>
        )}

        {!loadError && accounts.length === 0 && !loading && !searching && (
          <div className="empty">
            <p>{searchActive ? "Account not found." : "No accounts match this view."}</p>
            <span>
              {searchActive
                ? "No account exists with that exact email."
                : "Adjust the filters above, or add the first entry."}
            </span>
          </div>
        )}

        {accounts.length > 0 && (
          <table className="ledger-table">
            <thead>
              <tr>
                <th className="col-email">Email</th>
                <th className="col-tag">Box</th>
                <th className="col-tag">Discount</th>
                <th className="col-tag">Banned</th>
                <th className="col-balance">Balance</th>
                <th className="col-actions"></th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((acc) => {
                const id = acc.id;
                return (
                  <tr key={id}>
                    <td className="col-email">{acc.email}</td>
                    <td className="col-tag">
                      <span className={`dot ${acc.isHasBox ? "dot-box" : "dot-off"}`} />
                    </td>
                    <td className="col-tag">
                      <span
                        className={`dot ${acc.isHasDiscount ? "dot-discount" : "dot-off"}`}
                      />
                    </td>
                    <td className="col-tag">
                      <span className={`dot ${acc.isBanned ? "dot-banned" : "dot-off"}`} />
                    </td>
                    <td className="col-balance">{money(acc.dollar)}</td>
                    <td className="col-actions">
                      <button
                        className="row-btn"
                        onClick={() => setModal({ type: "edit", account: acc, id })}
                        title="Edit account"
                      >
                        <Pencil size={14} />
                        Edit
                      </button>
                      <button
                        className="row-btn row-btn-accent"
                        onClick={() => setModal({ type: "use", account: acc, id })}
                        title="Use dollars"
                      >
                        <Coins size={14} />
                        Use $
                      </button>
                      <button
                        className="row-btn row-btn-danger"
                        onClick={() => setModal({ type: "delete", account: acc, id })}
                        title="Delete account"
                      >
                        <Trash2 size={14} />
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {!searchActive && (
          <div className="pagination-bar">
            <div className="page-size">
              <span>Rows per page</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPageNumber(1);
                }}
              >
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
            </div>
            <div className="page-nav">
              <button
                className="ghost-btn"
                onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
                disabled={pageNumber <= 1 || loading}
              >
                Previous
              </button>
              <span className="page-label">Page {pageNumber}</span>
              <button
                className="ghost-btn"
                onClick={() => setPageNumber((p) => p + 1)}
                disabled={accounts.length < pageSize || loading}
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
            {t.tone === "ok" ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            {t.text}
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
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} ref={firstRef} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function AddModal({ onClose, onSubmit }) {
  const [email, setEmail] = useState("");
  const [dollar, setDollar] = useState("0");
  const [isHasBox, setIsHasBox] = useState(false);
  const [isHasDiscount, setIsHasDiscount] = useState(false);
  const [isBanned, setIsBanned] = useState(false);
  const [busy, setBusy] = useState(false);

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
    <ModalShell title="Add account" onClose={onClose}>
      <form className="modal-form" onSubmit={submit}>
        <label>
          Email
          <input
            type="text"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com"
          />
        </label>
        <label>
          Starting balance
          <input
            type="number"
            min="0"
            value={dollar}
            onChange={(e) => setDollar(e.target.value)}
          />
        </label>
        <div className="toggle-row">
          <ToggleField label="Has box" checked={isHasBox} onChange={setIsHasBox} />
          <ToggleField label="Has discount" checked={isHasDiscount} onChange={setIsHasDiscount} />
          <ToggleField label="Banned" checked={isBanned} onChange={setIsBanned} />
        </div>
        <div className="modal-actions">
          <button type="button" className="ghost-btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary-btn" disabled={busy}>
            {busy ? "Adding…" : "Add account"}
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

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    await onSubmit({ email, dollar: Number(dollar) || 0, isHasBox, isHasDiscount, isBanned });
    setBusy(false);
  }

  return (
    <ModalShell title="Edit account" onClose={onClose}>
      <form className="modal-form" onSubmit={submit}>
        <label>
          Email
          <input
            type="text"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label>
          Balance
          <input
            type="number"
            min="0"
            value={dollar}
            onChange={(e) => setDollar(e.target.value)}
          />
        </label>
        <div className="toggle-row">
          <ToggleField label="Has box" checked={isHasBox} onChange={setIsHasBox} />
          <ToggleField label="Has discount" checked={isHasDiscount} onChange={setIsHasDiscount} />
          <ToggleField label="Banned" checked={isBanned} onChange={setIsBanned} />
        </div>
        <div className="modal-actions">
          <button type="button" className="ghost-btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary-btn" disabled={busy}>
            {busy ? "Saving…" : "Save changes"}
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
    setBusy(true);
    await onSubmit(amountNum);
    setBusy(false);
  }

  return (
    <ModalShell title="Use dollars" onClose={onClose}>
      <form className="modal-form" onSubmit={submit}>
        <p className="use-balance">
          Current balance <strong>{money(current)}</strong>
        </p>
        <label>
          Amount to deduct
          <input
            type="number"
            min="1"
            max={current}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>
        {invalid && (
          <p className="hint hint-warn">Enter an amount between 1 and {current}.</p>
        )}
        <div className="modal-actions">
          <button type="button" className="ghost-btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary-btn" disabled={busy || invalid}>
            {busy ? "Deducting…" : "Deduct"}
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
    await onConfirm();
    setBusy(false);
  }

  return (
    <ModalShell title="Delete account" onClose={onClose}>
      <div className="modal-form">
        <p className="hint">
          Remove <strong>{account.email}</strong> from the ledger? This can't be undone.
        </p>
        <div className="modal-actions">
          <button type="button" className="ghost-btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="danger-btn" onClick={confirm} disabled={busy}>
            {busy ? "Deleting…" : "Delete account"}
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
      {label}
    </button>
  );
}

const CSS = `
:root {
  --paper: #EAEFE9;
  --paper-raised: #F4F7F2;
  --ink: #1D3330;
  --ink-soft: #4B615D;
  --rule: #C7D1C6;
  --brass: #A9803F;
  --brass-deep: #8A6830;
  --rust: #A8462F;
  --slate: #4C6B77;
  --err-bg: #F7E7E2;
  --err-text: #8A3420;
  --ok-bg: #E4EEE2;
  --ok-text: #2F5B3C;
}

.ledger-root {
  min-height: 100%;
  background: var(--paper);
  color: var(--ink);
  font-family: 'Inter', sans-serif;
  padding: 32px clamp(16px, 4vw, 48px) 64px;
}

.ledger-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  flex-wrap: wrap;
  gap: 16px;
  border-bottom: 1px solid var(--rule);
  padding-bottom: 20px;
  margin-bottom: 20px;
}

.ledger-header h1 {
  font-family: 'Newsreader', serif;
  font-size: 40px;
  font-weight: 500;
  letter-spacing: -0.01em;
  margin: 0 0 4px;
}

.subtitle {
  margin: 0;
  color: var(--ink-soft);
  font-size: 14px;
}

.total-dollars {
  margin: 8px 0 0;
  font-size: 13px;
  color: var(--ink-soft);
}
.total-dollars strong {
  font-family: 'IBM Plex Mono', monospace;
  color: var(--brass-deep);
  font-size: 15px;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 8px;
  border: 1px solid var(--rule);
  background: var(--paper-raised);
  color: var(--ink);
  cursor: pointer;
}
.icon-btn:hover { border-color: var(--ink-soft); }

.spin { animation: spin 0.9s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.primary-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: var(--brass);
  color: #FFFCF6;
  border: none;
  border-radius: 8px;
  padding: 9px 16px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}
.primary-btn:hover { background: var(--brass-deep); }
.primary-btn:disabled { opacity: 0.6; cursor: default; }

.ghost-btn {
  background: transparent;
  border: 1px solid var(--rule);
  color: var(--ink);
  border-radius: 8px;
  padding: 8px 14px;
  font-size: 14px;
  cursor: pointer;
}
.ghost-btn:hover { border-color: var(--ink-soft); }
.ghost-btn:disabled { opacity: 0.5; cursor: default; }
.ghost-btn:disabled:hover { border-color: var(--rule); }

.toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 20px;
}

.search-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
  flex-wrap: wrap;
}
.search-input {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 220px;
  max-width: 380px;
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid var(--rule);
  background: var(--paper-raised);
  color: var(--ink-soft);
}
.search-input input {
  flex: 1;
  border: none;
  background: none;
  outline: none;
  font-size: 14px;
  color: var(--ink);
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 13px;
  border-radius: 999px;
  border: 1px solid var(--rule);
  background: var(--paper-raised);
  color: var(--ink-soft);
  font-size: 13px;
  cursor: pointer;
}
.chip-on {
  border-color: var(--slate);
  color: var(--ink);
  background: #DCE6E2;
}

.min-dollar {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--ink-soft);
}
.min-dollar input {
  width: 76px;
  padding: 6px 8px;
  border-radius: 6px;
  border: 1px solid var(--rule);
  background: #fff;
  font-family: 'IBM Plex Mono', monospace;
  font-size: 13px;
}

.apply-filters { margin-left: auto; }

.banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-radius: 8px;
  font-size: 14px;
  margin-bottom: 16px;
}
.banner-err { background: var(--err-bg); color: var(--err-text); }

.empty {
  padding: 48px 0;
  text-align: center;
  color: var(--ink-soft);
}
.empty p { font-family: 'Newsreader', serif; font-size: 20px; color: var(--ink); margin: 0 0 4px; }
.empty span { font-size: 13px; }

.ledger-table {
  width: 100%;
  border-collapse: collapse;
  background: var(--paper-raised);
  border: 1px solid var(--rule);
  border-radius: 10px;
  overflow: hidden;
}

.ledger-table thead th {
  text-align: left;
  font-size: 12px;
  font-weight: 600;
  color: var(--ink-soft);
  padding: 12px 16px;
  border-bottom: 1px solid var(--rule);
}

.ledger-table td {
  padding: 13px 16px;
  border-bottom: 1px solid var(--rule);
  font-size: 14px;
  vertical-align: middle;
}
.ledger-table tbody tr:last-child td { border-bottom: none; }
.ledger-table tbody tr:hover { background: #E3E9E0; }

.pagination-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 14px;
}
.page-size {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--ink-soft);
}
.page-size select {
  padding: 6px 8px;
  border-radius: 6px;
  border: 1px solid var(--rule);
  background: #fff;
  color: var(--ink);
  font-size: 13px;
}
.page-nav {
  display: flex;
  align-items: center;
  gap: 12px;
}
.page-label {
  font-size: 13px;
  color: var(--ink-soft);
  font-family: 'IBM Plex Mono', monospace;
}

.col-tag { text-align: center; width: 70px; }
.col-balance {
  text-align: right;
  font-family: 'IBM Plex Mono', monospace;
  font-weight: 600;
  width: 130px;
}
.col-actions {
  text-align: right;
  white-space: nowrap;
  width: 260px;
}

.dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
}
.dot-off { background: var(--rule); }
.dot-box { background: var(--slate); }
.dot-discount { background: var(--rust); }
.dot-banned { background: var(--err-text); }

.row-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: 1px solid var(--rule);
  background: transparent;
  color: var(--ink);
  font-size: 13px;
  padding: 6px 10px;
  border-radius: 7px;
  cursor: pointer;
  margin-left: 8px;
}
.row-btn:hover { border-color: var(--ink-soft); }
.row-btn-accent { color: var(--brass-deep); border-color: #D9C6A0; }
.row-btn-accent:hover { border-color: var(--brass); }
.row-btn-danger { color: var(--rust); border-color: #E0BFB6; }
.row-btn-danger:hover { border-color: var(--rust); }

.danger-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: var(--rust);
  color: #FFF7F4;
  border: none;
  border-radius: 8px;
  padding: 9px 16px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}
.danger-btn:hover { background: var(--err-text); }
.danger-btn:disabled { opacity: 0.6; cursor: default; }

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(29, 51, 48, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  z-index: 50;
}
.modal {
  width: 100%;
  max-width: 380px;
  background: var(--paper-raised);
  border-radius: 12px;
  border: 1px solid var(--rule);
  padding: 20px 22px 22px;
}
.modal-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 14px;
}
.modal-head h2 {
  font-family: 'Newsreader', serif;
  font-size: 21px;
  font-weight: 500;
  margin: 0;
}

.modal-form { display: flex; flex-direction: column; gap: 14px; }
.modal-form label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
  color: var(--ink-soft);
}
.modal-form input {
  font-family: 'Inter', sans-serif;
  font-size: 14px;
  padding: 9px 11px;
  border-radius: 7px;
  border: 1px solid var(--rule);
  background: #fff;
  color: var(--ink);
}

.toggle-row { display: flex; gap: 16px 20px; flex-wrap: wrap; }
.toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 13px;
  color: var(--ink);
  padding: 0;
}
.toggle-track {
  width: 32px;
  height: 18px;
  border-radius: 999px;
  background: var(--rule);
  position: relative;
  transition: background 0.15s ease;
}
.toggle-thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #fff;
  transition: transform 0.15s ease;
}
.toggle-on .toggle-track { background: var(--slate); }
.toggle-on .toggle-thumb { transform: translateX(14px); }

.hint { font-size: 12px; color: var(--ink-soft); margin: 0; }
.hint-warn { color: var(--rust); }
.use-balance { font-size: 14px; margin: 0; color: var(--ink-soft); }
.use-balance strong { color: var(--ink); font-family: 'IBM Plex Mono', monospace; }

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 4px;
}

.toast-stack {
  position: fixed;
  bottom: 20px;
  right: 20px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  z-index: 60;
}
.toast {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-radius: 8px;
  font-size: 13px;
  box-shadow: 0 4px 14px rgba(29,51,48,0.15);
}
.toast-ok { background: var(--ok-bg); color: var(--ok-text); }
.toast-err { background: var(--err-bg); color: var(--err-text); }

@media (max-width: 640px) {
  .col-actions { width: auto; }
  .row-btn span { display: none; }
  .apply-filters { margin-left: 0; }
}
`;
