import Foundation
import WatchConnectivity

/// WatchConnectivity on the watch side. Receives tasks/approvals/status from
/// the phone and sends execute/decision commands back.
final class WatchSessionManager: NSObject, WCSessionDelegate {
    static let shared = WatchSessionManager()
    weak var state: WatchState?

    private var session: WCSession { .default }

    func activate() {
        guard WCSession.isSupported() else { return }
        session.delegate = self
        session.activate()
    }

    // MARK: - Watch -> Phone

    func requestSync() {
        send(WatchMessage.encode(.requestSync, ["v": 1]))
    }

    func sendExecute(taskId: String, confirmed: Bool) {
        send(WatchMessage.encode(.execute, ExecuteRequest(taskId: taskId, confirmed: confirmed)))
    }

    func sendDecision(approvalId: String, decision: String) {
        send(WatchMessage.encode(.decision, DecisionRequest(approvalId: approvalId, decision: decision)))
    }

    private func send(_ message: [String: Any]) {
        guard session.activationState == .activated else { return }
        if session.isReachable {
            session.sendMessage(message, replyHandler: nil) { [weak self] _ in
                self?.session.transferUserInfo(message)
            }
        } else {
            session.transferUserInfo(message)
        }
    }

    // MARK: - Phone -> Watch

    func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) {
        route(applicationContext)
    }
    func session(_ session: WCSession, didReceiveMessage message: [String: Any]) { route(message) }
    func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) { route(userInfo) }

    private func route(_ message: [String: Any]) {
        guard let type = WatchMessage.messageType(message) else { return }
        switch type {
        case .state:
            if let (_, payload) = WatchMessage.decode(message, as: SyncPayload.self) {
                Task { @MainActor in self.state?.didReceiveState(payload) }
            }
        case .tasks:
            if let (_, tasks) = WatchMessage.decode(message, as: [AgentTask].self) {
                Task { @MainActor in self.state?.didReceiveTasks(tasks) }
            }
        case .approval:
            if let (_, a) = WatchMessage.decode(message, as: ApprovalRequest.self) {
                Task { @MainActor in self.state?.didReceiveApproval(a) }
            }
        case .approvalResolved:
            if let (_, dict) = WatchMessage.decode(message, as: [String: String].self),
               let id = dict["id"] {
                Task { @MainActor in self.state?.didResolveApproval(id: id) }
            }
        case .status:
            if let (_, log) = WatchMessage.decode(message, as: ExecutionLog.self) {
                Task { @MainActor in self.state?.didReceiveStatus(log) }
            }
        default:
            break
        }
    }

    func session(_ session: WCSession, activationDidCompleteWith state: WCSessionActivationState, error: Error?) {
        guard state == .activated else { return }
        requestSync()
    }
}
