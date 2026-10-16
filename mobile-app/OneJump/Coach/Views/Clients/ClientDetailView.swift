import SwiftUI

/// One client: risk, quick actions and five tabs (overview, program, food, progress, notes).
struct ClientDetailView: View {
    let clientID: String
    @Environment(CoachStore.self) private var store
    @Environment(\.lang) private var lang

    var body: some View {
        @Bindable var store = store
        let client = store.client(clientID)
        let detail = store.detail(clientID)

        ScrollViewReader { proxy in
            ScreenScroll {
                profile(client)
                if client.kind == .risk, let score = detail.riskScore {
                    riskCard(score: score, why: detail.riskWhy.map { $0(lang) } ?? "")
                }
                actions(client)
                SegmentedBar(options: tabOptions, selection: $store.clientDetailTab, compact: true)

                switch store.clientDetailTab {
                case .overview: ClientOverviewTab(client: client)
                case .program: ClientProgramTab(client: client)
                case .food: ClientFoodTab(client: client)
                case .progress: ClientProgressTab(client: client)
                case .notes: ClientNotesTab(client: client)
                }
            }
            .refreshable { await store.loadDetail(clientID) }
            // When Assist's nutrition plan arrives, bring it into view.
            .onChange(of: store.planDrafts[clientID]?.draft) { _, draft in
                guard draft != nil, store.clientDetailTab == .food else { return }
                Task { @MainActor in
                    try? await Task.sleep(nanoseconds: 150_000_000)
                    withAnimation(.snappy) { proxy.scrollTo(NutritionPlanBuilder.anchor, anchor: .top) }
                }
            }
        }
        .ojNavigationTitle(CT.client(lang))
    }

    private var tabOptions: [SegmentOption<ClientDetailTab>] {
        [
            SegmentOption(value: .overview, label: CT.tabOverview(lang)),
            SegmentOption(value: .program, label: CT.tabProgram(lang)),
            SegmentOption(value: .food, label: CT.tabFood(lang)),
            SegmentOption(value: .progress, label: CT.tabProgress(lang)),
            SegmentOption(value: .notes, label: CT.tabNotes(lang))
        ]
    }

    private func profile(_ c: CoachClient) -> some View {
        VStack(spacing: 8) {
            Avatar(initials: c.initials, color: c.avatarColor, size: 84)
                .overlay(Circle().stroke(Palette.surface, lineWidth: 5))
                .shadow(color: Palette.shadow, radius: 8)
            Text(c.name).font(OJFont.h3).foregroundStyle(Palette.ink)
            SubText("\(c.goal(lang)) · \(c.since(lang))")
            HStack(spacing: 8) {
                Pill(c.kind.label(lang), tone: c.tone)
                Pill(c.package(lang), tone: .muted)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 4)
    }

    private func riskCard(score: Int, why: String) -> some View {
        HStack(alignment: .center, spacing: 14) {
            VStack(spacing: 2) {
                Text("\(score)").font(.archivo(28, .heavy)).foregroundStyle(Palette.crit)
                Text(CT.risk(lang)).font(.archivo(11, .semibold)).foregroundStyle(Palette.crit)
            }
            (Text(CT.atRiskTitle(lang) + " ").bold() + Text(why))
                .font(.archivo(14))
                .foregroundStyle(Palette.ink)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Palette.critTint, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }

    private func actions(_ c: CoachClient) -> some View {
        HStack(spacing: 10) {
            actionButton(CT.message(lang), systemImage: "message", assist: false) {
                store.push(.thread(c.id))
            }
            actionButton(CT.askAssist(lang), systemImage: nil, assist: true) {
                store.send(CT.howIs(c.first)(lang))
            }
            actionButton(CT.program(lang), systemImage: "square.stack.3d.up", assist: false) {
                withAnimation(.snappy) { store.clientDetailTab = .program }
            }
        }
    }

    private func actionButton(_ title: String, systemImage: String?, assist: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 6) {
                if let systemImage {
                    Image(systemName: systemImage).font(.system(size: 18, weight: .semibold))
                } else {
                    AssistMark(size: 22, color: Palette.assistInk)
                }
                Text(title).font(.archivo(13, .semibold)).lineLimit(1).minimumScaleFactor(0.8)
            }
            .foregroundStyle(assist ? Palette.assistInk : Palette.ink)
            .frame(maxWidth: .infinity)
            .frame(height: 72)
            .background(assist ? Palette.assistSoft : Palette.surface, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(assist ? Palette.assistLine : Palette.line, lineWidth: 1))
        }
        .buttonStyle(.plain)
    }
}
