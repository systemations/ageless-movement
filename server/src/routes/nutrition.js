import { Router } from 'express';
import pool from '../db/pool.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

// Get food diary for a date
router.get('/diary', authenticateToken, async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().split('T')[0];
    const userId = req.user.id;

    const profile = pool.query('SELECT * FROM client_profiles WHERE user_id = ?', [userId]);
    const p = profile.rows[0] || {};

    const logs = pool.query(
      'SELECT * FROM nutrition_logs WHERE user_id = ? AND date = ? ORDER BY id',
      [userId, date]
    );

    // Group by meal_type
    const mealOrder = ['Early Morning', 'Breakfast', 'Mid-morning', 'Lunch', 'Afternoon', 'Dinner', 'Evening Snack'];
    const meals = {};
    mealOrder.forEach(m => { meals[m] = { items: [], calories: 0 }; });

    logs.rows.forEach(log => {
      if (!meals[log.meal_type]) meals[log.meal_type] = { items: [], calories: 0 };
      meals[log.meal_type].items.push(log);
      meals[log.meal_type].calories += log.calories;
    });

    const totals = logs.rows.reduce((acc, l) => ({
      calories: acc.calories + l.calories,
      protein: acc.protein + l.protein,
      fat: acc.fat + l.fat,
      carbs: acc.carbs + l.carbs,
    }), { calories: 0, protein: 0, fat: 0, carbs: 0 });

    res.json({
      date,
      meals,
      totals,
      targets: {
        calories: p.calorie_target || 2200,
        protein: p.protein_target || 163,
        fat: p.fat_target || 167,
        carbs: p.carbs_target || 10,
      },
    });
  } catch (err) {
    console.error('Diary error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Add food to diary
router.post('/diary', authenticateToken, async (req, res) => {
  try {
    const { date, meal_type, food_name, calories, protein, fat, carbs, serving_size } = req.body;
    const d = date || new Date().toISOString().split('T')[0];

    pool.query(
      'INSERT INTO nutrition_logs (user_id, date, meal_type, food_name, calories, protein, fat, carbs, serving_size) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [req.user.id, d, meal_type, food_name, calories || 0, protein || 0, fat || 0, carbs || 0, serving_size || '']
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Add food error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete food from diary
router.delete('/diary/:id', authenticateToken, async (req, res) => {
  try {
    pool.query('DELETE FROM nutrition_logs WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Get meal plans
router.get('/meal-plans', authenticateToken, async (req, res) => {
  // Static meal plan data for now
  res.json({
    plans: [
      {
        id: 1,
        title: '5-Ingredient Recipe Pack Meal Plan 1',
        duration: '7 days',
        calRange: '969 - 1,216 cals / day',
        description: 'Discover the collection of simple 5-ingredient recipes, including breakfast, lunch, dinner, treats and smoothie options.',
        days: [
          { day: 1, label: 'Monday', calories: 990, meals: [
            { meal: 'Breakfast', name: 'Mushroom & Brie Omelet', serving: '1 serving', calories: 359 },
            { meal: 'Lunch', name: 'Spicy Tuna', serving: '1 serving', calories: 108 },
            { meal: 'Evening Snack', name: 'Purple Power Smoothie', serving: '1 serving', calories: 322 },
            { meal: 'Dinner', name: 'Almond & Cranberry Energy Balls', serving: '3 balls', calories: 201 },
          ]},
          { day: 2, label: 'Tuesday', calories: 998, meals: [
            { meal: 'Breakfast', name: 'Green Pea & Goat Cheese Frittata', serving: '1 serving', calories: 295 },
            { meal: 'Lunch', name: 'Shakshuka', serving: '1 serving', calories: 308 },
            { meal: 'Dinner', name: 'Lemon Herb Chicken', serving: '1 serving', calories: 395 },
          ]},
          { day: 3, label: 'Wednesday', calories: 1134, meals: [
            { meal: 'Breakfast', name: 'Avocado Baked Eggs', serving: '1 half', calories: 214 },
            { meal: 'Lunch', name: 'Broccoli & Ginger Soup', serving: '1 bowl', calories: 189 },
            { meal: 'Dinner', name: 'Beef Stir Fry', serving: '1 serving', calories: 450 },
            { meal: 'Evening Snack', name: 'Almond & Peach Cake', serving: '1 slice', calories: 199 },
          ]},
          { day: 4, label: 'Thursday', calories: 1088 },
          { day: 5, label: 'Friday', calories: 1216 },
          { day: 6, label: 'Saturday', calories: 969 },
          { day: 7, label: 'Sunday', calories: 1202 },
        ],
      },
    ],
  });
});

// Get recipes
router.get('/recipes', authenticateToken, async (req, res) => {
  res.json({
    categories: [
      {
        title: '5 Ingredient Recipes',
        recipes: [
          { id: 1, name: 'Mushroom & Brie Omelet', calories: 359, prepTime: '20 mins', protein: 25, fat: 27, carbs: 4, servings: 4,
            ingredients: ['1 cup - clove garlic, minced', '2 cup - mushrooms', '8 medium - eggs', '200g - brie cheese, sliced', '120g - rocket', '1 tbsp - olive oil', 'salt & pepper'],
            instructions: ['Heat a large non-stick frying pan over high heat, greased with a little bit of oil. Slice the mushrooms and cook, stirring occasionally, for 5-7 minutes. Transfer to a bowl and set aside.', 'Heat a small non-stick frying pan over medium-high heat, greased with a small amount of oil. Whisk the eggs in a large bowl with cold water. Season well with salt and pepper.', 'Pour quarter of the eggs into the pan and cook the omelet. Top with a quarter of the mushrooms and brie. Fold and serve with rocket.'],
          },
          { id: 2, name: 'Green Pea & Goat Cheese Frittata', calories: 295, prepTime: '25 mins', protein: 20, fat: 18, carbs: 12, servings: 4, ingredients: [], instructions: [] },
          { id: 3, name: 'Shakshuka', calories: 308, prepTime: '30 mins', protein: 15, fat: 22, carbs: 10, servings: 2, ingredients: [], instructions: [] },
        ],
      },
      {
        title: 'Snacks',
        recipes: [
          { id: 4, name: 'Almond & Cranberry Energy Balls', calories: 59, prepTime: '15 mins', protein: 2, fat: 3, carbs: 6, servings: 12, ingredients: [], instructions: [] },
          { id: 5, name: 'Almond & Peach Cake', calories: 199, prepTime: '45 mins', protein: 5, fat: 12, carbs: 18, servings: 8, ingredients: [], instructions: [] },
          { id: 6, name: 'Apple Cake', calories: 227, prepTime: '50 mins', protein: 4, fat: 10, carbs: 30, servings: 10, ingredients: [], instructions: [] },
        ],
      },
      {
        title: 'Breakfast',
        recipes: [
          { id: 7, name: 'Antioxidant Blueberry Protein Smoothie', calories: 197, prepTime: '5 mins', protein: 20, fat: 4, carbs: 22, servings: 1, ingredients: [], instructions: [] },
          { id: 8, name: 'Avocado Baked Eggs', calories: 214, prepTime: '20 mins', protein: 12, fat: 17, carbs: 4, servings: 2, ingredients: [], instructions: [] },
          { id: 9, name: 'Overnight Oats with Berries', calories: 340, prepTime: '5 mins', protein: 14, fat: 10, carbs: 48, servings: 1, ingredients: [], instructions: [] },
        ],
      },
      {
        title: 'Lunch',
        recipes: [
          { id: 10, name: 'Spicy Tuna Lettuce Wraps', calories: 280, prepTime: '15 mins', protein: 32, fat: 12, carbs: 8, servings: 2, ingredients: [], instructions: [] },
          { id: 11, name: 'Chicken & Avocado Bowl', calories: 450, prepTime: '20 mins', protein: 38, fat: 22, carbs: 28, servings: 1, ingredients: [], instructions: [] },
          { id: 12, name: 'Broccoli & Ginger Soup', calories: 189, prepTime: '25 mins', protein: 8, fat: 6, carbs: 24, servings: 2, ingredients: [], instructions: [] },
          { id: 13, name: 'Lamb Kofta with Tzatziki', calories: 410, prepTime: '30 mins', protein: 34, fat: 26, carbs: 12, servings: 2, ingredients: [], instructions: [] },
        ],
      },
      {
        title: 'Dinner',
        recipes: [
          { id: 14, name: 'Lemon Herb Chicken', calories: 395, prepTime: '35 mins', protein: 42, fat: 18, carbs: 10, servings: 2, ingredients: [], instructions: [] },
          { id: 15, name: 'Beef Stir Fry', calories: 450, prepTime: '20 mins', protein: 38, fat: 20, carbs: 28, servings: 2, ingredients: [], instructions: [] },
          { id: 16, name: 'Salmon with Sweet Potato Mash', calories: 520, prepTime: '30 mins', protein: 36, fat: 24, carbs: 38, servings: 1, ingredients: [], instructions: [] },
          { id: 17, name: 'Pork Chops with Apple Slaw', calories: 380, prepTime: '25 mins', protein: 34, fat: 18, carbs: 16, servings: 2, ingredients: [], instructions: [] },
        ],
      },
      {
        title: 'Salads',
        recipes: [
          { id: 18, name: 'Greek Salad with Grilled Chicken', calories: 350, prepTime: '15 mins', protein: 32, fat: 18, carbs: 14, servings: 1, ingredients: [], instructions: [] },
          { id: 19, name: 'Asian Beef Salad', calories: 320, prepTime: '20 mins', protein: 28, fat: 16, carbs: 18, servings: 2, ingredients: [], instructions: [] },
          { id: 20, name: 'Kale & Quinoa Power Bowl', calories: 380, prepTime: '15 mins', protein: 16, fat: 14, carbs: 44, servings: 1, ingredients: [], instructions: [] },
          { id: 21, name: 'Caesar Salad with Poached Egg', calories: 290, prepTime: '10 mins', protein: 18, fat: 20, carbs: 8, servings: 1, ingredients: [], instructions: [] },
        ],
      },
      {
        title: 'Smoothies',
        recipes: [
          { id: 22, name: 'Purple Power Smoothie', calories: 322, prepTime: '5 mins', protein: 20, fat: 8, carbs: 42, servings: 1, ingredients: [], instructions: [] },
          { id: 23, name: 'Green Detox Smoothie', calories: 180, prepTime: '5 mins', protein: 6, fat: 4, carbs: 30, servings: 1, ingredients: [], instructions: [] },
          { id: 24, name: 'Chocolate Peanut Butter Shake', calories: 410, prepTime: '5 mins', protein: 28, fat: 18, carbs: 36, servings: 1, ingredients: [], instructions: [] },
          { id: 25, name: 'Tropical Mango Protein Blast', calories: 260, prepTime: '5 mins', protein: 22, fat: 4, carbs: 34, servings: 1, ingredients: [], instructions: [] },
        ],
      },
    ],
  });
});

// Get supplements
router.get('/supplements', authenticateToken, async (req, res) => {
  res.json({
    title: 'Ageless Movement | Supplement Plan',
    sections: [
      { time: 'Upon Waking', items: [
        { name: 'Creatine', dosage: '5 g' },
      ]},
      { time: 'After Breakfast', items: [
        { name: 'Cod Liver Oil', dosage: '1 drop · 5 ml' },
        { name: 'Beef Liver', dosage: '4 capsule · 12 g' },
        { name: 'Magnesium | Malate', dosage: '4 capsule' },
      ]},
      { time: 'After Lunch', items: [
        { name: 'Creatine', dosage: '5 g' },
      ]},
      { time: 'Before Bed', items: [
        { name: 'Magnesium Glycinate', dosage: '1 portion · 0.3 g' },
      ]},
    ],
  });
});

// Food search
router.get('/search', authenticateToken, async (req, res) => {
  const q = (req.query.q || '').toLowerCase();
  const foods = [
    { name: 'Egg', calories: 73, serving: '53 g', protein: 6, fat: 5, carbs: 0.6 },
    { name: 'Salted Butter', calories: 104, serving: '14 g', protein: 0, fat: 12, carbs: 0 },
    { name: 'Beef Mince (Organic)', calories: 379, serving: '200 g', protein: 40, fat: 24, carbs: 0 },
    { name: 'Coffee (Homemade)', calories: 26, serving: '240 g', protein: 1, fat: 0, carbs: 5 },
    { name: 'Collagen Hydrolysate', calories: 40, serving: '10 g', protein: 10, fat: 0, carbs: 0 },
    { name: 'Chicken Breast', calories: 165, serving: '100 g', protein: 31, fat: 3.6, carbs: 0 },
    { name: 'Avocado', calories: 160, serving: '100 g', protein: 2, fat: 15, carbs: 9 },
    { name: 'Oats', calories: 384, serving: '100 g', protein: 13, fat: 7, carbs: 66 },
    { name: 'Greek Yogurt', calories: 100, serving: '170 g', protein: 17, fat: 0.7, carbs: 6 },
    { name: 'Broccoli', calories: 31, serving: '100 g', protein: 2.5, fat: 0.4, carbs: 6 },
    { name: 'Salmon Fillet', calories: 208, serving: '100 g', protein: 20, fat: 13, carbs: 0 },
    { name: 'Sweet Potato', calories: 86, serving: '100 g', protein: 1.6, fat: 0.1, carbs: 20 },
    { name: 'Banana', calories: 89, serving: '118 g', protein: 1.1, fat: 0.3, carbs: 23 },
    { name: 'Almond Butter', calories: 98, serving: '16 g', protein: 3.4, fat: 9, carbs: 3 },
    { name: 'Scotch Steak (Organic)', calories: 601, serving: '250 g', protein: 50, fat: 44, carbs: 0 },
    { name: 'Lamb Mince', calories: 415, serving: '150 g', protein: 30, fat: 32, carbs: 0 },
    { name: 'Pork Mince', calories: 378, serving: '150 g', protein: 27, fat: 30, carbs: 0 },
    { name: 'Turkey Mince', calories: 350, serving: '250 g', protein: 50, fat: 16, carbs: 0 },
  ];

  const filtered = q ? foods.filter(f => f.name.toLowerCase().includes(q)) : foods;
  res.json({ foods: filtered });
});

export default router;
