import PhotosUI
import SwiftUI

/// The client's profile and settings: language first, then plan, booking, appearance,
/// reminders, units and privacy.
struct MeView: View {
    @Environment(ClientStore.self) private var store
    @Environment(AppSettings.self) private var settings
    @Environment(\.lang) private var lang
    @Environment(\.openURL) private var openURL
    @State private var photoPick: PhotosPickerItem?
    @State private var exportFile: URL?
    @State private var exporting = false
    @State private var confirmDelete = false
    @State private var deleteText = ""
    @State private var deleting = false

    var body: some View {
        @Bindable var store = store
        @Bindable var settings = settings

        ScreenScroll(spacing: 14) {
            VStack(spacing: 8) {
                Avatar(initials: store.mePerson.initials, color: Color(hex: 0xCFE0C3), size: 84,
                       photoURL: store.mePerson.photoURL, localImage: store.pendingProfilePhoto)
                    .overlay {
                        if store.uploadingPhoto {
                            Circle().fill(Color.black.opacity(0.35))
                            ProgressView().tint(.white)
                        }
                    }
                    .overlay(Circle().stroke(Palette.surface, lineWidth: 5))
                    .shadow(color: Palette.shadow, radius: 8)
                Text(store.mePerson.name).font(OJFont.h3).foregroundStyle(Palette.ink)
                SubText(store.goalText(lang)).multilineTextAlignment(.center)
                if store.live {
                    HStack(spacing: 8) {
                        PhotosPicker(selection: $photoPick, matching: .images) {
                            Label(store.mePerson.photoURL == nil ? CLT.addPhoto(lang) : CLT.changePhoto(lang), systemImage: "camera")
                        }
                        .buttonStyle(.oj(.ghost, size: .small))
                        .disabled(store.uploadingPhoto)
                        if store.mePerson.photoURL != nil {
                            Button(CLT.removePhoto(lang)) { store.removeProfilePhoto() }
                                .buttonStyle(.oj(.ghost, size: .small))
                                .disabled(store.uploadingPhoto)
                        }
                    }
                    .padding(.top, 4)
                }
            }
            .frame(maxWidth: .infinity)
            .onChange(of: photoPick) { _, item in
                guard let item else { return }
                Task { @MainActor in
                    defer { photoPick = nil }
                    guard let data = try? await item.loadTransferable(type: Data.self), let image = UIImage(data: data) else {
                        store.toast.show(CLT.photoUnreadable(lang))
                        return
                    }
                    store.changeProfilePhoto(image)
                }
            }

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
                    TitleSub(store.planLine(lang), sub: store.paidLine(lang))
                }
                .rowPadding()
                RowDivider()
                if store.live {
                    Button(CLT.manageBilling(lang)) {
                        if let url = URL(string: "/client/me", relativeTo: APIClient.shared.baseURL) { openURL(url) }
                    }
                    .buttonStyle(.oj(.ghost, size: .small, fullWidth: true))
                    .rowPadding()
                } else {
                    HStack(spacing: 8) {
                        Button(CLT.updateCard(lang)) { store.toast.show(CLT.stripePage(lang)) }
                            .buttonStyle(.oj(.ghost, size: .small, fullWidth: true))
                        Button(CLT.invoices(lang)) { store.toast.show(CLT.invoiceToast(lang)) }
                            .buttonStyle(.oj(.ghost, size: .small, fullWidth: true))
                    }
                    .rowPadding()
                }
            }

            if !store.live {
                Button { store.push(.book) } label: {
                    HStack(spacing: 12) {
                        IconTile(systemName: "calendar")
                        TitleSub(CLT.bookOrMove(lang), sub: store.slotLabel(store.booked))
                        Image(systemName: "chevron.right").foregroundStyle(Palette.muted)
                    }
                    .card()
                }
                .buttonStyle(.plain)
            }

            section(SharedText.appearance(lang))
            AppearancePicker(appearance: $settings.appearance)

            if !store.live {
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
            }

            section(CLT.privacy(lang))
            ListCard {
                HStack(spacing: 12) {
                    IconTile(systemName: "lock")
                    TitleSub(CLT.photosPrivate(lang), sub: store.live ? CLT.onlyYouAnd(store.coachPerson.first)(lang) : CLT.photosPrivateSub(lang))
                }
                .rowPadding()
                RowDivider()
                HStack(spacing: 8) {
                    if store.live, let exportFile {
                        ShareLink(item: exportFile) {
                            Label(CLT.downloadReady(lang), systemImage: "square.and.arrow.up")
                        }
                        .buttonStyle(.oj(.ghost, size: .small, fullWidth: true))
                    } else {
                        Button {
                            guard store.live else {
                                store.toast.show(CLT.exportToast(lang))
                                return
                            }
                            guard !exporting else { return }
                            exporting = true
                            Task { @MainActor in
                                exportFile = await store.exportData()
                                exporting = false
                            }
                        } label: {
                            HStack(spacing: 6) {
                                if exporting { ProgressView() }
                                Text(CLT.downloadData(lang))
                            }
                        }
                        .buttonStyle(.oj(.ghost, size: .small, fullWidth: true))
                    }
                    Button(CLT.deleteAccount(lang)) {
                        if store.live {
                            deleteText = ""
                            confirmDelete = true
                        } else {
                            store.toast.show(CLT.deleteToast(lang))
                        }
                    }
                    .buttonStyle(.oj(.danger, size: .small, fullWidth: true))
                    .disabled(deleting)
                }
                .rowPadding()
            }

            if !store.live {
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
            }

            Button(CLT.logOut(lang)) {
                if store.live {
                    Task { await store.logOut() }
                } else {
                    store.toast.show(CLT.logoutToast(lang))
                }
            }
            .buttonStyle(.oj(.ghost, fullWidth: true))
        }
        .ojNavigationTitle(CLT.you(lang))
        .toolbar(.hidden, for: .tabBar)
        .alert(CLT.deleteTitle(lang), isPresented: $confirmDelete) {
            TextField(CLT.typeDelete(lang), text: $deleteText)
                .textInputAutocapitalization(.characters)
                .autocorrectionDisabled()
            Button(CLT.cancel(lang), role: .cancel) {}
            Button(CLT.deleteForGood(lang), role: .destructive) {
                guard deleteText.trimmingCharacters(in: .whitespaces).uppercased() == "DELETE" else {
                    store.toast.show(CLT.typeDelete(lang))
                    return
                }
                deleting = true
                Task { @MainActor in
                    _ = await store.deleteAccount()
                    deleting = false
                }
            }
        } message: {
            Text(CLT.deleteBody(store.coachPerson.first.isEmpty ? CLT.yourCoach(lang).lowercased() : store.coachPerson.first)(lang))
        }
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
