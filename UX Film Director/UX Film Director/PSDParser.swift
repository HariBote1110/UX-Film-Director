import Foundation
import JavaScriptCore // JavaScriptCoreフレームワークをインポート

/// oov/PSDTool (JavaScript版) を JavaScriptCore 経由で呼び出すラッパークラス
class PSDParser {
    
    // JSの実行環境
    private var context: JSContext!
    
    // JSのパース関数 (PSD.parse)
    private var parseFunction: JSValue!
    
    // パース結果を一時的に保持する変数
    private var parseResult: [LayerInfo]?
    private var parseError: Error?
    
    // パース処理の完了を待つためのセマフォ
    private let semaphore = DispatchSemaphore(value: 0)
    
    // --- ▼ setTimeout/clearTimeout で使うタイマー管理 ▼ ---
    private var timers: [Int: Timer] = [:]
    private var nextTimerId = 1
    // --- ▲ ---

    /// PSDファイルのレイヤー情報を表す構造体 (psd.d.ts を参照)
    struct LayerInfo {
        let name: String
        let isGroup: Bool   // Folder
        let isVisible: Bool // Visible
        let opacity: Double // Opacity (0-255)
        let blendMode: String // BlendMode
        let children: [LayerInfo]
        // TODO: 要件に基づき、位置(X, Y, Width, Height)なども追加
    }

    /// JSライブラリを非同期でダウンロードし、実行環境をセットアップします。
    func setupJSEnvironment(completion: @escaping (Error?) -> Void) {
        guard let url = URL(string: "https://oov.github.io/psdtool/js/psd.min.js") else {
            completion(NSError(domain: "PSDParser", code: -1, userInfo: [NSLocalizedDescriptionKey: "Invalid JS URL"]))
            return
        }
        
        print("PSDParser: js/psd.min.js をダウンロード中...")
        
        let task = URLSession.shared.dataTask(with: url) { [weak self] (data, response, error) in
            guard let self = self, let data = data, error == nil else {
                completion(error ?? NSError(domain: "PSDParser", code: -2, userInfo: [NSLocalizedDescriptionKey: "JSダウンロード失敗"]))
                return
            }
            
            guard let jsCode = String(data: data, encoding: .utf8) else {
                completion(NSError(domain: "PSDParser", code: -3, userInfo: [NSLocalizedDescriptionKey: "JSエンコード失敗"]))
                return
            }
            
            print("PSDParser: JSダウンロード完了。JSContextを初期化します。")
            
            DispatchQueue.main.async {
                self.context = JSContext()
                
                // --- ▼ 修正点: ブラウザAPIのポリフィル ▼ ---
                
                // 1. 'self' と 'window' をグローバルオブジェクトとして定義
                self.context.evaluateScript("var self = this; var window = this;")

                // 2. 'setTimeout' の実装
                let setTimeout: @convention(block) (JSValue, JSValue) -> Int = { callback, delay in
                    let currentId = self.nextTimerId
                    self.nextTimerId += 1
                    let delayInSeconds = (delay.toDouble() / 1000.0) // JSのdelayはミリ秒
                    
                    let timer = Timer.scheduledTimer(withTimeInterval: delayInSeconds, repeats: false) { _ in
                        DispatchQueue.main.async {
                            if self.timers[currentId] != nil { // キャンセルされていないか確認
                                callback.call(withArguments: [])
                                self.timers.removeValue(forKey: currentId) // 実行後に削除
                            }
                        }
                    }
                    self.timers[currentId] = timer
                    return currentId // タイマーIDをJSに返す
                }
                self.context.setObject(setTimeout, forKeyedSubscript: "setTimeout" as NSString)

                // 3. 'clearTimeout' の実装
                let clearTimeout: @convention(block) (Int) -> Void = { timerId in
                    if let timer = self.timers[timerId] {
                        timer.invalidate() // タイマーをキャンセル
                        self.timers.removeValue(forKey: timerId) // 辞書から削除
                    }
                }
                self.context.setObject(clearTimeout, forKeyedSubscript: "clearTimeout" as NSString)

                // 4. 'document.getElementById' のダミーを実装
                // (PSD.parseWorker が <script id="psdgo"> を探そうとするため)
                self.context.evaluateScript("""
                    var document = {
                        getElementById: function(id) {
                            if (id === 'psdgo') {
                                return { src: null }; // Workerは使わないのでnullを返す
                            }
                            return null;
                        }
                    };
                """)
                // --- ▲ ポリフィル完了 ▲ ---

                
                // JS側でエラーが発生したらSwift側でキャッチする
                self.context.exceptionHandler = { context, exception in
                    let errorString = exception?.toString() ?? "不明なJSエラー"
                    print("!!! JS エラー: \(errorString)")
                    
                    if self.parseError == nil {
                        self.parseError = NSError(domain: "JavaScriptCore", code: -99, userInfo: [NSLocalizedDescriptionKey: errorString])
                        self.semaphore.signal()
                    }
                }
                
                // ダウンロードしたJSコードを実行環境に読み込ませる
                self.context.evaluateScript(jsCode)
                
                // グローバルオブジェクトから PSD.parse 関数を取得する
                // (Worker版は document.getElementById で失敗するので、非Worker版の 'parse' を直接探す)
                self.parseFunction = self.context.objectForKeyedSubscript("PSD")?.objectForKeyedSubscript("parse")
                
                if self.parseFunction.isUndefined {
                     print("PSDParser: 'PSD.parse' が見つかりません。'parseWorker' にフォールバックします。")
                    // parseWorker は 'document' エラーで失敗するはずだが、念のため
                    self.parseFunction = self.context.objectForKeyedSubscript("PSD")?.objectForKeyedSubscript("parseWorker")
                }

                if self.parseFunction.isUndefined {
                    let errorMsg = self.parseError?.localizedDescription ?? "PSD.parse関数がJS内に見つかりません"
                    completion(NSError(domain: "PSDParser", code: -4, userInfo: [NSLocalizedDescriptionKey: errorMsg]))
                } else {
                    print("PSDParser: セットアップ完了。")
                    completion(nil) // 成功
                }
            }
        }
        task.resume()
    }

    /// PSDファイルを解析します (同期的に結果を返します)
    func parse(url: URL) -> Result<[LayerInfo], Error> {
        guard let context = context, let parseFunction = parseFunction else {
            return .failure(NSError(domain: "PSDParser", code: -10, userInfo: [NSLocalizedDescriptionKey: "JSContextが初期化されていません"]))
        }

        // 1. ファイルアクセス許可
        let shouldStopAccessing = url.startAccessingSecurityScopedResource()
        defer {
            if shouldStopAccessing {
                url.stopAccessingSecurityScopedResource()
            }
        }
        
        let fileData: Data
        do {
            fileData = try Data(contentsOf: url)
        } catch {
            return .failure(error)
        }
        
        // 2. SwiftのDataをJSのArrayBufferに変換
        guard let arrayBuffer = context.evaluateScript("new ArrayBuffer(\(fileData.count))") else {
            return .failure(NSError(domain: "PSDParser", code: -11, userInfo: [NSLocalizedDescriptionKey: "ArrayBuffer(JSValue)の作成に失敗"]))
        }
        guard let uint8ArrayConstructor = context.objectForKeyedSubscript("Uint8Array") else {
            return .failure(NSError(domain: "PSDParser", code: -11, userInfo: [NSLocalizedDescriptionKey: "Uint8Arrayコンストラクタ(JS)の取得に失敗"]))
        }
        guard let uint8Array = uint8ArrayConstructor.construct(withArguments: [arrayBuffer]) else {
            return .failure(NSError(domain: "PSDParser", code: -11, userInfo: [NSLocalizedDescriptionKey: "new Uint8Array(arrayBuffer)の実行に失敗"]))
        }

        // DataをUint8Arrayにコピー
        fileData.withUnsafeBytes { (pointer: UnsafeRawBufferPointer) in
            for i in 0..<fileData.count {
                uint8Array.setObject(pointer[i], atIndexedSubscript: i)
            }
        }

        // 3. Swift側でJSコールバックを定義
        self.parseResult = nil
        self.parseError = nil
        
        let progressCallback: @convention(block) (Double) -> Void = { progress in
            // parse (非Worker版) は進捗コールバックをサポートしていないかもしれないが、念のため
            print(String(format: "PSDParser (JS): %.1f%%", progress * 100))
        }
        
        let completeCallback: @convention(block) (JSValue) -> Void = { [weak self] root in
            guard let self = self else { return }
            if let rootDict = root.toDictionary() as? [String: Any] {
                self.parseResult = self.mapLayer(dict: rootDict)
            } else {
                self.parseError = NSError(domain: "PSDParser", code: -12, userInfo: [NSLocalizedDescriptionKey: "JSからの戻り値(root)のパースに失敗"])
            }
            self.semaphore.signal() // 処理完了を通知
        }
        
        let failedCallback: @convention(block) (JSValue) -> Void = { [weak self] error in
            guard let self = self else { return }
            self.parseError = NSError(domain: "PSDParser", code: -13, userInfo: [NSLocalizedDescriptionKey: "JS (failed): \(error.toString() ?? "不明なエラー")"])
            self.semaphore.signal() // 処理完了を通知
        }
        
        // 4. JS関数 (PSD.parse または PSD.parseWorker) を呼び出す
        print("PSDParser: JSのparse関数を実行します...")
        parseFunction.call(withArguments: [
            arrayBuffer,
            progressCallback,
            completeCallback,
            failedCallback
        ])
        
        // 5. 非同期処理が完了するのを待つ (セマフォ)
        _ = semaphore.wait(timeout: .now() + 60.0) // タイムアウトを60秒に設定
        
        // 6. 結果を返す
        if let error = parseError {
            return .failure(error)
        }
        if let result = parseResult {
            return .success(result)
        }
        
        return .failure(NSError(domain: "PSDParser", code: -14, userInfo: [NSLocalizedDescriptionKey: "パーサーがタイムアウトしたか、コールバックが呼ばれませんでした"]))
    }
    
    /// JSValue (psd.Layer) の辞書を Swift の LayerInfo 配列に再帰的に変換する
    private func mapLayer(dict: [String: Any]) -> [LayerInfo] {
        guard let childrenAny = dict["Children"] as? [Any] else {
            return []
        }
        
        var layers: [LayerInfo] = []
        
        // psd.js はレイヤーを逆順（Photoshopのレイヤーパネルの上から順）で返すので、
        // 描画順（下から順）にするためにリバースします。
        for childAny in childrenAny.reversed() {
            guard let childDict = childAny as? [String: Any] else { continue }
            
            let info = LayerInfo(
                name: childDict["Name"] as? String ?? "不明",
                isGroup: childDict["Folder"] as? Bool ?? false,
                isVisible: childDict["Visible"] as? Bool ?? false,
                opacity: childDict["Opacity"] as? Double ?? 255.0,
                blendMode: childDict["BlendMode"] as? String ?? "normal",
                children: mapLayer(dict: childDict) // 再帰呼び出し
            )
            layers.append(info)
        }
        return layers
    }
}
