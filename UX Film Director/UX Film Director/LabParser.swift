//
//  LabParser.swift
//  UX Film Director
//
//  Created by Yuki on 2025/11/05.
//


import Foundation

/// .labファイルを解析（パース）するためのクラス
class LabParser {
    
    /// .labファイルの内容（文字列）を受け取り、LabEntryの配列に変換します。
    /// - Parameter content: .labファイルから読み込んだ文字列全体
    /// - Returns: LabEntryの配列。パースに失敗した行は無視されます。
    func parse(content: String) -> [LabEntry] {
        var entries: [LabEntry] = []
        
        // 1. ファイルを1行ずつの配列に分割する
        let lines = content.split(separator: "\n")
        
        // 2. 各行を処理する
        for line in lines {
            // " " (スペース) または "\t" (タブ) で分割する
            let components = line.split { $0.isWhitespace }
            
            // 3. データが3つ（開始, 終了, 音素）揃っているか確認
            guard components.count == 3 else {
                // データが足りない行はスキップ
                continue
            }
            
            // 4. 時刻を 100ナノ秒単位 (Int) から 秒単位 (Double) に変換
            //    要件定義(4.1)より: 1秒 = 10,000,000 (100ナノ秒単位)
            guard let startTimeInt = Int(components[0]),
                  let endTimeInt = Int(components[1]) else {
                // 時刻が数値でない行はスキップ
                continue
            }
            
            // 10,000,000.0 で割って秒に変換
            let startTime = Double(startTimeInt) / 10_000_000.0
            let endTime = Double(endTimeInt) / 10_000_000.0
            
            // 5. 音素を文字列として取得
            let phoneme = String(components[2])
            
            // 6. LabEntryを作成して配列に追加
            let entry = LabEntry(startTime: startTime, endTime: endTime, phoneme: phoneme)
            entries.append(entry)
        }
        
        return entries
    }
}

// ---
// MARK: - 使い方 (動作確認用)
// ---

// このパーサーを実際に使うときのイメージです
// (この部分は ContentView など、実際にファイルを開く場所で実装します)

/*
func loadLabFile(url: URL) {
    let parser = LabParser()
    
    do {
        // ファイルURLから文字列として中身を読み込む
        let fileContent = try String(contentsOf: url, encoding: .utf8)
        
        // パースを実行
        let labData = parser.parse(content: fileContent)
        
        // 結果の確認 (コンソールに出力)
        print("--- .labファイル パース結果 ---")
        for entry in labData {
            print(String(format: "開始: %.3f 秒, 終了: %.3f 秒, 音素: %@", entry.startTime, entry.endTime, entry.phoneme))
        }
        
    } catch {
        print("エラー: .labファイルの読み込みに失敗しました。 \(error.localizedDescription)")
    }
}
*/