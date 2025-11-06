import Foundation
import JavaScriptCore
import AppKit // NSImage のために必要

/// oov/PSDTool (JavaScript版) を JavaScriptCore 経由で呼び出すラッパークラス
class PSDParser {
    
    // JSの実行環境
    private var context: JSContext!
    private var parseFunction: JSValue!
    private var parseResult: [LayerInfo]?
    private var parseError: Error?
    private let semaphore = DispatchSemaphore(value: 0)
    
    private var timers: [Int: Timer] = [:]
    private var nextTimerId = 1
    
    // ログ出力制御フラグ
    private var debugLogCounter = 0
    private let maxDebugLogs = 10 // ログが多すぎる場合、この数を減らしてください

    /// JSライブラリを非同期でダウンロードし、実行環境をセットアップします。
    func setupJSEnvironment(completion: @escaping (Error?) -> Void) {
        // ... (この関数の中身は変更なし) ...
        
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
                
                // --- ▼ ブラウザAPIのポリフィル (変更なし) ▼ ---
                self.context.evaluateScript("var self = this; var window = this;")

                let setTimeout: @convention(block) (JSValue, JSValue) -> Int = { callback, delay in
                    let currentId = self.nextTimerId
                    self.nextTimerId += 1
                    let delayInSeconds = (delay.toDouble() / 1000.0)
                    let timer = Timer.scheduledTimer(withTimeInterval: delayInSeconds, repeats: false) { _ in
                        DispatchQueue.main.async {
                            if self.timers[currentId] != nil {
                                callback.call(withArguments: [])
                                self.timers.removeValue(forKey: currentId)
                            }
                        }
                    }
                    self.timers[currentId] = timer
                    return currentId
                }
                self.context.setObject(setTimeout, forKeyedSubscript: "setTimeout" as NSString)

                let clearTimeout: @convention(block) (Int) -> Void = { timerId in
                    if let timer = self.timers[timerId] {
                        timer.invalidate()
                        self.timers.removeValue(forKey: timerId)
                    }
                }
                self.context.setObject(clearTimeout, forKeyedSubscript: "clearTimeout" as NSString)

                self.context.evaluateScript("""
                    var document = {
                        getElementById: function(id) {
                            if (id === 'psdgo') { return { src: null }; }
                            return null;
                        },
                        createElement: function(tagName) {
                            if (tagName.toLowerCase() !== 'canvas') { return null; }
                            var canvas = {
                                _width: 0, _height: 0,
                                get width() { return this._width; },
                                set width(w) { this._width = w; },
                                get height() { return this._height; },
                                set height(h) { this._height = h; },
                                getContext: function(contextType) {
                                    if (contextType !== '2d') { return null; }
                                    var context = {
                                        _canvas: canvas,
                                        get canvas() { return this._canvas; },
                                        createImageData: function(width, height) {
                                            return {
                                                width: width,
                                                height: height,
                                                data: { length: width * height * 4 } 
                                            };
                                        },
                                        putImageData: function(imageData, dx, dy) { },
                                        drawImage: function() { }
                                    };
                                    return context;
                                }
                            };
                            return canvas;
                        }
                    };
                """)
                // --- ▲ ポリフィル完了 (変更なし) ▲ ---

                
                self.context.exceptionHandler = { context, exception in
                    let errorString = exception?.toString() ?? "不明なJSエラー"
                    print("!!! JS エラー: \(errorString)")
                    if self.parseError == nil {
                        self.parseError = NSError(domain: "JavaScriptCore", code: -99, userInfo: [NSLocalizedDescriptionKey: errorString])
                        if self.semaphore.wait(timeout: .now()) == .success {
                             self.semaphore.signal()
                        }
                    }
                }
                
                self.context.evaluateScript(jsCode)
                
                self.parseFunction = self.context.objectForKeyedSubscript("PSD")?.objectForKeyedSubscript("parse")
                
                if self.parseFunction.isUndefined {
                     print("PSDParser: 'PSD.parse' が見つかりません。'parseWorker' にフォールバックします。")
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
        
        // ログカウンターをリセット
        self.debugLogCounter = 0

        guard let context = context, let parseFunction = parseFunction else {
            return .failure(NSError(domain: "PSDParser", code: -10, userInfo: [NSLocalizedDescriptionKey: "JSContextが初期化されていません"]))
        }

        let shouldStopAccessing = url.startAccessingSecurityScopedResource()
        defer { if shouldStopAccessing { url.stopAccessingSecurityScopedResource() } }
        
        let fileData: Data
        do { fileData = try Data(contentsOf: url) }
        catch { return .failure(error) }
        
        guard let arrayBuffer = context.evaluateScript("new ArrayBuffer(\(fileData.count))") else {
            return .failure(NSError(domain: "PSDParser", code: -11, userInfo: [NSLocalizedDescriptionKey: "ArrayBuffer(JSValue)の作成に失敗"]))
        }
        guard let uint8ArrayConstructor = context.objectForKeyedSubscript("Uint8Array") else {
            return .failure(NSError(domain: "PSDParser", code: -11, userInfo: [NSLocalizedDescriptionKey: "Uint8Arrayコンストラクタ(JS)の取得に失敗"]))
        }
        guard let uint8Array = uint8ArrayConstructor.construct(withArguments: [arrayBuffer]) else {
            return .failure(NSError(domain: "PSDParser", code: -11, userInfo: [NSLocalizedDescriptionKey: "new Uint8Array(arrayBuffer)の実行に失敗"]))
        }

        fileData.withUnsafeBytes { (pointer: UnsafeRawBufferPointer) in
            for i in 0..<fileData.count {
                uint8Array.setObject(pointer[i], atIndexedSubscript: i)
            }
        }

        self.parseResult = nil
        self.parseError = nil
        
        let progressCallback: @convention(block) (Double) -> Void = { progress in
            print(String(format: "PSDParser (JS): %.1f%%", progress * 100))
        }
        
        let completeCallback: @convention(block) (JSValue) -> Void = { [weak self] root in
            guard let self = self else { return }
            if let rootDict = root.toDictionary() as? [String: Any] {
                self.parseResult = self.mapLayer(dict: rootDict, context: self.context)
            } else {
                self.parseError = NSError(domain: "PSDParser", code: -12, userInfo: [NSLocalizedDescriptionKey: "JSからの戻り値(root)のパースに失敗"])
            }
            self.semaphore.signal()
        }
        
        let failedCallback: @convention(block) (JSValue) -> Void = { [weak self] error in
            guard let self = self else { return }
            self.parseError = NSError(domain: "PSDParser", code: -13, userInfo: [NSLocalizedDescriptionKey: "JS (failed): \(error.toString() ?? "不明なエラー")"])
            self.semaphore.signal()
        }
        
        print("PSDParser: JSのparse関数を実行します...")
        parseFunction.call(withArguments: [
            arrayBuffer,
            progressCallback,
            completeCallback,
            failedCallback
        ])
        
        _ = semaphore.wait(timeout: .now() + 60.0)
        
        if let error = parseError {
            return .failure(error)
        }
        if let result = parseResult {
            return .success(result)
        }
        
        if self.parseError == nil {
             self.parseError = NSError(domain: "PSDParser", code: -14, userInfo: [NSLocalizedDescriptionKey: "パーサーがタイムアウトしたか、コールバックが呼ばれませんでした"])
        }
        return .failure(self.parseError!)
    }
    
    /// JSValue (psd.Layer) の辞書を Swift の LayerInfo 配列に再帰的に変換する
    private func mapLayer(dict: [String: Any], context: JSContext) -> [LayerInfo] {
        guard let childrenAny = dict["Children"] as? [Any] else {
            return []
        }
        
        var layers: [LayerInfo] = []
        
        for childAny in childrenAny.reversed() {
            guard let childDict = childAny as? [String: Any] else { continue }
            
            let layerName = childDict["Name"] as? String ?? "不明"
            
            // --- ▼ 修正点: デバッグログの追加 ▼ ---
            self.debugLogCounter += 1
            if self.debugLogCounter <= self.maxDebugLogs {
                print("--- 🔍 PSDParser DEBUG [\(layerName)] ---")
                
                // JS辞書に含まれるすべてのキーを出力
                print("  JS Keys: \(childDict.keys)")
                
                // "PixelData" の型情報を調査
                if let pixelData = childDict["PixelData"] {
                    // --- ▼ 修正点: JSValue() は '!' ではなく '?' を使う ▼ ---
                    let jsValue = JSValue(object: pixelData, in: context)
                    print("  'PixelData' found:")
                    
                    // --- ▼ 修正点: エラー 1-4: 'jsValue' を 'jsValue?' で安全にアンラップ ---
                    print("    isUndefined: \(jsValue?.isUndefined ?? true)")
                    print("    isNull: \(jsValue?.isNull ?? true)")
                    print("    isString: \(jsValue?.isString ?? false)")
                    print("    isObject: \(jsValue?.isObject ?? false)")
                    
                    // --- ▼ 修正点: エラー 5: 'jsValue?' で安全にアンラップ ---
                    if jsValue?.isObject ?? false {
                        // オブジェクトの場合、コンストラクタ名 (Uint8Array など) を取得
                        // --- ▼ 修正点: エラー 6: 'jsValue?' で安全にアンラップ ---
                        let constructorName = jsValue?.objectForKeyedSubscript("constructor")?
                                                     .objectForKeyedSubscript("name")?
                                                     .toString()
                        print("    JS Constructor: \(constructorName ?? "N/A")")
                        
                        // --- ▼ 修正点: エラー 7: 'jsValue?' で安全にアンラップ ---
                        if let length = jsValue?.objectForKeyedSubscript("length")?.toNumber()?.intValue {
                            print("    Length: \(length)")
                            // 最初の数バイトを出力
                            var head: [String] = []
                            for i in 0..<min(length, 8) {
                                // --- ▼ 修正点: エラー 8: 'jsValue?' で安全にアンラップ ---
                                head.append(jsValue?.atIndex(i)?.toString() ?? "?")
                            }
                            print("    Head bytes: [\(head.joined(separator: ", "))]")
                        }
                    }
                } else {
                    print("  'PixelData' not found.")
                }
                
                // "DataURL" の型情報を調査
                if let dataURL = childDict["DataURL"] {
                    let jsValue = JSValue(object: dataURL, in: context)
                    print("  'DataURL' found:")
                    // --- ▼ 修正点: エラー 9-11: 'jsValue?' で安全にアンラップ ---
                    print("    isString: \(jsValue?.isString ?? false)")
                    if jsValue?.isString ?? false, let str = jsValue?.toString() {
                        print("    Value (head): \(str.prefix(40))...")
                    }
                } else {
                    print("  'DataURL' not found.")
                }
                print("---------------------------------")
            }
            // --- ▲ デバッグログここまで ▲ ---
            
            let image: NSImage? = nil

            let info = LayerInfo(
                name: layerName,
                isGroup: childDict["Folder"] as? Bool ?? false,
                isVisible: childDict["Visible"] as? Bool ?? false,
                opacity: childDict["Opacity"] as? Double ?? 255.0,
                blendMode: childDict["BlendMode"] as? String ?? "normal",
                children: mapLayer(dict: childDict, context: context),
                image: image
            )
            layers.append(info)
        }
        return layers
    }
    
    // (imageFromPixelData ヘルパーは変更なし)
    private func imageFromPixelData(_ pixelDataJS: JSValue, width: Int, height: Int, context: JSContext) -> NSImage? {
        
        guard let lengthValue = pixelDataJS.objectForKeyedSubscript("length"),
              let length = lengthValue.toNumber()?.intValue,
              length == width * height * 4 else {
            print("PSDParser Error: PixelData の長さが Width*Height*4 と一致しません。")
            return nil
        }

        var pixelData = Data(count: length)
        
        pixelData.withUnsafeMutableBytes { (pointer: UnsafeMutableRawBufferPointer) in
            for i in 0..<length {
                if let byte = pixelDataJS.atIndex(i)?.toNumber()?.uint8Value {
                    pointer[i] = byte
                }
            }
        }
        
        guard let provider = CGDataProvider(data: pixelData as CFData) else {
            return nil
        }

        let bitsPerComponent = 8
        let bitsPerPixel = 32
        let bytesPerRow = 4 * width
        let colorSpace = CGColorSpaceCreateDeviceRGB()
        let bitmapInfo = CGBitmapInfo(rawValue: CGImageAlphaInfo.premultipliedLast.rawValue)

        guard let cgImage = CGImage(
            width: width,
            height: height,
            bitsPerComponent: bitsPerComponent,
            bitsPerPixel: bitsPerPixel,
            bytesPerRow: bytesPerRow,
            space: colorSpace,
            bitmapInfo: bitmapInfo,
            provider: provider,
            decode: nil,
            shouldInterpolate: true,
            intent: .defaultIntent
        ) else {
            return nil
        }

        return NSImage(cgImage: cgImage, size: NSSize(width: width, height: height))
    }
}
