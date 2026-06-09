import Foundation
import Observation
import UserNotifications

/// Central app state for the iPhone app. Owns the computer list, the active
/// agent connection (HTTP + WebSocket), tasks, logs, and live approvals, and
/// bridges everything to the watch via `PhoneSessionManager`.
@MainActor
@Observable
final class AppState {
    var computers: [Computer] = []
    var selectedComputerID: String?
    var tasks: [AgentTask] = []
    var logs: [ExecutionLog] = []
    var pendingApprovals: [ApprovalRequest] = []
    var lastError: String?
    var isConnected = false
    var favoriteTaskIDs: Set<String> = []

    private var socket: AgentSocket?
    private let session = PhoneSessionManager.shared
    private var pushDeviceToken: String?
    private var pushTokenObserver: NSObjectProtocol?

    var selectedComputer: Computer? {
        computers.first { $0.id == selectedComputerID }
    }

    init() {
        computers = Persistence.loadComputers()
        selectedComputerID = Persistence.loadSelectedID() ?? computers.first?.id
        favoriteTaskIDs = Persistence.loadFavoriteTaskIDs()
        session.appState = self
        session.activate()
        pushTokenObserver = NotificationCenter.default.addObserver(
            forName: .quickDeskRemotePushToken,
            object: nil,
            queue: .main
        ) { [weak self] notification in
            guard let token = notification.object as? String else { return }
            Task { @MainActor in
                self?.pushDeviceToken = token
                await self?.registerPushTokenIfPossible()
            }
        }
        requestNotificationPermission()
        if selectedComputer != nil { connect() }
    }

    // MARK: - Computers

    func addComputer(_ c: Computer) {
        computers.removeAll { $0.id == c.id }
        computers.append(c)
        selectedComputerID = c.id
        persist()
        connect()
    }

    func removeComputer(_ c: Computer) {
        computers.removeAll { $0.id == c.id }
        if selectedComputerID == c.id { selectedComputerID = computers.first?.id }
        persist()
        connect()
    }

    func select(_ c: Computer) {
        selectedComputerID = c.id
        persist()
        connect()
    }

    private func persist() {
        Persistence.saveComputers(computers)
        Persistence.saveSelectedID(selectedComputerID)
    }

    private func updateSelectedComputer(with endpoint: AgentEndpoint) {
        guard let index = computers.firstIndex(where: { $0.id == endpoint.id }) else { return }
        guard computers[index].host != endpoint.host || computers[index].port != endpoint.port else { return }
        computers[index].host = endpoint.host
        computers[index].port = endpoint.port
        persist()
    }

    // MARK: - Connection lifecycle

    func connect() {
        socket?.disconnect()
        socket = nil
        isConnected = false
        guard let computer = selectedComputer else {
            pushStateToWatch()
            return
        }

        let sock = AgentSocket(computer: computer)
        sock.onEvent = { [weak self] event in
            Task { @MainActor in self?.handle(event) }
        }
        sock.connect()
        socket = sock
        isConnected = true
        pushStateToWatch()

        Task {
            await registerPushTokenIfPossible()
            await refresh()
        }
    }

    private func handle(_ event: AgentSocket.Event) {
        switch event {
        case .approvalCreated(let a):
            if !pendingApprovals.contains(where: { $0.id == a.id }) {
                pendingApprovals.append(a)
                notifyApproval(a)
            }
            pushStateToWatch()               // push tasks + approvals to watch
        case .approvalResolved(let a):
            pendingApprovals.removeAll { $0.id == a.id }
            pushStateToWatch()
        case .executionFinished(let log):
            logs.insert(log, at: 0)
            session.sendStatus(log)
        case .tasksUpdated(let updatedTasks):
            tasks = updatedTasks
            pushStateToWatch()
        }
    }

    /// Current phone state represented as one reliable watch payload.
    func watchPayload() -> SyncPayload {
        let favoriteTasks = tasks.sorted { lhs, rhs in
            let lf = favoriteTaskIDs.contains(lhs.id)
            let rf = favoriteTaskIDs.contains(rhs.id)
            if lf != rf { return lf && !rf }
            return lhs.name < rhs.name
        }
        let address = selectedComputer.map { "\($0.host):\($0.port)" }
        return SyncPayload(tasks: favoriteTasks,
                           approvals: pendingApprovals,
                           isConnected: isConnected,
                           computerName: selectedComputer?.name,
                           computerAddress: address)
    }

    /// Send the current tasks + pending approvals + connection status to the watch.
    func pushStateToWatch() {
        session.pushState(payload: watchPayload())
    }

    func isFavorite(_ task: AgentTask) -> Bool {
        favoriteTaskIDs.contains(task.id)
    }

    func toggleFavorite(_ task: AgentTask) {
        if favoriteTaskIDs.contains(task.id) {
            favoriteTaskIDs.remove(task.id)
        } else {
            favoriteTaskIDs.insert(task.id)
        }
        Persistence.saveFavoriteTaskIDs(favoriteTaskIDs)
        pushStateToWatch()
    }

    // MARK: - Data

    func refresh() async {
        guard let computer = selectedComputer else { return }
        if let endpoint = await AgentDiscovery.shared.endpoint(for: computer, timeout: 1.2) {
            updateSelectedComputer(with: endpoint)
        }
        guard let computer = selectedComputer else { return }
        let client = AgentClient(computer: computer)
        do {
            tasks = try await client.fetchTasks()
            logs = try await client.fetchLogs()
            let approvals = try await client.fetchApprovals()
            let newApprovals = approvals.filter { incoming in
                !pendingApprovals.contains { $0.id == incoming.id }
            }
            isConnected = true
            lastError = nil
            pendingApprovals = approvals
            newApprovals.forEach(notifyApproval)
            pushStateToWatch()               // keep watch in sync
        } catch {
            lastError = error.localizedDescription
            isConnected = false
            pushStateToWatch()
        }
    }

    // MARK: - Actions (also invoked on behalf of the watch)

    func execute(taskId: String, confirmed: Bool) async -> ExecutionLog? {
        guard let computer = selectedComputer else { return nil }
        do {
            let log = try await AgentClient(computer: computer).execute(taskId: taskId, confirmed: confirmed)
            logs.insert(log, at: 0)
            return log
        } catch {
            lastError = error.localizedDescription
            return nil
        }
    }

    func installDeveloperPack() async -> DeveloperPackResponse? {
        guard let computer = selectedComputer else { return nil }
        do {
            let response = try await AgentClient(computer: computer).installDeveloperPack()
            tasks = response.tasks
            pushStateToWatch()
            return response
        } catch {
            lastError = error.localizedDescription
            return nil
        }
    }

    func decide(approvalID: String, decision: String) async {
        guard let computer = selectedComputer else { return }
        pendingApprovals.removeAll { $0.id == approvalID }
        pushStateToWatch()   // clear the approval on the watch immediately
        do {
            try await AgentClient(computer: computer).decideApproval(id: approvalID, decision: decision)
        } catch {
            lastError = error.localizedDescription
        }
    }

    private func requestNotificationPermission() {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { _, _ in }
    }

    private func registerPushTokenIfPossible() async {
        guard let computer = selectedComputer, let pushDeviceToken else { return }
        do {
            try await AgentClient(computer: computer).registerPushToken(pushDeviceToken)
        } catch {
            lastError = error.localizedDescription
        }
    }

    private func notifyApproval(_ approval: ApprovalRequest) {
        let content = UNMutableNotificationContent()
        content.title = approval.title
        content.body = approval.summary.isEmpty ? "QuickDesk approval is waiting." : approval.summary
        content.sound = .default

        let request = UNNotificationRequest(
            identifier: "quickdesk.approval.\(approval.id)",
            content: content,
            trigger: nil
        )
        UNUserNotificationCenter.current().add(request)
    }
}
