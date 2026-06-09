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

struct WatchRootView: View {
    @Environment(WatchState.self) private var state

    var body: some View {
        NavigationStack {
            ScrollView {
                if state.tasks.isEmpty {
                    VStack(spacing: 10) {
                        Image(systemName: "bolt.slash")
                            .font(.title2)
                            .foregroundStyle(.secondary)
                        Text("No tasks")
                            .font(.headline)
                        Text("Open QuickDesk on iPhone to sync.")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .padding(.top, 28)
                } else {
                    VStack(alignment: .leading, spacing: 10) {
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text("QuickDesk")
                                    .font(.headline)
                                Text("\(state.tasks.count) workflows ready")
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                            }
                            Spacer()
                            Image(systemName: "bolt.fill")
                                .foregroundStyle(.teal)
                        }
                        ForEach(state.tasks) { task in
                            WatchTaskButton(task: task,
                                            busy: state.busyTaskID == task.id) {
                                state.execute(task)
                            }
                        }
                    }
                    .padding(.vertical, 8)
                }
            }
            .navigationTitle("QuickDesk")
            .overlay(alignment: .bottom) {
                if let s = state.lastStatus {
                    Text(s).font(.footnote)
                        .padding(8).background(.ultraThinMaterial, in: Capsule())
                }
            }
        }
        .sheet(item: Binding(get: { state.currentApproval },
                             set: { if $0 == nil { state.currentApproval = nil } })) { approval in
            ApprovalSheet(approval: approval)
        }
    }
}

struct WatchTaskButton: View {
    let task: AgentTask
    let busy: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 10) {
                Image(systemName: task.icon.isEmpty ? "bolt.fill" : task.icon)
                    .font(.headline)
                    .frame(width: 28, height: 28)
                    .foregroundStyle(.teal)
                    .background(.teal.opacity(0.14), in: RoundedRectangle(cornerRadius: 8))
                VStack(alignment: .leading, spacing: 2) {
                    Text(task.name)
                        .font(.subheadline.weight(.semibold))
                        .lineLimit(1)
                    Text(task.category.rawValue)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                if busy {
                    ProgressView()
                } else {
                    Image(systemName: task.requiresConfirmation ? "shield.lefthalf.filled" : "play.fill")
                        .font(.caption)
                        .foregroundStyle(task.requiresConfirmation ? .orange : .secondary)
                }
            }
            .padding(.vertical, 7)
        }
        .buttonStyle(.plain)
    }
}

struct ApprovalSheet: View {
    @Environment(WatchState.self) private var state
    let approval: ApprovalRequest

    var body: some View {
        ScrollView {
            VStack(spacing: 12) {
                Image(systemName: "checkmark.shield.fill")
                    .font(.largeTitle).foregroundStyle(.tint)
                Text(approval.title).font(.headline).multilineTextAlignment(.center)
                if !approval.summary.isEmpty {
                    Text(approval.summary)
                        .font(.system(.caption, design: .monospaced))
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
            }
            .padding()
        }
    }
}
