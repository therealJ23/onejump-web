import SwiftUI

/// A conversation with a client or lead. Messages in other languages are translated both ways.
struct ThreadView: View {
    let threadID: String
    @Environment(CoachStore.self) private var store
    @Environment(\.lang) private var lang
    @FocusState private var focused: Bool

    private var thread: CoachThread? { store.data.threads[threadID] }
    private var languageName: String { thread?.languageName.map { $0(lang) } ?? "" }

    var body: some View {
        let messages = store.threadMessages(threadID)
        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 10) {
                    if thread?.isForeign == true {
                        translationNote
                    }
                    ForEach(Array(messages.enumerated()), id: \.element.id) { pair in
                        bubble(pair.element, key: "\(threadID):\(pair.offset)")
                            .transition(.move(edge: .bottom).combined(with: .opacity))
                    }
                    if let suggestion = thread?.suggestion, !store.usedSuggestion.contains(threadID) {
                        suggestionCard(suggestion)
                    }
                    Color.clear.frame(height: 1).id("bottom")
                }
                .padding(16)
                .frame(maxWidth: 640)
                .frame(maxWidth: .infinity)
            }
            .scrollDismissesKeyboard(.interactively)
            .onChange(of: messages.count) { _, _ in
                withAnimation(.snappy) { proxy.scrollTo("bottom", anchor: .bottom) }
            }
            .onAppear { proxy.scrollTo("bottom", anchor: .bottom) }
        }
        .background(Palette.bg.ignoresSafeArea())
        .safeAreaInset(edge: .bottom) { composer }
        .navigationBarTitleDisplayMode(.inline)
        .toolbarRole(.editor)
        .toolbar {
            ToolbarItem(placement: .principal) { header }
        }
        .toolbarBackground(Palette.bg, for: .navigationBar)
        .toolbar(.hidden, for: .tabBar)
    }

    private var header: some View {
        let person = store.person(threadID)
        return HStack(spacing: 10) {
            Avatar(initials: person.initials, color: Color(hex: person.avatar), size: 32)
            VStack(alignment: .leading, spacing: 0) {
                Text(person.name).font(OJFont.title).foregroundStyle(Palette.ink)
                Text(person.sub(lang)).font(.archivo(11)).foregroundStyle(Palette.muted).lineLimit(1)
            }
        }
    }

    private var translationNote: some View {
        let first = store.person(threadID).name.components(separatedBy: " ").first ?? ""
        return HStack(alignment: .top, spacing: 10) {
            Image(systemName: "globe").foregroundStyle(Palette.info)
            Text(CT.translationNote(first, languageName)(lang))
                .font(OJFont.sub)
                .foregroundStyle(Palette.ink)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Palette.infoTint, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private func bubble(_ m: ThreadMessage, key: String) -> some View {
        let showingOriginal = store.showOriginal.contains(key)
        let originalText: String? = m.fromMe ? m.outgoingTranslation : (showingOriginal ? m.original : nil)
        let time = m.sentInTheirLanguage ? CT.sentIn(languageName)(lang) : m.time(lang)

        return ChatBubble(fromMe: m.fromMe) {
            if m.isVoice {
                voiceMessage(m)
            } else {
                Text(m.text(lang)).fixedSize(horizontal: false, vertical: true)
            }
            if let originalText {
                Divider().overlay(m.fromMe ? Palette.onPrimary.opacity(0.3) : Palette.line)
                Text(originalText)
                    .font(.archivo(13))
                    .italic()
                    .opacity(0.8)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if !m.fromMe, m.original != nil {
                Button {
                    withAnimation(.snappy) { store.toggleOriginal(key) }
                } label: {
                    Label(showingOriginal ? CT.hideOriginal(lang) : CT.translatedFrom(languageName)(lang), systemImage: "globe")
                        .font(.archivo(12, .semibold))
                        .underline()
                }
                .buttonStyle(.plain)
                .opacity(0.75)
            }
            BubbleTime(time)
        }
    }

    /// A voice message: play it, what was said, and (from the client) Assist's summary and any health flag.
    @ViewBuilder
    private func voiceMessage(_ m: ThreadMessage) -> some View {
        let transcript = m.text(lang).trimmingCharacters(in: .whitespacesAndNewlines)
        let isPlaceholder = transcript.isEmpty || transcript.hasPrefix("Voice note (") || transcript == CT.voiceNote(lang)
        VoiceMessageRow(id: m.serverID ?? m.id.uuidString, seconds: m.seconds ?? 0, fromMe: m.fromMe) {
            await store.voiceMessageURL(m, in: threadID)
        }
        if m.pending {
            Text(SharedText.transcribing(lang)).font(.archivo(12)).opacity(0.75)
        } else if !isPlaceholder {
            Text("“\(transcript)”").font(.archivo(13)).opacity(0.85).fixedSize(horizontal: false, vertical: true)
        }
        if let summary = m.summary, !summary.isEmpty {
            HStack(alignment: .top, spacing: 6) {
                AssistMark(size: 12)
                Text(summary).font(.archivo(12, .semibold)).fixedSize(horizontal: false, vertical: true)
            }
            .opacity(0.85)
        }
        if let flag = m.flag, !flag.isEmpty {
            Label(CL.mentionedFlag(flag)(lang), systemImage: "exclamationmark.triangle.fill")
                .font(.archivo(12, .semibold))
                .foregroundStyle(Palette.crit)
        }
    }

    private func suggestionCard(_ suggestion: Loc) -> some View {
        AssistCard(label: CT.suggestedReply(lang)) {
            DraftText(suggestion(lang))
            if thread?.isForeign == true, let out = thread?.suggestionOut {
                (Text(CT.sendsIn(languageName)(lang) + " ").bold() + Text(out))
                    .font(OJFont.sub)
                    .foregroundStyle(Palette.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Button(CT.useReply(lang)) {
                withAnimation(.snappy) { store.useSuggestion(in: threadID) }
                focused = true
            }
            .buttonStyle(.oj(.volt, size: .small))
        }
    }

    private var composer: some View {
        @Bindable var store = store
        let placeholder = (thread?.isForeign == true && store.autoTranslate)
            ? CT.messagePlaceholderTranslated(languageName)(lang)
            : CT.messagePlaceholder(lang)
        let recording = store.recordingVoiceNote
        let hasText = !store.threadReply.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        return ComposerBar {
            if recording {
                RecordingStrip()
            } else {
                TextField(placeholder, text: $store.threadReply)
                    .font(.archivo(15))
                    .padding(.horizontal, 10)
                    .frame(minHeight: 44)
                    .focused($focused)
                    .submitLabel(.send)
                    .onSubmit { store.sendReply(in: threadID) }
            }
        } buttons: {
            if recording {
                ComposerButton(systemName: "trash", label: SharedText.cancelVoiceMessage(lang), style: .plain) {
                    store.cancelVoiceMessage()
                }
                ComposerButton(systemName: "arrow.up", label: SharedText.sendVoiceMessage(lang), style: .send) {
                    store.sendVoiceMessage(in: threadID)
                }
            } else if hasText {
                ComposerButton(systemName: "arrow.up", label: CT.send(lang), style: .send) {
                    store.sendReply(in: threadID)
                }
            } else {
                // Like WhatsApp: the mic records a voice message; typing turns it into Send.
                ComposerButton(systemName: "mic.fill", label: SharedText.recordVoiceMessage(lang), style: .send) {
                    focused = false
                    store.startVoiceMessage(in: threadID)
                }
            }
        }
        .onDisappear {
            if store.recordingVoiceNote { store.cancelVoiceMessage() }
        }
    }
}
