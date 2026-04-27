import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { allocateProgram } from '../../lib/programAllocator';
import {
  ACTIVITY_LEVELS,
  EATING_STYLES,
  SEX_OPTIONS,
  cmToFtIn,
  ftInToCm,
  kgToLbs,
  lbsToKg,
  calculateTargets,
} from '../../lib/nutritionTargets';

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
//   type      - 'age' | 'single' | 'multi' | 'body_metrics'
//   options   - array of { value, label, hint? }
//   optional  - true for questions that can proceed with no selections

const QUESTIONS = [
  {
    id: 'age',
    title: "What's your age?",
    subtitle: 'Helps us set the right pace and intensity for you.',
    type: 'age',
  },
  {
    id: 'sex',
    title: "What's your biological sex?",
    subtitle: 'Used to calculate your daily calorie needs (Mifflin-St Jeor formula). Gender identity isn\'t used for the math, only biology.',
    type: 'single',
    options: SEX_OPTIONS.map(o => ({ value: o.value, label: o.label })),
  },
  {
    id: 'body_metrics',
    title: 'Your height and weight',
    subtitle: 'So we can set realistic calorie and macro targets.',
    type: 'body_metrics',
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
    id: 'activity_level',
    title: 'Outside of training, how active are you day-to-day?',
    subtitle: 'Job, walking, chores. Your training already gets counted separately.',
    type: 'single',
    options: ACTIVITY_LEVELS.map(a => ({ value: a.value, label: a.label, hint: a.hint })),
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
  {
    id: 'eating_style',
    title: 'Which eating style fits you best?',
    subtitle: 'Sets your starting macro split. Your coach can fine-tune later.',
    type: 'single',
    options: EATING_STYLES.map(s => ({ value: s.value, label: s.label, hint: s.hint })),
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
    if (q.type === 'body_metrics') {
      return typeof answers.height_cm === 'number' && answers.height_cm > 100 && answers.height_cm < 230
        && typeof answers.weight_kg === 'number' && answers.weight_kg > 30  && answers.weight_kg < 250;
    }
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

            {q.type === 'body_metrics' && (
              <BodyMetricsInput
                heightCm={answers.height_cm}
                weightKg={answers.weight_kg}
                onChange={(field, v) => setAnswers(prev => ({ ...prev, [field]: v }))}
              />
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

function BodyMetricsInput({ heightCm, weightKg, onChange }) {
  // Stored values in answers stay metric (cm + kg). The toggle only flips
  // what the user types — we convert on the fly. Default is metric since
  // Dan is Australia-based; clients can flip to imperial per session.
  const [heightUnit, setHeightUnit] = useState('cm');
  const [weightUnit, setWeightUnit] = useState('kg');

  const ftIn = cmToFtIn(heightCm);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Height */}
      <div>
        <div style={metricRow}>
          <label style={metricLabel}>Height</label>
          <UnitToggle
            options={['cm', 'ft/in']}
            value={heightUnit}
            onChange={setHeightUnit}
          />
        </div>
        {heightUnit === 'cm' ? (
          <input
            type="number"
            min={100}
            max={230}
            inputMode="numeric"
            placeholder="175"
            value={heightCm ?? ''}
            onChange={e => {
              const n = parseInt(e.target.value, 10);
              onChange('height_cm', Number.isFinite(n) ? n : undefined);
            }}
            style={metricField}
          />
        ) : (
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="number"
              min={3}
              max={7}
              inputMode="numeric"
              placeholder="5 ft"
              value={ftIn.ft ?? ''}
              onChange={e => {
                const f = parseInt(e.target.value, 10);
                if (!Number.isFinite(f)) return;
                onChange('height_cm', ftInToCm(f, ftIn.in || 0));
              }}
              style={{ ...metricField, flex: 1 }}
            />
            <input
              type="number"
              min={0}
              max={11}
              inputMode="numeric"
              placeholder="9 in"
              value={ftIn.in ?? ''}
              onChange={e => {
                const i = parseInt(e.target.value, 10);
                if (!Number.isFinite(i)) return;
                onChange('height_cm', ftInToCm(ftIn.ft || 0, i));
              }}
              style={{ ...metricField, flex: 1 }}
            />
          </div>
        )}
      </div>

      {/* Weight */}
      <div>
        <div style={metricRow}>
          <label style={metricLabel}>Weight</label>
          <UnitToggle
            options={['kg', 'lbs']}
            value={weightUnit}
            onChange={setWeightUnit}
          />
        </div>
        <input
          type="number"
          min={30}
          max={250}
          step={0.1}
          inputMode="decimal"
          placeholder={weightUnit === 'kg' ? '70' : '155'}
          value={
            weightUnit === 'kg'
              ? (weightKg ?? '')
              : (weightKg != null ? kgToLbs(weightKg) : '')
          }
          onChange={e => {
            const n = parseFloat(e.target.value);
            if (!Number.isFinite(n)) { onChange('weight_kg', undefined); return; }
            onChange('weight_kg', weightUnit === 'kg' ? n : lbsToKg(n));
          }}
          style={metricField}
        />
      </div>
    </div>
  );
}

function UnitToggle({ options, value, onChange }) {
  return (
    <div style={{ display: 'inline-flex', background: 'rgba(255,255,255,0.06)', borderRadius: 8, padding: 2 }}>
      {options.map(opt => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          style={{
            padding: '4px 10px',
            fontSize: 11,
            fontWeight: 700,
            borderRadius: 6,
            border: 'none',
            cursor: 'pointer',
            background: value === opt ? 'var(--accent)' : 'transparent',
            color: value === opt ? '#fff' : 'rgba(255,255,255,0.6)',
          }}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

function SuggestionScreen({ answers, onBack, onContinue }) {
  const result = allocateProgram(answers);
  const targets = calculateTargets(answers);

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

          {/* Nutrition target preview — only when we have enough data */}
          {targets.calorie_target && (
            <div style={nutritionCard}>
              <div style={{ fontSize: 11, letterSpacing: 2, color: 'rgba(133,255,186,0.85)', fontWeight: 800, marginBottom: 8 }}>
                YOUR DAILY TARGETS
              </div>
              <div style={{ fontSize: 32, fontWeight: 900, color: '#fff', lineHeight: 1 }}>
                {targets.calorie_target.toLocaleString()} <span style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.6)' }}>kcal</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: 14, gap: 8 }}>
                <MacroPill label="Protein" grams={targets.protein_target} color="#FF6B9D" />
                <MacroPill label="Fat"     grams={targets.fat_target}     color="#FFD166" />
                <MacroPill label="Carbs"   grams={targets.carbs_target}   color="#85FFBA" />
              </div>
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 12, lineHeight: 1.5 }}>
                {targets.style.label} split · BMR {targets.bmr} kcal · You can fine-tune in your profile.
              </p>
            </div>
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

function MacroPill({ label, grams, color }) {
  return (
    <div style={{ flex: 1, textAlign: 'center' }}>
      <div style={{ fontSize: 18, fontWeight: 800, color }}>{grams}g</div>
      <div style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: 1 }}>{label}</div>
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

const nutritionCard = {
  marginTop: 18,
  padding: '20px 18px',
  borderRadius: 14,
  background: 'rgba(133,255,186,0.06)',
  border: '1.5px solid rgba(133,255,186,0.22)',
  textAlign: 'center',
};

const metricRow = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: 8,
};

const metricLabel = {
  fontSize: 13,
  fontWeight: 700,
  color: 'rgba(255,255,255,0.85)',
};

const metricField = {
  width: '100%',
  padding: '16px 14px',
  fontSize: 22,
  fontWeight: 700,
  textAlign: 'center',
  background: 'rgba(255,255,255,0.05)',
  border: '1.5px solid rgba(255,255,255,0.12)',
  borderRadius: 12,
  color: '#fff',
  outline: 'none',
};
