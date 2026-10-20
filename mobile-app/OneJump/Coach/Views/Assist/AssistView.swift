import SwiftUI

/// Assist. Text mode: a chat you type into (answers aren't read aloud). Voice mode: the
/// glowing logo, always listening (AssistVoiceView). The mic button switches to voice.
struct AssistView: View {
    @Environment(CoachStore.self) private var store

    var body: some View {
        if store.assistMode == .voice {
            AssistVoiceView()
                .transition(.opacity)
        } else {
            AssistTextView()
                .transition(.opacity)
        }
    }
}

/// Typing to Assist.
struct AssistTextView: View {
    @Environment(CoachStore.self) private var store
    @Environment(\.lang) private var lang
    @FocusState private var focused: Bool

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    if store.assistMessages.isEmpty && !store.thinking {
                        welcome
                    } else {
                        chatHeader
                        ForEach(Array(store.assistMessages.enumerated()), id: \.element.id) { pair in
                            AssistMessageView(message: pair.element, index: pair.offset)
                                .transition(.move(edge: .bottom).combined(with: .opacity))
                        }
                        if store.listenMode == .question {
                            ChatBubble(fromMe: true, faded: true) {
                                Text(store.voice.heard.isEmpty ? CT.listening(lang) : store.voice.heard)
                            }
                        }
                        if store.thinking {
                            ThinkingDots()
                        }
                        if !store.hint.isEmpty {
                            hintText
                        }
                    }
                    Color.clear.frame(height: 1).id("bottom")
                }
                .padding(16)
                .frame(maxWidth: 640)
                .frame(maxWidth: .infinity)
            }
            .scrollDismissesKeyboard(.interactively)
            .statusBarBackdrop()
            .onChange(of: store.assistMessages.count) { _, _ in scrollDown(proxy) }
            .onChange(of: store.thinking) { _, _ in scrollDown(proxy) }
            .onChange(of: store.voice.heard) { _, _ in scrollDown(proxy) }
        }
        .background(Palette.bg.ignoresSafeArea())
        .safeAreaInset(edge: .bottom) { composer }
        .toolbar(.hidden, for: .navigationBar)
    }

    private func scrollDown(_ proxy: ScrollViewProxy) {
        withAnimation(.snappy) { proxy.scrollTo("bottom", anchor: .bottom) }
    }

    // MARK: Empty state

    private var welcome: some View {
        VStack(spacing: 16) {
            Button {
                store.tapOrb()
            } label: {
                VoiceOrb(active: false)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(AVT.startVoice(lang))
            .padding(.top, 24)

            Text(orbTitle)
                .font(.archivo(28, .heavy))
                .tracking(-0.6)
                .multilineTextAlignment(.center)
                .foregroundStyle(Palette.ink)
                .padding(.top, 8)
                .contentTransition(.opacity)
            SubText(AVT.startVoice(lang))
                .multilineTextAlignment(.center)
                .frame(maxWidth: 320)
            if !store.hint.isEmpty { hintText }

            VStack(spacing: 8) {
                ForEach(store.data.suggestions, id: \.self) { suggestion in
                    Button {
                        store.send(suggestion(lang))
                    } label: {
                        HStack(spacing: 10) {
                            AssistMark(size: 18)
                            Text(suggestion(lang))
                                .font(OJFont.bodyMedium)
                                .foregroundStyle(Palette.ink)
                                .multilineTextAlignment(.leading)
                            Spacer(minLength: 0)
                        }
                        .padding(14)
                        .background(Palette.surface, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(Palette.line, lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.top, 8)

            VStack(alignment: .leading, spacing: 6) {
                Text(CT.canSee(lang)).font(OJFont.title)
                SubText(CT.canSeeBody(lang))
                Text(CT.wontDo(lang)).font(OJFont.title).padding(.top, 6)
                SubText(CT.wontDoBody(lang))
            }
            .card()
        }
        .frame(maxWidth: .infinity)
    }

    private var orbTitle: String {
        store.live ? CL.helloName(store.me.first)(lang) : CT.orbHello(lang)
    }

    private var hintText: some View {
        Text(store.hint)
            .font(.archivo(13, .semibold))
            .foregroundStyle(Palette.warn)
            .frame(maxWidth: .infinity)
            .multilineTextAlignment(.center)
    }

    // MARK: Chat

    private var chatHeader: some View {
        HStack(spacing: 12) {
            Button {
                store.tapOrb()
            } label: {
                VoiceOrb(active: false, size: 40)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(CT.talkToAssist(lang))
            VStack(alignment: .leading, spacing: 2) {
                Text("Assist").font(OJFont.title).foregroundStyle(Palette.ink)
                SubText(voiceStatus)
            }
            Spacer()
            CircleIconButton(systemName: "waveform", label: AVT.startVoice(lang), style: .volt) {
                focused = false
                store.startVoiceMode()
            }
            LinkButton(CT.newChat(lang)) { store.newChat() }
        }
        .padding(.top, 8)
    }

    private var voiceStatus: String {
        AVT.textMode(lang)
    }

    // MARK: Composer

    private var composer: some View {
        @Bindable var store = store
        return ComposerBar {
            TextField(store.pendingIndex != nil ? CT.askPlaceholderPending(lang) : CT.askPlaceholder(lang), text: $store.askText)
                .font(.archivo(15))
                .padding(.horizontal, 10)
                .frame(minHeight: 44)
                .focused($focused)
                .submitLabel(.send)
                .onSubmit { store.send(store.askText) }
        } buttons: {
            ComposerButton(systemName: "mic", label: AVT.startVoice(lang), style: .plain) {
                focused = false
                store.startVoiceMode()
            }
            ComposerButton(systemName: "arrow.up", label: CT.send(lang), style: .send) {
                store.send(store.askText)
            }
        }
    }
}

/// Three bouncing dots while Assist is thinking.
struct ThinkingDots: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            AssistLabel("Assist")
            TimelineView(.animation) { timeline in
                let t = timeline.date.timeIntervalSinceReferenceDate
                HStack(spacing: 5) {
                    ForEach(0..<3, id: \.self) { i in
                        Circle()
                            .fill(Palette.assistInk)
                            .frame(width: 8, height: 8)
                            .opacity(0.35 + 0.65 * abs(sin(t * 4 + Double(i) * 0.7)))
                    }
                }
            }
        }
        .padding(14)
        .background(Palette.assistSoft, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(Palette.assistLine, lineWidth: 1))
        .accessibilityLabel("…")
    }
}
