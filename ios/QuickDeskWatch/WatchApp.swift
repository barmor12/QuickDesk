import SwiftUI

@main
struct QuickDeskWatchApp: App {
    @State private var state = WatchState()

    var body: some Scene {
        WindowGroup {
            WatchRootView()
                .environment(state)
        }
    }
}

// MARK: - Theme

enum WatchTheme {
    static let teal = Color(red: 0.16, green: 0.78, blue: 0.69)
    static let indigo = Color(red: 0.40, green: 0.45, blue: 0.95)
    static let amber = Color(red: 1.0, green: 0.66, blue: 0.22)

    static var accentGradient: LinearGradient {
        LinearGradient(colors: [teal, indigo],
                       startPoint: .topLeading, endPoint: .bottomTrailing)
    }

    static func tint(for category: TaskCategory) -> Color {
        switch category {
        case .Development: return indigo
        case .Work: return teal
        case .System: return amber
        case .Media: return Color(red: 0.40, green: 0.80, blue: 0.95)
        case .Quick: return Color(red: 0.55, green: 0.78, blue: 0.55)
        case .Custom: return Color(red: 0.95, green: 0.42, blue: 0.62)
        }
    }
}

// MARK: - Root (paged multi-screen)

struct WatchRootView: View {
    @Environment(WatchState.self) private var state
    @State private var selection = 0

    var body: some View {
        TabView(selection: $selection) {
            HomeScreen(selection: $selection).tag(0)
            WorkflowsScreen().tag(1)
            ApprovalsScreen().tag(2)
            StatusScreen().tag(3)
        }
        .tabViewStyle(.verticalPage)
        .containerBackground(WatchTheme.accentGradient.opacity(0.18), for: .tabView)
        .overlay(alignment: .bottom) {
            if let s = state.lastStatus {
                StatusToast(text: s, success: state.lastStatusSuccess)
                    .padding(.bottom, 4)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .animation(.spring(duration: 0.35), value: state.lastStatus)
        .sheet(item: Binding(get: { state.currentApproval },
                             set: { if $0 == nil { state.currentApproval = nil } })) { approval in
            ApprovalSheet(approval: approval)
        }
    }
}

// MARK: - Screen 1: Home

struct HomeScreen: View {
    @Environment(WatchState.self) private var state
    @Binding var selection: Int

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                HeroCard()

                if !state.pendingApprovalsBadge.isEmpty {
                    Button { selection = 2 } label: {
                        ApprovalNudge(text: state.pendingApprovalsBadge)
                    }
                    .buttonStyle(.plain)
                }

                if state.favoriteTasks.isEmpty {
                    if state.tasks.isEmpty {
                        EmptyHint(icon: state.isConnected ? "star" : "iphone.slash",
                                  title: state.isConnected ? "No favorites yet" : "Syncing…",
                                  message: state.isConnected
                                    ? "Star tasks on iPhone to quick-launch them here."
                                    : "Open QuickDesk on iPhone to sync.")
                    } else {
                        Button { selection = 1 } label: {
                            BrowseAllButton(count: state.tasks.count)
                        }
                        .buttonStyle(.plain)
                    }
                } else {
                    SectionLabel(text: "Quick launch", systemImage: "star.fill", tint: WatchTheme.amber)
                    ForEach(state.favoriteTasks) { task in
                        FavoriteTile(task: task, busy: state.busyTaskID == task.id) {
                            state.execute(task)
                        }
                    }
                    Button { selection = 1 } label: {
                        BrowseAllButton(count: state.tasks.count)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 2)
            .padding(.bottom, 8)
        }
        .navigationTitle("QuickDesk")
    }
}

struct HeroCard: View {
    @Environment(WatchState.self) private var state

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                ZStack {
                    Circle()
                        .fill(WatchTheme.accentGradient)
                        .frame(width: 30, height: 30)
                        .shadow(color: WatchTheme.teal.opacity(0.6), radius: 6, y: 2)
                    Image(systemName: "bolt.fill")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundStyle(.white)
                }
                Spacer()
                LiveDot(connected: state.isConnected)
            }
            Text(state.computerName ?? "QuickDesk")
                .font(.system(.headline, design: .rounded).weight(.bold))
                .lineLimit(1)
            Text(state.isConnected ? "Agent online" : "Reconnecting…")
                .font(.caption2)
                .foregroundStyle(state.isConnected ? WatchTheme.teal : .secondary)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .glassDepth(corner: 18)
    }
}

struct FavoriteTile: View {
    let task: AgentTask
    let busy: Bool
    let action: () -> Void
    @State private var pressed = false

    var body: some View {
        Button(action: action) {
            HStack(spacing: 10) {
                IconBadge(icon: task.icon, tint: WatchTheme.tint(for: task.category))
                VStack(alignment: .leading, spacing: 1) {
                    Text(task.name)
                        .font(.system(.subheadline, design: .rounded).weight(.semibold))
                        .lineLimit(1)
                    Text(task.category.rawValue)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
                Spacer(minLength: 4)
                if busy {
                    ProgressView().tint(WatchTheme.teal)
                } else {
                    Image(systemName: task.requiresConfirmation ? "shield.lefthalf.filled" : "play.fill")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundStyle(task.requiresConfirmation ? WatchTheme.amber : WatchTheme.teal)
                }
            }
            .padding(11)
            .frame(maxWidth: .infinity)
            .glassDepth(corner: 16, tint: WatchTheme.tint(for: task.category))
            .scaleEffect(pressed ? 0.96 : 1)
        }
        .buttonStyle(.plain)
        .onLongPressGesture(minimumDuration: 0, pressing: { p in
            withAnimation(.spring(duration: 0.2)) { pressed = p }
        }, perform: {})
    }
}

// MARK: - Screen 2: Workflows (all tasks)

struct WorkflowsScreen: View {
    @Environment(WatchState.self) private var state

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 10) {
                SectionLabel(text: "All workflows", systemImage: "square.grid.2x2.fill", tint: WatchTheme.indigo)
                if state.tasks.isEmpty {
                    EmptyHint(icon: "bolt.slash", title: "No workflows",
                              message: "Add tasks on the agent to control your Mac from here.")
                } else {
                    ForEach(state.tasks) { task in
                        WorkflowRow(task: task,
                                    favorite: state.isFavorite(task),
                                    busy: state.busyTaskID == task.id) {
                            state.execute(task)
                        }
                    }
                }
            }
            .padding(.horizontal, 2)
            .padding(.bottom, 8)
        }
        .navigationTitle("Workflows")
    }
}

struct WorkflowRow: View {
    let task: AgentTask
    let favorite: Bool
    let busy: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 10) {
                IconBadge(icon: task.icon, tint: WatchTheme.tint(for: task.category))
                VStack(alignment: .leading, spacing: 1) {
                    HStack(spacing: 4) {
                        Text(task.name)
                            .font(.system(.subheadline, design: .rounded).weight(.semibold))
                            .lineLimit(1)
                        if favorite {
                            Image(systemName: "star.fill")
                                .font(.system(size: 8))
                                .foregroundStyle(WatchTheme.amber)
                        }
                    }
                    Text(task.category.rawValue)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
                Spacer(minLength: 4)
                if busy {
                    ProgressView().tint(WatchTheme.teal)
                } else {
                    Image(systemName: task.requiresConfirmation ? "shield.lefthalf.filled" : "play.fill")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundStyle(task.requiresConfirmation ? WatchTheme.amber : .secondary)
                }
            }
            .padding(10)
            .frame(maxWidth: .infinity)
            .glassDepth(corner: 14)
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Screen 3: Approvals

struct ApprovalsScreen: View {
    @Environment(WatchState.self) private var state

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 10) {
                SectionLabel(text: "Approvals", systemImage: "checkmark.shield.fill", tint: WatchTheme.teal)
                if let approval = state.currentApproval {
                    ApprovalInlineCard(approval: approval)
                } else {
                    EmptyHint(icon: "checkmark.shield",
                              title: "All clear",
                              message: "Claude permission prompts appear here and buzz your wrist.")
                }
            }
            .padding(.horizontal, 2)
            .padding(.bottom, 8)
        }
        .navigationTitle("Approvals")
    }
}

struct ApprovalInlineCard: View {
    @Environment(WatchState.self) private var state
    let approval: ApprovalRequest

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Image(systemName: "checkmark.shield.fill")
                    .foregroundStyle(WatchTheme.teal)
                Text(approval.title)
                    .font(.system(.subheadline, design: .rounded).weight(.bold))
                    .lineLimit(2)
            }
            if !approval.summary.isEmpty {
                Text(approval.summary)
                    .font(.system(.caption2, design: .monospaced))
                    .foregroundStyle(.secondary)
                    .lineLimit(4)
                    .padding(8)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(.black.opacity(0.25), in: RoundedRectangle(cornerRadius: 10))
            }
            HStack(spacing: 8) {
                Button { state.decideCurrentApproval("deny") } label: {
                    Label("Deny", systemImage: "xmark")
                        .font(.caption.weight(.semibold))
                        .frame(maxWidth: .infinity)
                }
                .tint(.red)
                Button { state.decideCurrentApproval("allow") } label: {
                    Label("Allow", systemImage: "checkmark")
                        .font(.caption.weight(.semibold))
                        .frame(maxWidth: .infinity)
                }
                .tint(WatchTheme.teal)
                .primaryHandGestureShortcut()
            }
            .buttonStyle(.borderedProminent)
            HStack(spacing: 5) {
                Image(systemName: "hand.tap.fill")
                    .font(.system(size: 10, weight: .bold))
                Text("Double Tap to allow")
                    .font(.caption2.weight(.semibold))
            }
            .foregroundStyle(WatchTheme.teal)
        }
        .padding(12)
        .frame(maxWidth: .infinity)
        .glassDepth(corner: 16, tint: WatchTheme.teal)
    }
}

// MARK: - Screen 4: Status

struct StatusScreen: View {
    @Environment(WatchState.self) private var state

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 10) {
                SectionLabel(text: "Status", systemImage: "antenna.radiowaves.left.and.right", tint: WatchTheme.indigo)

                HStack(spacing: 8) {
                    StatChip(value: "\(state.tasks.count)", label: "Tasks", icon: "bolt.fill", tint: WatchTheme.teal)
                    StatChip(value: "\(state.favoriteTasks.count)", label: "Favs", icon: "star.fill", tint: WatchTheme.amber)
                }

                InfoLine(icon: state.isConnected ? "checkmark.circle.fill" : "exclamationmark.triangle.fill",
                         title: state.isConnected ? "Connected" : "Offline",
                         value: state.computerName ?? "—",
                         tint: state.isConnected ? WatchTheme.teal : WatchTheme.amber)

                if let address = state.computerAddress {
                    InfoLine(icon: "network", title: "Address", value: address, tint: WatchTheme.indigo)
                }

                if let log = state.lastLog {
                    InfoLine(icon: log.status == .success ? "checkmark.seal.fill" : "xmark.seal.fill",
                             title: "Last run",
                             value: log.taskName ?? "Task",
                             tint: log.status == .success ? WatchTheme.teal : .red)
                }
            }
            .padding(.horizontal, 2)
            .padding(.bottom, 8)
        }
        .navigationTitle("Status")
    }
}

// MARK: - Approval sheet (felt + seen)

struct ApprovalSheet: View {
    @Environment(WatchState.self) private var state
    let approval: ApprovalRequest

    var body: some View {
        ScrollView {
            VStack(spacing: 12) {
                ZStack {
                    Circle()
                        .fill(WatchTheme.accentGradient)
                        .frame(width: 52, height: 52)
                        .shadow(color: WatchTheme.teal.opacity(0.7), radius: 10, y: 3)
                    Image(systemName: "checkmark.shield.fill")
                        .font(.title2.weight(.bold))
                        .foregroundStyle(.white)
                }
                .padding(.top, 4)

                Text(approval.title)
                    .font(.system(.headline, design: .rounded).weight(.bold))
                    .multilineTextAlignment(.center)
                if !approval.summary.isEmpty {
                    Text(approval.summary)
                        .font(.system(.caption2, design: .monospaced))
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                        .lineLimit(5)
                }
                Button(role: .destructive) { state.decideCurrentApproval("deny") } label: {
                    Label("Deny", systemImage: "xmark").frame(maxWidth: .infinity)
                }
                Button { state.decideCurrentApproval("allow") } label: {
                    Label("Allow", systemImage: "checkmark").frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .tint(WatchTheme.teal)
                .primaryHandGestureShortcut()
                Text("Double Tap to allow")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(WatchTheme.teal)
            }
            .padding()
        }
    }
}

// MARK: - Reusable components

struct IconBadge: View {
    let icon: String
    let tint: Color

    var body: some View {
        Image(systemName: icon.isEmpty ? "bolt.fill" : icon)
            .font(.system(size: 14, weight: .semibold))
            .foregroundStyle(tint)
            .frame(width: 32, height: 32)
            .background(
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .fill(tint.opacity(0.18))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .stroke(tint.opacity(0.35), lineWidth: 0.5)
            )
    }
}

struct SectionLabel: View {
    let text: String
    let systemImage: String
    let tint: Color

    var body: some View {
        HStack(spacing: 5) {
            Image(systemName: systemImage)
                .font(.system(size: 10, weight: .bold))
                .foregroundStyle(tint)
            Text(text.uppercased())
                .font(.system(size: 11, weight: .heavy, design: .rounded))
                .foregroundStyle(.secondary)
            Spacer()
        }
        .padding(.top, 2)
    }
}

struct StatChip: View {
    let value: String
    let label: String
    let icon: String
    let tint: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Image(systemName: icon)
                .font(.system(size: 11, weight: .bold))
                .foregroundStyle(tint)
            Text(value)
                .font(.system(.title3, design: .rounded).weight(.bold))
            Text(label)
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(10)
        .glassDepth(corner: 14, tint: tint)
    }
}

struct InfoLine: View {
    let icon: String
    let title: String
    let value: String
    let tint: Color

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: icon)
                .font(.system(size: 13, weight: .bold))
                .foregroundStyle(tint)
                .frame(width: 22)
            VStack(alignment: .leading, spacing: 1) {
                Text(title)
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(.secondary)
                Text(value)
                    .font(.system(.footnote, design: .rounded).weight(.semibold))
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
            Spacer()
        }
        .padding(10)
        .frame(maxWidth: .infinity)
        .glassDepth(corner: 14)
    }
}

struct LiveDot: View {
    let connected: Bool
    @State private var pulse = false

    var body: some View {
        HStack(spacing: 5) {
            ZStack {
                Circle()
                    .fill((connected ? WatchTheme.teal : WatchTheme.amber).opacity(0.35))
                    .frame(width: 14, height: 14)
                    .scaleEffect(pulse ? 1.4 : 0.8)
                    .opacity(pulse ? 0 : 1)
                Circle()
                    .fill(connected ? WatchTheme.teal : WatchTheme.amber)
                    .frame(width: 7, height: 7)
            }
            Text(connected ? "LIVE" : "OFF")
                .font(.system(size: 9, weight: .heavy, design: .rounded))
                .foregroundStyle(connected ? WatchTheme.teal : WatchTheme.amber)
        }
        .onAppear {
            guard connected else { return }
            withAnimation(.easeOut(duration: 1.4).repeatForever(autoreverses: false)) { pulse = true }
        }
    }
}

struct ApprovalNudge: View {
    let text: String

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "bell.badge.fill")
                .font(.system(size: 13, weight: .bold))
                .foregroundStyle(.white)
            Text(text)
                .font(.system(.footnote, design: .rounded).weight(.semibold))
                .foregroundStyle(.white)
                .lineLimit(1)
            Spacer()
            Image(systemName: "chevron.right")
                .font(.system(size: 10, weight: .bold))
                .foregroundStyle(.white.opacity(0.8))
        }
        .padding(11)
        .frame(maxWidth: .infinity)
        .background(WatchTheme.accentGradient, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .shadow(color: WatchTheme.indigo.opacity(0.5), radius: 8, y: 3)
    }
}

struct BrowseAllButton: View {
    let count: Int

    var body: some View {
        HStack {
            Image(systemName: "square.grid.2x2")
                .font(.caption.weight(.bold))
                .foregroundStyle(WatchTheme.indigo)
            Text("All \(count) workflows")
                .font(.system(.footnote, design: .rounded).weight(.semibold))
            Spacer()
            Image(systemName: "chevron.down")
                .font(.system(size: 10, weight: .bold))
                .foregroundStyle(.secondary)
        }
        .padding(11)
        .frame(maxWidth: .infinity)
        .glassDepth(corner: 14)
    }
}

struct EmptyHint: View {
    let icon: String
    let title: String
    let message: String

    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: icon)
                .font(.title2)
                .foregroundStyle(WatchTheme.teal)
            Text(title)
                .font(.system(.headline, design: .rounded).weight(.bold))
            Text(message)
                .font(.caption2)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 18)
        .padding(.horizontal, 8)
        .glassDepth(corner: 16)
    }
}

struct StatusToast: View {
    let text: String
    let success: Bool

    var body: some View {
        Text(text)
            .font(.system(.caption2, design: .rounded).weight(.bold))
            .padding(.horizontal, 12).padding(.vertical, 7)
            .background(.ultraThinMaterial, in: Capsule())
            .overlay(Capsule().stroke((success ? WatchTheme.teal : Color.red).opacity(0.6), lineWidth: 1))
    }
}

// MARK: - Depth modifier (layered glass + shadow = the "3D" feel)

private struct GlassDepth: ViewModifier {
    var corner: CGFloat
    var tint: Color

    func body(content: Content) -> some View {
        content
            .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: corner, style: .continuous))
            .background(
                RoundedRectangle(cornerRadius: corner, style: .continuous)
                    .fill(tint.opacity(0.10))
            )
            .overlay(
                RoundedRectangle(cornerRadius: corner, style: .continuous)
                    .stroke(
                        LinearGradient(colors: [.white.opacity(0.25), .white.opacity(0.04)],
                                       startPoint: .topLeading, endPoint: .bottomTrailing),
                        lineWidth: 0.75
                    )
            )
            .shadow(color: .black.opacity(0.35), radius: 5, y: 3)
    }
}

private extension View {
    func glassDepth(corner: CGFloat, tint: Color = .white) -> some View {
        modifier(GlassDepth(corner: corner, tint: tint == .white ? .clear : tint))
    }

    @ViewBuilder
    func primaryHandGestureShortcut(isEnabled: Bool = true) -> some View {
        if #available(watchOS 11.0, *) {
            self.handGestureShortcut(.primaryAction, isEnabled: isEnabled)
        } else {
            self
        }
    }
}

// MARK: - Convenience

private extension WatchState {
    var pendingApprovalsBadge: String {
        currentApproval == nil ? "" : "Approval waiting · tap to review"
    }
}
