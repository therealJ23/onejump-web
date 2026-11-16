import Foundation

/// Which of OneJump's food pictures (server: public/img/food) fits a food, from its name, in
/// English or Spanish. The same rules as the server (server/nutrition/foodArt.js), so demo foods,
/// search results and logged meals all get a picture.
enum FoodArt {
    private static let rules: [(NSRegularExpression, String)] = [
        (#"sweet potato|batata|boniato|camote"#, "roasted_sweet_potato"),
        (#"chicken|turkey|pollo|pavo"#, "poultry_leg"),
        (#"salmon|tuna|fish|tilapia|cod\b|pescado|at[uú]n|bacalao"#, "fish"),
        (#"shrimp|prawn|camar[oó]n"#, "shrimp"),
        (#"steak|beef|pork|ground|carne|res\b|cerdo|lomo|bistec"#, "cut_of_meat"),
        (#"bacon|tocino"#, "bacon"),
        (#"egg|omelet|huevo|tortilla de huevo"#, "egg"),
        (#"sushi|poke"#, "sushi"),
        (#"burrito|wrap|quesadilla"#, "burrito"),
        (#"taco"#, "taco"),
        (#"pizza"#, "pizza"),
        (#"burger|hamburguesa"#, "hamburger"),
        (#"fries|papas fritas"#, "french_fries"),
        (#"pasta|spaghetti|noodle|macarr|fideo"#, "spaghetti"),
        (#"curry"#, "curry_rice"),
        (#"soup|stew|chili|sopa|sancocho|guiso|habichuela|frijol|bean|lentej|lentil"#, "pot_of_food"),
        (#"rice|arroz"#, "cooked_rice"),
        (#"oat|yogurt|yoghurt|cereal|granola|avena|yogur"#, "bowl_with_spoon"),
        (#"salad|lettuce|spinach|greens|ensalada|lechuga|espinaca"#, "green_salad"),
        (#"broccoli|br[oó]coli"#, "broccoli"),
        (#"avocado|guacamole|aguacate"#, "avocado"),
        (#"banana|pl[aá]tano|guineo|mang[uú]"#, "banana"),
        (#"apple|manzana"#, "red_apple"),
        (#"blueberr|berries|ar[aá]ndano"#, "blueberries"),
        (#"strawberr|fresa"#, "strawberry"),
        (#"grape|uva"#, "grapes"),
        (#"watermelon|sand[ií]a|patilla"#, "watermelon"),
        (#"pineapple|pi[nñ]a"#, "pineapple"),
        (#"kiwi"#, "kiwi_fruit"),
        (#"pancake|waffle|panqueque"#, "pancakes"),
        (#"bagel"#, "bagel"),
        (#"croissant|pastry|muffin"#, "croissant"),
        (#"sandwich|sub\b|s[aá]ndwich"#, "sandwich"),
        (#"bread|toast|pan\b|tostada"#, "bread"),
        (#"potato|papa\b|yuca|cassava"#, "potato"),
        (#"shake|smoothie|batido|protein drink|milk|leche"#, "cup_with_straw"),
        (#"coffee|tea\b|caf[eé]|t[eé]\b"#, "hot_beverage"),
        (#"cheese|queso"#, "cheese_wedge"),
        (#"peanut|almond|nut|man[ií]|almendra|nuez"#, "peanuts"),
        (#"cookie|galleta"#, "cookie"),
        (#"chocolate"#, "chocolate_bar"),
        (#"ice cream|helado"#, "soft_ice_cream"),
        (#"carrot|zanahoria"#, "carrot"),
        (#"tomato|tomate"#, "tomato"),
        (#"cucumber|pepino"#, "cucumber"),
        (#"meal prep|bento"#, "bento_box"),
    ].compactMap { pair in
        (try? NSRegularExpression(pattern: pair.0, options: [.caseInsensitive])).map { ($0, pair.1) }
    }

    /// "/img/food/<picture>.png" for a food name (a plate when nothing matches).
    static func path(_ name: String, meal: String? = nil) -> String {
        let text = name.lowercased()
        let range = NSRange(text.startIndex..., in: text)
        for (re, art) in rules where re.firstMatch(in: text, range: range) != nil {
            return "/img/food/\(art).png"
        }
        switch meal?.lowercased() {
        case "breakfast": return "/img/food/pancakes.png"
        case "lunch": return "/img/food/steaming_bowl.png"
        case "dinner": return "/img/food/shallow_pan_of_food.png"
        case "snack", "snacks": return "/img/food/red_apple.png"
        default: return "/img/food/fork_and_knife_with_plate.png"
        }
    }
}
