import SwiftUI

/// Food: today's calories and macros, four ways to log, meals and favorites.
struct FoodView: View {
    @Environment(ClientStore.self) private var store
    @Environment(\.lang) private var lang

    var body: some View {
        @Bindable var store = store
        let meals = store.meals(for: store.foodDay)
        let totals = store.totals(for: store.foodDay)

        ScreenScroll {
            ScreenHeader(eyebrow: CLT.foodEyebrow(lang), title: CLT.food(lang))
            SegmentedBar(
                options: [
                    SegmentOption(value: FoodDay.yesterday, label: CLT.yesterday(lang)),
                    SegmentOption(value: FoodDay.today, label: CLT.todayShort(lang))
                ],
                selection: $store.foodDay
            )

            HStack(spacing: 16) {
                CalorieRing(eaten: totals.kcal, target: ClientData.kcalTarget)
                VStack(alignment: .leading, spacing: 10) {
                    macroRow(CLT.protein(lang), totals.protein, ClientData.proteinTarget, Palette.progressGreen)
                    macroRow(CLT.carbs(lang), totals.carbs, ClientData.carbsTarget, Palette.green)
                    macroRow(CLT.fat(lang), totals.fat, ClientData.fatTarget, Color(hex: 0xC9A227))
                }
            }
            .card()

            HStack(spacing: 10) {
                method(CLT.methodPhoto(lang), "camera") { store.openLogger(.photo) }
                method(CLT.sayIt(lang), "mic") { store.openLogger(.voice) }
                method(CLT.methodBarcode(lang), "barcode.viewfinder") { store.openLogger(.barcode) }
                method(CLT.methodSearch(lang), "magnifyingglass") { store.openLogger(.search) }
            }

            ForEach(Meal.allCases, id: \.self) { meal in
                mealCard(meal, items: meals[meal] ?? [])
            }

            SectionHeader(CLT.quickAdd(lang), note: CLT.yourFavorites(lang))
            ChipScroller {
                ForEach(ClientData.favorites) { food in
                    Chip(label: food.name(lang), systemImage: "plus") { store.addFavorite(food) }
                }
            }
            SubText(CLT.dataSources(lang))
                .frame(maxWidth: .infinity)
                .multilineTextAlignment(.center)
        }
        .toolbar(.hidden, for: .navigationBar)
    }

    private func macroRow(_ label: String, _ now: Double, _ target: Double, _ color: Color) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(label).font(.archivo(13, .semibold))
                Spacer()
                SubText("\(Int(now.rounded())) / \(Int(target)) g")
            }
            ProgressBar(value: now / target, tint: color, height: 7)
        }
    }

    private func method(_ title: String, _ icon: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 7) {
                IconTile(systemName: icon, tone: .assist, size: 38)
                Text(title).font(.archivo(13, .semibold)).foregroundStyle(Palette.ink).lineLimit(1).minimumScaleFactor(0.8)
            }
            .frame(maxWidth: .infinity)
            .frame(height: 86)
            .background(Palette.surface, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(Palette.line, lineWidth: 1))
        }
        .buttonStyle(.plain)
    }

    private func mealCard(_ meal: Meal, items: [FoodItem]) -> some View {
        let kcal = items.reduce(0.0) { $0 + $1.kcal }
        return VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(meal.name(lang)).font(OJFont.title)
                Spacer()
                if !items.isEmpty {
                    SubText("\(Fmt.grouped(Int(kcal.rounded()))) kcal")
                }
                CircleIconButton(systemName: "plus", label: CLT.addTo(meal.name(lang).lowercased())(lang), size: 34, style: .soft) {
                    store.openLogger(.search, meal: meal)
                }
            }
            if items.isEmpty {
                SubText(CLT.nothingYet(lang))
            } else {
                DividedRows(items) { item in
                    HStack {
                        TitleSub(item.name(lang), sub: item.quantity(lang))
                        VStack(alignment: .trailing, spacing: 2) {
                            Text("\(Fmt.grouped(Int(item.kcal.rounded()))) kcal").font(.archivo(13, .semibold))
                            SubText(CLT.gramsProtein(Int(item.protein.rounded()))(lang))
                        }
                    }
                    .padding(.vertical, 8)
                }
            }
        }
        .card(padding: 14)
    }
}
