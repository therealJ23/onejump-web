import SwiftUI

/// The weekly check-in. Most of it is filled in from the client's logs, so it takes two minutes.
struct WeeklyCheckInView: View {
    @Environment(ClientStore.self) private var store
    @Environment(\.lang) private var lang

    var body: some View {
        ScreenScroll(spacing: 16) {
            if store.checkInSent {
                sentView
            } else {
                form
            }
        }
        .ojNavigationTitle(CLT.checkInCard(lang))
        .toolbar(.hidden, for: .tabBar)
        .onDisappear { if store.listenMode == .note { store.stopListening() } }
    }

    private var form: some View {
        @Bindable var store = store
        return VStack(alignment: .leading, spacing: 18) {
            VStack(alignment: .leading, spacing: 6) {
                Text(CLT.prefilled(lang)).font(OJFont.title)
                autoRow(CLT.workouts(lang), CLT.ofThree(store.workoutDone ? 3 : 2)(lang))
                autoRow(CLT.foodLogged(lang), CLT.sixOfSeven(lang))
                autoRow(CLT.avgProtein(lang), "128 g")
                autoRow(CLT.weight(lang), "\(Fmt.oneDecimal(store.weight)) lb")
            }
            .card(background: Palette.assistSoft)

            ForEach(ClientData.scales) { scale in
                VStack(alignment: .leading, spacing: 8) {
                    Text(scale.label(lang)).font(OJFont.title)
                    ScaleRow(options: scale.options.map { $0(lang) }, selected: store.checkInAnswers[scale.id] ?? 2) {
                        store.checkInAnswers[scale.id] = $0
                    }
                }
            }

            VStack(alignment: .leading, spacing: 8) {
                Text(CLT.nutritionQuestion(lang)).font(OJFont.title)
                SegmentedBar(
                    options: ClientData.nutritionOptions.enumerated().map { SegmentOption(value: $0.offset, label: $0.element(lang)) },
                    selection: $store.nutritionAnswer
                )
            }

            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text(CLT.progressPhotos(lang)).font(OJFont.title)
                    Spacer()
                    SubText(CLT.optionalPrivate(lang))
                }
                HStack(spacing: 8) {
                    photoButton("front", CLT.front(lang))
                    photoButton("side", CLT.side(lang))
                    photoButton("back", CLT.backPose(lang))
                }
            }

            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text(CLT.anythingElse(lang)).font(OJFont.title)
                    Spacer()
                    Button { store.dictateCheckInNote() } label: {
                        Label(CLT.talk(lang), systemImage: "mic")
                    }
                    .buttonStyle(.oj(.ghost, size: .small))
                }
                if store.listenMode == .note {
                    ListenBar(text: store.voice.heard.isEmpty ? CLT.listening(lang) : "“\(store.voice.heard)”")
                }
                TextBox(label: CLT.noteLabel(lang), text: $store.checkInNote, placeholder: CLT.notePlaceholder(lang))
            }

            Button { store.sendCheckIn() } label: {
                Label(CLT.sendToAlex(lang), systemImage: "paperplane.fill")
            }
            .buttonStyle(.oj(.primary, size: .large, fullWidth: true))
        }
    }

    private func autoRow(_ title: String, _ value: String) -> some View {
        HStack(spacing: 10) {
            Image(systemName: "checkmark").font(.system(size: 13, weight: .bold)).foregroundStyle(Palette.good)
            Text(title).font(OJFont.body)
            Spacer()
            Text(value).font(.archivo(15, .bold))
        }
        .padding(.vertical, 6)
    }

    private func photoButton(_ id: String, _ label: String) -> some View {
        let added = store.checkInPhotos.contains(id)
        return Button {
            withAnimation(.snappy) {
                if added { store.checkInPhotos.remove(id) } else { store.checkInPhotos.insert(id) }
            }
        } label: {
            PhotoPlaceholder(label: added ? CLT.added(lang) : label, locked: added, dashed: !added, systemImage: added ? "lock.fill" : "camera")
        }
        .buttonStyle(.plain)
    }

    private var sentView: some View {
        VStack(spacing: 16) {
            Image(systemName: "checkmark")
                .font(.system(size: 46, weight: .bold))
                .foregroundStyle(Palette.deep)
                .frame(width: 104, height: 104)
                .background(Palette.volt, in: Circle())
                .shadow(color: Palette.volt.opacity(0.5), radius: 30)
                .padding(.top, 60)
            Text(CLT.checkInSent(lang)).font(OJFont.h1).foregroundStyle(Palette.ink)
            SubText(CLT.checkInSentSub(lang)).multilineTextAlignment(.center)
            Button(CLT.backToToday(lang)) { store.go(.today) }
                .buttonStyle(.oj(.primary, size: .large, fullWidth: true))
        }
        .frame(maxWidth: .infinity)
        .transition(.scale(scale: 0.9).combined(with: .opacity))
    }
}
