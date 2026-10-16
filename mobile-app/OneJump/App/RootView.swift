import SwiftUI

/// Decides what opens: the coach's real account (signed in), the demo, or the login screen.
struct RootView: View {
    @Environment(AppSettings.self) private var settings

    var body: some View {
        Group {
            if settings.signedIn {
                CoachRootView(settings: settings, live: true)
            } else {
                switch settings.role {
                case .coach:
                    CoachRootView(settings: settings, live: false)
                case .client:
                    ClientRootView(settings: settings)
                case nil:
                    if settings.demo { AppPickerView() } else { LoginView() }
                }
            }
        }
        .animation(.easeInOut(duration: 0.25), value: settings.signedIn)
        .animation(.easeInOut(duration: 0.25), value: settings.role)
        .animation(.easeInOut(duration: 0.25), value: settings.demo)
        .onReceive(NotificationCenter.default.publisher(for: .ojLoggedOut)) { _ in
            // The session ended (14 days without opening the app, or logged out on the web).
            if settings.signedIn { settings.signOut() }
        }
    }
}

/// Coach login: email and password, then the 6-digit code if two-step login is on.
struct LoginView: View {
    @Environment(AppSettings.self) private var settings
    @Environment(\.lang) private var lang
    @State private var email = ""
    @State private var password = ""
    @State private var code = ""
    @State private var needsCode = false
    @State private var busy = false
    @State private var error: String?
    @FocusState private var focus: Field?

    private enum Field { case email, password, code }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                // No language switch here: the phone's language is used, and coaches change it in
                // Settings once signed in (same as the website).
                OneJumpWordmark(height: 26)
                    .padding(.top, 24)

                VStack(alignment: .leading, spacing: 8) {
                    Text(needsCode ? CL.codeTitle(lang) : CL.loginTitle(lang))
                        .font(OJFont.h1)
                        .tracking(-0.8)
                        .foregroundStyle(Palette.ink)
                    SubText(needsCode ? CL.codeSub(lang) : CL.loginSub(lang))
                }
                .padding(.top, 16)

                VStack(spacing: 12) {
                    if needsCode {
                        field(CL.code(lang)) {
                            TextField("123456", text: $code)
                                .keyboardType(.numberPad)
                                .textContentType(.oneTimeCode)
                                .focused($focus, equals: .code)
                        }
                    } else {
                        field(CL.email(lang)) {
                            TextField("you@example.com", text: $email)
                                .keyboardType(.emailAddress)
                                .textContentType(.username)
                                .textInputAutocapitalization(.never)
                                .autocorrectionDisabled()
                                .submitLabel(.next)
                                .focused($focus, equals: .email)
                                .onSubmit { focus = .password }
                        }
                        field(CL.password(lang)) {
                            SecureField("••••••••", text: $password)
                                .textContentType(.password)
                                .submitLabel(.go)
                                .focused($focus, equals: .password)
                                .onSubmit { submit() }
                        }
                    }
                }
                .card()

                if let error {
                    Label(error, systemImage: "exclamationmark.circle.fill")
                        .font(.archivo(14, .semibold))
                        .foregroundStyle(Palette.crit)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityAddTraits(.isStaticText)
                }

                Button(action: submit) {
                    HStack(spacing: 8) {
                        if busy { ProgressView().tint(Palette.onPrimary) }
                        Text(busy ? CL.loggingIn(lang) : (needsCode ? CL.verify(lang) : CL.logIn(lang)))
                    }
                }
                .buttonStyle(.oj(.primary, size: .large, fullWidth: true))
                .disabled(busy)

                if needsCode {
                    Button(CL.startOver(lang)) {
                        withAnimation(.snappy) { needsCode = false; code = ""; error = nil }
                    }
                    .buttonStyle(.oj(.ghost, fullWidth: true))
                }

                SubText(CL.clientsOnWeb(lang))
                    .padding(.top, 4)
                Link(CL.noAccount(lang), destination: URL(string: "https://onejumpfit.com/signup")!)
                    .font(.archivo(14, .semibold))
                    .foregroundStyle(Palette.link)

                Button {
                    settings.demo = true
                } label: {
                    HStack(spacing: 12) {
                        AssistTile()
                        TitleSub(CL.tryDemo(lang), sub: CL.tryDemoSub(lang))
                        Image(systemName: "chevron.right").foregroundStyle(Palette.muted)
                    }
                    .card()
                }
                .buttonStyle(.plain)
                .padding(.top, 8)
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 32)
            .frame(maxWidth: 520)
            .frame(maxWidth: .infinity)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(Palette.bg.ignoresSafeArea())
    }

    private func field<Content: View>(_ label: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Eyebrow(label)
            content()
                .font(.archivo(17))
                .padding(.horizontal, 14)
                .frame(height: 50)
                .background(Palette.surface2, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(Palette.line2, lineWidth: 1))
        }
    }

    private func submit() {
        guard !busy else { return }
        error = nil
        let cleanEmail = email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if needsCode {
            guard code.trimmingCharacters(in: .whitespaces).count >= 6 else { return }
        } else {
            guard !cleanEmail.isEmpty, !password.isEmpty else {
                error = CL.fillBoth(lang)
                return
            }
        }
        busy = true
        focus = nil
        Task { @MainActor in
            defer { busy = false }
            do {
                if needsCode {
                    try await APIClient.shared.logIn(code: code.trimmingCharacters(in: .whitespaces))
                } else if try await APIClient.shared.logIn(email: cleanEmail, password: password) {
                    withAnimation(.snappy) { needsCode = true }
                    focus = .code
                    return
                }
                let me = try await APIClient.shared.me()
                guard me.isCoach, let user = me.user else {
                    await APIClient.shared.logOut()
                    error = CL.clientsOnWeb(lang)
                    return
                }
                password = ""
                settings.signIn(name: user.name)
            } catch {
                self.error = (error as? LocalizedError)?.errorDescription ?? CL.somethingWrong(lang)
            }
        }
    }
}

/// The demo's first screen: pick which app to try.
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

                Button {
                    settings.exitDemo()
                } label: {
                    HStack(spacing: 12) {
                        IconTile(systemName: "person.crop.circle")
                        TitleSub(CL.exitDemo(lang), sub: CL.exitDemoSub(lang))
                    }
                    .card()
                }
                .buttonStyle(.plain)
                .padding(.top, 6)
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
