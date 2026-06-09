import Foundation

/// Lightweight persistence for the computer list + selection. Tokens are
/// stored here for simplicity; a production build should move them to the
/// Keychain.
enum Persistence {
    private static let computersKey = "quickdesk.computers"
    private static let selectedKey = "quickdesk.selectedComputer"
    private static let favoritesKey = "quickdesk.favoriteTasks"
    private static let defaults = UserDefaults.standard

    static func loadComputers() -> [Computer] {
        guard let data = defaults.data(forKey: computersKey),
              let list = try? JSONDecoder().decode([Computer].self, from: data) else { return [] }
        return list
    }

    static func saveComputers(_ computers: [Computer]) {
        if let data = try? JSONEncoder().encode(computers) {
            defaults.set(data, forKey: computersKey)
        }
    }

    static func loadSelectedID() -> String? { defaults.string(forKey: selectedKey) }
    static func saveSelectedID(_ id: String?) { defaults.set(id, forKey: selectedKey) }

    static func loadFavoriteTaskIDs() -> Set<String> {
        Set(defaults.stringArray(forKey: favoritesKey) ?? [])
    }

    static func saveFavoriteTaskIDs(_ ids: Set<String>) {
        defaults.set(Array(ids).sorted(), forKey: favoritesKey)
    }
}
