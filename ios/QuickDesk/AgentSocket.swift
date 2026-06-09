import Foundation

/// Live event stream from the agent over WebSocket. Emits decoded events so the
/// app can react to executions and (crucially) push approvals to the watch.
final class AgentSocket: NSObject {
    enum Event {
        case approvalCreated(ApprovalRequest)
        case approvalResolved(ApprovalRequest)
        case executionFinished(ExecutionLog)
        case tasksUpdated([AgentTask])
    }

    private var task: URLSessionWebSocketTask?
    private var session: URLSession!
    private let computer: Computer
    private var isClosed = false
    private var connecting = false
    var onEvent: ((Event) -> Void)?

    init(computer: Computer) {
        self.computer = computer
        super.init()
        session = URLSession(configuration: .default, delegate: self, delegateQueue: nil)
    }

    func connect() {
        guard !connecting else { return }
        isClosed = false
        connecting = true
        Task { [weak self] in
            guard let self else { return }
            let endpoint = await AgentDiscovery.shared.endpoint(for: self.computer)
            let target = endpoint.map { self.computer.resolved(host: $0.host, port: $0.port) } ?? self.computer
            await MainActor.run {
                self.connecting = false
                guard !self.isClosed, let url = target.wsURL else { return }
                self.task?.cancel(with: .goingAway, reason: nil)
                self.task = self.session.webSocketTask(with: url)
                self.task?.resume()
                self.receive()
            }
        }
    }

    func disconnect() {
        isClosed = true
        connecting = false
        task?.cancel(with: .goingAway, reason: nil)
        task = nil
    }

    private func receive() {
        task?.receive { [weak self] result in
            guard let self else { return }
            switch result {
            case .failure:
                if !self.isClosed {
                    // Reconnect with a small backoff.
                    DispatchQueue.main.asyncAfter(deadline: .now() + 3) { self.connect() }
                }
            case .success(let message):
                if case let .string(text) = message { self.handle(text) }
                if case let .data(data) = message,
                   let text = String(data: data, encoding: .utf8) { self.handle(text) }
                self.receive()
            }
        }
    }

    private struct Envelope: Codable {
        var type: String
        var approval: ApprovalRequest?
        var log: ExecutionLog?
        var tasks: [AgentTask]?
    }

    private func handle(_ text: String) {
        guard let data = text.data(using: .utf8),
              let env = try? JSONDecoder().decode(Envelope.self, from: data) else { return }
        switch env.type {
        case "approval.created": if let a = env.approval { onEvent?(.approvalCreated(a)) }
        case "approval.decided", "approval.expired": if let a = env.approval { onEvent?(.approvalResolved(a)) }
        case "execution.finished": if let l = env.log { onEvent?(.executionFinished(l)) }
        case "tasks.updated": if let tasks = env.tasks { onEvent?(.tasksUpdated(tasks)) }
        default: break
        }
    }
}

extension AgentSocket: URLSessionWebSocketDelegate {
    func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask,
                    didOpenWithProtocol protocol: String?) {}
}
