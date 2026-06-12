import { createContext, useContext, useState, useCallback, useEffect } from 'react';

// App-wide modal system replacing native window.alert/confirm/prompt (which
// look out of place in a PWA and can't be styled). Promise-based so call sites
// read almost the same as the native ones:
//
//   const { confirm, notify, prompt } = useModal();
//   if (!(await confirm('Delete this?'))) return;          // → boolean
//   notify('Saved!');                                       // fire-and-forget
//   const url = await prompt({ message: 'URL', defaultValue: 'https://' }); // → string | null
//
// Options may be a plain string (used as the message) or an object:
//   { title, message, confirmLabel, cancelLabel, danger, defaultValue, placeholder }

const ModalContext = createContext(null);

export function useModal() {
  const ctx = useContext(ModalContext);
  if (!ctx) throw new Error('useModal must be used within <ModalProvider>');
  return ctx;
}

const normalize = (opts) => (typeof opts === 'string' ? { message: opts } : (opts || {}));

// Imperative singleton so any module (not just components) can call
// modal.confirm/notify/prompt without the hook. ModalProvider registers the
// live functions on mount; before that (or in tests) we fall back to native
// dialogs so nothing silently no-ops.
let _api = null;
const _native = {
  confirm: (o) => Promise.resolve(window.confirm(normalize(o).message || '')),
  notify: (o) => { window.alert(normalize(o).message || ''); return Promise.resolve(true); },
  prompt: (o) => Promise.resolve(window.prompt(normalize(o).message || '', normalize(o).defaultValue || '')),
};
export const modal = {
  confirm: (o) => (_api || _native).confirm(o),
  notify: (o) => (_api || _native).notify(o),
  prompt: (o) => (_api || _native).prompt(o),
};

export function ModalProvider({ children }) {
  const [modal, setModal] = useState(null); // { type, resolve, ...opts }
  const [value, setValue] = useState('');   // controlled prompt input

  const confirm = useCallback((opts) => new Promise((resolve) => {
    setModal({ type: 'confirm', confirmLabel: 'Confirm', cancelLabel: 'Cancel', ...normalize(opts), resolve });
  }), []);

  const notify = useCallback((opts) => new Promise((resolve) => {
    setModal({ type: 'alert', confirmLabel: 'OK', ...normalize(opts), resolve });
  }), []);

  const prompt = useCallback((opts) => new Promise((resolve) => {
    const o = normalize(opts);
    setValue(o.defaultValue || '');
    setModal({ type: 'prompt', confirmLabel: 'OK', cancelLabel: 'Cancel', ...o, resolve });
  }), []);

  const settle = useCallback((result) => {
    setModal((m) => { m?.resolve?.(result); return null; });
  }, []);

  // Register the imperative singleton so modal.* works app-wide.
  useEffect(() => {
    _api = { confirm, notify, prompt };
    return () => { if (_api?.confirm === confirm) _api = null; };
  }, [confirm, notify, prompt]);

  // Cancel on Escape, confirm on Enter (Enter only for confirm/alert, not the
  // multiline-free prompt where the input handles its own Enter).
  useEffect(() => {
    if (!modal) return;
    const onKey = (e) => {
      if (e.key === 'Escape') settle(modal.type === 'prompt' ? null : false);
      else if (e.key === 'Enter' && modal.type !== 'prompt') settle(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modal, settle]);

  const onCancel = () => settle(modal.type === 'prompt' ? null : false);
  const onConfirm = () => settle(modal.type === 'prompt' ? value : true);

  return (
    <ModalContext.Provider value={{ confirm, notify, prompt }}>
      {children}
      {modal && (
        <div
          onClick={onCancel}
          style={{
            position: 'fixed', inset: 0, zIndex: 4000, background: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: 360, background: 'var(--bg-card)',
              borderRadius: 16, padding: 20, border: '1px solid var(--divider)',
              boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
            }}
          >
            {modal.title && (
              <h3 style={{ fontSize: 17, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 8 }}>{modal.title}</h3>
            )}
            {modal.message && (
              <p style={{ fontSize: 14, lineHeight: 1.5, color: 'var(--text-secondary)', marginBottom: 16, whiteSpace: 'pre-wrap' }}>{modal.message}</p>
            )}

            {modal.type === 'prompt' && (
              <input
                autoFocus
                type={modal.password ? 'password' : 'text'}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') onConfirm(); }}
                placeholder={modal.placeholder || ''}
                style={{
                  width: '100%', padding: '11px 14px', borderRadius: 10, marginBottom: 16,
                  background: 'var(--bg-primary)', border: '1px solid var(--divider)',
                  color: 'var(--text-primary)', fontSize: 14, outline: 'none',
                }}
              />
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              {modal.type !== 'alert' && (
                <button onClick={onCancel} style={{
                  padding: '10px 18px', borderRadius: 10, border: 'none', cursor: 'pointer',
                  background: 'var(--bg-primary)', color: 'var(--text-secondary)', fontSize: 14, fontWeight: 700,
                }}>{modal.cancelLabel}</button>
              )}
              <button onClick={onConfirm} autoFocus={modal.type !== 'prompt'} style={{
                padding: '10px 18px', borderRadius: 10, border: 'none', cursor: 'pointer',
                background: modal.danger ? '#FF453A' : 'var(--accent)', color: '#fff', fontSize: 14, fontWeight: 800,
              }}>{modal.confirmLabel}</button>
            </div>
          </div>
        </div>
      )}
    </ModalContext.Provider>
  );
}
