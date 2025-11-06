//
//  PreviewView.swift
//  UX Film Director
//
//  Created by Yuki on 2025/11/05.
//


import SwiftUI

struct PreviewView: View {
    @Binding var project: Project
    
    var body: some View {
        // ここに AVPlayerView (AVKit) を配置し、
        // タイムラインの再生ヘッド位置と同期させる処理を実装します。
        ZStack {
            Color.black
            Text("ビデオプレビュー (F-03)")
                .font(.title)
                .foregroundColor(.gray)
        }
    }
}