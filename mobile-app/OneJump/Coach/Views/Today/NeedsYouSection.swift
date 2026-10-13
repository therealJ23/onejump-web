import SwiftUI

/// "Needs you": every Assist draft in one box. Approve or skip and the next one slides in.
struct NeedsYouSection: View {
    @Environment(CoachStore.self) private var store
    @Environment(\.lang) private var lang

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            header

            if let current = store.pendingQueue.first {
                stack(current)
            } else {
                allCaught
            }
        }
    }

    /// "Needs you" + a red count of how many drafts are waiting.
    private var header: some View {
        HStack(spacing: 10) {
            Text(CT.needsYou(lang))
                .font(OJFont.h2)
                .tracking(-0.3)
                .foregroundStyle(Palette.ink)
            if !store.pendingQueue.isEmpty {
                CountBadge(count: store.pendingQueue.count, large: true)
                    .accessibilityLabel(CT.needsYouCount(store.pendingQueue.count)(lang))
            }
            Spacer(minLength: 0)
            if store.lastQueueAction != nil {
                LinkButton(CT.undo(lang)) { store.undoLastQueueAction() }
            }
        }
        .padding(.top, 6)
    }

    private func stack(_ current: QueueItem) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            ZStack(alignment: .bottom) {
                // Cards waiting behind the current one
                if store.pendingQueue.count > 2 { peekCard(level: 2) }
                if store.pendingQueue.count > 1 { peekCard(level: 1) }
                QueueCard(item: current)
                    .id(current.id)
                    .transition(.asymmetric(
                        insertion: .scale(scale: 0.96, anchor: .top).combined(with: .opacity),
                        removal: .move(edge: store.queueExitEdge).combined(with: .opacity)
                    ))
            }
            .padding(.bottom, CGFloat(min(2, store.pendingQueue.count - 1)) * 8)

            let next = Array(store.pendingQueue.dropFirst())
            if !next.isEmpty {
                upNext(next)
            }
        }
    }

    private func peekCard(level: Int) -> some View {
        RoundedRectangle(cornerRadius: 22, style: .continuous)
            .fill(Palette.surface)
            .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).strokeBorder(Palette.line, lineWidth: 1))
            .frame(height: 60)
            .padding(.horizontal, CGFloat(level) * 12)
            .offset(y: CGFloat(level) * 8)
            .opacity(level == 1 ? 0.8 : 0.5)
            .accessibilityHidden(true)
    }

    private func upNext(_ items: [QueueItem]) -> some View {
        HStack(spacing: 10) {
            SubText(CT.upNext(lang))
            HStack(spacing: -8) {
                ForEach(items) { item in
                    let c = store.client(item.id)
                    Avatar(initials: c.initials, color: c.avatarColor, size: 26)
                        .overlay(Circle().stroke(Palette.bg, lineWidth: 2))
                }
            }
            SubText(items.map { store.client($0.id).first }.joined(separator: ", "))
            Spacer()
        }
        .padding(.horizontal, 4)
    }

    private var allCaught: some View {
        VStack(spacing: 10) {
            EmptyStateCard(
                title: CT.allCaught(lang),
                message: CT.queueSummary(store.sentCount, store.skippedCount)(lang) + "\n" + CT.allCaughtSub(lang)
            )
            if store.skippedCount > 0 {
                Button(CT.reviewSkipped(lang)) { store.reviewSkippedDrafts() }
                    .buttonStyle(.oj(.ghost, size: .small))
            }
        }
    }
}

/// One draft: who it's for, why, the message, and approve / edit / skip.
private struct QueueCard: View {
    let item: QueueItem
    @Environment(CoachStore.self) private var store
    @Environment(\.lang) private var lang

    var body: some View {
        let c = store.client(item.id)
        let state = store.queueState[item.id] ?? .pending
        let position = store.sentCount + store.skippedCount + 1

        VStack(alignment: .leading, spacing: 12) {
            HStack {
                AssistLabel(CT.assistDraft(lang))
                Spacer()
                Text(CT.position(position, CoachData.queue.count)(lang))
                    .font(.archivo(12, .bold))
                    .foregroundStyle(Palette.muted)
            }
            progressDots

            Button {
                store.push(.client(item.id))
            } label: {
                HStack(spacing: 12) {
                    Avatar(initials: c.initials, color: c.avatarColor)
                    TitleSub(c.name, sub: item.reason(lang))
                    Pill(item.tag(lang), tone: item.tone)
                }
            }
            .buttonStyle(.row)

            Group {
                if state == .editing {
                    TextBox(label: CT.editDraft(lang), text: draftBinding)
                } else {
                    DraftText(store.draft(for: item.id))
                }
            }
            .padding(12)
            .background(Palette.assistSoft, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(Palette.assistLine, lineWidth: 1))

            HStack(spacing: 8) {
                Button {
                    store.queueAction(item.id, to: .sent)
                } label: {
                    Label(CT.approveSend(lang), systemImage: "checkmark")
                }
                .buttonStyle(.oj(.primary, fullWidth: true))

                Button(state == .editing ? CT.done(lang) : CT.edit(lang)) {
                    withAnimation(.snappy) { store.toggleEditing(item.id) }
                }
                .buttonStyle(.oj(.ghost))

                CircleIconButton(systemName: "arrow.right", label: CT.skipForNow(lang), size: 46, style: .soft) {
                    store.queueAction(item.id, to: .skipped)
                }
            }
        }
        .card()
        .simultaneousGesture(
            DragGesture(minimumDistance: 30)
                .onEnded { value in
                    if value.translation.width > 120 { store.queueAction(item.id, to: .sent) }
                    if value.translation.width < -120 { store.queueAction(item.id, to: .skipped) }
                }
        )
    }

    private var progressDots: some View {
        HStack(spacing: 4) {
            ForEach(CoachData.queue) { q in
                Capsule()
                    .fill(dotColor(q))
                    .frame(height: 4)
            }
        }
        .accessibilityHidden(true)
    }

    private func dotColor(_ q: QueueItem) -> Color {
        switch store.queueState[q.id] ?? .pending {
        case .sent: return Palette.good
        case .skipped: return Palette.line2
        default: return q.id == item.id ? Palette.primary : Palette.surface3
        }
    }

    private var draftBinding: Binding<String> {
        Binding(
            get: { store.draft(for: item.id) },
            set: { store.editedDrafts[item.id] = $0 }
        )
    }
}
