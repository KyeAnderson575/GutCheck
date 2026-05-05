/**
 * defaultFoods.js — Default restaurant menus (30 national chains)
 *
 * Categories: Fast Food, Fast Casual, Pizza, Coffee/Drinks, Casual Dining
 * Allergen data sourced from official chain allergen guides.
 * Users can add custom restaurants via the Menus manager in the app.
 *
 * NOT personal data — the user's custom restaurants, orders, etc.
 * are stored in IndexedDB and imported via backup files.
 */

// Restaurant database version — bump this when adding/changing restaurants.
// On load, if stored version < this, new restaurants get merged in.
export const RESTAURANT_DB_VERSION = 2;

// Default restaurant menus (common chains with allergen data)
export const DEFAULT_REST = {

  // ═══════════════════════════════════════
  //  FAST FOOD
  // ═══════════════════════════════════════

  "McDonald's": {
    ic: '🍟',
    it: [
      { n: 'Big Mac', a: ['gluten', 'dairy', 'soy', 'sesame', 'eggs'] },
      { n: 'Quarter Pounder w/ Cheese', a: ['gluten', 'dairy', 'soy', 'sesame'] },
      { n: 'McChicken', a: ['gluten', 'soy'] },
      { n: 'McNuggets (10pc)', a: ['gluten', 'soy'] },
      { n: 'Cheeseburger', a: ['gluten', 'dairy', 'soy'] },
      { n: 'Fries', a: [] },
      { n: 'Hash Browns', a: [] },
      { n: 'Egg McMuffin', a: ['gluten', 'dairy', 'eggs'] },
      { n: 'Sausage McMuffin w/ Egg', a: ['gluten', 'dairy', 'eggs', 'soy'] },
      { n: 'McFlurry (Oreo)', a: ['dairy', 'gluten', 'soy'] },
      { n: 'McCafé Latte', a: ['dairy'] },
    ],
  },

  "Wendy's": {
    ic: '🍔',
    it: [
      { n: "Dave's Single", a: ['gluten', 'dairy', 'soy', 'sesame'] },
      { n: 'Baconator', a: ['gluten', 'dairy', 'soy', 'sesame'] },
      { n: 'Jr. Cheeseburger', a: ['gluten', 'dairy', 'soy'] },
      { n: 'Spicy Chicken Sandwich', a: ['gluten', 'soy'] },
      { n: 'Nuggets (10pc)', a: ['gluten', 'soy'] },
      { n: 'Fries', a: [] },
      { n: 'Chili', a: ['soy', 'gluten'] },
      { n: 'Baked Potato (Sour Cream & Chive)', a: ['dairy'] },
      { n: 'Frosty (Chocolate)', a: ['dairy'] },
    ],
  },

  "Chick-fil-A": {
    ic: '🐔',
    it: [
      { n: 'Chicken Sandwich', a: ['gluten', 'dairy', 'soy', 'peanuts'] },
      { n: 'Spicy Chicken Sandwich', a: ['gluten', 'dairy', 'soy', 'peanuts'] },
      { n: 'Grilled Chicken Sandwich', a: ['gluten', 'dairy', 'soy'] },
      { n: 'Chick-n-Strips (4ct)', a: ['gluten', 'soy', 'peanuts'] },
      { n: 'Nuggets (12ct)', a: ['gluten', 'soy', 'peanuts'] },
      { n: 'Grilled Nuggets (12ct)', a: ['soy'] },
      { n: 'Waffle Fries', a: [] },
      { n: 'Mac & Cheese', a: ['gluten', 'dairy', 'eggs', 'soy'] },
      { n: 'Cobb Salad', a: ['dairy', 'eggs', 'soy'] },
      { n: 'CFA Sauce', a: ['soy', 'eggs'] },
      { n: 'Lemonade', a: [] },
    ],
  },

  "Taco Bell": {
    ic: '🌮',
    it: [
      { n: 'Crunchy Taco', a: [] },
      { n: 'Soft Taco', a: ['gluten'] },
      { n: 'Crunchwrap Supreme', a: ['gluten', 'dairy', 'soy'] },
      { n: 'Cheesy Gordita Crunch', a: ['gluten', 'dairy', 'soy'] },
      { n: 'Burrito Supreme', a: ['gluten', 'dairy', 'soy'] },
      { n: 'Quesadilla (Chicken)', a: ['gluten', 'dairy', 'soy'] },
      { n: 'Nachos BellGrande', a: ['dairy', 'soy'] },
      { n: 'Mexican Pizza', a: ['gluten', 'dairy', 'soy'] },
      { n: 'Baja Blast (Freeze)', a: [] },
      { n: 'Cinnamon Twists', a: ['gluten', 'soy'] },
    ],
  },

  "In-N-Out": {
    ic: '🍔',
    it: [
      { n: 'Double-Double', a: ['gluten', 'dairy'] },
      { n: 'Cheeseburger', a: ['gluten', 'dairy'] },
      { n: 'Hamburger', a: ['gluten'] },
      { n: 'Protein Style (no bun)', a: ['dairy'] },
      { n: 'Animal Style Fries', a: ['dairy'] },
      { n: 'Fries', a: [] },
      { n: 'Shake (Chocolate)', a: ['dairy'] },
      { n: 'Shake (Vanilla)', a: ['dairy'] },
    ],
  },

  "Raising Cane's": {
    ic: '🍗',
    it: [
      { n: 'The Box Combo', a: ['gluten', 'soy', 'eggs'] },
      { n: '3 Finger Combo', a: ['gluten', 'soy', 'eggs'] },
      { n: 'Chicken Fingers (3pc)', a: ['gluten', 'soy', 'eggs'] },
      { n: 'Chicken Fingers (6pc)', a: ['gluten', 'soy', 'eggs'] },
      { n: 'Texas Toast', a: ['gluten', 'dairy', 'soy'] },
      { n: 'Coleslaw', a: ['eggs', 'soy'] },
      { n: 'Crinkle-Cut Fries', a: [] },
      { n: "Cane's Sauce", a: ['eggs', 'soy'] },
    ],
  },

  "Burger King": {
    ic: '👑',
    it: [
      { n: 'Whopper', a: ['gluten', 'sesame', 'soy'] },
      { n: 'Whopper w/ Cheese', a: ['gluten', 'dairy', 'sesame', 'soy'] },
      { n: 'Chicken Fries', a: ['gluten', 'soy'] },
      { n: 'Original Chicken Sandwich', a: ['gluten', 'soy'] },
      { n: 'Bacon Cheeseburger', a: ['gluten', 'dairy', 'soy'] },
      { n: 'Onion Rings', a: ['gluten', 'soy'] },
      { n: 'Fries', a: [] },
      { n: 'Impossible Whopper', a: ['gluten', 'soy', 'sesame'] },
      { n: 'Hershey Pie', a: ['gluten', 'dairy', 'soy', 'eggs'] },
    ],
  },

  "Popeyes": {
    ic: '🍗',
    it: [
      { n: 'Chicken Sandwich', a: ['gluten', 'eggs', 'soy'] },
      { n: 'Spicy Chicken Sandwich', a: ['gluten', 'eggs', 'soy'] },
      { n: 'Fried Chicken (2pc)', a: ['gluten', 'eggs', 'soy'] },
      { n: 'Chicken Tenders (3pc)', a: ['gluten', 'eggs', 'soy'] },
      { n: 'Cajun Fries', a: [] },
      { n: 'Red Beans & Rice', a: ['soy'] },
      { n: 'Mashed Potatoes w/ Gravy', a: ['dairy', 'soy'] },
      { n: 'Biscuit', a: ['gluten', 'dairy', 'soy'] },
      { n: 'Coleslaw', a: ['eggs', 'soy'] },
    ],
  },

  "Arby's": {
    ic: '🤠',
    it: [
      { n: 'Classic Roast Beef', a: ['gluten', 'soy'] },
      { n: 'Beef n Cheddar', a: ['gluten', 'dairy', 'soy'] },
      { n: 'Crispy Chicken Sandwich', a: ['gluten', 'soy'] },
      { n: 'Curly Fries', a: ['soy'] },
      { n: 'Mozzarella Sticks', a: ['gluten', 'dairy', 'soy'] },
      { n: 'Jamocha Shake', a: ['dairy'] },
      { n: 'Gyro (Roast Beef)', a: ['gluten', 'dairy', 'soy', 'eggs'] },
      { n: 'Turkey Club Wrap', a: ['gluten', 'dairy', 'soy', 'eggs'] },
    ],
  },

  "Good Times": {
    ic: '🍔',
    it: [
      { n: 'Bambino Burger', a: ['gluten', 'dairy'] },
      { n: 'Big Daddy Bacon Cheeseburger', a: ['gluten', 'dairy'] },
      { n: 'Chicken Tenders', a: ['gluten'] },
      { n: 'Wild Fries', a: [] },
      { n: 'Frozen Custard (Vanilla)', a: ['dairy', 'eggs'] },
      { n: 'Frozen Custard (Chocolate)', a: ['dairy', 'eggs'] },
      { n: 'Spicy Chicken Sandwich', a: ['gluten', 'dairy'] },
    ],
  },

  // ═══════════════════════════════════════
  //  FAST CASUAL
  // ═══════════════════════════════════════

  "Chipotle": {
    ic: '🌯',
    it: [
      { n: 'Burrito (Chicken)', a: ['gluten', 'dairy'] },
      { n: 'Burrito (Steak)', a: ['gluten', 'dairy', 'soy'] },
      { n: 'Bowl (Chicken)', a: ['dairy'] },
      { n: 'Bowl (Steak)', a: ['dairy', 'soy'] },
      { n: 'Bowl (Barbacoa)', a: ['dairy', 'soy'] },
      { n: 'Quesadilla (Chicken)', a: ['gluten', 'dairy'] },
      { n: 'Tacos (Chicken, 3pc)', a: ['dairy'] },
      { n: 'Chips & Guac', a: [] },
      { n: 'Chips & Queso', a: ['dairy'] },
      { n: 'Chips & Salsa', a: [] },
    ],
  },

  "Panera": {
    ic: '🥖',
    it: [
      { n: 'Mac & Cheese', a: ['gluten', 'dairy', 'eggs'] },
      { n: 'Broccoli Cheddar Soup', a: ['gluten', 'dairy', 'eggs'] },
      { n: 'Frontega Chicken Sandwich', a: ['gluten', 'dairy'] },
      { n: 'Grilled Cheese', a: ['gluten', 'dairy'] },
      { n: 'Tomato Soup', a: ['dairy', 'gluten'] },
      { n: 'Caesar Salad', a: ['dairy', 'eggs', 'fish', 'gluten'] },
      { n: 'Fuji Apple Salad', a: ['dairy', 'nuts', 'gluten'] },
      { n: 'Chicken Avocado Melt', a: ['gluten', 'dairy', 'eggs'] },
      { n: 'Cookie', a: ['gluten', 'dairy', 'eggs', 'soy'] },
    ],
  },

  "Subway": {
    ic: '🥪',
    it: [
      { n: 'Turkey Sub (6")', a: ['gluten', 'soy'] },
      { n: 'Italian BMT (6")', a: ['gluten', 'soy'] },
      { n: 'Chicken Teriyaki (6")', a: ['gluten', 'soy'] },
      { n: 'Meatball Marinara (6")', a: ['gluten', 'dairy', 'soy'] },
      { n: 'Steak & Cheese (6")', a: ['gluten', 'dairy', 'soy'] },
      { n: 'Veggie Delite (6")', a: ['gluten', 'soy'] },
      { n: 'Tuna (6")', a: ['gluten', 'fish', 'eggs', 'soy'] },
      { n: 'Chocolate Chip Cookie', a: ['gluten', 'dairy', 'eggs', 'soy'] },
    ],
  },

  "Panda Express": {
    ic: '🥡',
    it: [
      { n: 'Orange Chicken', a: ['gluten', 'soy', 'eggs'] },
      { n: 'Beijing Beef', a: ['gluten', 'soy'] },
      { n: 'Kung Pao Chicken', a: ['gluten', 'soy', 'peanuts'] },
      { n: 'Broccoli Beef', a: ['gluten', 'soy'] },
      { n: 'Honey Walnut Shrimp', a: ['gluten', 'shellfish', 'dairy', 'soy', 'nuts', 'eggs'] },
      { n: 'Grilled Teriyaki Chicken', a: ['soy'] },
      { n: 'Chow Mein', a: ['gluten', 'soy'] },
      { n: 'Fried Rice', a: ['soy', 'eggs'] },
      { n: 'Steamed White Rice', a: [] },
      { n: 'Cream Cheese Rangoon', a: ['gluten', 'dairy', 'soy'] },
      { n: 'Egg Roll', a: ['gluten', 'soy', 'eggs'] },
    ],
  },

  "Culver's": {
    ic: '🧈',
    it: [
      { n: 'ButterBurger (Single)', a: ['gluten', 'dairy'] },
      { n: 'ButterBurger (Double)', a: ['gluten', 'dairy'] },
      { n: 'Chicken Tenders (4pc)', a: ['gluten', 'eggs'] },
      { n: 'Fried Cheese Curds', a: ['gluten', 'dairy', 'eggs'] },
      { n: 'Crinkle Cut Fries', a: [] },
      { n: 'Wisconsin Cheese Soup', a: ['gluten', 'dairy'] },
      { n: 'Concrete Mixer (Vanilla)', a: ['dairy'] },
      { n: 'North Atlantic Cod Filet', a: ['gluten', 'fish', 'eggs'] },
    ],
  },

  "Qdoba": {
    ic: '🌯',
    it: [
      { n: 'Burrito (Chicken)', a: ['gluten', 'dairy'] },
      { n: 'Burrito (Steak)', a: ['gluten', 'dairy'] },
      { n: 'Bowl (Chicken)', a: ['dairy'] },
      { n: 'Quesadilla (Chicken)', a: ['gluten', 'dairy'] },
      { n: 'Nachos', a: ['dairy'] },
      { n: 'Chips & Queso', a: ['dairy'] },
      { n: 'Chips & Guac', a: [] },
      { n: '3-Cheese Queso', a: ['dairy'] },
    ],
  },

  "Noodles & Company": {
    ic: '🍝',
    it: [
      { n: 'Wisconsin Mac & Cheese', a: ['gluten', 'dairy', 'eggs'] },
      { n: 'Penne Rosa (Chicken)', a: ['gluten', 'dairy'] },
      { n: 'Pad Thai', a: ['gluten', 'soy', 'eggs', 'peanuts'] },
      { n: 'Japanese Pan Noodles', a: ['gluten', 'soy'] },
      { n: 'Spaghetti & Meatballs', a: ['gluten', 'dairy', 'eggs', 'soy'] },
      { n: 'Buttered Noodles', a: ['gluten', 'dairy', 'eggs'] },
      { n: 'Zucchini Grilled Chicken', a: ['dairy'] },
      { n: 'Crispy Rice Treats', a: ['dairy', 'soy'] },
    ],
  },

  "Wingstop": {
    ic: '🍗',
    it: [
      { n: 'Classic Wings (10pc)', a: ['soy'] },
      { n: 'Boneless Wings (10pc)', a: ['gluten', 'soy'] },
      { n: 'Crispy Tenders (3pc)', a: ['gluten', 'soy'] },
      { n: 'Lemon Pepper Wings', a: ['soy'] },
      { n: 'Atomic Wings', a: ['soy'] },
      { n: 'Cajun Fries', a: [] },
      { n: 'Ranch Dip', a: ['dairy', 'eggs', 'soy'] },
      { n: 'Blue Cheese Dip', a: ['dairy', 'eggs', 'soy'] },
    ],
  },

  // ═══════════════════════════════════════
  //  PIZZA
  // ═══════════════════════════════════════

  "Domino's": {
    ic: '🍕',
    it: [
      { n: 'Cheese Pizza (Medium)', a: ['gluten', 'dairy', 'soy'] },
      { n: 'Pepperoni Pizza (Medium)', a: ['gluten', 'dairy', 'soy'] },
      { n: 'Buffalo Chicken Pizza', a: ['gluten', 'dairy', 'soy'] },
      { n: 'Breadsticks', a: ['gluten', 'dairy', 'soy'] },
      { n: 'Boneless Chicken (8pc)', a: ['gluten', 'soy'] },
      { n: 'Pasta — Alfredo', a: ['gluten', 'dairy', 'soy'] },
      { n: 'Cinnamon Bread Twists', a: ['gluten', 'dairy', 'soy'] },
      { n: 'Lava Cake', a: ['gluten', 'dairy', 'eggs', 'soy'] },
    ],
  },

  "Pizza Hut": {
    ic: '🍕',
    it: [
      { n: 'Cheese Pizza (Medium)', a: ['gluten', 'dairy', 'soy'] },
      { n: 'Pepperoni Pizza (Medium)', a: ['gluten', 'dairy', 'soy'] },
      { n: 'Meat Lovers Pizza', a: ['gluten', 'dairy', 'soy'] },
      { n: 'Supreme Pizza', a: ['gluten', 'dairy', 'soy'] },
      { n: 'Breadsticks', a: ['gluten', 'dairy', 'soy'] },
      { n: 'Garlic Knots', a: ['gluten', 'dairy', 'soy'] },
      { n: 'WingStreet Wings (8pc)', a: ['soy'] },
      { n: 'Stuffed Crust Pizza', a: ['gluten', 'dairy', 'soy'] },
      { n: 'Cinnabon Mini Rolls', a: ['gluten', 'dairy', 'eggs', 'soy'] },
    ],
  },

  "Papa John's": {
    ic: '🍕',
    it: [
      { n: 'Cheese Pizza (Large)', a: ['gluten', 'dairy', 'soy'] },
      { n: 'Pepperoni Pizza (Large)', a: ['gluten', 'dairy', 'soy'] },
      { n: "The Works Pizza", a: ['gluten', 'dairy', 'soy'] },
      { n: 'Garlic Knots', a: ['gluten', 'dairy', 'soy'] },
      { n: 'Breadsticks', a: ['gluten', 'dairy', 'soy'] },
      { n: 'Chicken Poppers', a: ['gluten', 'soy'] },
      { n: 'Garlic Dipping Sauce', a: ['dairy', 'soy'] },
      { n: 'Chocolate Chip Cookie', a: ['gluten', 'dairy', 'eggs', 'soy'] },
    ],
  },

  "Little Caesars": {
    ic: '🍕',
    it: [
      { n: 'Hot-N-Ready Pepperoni', a: ['gluten', 'dairy', 'soy'] },
      { n: 'Hot-N-Ready Cheese', a: ['gluten', 'dairy', 'soy'] },
      { n: 'ExtraMostBestest Pepperoni', a: ['gluten', 'dairy', 'soy'] },
      { n: 'Deep Dish (Pepperoni)', a: ['gluten', 'dairy', 'soy'] },
      { n: 'Crazy Bread', a: ['gluten', 'dairy', 'soy'] },
      { n: 'Italian Cheese Bread', a: ['gluten', 'dairy', 'soy'] },
      { n: 'Wings (8pc)', a: ['soy'] },
    ],
  },

  // ═══════════════════════════════════════
  //  COFFEE & DRINKS
  // ═══════════════════════════════════════

  "Starbucks": {
    ic: '☕',
    it: [
      { n: 'Vanilla Latte', a: ['dairy'] },
      { n: 'Caramel Macchiato', a: ['dairy'] },
      { n: 'Pike Place Brewed Coffee', a: [] },
      { n: 'Cold Brew', a: [] },
      { n: 'Iced Chai Latte', a: ['dairy'] },
      { n: 'Refresher (Strawberry Açaí)', a: [] },
      { n: 'Matcha Latte', a: ['dairy'] },
      { n: 'Sausage Cheddar Egg Sandwich', a: ['gluten', 'dairy', 'eggs', 'soy'] },
      { n: 'Bacon Gouda Sandwich', a: ['gluten', 'dairy', 'eggs'] },
      { n: 'Butter Croissant', a: ['gluten', 'dairy', 'eggs'] },
    ],
  },

  "Dutch Bros": {
    ic: '☕',
    it: [
      { n: 'Iced Rebel (Original)', a: [] },
      { n: 'Rebel Orange Pomegranate', a: [] },
      { n: 'Rebel Blue Raspberry', a: [] },
      { n: 'Caramelizer', a: ['dairy'] },
      { n: 'Golden Eagle', a: ['dairy'] },
      { n: 'White Mocha', a: ['dairy'] },
      { n: 'Americano', a: [] },
      { n: 'Cold Brew', a: [] },
      { n: 'Soft Top (any drink)', a: ['dairy'] },
    ],
  },

  "Dunkin'": {
    ic: '🍩',
    it: [
      { n: 'Iced Coffee', a: [] },
      { n: 'Iced Latte', a: ['dairy'] },
      { n: 'Hot Latte', a: ['dairy'] },
      { n: 'Frozen Coffee', a: ['dairy'] },
      { n: 'Glazed Donut', a: ['gluten', 'dairy', 'eggs', 'soy'] },
      { n: 'Bacon Egg & Cheese (Croissant)', a: ['gluten', 'dairy', 'eggs', 'soy'] },
      { n: 'Sausage Egg & Cheese (Bagel)', a: ['gluten', 'dairy', 'eggs', 'soy', 'sesame'] },
      { n: 'Hash Browns (6pc)', a: ['soy'] },
      { n: 'Munchkins (5pc)', a: ['gluten', 'dairy', 'eggs', 'soy'] },
    ],
  },

  // ═══════════════════════════════════════
  //  CASUAL DINING
  // ═══════════════════════════════════════

  "Olive Garden": {
    ic: '🍝',
    it: [
      { n: 'Chicken Alfredo', a: ['gluten', 'dairy', 'eggs'] },
      { n: 'Spaghetti & Meatballs', a: ['gluten', 'dairy', 'eggs', 'soy'] },
      { n: 'Chicken Parmigiana', a: ['gluten', 'dairy', 'eggs', 'soy'] },
      { n: 'Tour of Italy', a: ['gluten', 'dairy', 'eggs', 'soy'] },
      { n: 'Zuppa Toscana Soup', a: ['dairy'] },
      { n: 'Breadsticks (unlimited)', a: ['gluten', 'dairy', 'soy'] },
      { n: 'House Salad (unlimited)', a: ['dairy'] },
      { n: 'Eggplant Parmigiana', a: ['gluten', 'dairy', 'eggs', 'soy'] },
      { n: 'Chicken Gnocchi Soup', a: ['gluten', 'dairy'] },
      { n: 'Tiramisu', a: ['gluten', 'dairy', 'eggs'] },
    ],
  },

  "Applebee's": {
    ic: '🍎',
    it: [
      { n: 'Boneless Wings', a: ['gluten', 'soy'] },
      { n: 'Classic Burger', a: ['gluten', 'dairy', 'soy'] },
      { n: 'Chicken Tenders', a: ['gluten', 'soy'] },
      { n: 'Fiesta Lime Chicken', a: ['gluten', 'dairy', 'soy'] },
      { n: 'Oriental Chicken Salad', a: ['gluten', 'soy', 'sesame'] },
      { n: 'Riblet Platter', a: ['soy'] },
      { n: 'French Fries', a: [] },
      { n: 'Mozzarella Sticks', a: ['gluten', 'dairy', 'soy'] },
      { n: 'Triple Chocolate Meltdown', a: ['gluten', 'dairy', 'eggs', 'soy'] },
    ],
  },

  "Chili's": {
    ic: '🌶️',
    it: [
      { n: 'Big Mouth Burger', a: ['gluten', 'dairy', 'soy'] },
      { n: 'Chicken Crispers', a: ['gluten', 'soy', 'eggs'] },
      { n: 'Chicken Bacon Ranch Quesadilla', a: ['gluten', 'dairy', 'soy'] },
      { n: 'Baby Back Ribs (Full)', a: ['soy'] },
      { n: 'Cajun Chicken Pasta', a: ['gluten', 'dairy', 'soy'] },
      { n: 'Southwestern Eggrolls', a: ['gluten', 'dairy', 'soy'] },
      { n: 'Chips & Salsa', a: [] },
      { n: 'Molten Lava Cake', a: ['gluten', 'dairy', 'eggs', 'soy'] },
      { n: 'Classic Nachos', a: ['dairy', 'soy'] },
    ],
  },

  "Texas Roadhouse": {
    ic: '🥩',
    it: [
      { n: '6 oz Sirloin', a: [] },
      { n: '10 oz Ribeye', a: [] },
      { n: 'Country Fried Chicken', a: ['gluten', 'dairy', 'eggs', 'soy'] },
      { n: 'Grilled Chicken Salad', a: ['dairy', 'eggs'] },
      { n: 'Pulled Pork Sandwich', a: ['gluten', 'soy'] },
      { n: 'Dinner Rolls w/ Cinnamon Butter', a: ['gluten', 'dairy', 'eggs', 'soy'] },
      { n: 'Loaded Baked Potato', a: ['dairy'] },
      { n: 'House Salad', a: ['dairy'] },
      { n: 'Fried Pickles', a: ['gluten', 'soy'] },
      { n: 'Grilled Salmon', a: ['fish'] },
    ],
  },

  "Buffalo Wild Wings": {
    ic: '🦬',
    it: [
      { n: 'Traditional Wings (12pc)', a: ['soy'] },
      { n: 'Boneless Wings (12pc)', a: ['gluten', 'soy'] },
      { n: 'Smoked Brisket Burger', a: ['gluten', 'dairy', 'soy', 'eggs'] },
      { n: 'Chicken Tenders', a: ['gluten', 'soy'] },
      { n: 'Mozzarella Sticks', a: ['gluten', 'dairy', 'soy'] },
      { n: 'French Fries', a: [] },
      { n: 'Street Tacos (Chicken)', a: ['gluten', 'dairy'] },
      { n: 'Caesar Salad', a: ['dairy', 'eggs', 'fish', 'gluten'] },
      { n: 'Cheese Curds', a: ['gluten', 'dairy'] },
    ],
  },

  "IHOP": {
    ic: '🥞',
    it: [
      { n: 'Buttermilk Pancakes (Short Stack)', a: ['gluten', 'dairy', 'eggs'] },
      { n: 'Belgian Waffle', a: ['gluten', 'dairy', 'eggs', 'soy'] },
      { n: 'French Toast', a: ['gluten', 'dairy', 'eggs'] },
      { n: 'Omelette (Denver)', a: ['dairy', 'eggs'] },
      { n: 'Breakfast Sampler', a: ['gluten', 'dairy', 'eggs', 'soy'] },
      { n: 'Crispy Chicken Strips & Fries', a: ['gluten', 'soy'] },
      { n: 'Classic Burger', a: ['gluten', 'dairy', 'soy', 'sesame'] },
      { n: 'French Fries', a: [] },
    ],
  },

  "Denny's": {
    ic: '🍳',
    it: [
      { n: "Grand Slam", a: ['gluten', 'dairy', 'eggs', 'soy'] },
      { n: 'Moons Over My Hammy', a: ['gluten', 'dairy', 'eggs'] },
      { n: 'Lumberjack Slam', a: ['gluten', 'dairy', 'eggs', 'soy'] },
      { n: 'Country Fried Steak', a: ['gluten', 'dairy', 'eggs', 'soy'] },
      { n: 'Bacon Cheeseburger', a: ['gluten', 'dairy', 'soy', 'sesame'] },
      { n: 'Chicken Tenders', a: ['gluten', 'soy'] },
      { n: 'French Fries', a: ['soy'] },
      { n: 'Pancakes (Buttermilk)', a: ['gluten', 'dairy', 'eggs'] },
    ],
  },

  "Cracker Barrel": {
    ic: '🪵',
    it: [
      { n: 'Country Fried Steak', a: ['gluten', 'dairy', 'eggs', 'soy'] },
      { n: 'Grilled Chicken Tenderloins', a: [] },
      { n: 'Pancakes', a: ['gluten', 'dairy', 'eggs'] },
      { n: 'Biscuits n Gravy', a: ['gluten', 'dairy', 'soy'] },
      { n: 'Hashbrown Casserole', a: ['dairy', 'soy'] },
      { n: 'Country Ham', a: [] },
      { n: 'Meatloaf', a: ['gluten', 'dairy', 'eggs', 'soy'] },
      { n: 'Fried Okra', a: ['gluten', 'soy'] },
      { n: 'Turnip Greens', a: [] },
    ],
  },
};
