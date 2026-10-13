import SwiftUI

/// Today: what Assist saved you, the spoken briefing, what needs you, and your business.
struct TodayView: View {
    @Environment(CoachStore.self) private var store
    @Environment(\.lang) private var lang

    var body: some View {
        ScreenScroll {
            ScreenHeader(eyebrow: CT.date(lang), title: CT.greeting(lang)) {
                ThemeToggleButton()
            }
            TimeSavedCard()
            MorningBriefingCard()
            tiles
            NeedsYouSection()
            sessions
            BusinessSection()
        }
        .toolbar(.hidden, for: .navigationBar)
    }

    private var tiles: some View {
        HStack(spacing: 10) {
            tile(store.openCheckInCount, CT.checkInsToReview(lang)) { store.openInbox(.checkIns) }
            tile(store.unreadCount, CT.unreadMessages(lang)) { store.openInbox(.messages) }
            tile(store.newLeadCount, CT.newLeads(lang)) { store.push(.leads) }
        }
    }

    private func tile(_ count: Int, _ label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 4) {
                Text("\(count)")
                    .font(.archivo(26, .heavy))
                    .foregroundStyle(Palette.ink)
                    .contentTransition(.numericText())
                Text(label)
                    .font(.archivo(12, .semibold))
                    .foregroundStyle(Palette.muted)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(12)
            .frame(maxWidth: .infinity, minHeight: 84, alignment: .topLeading)
            .background(Palette.surface, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(Palette.line, lineWidth: 1))
        }
        .buttonStyle(.plain)
    }

    private var sessions: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionHeader(CT.sessionsToday(lang), note: CT.booked3(lang))
            ListCard {
                DividedRows(CoachData.sessions) { session in
                    HStack(spacing: 12) {
                        Text(session.time(lang))
                            .font(.archivo(13, .bold))
                            .foregroundStyle(Palette.ink)
                            .frame(width: 70, alignment: .leading)
                        TitleSub(session.name, sub: session.type(lang))
                        IconTile(systemName: session.systemImage, size: 36)
                    }
                    .rowPadding()
                }
            }
        }
    }
}

/// Deep green card: hours Assist saved this week.
struct TimeSavedCard: View {
    @Environment(\.lang) private var lang
    private let bars: [CGFloat] = [0.38, 0.52, 0.44, 0.70, 0.61, 0.82, 1]

    var body: some View {
        HStack(alignment: .bottom, spacing: 12) {
            VStack(alignment: .leading, spacing: 8) {
                AssistLabel(CT.savedYou(lang), color: Palette.volt)
                Text("6h 40m")
                    .font(OJFont.display)
                    .tracking(-1.4)
                SubText(CT.savedSub(lang))
                    .foregroundStyle(Palette.bone.opacity(0.75))
            }
            Spacer(minLength: 0)
            HStack(alignment: .bottom, spacing: 4) {
                ForEach(Array(bars.enumerated()), id: \.offset) { pair in
                    RoundedRectangle(cornerRadius: 3, style: .continuous)
                        .fill(pair.offset == bars.count - 1 ? Palette.volt : Palette.bone.opacity(0.25))
                        .frame(width: 8, height: 56 * pair.element)
                }
            }
            .frame(height: 56, alignment: .bottom)
            .accessibilityHidden(true)
        }
        .heroCard()
    }
}
