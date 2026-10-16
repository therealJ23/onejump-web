import SwiftUI

/// Settings: language first, then appearance, Assist, voice, notifications, account, team, import, privacy.
struct CoachSettingsView: View {
    @Environment(CoachStore.self) private var store
    @Environment(AppSettings.self) private var settings
    @Environment(\.lang) private var lang

    var body: some View {
        @Bindable var store = store
        @Bindable var settings = settings

        ScreenScroll {
            HStack(spacing: 12) {
                Avatar(initials: store.me.initials, color: Palette.volt)
                TitleSub(store.me.name, sub: store.me.email)
                if !store.live {
                    Button(CT.edit(lang)) { store.toast.show(CT.editProfileToast(lang)) }
                        .buttonStyle(.oj(.ghost, size: .small))
                }
            }
            .card()

            // Language
            sectionTitle(SharedText.language(lang))
            ListCard {
                LanguageList(
                    current: store.lang,
                    fullNote: CT.languageFull(lang),
                    partialNote: CT.languageMessages(lang)
                ) { store.setLanguage($0) }
                RowDivider()
                OJToggle(title: CT.autoTranslate(lang), subtitle: CT.autoTranslateSub(lang), isOn: $store.autoTranslate)
                    .rowPadding()
            }

            // Appearance
            sectionTitle(SharedText.appearance(lang))
            AppearancePicker(appearance: $settings.appearance)

            // Assist
            sectionTitle("Assist")
            ListCard {
                VStack(alignment: .leading, spacing: 10) {
                    TitleSub(CT.howAssistWrites(lang), sub: CT.howAssistWritesSub(lang))
                    SegmentedBar(
                        options: [
                            SegmentOption(value: AssistTone.friendly, label: CT.toneFriendly(lang)),
                            SegmentOption(value: AssistTone.direct, label: CT.toneDirect(lang)),
                            SegmentOption(value: AssistTone.hype, label: CT.toneHype(lang))
                        ],
                        selection: toneBinding
                    )
                }
                .rowPadding()
                RowDivider()
                lockedRow(CT.approveBefore(lang), CT.approveBeforeSub(lang))
                RowDivider()
                lockedRow(CT.healthSafety(lang), CT.healthSafetySub(lang))
            }

            // Voice
            sectionTitle(CT.assistVoice(lang))
            ListCard {
                HStack(spacing: 12) {
                    IconTile(systemName: "speaker.wave.2", tone: .assist)
                    TitleSub(CT.voice(lang), sub: "\(voiceName) · \(CT.voiceUsed(lang))")
                    Button(CT.preview(lang)) { store.voice.speak(CT.voicePreview(lang)) }
                        .buttonStyle(.oj(.ghost, size: .small))
                }
                .rowPadding()
                RowDivider()
                OJToggle(title: CT.talkConfirm(lang), subtitle: CT.talkConfirmSub(lang), isOn: voiceBinding)
                    .rowPadding()
            }

            // Usage
            sectionTitle(CT.assistThisMonth(lang))
            HStack(spacing: 10) {
                StatTile(value: store.data.assistUsage.requests, label: CT.requests(lang))
                StatTile(value: store.data.assistUsage.approved, label: CT.approvedAsIs(lang))
                StatTile(value: store.data.assistUsage.saved, label: CT.timeSaved(lang))
            }

            // Notifications
            sectionTitle(CT.notifications(lang))
            ListCard {
                DividedRows(CoachData.notifications) { item in
                    OJToggle(title: item.name(lang), subtitle: item.detail(lang), isOn: notificationBinding(item.id))
                        .rowPadding()
                }
            }

            // Account
            sectionTitle(CT.account(lang))
            ListCard {
                HStack(spacing: 12) {
                    IconTile(systemName: "checkmark.shield")
                    TitleSub(CT.twoStep(lang), sub: CT.twoStepSub(lang))
                    Pill(store.me.totpEnabled ? CT.on(lang) : CL.off(lang), tone: store.me.totpEnabled ? .good : .muted)
                }
                .rowPadding()
                RowDivider()
                HStack(spacing: 12) {
                    IconTile(systemName: "doc.text")
                    TitleSub(CT.planBilling(lang), sub: store.live ? CL.planLine(store.me.planLabel, store.me.trialDaysLeft)(lang) : CT.trial11(lang))
                    Button(CT.seePlans(lang)) { store.push(.billing) }
                        .buttonStyle(.oj(.ghost, size: .small))
                }
                .rowPadding()
                RowDivider()
                HStack(spacing: 12) {
                    IconTile(systemName: "creditcard")
                    TitleSub(CT.stripePayouts(lang), sub: CT.stripeSub(lang))
                    Pill(CT.active(lang), tone: .good)
                }
                .rowPadding()
            }

            // Team
            sectionTitle(CT.team(lang))
            ListCard {
                HStack(spacing: 12) {
                    Avatar(initials: store.me.initials, color: Palette.volt, size: 36)
                    TitleSub(store.me.name, sub: CT.ownerAll(lang))
                    Pill(CT.youPill(lang), tone: .muted)
                }
                .rowPadding()
                RowDivider()
                HStack(spacing: 12) {
                    IconTile(systemName: "person.2")
                    TitleSub(CT.addCoach(lang), sub: CT.addCoachSub(lang))
                    Button(CT.invite(lang)) { store.toast.show(CT.studioToast(lang)) }
                        .buttonStyle(.oj(.ghost, size: .small))
                }
                .rowPadding()
            }

            // Import
            sectionTitle(CT.bringClients(lang))
            VStack(alignment: .leading, spacing: 10) {
                TitleSub(CT.movingFrom(lang), sub: CT.movingSub(lang))
                HStack(spacing: 8) {
                    Button(CT.concierge(lang)) { store.toast.show(CT.conciergeToast(lang)) }
                        .buttonStyle(.oj(.primary, size: .small, fullWidth: true))
                    Button(CT.importCSV(lang)) { store.toast.show(CT.importCSVToast(lang)) }
                        .buttonStyle(.oj(.ghost, size: .small))
                }
            }
            .card()

            // Privacy
            sectionTitle(CT.privacy(lang))
            HStack(alignment: .top, spacing: 12) {
                IconTile(systemName: "lock.shield")
                TitleSub(CT.dataProtected(lang), sub: CT.dataProtectedSub(lang))
            }
            .card()

            if store.live {
                Button(CL.logOut(lang)) { Task { await store.logOut() } }
                    .buttonStyle(.oj(.danger, fullWidth: true))
            } else {
                // Demo: switch app, or leave the demo
                Button {
                    settings.role = nil
                } label: {
                    HStack(spacing: 12) {
                        IconTile(systemName: "arrow.left.arrow.right")
                        TitleSub(SharedText.switchApp(lang), sub: SharedText.switchAppSub(lang))
                    }
                    .card()
                }
                .buttonStyle(.plain)

                Button(CL.exitDemo(lang)) { settings.exitDemo() }
                    .buttonStyle(.oj(.danger, fullWidth: true))
            }
        }
        .ojNavigationTitle(CT.settings(lang))
    }

    private var voiceName: String {
        let name = store.voice.voiceName
        return name.isEmpty ? CT.deviceVoice(lang) : name
    }

    private func sectionTitle(_ text: String) -> some View {
        Eyebrow(text).padding(.leading, 4).padding(.top, 6)
    }

    private func lockedRow(_ title: String, _ sub: String) -> some View {
        HStack(spacing: 12) {
            TitleSub(title, sub: sub)
            Image(systemName: "lock.fill").foregroundStyle(Palette.muted)
        }
        .rowPadding()
    }

    private var toneBinding: Binding<AssistTone> {
        Binding(
            get: { store.assistTone },
            set: { tone in
                store.assistTone = tone
                let label: Loc
                switch tone {
                case .friendly: label = CT.toneFriendly
                case .direct: label = CT.toneDirect
                case .hype: label = CT.toneHype
                }
                store.toast.show(CT.toneToast(label(lang).lowercased())(lang))
            }
        )
    }

    private var voiceBinding: Binding<Bool> {
        Binding(
            get: { store.voiceOn },
            set: { on in if on != store.voiceOn { store.toggleVoice() } }
        )
    }

    private func notificationBinding(_ id: String) -> Binding<Bool> {
        Binding(
            get: { store.notificationsOn[id] ?? false },
            set: { store.notificationsOn[id] = $0 }
        )
    }
}

/// Plan & billing: OneJump plans for the coach (checkout happens on Stripe).
struct BillingView: View {
    @Environment(CoachStore.self) private var store
    @Environment(\.lang) private var lang

    var body: some View {
        let chosen = CoachData.plans.first { $0.id == store.selectedPlan } ?? CoachData.plans[1]
        ScreenScroll {
            VStack(alignment: .leading, spacing: 6) {
                SubText(CT.currentPlan(lang), color: Palette.bone.opacity(0.75))
                Text(store.live ? store.me.planLabel(lang) : CT.proTrial(lang)).font(.archivo(34, .heavy)).tracking(-1)
                SubText(store.live ? CL.planLine(store.me.planLabel, store.me.trialDaysLeft)(lang) : CT.trialSub(lang), color: Palette.bone.opacity(0.75))
            }
            .heroCard()

            if store.live {
                SubText(CL.plansOnWeb(lang))
            }

            ForEach(CoachData.plans) { plan in
                Button {
                    withAnimation(.snappy) { store.selectedPlan = plan.id }
                    Haptics.tick()
                } label: {
                    planCard(plan, selected: plan.id == store.selectedPlan)
                }
                .buttonStyle(.plain)
            }

            if !store.live {
                Button(CT.choosePlan(chosen.name)(lang)) { store.toast.show(CT.checkoutToast(lang)) }
                    .buttonStyle(.oj(.primary, fullWidth: true))
                SubText(CT.checkoutNote(lang))
                    .frame(maxWidth: .infinity)
                    .multilineTextAlignment(.center)

                SectionHeader(CT.invoices(lang))
                EmptyStateCard(systemImage: "doc.text", title: CT.noInvoices(lang), message: CT.freeTrial(lang))
            }
        }
        .ojNavigationTitle(CT.planBilling(lang))
    }

    private func planCard(_ plan: PlanOption, selected: Bool) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline) {
                Text(plan.name).font(.archivo(18, .bold))
                Spacer()
                Text(plan.price).font(.archivo(22, .heavy))
                Text(CT.perMonth(lang)).font(OJFont.sub).foregroundStyle(Palette.muted)
            }
            Text(plan.saves(lang)).font(.archivo(13, .bold)).foregroundStyle(Palette.good)
            SubText(plan.meta(lang))
        }
        .foregroundStyle(Palette.ink)
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Palette.surface, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .strokeBorder(selected ? Palette.primary : Palette.line, lineWidth: selected ? 2 : 1)
        )
    }
}
