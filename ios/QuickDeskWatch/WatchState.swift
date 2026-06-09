import Foundation
import Observation
import WatchKit

/// State for the Apple Watch app. The watch never talks to the agent directly;
/// it exchanges messages with the iPhone, which relays to the desktop agent.
@MainActor
@Observable
final class WatchState {
    var tasks: [AgentTask] = []
    var favoriteIDs: Set<String> = []         // tasks starred on iPhone
    var currentApproval: ApprovalRequest?     // shown as a sheet when set
    var lastStatus: String?                   // brief result toast
    var lastStatusSuccess = true
    var lastLog: ExecutionLog?                // most recent execution result
    var busyTaskID: String?
    var isConnected = false
    var computerName: String?
    var computerAddress: String?

    /// Tasks the user marked as favorites on the iPhone, in name order.
    var favoriteTasks: [AgentTask] {
        tasks.filter { favoriteIDs.contains($0.id) }.sorted { $0.name < $1.name }
    }

    var isFavorite: (AgentTask) -> Bool { { [favoriteIDs] in favoriteIDs.contains($0.id) } }

    private let session = WatchSessionManager.shared

    init() {
        session.state = self
        session.activate()
    }

    // MARK: - Haptics

    /// Distinct buzz so an approval request is *felt* even without looking.
    func playApprovalHaptic() {
        let device = WKInterfaceDevice.current()
        device.play(.notification)
        // A second tap shortly after makes the approval feel urgent/different
        // from a normal notification.
        Task { try? await Task.sleep(for: .milliseconds(450)); device.play(.directionUp) }
    }

    private func playResultHaptic(success: Bool) {
        WKInterfaceDevice.current().play(success ? .success : .failure)
    }

    func execute(_ task: AgentTask) {
        WKInterfaceDevice.current().play(.start)
        busyTaskID = task.id
        session.sendExecute(taskId: task.id, confirmed: task.requiresConfirmation)
        // Clear the spinner if no status comes back shortly.
        Task { try? await Task.sleep(for: .seconds(8)); if busyTaskID == task.id { busyTaskID = nil } }
    }

    func decideCurrentApproval(_ decision: String) {
        guard let a = currentApproval else { return }
        WKInterfaceDevice.current().play(decision == "allow" ? .success : .failure)
        session.sendDecision(approvalId: a.id, decision: decision)
        currentApproval = nil
    }

    // Combined state from the phone (tasks + pending approvals). The first
    // pending approval is surfaced as a sheet; tasks fill the main list.
    func didReceiveState(_ payload: SyncPayload) {
        self.tasks = payload.tasks
        self.favoriteIDs = Set(payload.favoriteIDs)
        self.isConnected = payload.isConnected
        self.computerName = payload.computerName
        self.computerAddress = payload.computerAddress
        if let log = payload.lastLog { self.lastLog = log }
        if let first = payload.approvals.first {
            if currentApproval?.id != first.id {
                currentApproval = first
                playApprovalHaptic()          // buzz when a new approval arrives
            }
        } else {
            currentApproval = nil
        }
    }

    // Called by the session manager when messages arrive from the phone.
    func didReceiveTasks(_ tasks: [AgentTask]) { self.tasks = tasks }

    func didReceiveApproval(_ a: ApprovalRequest) {
        if currentApproval?.id != a.id { playApprovalHaptic() }
        currentApproval = a
    }

    func didResolveApproval(id: String) {
        if currentApproval?.id == id { currentApproval = nil }
    }

    func didReceiveStatus(_ log: ExecutionLog) {
        busyTaskID = nil
        lastLog = log
        let success = log.status == .success
        lastStatusSuccess = success
        lastStatus = (success ? "✓ " : "✗ ") + (log.taskName ?? "Done")
        playResultHaptic(success: success)
        Task { try? await Task.sleep(for: .seconds(2)); lastStatus = nil }
    }
}
