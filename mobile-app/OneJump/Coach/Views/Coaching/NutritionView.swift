import SwiftUI

/// Nutrition across all clients: who hits protein, how they log, habits and meal plans.
struct NutritionView: View {
    @Environment(CoachStore.self) private var store
    @Environment(\.lang) private var lang

    var body: some View {
        ScreenScroll {
            HStack(spacing: 10) {
                StatTile(value: "7", label: CT.onPlan(lang))
                StatTile(value: "84%", label: CT.avgProtein(lang))
                StatTile(value: "5", label: CT.loggedToday(lang))
            }
            AssistCard(label: CT.nutritionThisWeek(lang)) {
                DraftText(CT.nutritionBody(lang))
            }

            SectionHeader(CT.proteinGoal7(lang))
            ListCard {
                DividedRows(CoachData.nutrition) { row in
                    let c = store.client(row.clientID)
                    VStack(alignment: .leading, spacing: 8) {
                        HStack(spacing: 10) {
                            Avatar(initials: c.initials, color: c.avatarColor, size: 32)
                            Text(c.name).font(OJFont.title)
                            Spacer()
                            Pill(row.label(lang), tone: tone(for: row.percent))
                        }
                        ProgressBar(value: Double(max(3, row.percent)) / 100, tint: row.percent < 75 ? Palette.warn : Palette.chart)
                    }
                    .rowPadding()
                }
            }

            SectionHeader(CT.howClientsLog(lang), note: CT.photosThisWeek(lang))
            ListCard {
                DividedRows(CoachData.howClientsLog) { share in
                    HStack(spacing: 10) {
                        Text(share.title(lang)).font(.archivo(14, .semibold)).frame(width: 78, alignment: .leading)
                        ProgressBar(value: Double(share.percent) / 100)
                        Text("\(share.percent)%").font(OJFont.sub).foregroundStyle(Palette.muted).frame(width: 40, alignment: .trailing)
                    }
                    .rowPadding()
                }
            }

            SectionHeader(CT.habitCheckins(lang), note: CT.allClients(lang))
            ListCard {
                DividedRows(CoachData.habitShares) { share in
                    VStack(alignment: .leading, spacing: 8) {
                        HStack {
                            Text(share.title(lang)).font(OJFont.title)
                            Spacer()
                            SubText("\(share.percent)% \(CT.ofDays(lang))")
                        }
                        ProgressBar(value: Double(share.percent) / 100)
                    }
                    .rowPadding()
                }
            }

            SectionHeader(CT.mealPlans(lang), link: CT.newItem(lang)) {
                store.toast.show(CT.newMealPlanToast(lang))
            }
            ListCard {
                DividedRows(CoachData.mealPlans) { plan in
                    HStack(spacing: 12) {
                        IconTile(systemName: "fork.knife")
                        TitleSub(plan.name(lang), sub: plan.meta(lang))
                        Button(CT.assign(lang)) { store.toast.show(CT.pickClientFor(plan.shortName(lang))(lang)) }
                            .buttonStyle(.oj(.ghost, size: .small))
                    }
                    .rowPadding()
                }
            }
            SubText(CT.foodSources(lang))
                .frame(maxWidth: .infinity)
                .multilineTextAlignment(.center)
        }
        .ojNavigationTitle(CT.nutrition(lang))
    }

    private func tone(for percent: Int) -> Tone {
        if percent >= 85 { return .good }
        if percent >= 75 { return .info }
        if percent > 0 { return .warn }
        return .crit
    }
}

/// Automations: fixed reminders send themselves; anything Assist writes waits for you.
struct AutomationsView: View {
    @Environment(CoachStore.self) private var store
    @Environment(\.lang) private var lang

    var body: some View {
        ScreenScroll {
            AssistCard(label: CT.inControl(lang), systemImage: "checkmark.shield") {
                DraftText(CT.inControlBody(lang))
            }
            ListCard {
                DividedRows(CoachData.automations) { item in
                    OJToggle(title: item.name(lang), subtitle: item.detail(lang), isOn: binding(item.id))
                        .rowPadding()
                }
            }
            Button {
                store.toast.show(CT.newAutomationToast(lang))
            } label: {
                Label(CT.newAutomation(lang), systemImage: "plus")
            }
            .buttonStyle(.oj(.ghost, fullWidth: true))

            SectionHeader(CT.recentRuns(lang))
            ListCard {
                DividedRows(CoachData.automationRuns) { run in
                    HStack(alignment: .top, spacing: 10) {
                        Text(run.date(lang)).font(.archivo(12, .bold)).foregroundStyle(Palette.muted).frame(width: 40, alignment: .leading)
                        Text(run.text(lang)).font(.archivo(14)).fixedSize(horizontal: false, vertical: true)
                        Spacer(minLength: 0)
                    }
                    .rowPadding()
                }
            }
        }
        .ojNavigationTitle(CT.automations(lang))
    }

    private func binding(_ id: String) -> Binding<Bool> {
        Binding(
            get: { store.automations[id] ?? false },
            set: { store.automations[id] = $0 }
        )
    }
}
