import SwiftUI

/// The center "+" sheet: log anything in one tap.
struct QuickLogSheet: View {
    @Environment(ClientStore.self) private var store
    @Environment(\.lang) private var lang

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Text(CLT.whatToLog(lang)).font(OJFont.h2).padding(.top, 20)
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                    tile(CLT.snapMeal(lang), CLT.photoToFoods(lang), "camera", volt: true) { store.openLogger(.photo) }
                    tile(CLT.sayAte(lang), CLT.talkToFoods(lang), "mic", volt: true) { store.openLogger(.voice) }
                    tile(CLT.logWeight(lang), CLT.lastWeight("\(Fmt.oneDecimal(store.weight)) lb")(lang), "scalemass") {
                        store.weightDraft = store.weight
                        store.showQuickLog = false
                        after(0.35) { store.showWeightSheet = true }
                    }
                    tile(CLT.addWater(lang), CLT.waterOf(Fmt.trimmed(store.water))(lang), "drop") { store.addWater() }
                    tile(CLT.voiceNoteToAlex(lang), CLT.withTranscript(lang), "waveform") { store.startVoiceNoteFromQuickLog() }
                    tile(CLT.weeklyCheckIn(lang), CLT.twoMinutes(lang), "list.clipboard") { store.openCheckIn() }
                }
            }
            .padding(.horizontal, 18)
            .padding(.bottom, 24)
        }
        .background(Palette.bg.ignoresSafeArea())
    }

    private func tile(_ title: String, _ sub: String, _ icon: String, volt: Bool = false, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 10) {
                IconTile(systemName: icon, tone: volt ? .volt : .plain, size: 38)
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).font(OJFont.title).foregroundStyle(Palette.ink)
                    Text(sub).font(OJFont.sub).foregroundStyle(Palette.muted).lineLimit(1)
                }
            }
            .padding(14)
            .frame(maxWidth: .infinity, minHeight: 110, alignment: .topLeading)
            .background(Palette.surface, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(Palette.line, lineWidth: 1))
        }
        .buttonStyle(.plain)
    }
}

/// Log today's weight with big plus / minus buttons.
struct LogWeightSheet: View {
    @Environment(ClientStore.self) private var store
    @Environment(\.lang) private var lang

    var body: some View {
        VStack(spacing: 16) {
            Text(CLT.logWeight(lang)).font(OJFont.h2).padding(.top, 24)
            HStack(spacing: 18) {
                bigButton("minus", CLT.less(lang)) { store.weightDraft -= 0.2 }
                Text(Fmt.oneDecimal(store.weightDraft))
                    .font(OJFont.display)
                    .monospacedDigit()
                    .contentTransition(.numericText())
                    .frame(minWidth: 150)
                bigButton("plus", CLT.more(lang)) { store.weightDraft += 0.2 }
            }
            SubText(CLT.weighTip(lang)).multilineTextAlignment(.center)
            Button(SharedText.save(lang)) { store.saveWeight() }
                .buttonStyle(.oj(.primary, size: .large, fullWidth: true))
        }
        .padding(20)
        .frame(maxHeight: .infinity, alignment: .top)
        .background(Palette.surface.ignoresSafeArea())
    }

    private func bigButton(_ icon: String, _ label: String, action: @escaping () -> Void) -> some View {
        Button {
            withAnimation(.snappy) { action() }
            Haptics.tick()
        } label: {
            Image(systemName: icon)
                .font(.system(size: 20, weight: .bold))
                .foregroundStyle(Palette.ink)
                .frame(width: 54, height: 54)
                .background(Palette.surface2, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(Palette.line2, lineWidth: 1))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }
}
