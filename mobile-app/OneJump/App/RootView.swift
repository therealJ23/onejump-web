import SwiftUI

/// Shows the coach app or the client app.
///
/// For this preview there is a picker. In the real app, logging in decides which one
/// opens: coaches get the coach app, clients get the client app.
struct RootView: View {
    @Environment(AppSettings.self) private var settings

    var body: some View {
        Group {
            switch settings.role {
            case .coach:
                CoachRootView(settings: settings)
            case .client:
                ClientRootView(settings: settings)
            case nil:
                AppPickerView()
            }
        }
        .animation(.easeInOut(duration: 0.25), value: settings.role)
    }
}

/// The first screen of the preview: pick which app to try.
struct AppPickerView: View {
    @Environment(AppSettings.self) private var settings
    @Environment(\.lang) private var lang

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                HStack {
                    OneJumpWordmark(height: 26)
                    Spacer()
                    languageButton
                }
                .padding(.top, 24)

                VStack(alignment: .leading, spacing: 8) {
                    Text(SharedText.previewTitle(lang))
                        .font(OJFont.h1)
                        .tracking(-0.8)
                        .foregroundStyle(Palette.ink)
                    SubText(SharedText.previewSub(lang))
                }
                .padding(.top, 20)

                appButton(
                    title: SharedText.coachApp(lang),
                    sub: SharedText.coachAppSub(lang),
                    hero: true
                ) { settings.role = .coach }

                appButton(
                    title: SharedText.clientApp(lang),
                    sub: SharedText.clientAppSub(lang),
                    hero: false
                ) { settings.role = .client }

                Eyebrow(SharedText.appearance(lang))
                    .padding(.top, 10)
                AppearancePicker(appearance: Bindable(settings).appearance)
            }
            .padding(.horizontal, 20)
            .frame(maxWidth: 560)
            .frame(maxWidth: .infinity)
        }
        .background(Palette.bg.ignoresSafeArea())
    }

    private var languageButton: some View {
        Button {
            settings.language = settings.language == .english ? .spanish : .english
        } label: {
            Text(settings.language.code)
                .font(.archivo(13, .heavy))
                .foregroundStyle(Palette.ink)
                .frame(width: 44, height: 44)
                .background(Palette.surface, in: Circle())
                .overlay(Circle().strokeBorder(Palette.line, lineWidth: 1))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(SharedText.language(lang))
    }

    private func appButton(title: String, sub: String, hero: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 14) {
                if hero {
                    AssistMark(size: 30, color: Palette.volt)
                        .frame(width: 52, height: 52)
                        .background(Color.white.opacity(0.1), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                } else {
                    Image(systemName: "figure.strengthtraining.traditional")
                        .font(.system(size: 22, weight: .semibold))
                        .foregroundStyle(Palette.ink)
                        .frame(width: 52, height: 52)
                        .background(Palette.surface2, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                }
                VStack(alignment: .leading, spacing: 4) {
                    Text(title).font(.archivo(20, .bold))
                    Text(sub).font(OJFont.sub).opacity(0.75)
                }
                Spacer()
                Image(systemName: "chevron.right").font(.system(size: 15, weight: .semibold)).opacity(0.6)
            }
            .foregroundStyle(hero ? Palette.bone : Palette.ink)
            .padding(18)
            .background(hero ? Palette.hero : Palette.surface, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).strokeBorder(hero ? Color.clear : Palette.line, lineWidth: 1))
            .shadow(color: Palette.shadow.opacity(0.5), radius: 14, x: 0, y: 8)
        }
        .buttonStyle(.plain)
    }
}
