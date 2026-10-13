import SwiftUI

/// Money: revenue, who owes what, packages, recent payments and payouts.
struct PaymentsView: View {
    @Environment(CoachStore.self) private var store
    @Environment(\.lang) private var lang

    var body: some View {
        ScreenScroll {
            VStack(alignment: .leading, spacing: 8) {
                SubText(CT.mrrLabel(lang), color: Palette.bone.opacity(0.75))
                Text("$1,972").font(OJFont.display).tracking(-1.4)
                SubText(CT.mrrSub(lang), color: Palette.bone.opacity(0.75))
                HStack(spacing: 24) {
                    heroStat(CT.collected(lang), "$1,574")
                    heroStat(CT.outstanding(lang), "$398")
                }
                .padding(.top, 8)
            }
            .heroCard()

            HStack(spacing: 12) {
                IconTile(systemName: "dollarsign")
                TitleSub(CT.nextPayout(lang), sub: CT.payoutSub(lang))
            }
            .card()

            HStack(spacing: 10) {
                StatTile(value: "$219", label: CT.avgPerClient(lang))
                StatTile(value: "0", label: CT.failedPayments(lang))
                StatTile(value: "98%", label: CT.paidOnTime(lang))
            }

            SectionHeader(CT.needsAttention(lang))
            ListCard {
                HStack(spacing: 12) {
                    Avatar(initials: "SR", color: Color(hex: 0xE3D2B5), size: 36)
                    TitleSub("Sofia Ramirez", sub: CT.overdue6(lang))
                    if store.paymentReminderSent {
                        Pill(CT.reminderSent(lang), tone: .good)
                    } else {
                        Button(CT.sendReminder(lang)) { store.sendPaymentReminder() }
                            .buttonStyle(.oj(.primary, size: .small))
                    }
                }
                .rowPadding()
                RowDivider()
                HStack(spacing: 12) {
                    Avatar(initials: "TJ", color: Color(hex: 0xC9D6E2), size: 36)
                    TitleSub("Tyler Johnson", sub: CT.due15(lang))
                    Pill(CT.autoReminder(lang), tone: .info)
                }
                .rowPadding()
            }
            if !store.paymentReminderSent {
                AssistCard(label: CT.reminderDrafted(lang)) {
                    DraftText(CT.reminderText(lang))
                }
            }

            SectionHeader(CT.packages(lang), link: CT.newPackage(lang)) {
                store.toast.show(CT.newPackageToast(lang))
            }
            ListCard {
                DividedRows(CoachData.packages) { pkg in
                    HStack {
                        TitleSub(pkg.name(lang), sub: pkg.meta(lang))
                        Text(pkg.total).font(OJFont.title)
                    }
                    .rowPadding()
                }
            }

            SectionHeader(CT.recentPayments(lang))
            ListCard {
                DividedRows(CoachData.recentPayments) { payment in
                    HStack(spacing: 12) {
                        Avatar(initials: payment.initials, color: Color(hex: payment.avatar), size: 36)
                        TitleSub(payment.name, sub: payment.when(lang))
                        Text(payment.amount).font(OJFont.title)
                    }
                    .rowPadding()
                }
            }

            SectionHeader(CT.payouts(lang), note: CT.payoutsSub(lang))
            ListCard {
                DividedRows(Array(CoachData.payouts.indices)) { i in
                    let payout = CoachData.payouts[i]
                    HStack {
                        TitleSub(payout.date(lang), sub: payout.status(lang))
                        Text(payout.amount).font(OJFont.title)
                    }
                    .rowPadding()
                }
            }
        }
        .ojNavigationTitle(CT.payments(lang))
    }

    private func heroStat(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            SubText(label, color: Palette.bone.opacity(0.75))
            Text(value).font(OJFont.stat)
        }
    }
}
