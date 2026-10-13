import SwiftUI

/// Move or book a session with the coach.
struct BookSessionView: View {
    @Environment(ClientStore.self) private var store
    @Environment(\.lang) private var lang

    var body: some View {
        ScreenScroll(spacing: 16) {
            HStack(spacing: 12) {
                IconTile(systemName: "calendar")
                TitleSub(CLT.nextSession(lang), sub: CLT.bookedLine(store.slotLabel(store.booked))(lang))
            }
            .card()

            ForEach(ClientData.slotDays.indices, id: \.self) { day in
                VStack(alignment: .leading, spacing: 8) {
                    Eyebrow(ClientData.slotDays[day](lang)).padding(.leading, 4)
                    HStack(spacing: 10) {
                        ForEach(ClientData.slotTimes[day].indices, id: \.self) { time in
                            slotButton(SlotRef(day: day, time: time))
                        }
                    }
                }
            }

            Button(store.pickedSlot.map { CLT.moveTo(store.slotLabel($0))(lang) } ?? CLT.pickNewTime(lang)) {
                store.confirmBooking()
            }
            .buttonStyle(.oj(.primary, size: .large, fullWidth: true))
            SubText(CLT.freeToMove(lang))
                .frame(maxWidth: .infinity)
                .multilineTextAlignment(.center)
        }
        .ojNavigationTitle(CLT.bookWithAlex(lang))
        .toolbar(.hidden, for: .tabBar)
    }

    private func slotButton(_ slot: SlotRef) -> some View {
        let isBooked = slot == store.booked
        let isPicked = slot == store.pickedSlot
        return Button {
            withAnimation(.snappy) { store.pickedSlot = isBooked ? nil : slot }
            Haptics.tick()
        } label: {
            Text(ClientData.slotTimes[slot.day][slot.time](lang))
                .font(.archivo(14, .semibold))
                .frame(maxWidth: .infinity, minHeight: 44)
                .foregroundStyle(isPicked ? Palette.onPrimary : (isBooked ? Palette.good : Palette.ink))
                .background(isPicked ? Palette.primary : (isBooked ? Palette.goodTint : Palette.surface), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(isPicked || isBooked ? Color.clear : Palette.line2, lineWidth: 1))
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isPicked ? .isSelected : [])
    }
}
