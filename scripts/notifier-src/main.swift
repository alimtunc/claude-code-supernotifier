import Foundation
import UserNotifications

struct Args {
    var title: String = "Claude Code SuperNotifier"
    var message: String = ""
    var sound: String? = nil
    var group: String? = nil
    var prime: Bool = false
    var dryRun: Bool = false
}

func parseArgs() -> Args {
    var a = Args()
    var it = CommandLine.arguments.dropFirst().makeIterator()
    while let arg = it.next() {
        switch arg {
        case "--title":   if let v = it.next() { a.title = v }
        case "--message": if let v = it.next() { a.message = v }
        case "--sound":   if let v = it.next() { a.sound = v }
        case "--group":   if let v = it.next() { a.group = v }
        case "--prime":   a.prime = true
        case "--dry-run": a.dryRun = true
        default: break
        }
    }
    return a
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
        "prime": args.prime
    ]
    if let data = try? JSONSerialization.data(withJSONObject: payload, options: [.prettyPrinted]),
       let s = String(data: data, encoding: .utf8) {
        print(s)
    }
    exit(0)
}

let center = UNUserNotificationCenter.current()
let authGroup = DispatchGroup()
authGroup.enter()
center.requestAuthorization(options: [.alert, .sound]) { _, _ in authGroup.leave() }
authGroup.wait()

if args.prime { exit(0) }

let content = UNMutableNotificationContent()
content.title = args.title
content.body = args.message
if let s = args.sound, !s.isEmpty {
    content.sound = UNNotificationSound(named: UNNotificationSoundName(s))
}
if let g = args.group, !g.isEmpty {
    content.threadIdentifier = g
}

let request = UNNotificationRequest(identifier: UUID().uuidString, content: content, trigger: nil)
let postGroup = DispatchGroup()
postGroup.enter()
center.add(request) { _ in postGroup.leave() }
postGroup.wait()

Thread.sleep(forTimeInterval: 0.5)
exit(0)
