import SwiftUI

/// More: everything else, grouped into Coaching, Business and Account.
struct MoreView: View {
    @Environment(CoachStore.self) private var store
    @Environment(\.lang) private var lang

    private struct Item: Identifiable {
        let id = UUID()
        let title: String
        let sub: String
        let systemImage: String?
        var assist = false
        var badge = 0
        let action: () -> Void
    }

    var body: some View {
        ScreenScroll {
            HStack {
                OneJumpWordmark(height: 22)
                Spacer()
                LanguageToggleButton(current: store.lang) {
                    store.setLanguage(store.lang == .english ? .spanish : .english)
                }
                ThemeToggleButton()
            }
            .padding(.top, 8)

            Button {
                store.push(.settings)
            } label: {
                HStack(spacing: 12) {
                    Avatar(initials: store.me.initials, color: Palette.volt)
                    TitleSub(store.me.name, sub: store.live ? store.me.business : CT.profileSub(lang))
                    Image(systemName: "chevron.right").foregroundStyle(Palette.muted)
                }
                .card()
            }
            .buttonStyle(.plain)

            group(CT.groupCoaching(lang), coachingItems)
            group(CT.groupBusiness(lang), businessItems)
            group(CT.groupAccount(lang), accountItems)
        }
        .toolbar(.hidden, for: .navigationBar)
    }

    private var coachingItems: [Item] {
        [
            Item(title: CT.programsAndWorkouts(lang), sub: CT.programsSub(lang), systemImage: "square.stack.3d.up") { store.push(.programs) },
            Item(title: CT.library(lang), sub: CT.librarySub(lang), systemImage: "list.bullet") { store.push(.library) },
            Item(title: CT.nutrition(lang), sub: CT.nutritionSub(lang), systemImage: "fork.knife") { store.push(.nutrition) },
            Item(title: CT.checkIns(lang), sub: CT.checkInsSub(store.openCheckInCount)(lang), systemImage: "list.clipboard", badge: store.openCheckInCount) {
                store.openInbox(.checkIns)
            }
        ]
    }

    private var businessItems: [Item] {
        [
            Item(title: CT.payments(lang), sub: CT.paymentsSub(lang), systemImage: "creditcard") { store.push(.payments) },
            Item(title: CT.leads(lang), sub: CT.leadsSub(store.newLeadCount)(lang), systemImage: "line.3.horizontal.decrease.circle", badge: store.newLeadCount) {
                store.push(.leads)
            },
            Item(title: CT.automations(lang), sub: CT.automationsSub(lang), systemImage: nil, assist: true) { store.push(.automations) },
            Item(title: CT.bookingPageRow(lang), sub: store.bookingLink.replacingOccurrences(of: "https://", with: ""), systemImage: "link") { store.copyBookingLink() }
        ]
    }

    private var accountItems: [Item] {
        [
            Item(title: CT.settings(lang), sub: CT.settingsSub(lang), systemImage: "slider.horizontal.3") { store.push(.settings) },
            Item(title: CT.planBilling(lang), sub: store.live ? CL.planLine(store.me.planLabel, store.me.trialDaysLeft)(lang) : CT.trial11(lang), systemImage: "doc.text") { store.push(.billing) },
            Item(title: CT.help(lang), sub: CT.helpSub(lang), systemImage: "questionmark.circle") { store.toast.show(CT.helpToast(lang)) }
        ]
    }

    private func group(_ title: String, _ items: [Item]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Eyebrow(title).padding(.leading, 4).padding(.top, 4)
            ListCard {
                DividedRows(items) { item in
                    Button(action: item.action) {
                        HStack(spacing: 12) {
                            if let icon = item.systemImage {
                                IconTile(systemName: icon)
                            } else {
                                AssistTile()
                            }
                            TitleSub(item.title, sub: item.sub)
                            if item.badge > 0 { CountBadge(count: item.badge) }
                            Image(systemName: "chevron.right")
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundStyle(Palette.muted)
                        }
                        .rowPadding()
                    }
                    .buttonStyle(.row)
                }
            }
        }
    }
}
