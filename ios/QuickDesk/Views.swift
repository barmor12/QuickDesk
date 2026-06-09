import SwiftUI

// MARK: - Root

struct RootView: View {
    @Environment(AppState.self) private var state

    var body: some View {
        TabView {
            TasksView()
                .tabItem { Label("Tasks", systemImage: "bolt.fill") }
            ApprovalsView()
                .tabItem { Label("Approvals", systemImage: "checkmark.shield.fill") }
                .badge(state.pendingApprovals.count)
            AgentHubView()
                .tabItem { Label("Agent", systemImage: "wave.3.right.circle.fill") }
            ComputersView()
                .tabItem { Label("Computers", systemImage: "desktopcomputer") }
        }
    }
}

// MARK: - Tasks

struct TasksView: View {
    @Environment(AppState.self) private var state
    @State private var confirming: AgentTask?
    @State private var inspecting: AgentTask?
    @State private var query = ""
    @State private var category: TaskCategory?
    @State private var toast: String?

    private var filteredTasks: [AgentTask] {
        state.tasks.filter { task in
            let matchesCategory = category == nil || task.category == category
            let text = "\(task.name) \(task.category.rawValue) \(task.actions.map(\.value).joined(separator: " "))"
            let matchesQuery = query.isEmpty || text.localizedCaseInsensitiveContains(query)
            return matchesCategory && matchesQuery
        }
        .sorted { lhs, rhs in
            let lf = state.isFavorite(lhs)
            let rf = state.isFavorite(rhs)
            if lf != rf { return lf && !rf }
            return lhs.name < rhs.name
        }
    }

    private var favoriteTasks: [AgentTask] {
        state.tasks.filter(state.isFavorite).sorted { $0.name < $1.name }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                if state.selectedComputer == nil {
                    EmptyStatePanel(icon: "desktopcomputer", title: "No computer paired",
                                    message: "Add your Mac once, then run useful workflows from here and your watch.")
                        .padding()
                } else if state.tasks.isEmpty {
                    EmptyStatePanel(icon: "bolt.slash", title: "No tasks yet",
                                    message: "Add tasks on the agent to turn QuickDesk into a real command center.")
                        .padding()
                } else {
                    VStack(spacing: 18) {
                        HeroStatusPanel()
                        SearchField(text: $query)
                        CategoryFilter(selection: $category)

                        if !favoriteTasks.isEmpty {
                            SectionHeader(title: "Quick launch", subtitle: "\(favoriteTasks.count) favorite workflows")
                            LazyVGrid(columns: [GridItem(.adaptive(minimum: 150), spacing: 12)], spacing: 12) {
                                ForEach(favoriteTasks) { task in
                                    QuickTaskTile(task: task) { run(task) }
                                }
                            }
                        }

                        SectionHeader(title: "Workflows", subtitle: "\(filteredTasks.count) ready")
                        LazyVStack(spacing: 10) {
                            ForEach(filteredTasks) { task in
                                TaskCard(
                                    task: task,
                                    isFavorite: state.isFavorite(task),
                                    run: { run(task) },
                                    inspect: { inspecting = task },
                                    toggleFavorite: { state.toggleFavorite(task) }
                                )
                            }
                        }
                    }
                    .padding()
                }
            }
            .background(AppTheme.background.ignoresSafeArea())
            .navigationTitle("QuickDesk")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { Task { await state.refresh() } } label: {
                        Image(systemName: "arrow.clockwise")
                    }
                }
            }
            .refreshable { await state.refresh() }
            .overlay(alignment: .bottom) { ToastView(text: toast) }
            .sheet(item: $inspecting) { task in
                TaskDetailView(task: task,
                               isFavorite: state.isFavorite(task),
                               run: { run(task); inspecting = nil },
                               toggleFavorite: { state.toggleFavorite(task) })
            }
            .confirmationDialog("Run \"\(confirming?.name ?? "")\"?",
                                isPresented: Binding(get: { confirming != nil },
                                                     set: { if !$0 { confirming = nil } }),
                                titleVisibility: .visible) {
                Button("Run", role: .destructive) {
                    if let t = confirming { execute(t, confirmed: true) }
                    confirming = nil
                }
                Button("Cancel", role: .cancel) { confirming = nil }
            } message: { Text("This task is marked as sensitive.") }
        }
    }

    private func run(_ task: AgentTask) {
        if task.requiresConfirmation { confirming = task }
        else { execute(task, confirmed: false) }
    }

    private func execute(_ task: AgentTask, confirmed: Bool) {
        Task {
            let log = await state.execute(taskId: task.id, confirmed: confirmed)
            showToast(log?.status == .success ? "✓ \(task.name)" : "✗ \(task.name) failed")
        }
    }

    private func showToast(_ text: String) {
        toast = text
        Task { try? await Task.sleep(for: .seconds(2)); toast = nil }
    }
}

struct TaskRow: View {
    let task: AgentTask
    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: task.icon.isEmpty ? "bolt.fill" : task.icon)
                .font(.title2).frame(width: 34)
                .foregroundStyle(.tint)
            VStack(alignment: .leading) {
                Text(task.name).font(.headline)
                Text(task.category.rawValue).font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            if task.requiresConfirmation {
                Image(systemName: "exclamationmark.shield").foregroundStyle(.orange)
            }
        }
        .padding(.vertical, 4)
    }
}

struct HeroStatusPanel: View {
    @Environment(AppState.self) private var state

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 6) {
                    Text(state.selectedComputer?.name ?? "QuickDesk")
                        .font(.system(.title2, design: .rounded, weight: .bold))
                    Text(state.isConnected ? "Agent online and ready" : "Waiting for agent")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                StatusBadge(connected: state.isConnected)
            }

            HStack(spacing: 10) {
                MetricPill(title: "Tasks", value: "\(state.tasks.count)", icon: "bolt.fill", color: AppTheme.teal)
                MetricPill(title: "Favorites", value: "\(state.favoriteTaskIDs.count)", icon: "star.fill", color: .orange)
                MetricPill(title: "Approvals", value: "\(state.pendingApprovals.count)", icon: "shield.lefthalf.filled", color: .indigo)
            }
        }
        .padding(18)
        .background(AppTheme.panel, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .stroke(AppTheme.border)
        }
    }
}

struct SearchField: View {
    @Binding var text: String

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: "magnifyingglass")
                .foregroundStyle(.secondary)
            TextField("Search tasks, apps, commands...", text: $text)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
            if !text.isEmpty {
                Button { text = "" } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(.secondary)
                }
            }
        }
        .padding(.horizontal, 14)
        .frame(height: 48)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(AppTheme.border)
        }
    }
}

struct CategoryFilter: View {
    @Binding var selection: TaskCategory?

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                FilterChip(title: "All", selected: selection == nil) { selection = nil }
                ForEach(TaskCategory.allCases, id: \.self) { category in
                    FilterChip(title: category.rawValue, selected: selection == category) {
                        selection = category
                    }
                }
            }
        }
    }
}

struct FilterChip: View {
    let title: String
    let selected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.subheadline.weight(.semibold))
                .padding(.horizontal, 14)
                .frame(height: 36)
        }
        .buttonStyle(.plain)
        .foregroundStyle(selected ? .white : .primary)
        .background(selected ? AppTheme.teal : Color(.secondarySystemGroupedBackground),
                    in: Capsule())
    }
}

struct TaskCard: View {
    let task: AgentTask
    let isFavorite: Bool
    let run: () -> Void
    let inspect: () -> Void
    let toggleFavorite: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 12) {
                SymbolBubble(icon: task.icon, color: color(for: task.category))
                VStack(alignment: .leading, spacing: 3) {
                    Text(task.name)
                        .font(.headline)
                    Text("\(task.category.rawValue) • \(task.actions.count) action\(task.actions.count == 1 ? "" : "s")")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Button(action: toggleFavorite) {
                    Image(systemName: isFavorite ? "star.fill" : "star")
                        .foregroundStyle(isFavorite ? .orange : .secondary)
                }
                .buttonStyle(.plain)
            }

            if let first = task.actions.sorted(by: { $0.order < $1.order }).first {
                Text(actionSummary(first))
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }

            HStack(spacing: 10) {
                Button(action: run) {
                    Label(task.requiresConfirmation ? "Review & Run" : "Run", systemImage: "play.fill")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .tint(task.requiresConfirmation ? .orange : AppTheme.teal)

                Button(action: inspect) {
                    Image(systemName: "slider.horizontal.3")
                        .frame(width: 44, height: 34)
                }
                .buttonStyle(.bordered)
            }
        }
        .padding(16)
        .background(AppTheme.panel, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(AppTheme.border)
        }
    }

    private func color(for category: TaskCategory) -> Color {
        switch category {
        case .Development: return .indigo
        case .Work: return AppTheme.teal
        case .System: return .orange
        case .Custom: return .pink
        }
    }

    private func actionSummary(_ action: TaskAction) -> String {
        switch action.type {
        case .openApp: return "Opens \(action.value)"
        case .openUrl: return "Launches \(action.value)"
        case .runCommand: return "Runs command: \(action.value)"
        case .runScript: return "Runs script: \(action.value)"
        case .systemAction: return "System action: \(action.value)"
        }
    }
}

struct QuickTaskTile: View {
    let task: AgentTask
    let run: () -> Void

    var body: some View {
        Button(action: run) {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    SymbolBubble(icon: task.icon, color: AppTheme.teal)
                    Spacer()
                    Image(systemName: "play.circle.fill")
                        .foregroundStyle(AppTheme.teal)
                }
                Text(task.name)
                    .font(.headline)
                    .foregroundStyle(.primary)
                    .lineLimit(2)
                Text(task.category.rawValue)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(14)
            .background(AppTheme.panel, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .stroke(AppTheme.border)
            }
        }
        .buttonStyle(.plain)
    }
}

struct TaskDetailView: View {
    let task: AgentTask
    let isFavorite: Bool
    let run: () -> Void
    let toggleFavorite: () -> Void
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                Section {
                    VStack(alignment: .leading, spacing: 10) {
                        SymbolBubble(icon: task.icon, color: AppTheme.teal)
                        Text(task.name).font(.title2.bold())
                        Text(task.category.rawValue)
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(.secondary)
                    }
                    .padding(.vertical, 8)
                }
                Section("Actions") {
                    ForEach(task.actions.sorted(by: { $0.order < $1.order }), id: \.order) { action in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(action.type.rawValue)
                                .font(.caption.weight(.bold))
                                .foregroundStyle(AppTheme.teal)
                            Text(action.value)
                                .font(.system(.subheadline, design: .monospaced))
                        }
                    }
                }
                Section {
                    Button { toggleFavorite() } label: {
                        Label(isFavorite ? "Remove from Quick Launch" : "Add to Quick Launch",
                              systemImage: isFavorite ? "star.slash" : "star")
                    }
                    Button(role: task.requiresConfirmation ? .destructive : nil) { run() } label: {
                        Label(task.requiresConfirmation ? "Review & Run" : "Run Now", systemImage: "play.fill")
                    }
                }
            }
            .navigationTitle("Workflow")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }
}

// MARK: - Approvals

struct ApprovalsView: View {
    @Environment(AppState.self) private var state

    var body: some View {
        NavigationStack {
            Group {
                if state.pendingApprovals.isEmpty {
                    ContentUnavailableView("No pending approvals",
                        systemImage: "checkmark.shield",
                        description: Text("Claude and Codex permission prompts will appear here and on your watch."))
                } else {
                    List(state.pendingApprovals) { approval in
                        ApprovalCard(approval: approval)
                    }
                }
            }
            .navigationTitle("Approvals")
        }
    }
}

struct ApprovalCard: View {
    @Environment(AppState.self) private var state
    let approval: ApprovalRequest

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(approval.title).font(.headline)
            if !approval.summary.isEmpty {
                Text(approval.summary).font(.system(.subheadline, design: .monospaced))
                    .lineLimit(4)
            }
            if let cwd = approval.cwd { Text(cwd).font(.caption2).foregroundStyle(.secondary) }
            HStack {
                Button("Deny", role: .destructive) { decide("deny") }
                    .buttonStyle(.bordered)
                Spacer()
                Button("Allow") { decide("allow") }
                    .buttonStyle(.borderedProminent)
            }
        }
        .padding(.vertical, 6)
    }

    private func decide(_ d: String) {
        Task { await state.decide(approvalID: approval.id, decision: d) }
    }
}

// MARK: - Agent Hub

struct AgentHubView: View {
    @Environment(AppState.self) private var state
    @State private var health: AgentClient.HealthResponse?
    @State private var checking = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    AgentHeroCard(health: health, checking: checking)

                    if !state.pendingApprovals.isEmpty {
                        SectionHeader(title: "Waiting for you", subtitle: "\(state.pendingApprovals.count) approval prompt\(state.pendingApprovals.count == 1 ? "" : "s")")
                        VStack(spacing: 10) {
                            ForEach(state.pendingApprovals) { approval in
                                ApprovalCard(approval: approval)
                                    .padding(14)
                                    .background(AppTheme.panel, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                                    .overlay {
                                        RoundedRectangle(cornerRadius: 16, style: .continuous)
                                            .stroke(AppTheme.border)
                                    }
                            }
                        }
                    }

                    SectionHeader(title: "Control center", subtitle: "Useful checks before you run workflows")
                    VStack(spacing: 10) {
                        HubActionRow(icon: "arrow.clockwise", title: "Refresh tasks and approvals",
                                     subtitle: "Sync iPhone and watch with the agent") {
                            Task { await state.refresh(); await checkHealth() }
                        }
                        HubInfoRow(icon: "applewatch", title: "Watch sync",
                                   subtitle: "Favorites are pushed first so the watch stays fast.")
                        HubInfoRow(icon: "network", title: "Network fallback",
                                   subtitle: state.selectedComputer.map { "\($0.host):\($0.port)" } ?? "No computer selected")
                    }

                    if let error = state.lastError {
                        Text(error)
                            .font(.footnote)
                            .foregroundStyle(.red)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding()
                            .background(Color.red.opacity(0.08), in: RoundedRectangle(cornerRadius: 14))
                    }
                }
                .padding()
            }
            .background(AppTheme.background.ignoresSafeArea())
            .navigationTitle("Agent")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { Task { await checkHealth() } } label: {
                        Image(systemName: "stethoscope")
                    }
                }
            }
            .refreshable { await checkHealth(); await state.refresh() }
            .task { await checkHealth() }
        }
    }

    private func checkHealth() async {
        guard let computer = state.selectedComputer else { return }
        checking = true
        defer { checking = false }
        health = try? await AgentClient.health(host: computer.host, port: computer.port)
    }
}

struct AgentHeroCard: View {
    @Environment(AppState.self) private var state
    let health: AgentClient.HealthResponse?
    let checking: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                SymbolBubble(icon: "wave.3.right.circle.fill", color: state.isConnected ? AppTheme.teal : .orange)
                VStack(alignment: .leading, spacing: 3) {
                    Text(health?.agent.name ?? state.selectedComputer?.name ?? "No agent")
                        .font(.title3.bold())
                    Text(state.isConnected ? "Connected" : checking ? "Checking..." : "Not connected")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                StatusBadge(connected: state.isConnected)
            }

            HStack(spacing: 10) {
                MetricPill(title: "Tasks", value: "\(state.tasks.count)", icon: "bolt.fill", color: AppTheme.teal)
                MetricPill(title: "Queue", value: "\(state.pendingApprovals.count)", icon: "checkmark.shield.fill", color: .indigo)
                MetricPill(title: "Auto pair", value: health?.autoPairing == true ? "On" : "-", icon: "link", color: .orange)
            }
        }
        .padding(18)
        .background(AppTheme.panel, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .stroke(AppTheme.border)
        }
    }
}

struct HubActionRow: View {
    let icon: String
    let title: String
    let subtitle: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HubRowContent(icon: icon, title: title, subtitle: subtitle, trailing: "arrow.clockwise")
        }
        .buttonStyle(.plain)
    }
}

struct HubInfoRow: View {
    let icon: String
    let title: String
    let subtitle: String

    var body: some View {
        HubRowContent(icon: icon, title: title, subtitle: subtitle, trailing: nil)
    }
}

struct HubRowContent: View {
    let icon: String
    let title: String
    let subtitle: String
    let trailing: String?

    var body: some View {
        HStack(spacing: 12) {
            SymbolBubble(icon: icon, color: AppTheme.teal)
            VStack(alignment: .leading, spacing: 3) {
                Text(title).font(.headline)
                Text(subtitle)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }
            Spacer()
            if let trailing {
                Image(systemName: trailing).foregroundStyle(.secondary)
            }
        }
        .padding(14)
        .background(AppTheme.panel, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(AppTheme.border)
        }
    }
}

// MARK: - Computers

struct ComputersView: View {
    @Environment(AppState.self) private var state
    @State private var adding = false

    var body: some View {
        NavigationStack {
            List {
                ForEach(state.computers) { c in
                    Button { state.select(c) } label: {
                        HStack {
                            Image(systemName: c.os == "Windows" ? "pc" : "desktopcomputer")
                            VStack(alignment: .leading) {
                                Text(c.name).font(.headline)
                                Text("\(c.host):\(String(c.port)) · \(c.os)")
                                    .font(.caption).foregroundStyle(.secondary)
                            }
                            Spacer()
                            if c.id == state.selectedComputerID {
                                Image(systemName: "checkmark.circle.fill").foregroundStyle(.tint)
                            }
                        }
                    }
                    .foregroundStyle(.primary)
                }
                .onDelete { idx in idx.map { state.computers[$0] }.forEach(state.removeComputer) }
            }
            .navigationTitle("Computers")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { adding = true } label: { Image(systemName: "plus") }
                }
            }
            .sheet(isPresented: $adding) { AddComputerView() }
        }
    }
}

struct AddComputerView: View {
    @Environment(AppState.self) private var state
    @Environment(\.dismiss) private var dismiss
    @State private var host = ""
    @State private var port = "7420"
    @State private var code = ""
    @State private var status: String?
    @State private var busy = false
    @State private var scanning = false
    @State private var nearby: [AgentEndpoint] = []
    @State private var selectedNearby: AgentEndpoint?

    var body: some View {
        NavigationStack {
            Form {
                Section("Nearby agents") {
                    if nearby.isEmpty {
                        Text(scanning ? "Scanning..." : "No agents found")
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(nearby) { agent in
                            Button {
                                selectedNearby = agent
                                host = agent.host
                                port = String(agent.port)
                                code = ""
                                status = agent.autoPairing ? "Selected \(agent.name). No code needed." : "Selected \(agent.name)"
                            } label: {
                                VStack(alignment: .leading) {
                                    Text(agent.name)
                                    Text("\(agent.host):\(agent.port) · \(agent.os)")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                            }
                        }
                    }
                    Button(scanning ? "Scanning..." : "Scan again") { scan() }
                        .disabled(scanning)
                }
                Section("Agent address") {
                    TextField("IP, hostname, or https:// URL", text: $host)
                        .textInputAutocapitalization(.never).autocorrectionDisabled()
                    TextField("Port", text: $port).keyboardType(.numberPad)
                }
                Section(selectedNearby?.autoPairing == true ? "Pairing code (optional)" : "Pairing code") {
                    TextField(selectedNearby?.autoPairing == true ? "Leave empty for automatic pairing" : "6-digit code from agent console", text: $code)
                        .keyboardType(.numberPad)
                }
                if let status { Text(status).foregroundStyle(.secondary) }
                Section {
                    Button(busy ? "Pairing…" : "Pair") { pair() }
                        .disabled(busy || host.isEmpty)
                }
            }
            .navigationTitle("Add Computer")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
            }
            .task { scan() }
        }
    }

    private func scan() {
        scanning = true
        Task {
            nearby = await AgentDiscovery.shared.discover()
            scanning = false
        }
    }

    private func pair() {
        busy = true; status = "Connecting…"
        Task {
            defer { busy = false }
            do {
                let p = Int(port) ?? 7420
                let health = try await AgentClient.health(host: host, port: p)
                let computer: Computer
                if code.isEmpty, selectedNearby?.autoPairing == true || health.autoPairing == true {
                    computer = try await AgentClient.autoPair(host: host, port: p,
                                                              clientName: UIDevice.current.name)
                } else {
                    computer = try await AgentClient.pair(host: host, port: p, code: code,
                                                          clientName: UIDevice.current.name)
                }
                state.addComputer(computer)
                dismiss()
            } catch {
                status = error.localizedDescription
            }
        }
    }
}

// MARK: - Small UI helpers

enum AppTheme {
    static let teal = Color(red: 0.05, green: 0.58, blue: 0.52)
    static let background = Color(.systemGroupedBackground)
    static let panel = Color(.secondarySystemGroupedBackground)
    static let border = Color.primary.opacity(0.08)
}

struct SectionHeader: View {
    let title: String
    let subtitle: String

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.headline)
                Text(subtitle)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
        }
    }
}

struct SymbolBubble: View {
    let icon: String
    let color: Color

    var body: some View {
        Image(systemName: icon.isEmpty ? "bolt.fill" : icon)
            .font(.headline)
            .foregroundStyle(color)
            .frame(width: 40, height: 40)
            .background(color.opacity(0.12), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    }
}

struct StatusBadge: View {
    let connected: Bool

    var body: some View {
        HStack(spacing: 6) {
            Circle()
                .fill(connected ? .green : .orange)
                .frame(width: 8, height: 8)
            Text(connected ? "Online" : "Offline")
                .font(.caption.weight(.bold))
        }
        .padding(.horizontal, 10)
        .frame(height: 28)
        .background((connected ? Color.green : Color.orange).opacity(0.12), in: Capsule())
        .foregroundStyle(connected ? .green : .orange)
    }
}

struct MetricPill: View {
    let title: String
    let value: String
    let icon: String
    let color: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Image(systemName: icon)
                    .font(.caption.weight(.bold))
                Spacer()
            }
            Text(value)
                .font(.headline.weight(.bold))
            Text(title)
                .font(.caption2.weight(.semibold))
                .foregroundStyle(.secondary)
        }
        .foregroundStyle(color)
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(color.opacity(0.10), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
}

struct EmptyStatePanel: View {
    let icon: String
    let title: String
    let message: String

    var body: some View {
        VStack(spacing: 12) {
            SymbolBubble(icon: icon, color: AppTheme.teal)
            Text(title)
                .font(.title3.bold())
            Text(message)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(26)
        .background(AppTheme.panel, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .stroke(AppTheme.border)
        }
    }
}

struct ConnectionDot: View {
    let connected: Bool
    var body: some View {
        Circle().fill(connected ? .green : .red).frame(width: 10, height: 10)
    }
}

struct ToastView: View {
    let text: String?
    var body: some View {
        if let text {
            Text(text)
                .padding(.horizontal, 16).padding(.vertical, 10)
                .background(.ultraThinMaterial, in: Capsule())
                .padding(.bottom, 8)
                .transition(.move(edge: .bottom).combined(with: .opacity))
        }
    }
}
