import SwiftUI

/// One weekly check-in: answers, Assist's summary, suggested actions and a drafted reply.
struct CheckInReviewView: View {
    /// The check-in's id (the sample uses the client's id).
    let checkInID: String
    @Environment(CoachStore.self) private var store
    @Environment(\.lang) private var lang

    var body: some View {
        if let report = store.checkInReport(checkInID) {
            content(report)
        } else {
            ScreenScroll {
                EmptyStateCard(systemImage: "hourglass", title: CL.loadingPage(lang))
            }
            .ojNavigationTitle(CT.checkIn(lang))
        }
    }

    private func content(_ report: CheckInReport) -> some View {
        let clientID = report.clientID.isEmpty ? checkInID : report.clientID
        let client = store.client(clientID)
        let sent = store.checkInState[checkInID] == .sent

        return ScreenScroll {
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
                if report.hasAssist {
                    DraftText(report.summary(lang))
                } else {
                    HStack(spacing: 8) {
                        ProgressView()
                        SubText(CL.workingOnIt(client.first)(lang))
                    }
                }
            }

            VStack(alignment: .leading, spacing: 8) {
                Eyebrow(CT.foodWeek(lang))
                Text(report.food(lang)).font(OJFont.bodyMedium).foregroundStyle(Palette.ink)
            }
            .card()

            if !report.actions.isEmpty {
            Eyebrow(CT.recommendedActions(lang))
            ListCard {
                DividedRows(report.actions) { action in
                    HStack(spacing: 10) {
                        TitleSub(action.title(lang), sub: action.detail(lang))
                        if action.done || store.actionsDone.contains(checkInID + ":" + action.id) {
                            Pill(CT.doneDay(lang), tone: .good)
                        } else {
                            Button(action.button(lang)) { store.applyAction(action, for: checkInID) }
                                .buttonStyle(.oj(.ghost, size: .small))
                        }
                    }
                    .rowPadding()
                }
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
                        store.sendCheckInReply(checkInID)
                    } label: {
                        HStack(spacing: 8) {
                            if store.sendingCheckIn.contains(checkInID) { ProgressView().tint(Palette.onPrimary) } else { Image(systemName: "paperplane.fill") }
                            Text(CT.sendReply(lang))
                        }
                    }
                    .buttonStyle(.oj(.primary, fullWidth: true))
                    .disabled(store.sendingCheckIn.contains(checkInID) || !report.hasAssist && store.checkInDraft(checkInID).isEmpty)
                }
                .card()
            }
        }
        .ojNavigationTitle(CT.checkIn(lang))
    }

    private var draftBinding: Binding<String> {
        Binding(
            get: { store.checkInDraft(checkInID) },
            set: { store.checkInDrafts[checkInID] = $0 }
        )
    }
}
