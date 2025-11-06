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
    
    // クリップの色をタイプ別に定義
    var displayColor: Color {
        switch type {
        case .psd: return .blue
        case .audio: return .green
        case .video: return .purple
        }
    }
}

/// クリップの種類
enum ClipType: String, Hashable {
    case psd   // キャラクター立ち絵
    case audio // 音声
    case video // 背景動画など
}

// MARK: - サンプルデータ

extension Project {
    /// 起動時に表示するためのダミーデータを作成します
    static func createSampleProject() -> Project {
        let psdClip = Clip(
            name: "Kiritan.psd",
            type: .psd,
            startTime: 1.0,
            duration: 10.0
        )
        
        let audioClip1 = Clip(
            name: "voice_001.wav",
            type: .audio,
            startTime: 1.5,
            duration: 4.0
        )
        
        let audioClip2 = Clip(
            name: "voice_002.wav",
            type: .audio,
            startTime: 6.0,
            duration: 3.5
        )
        
        return Project(name: "My First Project", tracks: [
            Track(name: "キャラクター", clips: [psdClip]),
            Track(name: "音声", clips: [audioClip1, audioClip2]),
            Track(name: "背景", clips: [])
        ])
    }
}

// MARK: - .labファイル用データ (要件 4.1)
// 今後の実装で使用します

/// .labファイルの1行を表す
struct LabEntry {
    let startTime: TimeInterval // 秒 (100ナノ秒から変換後)
    let endTime: TimeInterval   // 秒
    let phoneme: String         // 音素 ("a", "i", "u", "pau" など)
}