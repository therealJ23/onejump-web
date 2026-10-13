import SwiftUI

/// All clients, with search and filters.
struct ClientsView: View {
    @Environment(CoachStore.self) private var store
    @Environment(\.lang) private var lang

    var body: some View {
        @Bindable var store = store
        ScreenScroll {
            ScreenHeader(eyebrow: CT.clientsEyebrow(store.allClients.count)(lang), title: CT.clients(lang)) {
                CircleIconButton(systemName: "plus", label: CT.addClient(lang), style: .volt) {
                    store.showAddClient = true
                }
            }
            SearchField(placeholder: CT.searchClients(lang), text: $store.clientSearch)
            ChipScroller {
                ForEach(ClientFilter.allCases, id: \.self) { filter in
                    Chip(label: label(for: filter), isOn: store.clientFilter == filter) {
                        withAnimation(.snappy) { store.clientFilter = filter }
                    }
                }
            }
            if filtered.isEmpty {
                EmptyStateCard(systemImage: "magnifyingglass", title: CT.noMatch(lang), message: CT.noMatchSub(lang))
            } else {
                ListCard {
                    DividedRows(filtered) { client in
                        Button {
                            store.push(.client(client.id))
                        } label: {
                            ClientRow(client: client)
                        }
                        .buttonStyle(.row)
                    }
                }
            }
        }
        .toolbar(.hidden, for: .navigationBar)
    }

    private var filtered: [CoachClient] {
        let query = store.clientSearch.trimmingCharacters(in: .whitespaces).lowercased()
        return store.allClients.filter { c in
            (store.clientFilter == .all || c.filters.contains(store.clientFilter))
                && (query.isEmpty || c.name.lowercased().contains(query))
        }
    }

    private func label(for filter: ClientFilter) -> String {
        switch filter {
        case .all: return CT.filterAll(lang)
        case .attention: return CT.filterAttention(lang)
        case .new: return CT.filterNew(lang)
        case .paused: return CT.filterPaused(lang)
        }
    }
}

/// One client in the list: avatar, program, status and adherence.
struct ClientRow: View {
    let client: CoachClient
    @Environment(CoachStore.self) private var store
    @Environment(\.lang) private var lang

    var body: some View {
        HStack(spacing: 12) {
            Avatar(initials: client.initials, color: client.avatarColor)
            TitleSub(client.name, sub: store.programLabel(for: client)(lang), lineLimit: 1)
            VStack(alignment: .trailing, spacing: 4) {
                Pill(client.kind.label(lang), tone: client.tone)
                Text(client.adherence.map { CT.adherenceSuffix($0)(lang) } ?? "—")
                    .font(.archivo(12))
                    .foregroundStyle(Palette.muted)
                    .lineLimit(1)
            }
        }
        .rowPadding()
    }
}
