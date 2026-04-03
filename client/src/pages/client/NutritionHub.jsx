import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import FoodDiary from './FoodDiary';
import MealPlanView from './MealPlanView';
import SupplementPlan from './SupplementPlan';
import RecipeBrowser from './RecipeBrowser';

const subTabs = ['Food Diary', 'Meal Plan', 'Supplements'];

export default function NutritionHub({ onBack }) {
  const [activeTab, setActiveTab] = useState('Food Diary');
  const [showRecipes, setShowRecipes] = useState(false);

  if (showRecipes) return <RecipeBrowser onBack={() => setShowRecipes(false)} />;

  return (
    <div style={{ paddingBottom: 40 }}>
      {activeTab === 'Food Diary' && <FoodDiary />}
      {activeTab === 'Meal Plan' && <MealPlanView />}
      {activeTab === 'Supplements' && <SupplementPlan />}

      {/* Sub-tabs */}
      <div style={{
        position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)',
        display: 'flex', gap: 0, background: 'var(--bg-card)', borderRadius: 50,
        padding: 4, maxWidth: 400, width: 'calc(100% - 32px)', alignItems: 'center',
      }}>
        {subTabs.map((tab) => (
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
        <button
          onClick={() => setShowRecipes(true)}
          style={{
            padding: '10px 14px', borderRadius: 50, background: 'transparent', border: 'none',
            color: 'var(--accent)', fontSize: 16,
          }}
        >
          👨‍🍳
        </button>
      </div>
    </div>
  );
}
