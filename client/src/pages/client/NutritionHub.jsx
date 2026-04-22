import { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import FoodDiary from './FoodDiary';
import MealPlanView from './MealPlanView';
import SupplementPlan from './SupplementPlan';
import RecipeBrowser from './RecipeBrowser';

const subTabs = ['Food Diary', 'Meal Plan', 'Recipes', 'Supplements'];

export default function NutritionHub({ onBack }) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const initialTab = subTabs.includes(searchParams.get('tab')) ? searchParams.get('tab') : 'Food Diary';
  const [activeTab, setActiveTab] = useState(initialTab);

  return (
    <div style={{ paddingBottom: 40 }}>
      {/* Top bar with back arrow */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '16px 16px 8px',
      }}>
        <button
          onClick={() => navigate('/home')}
          aria-label="Back to home"
          style={{
            width: 36, height: 36, borderRadius: '50%', background: 'var(--bg-card)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: 'none', cursor: 'pointer',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-primary)" strokeWidth="2.5">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <h1 style={{ fontSize: 18, fontWeight: 800, letterSpacing: -0.3 }}>
          Nutrition
        </h1>
      </div>

      {activeTab === 'Food Diary' && <FoodDiary />}
      {activeTab === 'Meal Plan' && <MealPlanView />}
      {activeTab === 'Recipes' && <RecipeBrowser />}
      {activeTab === 'Supplements' && <SupplementPlan />}

      {/* Sub-tabs — hidden on Supplements so the Add/Edit flow has the full screen. */}
      {activeTab !== 'Supplements' && (
        <div style={{
          position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)',
          display: 'flex', gap: 0, background: 'var(--bg-card)', borderRadius: 50,
          padding: 4, maxWidth: 420, width: 'calc(100% - 32px)', alignItems: 'center',
        }}>
          {subTabs.filter(t => t !== 'Supplements').map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                flex: 1, padding: '10px 0', borderRadius: 50, fontSize: 12, fontWeight: 600,
                background: activeTab === tab ? 'rgba(61,255,210,0.15)' : 'transparent',
                color: activeTab === tab ? 'var(--accent-mint)' : 'var(--text-secondary)',
                border: 'none', whiteSpace: 'nowrap',
              }}
            >
              {tab}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
