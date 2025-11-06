//
//  PreviewView.swift
//  UX Film Director
//
//  Created by Yuki on 2025/11/05.
//


import SwiftUI

// プレビューの固定サイズを定義 (F-03.2)
struct PreviewConstants {
    static let outputWidth: CGFloat = 1920
    static let outputHeight: CGFloat = 1080
    static let aspectRatio: CGFloat = outputWidth / outputHeight
}

struct PreviewView: View {
    @Binding var project: Project
    @Binding var currentTime: TimeInterval
    
    var body: some View {
        GeometryReader { geometry in
            
            // センタリング用のZStack
            ZStack {
                
                // --- プレビュー本体 (アスペクト比固定) ---
                ZStack {
                    // 1. プレビューの背景
                    Color.black
                    
                    // 2. クリップの描画
                    ForEach($project.tracks) { $track in
                        ForEach($track.clips) { $clip in
                            
                            let isVisible = (currentTime >= clip.startTime) &&
                                            (currentTime < (clip.startTime + clip.duration))
                            
                            if isVisible {
                                switch clip.type {
                                case .shape:
                                    ShapePreviewView(clip: $clip)
                                    
                                // --- ▼ 修正点: case .psd の処理を変更 ▼ ---
                                case .psd:
                                    // PSDクリップ用のビューを呼び出す
                                    PSDClipView(clip: $clip)
                                // --- ▲ ---

                                default:
                                    EmptyView()
                                }
                            }
                        }
                    }
                }
                .frame(width: min(geometry.size.width, geometry.size.height * PreviewConstants.aspectRatio),
                       height: min(geometry.size.height, geometry.size.width / PreviewConstants.aspectRatio))
                .background(Color.black)
                
            }
            .frame(width: geometry.size.width, height: geometry.size.height)
            .background(Color(nsColor: .controlBackgroundColor).opacity(0.3))
        }
    }
}


// 図形プレビュー用のサブビュー (ドラッグ可能)
struct ShapePreviewView: View {
    @Binding var clip: Clip
    
    @State private var initialPosition: CGPoint = .zero
    
    var body: some View {
        Rectangle()
            .fill(clip.shapeColor)
            .frame(width: 200, height: 150)
            .opacity(0.8)
            .border(Color.white.opacity(0.7), width: 2) // 枠線
            .offset(x: clip.positionX, y: clip.positionY) // 移動
            .gesture(
                DragGesture()
                    .onChanged { value in
                        if initialPosition == .zero {
                            initialPosition = CGPoint(x: clip.positionX, y: clip.positionY)
                        }
                        clip.positionX = initialPosition.x + value.translation.width
                        clip.positionY = initialPosition.y + value.translation.height
                    }
                    .onEnded { value in
                        initialPosition = .zero
                    }
            )
    }
}


// --- ▼ 修正点: PSDクリップとレイヤーを描画するビューを追加 ▼ ---

/// 1つのPSDクリップを描画する (ドラッグ可能)
struct PSDClipView: View {
    @Binding var clip: Clip
    
    @State private var initialPosition: CGPoint = .zero

    var body: some View {
        // ZStackでレイヤーを重ねる
        ZStack {
            // レイヤー構造 (psdLayerStructure) があれば再帰的に描画
            if let layers = clip.psdLayerStructure {
                ForEach(layers) { layer in
                    PSDLayerView(layer: layer)
                }
            } else {
                // パースデータがない場合（読み込み中など）
                Text(clip.name)
                    .foregroundColor(.gray)
                    .border(Color.gray, width: 1)
            }
        }
        .frame(width: PreviewConstants.outputWidth, height: PreviewConstants.outputHeight)
        .scaleEffect(0.3) // (仮: プレビューが見切れないように全体を縮小)
        .offset(x: clip.positionX, y: clip.positionY) // クリップ全体を移動
        .gesture(
            DragGesture()
                .onChanged { value in
                    if initialPosition == .zero {
                        initialPosition = CGPoint(x: clip.positionX, y: clip.positionY)
                    }
                    clip.positionX = initialPosition.x + value.translation.width
                    clip.positionY = initialPosition.y + value.translation.height
                }
                .onEnded { value in
                    initialPosition = .zero
                }
        )
    }
}

/// PSDレイヤーを再帰的に描画する
struct PSDLayerView: View {
    let layer: LayerInfo
    
    var body: some View {
        // このレイヤーがインスペクタで「可視」に設定されている場合のみ描画
        if layer.isVisible {
            
            if layer.isGroup {
                // グループの場合、子レイヤーを再帰的に描画
                ZStack {
                    ForEach(layer.children) { child in
                        PSDLayerView(layer: child)
                    }
                }
                .opacity(layer.opacity / 255.0) // グループの不透明度
                // TODO: ブレンドモード (layer.blendMode) を適用
                
            } else if let image = layer.image {
                // 通常レイヤーで画像がある場合
                Image(nsImage: image)
                    .resizable()
                    .aspectRatio(contentMode: .fit)
                    .opacity(layer.opacity / 255.0) // レイヤーの不透明度
                    // TODO: ブレンドモード (layer.blendMode) を適用
            }
            // (画像がないレイヤーは何も描画しない)
        }
    }
}
// --- ▲ ---
