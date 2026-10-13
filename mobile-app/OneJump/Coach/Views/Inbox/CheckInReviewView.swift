import SwiftUI

/// One weekly check-in: answers, Assist's summary, suggested actions and a drafted reply.
struct CheckInReviewView: View {
    let clientID: String
    @Environment(CoachStore.self) private var store
    @Environment(\.lang) private var lang

    var body: some View {
        let client = store.client(clientID)
        let report = CoachData.checkIns[clientID] ?? CoachData.checkIns["maya"]!
        let sent = store.checkInState[clientID] == .sent

        ScreenScroll {
            HStack(spacing: 12) {
                Avatar(initials: client.initials, color: client.avatarColor)
                VStack(alignment: .leading, spacing: 2) {
                    Text(client.name).font(.archivo(18, .bold)).foregroundStyle(Palette.ink)
                    SubText("\(report.week(lang)) · \(report.when(lang))")
                }
            }

            if let flag = report.flag {
                HStack(alignment: .top, spacing: 10) {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .foregroundStyle(Palette.crit)
                    (Text(CT.needsCare(lang) + " ").bold() + Text(flag(lang) + " " + CT.careBody(lang)))
                        .font(.archivo(14))
                        .foregroundStyle(Palette.ink)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(14)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Palette.critTint, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            }

            LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                ForEach(report.answers) { answer in
                    VStack(alignment: .leading, spacing: 4) {
                        SubText(answer.question(lang))
                        Text(answer.answer(lang)).font(OJFont.title).foregroundStyle(Palette.ink)
                    }
                    .padding(12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Palette.surface, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(Palette.line, lineWidth: 1))
                }
            }

            HStack(spacing: 8) {
                PhotoPlaceholder(label: CT.front(lang))
                PhotoPlaceholder(label: CT.side(lang))
                PhotoPlaceholder(label: CT.backPose(lang))
            }
            SubText(CT.photosPrivate(lang))
                .frame(maxWidth: .infinity)
                .multilineTextAlignment(.center)

            VStack(alignment: .leading, spacing: 8) {
                Eyebrow(CT.inTheirWords(lang))
                Text("“\(report.note(lang))”")
                    .font(.archivo(16, .medium))
                    .italic()
                    .foregroundStyle(Palette.ink)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .card()

            AssistCard(label: CT.assistSummary(lang)) {
                DraftText(report.summary(lang))
            }

            VStack(alignment: .leading, spacing: 8) {
                Eyebrow(CT.foodWeek(lang))
                Text(report.food(lang)).font(OJFont.bodyMedium).foregroundStyle(Palette.ink)
            }
            .card()

            Eyebrow(CT.recommendedActions(lang))
            ListCard {
                DividedRows(report.actions) { action in
                    HStack(spacing: 10) {
                        TitleSub(action.title(lang), sub: action.detail(lang))
                        if store.actionsDone.contains(clientID + ":" + action.id) {
                            Pill(CT.doneDay(lang), tone: .good)
                        } else {
                            Button(action.button(lang)) { store.applyAction(action, for: clientID) }
                                .buttonStyle(.oj(.ghost, size: .small))
                        }
                    }
                    .rowPadding()
                }
            }

            if sent {
                HStack(spacing: 12) {
                    Image(systemName: "checkmark")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundStyle(Palette.good)
                        .frame(width: 32, height: 32)
                        .background(Palette.goodTint, in: Circle())
                    TitleSub(CT.replySentTo(client.first)(lang), sub: CT.markedReviewed(lang))
                }
                .card()
                .transition(.scale(scale: 0.95).combined(with: .opacity))
            } else {
                VStack(alignment: .leading, spacing: 10) {
                    Eyebrow(CT.yourReply(lang))
                    TextBox(label: CT.replyAria(lang), text: draftBinding, minHeight: 150)
                    Button {
                        store.sendCheckInReply(clientID)
                    } label: {
                        Label(CT.sendReply(lang), systemImage: "paperplane.fill")
                    }
                    .buttonStyle(.oj(.primary, fullWidth: true))
                }
                .card()
            }
        }
        .ojNavigationTitle(CT.checkIn(lang))
    }

    private var draftBinding: Binding<String> {
        Binding(
            get: { store.checkInDraft(clientID) },
            set: { store.checkInDrafts[clientID] = $0 }
        )
    }
}
