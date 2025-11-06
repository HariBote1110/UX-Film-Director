//
//  Project.swift
//  UX Film Director
//
//  Created by Yuki on 2025/11/05.
//


import Foundation
import SwiftUI // Colorのため

// MARK: - プロジェクト構造

/// プロジェクト全体を管理する構造体
struct Project {
    var id = UUID()
    var name: String
    var tracks: [Track]
}

/// タイムラインの1行（トラック）
struct Track: Identifiable, Hashable {
    var id = UUID()
    var name: String
    var clips: [Clip]
}

/// トラック上の個々の素材（クリップ）
struct Clip: Identifiable, Hashable {
    var id = UUID()
    var name: String
    var type: ClipType
    var startTime: TimeInterval // プロジェクト開始地点からの秒数
    var duration: TimeInterval // クリップの長さ（秒）
    
    var positionX: CGFloat = 0.0 // プレビュー中心からの相対X座標 (ポイント)
    var positionY: CGFloat = 0.0 // プレビュー中心からの相対Y座標 (ポイント)

    // 1. PSD用
    var psdLayerStructure: [LayerInfo]? = nil
    
    // 2. 図形用
    var shapeColor: Color = .red // 図形の色 (デフォルトは赤)
    
    // クリップの色をタイプ別に定義
    var displayColor: Color {
        switch type {
        case .psd: return .blue
        case .audio: return .green
        case .video: return .purple
        case .shape: return .orange
        }
    }
}

/// クリップの種類
enum ClipType: String, Hashable {
    case psd   // キャラクター立ち絵
    case audio // 音声
    case video // 背景動画など
    case shape // 図形
}


// MARK: - PSDレイヤー構造

/// PSDファイルのレイヤー情報を表す構造体 (アプリ全体で共有)
struct LayerInfo: Identifiable, Hashable {
    
    let id = UUID() // SwiftUIのListで使うため
    let name: String
    let isGroup: Bool   // Folder
    var isVisible: Bool // Visible
    let opacity: Double // Opacity (0-255)
    let blendMode: String // BlendMode
    var children: [LayerInfo]
    
    // --- ▼ 修正点: レイヤーの画像データを保持 ▼ ---
    var image: NSImage? = nil
    // --- ▲ ---

    /// `List` は子の KeyPath に Optional ([T]?) を要求するため、
    /// `children` が空の場合は `nil` を返すように変換する。
    var childrenForList: [LayerInfo]? {
        return children.isEmpty ? nil : children
    }
    
    // --- ▼ 修正点: NSImageはHashable/Equatableではないため、idのみで比較 ▼ ---
    // (注: これによりインスペクタのToggleが再び効かなくなる可能性がありますが、
    //  画像表示を優先します。この問題は別途解決が必要です。)
    static func == (lhs: LayerInfo, rhs: LayerInfo) -> Bool {
        lhs.id == rhs.id
    }

    func hash(into hasher: inout Hasher) {
        hasher.combine(id)
    }
    // --- ▲ ---
}


// MARK: - .labファイル用データ (要件 4.1)

/// .labファイルの1行を表す
struct LabEntry {
    let startTime: TimeInterval // 秒 (100ナノ秒から変換後)
    let endTime: TimeInterval   // 秒
    let phoneme: String         // 音素 ("a", "i", "u", "pau" など)
}


// MARK: - サンプルデータ

extension Project {
    /// 起動時に表示するためのダミーデータを作成します
    static func createSampleProject() -> Project {
        
        let track1 = Track(name: "レイヤー 1", clips: [])
        let track2 = Track(name: "レイヤー 2", clips: [])
        let track3 = Track(name: "レイヤー 3", clips: [])
        let track4 = Track(name: "レイヤー 4", clips: [])

        return Project(name: "My First Project", tracks: [
            track1,
            track2,
            track3,
            track4
        ])
    }
}
