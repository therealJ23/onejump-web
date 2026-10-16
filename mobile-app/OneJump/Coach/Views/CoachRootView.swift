import SwiftUI

/// The coach app: five tabs, each with its own navigation stack.
struct CoachRootView: View {
    @State private var store: CoachStore
    @Environment(\.lang) private var lang
    @Environment(\.scenePhase) private var scenePhase

    init(settings: AppSettings, live: Bool = false) {
        if live {
            // Assist speaks with the server's voice (Elise); the phone's voice is the fallback.
            settings.voice.remoteVoice = { text, language in
                try? await APIClient.shared.postForData("/api/voice/speak", ["text": String(text.prefix(1000)), "lang": language == .spanish ? "es" : "en"])
            }
        } else {
            settings.voice.remoteVoice = nil
        }
        _store = State(initialValue: CoachStore(settings: settings, live: live))
    }

    var body: some View {
        Group {
            switch store.loadState {
            case .ready: tabs
            case .loading: LoadingBusinessView()
            case .failed(let message): LoadFailedView(message: message)
            }
        }
        .environment(store)
        .task {
            if store.live && store.loadState == .loading { await store.refresh() }
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { Task { await store.refreshIfStale() } }
        }
    }

    private var tabs: some View {
        TabView(selection: $store.tab) {
            NavigationStack(path: $store.todayPath) {
                TodayView().coachDestinations()
            }
            .tabItem { Label(CT.today(lang), systemImage: "house") }
            .badge(store.pendingQueue.count)
            .tag(CoachTab.today)

            NavigationStack(path: $store.clientsPath) {
                ClientsView().coachDestinations()
            }
            .tabItem { Label(CT.clients(lang), systemImage: "person.2") }
            .tag(CoachTab.clients)

            NavigationStack(path: $store.assistPath) {
                AssistView().coachDestinations()
            }
            .tabItem {
                Label {
                    Text(CT.assist(lang))
                } icon: {
                    Image("AssistTab")
                }
            }
            .tag(CoachTab.assist)

            NavigationStack(path: $store.inboxPath) {
                InboxView().coachDestinations()
            }
            .tabItem { Label(CT.inbox(lang), systemImage: "bubble.left.and.bubble.right") }
            .badge(store.unreadCount + store.openCheckInCount)
            .tag(CoachTab.inbox)

            NavigationStack(path: $store.morePath) {
                MoreView().coachDestinations()
            }
            .tabItem { Label(CT.more(lang), systemImage: "square.grid.2x2") }
            .tag(CoachTab.more)
        }
        .toastOverlay(store.toast)
        .sheet(isPresented: $store.showAddClient) {
            AddClientSheet()
                .environment(store)
        }
        .onChange(of: store.tab) { _, newTab in
            if newTab != .assist, store.listenMode != nil {
                store.voice.stopListening()
                store.listenMode = nil
            }
        }
    }
}

/// While the coach's business loads (first launch after logging in).
private struct LoadingBusinessView: View {
    @Environment(CoachStore.self) private var store
    @Environment(\.lang) private var lang

    var body: some View {
        VStack(spacing: 18) {
            Spacer()
            VoiceOrb(active: true, size: 96)
            Text(CL.loadingBusiness(lang))
                .font(OJFont.title)
                .foregroundStyle(Palette.ink)
            if !store.me.first.isEmpty {
                SubText(CL.helloName(store.me.first)(lang))
            }
            Spacer()
        }
        .frame(maxWidth: .infinity)
        .background(Palette.bg.ignoresSafeArea())
    }
}

/// The business couldn't load (offline, server down): try again, or log out.
private struct LoadFailedView: View {
    let message: String
    @Environment(CoachStore.self) private var store
    @Environment(\.lang) private var lang

    var body: some View {
        VStack(spacing: 14) {
            Spacer()
            Image(systemName: "wifi.exclamationmark")
                .font(.system(size: 34, weight: .semibold))
                .foregroundStyle(Palette.muted)
            Text(CL.couldntLoad(lang)).font(OJFont.h3).foregroundStyle(Palette.ink)
            SubText(message).multilineTextAlignment(.center).frame(maxWidth: 320)
            Button(CL.tryAgain(lang)) {
                store.loadState = .loading
                Task { await store.refresh() }
            }
            .buttonStyle(.oj(.primary))
            Button(CL.logOut(lang)) { Task { await store.logOut() } }
                .buttonStyle(.oj(.ghost))
            Spacer()
        }
        .padding(24)
        .frame(maxWidth: .infinity)
        .background(Palette.bg.ignoresSafeArea())
    }
}

// MARK: - Routing

extension View {
    /// Every screen a coach tab can open.
    func coachDestinations() -> some View {
        navigationDestination(for: CoachRoute.self) { route in
            CoachDestination(route: route)
        }
    }
}

private struct CoachDestination: View {
    let route: CoachRoute

    var body: some View {
        switch route {
        case .client(let id): ClientDetailView(clientID: id)
        case .thread(let id): ThreadView(threadID: id)
        case .checkIn(let id): CheckInReviewView(checkInID: id)
        case .payments: PaymentsView()
        case .leads: LeadsView()
        case .programs: ProgramsView()
        case .program(let id): ProgramDetailView(programID: id)
        case .workoutBuilder: WorkoutBuilderView()
        case .library: ExerciseLibraryView()
        case .exercise(let id): ExerciseDetailView(exerciseID: id)
        case .nutrition: NutritionView()
        case .automations: AutomationsView()
        case .settings: CoachSettingsView()
        case .billing: BillingView()
        }
    }
}
