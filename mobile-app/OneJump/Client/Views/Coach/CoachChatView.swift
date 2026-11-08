import SwiftUI

/// Chat with the coach (a real person). Voice notes come with a transcript, and
/// messages are translated when the client and coach use different languages.
struct CoachChatView: View {
    @Environment(ClientStore.self) private var store
    @Environment(\.lang) private var lang
    @FocusState private var focused: Bool

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 10) {
                    HStack(spacing: 12) {
                        Avatar(initials: store.coachPerson.initials, color: Palette.volt, photoURL: store.coachPerson.photoURL)
                        TitleSub(store.coachPerson.name.isEmpty ? CLT.yourCoach(lang) : store.coachPerson.name, sub: store.live ? CLT.coachSubLive(lang) : CLT.coachSub(lang))
                    }
                    .padding(.top, 8)

                    if store.live && store.allChat.isEmpty {
                        EmptyStateCard(systemImage: "message", title: CLT.yourCoach(lang), message: CLT.noMessages(lang))
                    }

                    if lang != .english && !store.live {
                        HStack(alignment: .top, spacing: 10) {
                            Image(systemName: "globe").foregroundStyle(Palette.info)
                            Text(CLT.translationNote(lang)).font(OJFont.sub).fixedSize(horizontal: false, vertical: true)
                        }
                        .padding(12)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Palette.infoTint, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    }

                    ForEach(store.allChat) { message in
                        bubble(message)
                            .transition(.move(edge: .bottom).combined(with: .opacity))
                    }
                    if store.recordingVoiceMessage, !VoiceNoteRecorder.shared.transcript.isEmpty {
                        ChatBubble(fromMe: true, faded: true) {
                            Text("“\(VoiceNoteRecorder.shared.transcript)”")
                        }
                    }
                    SubText(store.live ? CLT.realPersonLive(store.coachPerson.first)(lang) : CLT.realPerson(lang))
                        .frame(maxWidth: .infinity)
                        .multilineTextAlignment(.center)
                        .padding(.top, 6)
                    Color.clear.frame(height: 1).id("bottom")
                }
                .padding(16)
                .frame(maxWidth: 640)
                .frame(maxWidth: .infinity)
            }
            .scrollDismissesKeyboard(.interactively)
            .statusBarBackdrop()
            .onChange(of: store.chatExtra.count) { _, _ in
                withAnimation(.snappy) { proxy.scrollTo("bottom", anchor: .bottom) }
            }
            .onChange(of: store.chatBase.count) { _, _ in
                withAnimation(.snappy) { proxy.scrollTo("bottom", anchor: .bottom) }
            }
            .refreshable { await store.refreshThread() }
            .onAppear {
                store.readCoach = true
                proxy.scrollTo("bottom", anchor: .bottom)
            }
        }
        .background(Palette.bg.ignoresSafeArea())
        .safeAreaInset(edge: .bottom) {
            VStack(spacing: 8) {
                if !store.live { quickAsks }
                composer
            }
        }
        .toolbar(.hidden, for: .navigationBar)
    }

    private func bubble(_ message: ChatMessage) -> some View {
        let translated = lang != .english && !message.fromMe && message.original != nil
        let showingOriginal = store.showOriginal.contains(message.id)
        return ChatBubble(fromMe: message.fromMe) {
            if message.isVoice {
                if store.live, message.audioURL != nil || message.serverID != nil {
                    VoiceMessageRow(id: message.serverID ?? message.id.uuidString, seconds: message.seconds ?? 0, fromMe: message.fromMe) {
                        await store.voiceMessageURL(message)
                    }
                } else if let url = message.audioURL {
                    VoiceMessageRow(id: message.id.uuidString, seconds: message.seconds ?? 0, fromMe: message.fromMe) { url }
                } else {
                    VoiceNoteRow(label: message.duration ?? "0:10")
                }
                if !message.text(lang).isEmpty {
                    Text("“\(message.text(lang))”").font(.archivo(13)).opacity(0.85).fixedSize(horizontal: false, vertical: true)
                }
            } else {
                Text(message.text(lang)).fixedSize(horizontal: false, vertical: true)
            }
            if translated, showingOriginal, let original = message.original {
                Divider()
                Text(original).font(.archivo(13)).italic().opacity(0.8).fixedSize(horizontal: false, vertical: true)
            }
            if translated {
                Button {
                    withAnimation(.snappy) {
                        if showingOriginal { store.showOriginal.remove(message.id) } else { store.showOriginal.insert(message.id) }
                    }
                } label: {
                    Label(showingOriginal ? CLT.hideOriginal(lang) : CLT.translatedFrom(lang), systemImage: "globe")
                        .font(.archivo(12, .semibold))
                        .underline()
                }
                .buttonStyle(.plain)
                .opacity(0.75)
            }
            BubbleTime(message.time(lang))
        }
    }

    private var quickAsks: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(ClientData.quickAsks, id: \.self) { ask in
                    Chip(label: ask(lang)) {
                        store.chatInput = ask(lang) + " "
                        focused = true
                    }
                }
            }
            .padding(.horizontal, 12)
        }
    }

    private var composer: some View {
        @Bindable var store = store
        let recording = store.recordingVoiceMessage
        let hasText = !store.chatInput.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        return ComposerBar {
            if recording {
                RecordingStrip()
            } else {
                TextField(store.live ? CLT.messageTo(store.coachPerson.first.isEmpty ? CLT.yourCoach(lang).lowercased() : store.coachPerson.first)(lang) : CLT.messageAlex(lang), text: $store.chatInput)
                    .font(.archivo(15))
                    .padding(.horizontal, 10)
                    .frame(minHeight: 44)
                    .focused($focused)
                    .submitLabel(.send)
                    .onSubmit { store.sendChat() }
            }
        } buttons: {
            if recording {
                ComposerButton(systemName: "trash", label: SharedText.cancelVoiceMessage(lang), style: .plain) {
                    store.cancelVoiceMessage()
                }
                ComposerButton(systemName: "arrow.up", label: SharedText.sendVoiceMessage(lang), style: .send) {
                    store.sendVoiceMessage()
                }
            } else if hasText {
                ComposerButton(systemName: "arrow.up", label: CLT.send(lang), style: .send) {
                    store.sendChat()
                }
            } else if !store.live || store.voiceNotes {
                ComposerButton(systemName: "mic.fill", label: SharedText.recordVoiceMessage(lang), style: .send) {
                    focused = false
                    store.startVoiceMessage()
                }
            } else {
                ComposerButton(systemName: "arrow.up", label: CLT.send(lang), style: .send) {
                    store.sendChat()
                }
            }
        }
        .onDisappear {
            if store.recordingVoiceMessage { store.cancelVoiceMessage() }
        }
    }
}
