import SwiftUI

/// The coach app: five tabs, each with its own navigation stack.
struct CoachRootView: View {
    @State private var store: CoachStore
    @Environment(\.lang) private var lang

    init(settings: AppSettings) {
        _store = State(initialValue: CoachStore(settings: settings))
    }

    var body: some View {
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
        .environment(store)
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
        case .checkIn(let id): CheckInReviewView(clientID: id)
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
