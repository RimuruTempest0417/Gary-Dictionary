// mac-tap.swift — 在 macOS 上發「真的」滑鼠事件（點擊／拖曳）給 iPhone Mirroring 或模擬器視窗
//
// 為什麼需要這支：System Events 的 `click at {x, y}` 對 iPhone Mirroring 的內容沒有效果
//（實測：點下去、畫面完全不動）。iPhone Mirroring 只吃真正的 HID 事件，所以用 CoreGraphics
// 直接發 mouseMoved／leftMouseDown／leftMouseUp（拖曳就是 down → 多次 dragged → up）。
//
// 用法（座標是螢幕的「點」座標，原點在主螢幕左上角）：
//   swift scripts/mac-tap.swift click 123 280
//   swift scripts/mac-tap.swift drag 200 700 200 300 12     // 從 (200,700) 拖到 (200,300)，分 12 步
//
// ★ 需要「輔助使用」權限（給 Hermes）。★ 這支不做任何判斷，純粹發事件。
import CoreGraphics
import Foundation

let args = CommandLine.arguments
guard args.count >= 4 else {
    print("用法：mac-tap.swift click <x> <y> ／ mac-tap.swift drag <x1> <y1> <x2> <y2> [steps]")
    exit(2)
}

func num(_ index: Int) -> Double {
    guard let value = Double(args[index]) else {
        print("座標不是數字：\(args[index])")
        exit(2)
    }
    return value
}

func post(_ type: CGEventType, _ point: CGPoint) {
    let event = CGEvent(mouseEventSource: nil, mouseType: type, mouseCursorPosition: point, mouseButton: .left)
    event?.post(tap: .cghidEventTap)
}

func settle(_ microseconds: UInt32) {
    usleep(microseconds)
}

let action = args[1]

if action == "click" {
    let point = CGPoint(x: num(2), y: num(3))
    post(.mouseMoved, point)
    settle(150_000)
    post(.leftMouseDown, point)
    settle(90_000)
    post(.leftMouseUp, point)
    print("click \(Int(point.x)),\(Int(point.y))")
} else if action == "drag" {
    guard args.count >= 6 else { print("drag 需要 x1 y1 x2 y2 [steps]"); exit(2) }
    let from = CGPoint(x: num(2), y: num(3))
    let to = CGPoint(x: num(4), y: num(5))
    let steps = args.count >= 7 ? max(2, Int(num(6))) : 10
    post(.mouseMoved, from)
    settle(150_000)
    post(.leftMouseDown, from)
    settle(120_000)
    for step in 1...steps {
        let ratio = Double(step) / Double(steps)
        let point = CGPoint(x: from.x + (to.x - from.x) * ratio, y: from.y + (to.y - from.y) * ratio)
        post(.leftMouseDragged, point)
        settle(16_000)
    }
    post(.leftMouseUp, to)
    print("drag \(Int(from.x)),\(Int(from.y)) → \(Int(to.x)),\(Int(to.y))（\(steps) 步）")
} else {
    print("不認識的動作：\(action)（支援 click／drag）")
    exit(2)
}
