import SwiftUI

/// The client app: Today, Food, a center "+" to log anything, Progress and Coach.
struct ClientRootView: View {
    @State private var store: ClientStore
    @Environment(\.lang) private var lang
    @Environment(\.scenePhase) private var scenePhase

    init(settings: AppSettings, live: Bool = false) {
        _store = State(initialValue: ClientStore(settings: settings, live: live))
    }

    var body: some View {
        Group {
            if store.live && !store.loaded {
                LiveLoadingView()
            } else {
                tabs
            }
        }
        .environment(store)
        .task {
            guard store.live else { return }
            await store.loadLive()
        }
        .onChange(of: scenePhase) { _, phase in
            // Back in the app: pick up anything the coach changed.
            if phase == .active, store.live, store.loaded { Task { await store.loadLive() } }
        }
        .task(id: store.live && store.tab == .coach) {
            // While the chat is open, check for new messages every 20 seconds.
            guard store.live && store.tab == .coach else { return }
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 20_000_000_000)
                if Task.isCancelled { break }
                await store.refreshThread()
            }
        }
    }

    private var tabs: some View {
        TabView(selection: tabSelection) {
            NavigationStack(path: $store.todayPath) {
                ClientTodayView().clientDestinations()
            }
            .tabItem { Label(CLT.today(lang), systemImage: "house") }
            .tag(ClientTab.today)

            NavigationStack(path: $store.foodPath) {
                FoodView().clientDestinations()
            }
            .tabItem { Label(CLT.food(lang), systemImage: "fork.knife") }
            .tag(ClientTab.food)

            // The middle tab never opens a page: it shows the quick-log sheet.
            Color.clear
                .tabItem { Label(CLT.log(lang), systemImage: "plus.circle.fill") }
                .tag(ClientTab.log)

            NavigationStack(path: $store.progressPath) {
                ProgressScreen().clientDestinations()
            }
            .tabItem { Label(CLT.progress(lang), systemImage: "chart.line.uptrend.xyaxis") }
            .tag(ClientTab.progress)

            NavigationStack(path: $store.coachPath) {
                CoachChatView().clientDestinations()
            }
            .tabItem { Label(CLT.coach(lang), systemImage: "message") }
            .badge(store.readCoach ? 0 : 1)
            .tag(ClientTab.coach)
        }
        .environment(store)
        .toastOverlay(store.toast)
        .sheet(isPresented: $store.showQuickLog) {
            QuickLogSheet()
                .environment(store)
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
        }
        .sheet(isPresented: $store.showWeightSheet) {
            LogWeightSheet()
                .environment(store)
                .presentationDetents([.height(340)])
                .presentationDragIndicator(.visible)
        }
        .fullScreenCover(isPresented: $store.showWorkout) {
            WorkoutPlayerView()
                .environment(store)
                .toastOverlay(store.toast, bottomPadding: 40)
        }
        .fullScreenCover(isPresented: $store.showFoodLogger) {
            LogFoodView()
                .environment(store)
                .toastOverlay(store.toast, bottomPadding: 40)
        }
        .onChange(of: store.showFoodLogger) { _, shown in
            if !shown { store.stopListening() }
        }
    }

    /// Selecting the middle tab opens the quick-log sheet instead of switching tabs.
    private var tabSelection: Binding<ClientTab> {
        Binding(
            get: { store.tab },
            set: { newTab in
                if newTab == .log {
                    store.showQuickLog = true
                } else {
                    if newTab == .coach { store.readCoach = true }
                    store.tab = newTab
                }
            }
        )
    }
}

// MARK: - Routing

extension View {
    func clientDestinations() -> some View {
        navigationDestination(for: ClientRoute.self) { route in
            switch route {
            case .checkIn: WeeklyCheckInView()
            case .book: BookSessionView()
            case .me: MeView()
            }
        }
    }
}

/// A signed-in client's app while it loads (or when it couldn't load).
private struct LiveLoadingView: View {
    @Environment(ClientStore.self) private var store
    @Environment(\.lang) private var lang
    @State private var busy = false

    var body: some View {
        VStack(spacing: 18) {
            OneJumpWordmark(height: 24)
            if let error = store.loadError {
                Text(error)
                    .font(OJFont.body)
                    .foregroundStyle(Palette.ink)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: 300)
                Button(CLT.tryAgain(lang)) {
                    guard !busy else { return }
                    busy = true
                    Task { @MainActor in
                        await store.loadLive()
                        busy = false
                    }
                }
                .buttonStyle(.oj(.primary))
                .disabled(busy)
                Button(CLT.logOut(lang)) { Task { await store.logOut() } }
                    .buttonStyle(.oj(.ghost))
            } else {
                ProgressView().controlSize(.large).tint(Palette.progressGreen)
                SubText(CLT.loadingAccount(lang))
            }
        }
        .padding(24)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Palette.bg.ignoresSafeArea())
    }
}
