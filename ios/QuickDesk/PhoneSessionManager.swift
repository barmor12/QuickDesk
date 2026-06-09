import Foundation
import WatchConnectivity

/// Bridges the iPhone app to the Apple Watch using WatchConnectivity.
/// The phone is the hub: it relays tasks/approvals/status to the watch and
/// receives execute/decision commands back from it.
final class PhoneSessionManager: NSObject, WCSessionDelegate {
    static let shared = PhoneSessionManager()
    weak var appState: AppState?

    private var session: WCSession { .default }

    func activate() {
        guard WCSession.isSupported() else { return }
        session.delegate = self
        session.activate()
    }

    // MARK: - Phone -> Watch

    /// Push the full state (tasks + pending approvals) to the watch. Uses
    /// updateApplicationContext (reliable, latest-state-wins) so approvals
    /// arrive even when the watch isn't "reachable", plus a live sendMessage
    /// for immediacy when it is.
    func pushState(payload: SyncPayload) {
        guard session.activationState == .activated else { return }
        let msg = WatchMessage.encode(.state, payload)
        try? session.updateApplicationContext(msg)
        if session.isReachable {
            session.sendMessage(msg, replyHandler: nil, errorHandler: nil)
        }
    }

    func sendStatus(_ log: ExecutionLog) {
        send(WatchMessage.encode(.status, log), preferContext: false)
    }

    private func send(_ message: [String: Any], preferContext: Bool) {
        guard session.activationState == .activated else { return }
        if preferContext {
            // Latest-value semantics for the task list.
            try? session.updateApplicationContext(message)
            return
        }
        if session.isReachable {
            session.sendMessage(message, replyHandler: nil) { [weak self] _ in
                self?.session.transferUserInfo(message)  // guaranteed delivery fallback
            }
        } else {
            session.transferUserInfo(message)
        }
    }

    // MARK: - Watch -> Phone

    func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        handle(message)
    }

    func session(_ session: WCSession, didReceiveMessage message: [String: Any],
                 replyHandler: @escaping ([String: Any]) -> Void) {
        handle(message)
        replyHandler(["ok": true])
    }

    func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
        handle(userInfo)
    }

    private func handle(_ message: [String: Any]) {
        guard let type = WatchMessage.messageType(message) else { return }
        switch type {
        case .requestSync:
            Task { @MainActor in
                guard let s = self.appState else { return }
                self.pushState(payload: s.watchPayload())
            }
        case .execute:
            if let (_, req) = WatchMessage.decode(message, as: ExecuteRequest.self) {
                Task { @MainActor in
                    if let log = await self.appState?.execute(taskId: req.taskId, confirmed: req.confirmed) {
                        self.sendStatus(log)
                    }
                }
            }
        case .decision:
            if let (_, req) = WatchMessage.decode(message, as: DecisionRequest.self) {
                Task { @MainActor in
                    await self.appState?.decide(approvalID: req.approvalId, decision: req.decision)
                }
            }
        default:
            break
        }
    }

    // MARK: - Required delegate stubs

    func session(_ session: WCSession, activationDidCompleteWith state: WCSessionActivationState, error: Error?) {
        guard state == .activated else { return }
        Task { @MainActor in
            guard let s = self.appState else { return }
            self.pushState(payload: s.watchPayload())
        }
    }
    func sessionDidBecomeInactive(_ session: WCSession) {}
    func sessionDidDeactivate(_ session: WCSession) { session.activate() }
}
