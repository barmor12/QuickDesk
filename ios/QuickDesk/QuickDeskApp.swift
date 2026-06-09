import SwiftUI

@main
struct QuickDeskApp: App {
    @State private var state = AppState()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(state)
        }
    }
}
