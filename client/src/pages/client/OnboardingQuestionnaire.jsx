import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { allocateProgram } from '../../lib/programAllocator';

// Anonymous onboarding questionnaire. Fires before account creation so the
// user has something tangible (a matched program) to sign up for, rather
// than creating an account first and then being asked a bunch of questions.
//
// Answers are persisted to localStorage after every step so a bailout +
// return picks up where they left off. When the user taps "Continue to
// create account" the /register page reads the answers back out and sends
// them with the signup POST.

const STORAGE_KEY = 'am_onboarding_answers';

// ── Questions ───────────────────────────────────────────────────────────
// Structure:
//   id        - key on the answers object
//   title     - shown to user
//   subtitle  - optional small copy
//   type      - 'age' | 'single' | 'multi'
//   options   - array of { value, label, hint? }
//   optional  - true for q7 (can proceed with no selections)

const QUESTIONS = [
  {
    id: 'age',
    title: "What's your age?",
    subtitle: 'Helps us set the right pace and intensity for you.',
    type: 'age',
  },
  {
    id: 'goal',
    title: "What's your primary goal?",
    subtitle: 'Pick what matters most right now - you can shift focus anytime.',
    type: 'single',
    options: [
      { value: 'move_pain_free', label: 'Move without pain or restriction' },
      { value: 'mobility',        label: 'Get more flexible and mobile' },
      { value: 'strength',        label: 'Build strength and muscle' },
      { value: 'sport',           label: 'Improve at my sport' },
      { value: 'active_healthy',  label: 'Stay active and healthy as I age' },
    ],
  },
  {
    id: 'sport',
    title: 'Do you play a sport?',
    subtitle: 'So we can fit your plan around it.',
    type: 'single',
    options: [
      { value: 'none',       label: 'No sport right now' },
      { value: 'pickleball', label: 'Pickleball' },
      { value: 'tennis',     label: 'Tennis' },
      { value: 'golf',       label: 'Golf' },
      { value: 'running',    label: 'Running' },
      { value: 'other',      label: 'Other' },
    ],
  },
  {
    id: 'experience',
    title: "What's your training experience?",
    type: 'single',
    options: [
      { value: 'just_starting', label: 'Just starting out',     hint: 'New to training, or returning after 6+ months off' },
      { value: 'occasional',    label: 'Occasionally active',   hint: 'Walks, classes, or 0–1 structured workouts a week' },
      { value: 'consistent',    label: 'Training consistently', hint: '2–3 structured sessions a week, comfortable with basics' },
      { value: 'advanced',      label: 'Advanced / athletic',   hint: '4+ sessions a week, or a competitive athlete' },
    ],
  },
  {
    id: 'equipment',
    title: 'Where do you train?',
    type: 'single',
    options: [
      { value: 'home_bodyweight', label: 'Home - bodyweight only' },
      { value: 'home_basics',     label: 'Home - bands, mat, maybe dumbbells' },
      { value: 'home_gym',        label: 'Home gym (barbell, rack, etc.)' },
      { value: 'full_gym',        label: 'Full commercial gym' },
    ],
  },
  {
    id: 'days',
    title: 'How many days a week can you train?',
    type: 'single',
    options: [
      { value: 2, label: '2 days' },
      { value: 3, label: '3 days' },
      { value: 4, label: '4+ days' },
    ],
  },
  {
    id: 'injuries',
    title: 'Any injuries or areas we should know about?',
    subtitle: 'Select any that apply. Your coach will adapt the plan.',
    type: 'multi',
    optional: true,
    options: [
      { value: 'none',     label: 'None - good to go' },
      { value: 'knee',     label: 'Knee' },
      { value: 'back',     label: 'Back' },
      { value: 'shoulder', label: 'Shoulder' },
      { value: 'hip',      label: 'Hip' },
      { value: 'neck',     label: 'Neck' },
      { value: 'wrist',    label: 'Wrist' },
    ],
  },
];

function loadSaved() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function persist(answers) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(answers)); } catch {}
}

export default function OnboardingQuestionnaire() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState(loadSaved);
  const [showSuggestion, setShowSuggestion] = useState(false);

  useEffect(() => { persist(answers); }, [answers]);

  const q = QUESTIONS[step];
  const isLast = step === QUESTIONS.length - 1;
  const progress = ((step + 1) / QUESTIONS.length) * 100;

  const canAdvance = () => {
    if (q.optional) return true;
    const a = answers[q.id];
    if (q.type === 'age') return typeof a === 'number' && a >= 18 && a <= 110;
    if (q.type === 'single') return a !== undefined && a !== null;
    if (q.type === 'multi') return Array.isArray(a) && a.length > 0;
    return false;
  };

  const setAnswer = (value) => setAnswers(prev => ({ ...prev, [q.id]: value }));

  const toggleMulti = (value) => {
    setAnswers(prev => {
      const prior = Array.isArray(prev[q.id]) ? prev[q.id] : [];
      // "None" is mutually exclusive with everything else
      if (value === 'none') return { ...prev, [q.id]: ['none'] };
      const without = prior.filter(v => v !== 'none');
      const has = without.includes(value);
      return { ...prev, [q.id]: has ? without.filter(v => v !== value) : [...without, value] };
    });
  };

  const next = () => {
    if (isLast) setShowSuggestion(true);
    else setStep(s => s + 1);
  };

  const back = () => {
    if (showSuggestion) setShowSuggestion(false);
    else if (step > 0) setStep(s => s - 1);
    else navigate('/welcome');
  };

  if (showSuggestion) {
    return <SuggestionScreen answers={answers} onBack={back} onContinue={() => navigate('/register')} />;
  }

  return (
    <div style={page}>
      <div style={inner}>
        <ProgressBar value={progress} />

        <div style={header}>
          <button onClick={back} style={backBtn}>← Back</button>
          <span style={stepLabel}>Step {step + 1} of {QUESTIONS.length}</span>
          <button onClick={() => navigate('/login')} style={signInLinkBtn}>Sign In</button>
        </div>

        <div style={body}>
          <h1 style={titleStyle}>{q.title}</h1>
          {q.subtitle && <p style={subtitleStyle}>{q.subtitle}</p>}

          <div style={{ marginTop: 24 }}>
            {q.type === 'age' && (
              <AgeInput value={answers.age} onChange={v => setAnswer(v)} />
            )}

            {q.type === 'single' && (
              <div style={optionsList}>
                {q.options.map(opt => {
                  const selected = answers[q.id] === opt.value;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => setAnswer(opt.value)}
                      style={{ ...optionBtn, ...(selected ? optionBtnSelected : {}) }}
                    >
                      <div style={optionLabel}>{opt.label}</div>
                      {opt.hint && <div style={optionHint}>{opt.hint}</div>}
                    </button>
                  );
                })}
              </div>
            )}

            {q.type === 'multi' && (
              <div style={optionsList}>
                {q.options.map(opt => {
                  const selected = Array.isArray(answers[q.id]) && answers[q.id].includes(opt.value);
                  return (
                    <button
                      key={opt.value}
                      onClick={() => toggleMulti(opt.value)}
                      style={{ ...optionBtn, ...(selected ? optionBtnSelected : {}) }}
                    >
                      <div style={optionLabel}>
                        <span style={checkboxBox}>{selected ? '✓' : ''}</span>
                        {opt.label}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div style={footer}>
          <button
            onClick={next}
            disabled={!canAdvance()}
            style={{ ...ctaBtn, opacity: canAdvance() ? 1 : 0.35 }}
          >
            {isLast ? 'See my plan' : 'Continue'} →
          </button>
        </div>
      </div>
    </div>
  );
}

function ProgressBar({ value }) {
  return (
    <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden', marginBottom: 28 }}>
      <div style={{ height: '100%', width: `${value}%`, background: 'var(--accent)', transition: 'width 0.25s' }} />
    </div>
  );
}

function AgeInput({ value, onChange }) {
  const [local, setLocal] = useState(value ?? '');
  useEffect(() => { setLocal(value ?? ''); }, [value]);
  return (
    <div style={{ marginTop: 12 }}>
      <input
        type="number"
        min={18}
        max={110}
        inputMode="numeric"
        placeholder="35"
        value={local}
        onChange={e => {
          const raw = e.target.value;
          setLocal(raw);
          const n = parseInt(raw, 10);
          onChange(Number.isFinite(n) ? n : undefined);
        }}
        style={ageField}
      />
      <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', textAlign: 'center', marginTop: 8 }}>
        years old
      </p>
    </div>
  );
}

function SuggestionScreen({ answers, onBack, onContinue }) {
  const result = allocateProgram(answers);

  return (
    <div style={page}>
      <div style={inner}>
        <div style={header}>
          <button onClick={onBack} style={backBtn}>← Back</button>
        </div>

        <div style={{ ...body, textAlign: 'center' }}>
          <div style={{ fontSize: 12, letterSpacing: 3, color: 'var(--accent)', fontWeight: 800, marginBottom: 8 }}>
            YOUR PLAN
          </div>

          {result.needs_review ? (
            <>
              <h1 style={titleStyle}>We'll match you personally.</h1>
              <p style={{ ...subtitleStyle, marginTop: 14 }}>{result.reason}</p>
              <div style={reviewCard}>
                <div style={{ fontSize: 26, marginBottom: 6 }}>👋</div>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>Coach review within 24 hours</div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', lineHeight: 1.5 }}>
                  Your answers go straight to Dan or Joonas. They'll review and set you up with the right plan - you'll get a notification when it's ready.
                </div>
              </div>
            </>
          ) : (
            <>
              <h1 style={titleStyle}>We'd suggest</h1>
              <div style={programCard}>
                <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 10 }}>{result.title}</div>
                <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.8)', lineHeight: 1.5, margin: 0 }}>
                  {result.reason}
                </p>
              </div>
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', marginTop: 18, lineHeight: 1.5 }}>
                Not quite right? Your coach can change your program at any time.
              </p>
            </>
          )}
        </div>

        <div style={footer}>
          <button onClick={onContinue} style={ctaBtn}>
            Try the app free →
          </button>
        </div>
      </div>
    </div>
  );
}

// ── styles ──────────────────────────────────────────────────────────────

const page = {
  minHeight: '100vh',
  background: 'radial-gradient(ellipse at top, #132235 0%, #0A1428 55%, #060D1A 100%)',
  color: '#fff',
  padding: '24px 22px 28px',
  display: 'flex',
  justifyContent: 'center',
};

const inner = {
  width: '100%',
  maxWidth: 440,
  display: 'flex',
  flexDirection: 'column',
  minHeight: 'calc(100vh - 52px)',
};

const header = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: 22,
};

const backBtn = {
  padding: '6px 12px',
  borderRadius: 10,
  background: 'rgba(255,255,255,0.06)',
  color: 'rgba(255,255,255,0.85)',
  border: 'none',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
};

const stepLabel = {
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: 1.2,
  color: 'rgba(255,255,255,0.55)',
};

const signInLinkBtn = {
  padding: '6px 12px',
  borderRadius: 10,
  background: 'transparent',
  color: '#85FFBA',
  border: 'none',
  fontSize: 13,
  fontWeight: 700,
  cursor: 'pointer',
};

const body = { flex: 1 };

const titleStyle = {
  fontSize: 24,
  fontWeight: 800,
  color: '#fff',
  margin: 0,
  lineHeight: 1.2,
};

const subtitleStyle = {
  fontSize: 14,
  color: 'rgba(255,255,255,0.6)',
  margin: '10px 0 0',
  lineHeight: 1.45,
};

const optionsList = {
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
};

const optionBtn = {
  width: '100%',
  textAlign: 'left',
  padding: '16px 18px',
  borderRadius: 12,
  background: 'rgba(255,255,255,0.04)',
  border: '1.5px solid rgba(255,255,255,0.08)',
  color: 'rgba(255,255,255,0.85)',
  cursor: 'pointer',
  transition: 'all 0.15s',
};

const optionBtnSelected = {
  background: 'rgba(255,140,0,0.12)',
  borderColor: 'var(--accent)',
  color: '#fff',
};

const optionLabel = {
  fontSize: 15,
  fontWeight: 600,
  display: 'flex',
  alignItems: 'center',
  gap: 10,
};

const optionHint = {
  fontSize: 12,
  color: 'rgba(255,255,255,0.55)',
  marginTop: 4,
  lineHeight: 1.4,
};

const checkboxBox = {
  display: 'inline-flex',
  width: 20,
  height: 20,
  borderRadius: 5,
  border: '1.5px solid rgba(255,255,255,0.3)',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 11,
  fontWeight: 800,
  color: 'var(--accent)',
  flexShrink: 0,
};

const ageField = {
  width: '100%',
  padding: '22px 16px',
  fontSize: 38,
  fontWeight: 800,
  textAlign: 'center',
  background: 'rgba(255,255,255,0.05)',
  border: '1.5px solid rgba(255,255,255,0.12)',
  borderRadius: 14,
  color: '#fff',
  outline: 'none',
};

const footer = {
  marginTop: 20,
  paddingTop: 12,
};

const ctaBtn = {
  width: '100%',
  padding: '15px 24px',
  borderRadius: 12,
  background: 'var(--accent)',
  color: '#fff',
  fontSize: 15,
  fontWeight: 800,
  letterSpacing: 0.5,
  border: 'none',
  cursor: 'pointer',
  boxShadow: '0 8px 22px rgba(255,140,0,0.28)',
};

const programCard = {
  marginTop: 22,
  padding: '22px 20px',
  borderRadius: 14,
  background: 'linear-gradient(135deg, rgba(255,140,0,0.12) 0%, rgba(255,140,0,0.04) 100%)',
  border: '1.5px solid rgba(255,140,0,0.4)',
  textAlign: 'left',
};

const reviewCard = {
  marginTop: 22,
  padding: '22px 20px',
  borderRadius: 14,
  background: 'rgba(133,255,186,0.08)',
  border: '1.5px solid rgba(133,255,186,0.35)',
  textAlign: 'center',
};
