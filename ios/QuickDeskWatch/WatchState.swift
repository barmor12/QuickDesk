import Foundation
import Observation

/// State for the Apple Watch app. The watch never talks to the agent directly;
/// it exchanges messages with the iPhone, which relays to the desktop agent.
@MainActor
@Observable
final class WatchState {
    var tasks: [AgentTask] = []
    var currentApproval: ApprovalRequest?     // shown as a sheet when set
    var lastStatus: String?                   // brief result toast
    var busyTaskID: String?

    private let session = WatchSessionManager.shared

    init() {
        session.state = self
        session.activate()
    }

    func execute(_ task: AgentTask) {
        busyTaskID = task.id
        session.sendExecute(taskId: task.id, confirmed: task.requiresConfirmation)
        // Clear the spinner if no status comes back shortly.
        Task { try? await Task.sleep(for: .seconds(8)); if busyTaskID == task.id { busyTaskID = nil } }
    }

    func decideCurrentApproval(_ decision: String) {
        guard let a = currentApproval else { return }
        session.sendDecision(approvalId: a.id, decision: decision)
        currentApproval = nil
    }

    // Combined state from the phone (tasks + pending approvals). The first
    // pending approval is surfaced as a sheet; tasks fill the main list.
    func didReceiveState(_ payload: SyncPayload) {
        self.tasks = payload.tasks
        if let first = payload.approvals.first {
            if currentApproval?.id != first.id { currentApproval = first }
        } else {
            currentApproval = nil
        }
    }

    // Called by the session manager when messages arrive from the phone.
    func didReceiveTasks(_ tasks: [AgentTask]) { self.tasks = tasks }

    func didReceiveApproval(_ a: ApprovalRequest) { currentApproval = a }

    func didResolveApproval(id: String) {
        if currentApproval?.id == id { currentApproval = nil }
    }

    func didReceiveStatus(_ log: ExecutionLog) {
        busyTaskID = nil
        lastStatus = (log.status == .success ? "✓ " : "✗ ") + (log.taskName ?? "Done")
        Task { try? await Task.sleep(for: .seconds(2)); lastStatus = nil }
    }
}
