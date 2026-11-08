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

            if let targets = store.targets {
                HStack(spacing: 16) {
                    CalorieRing(eaten: totals.kcal, target: targets.kcal)
                    VStack(alignment: .leading, spacing: 10) {
                        macroRow(CLT.protein(lang), totals.protein, targets.protein, Palette.progressGreen)
                        macroRow(CLT.carbs(lang), totals.carbs, targets.carbs, Palette.green)
                        macroRow(CLT.fat(lang), totals.fat, targets.fat, Color(hex: 0xC9A227))
                    }
                }
                .card()
            } else if store.live {
                HStack(alignment: .top, spacing: 12) {
                    IconTile(systemName: "fork.knife", tone: .assist)
                    VStack(alignment: .leading, spacing: 4) {
                        Text(CLT.foodsCount(totals.count)(lang)).font(OJFont.title)
                        SubText(store.nutritionNote ?? (store.hideNumbers ? CLT.numbersHidden(lang) : ""))
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .card()
            }
            if store.live, store.targets != nil, let note = store.nutritionNote, !note.isEmpty {
                HStack(alignment: .top, spacing: 10) {
                    Avatar(initials: store.coachPerson.initials, color: Palette.volt, size: 28, photoURL: store.coachPerson.photoURL)
                    Text(note).font(.archivo(14)).foregroundStyle(Palette.ink).fixedSize(horizontal: false, vertical: true)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .card(padding: 12, background: Palette.surface2)
            }

            HStack(spacing: 10) {
                if store.photoLogging {
                    method(CLT.methodPhoto(lang), "camera") { store.openLogger(.photo) }
                }
                if store.voiceLogging {
                    method(CLT.sayIt(lang), "mic") { store.openLogger(.voice) }
                }
                method(CLT.methodBarcode(lang), "barcode.viewfinder") { store.openLogger(.barcode) }
                method(CLT.methodSearch(lang), "magnifyingglass") { store.openLogger(.search) }
            }

            ForEach(Meal.allCases, id: \.self) { meal in
                mealCard(meal, items: meals[meal] ?? [])
            }

            if !store.favoriteFoods.isEmpty {
                SectionHeader(CLT.quickAdd(lang), note: CLT.yourFavorites(lang))
                ChipScroller {
                    ForEach(store.favoriteFoods) { food in
                        Chip(label: food.name(lang), systemImage: "plus") { store.addFavorite(food) }
                    }
                }
            }
            SubText(CLT.dataSources(lang))
                .frame(maxWidth: .infinity)
                .multilineTextAlignment(.center)
        }
        .toolbar(.hidden, for: .navigationBar)
        .refreshable { if store.live { await store.loadLive() } }
    }

    private func macroRow(_ label: String, _ now: Double, _ target: Double, _ color: Color) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(label).font(.archivo(13, .semibold))
                Spacer()
                SubText("\(Int(now.rounded())) / \(Int(target)) g")
            }
            ProgressBar(value: target > 0 ? now / target : 0, tint: color, height: 7)
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
                if !items.isEmpty && !store.hideNumbers {
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
                        if !store.hideNumbers {
                            VStack(alignment: .trailing, spacing: 2) {
                                Text("\(Fmt.grouped(Int(item.kcal.rounded()))) kcal").font(.archivo(13, .semibold))
                                SubText(CLT.gramsProtein(Int(item.protein.rounded()))(lang))
                            }
                        }
                        if store.live && item.entryID != nil && store.foodDay == .today {
                            Menu {
                                Button(role: .destructive) { store.deleteFood(item) } label: {
                                    Label(CLT.removeFood(lang), systemImage: "trash")
                                }
                            } label: {
                                Image(systemName: "ellipsis")
                                    .font(.system(size: 14, weight: .semibold))
                                    .foregroundStyle(Palette.muted)
                                    .frame(width: 32, height: 32)
                            }
                            .accessibilityLabel(CLT.removeFood(lang))
                        }
                    }
                    .padding(.vertical, 8)
                }
            }
        }
        .card(padding: 14)
    }
}
