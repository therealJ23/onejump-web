import SwiftUI

/// Everything Assist drafted that's waiting on the coach, as a stack: swipe right (or tap Send) to
/// approve, left to skip, or approve all at once. Check-ins that mention pain or a medical topic
/// are marked and never go out in "Approve all": they need to be opened and read first.
struct ApproveQueueView: View {
    @Environment(CoachStore.self) private var store
    @Environment(\.lang) private var lang
    @State private var items: [AssistQueueItem] = []
    @State private var loading = true
    @State private var errorText: String?
    @State private var drag: CGSize = .zero
    @State private var working = false
    @State private var sent = 0
    private var es: Bool { lang == .spanish }

    var body: some View {
        ScreenScroll {
            ScreenHeader(eyebrow: es ? "Assist" : "Assist", title: es ? "Para aprobar" : "Ready to approve")
            if loading {
                ProgressView().frame(maxWidth: .infinity).padding(.top, 40)
            } else if items.isEmpty {
                EmptyStateCard(systemImage: "checkmark.seal", title: es ? "Todo al día" : "All caught up",
                               message: sent > 0 ? (es ? "Enviaste \(sent). Assist te avisa cuando haya más." : "You sent \(sent). Assist will stack new drafts here.") : (es ? "Assist pondrá aquí los borradores nuevos." : "Assist will stack new drafts here."))
            } else {
                HStack {
                    SubText(es ? "\(items.count) borradores · desliza a la derecha para enviar" : "\(items.count) drafts · swipe right to send")
                    Spacer()
                }
                ZStack {
                    ForEach(Array(items.prefix(3).enumerated().reversed()), id: \.element.id) { pair in
                        card(pair.element)
                            .offset(y: CGFloat(pair.offset) * 10)
                            .scaleEffect(1 - CGFloat(pair.offset) * 0.04)
                            .offset(pair.offset == 0 ? drag : .zero)
                            .rotationEffect(.degrees(pair.offset == 0 ? Double(drag.width / 18) : 0))
                            .gesture(swipe(pair.element), including: pair.offset == 0 ? .all : .none)
                            .allowsHitTesting(pair.offset == 0)
                    }
                }
                .frame(minHeight: 340)
                HStack(spacing: 12) {
                    Button { skip() } label: { Label(es ? "Saltar" : "Skip", systemImage: "arrow.uturn.left") }
                        .buttonStyle(.oj(.ghost, fullWidth: true))
                    Button { Task { await approve([items[0]]) } } label: { Label(es ? "Enviar" : "Send", systemImage: "paperplane.fill") }
                        .buttonStyle(.oj(.primary, fullWidth: true))
                        .disabled(working || items.first?.needsReview == true)
                }
                let batch = items.filter { !$0.needsReview }
                if batch.count > 1 {
                    Button { Task { await approve(batch) } } label: {
                        Label(es ? "Aprobar los \(batch.count)" : "Approve all \(batch.count)", systemImage: "checkmark.circle.fill")
                    }
                    .buttonStyle(.oj(.volt, fullWidth: true))
                    .disabled(working)
                }
            }
            if let errorText { SubText(errorText, color: Palette.crit) }
        }
        .task { await load() }
        .refreshable { await load() }
    }

    private func card(_ item: AssistQueueItem) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 10) {
                if let c = item.client {
                    Avatar(initials: String(c.name.prefix(1)), color: Palette.stone, size: 40, photoURL: store.clientPhoto(c.id))
                    TitleSub(c.name, sub: item.title)
                } else {
                    IconTile(systemName: "sparkles", size: 40)
                    TitleSub(item.title, sub: es ? "Assist" : "Assist")
                }
                Spacer()
                if item.minutes > 0 { Pill(es ? "~\(item.minutes) min" : "~\(item.minutes) min", tone: .ai) }
            }
            if item.needsReview {
                Label(es ? "Menciona dolor o un tema médico: ábrelo y léelo primero." : "Mentions pain or a medical topic: open it and read it first.", systemImage: "exclamationmark.triangle.fill")
                    .font(.archivo(12, .semibold)).foregroundStyle(Palette.crit)
            }
            ScrollView {
                Text(item.text).font(OJFont.body).foregroundStyle(Palette.ink).frame(maxWidth: .infinity, alignment: .leading)
            }
            .frame(maxHeight: 200)
            HStack(spacing: 6) {
                AssistMark(size: 14)
                Text(es ? "Borrador de Assist · nada se envía sin ti" : "Assist draft · nothing goes out without you").font(.archivo(11, .semibold)).foregroundStyle(Palette.assistInk)
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, minHeight: 300, alignment: .topLeading)
        .background(Palette.surface, in: RoundedRectangle(cornerRadius: 26, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 26, style: .continuous).strokeBorder(drag.width > 40 ? Palette.good : drag.width < -40 ? Palette.line2 : Palette.line, lineWidth: drag.width > 40 ? 2 : 1))
        .shadow(color: Palette.shadow, radius: 14, x: 0, y: 8)
    }

    private func swipe(_ item: AssistQueueItem) -> some Gesture {
        DragGesture()
            .onChanged { drag = $0.translation }
            .onEnded { v in
                if v.translation.width > 120, !item.needsReview {
                    withAnimation(.snappy) { drag = CGSize(width: 600, height: 0) }
                    Task { await approve([item]) }
                } else if v.translation.width < -120 {
                    withAnimation(.snappy) { drag = CGSize(width: -600, height: 0) }
                    skip()
                } else {
                    withAnimation(.spring) { drag = .zero }
                }
            }
    }

    private func skip() {
        guard !items.isEmpty else { return }
        withAnimation(.snappy) { items.append(items.removeFirst()); drag = .zero }
    }

    @MainActor
    private func load() async {
        guard store.live else { loading = false; return }
        do {
            let r: QueueResponse = try await APIClient.shared.get("/api/assist/queue")
            items = r.items
            errorText = nil
        } catch { errorText = (error as? APIError)?.message ?? error.localizedDescription }
        loading = false
    }

    @MainActor
    private func approve(_ list: [AssistQueueItem]) async {
        working = true
        defer { working = false }
        do {
            let r: QueueApproveResponse = try await APIClient.shared.post("/api/assist/queue/approve", ["items": list.map { ["kind": $0.kind, "id": $0.id] }])
            let done = Set(r.results.filter(\.ok).map(\.id))
            sent += done.count
            withAnimation(.snappy) { items.removeAll { done.contains($0.id) }; drag = .zero }
            if r.failed > 0, let e = r.results.first(where: { !$0.ok })?.error { errorText = e }
            store.toast.show(es ? "Enviado: \(done.count)" : "Sent \(done.count)")
            Task { await store.refresh() }
        } catch {
            withAnimation(.spring) { drag = .zero }
            errorText = (error as? APIError)?.message ?? error.localizedDescription
        }
    }
}
