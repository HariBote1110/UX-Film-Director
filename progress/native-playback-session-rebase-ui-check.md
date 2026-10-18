# Native playback session / scrub 実UI確認

2026-10-18、専用Electron profileとport 5321/9341を使い、`UXFD_NATIVE_OVERLAY=1`でmacOS実Electronを起動した。検証用に移動する図形と、stroke/shadow付きTextを作成し、選択枠とnative playbackの更新をCDPとアプリ画面で確認した。専用profile変更用の一時的な`electron/main.ts` hookは確認後に削除した。

再生中にscene position query RPCが追加で増えないことを確認した。安定再生中のscene RPC request数は6のままで、native playback診断ではpresent済みframeが増加した。再生中に図形からTextへ選択を変えると、約400 ms後の観測で選択quadがText側へ移り、UI notificationも増えた。これは選択変更から最初のnative presentまでの厳密な遅延計測ではなく、観測窓内での動作確認である。

再生中のscrubでは、time 1.9秒付近のsession 5から0.209秒への要求に対してsession 6が始まり、250 ms後には再生中のtimeが約0.410秒、geometry frameが24となった。`isPlaying`とnative playbackが維持され、旧clockのpause応答でscrub先へ巻き戻る挙動は観測しなかった。要求直後から再開presentまでの間に旧geometryを再利用しない契約は単体テストでも確認済み。

即Pauseは、0.209秒からPlayし40 ms後にPauseする自然な操作を一度確認した。UI stateは`isPlaying=false`かつ`nativePlaybackActive=false`となり、main playback診断のrequested/presented frameは初期1 frameだけ増え、その後1秒間増えなかった。preload bridgeはfrozenであるため、CDPからstart RPC応答を人工的に遅延させる試験は行っていない。start RPC中の所有者付きPauseとinitial evaluation後の再スケジュール抑止は、遅延evaluationを使うcontroller/hook境界テストで検証した。

確認したElectronは終了済み。Windows実機やmacOS以外の実機挙動はこの確認範囲に含まれない。

## 停止中のhit-test / drag / resize

2026-10-18、別profileとport 5322/9352のElectronで、停止スクラブ`0.209`秒・Rust評価frame 13を維持したまま実pointer eventを送った。canvasのCSS boundsは`(98.67, 50.16, 781.65, 439.68)`、1920px project widthに対するdisplay scaleは`0.40711`だった。図形をクリックすると`selectedIds`が`p4-hit-shape`へ変わり、ドラッグ時はstore座標`(360, 220)`から`(460, 280)`、同じRust frame 13のclip translationも`(460, 280)`へ追従しrevisionが更新された。

同じ図形のbottom-right handleを中心`(416.22, 249.64)`から`(452.22, 273.64)`へpointer dragした際、storeの`scaleX/scaleY`とRust transformは約`2.0337`になった。pointer移動量をpreview-local project座標へ換算すると幅88.4px・高さ58.9pxで、初期320×210pxのaspect lock resizeなら約`1.28`が期待される。したがってresizeではclient座標のpreview原点が混入する問題を実操作で確認した。修正前のこの状態を記録し、座標補正後に再確認した。

Textではクリック選択とドラッグを確認した。ドラッグ時はproject座標`(439, 534)`から`(498, 568)`へ移り、Rust評価はframe 13のまま更新された。Textのresize handleは`display:none`かつ`pointer-events:none`だった。

その後、preview surfaceの現在位置を読むresize-only補正を加えた。回帰テストは非ゼロoriginかつdisplayScale 1未満でhandle上のscale維持と`+36×24 CSS px`移動を検証し、originゼロで従来座標が変わらないことも固定した。修正後に同じ実画面条件を再現すると、初期scale 1からstore/Rust transformとも約`1.28072`へ変わり、frame 13を維持した。aspect lockは幅比`1.27634`と高さ比`1.28072`の大きい方を両軸へ適用するため、pointer終点と新handle位置の差約`0.57 CSS px`は期待どおりの結果だった。検証時のstoreサイズは320×210のまま、scaleのみが変わる仕様を確認した。
