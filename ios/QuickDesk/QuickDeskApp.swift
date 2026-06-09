import SwiftUI
import UIKit
import UserNotifications

extension Notification.Name {
    static let quickDeskRemotePushToken = Notification.Name("quickDeskRemotePushToken")
}

final class AppDelegate: NSObject, UIApplicationDelegate {
    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        let center = UNUserNotificationCenter.current()
        center.delegate = self
        center.setNotificationCategories([Self.approvalCategory])
        center.requestAuthorization(options: [.alert, .sound]) { granted, _ in
            guard granted else { return }
            DispatchQueue.main.async {
                application.registerForRemoteNotifications()
            }
        }
        return true
    }

    func application(_ application: UIApplication,
                     didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        let token = deviceToken.map { String(format: "%02x", $0) }.joined()
        NotificationCenter.default.post(name: .quickDeskRemotePushToken, object: token)
    }

    func application(_ application: UIApplication,
                     didFailToRegisterForRemoteNotificationsWithError error: Error) {
        print("QuickDesk APNs registration failed: \(error.localizedDescription)")
    }

    private static let approvalCategory = UNNotificationCategory(
        identifier: "QUICKDESK_APPROVAL",
        actions: [
            UNNotificationAction(identifier: "QUICKDESK_DENY",
                                 title: "Deny",
                                 options: [.destructive]),
            UNNotificationAction(identifier: "QUICKDESK_ALLOW",
                                 title: "Allow",
                                 options: [.authenticationRequired]),
        ],
        intentIdentifiers: [],
        options: [.customDismissAction]
    )
}

extension AppDelegate: UNUserNotificationCenterDelegate {
    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        [.banner, .sound, .list]
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                didReceive response: UNNotificationResponse) async {
        let action = response.actionIdentifier
        guard action == "QUICKDESK_ALLOW" || action == "QUICKDESK_DENY" else { return }
        guard let approvalId = response.notification.request.content.userInfo["approvalId"] as? String else { return }
        let decision = action == "QUICKDESK_ALLOW" ? "allow" : "deny"
        await sendDecision(approvalId: approvalId, decision: decision)
    }

    private func sendDecision(approvalId: String, decision: String) async {
        guard let selectedID = Persistence.loadSelectedID(),
              let computer = Persistence.loadComputers().first(where: { $0.id == selectedID })
        else { return }
        do {
            try await AgentClient(computer: computer).decideApproval(id: approvalId, decision: decision)
        } catch {
            print("QuickDesk notification decision failed: \(error.localizedDescription)")
        }
    }
}

@main
struct QuickDeskApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @State private var state = AppState()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(state)
        }
    }
}
