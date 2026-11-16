import SwiftUI

/// Protein first: a big ring for protein, calories left beside it, and the other macros as thin bars.
/// Used on Today and at the top of Food. With "Hide numbers" on, it shows only how many foods were logged.
struct ProteinHeroCard: View {
    @Environment(ClientStore.self) private var store
    @Environment(\.lang) private var lang
    var tappable = true

    var body: some View {
        let totals = store.totals(for: .today)
        let es = lang == .spanish
        Button { if tappable { store.go(.food) } } label: {
            Group {
                if let t = store.targets, !store.hideNumbers, t.protein > 0 {
                    HStack(spacing: 18) {
                        ProteinRing(value: totals.protein, target: t.protein, size: 112)
                        VStack(alignment: .leading, spacing: 10) {
                            Text(es ? "Comida de hoy" : "Food today").font(OJFont.title).foregroundStyle(Palette.ink)
                            VStack(alignment: .leading, spacing: 1) {
                                Text(Fmt.grouped(Int(max(0, t.kcal - totals.kcal).rounded())))
                                    .font(.archivo(24, .heavy)).foregroundStyle(Palette.ink).contentTransition(.numericText())
                                Text(es ? "kcal restantes" : "kcal left").font(.archivo(12)).foregroundStyle(Palette.muted)
                            }
                            macroBar(es ? "Carbos" : "Carbs", totals.carbs, t.carbs, Color(hex: 0xE8A33B))
                            macroBar(es ? "Grasa" : "Fat", totals.fat, t.fat, Color(hex: 0x3A86C8))
                        }
                        Spacer(minLength: 0)
                    }
                } else {
                    HStack(spacing: 14) {
                        IconTile(systemName: "fork.knife", tone: .assist, size: 52)
                        TitleSub(es ? "Comida de hoy" : "Food today", sub: CLT.foodsCount(totals.count)(lang))
                        Spacer(minLength: 0)
                    }
                }
            }
            .card()
        }
        .buttonStyle(.plain)
        .allowsHitTesting(tappable)
    }

    private func macroBar(_ label: String, _ v: Double, _ target: Double, _ color: Color) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack {
                Text(label).font(.archivo(11.5, .semibold)).foregroundStyle(Palette.muted)
                Spacer()
                Text("\(Int(v.rounded()))/\(Int(target.rounded())) g").font(.archivo(11.5, .semibold)).foregroundStyle(Palette.muted)
            }
            GeometryReader { g in
                ZStack(alignment: .leading) {
                    Capsule().fill(Palette.surface3)
                    Capsule().fill(color).frame(width: g.size.width * CGFloat(target > 0 ? min(1, v / target) : 0))
                }
            }
            .frame(height: 6)
        }
    }
}

/// The protein ring: grams eaten in the middle, volt when the target is reached.
struct ProteinRing: View {
    let value: Double
    let target: Double
    var size: CGFloat = 112
    @Environment(\.lang) private var lang

    var body: some View {
        let progress = target > 0 ? min(1, value / target) : 0
        let done = progress >= 1
        ZStack {
            Circle().stroke(Palette.surface3, lineWidth: size * 0.11)
            Circle()
                .trim(from: 0, to: progress)
                .stroke(AngularGradient(colors: [Palette.green, Palette.progressGreen, done ? Palette.volt : Palette.progressGreen], center: .center),
                        style: StrokeStyle(lineWidth: size * 0.11, lineCap: .round))
                .rotationEffect(.degrees(-90))
                .animation(.easeOut(duration: 0.6), value: progress)
            VStack(spacing: 0) {
                Text("\(Int(value.rounded()))")
                    .font(.archivo(size * 0.24, .heavy)).foregroundStyle(Palette.ink).contentTransition(.numericText())
                Text(lang == .spanish ? "de \(Int(target)) g proteína" : "of \(Int(target)) g protein")
                    .font(.archivo(10.5)).foregroundStyle(Palette.muted).multilineTextAlignment(.center)
            }
            .padding(.horizontal, size * 0.16)
        }
        .frame(width: size, height: size)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(lang == .spanish ? "Proteína: \(Int(value)) de \(Int(target)) gramos" : "Protein: \(Int(value)) of \(Int(target)) grams"))
    }
}

/// Recipes from the coach's book, as a photo carousel, with the one that best fits the protein left.
struct RecipeCarousel: View {
    @Environment(ClientStore.self) private var store
    @Environment(\.lang) private var lang
    @State private var data: RecipesResponse?
    @State private var open: RecipeDTO?

    var body: some View {
        Group {
            if let data, !data.recipes.isEmpty {
                VStack(alignment: .leading, spacing: 10) {
                    SectionHeader(lang == .spanish ? "Recetas de tu coach" : "Recipes from your coach")
                    if let s = data.suggestion, let r = data.recipes.first(where: { $0.id == s.recipeId }) {
                        Button { open = r } label: {
                            HStack(spacing: 10) {
                                AssistMark(size: 18)
                                Text(s.text).font(.archivo(13, .semibold)).foregroundStyle(Palette.assistInk).multilineTextAlignment(.leading)
                                Spacer(minLength: 0)
                            }
                            .padding(12)
                            .background(Palette.assistSoft, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                        }
                        .buttonStyle(.plain)
                    }
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 12) {
                            ForEach(data.recipes) { r in
                                Button { open = r } label: { tile(r, hide: data.hideNumbers ?? false) }.buttonStyle(.plain)
                            }
                        }
                        .padding(.vertical, 2)
                    }
                }
            }
        }
        .task { await load() }
        .sheet(item: $open) { r in
            RecipeDetailSheet(recipe: r, hideNumbers: data?.hideNumbers ?? false)
        }
    }

    private func tile(_ r: RecipeDTO, hide: Bool) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            RemotePhoto(path: r.imageUrl)
                .frame(width: 168, height: 118)
                .background(Palette.surface3)
                .clipped()
            VStack(alignment: .leading, spacing: 3) {
                Text(r.name).font(.archivo(13.5, .bold)).foregroundStyle(Palette.ink).lineLimit(2).fixedSize(horizontal: false, vertical: true)
                Text(meta(r, hide: hide)).font(.archivo(11.5)).foregroundStyle(Palette.muted).lineLimit(1)
            }
            .padding(10)
            .frame(width: 168, alignment: .leading)
        }
        .background(Palette.surface, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(Palette.line, lineWidth: 1))
    }

    private func meta(_ r: RecipeDTO, hide: Bool) -> String {
        var parts: [String] = []
        if !hide, let p = r.perServing?.proteinG { parts.append("\(Int(p.rounded())) g protein") }
        if let m = r.minutes { parts.append("\(m) min") }
        return parts.joined(separator: " · ")
    }

    @MainActor
    private func load() async {
        guard store.live else { data = RecipesResponse(recipes: Self.demo, suggestion: nil, hideNumbers: store.hideNumbers); return }
        data = try? await APIClient.shared.get("/api/me/recipes")
    }

    /// The demo's recipe book (the pictures come from OneJump's server).
    static let demo: [RecipeDTO] = [
        RecipeDTO(id: "demo-oats", name: "Protein overnight oats", servings: 1, minutes: 5, tags: ["breakfast"], imageUrl: "/img/food/bowl_with_spoon.png",
                  ingredients: [.init(name: "Rolled oats", grams: 50), .init(name: "Greek yogurt", grams: 150), .init(name: "Blueberries", grams: 60)],
                  steps: ["Stir everything in a jar.", "Leave it in the fridge overnight."], perServing: .init(calories: 420, proteinG: 32, carbsG: 55, fatG: 8)),
        RecipeDTO(id: "demo-chicken", name: "Chicken, rice and broccoli", servings: 2, minutes: 25, tags: ["lunch", "meal prep"], imageUrl: "/img/food/poultry_leg.png",
                  ingredients: [.init(name: "Chicken breast", grams: 300), .init(name: "Rice (dry)", grams: 120), .init(name: "Broccoli", grams: 200)],
                  steps: ["Cook the rice.", "Season and pan-cook the chicken, 6–7 minutes a side.", "Steam the broccoli and plate it up."], perServing: .init(calories: 520, proteinG: 48, carbsG: 52, fatG: 9)),
        RecipeDTO(id: "demo-salmon", name: "Salmon with sweet potato", servings: 2, minutes: 30, tags: ["dinner"], imageUrl: "/img/food/fish.png",
                  ingredients: [.init(name: "Salmon fillets", grams: 300), .init(name: "Sweet potato", grams: 400), .init(name: "Spinach", grams: 100)],
                  steps: ["Roast the sweet potato at 220 °C for 25 minutes.", "Add the salmon for the last 12 minutes.", "Serve on spinach."], perServing: .init(calories: 560, proteinG: 38, carbsG: 46, fatG: 22)),
        RecipeDTO(id: "demo-eggs", name: "Veggie egg scramble", servings: 1, minutes: 10, tags: ["breakfast"], imageUrl: "/img/food/egg.png",
                  ingredients: [.init(name: "Eggs", grams: 150), .init(name: "Peppers and spinach", grams: 100), .init(name: "Toast", grams: 40)],
                  steps: ["Soften the vegetables in a pan.", "Add the beaten eggs and stir until just set."], perServing: .init(calories: 360, proteinG: 24, carbsG: 22, fatG: 18)),
    ]
}

/// One recipe: photo, ingredients and steps.
struct RecipeDetailSheet: View {
    let recipe: RecipeDTO
    let hideNumbers: Bool
    @Environment(\.lang) private var lang
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    RemotePhoto(path: recipe.imageUrl)
                        .frame(height: 220).frame(maxWidth: .infinity).background(Palette.surface3).clipped()
                        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
                    Text(recipe.name).font(OJFont.h3).foregroundStyle(Palette.ink)
                    HStack(spacing: 8) {
                        if let m = recipe.minutes { Pill("\(m) min") }
                        Pill(lang == .spanish ? "\(recipe.servings) porciones" : "\(recipe.servings) servings")
                        if !hideNumbers, let p = recipe.perServing?.proteinG { Pill("\(Int(p.rounded())) g protein", tone: .good) }
                        if !hideNumbers, let k = recipe.perServing?.calories { Pill("\(Int(k.rounded())) kcal") }
                    }
                    SectionHeader(lang == .spanish ? "Ingredientes" : "Ingredients")
                    VStack(alignment: .leading, spacing: 6) {
                        ForEach(recipe.ingredients, id: \.self) { i in
                            HStack {
                                Text("•").foregroundStyle(Palette.green)
                                Text(i.name).font(OJFont.body).foregroundStyle(Palette.ink)
                                Spacer()
                                if let g = i.grams { Text("\(Int(g)) g").font(OJFont.sub).foregroundStyle(Palette.muted) }
                            }
                        }
                    }
                    .card(padding: 14)
                    SectionHeader(lang == .spanish ? "Pasos" : "Steps")
                    ForEach(Array(recipe.steps.enumerated()), id: \.offset) { pair in
                        HStack(alignment: .top, spacing: 10) {
                            Text("\(pair.offset + 1)").font(.archivo(12, .heavy)).foregroundStyle(Palette.bone)
                                .frame(width: 24, height: 24).background(Circle().fill(Palette.deep))
                            Text(pair.element).font(OJFont.body).foregroundStyle(Palette.ink).fixedSize(horizontal: false, vertical: true)
                        }
                    }
                }
                .padding(16)
            }
            .background(Palette.bg.ignoresSafeArea())
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button(lang == .spanish ? "Cerrar" : "Close") { dismiss() } } }
        }
    }
}
