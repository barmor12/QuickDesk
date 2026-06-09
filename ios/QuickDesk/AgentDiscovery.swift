import Foundation

struct AgentEndpoint: Identifiable, Hashable {
    var id: String
    var name: String
    var os: String
    var host: String
    var port: Int
    var autoPairing: Bool
}

final class AgentDiscovery {
    static let shared = AgentDiscovery()

    private var activeRuns: [DiscoveryRun] = []

    private init() {}

    func discover(timeout: TimeInterval = 2.5) async -> [AgentEndpoint] {
        await withCheckedContinuation { continuation in
            DispatchQueue.main.async {
                let run = DiscoveryRun(timeout: timeout) { [weak self] run, endpoints in
                    self?.activeRuns.removeAll { $0 === run }
                    continuation.resume(returning: endpoints)
                }
                self.activeRuns.append(run)
                run.start()
            }
        }
    }

    func endpoint(for computer: Computer, timeout: TimeInterval = 1.5) async -> AgentEndpoint? {
        let endpoints = await discover(timeout: timeout)
        return endpoints.first { $0.id == computer.id }
    }
}

private final class DiscoveryRun: NSObject, NetServiceBrowserDelegate, NetServiceDelegate {
    private let browser = NetServiceBrowser()
    private let timeout: TimeInterval
    private let completion: (DiscoveryRun, [AgentEndpoint]) -> Void
    private var services: [NetService] = []
    private var endpointsByID: [String: AgentEndpoint] = [:]
    private var didFinish = false

    init(timeout: TimeInterval, completion: @escaping (DiscoveryRun, [AgentEndpoint]) -> Void) {
        self.timeout = timeout
        self.completion = completion
        super.init()
        browser.delegate = self
    }

    func start() {
        browser.includesPeerToPeer = true
        browser.searchForServices(ofType: "_quickdesk._tcp.", inDomain: "local.")
        DispatchQueue.main.asyncAfter(deadline: .now() + timeout) { [weak self] in
            self?.finish()
        }
    }

    private func finish() {
        guard !didFinish else { return }
        didFinish = true
        browser.stop()
        services.forEach { $0.stop() }
        completion(self, Array(endpointsByID.values).sorted { $0.name < $1.name })
    }

    func netServiceBrowser(_ browser: NetServiceBrowser, didFind service: NetService, moreComing: Bool) {
        services.append(service)
        service.delegate = self
        service.resolve(withTimeout: min(1.5, timeout))
    }

    func netServiceDidResolveAddress(_ sender: NetService) {
        guard let endpoint = endpoint(from: sender) else { return }
        endpointsByID[endpoint.id] = endpoint
    }

    private func endpoint(from service: NetService) -> AgentEndpoint? {
        guard let txtData = service.txtRecordData() else { return nil }
        let txt = NetService.dictionary(fromTXTRecord: txtData)
        guard let id = stringValue(txt["id"]), !id.isEmpty else { return nil }

        let host = (service.hostName ?? "").trimmingCharacters(in: CharacterSet(charactersIn: "."))
        guard !host.isEmpty, service.port > 0 else { return nil }

        return AgentEndpoint(
            id: id,
            name: stringValue(txt["name"]) ?? service.name,
            os: stringValue(txt["os"]) ?? "Unknown",
            host: host,
            port: service.port,
            autoPairing: stringValue(txt["autoPairing"]) != "0"
        )
    }

    private func stringValue(_ data: Data?) -> String? {
        guard let data else { return nil }
        return String(data: data, encoding: .utf8)
    }
}
