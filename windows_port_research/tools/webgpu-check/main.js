const { app, BrowserWindow } = require('electron')
const fs = require('fs')

// electron/main.ts と同じスイッチを揃える（揃えないと navigator.gpu が生えない）
app.commandLine.appendSwitch('enable-gpu-rasterization')
app.commandLine.appendSwitch('enable-zero-copy')
app.commandLine.appendSwitch('ignore-gpu-blocklist')
app.commandLine.appendSwitch('enable-unsafe-webgpu')
app.commandLine.appendSwitch('enable-features', 'CanvasOopRasterization,SharedArrayBuffer')
app.commandLine.appendSwitch('disable-gpu-sandbox')
app.commandLine.appendSwitch('in-process-gpu')

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 400, height: 300 })
  // data: URL は secure context ではないため navigator.gpu が生えない。
  // 実アプリと同じ file:// から読む。
  await win.loadFile(require('path').join(__dirname, 'index.html'))
  const result = await win.webContents.executeJavaScript(`(async () => {
    const out = { hasNavigatorGpu: !!navigator.gpu };
    if (!navigator.gpu) return out;
    try {
      const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
      out.adapter = !!adapter;
      if (!adapter) return out;
      const info = adapter.info || (adapter.requestAdapterInfo ? await adapter.requestAdapterInfo() : null);
      if (info) out.info = { vendor: info.vendor, architecture: info.architecture, device: info.device, description: info.description };
      const device = await adapter.requestDevice();
      out.device = !!device;
    } catch (e) { out.error = String(e); }
    return out;
  })()`)
  fs.writeFileSync('C:\\Users\\gzabu\\uxfd-win-probe\\webgpu.json', JSON.stringify(result, null, 2))
  app.quit()
})
