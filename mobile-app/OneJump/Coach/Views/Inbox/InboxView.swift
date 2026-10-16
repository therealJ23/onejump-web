import SwiftUI

/// Inbox: messages from clients and leads, and weekly check-ins to review.
struct InboxView: View {
    @Environment(CoachStore.self) private var store
    @Environment(\.lang) private var lang

    var body: some View {
        @Bindable var store = store
        ScreenScroll {
            ScreenHeader(eyebrow: CT.inboxEyebrow(lang), title: CT.inbox(lang))
            SegmentedBar(
                options: [
                    SegmentOption(value: InboxSegment.messages, label: CT.messages(lang), badge: store.unreadCount),
                    SegmentOption(value: InboxSegment.checkIns, label: CT.checkIns(lang), badge: store.openCheckInCount)
                ],
                selection: $store.inboxSegment
            )
            switch store.inboxSegment {
            case .messages: messages
            case .checkIns: checkIns
            }
        }
        .refreshable { await store.refresh() }
        .toolbar(.hidden, for: .navigationBar)
    }

    // MARK: Messages

    @ViewBuilder
    private var messages: some View {
        if store.data.threadOrder.isEmpty {
            EmptyStateCard(systemImage: "bubble.left.and.bubble.right", title: CL.noThreads(lang))
        } else {
        ListCard {
            DividedRows(store.data.threadOrder) { id in
                Button {
                    store.openThread(id)
                } label: {
                    threadRow(id)
                }
                .buttonStyle(.row)
            }
        }
        }
    }

    private func threadRow(_ id: String) -> some View {
        let thread = store.data.threads[id]
        let person = store.person(id)
        let all = store.threadMessages(id)
        let last = all.last
        let lastText = last.map { $0.isVoice ? CT.voiceNote(lang) : $0.text(lang) } ?? ""
        let prefix = (last?.fromMe ?? false) ? CT.youPrefix(lang) : ""
        let unread = (thread?.unread ?? false) && !store.readThreads.contains(id)

        return HStack(spacing: 12) {
            Avatar(initials: person.initials, color: Color(hex: person.avatar))
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Text(person.name).font(OJFont.title).foregroundStyle(Palette.ink)
                    if thread?.isLead == true { Pill(CT.lead(lang), tone: .ai) }
                    if thread?.isForeign == true, let code = thread?.languageCode { Pill(code, tone: .info) }
                }
                Text(prefix + lastText)
                    .font(OJFont.sub)
                    .foregroundStyle(unread ? Palette.ink : Palette.muted)
                    .lineLimit(1)
            }
            Spacer(minLength: 0)
            VStack(alignment: .trailing, spacing: 6) {
                Text(last?.time(lang) ?? "").font(.archivo(12)).foregroundStyle(Palette.muted)
                if unread {
                    Circle().fill(Palette.crit).frame(width: 10, height: 10)
                }
            }
        }
        .rowPadding()
    }

    // MARK: Check-ins

    private var checkIns: some View {
        VStack(alignment: .leading, spacing: 14) {
            AssistCard(label: CT.assistReadFirst(lang)) {
                DraftText(CT.assistReadBody(lang))
            }

            Eyebrow(CT.toReview(lang))
            if store.data.checkInOrder.isEmpty {
                EmptyStateCard(title: CL.noCheckIns(lang))
            } else {
                ListCard {
                    DividedRows(store.data.checkInOrder) { id in
                        Button {
                            store.push(.checkIn(id))
                        } label: {
                            checkInRow(id)
                        }
                        .buttonStyle(.row)
                    }
                }
            }

            if !store.data.reviewedCheckIns.isEmpty {
            Eyebrow(CT.reviewed(lang))
            ListCard {
                DividedRows(store.data.reviewedCheckIns) { r in
                    HStack(spacing: 12) {
                        Avatar(initials: r.initials, color: Color(hex: r.avatar), size: 36)
                        TitleSub(r.name, sub: r.when(lang))
                        Pill(CT.replied(lang), tone: .good)
                    }
                    .rowPadding()
                }
            }
            }

            Eyebrow(CT.missing(lang))
            ListCard {
                if store.data.missingCheckIns.isEmpty {
                    SubText(CL.nobodyMissing(lang)).rowPadding()
                }
                DividedRows(store.data.missingCheckIns) { m in
                    let c = store.client(m.clientID)
                    HStack(spacing: 12) {
                        Avatar(initials: c.initials, color: c.avatarColor, size: 36)
                        TitleSub(c.name, sub: m.why(lang))
                    }
                    .rowPadding()
                }
                if !store.data.missingCheckIns.isEmpty {
                RowDivider()
                Group {
                    if store.nudgedMissing {
                        DoneChip(store.live ? CL.remindersSent(store.data.missingCheckIns.count)(lang) : CT.nudgeDone(lang))
                    } else {
                        Button(store.live ? CL.remindAll(store.data.missingCheckIns.count)(lang) : CT.nudgeBoth(lang)) { store.nudgeMissingCheckIns() }
                            .buttonStyle(.oj(.ghost, size: .small, fullWidth: true))
                    }
                }
                .rowPadding()
                }
            }
        }
    }

    private func checkInRow(_ id: String) -> some View {
        let report = store.data.checkIns[id]
        let c = store.client(report.map { $0.clientID.isEmpty ? id : $0.clientID } ?? id)
        let sent = store.checkInState[id] == .sent
        let tag: String
        let tone: Tone
        if sent {
            tag = CT.replied(lang); tone = .good
        } else if report?.flag != nil {
            tag = CT.needsCareTag(lang); tone = .crit
        } else {
            tag = CT.newTag(lang); tone = .info
        }
        return HStack(spacing: 12) {
            Avatar(initials: c.initials, color: c.avatarColor)
            TitleSub(c.name, sub: report.map { "\($0.week(lang)) · \($0.when(lang))" } ?? "")
            Pill(tag, tone: tone)
        }
        .rowPadding()
    }
}
