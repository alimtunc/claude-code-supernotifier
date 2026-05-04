import Foundation
import UserNotifications

guard let bundleId = Bundle.main.bundleIdentifier, !bundleId.isEmpty else {
    FileHandle.standardError.write(Data("notifier must be launched from inside its .app bundle\n".utf8))
    exit(2)
}

let center = UNUserNotificationCenter.current()
let authGroup = DispatchGroup()
authGroup.enter()
center.requestAuthorization(options: [.alert, .sound]) { _, _ in
    authGroup.leave()
}
authGroup.wait()

let content = UNMutableNotificationContent()
content.title = "Claude Code SuperNotifier"
content.body = "Skeleton notification — wired up."
content.sound = UNNotificationSound.default

let request = UNNotificationRequest(
    identifier: UUID().uuidString,
    content: content,
    trigger: nil
)

let postGroup = DispatchGroup()
postGroup.enter()
center.add(request) { error in
    if let error = error {
        FileHandle.standardError.write(Data("post failed: \(error)\n".utf8))
    }
    postGroup.leave()
}
postGroup.wait()

// Give the system a tick to actually display the notif before we exit.
Thread.sleep(forTimeInterval: 0.5)
exit(0)
