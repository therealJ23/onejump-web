import SwiftUI

/// The client app: Today, Food, a center "+" to log anything, Progress and Coach.
struct ClientRootView: View {
    @State private var store: ClientStore
    @Environment(\.lang) private var lang

    init(settings: AppSettings) {
        _store = State(initialValue: ClientStore(settings: settings))
    }

    var body: some View {
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
