// A picture for any food line, from its words (English and Spanish): the 3D food illustrations in
// public/img/food (Microsoft Fluent Emoji, MIT license, see docs/third-party). Used when a meal has
// no photo of its own, and for recipes until the coach adds a photo.
const RULES = [
  [/sweet potato|batata|boniato|camote/, 'roasted_sweet_potato'],
  [/chicken|turkey|pollo|pavo/, 'poultry_leg'],
  [/salmon|tuna|fish|tilapia|cod\b|pescado|at[uú]n|bacalao/, 'fish'],
  [/shrimp|prawn|camar[oó]n/, 'shrimp'],
  [/steak|beef|pork|ground|carne|res\b|cerdo|lomo|bistec/, 'cut_of_meat'],
  [/bacon|tocino/, 'bacon'],
  [/egg|omelet|huevo|tortilla de huevo/, 'egg'],
  [/sushi|poke/, 'sushi'],
  [/burrito|wrap|quesadilla/, 'burrito'],
  [/taco/, 'taco'],
  [/pizza/, 'pizza'],
  [/burger|hamburguesa/, 'hamburger'],
  [/fries|papas fritas/, 'french_fries'],
  [/pasta|spaghetti|noodle|macarr|fideo/, 'spaghetti'],
  [/curry/, 'curry_rice'],
  [/soup|stew|chili|sopa|sancocho|guiso|habichuela|frijol|bean|lentej|lentil/, 'pot_of_food'],
  [/rice|arroz/, 'cooked_rice'],
  [/oat|yogurt|yoghurt|cereal|granola|avena|yogur/, 'bowl_with_spoon'],
  [/salad|lettuce|spinach|greens|ensalada|lechuga|espinaca/, 'green_salad'],
  [/broccoli|br[oó]coli/, 'broccoli'],
  [/avocado|guacamole|aguacate/, 'avocado'],
  [/banana|pl[aá]tano|guineo|mang[uú]/, 'banana'],
  [/apple|manzana/, 'red_apple'],
  [/blueberr|berries|ar[aá]ndano/, 'blueberries'],
  [/strawberr|fresa/, 'strawberry'],
  [/grape|uva/, 'grapes'],
  [/watermelon|sand[ií]a|patilla/, 'watermelon'],
  [/pineapple|pi[nñ]a/, 'pineapple'],
  [/kiwi/, 'kiwi_fruit'],
  [/pancake|waffle|panqueque/, 'pancakes'],
  [/bagel/, 'bagel'],
  [/croissant|pastry|muffin/, 'croissant'],
  [/sandwich|sub\b|s[aá]ndwich/, 'sandwich'],
  [/bread|toast|pan\b|tostada/, 'bread'],
  [/potato|papa\b|yuca|cassava/, 'potato'],
  [/shake|smoothie|batido|protein drink|milk|leche/, 'cup_with_straw'],
  [/coffee|tea\b|caf[eé]|t[eé]\b/, 'hot_beverage'],
  [/cheese|queso/, 'cheese_wedge'],
  [/peanut|almond|nut|man[ií]|almendra|nuez/, 'peanuts'],
  [/cookie|galleta/, 'cookie'],
  [/chocolate/, 'chocolate_bar'],
  [/ice cream|helado/, 'soft_ice_cream'],
  [/carrot|zanahoria/, 'carrot'],
  [/tomato|tomate/, 'tomato'],
  [/cucumber|pepino/, 'cucumber'],
  [/meal prep|bento/, 'bento_box'],
];
const BY_MEAL = { breakfast: 'pancakes', lunch: 'steaming_bowl', dinner: 'shallow_pan_of_food', snack: 'red_apple' };

/** The art key for a food name (or a list of names), falling back to the meal. */
export function foodArt(names, meal = null) {
  const text = (Array.isArray(names) ? names.join(' ') : String(names || '')).toLowerCase();
  for (const [re, art] of RULES) if (re.test(text)) return art;
  return BY_MEAL[meal] || 'fork_and_knife_with_plate';
}
export const foodArtUrl = (names, meal) => `/img/food/${foodArt(names, meal)}.png`;
