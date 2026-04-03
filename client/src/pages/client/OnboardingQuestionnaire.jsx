import { useState } from 'react';

const questions = [
  {
    id: 'goal',
    title: 'What is your primary goal?',
    type: 'select',
    options: ['Improve mobility & flexibility', 'Reduce pain & discomfort', 'Build strength', 'Lose weight', 'General fitness & longevity', 'Recover from injury', 'Improve athletic performance'],
  },
  {
    id: 'experience',
    title: 'What is your training experience?',
    type: 'select',
    options: ['Complete beginner', 'Some experience (< 1 year)', 'Intermediate (1-3 years)', 'Advanced (3+ years)', 'Former athlete returning to training'],
  },
  {
    id: 'injuries',
    title: 'Do you have any injuries or pain?',
    type: 'text',
    placeholder: 'Describe any current injuries, chronic pain, or areas of concern. Write "None" if not applicable.',
  },
  {
    id: 'schedule',
    title: 'How many days per week can you train?',
    type: 'select',
    options: ['2-3 days', '4-5 days', '6-7 days'],
  },
  {
    id: 'equipment',
    title: 'What equipment do you have access to?',
    type: 'multiselect',
    options: ['Full gym', 'Home gym (dumbbells, bands)', 'Minimal (bodyweight only)', 'Yoga mat & foam roller', 'Resistance bands', 'Kettlebells', 'TRX / Suspension trainer'],
  },
  {
    id: 'dietary',
    title: 'Any dietary preferences or restrictions?',
    type: 'text',
    placeholder: 'E.g., vegetarian, carnivore, lactose intolerant, no allergies...',
  },
  {
    id: 'sleep',
    title: 'How would you describe your sleep?',
    type: 'select',
    options: ['Great (7-9 hours, restful)', 'OK (6-7 hours, sometimes restless)', 'Poor (< 6 hours or very broken)', 'Variable (shift work or inconsistent)'],
  },
  {
    id: 'anything_else',
    title: 'Anything else your coach should know?',
    type: 'text',
    placeholder: 'Previous programs, motivation, time constraints, or anything you want to share...',
  },
];

export default function OnboardingQuestionnaire({ onComplete }) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({});

  const q = questions[step];
  const progress = ((step + 1) / questions.length) * 100;
  const isLast = step === questions.length - 1;
  const canProceed = q.type === 'text' || answers[q.id];

  const handleSelect = (option) => {
    if (q.type === 'multiselect') {
      const current = answers[q.id] || [];
      const updated = current.includes(option)
        ? current.filter(o => o !== option)
        : [...current, option];
      setAnswers({ ...answers, [q.id]: updated });
    } else {
      setAnswers({ ...answers, [q.id]: option });
    }
  };

  const handleNext = () => {
    if (isLast) {
      onComplete(answers);
    } else {
      setStep(step + 1);
    }
  };

  return (
    <div className="page-content" style={{ paddingBottom: 120 }}>
      {/* Progress bar */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            Question {step + 1} of {questions.length}
          </p>
          {step > 0 && (
            <button
              onClick={() => setStep(step - 1)}
              style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 13, fontWeight: 600 }}
            >
              Back
            </button>
          )}
        </div>
        <div style={{ height: 4, background: 'var(--divider)', borderRadius: 2 }}>
          <div style={{
            height: '100%', width: `${progress}%`, background: 'var(--accent)',
            borderRadius: 2, transition: 'width 0.3s ease',
          }} />
        </div>
      </div>

      {/* Question */}
      <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 24, lineHeight: 1.3 }}>
        {q.title}
      </h2>

      {/* Options */}
      {(q.type === 'select' || q.type === 'multiselect') && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {q.options.map((option) => {
            const isSelected = q.type === 'multiselect'
              ? (answers[q.id] || []).includes(option)
              : answers[q.id] === option;
            return (
              <button
                key={option}
                onClick={() => handleSelect(option)}
                style={{
                  background: isSelected ? 'rgba(61,255,210,0.12)' : 'var(--bg-card)',
                  border: isSelected ? '2px solid var(--accent-mint)' : '2px solid var(--divider)',
                  borderRadius: 14, padding: '14px 16px', textAlign: 'left',
                  color: 'var(--text-primary)', fontSize: 15, fontWeight: 500,
                  display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                <div style={{
                  width: 22, height: 22, borderRadius: q.type === 'multiselect' ? 6 : '50%', flexShrink: 0,
                  border: isSelected ? 'none' : '2px solid var(--text-tertiary)',
                  background: isSelected ? 'var(--accent-mint)' : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {isSelected && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                  )}
                </div>
                {option}
              </button>
            );
          })}
        </div>
      )}

      {/* Text input */}
      {q.type === 'text' && (
        <textarea
          value={answers[q.id] || ''}
          onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
          placeholder={q.placeholder}
          className="input-field"
          style={{ minHeight: 120, resize: 'vertical', fontSize: 15, lineHeight: 1.5 }}
        />
      )}

      {/* Next / Complete button */}
      <div style={{
        position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)',
        maxWidth: 480, width: 'calc(100% - 32px)', padding: '12px 0',
        background: 'linear-gradient(to top, var(--bg-primary) 70%, transparent)',
      }}>
        <button
          className="btn-primary"
          onClick={handleNext}
          disabled={!canProceed && q.type !== 'text'}
          style={{ fontSize: 16 }}
        >
          {isLast ? 'Complete Setup' : 'Continue'}
        </button>
        {q.type === 'text' && (
          <button
            onClick={handleNext}
            style={{
              background: 'none', border: 'none', color: 'var(--text-secondary)',
              fontSize: 14, width: '100%', marginTop: 8, padding: 8,
            }}
          >
            Skip this question
          </button>
        )}
      </div>
    </div>
  );
}
