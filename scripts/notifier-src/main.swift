import Foundation
import UserNotifications

struct Args {
    var title: String = "Claude Code SuperNotifier"
    var message: String = ""
    var sound: String? = nil
    var group: String? = nil
    var signalPath: String? = nil
    var clickTouch: String? = nil
    var timeout: Double = 30
    var prime: Bool = false
    var dryRun: Bool = false
    var style: String = "system"
}

func parseArgs() -> Args {
    var a = Args()
    var it = CommandLine.arguments.dropFirst().makeIterator()
    while let arg = it.next() {
        switch arg {
        case "--title":       if let v = it.next() { a.title = v }
        case "--message":     if let v = it.next() { a.message = v }
        case "--sound":       if let v = it.next() { a.sound = v }
        case "--group":       if let v = it.next() { a.group = v }
        case "--signal-path": if let v = it.next() { a.signalPath = v }
        case "--click-touch": if let v = it.next() { a.clickTouch = v }
        case "--timeout":     if let v = it.next(), let d = Double(v) { a.timeout = d }
        case "--style":       if let v = it.next() { a.style = v }
        case "--prime":       a.prime = true
        case "--dry-run":     a.dryRun = true
        default: break
        }
    }
    return a
}

final class Delegate: NSObject, UNUserNotificationCenterDelegate {
    let onClick: () -> Void
    let style: String
    init(style: String, onClick: @escaping () -> Void) {
        self.style = style
        self.onClick = onClick
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler handler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        // 'banner' forces the legacy auto-dismiss banner only.
        // 'system' (default) adds .list so the notif also lands in Notification Center,
        // and lets macOS decide banner-vs-alert presentation per the user's
        // System Settings → Notifications → Claude Code SuperNotifier preference.
        if style == "banner" {
            handler([.banner, .sound])
        } else {
            handler([.banner, .list, .sound])
        }
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler handler: @escaping () -> Void
    ) {
        onClick()
        handler()
    }
}

func runClickActions(_ args: Args) {
    if let p = args.clickTouch {
        FileManager.default.createFile(atPath: p, contents: Data(), attributes: nil)
    }
}

guard let bundleId = Bundle.main.bundleIdentifier, !bundleId.isEmpty else {
    FileHandle.standardError.write(Data("notifier must be launched from inside its .app bundle\n".utf8))
    exit(2)
}

let args = parseArgs()

if args.dryRun {
    let payload: [String: Any] = [
        "bundleId": bundleId,
        "title": args.title,
        "message": args.message,
        "sound": args.sound as Any,
        "group": args.group as Any,
        "signalPath": args.signalPath as Any,
        "clickTouch": args.clickTouch as Any,
        "timeout": args.timeout,
        "prime": args.prime,
        "style": args.style
    ]
    if let data = try? JSONSerialization.data(withJSONObject: payload, options: [.prettyPrinted]),
       let s = String(data: data, encoding: .utf8) {
        print(s)
    }
    exit(0)
}

// macOS may relaunch the .app to deliver a notification response. That fresh
// invocation has no CLI args and would otherwise post an empty notification.
// Refuse to post when called without --message, --prime, or --dry-run.
if !args.prime && args.message.isEmpty {
    exit(0)
}

let center = UNUserNotificationCenter.current()
let authGroup = DispatchGroup()
authGroup.enter()
center.requestAuthorization(options: [.alert, .sound]) { _, _ in authGroup.leave() }
authGroup.wait()

if args.prime { exit(0) }

var didFire = false
let lock = NSLock()
let delegate = Delegate(style: args.style, onClick: {
    lock.lock()
    let already = didFire
    didFire = true
    lock.unlock()
    if !already {
        runClickActions(args)
        exit(0)
    }
})
center.delegate = delegate

let content = UNMutableNotificationContent()
content.title = args.title
content.body = args.message
if let s = args.sound, !s.isEmpty {
    // UNNotificationSound(named:) on macOS resolves the lookup chain:
    // app bundle Resources/, ~/Library/Sounds/, /Library/Sounds/, /System/Library/Sounds/<name>.aiff.
    // System sounds like "Glass", "Ping", "Hero" therefore work without bundling .caf files.
    content.sound = UNNotificationSound(named: UNNotificationSoundName(s))
}
if let g = args.group, !g.isEmpty {
    content.threadIdentifier = g
}

let request = UNNotificationRequest(identifier: UUID().uuidString, content: content, trigger: nil)
center.add(request) { _ in }

DispatchQueue.main.asyncAfter(deadline: .now() + args.timeout) {
    lock.lock()
    let already = didFire
    didFire = true
    lock.unlock()
    if !already {
        exit(0)
    }
}

// Drains the main dispatch queue so UNUserNotificationCenterDelegate
// callbacks (which target the main queue) can fire on click. Never returns.
dispatchMain()
