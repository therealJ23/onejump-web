import SwiftUI

/// The client's profile and settings: language first, then plan, booking, appearance,
/// reminders, units and privacy.
struct MeView: View {
    @Environment(ClientStore.self) private var store
    @Environment(AppSettings.self) private var settings
    @Environment(\.lang) private var lang

    var body: some View {
        @Bindable var store = store
        @Bindable var settings = settings

        ScreenScroll(spacing: 14) {
            VStack(spacing: 8) {
                Avatar(initials: "MC", color: Color(hex: 0xCFE0C3), size: 84)
                    .overlay(Circle().stroke(Palette.surface, lineWidth: 5))
                    .shadow(color: Palette.shadow, radius: 8)
                Text("Maya Chen").font(OJFont.h3).foregroundStyle(Palette.ink)
                SubText(CLT.goalLine2(lang)).multilineTextAlignment(.center)
            }
            .frame(maxWidth: .infinity)

            section(SharedText.language(lang))
            ListCard {
                LanguageList(current: store.lang, fullNote: CLT.languageFull(lang), partialNote: CLT.languageMessages(lang)) {
                    store.setLanguage($0)
                }
            }
            SubText(CLT.languageNote(lang)).padding(.horizontal, 4)

            section(CLT.planBilling(lang))
            ListCard {
                HStack(spacing: 12) {
                    IconTile(systemName: "creditcard")
                    TitleSub(CLT.planLine(lang), sub: CLT.paidLine(lang))
                }
                .rowPadding()
                RowDivider()
                HStack(spacing: 8) {
                    Button(CLT.updateCard(lang)) { store.toast.show(CLT.stripePage(lang)) }
                        .buttonStyle(.oj(.ghost, size: .small, fullWidth: true))
                    Button(CLT.invoices(lang)) { store.toast.show(CLT.invoiceToast(lang)) }
                        .buttonStyle(.oj(.ghost, size: .small, fullWidth: true))
                }
                .rowPadding()
            }

            Button { store.push(.book) } label: {
                HStack(spacing: 12) {
                    IconTile(systemName: "calendar")
                    TitleSub(CLT.bookOrMove(lang), sub: store.slotLabel(store.booked))
                    Image(systemName: "chevron.right").foregroundStyle(Palette.muted)
                }
                .card()
            }
            .buttonStyle(.plain)

            section(SharedText.appearance(lang))
            AppearancePicker(appearance: $settings.appearance)

            section(CLT.reminders(lang))
            ListCard {
                DividedRows(ClientData.reminders) { reminder in
                    OJToggle(title: reminder.name(lang), subtitle: reminder.detail(lang), isOn: reminderBinding(reminder.id))
                        .rowPadding()
                }
            }

            section(CLT.units(lang))
            SegmentedBar(
                options: [
                    SegmentOption(value: Units.pounds, label: CLT.poundsInches(lang)),
                    SegmentOption(value: Units.kilograms, label: CLT.kilogramsCm(lang))
                ],
                selection: $store.units
            )

            section(CLT.privacy(lang))
            ListCard {
                HStack(spacing: 12) {
                    IconTile(systemName: "lock")
                    TitleSub(CLT.photosPrivate(lang), sub: CLT.photosPrivateSub(lang))
                }
                .rowPadding()
                RowDivider()
                HStack(spacing: 8) {
                    Button(CLT.downloadData(lang)) { store.toast.show(CLT.exportToast(lang)) }
                        .buttonStyle(.oj(.ghost, size: .small, fullWidth: true))
                    Button(CLT.deleteAccount(lang)) { store.toast.show(CLT.deleteToast(lang)) }
                        .buttonStyle(.oj(.danger, size: .small, fullWidth: true))
                }
                .rowPadding()
            }

            Button {
                if settings.signedIn { settings.clientPreview = false } else { settings.role = nil }
            } label: {
                HStack(spacing: 12) {
                    IconTile(systemName: "arrow.left.arrow.right")
                    if settings.signedIn {
                        TitleSub(SharedText.backToCoach(lang), sub: SharedText.backToCoachSub(lang))
                    } else {
                        TitleSub(SharedText.switchApp(lang), sub: SharedText.switchAppSub(lang))
                    }
                }
                .card()
            }
            .buttonStyle(.plain)

            Button(CLT.logOut(lang)) { store.toast.show(CLT.logoutToast(lang)) }
                .buttonStyle(.oj(.ghost, fullWidth: true))
        }
        .ojNavigationTitle(CLT.you(lang))
        .toolbar(.hidden, for: .tabBar)
    }

    private func section(_ title: String) -> some View {
        Eyebrow(title).padding(.leading, 4).padding(.top, 6)
    }

    private func reminderBinding(_ id: String) -> Binding<Bool> {
        Binding(
            get: { store.reminders[id] ?? false },
            set: { store.reminders[id] = $0 }
        )
    }
}
