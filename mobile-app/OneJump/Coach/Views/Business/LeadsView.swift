import SwiftUI

/// Leads: people who asked about coaching, each with a reply Assist already drafted.
struct LeadsView: View {
    @Environment(CoachStore.self) private var store
    @Environment(\.lang) private var lang

    var body: some View {
        ScreenScroll {
            HStack(spacing: 10) {
                StatTile(value: store.data.leadStats.open, label: CT.openLeads(lang))
                StatTile(value: store.data.leadStats.pipeline, label: CT.pipeline(lang))
                StatTile(value: store.live ? store.data.leadStats.followUps : "\(store.newLeadCount)", label: CT.followUps(lang))
            }
            if !store.live {
                HStack(spacing: 12) {
                    IconTile(systemName: "trophy")
                    TitleSub(CT.wonTitle(lang), sub: CT.wonSub(lang))
                }
                .card()
            }
            AssistCard(label: CT.fastReplies(lang)) {
                DraftText(CT.fastBody(lang))
            }
            if store.data.leads.isEmpty {
                EmptyStateCard(systemImage: "person.badge.plus", title: CL.noLeads(lang))
            }
            ForEach(store.data.leads) { lead in
                LeadCard(lead: lead)
            }
            HStack(spacing: 12) {
                IconTile(systemName: "calendar", tone: .assist)
                TitleSub(CT.bookingPage(lang), sub: store.bookingLink.replacingOccurrences(of: "https://", with: ""))
                Button(CT.copy(lang)) { store.copyBookingLink() }
                    .buttonStyle(.oj(.ghost, size: .small))
            }
            .card()
        }
        .ojNavigationTitle(CT.leads(lang))
    }
}

private struct LeadCard: View {
    let lead: Lead
    @Environment(CoachStore.self) private var store
    @Environment(\.lang) private var lang

    var body: some View {
        let stage = store.leadStage[lead.id] ?? .new
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 12) {
                Avatar(initials: lead.initials, color: Color(hex: lead.avatar))
                TitleSub(lead.name, sub: "\(lead.source(lang)) · \(lead.when(lang))")
                Pill(stageLabel(stage), tone: stageTone(stage))
            }
            Text(lead.interest(lang))
                .font(.archivo(14))
                .foregroundStyle(Palette.muted)
                .fixedSize(horizontal: false, vertical: true)
            if stage == .new {
                AssistCard(label: CT.replyDraft(lang), padding: 12) {
                    DraftText(lead.draft(lang))
                }
                HStack(spacing: 8) {
                    Button(CT.approveSend(lang)) { store.sendLeadReply(lead) }
                        .buttonStyle(.oj(.primary, size: .small, fullWidth: true))
                    Button(CT.bookCall(lang)) { store.bookLeadCall(lead) }
                        .buttonStyle(.oj(.ghost, size: .small))
                }
            } else {
                DoneChip(stage == .booked ? (store.live ? CL.callBooked(lang) : CT.callThursday(lang)) : CT.replySent(lang))
            }
        }
        .card()
    }

    private func stageLabel(_ stage: LeadStage) -> String {
        switch stage {
        case .booked: return CT.stageBooked(lang)
        case .replied: return CT.stageReplied(lang)
        case .new: return CT.stageNew(lang)
        }
    }

    private func stageTone(_ stage: LeadStage) -> Tone {
        switch stage {
        case .booked: return .good
        case .replied: return .info
        case .new: return .warn
        }
    }
}
