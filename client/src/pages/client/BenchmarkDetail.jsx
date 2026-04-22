import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const LEVEL_COLORS = {
  0: '#94a3b8',
  1: '#fb7185',
  2: '#fb923c',
  3: '#facc15',
  4: '#22c55e',
  5: '#8b5cf6',
};

const UNIT_FORMATTERS = {
  seconds: v => {
    const n = Number(v);
    if (!Number.isFinite(n)) return '—';
    const m = Math.floor(n / 60);
    const s = Math.round(n % 60);
    return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`;
  },
  kg:     v => `${v}kg`,
  reps:   v => `${v} reps`,
  watts:  v => `${v}W`,
  cal:    v => `${v} cal`,
  m:      v => `${v}m`,
  default:v => String(v),
};
const fmt = (unit, v) => (UNIT_FORMATTERS[unit] || UNIT_FORMATTERS.default)(v);

export default function BenchmarkDetail() {
  const { slug } = useParams();
  const { token } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [tab, setTab] = useState('levels'); // 'levels' | 'leaderboard' | 'history'
  const [showSubmit, setShowSubmit] = useState(false);

  const refetch = useCallback(async () => {
    const res = await fetch(`/api/benchmarks/${slug}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) setData(await res.json());
  }, [slug, token]);

  useEffect(() => { refetch(); }, [refetch]);

  if (!data) return <div className="page-content" style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)' }}>Loading...</div>;

  const bm = data.benchmark;
  const best = data.my_attempts.find(a => a.status === 'verified') || data.my_attempts[0] || null;

  return (
    <div className="page-content" style={{ paddingBottom: 120 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <button onClick={() => navigate(-1)} style={backBtn}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 10, fontWeight: 800, color: 'var(--accent)', letterSpacing: 1, textTransform: 'uppercase' }}>
            {bm.category}{bm.subcategory ? ` · ${bm.subcategory}` : ''}
          </p>
          <h1 style={{ fontSize: 18, fontWeight: 800, letterSpacing: -0.3 }}>{bm.name}</h1>
        </div>
      </div>

      {/* Best result card */}
      {best && (
        <div style={{
          background: 'var(--bg-card)', borderRadius: 14, padding: 16, marginBottom: 14,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <p style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Your best
            </p>
            <p style={{ fontSize: 26, fontWeight: 900, color: 'var(--accent)', marginTop: 2 }}>
              {fmt(bm.unit, best.value)}
            </p>
            <StatusBadge status={best.status} />
          </div>
        </div>
      )}

      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: 4, background: 'var(--bg-card)', borderRadius: 50, padding: 4, marginBottom: 14 }}>
        {[['levels','Levels'],['leaderboard','Leaderboard'],['history','My history']].map(([k, l]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            style={{
              flex: 1, padding: '9px 0', borderRadius: 50, border: 'none',
              fontSize: 12, fontWeight: 700,
              background: tab === k ? 'var(--accent)' : 'transparent',
              color: tab === k ? '#fff' : 'var(--text-secondary)',
              cursor: 'pointer',
            }}
          >{l}</button>
        ))}
      </div>

      {tab === 'levels'      && <LevelsTab bm={bm} levels={data.levels} best={best} />}
      {tab === 'leaderboard' && <LeaderboardTab slug={slug} token={token} bm={bm} />}
      {tab === 'history'     && <HistoryTab bm={bm} attempts={data.my_attempts} />}

      {/* Submit button */}
      <button
        onClick={() => setShowSubmit(true)}
        style={{
          position: 'fixed', left: '50%', transform: 'translateX(-50%)', bottom: 96,
          padding: '14px 24px', borderRadius: 28, border: 'none', cursor: 'pointer',
          background: 'var(--accent)', color: '#fff', fontSize: 14, fontWeight: 800,
          boxShadow: '0 4px 16px rgba(0,0,0,0.35)', zIndex: 50,
        }}
      >
        + Submit attempt
      </button>

      {showSubmit && (
        <SubmitModal
          bm={bm}
          token={token}
          onClose={() => setShowSubmit(false)}
          onSaved={() => { setShowSubmit(false); refetch(); }}
        />
      )}
    </div>
  );
}

function LevelsTab({ bm, levels, best }) {
  const bestValue = best?.value;
  return (
    <div>
      {levels.map(L => {
        const bestIsValue = bestValue != null;
        const isSkill = bm.type === 'skill_ladder';
        const thresholdM = L.male_threshold;
        const thresholdF = L.female_threshold;
        const passed = !isSkill && bestIsValue && thresholdM != null && (
          bm.direction === 'lower' ? bestValue <= thresholdM : bestValue >= thresholdM
        );
        const lvColor = LEVEL_COLORS[L.level_number] || LEVEL_COLORS[0];
        return (
          <div key={L.id} style={{
            padding: '14px 16px', borderRadius: 12, marginBottom: 8,
            background: passed ? `${lvColor}14` : 'var(--bg-card)',
            border: passed ? `1px solid ${lvColor}55` : '1px solid transparent',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%',
                background: passed ? lvColor : 'rgba(255,255,255,0.06)',
                color: passed ? '#000' : 'var(--text-secondary)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, fontWeight: 800, flexShrink: 0,
              }}>
                {L.level_number}
              </div>
              <p style={{ fontSize: 14, fontWeight: 700, flex: 1 }}>
                {L.title || `Level ${L.level_number}`}
              </p>
              {passed && (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={lvColor} strokeWidth="3">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </div>
            {isSkill ? (
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, paddingLeft: 42 }}>
                {L.description}
              </p>
            ) : (
              <div style={{ display: 'flex', gap: 16, paddingLeft: 42, fontSize: 12, color: 'var(--text-secondary)' }}>
                <div>
                  <span style={{ color: 'var(--text-tertiary)', marginRight: 4 }}>Men</span>
                  <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{fmt(bm.unit, thresholdM)}</span>
                </div>
                <div>
                  <span style={{ color: 'var(--text-tertiary)', marginRight: 4 }}>Women</span>
                  <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{fmt(bm.unit, thresholdF)}</span>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function LeaderboardTab({ slug, token, bm }) {
  const [gender, setGender] = useState('all');
  const [age, setAge]       = useState('all');
  const [data, setData]     = useState(null);

  useEffect(() => {
    const params = new URLSearchParams();
    if (gender !== 'all') params.set('gender', gender);
    if (age !== 'all')    params.set('age', age);
    fetch(`/api/benchmarks/${slug}/leaderboard?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => r.json()).then(setData);
  }, [slug, token, gender, age]);

  return (
    <>
      <div className="hide-scrollbar" style={filterRowStyle}>
        {[['all','All'],['male','Men'],['female','Women']].map(([k, l]) => (
          <FilterChip key={k} active={gender === k} onClick={() => setGender(k)} label={l} />
        ))}
      </div>
      <div className="hide-scrollbar" style={filterRowStyle}>
        {[['all','All ages'],['20s','20-29'],['30s','30-39'],['40s','40-49'],['50s','50-59'],['60s','60-69'],['70s','70-79'],['80p','80+']].map(([k, l]) => (
          <FilterChip key={k} active={age === k} onClick={() => setAge(k)} label={l} />
        ))}
      </div>
      {!data ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)' }}>Loading...</div>
      ) : data.entries.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>
          No verified entries yet. Be first.
        </div>
      ) : (
        data.entries.map(e => (
          <div key={e.user_id} style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
            borderRadius: 10, marginBottom: 6,
            background: e.rank <= 3 ? 'rgba(255,140,0,0.08)' : 'var(--bg-card)',
          }}>
            <div style={{
              minWidth: 28, textAlign: 'center', fontSize: 13, fontWeight: 800,
              color: e.rank === 1 ? '#FFD700' : e.rank === 2 ? '#C0C0C0' : e.rank === 3 ? '#CD7F32' : 'var(--text-secondary)',
            }}>#{e.rank}</div>
            {e.photo_url ? (
              <img src={e.photo_url} alt="" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
            ) : (
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
                {(e.name || '?').charAt(0).toUpperCase()}
              </div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {e.name}
              </p>
              {e.age && (
                <p style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{e.age} · {e.gender || '—'}</p>
              )}
            </div>
            <p style={{ fontSize: 14, fontWeight: 800, color: 'var(--accent)' }}>{fmt(bm.unit, e.best_value)}</p>
          </div>
        ))
      )}
    </>
  );
}

function HistoryTab({ bm, attempts }) {
  if (!attempts.length) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>No attempts yet.</div>;
  }
  return attempts.map(a => (
    <div key={a.id} style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
      borderRadius: 12, marginBottom: 6, background: 'var(--bg-card)',
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 15, fontWeight: 800 }}>{fmt(bm.unit, a.value)}</p>
        <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
          {new Date(a.submitted_at).toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric' })}
        </p>
        {a.notes && <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>{a.notes}</p>}
        {a.review_note && <p style={{ fontSize: 11, color: 'var(--accent-orange)', marginTop: 4 }}>Coach: {a.review_note}</p>}
      </div>
      <StatusBadge status={a.status} />
    </div>
  ));
}

function StatusBadge({ status }) {
  const map = {
    verified:       { label: 'Verified',      bg: 'rgba(61,255,210,0.15)', color: '#3DFFD2' },
    pending_review: { label: 'Pending',       bg: 'rgba(255,149,0,0.15)',  color: '#FF9500' },
    self_reported:  { label: 'Self-reported', bg: 'rgba(142,142,147,0.15)', color: 'var(--text-tertiary)' },
    rejected:       { label: 'Rejected',      bg: 'rgba(220,38,38,0.15)', color: '#FF5E5E' },
  };
  const s = map[status] || map.self_reported;
  return (
    <span style={{
      display: 'inline-block', fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 8,
      background: s.bg, color: s.color, textTransform: 'uppercase', letterSpacing: 0.5,
      marginTop: 6,
    }}>{s.label}</span>
  );
}

function SubmitModal({ bm, token, onClose, onSaved }) {
  const [value, setValue] = useState('');
  const [notes, setNotes] = useState('');
  const [url,   setUrl]   = useState('');
  const [uploadedUrl, setUploadedUrl] = useState('');
  const [uploadPct, setUploadPct] = useState(null);
  const [mode, setMode] = useState('url'); // 'url' | 'upload'
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  const handleFile = async (file) => {
    if (!file) return;
    setErr(null);
    setUploadPct(0);
    try {
      const form = new FormData();
      form.append('file', file);
      // fetch doesn't expose upload progress natively — keep it simple with
      // XHR so we can show a progress bar for longer uploads.
      const xhr = new XMLHttpRequest();
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) setUploadPct(Math.round((e.loaded / e.total) * 100));
      };
      const done = new Promise((resolve, reject) => {
        xhr.onload = () => xhr.status >= 200 && xhr.status < 300
          ? resolve(JSON.parse(xhr.responseText))
          : reject(new Error(JSON.parse(xhr.responseText).error || 'Upload failed'));
        xhr.onerror = () => reject(new Error('Network error'));
      });
      xhr.open('POST', '/api/benchmarks/attempts/video');
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.send(form);
      const result = await done;
      setUploadedUrl(result.url);
    } catch (e) {
      setErr(e.message);
    }
    setUploadPct(null);
  };

  const save = async () => {
    setErr(null);
    setSaving(true);
    try {
      const evidenceUrl = mode === 'upload' ? uploadedUrl : url;
      const r = await fetch(`/api/benchmarks/${bm.slug}/attempts`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: Number(value), notes, video_url: evidenceUrl }),
      });
      if (!r.ok) throw new Error((await r.json()).error || 'Failed');
      onSaved();
    } catch (e) { setErr(e.message); }
    setSaving(false);
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200, display: 'flex', alignItems: 'flex-end' }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--bg-card)', borderRadius: '20px 20px 0 0',
        width: '100%', maxWidth: 480, margin: '0 auto', padding: '20px 20px 32px', maxHeight: '85vh', overflow: 'auto',
      }}>
        <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--divider)', margin: '0 auto 16px' }} />
        <h3 style={{ fontSize: 17, fontWeight: 800, marginBottom: 4 }}>Submit attempt</h3>
        <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 14 }}>
          {bm.name}
          {bm.requires_video && ' · evidence required for leaderboard'}
        </p>

        <Field label={`Value (${bm.unit})`}>
          <input type="number" step="any" value={value} onChange={e => setValue(e.target.value)}
                 style={inp} placeholder={bm.unit === 'seconds' ? 'Total seconds' : ''} />
        </Field>

        {bm.requires_video && (
          <>
            <div style={{ display: 'flex', gap: 4, background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: 4, marginBottom: 10 }}>
              {[['url','Paste link'],['upload','Upload video']].map(([k, l]) => (
                <button key={k} onClick={() => setMode(k)} style={{
                  flex: 1, padding: '8px 0', borderRadius: 8, border: 'none', cursor: 'pointer',
                  fontSize: 12, fontWeight: 700,
                  background: mode === k ? 'var(--accent)' : 'transparent',
                  color: mode === k ? '#fff' : 'var(--text-secondary)',
                }}>{l}</button>
              ))}
            </div>

            {mode === 'url' && (
              <Field label="Evidence URL (Strava / Garmin / video)">
                <input value={url} onChange={e => setUrl(e.target.value)} style={inp}
                       placeholder="https://..." />
              </Field>
            )}

            {mode === 'upload' && (
              <Field label="Upload video or photo from your phone">
                {uploadedUrl ? (
                  <div style={{
                    padding: '10px 12px', borderRadius: 10,
                    background: 'rgba(133,255,186,0.1)', border: '1px solid rgba(133,255,186,0.3)',
                    fontSize: 12, display: 'flex', alignItems: 'center', gap: 8,
                  }}>
                    <span style={{ color: 'var(--accent-mint)' }}>✓ Uploaded</span>
                    <button onClick={() => setUploadedUrl('')} style={{
                      marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--text-tertiary)',
                      fontSize: 11, cursor: 'pointer',
                    }}>Replace</button>
                  </div>
                ) : uploadPct != null ? (
                  <div style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.04)', fontSize: 12 }}>
                    Uploading... {uploadPct}%
                    <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.08)', marginTop: 6 }}>
                      <div style={{ height: '100%', width: `${uploadPct}%`, background: 'var(--accent-mint)', borderRadius: 2 }} />
                    </div>
                  </div>
                ) : (
                  <label style={{
                    display: 'block', padding: '14px 12px', borderRadius: 10, cursor: 'pointer',
                    border: '1.5px dashed var(--accent)', textAlign: 'center',
                    color: 'var(--accent)', fontSize: 13, fontWeight: 700,
                  }}>
                    Tap to upload
                    <input
                      type="file"
                      accept="video/*,image/*"
                      capture="environment"
                      onChange={(e) => handleFile(e.target.files?.[0])}
                      style={{ display: 'none' }}
                    />
                  </label>
                )}
                <p style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 6, lineHeight: 1.5 }}>
                  Max 50MB. Uploaded files are auto-deleted 7 days after submission once the coach has reviewed.
                </p>
              </Field>
            )}
          </>
        )}

        <Field label="Notes (optional)">
          <input value={notes} onChange={e => setNotes(e.target.value)} style={inp} placeholder="bodyweight, conditions..." />
        </Field>

        {err && <p style={{ color: '#FF5E5E', fontSize: 12, marginBottom: 8 }}>{err}</p>}

        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button onClick={onClose} disabled={saving} style={cancelBtn}>Cancel</button>
          <button onClick={save} disabled={saving || !value} style={{ ...saveBtn, opacity: (!value || saving) ? 0.5 : 1 }}>
            {saving ? 'Submitting...' : 'Submit'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4, display: 'block' }}>{label}</label>
      {children}
    </div>
  );
}

function FilterChip({ active, label, onClick }) {
  return (
    <button onClick={onClick} style={{
      padding: '5px 12px', borderRadius: 14, border: 'none', cursor: 'pointer', flexShrink: 0,
      background: active ? 'var(--accent)' : 'rgba(255,255,255,0.06)',
      color: active ? '#fff' : 'var(--text-secondary)',
      fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
    }}>{label}</button>
  );
}

const backBtn = {
  width: 36, height: 36, borderRadius: '50%', background: 'var(--bg-card)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  border: 'none', cursor: 'pointer', color: 'var(--text-primary)', flexShrink: 0,
};
const inp = {
  width: '100%', padding: '10px 12px', borderRadius: 10,
  border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(0,0,0,0.25)',
  color: 'var(--text-primary)', fontSize: 14,
};
const cancelBtn = {
  padding: '12px 18px', borderRadius: 10, border: 'none', cursor: 'pointer',
  background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 700,
};
const saveBtn = {
  flex: 1, padding: '12px 18px', borderRadius: 10, border: 'none', cursor: 'pointer',
  background: 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 800,
};
const filterRowStyle = {
  display: 'flex', gap: 6, marginBottom: 10, overflowX: 'auto', paddingBottom: 4,
};
