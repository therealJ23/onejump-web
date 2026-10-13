import SwiftUI

struct CoachRootView: View {
    let settings: AppSettings
    @State private var toast = ToastCenter()
    @State private var mode = Appearance.system
    @State private var count = 3

    var body: some View {
        ScreenScroll {
            ScreenHeader(eyebrow: "Tuesday", title: "Good morning, Alex") {
                CircleIconButton(systemName: "moon", label: "Theme") { toast.show("Hi") }
            }
            HStack { OneJumpWordmark(height: 22); AssistMark(); Pill("At risk", tone: .crit); CountBadge(count: count) }
            AssistCard(label: "Assist draft") { DraftText("Hello") }
            StatTile(value: "$1,972", label: "Monthly revenue", note: "+8%", labelFirst: true)
            ProgressBar(value: 0.5)
            AppearancePicker(appearance: $mode)
            ListCard { LanguageList(current: .english, fullNote: "Full", partialNote: "Soon") { _ in } }
            VoiceOrb(active: true)
            ListenBar(text: "Listening")
            VoiceWave()
            SectionHeader("Needs you", link: "Undo") {}
            SectionHeader("Sessions", note: "3 booked")
            Button("Approve") {}.buttonStyle(.oj(.primary, fullWidth: true))
            ValueStepper(value: "30 lb", decreaseLabel: "-", increaseLabel: "+", onDecrease: {}, onIncrease: {})
            EmptyStateCard(title: "All caught up")
            DoneChip("Sent")
            Text(YesNo.parse("Sí, envíalo") == .yes ? "yes" : "no")
            Text(Fmt.money(1972) + Fmt.trimmed(2.25) + settings.voice.voiceName)
        }
        .toastOverlay(toast)
    }
}
