export const locales = {
  // Common / TitleBar
  appTitle: { ja: 'UX Film Director (Dev Prototype)', en: 'UX Film Director (Dev Prototype)' },
  openProject: { ja: 'プロジェクトを開く', en: 'Open Project' },
  saveProject: { ja: 'プロジェクトを保存', en: 'Save Project' },
  loading: { ja: '読み込み中...', en: 'Loading...' },
  saving: { ja: '保存中...', en: 'Saving...' },
  snapshot: { ja: 'スナップショット', en: 'Snapshot' },
  exportMp3: { ja: 'MP3で書き出し', en: 'Export MP3' },
  exportingMp3: { ja: 'MP3書き出し中...', en: 'Exporting MP3...' },
  exportVideo: { ja: '動画で書き出し', en: 'Export Video' },
  exportingVideo: { ja: '書き出し中...', en: 'Exporting...' },

  // ProjectSetup
  createNewProject: { ja: '新規プロジェクト作成', en: 'Create New Project' },
  width: { ja: '幅', en: 'Width' },
  height: { ja: '高さ', en: 'Height' },
  fps: { ja: 'フレームレート', en: 'FPS' },
  sampleRate: { ja: 'サンプリングレート', en: 'Sample Rate' },
  create: { ja: '作成', en: 'Create' },
  openExistingProject: { ja: '既存のプロジェクトを開く', en: 'Open Existing Project' },

  // TimelineControlBar
  copy: { ja: 'コピー', en: 'Copy' },
  cut: { ja: '切り取り', en: 'Cut' },
  paste: { ja: '貼り付け', en: 'Paste' },
  duplicate: { ja: '複製', en: 'Duplicate' },
  group: { ja: 'グループ化', en: 'Group' },
  ungroup: { ja: 'グループ解除', en: 'Ungroup' },
  split: { ja: '分割', en: 'Split' },
  delete: { ja: '削除', en: 'Delete' },

  // PropertyPanel - Common
  properties: { ja: 'プロパティ', en: 'Properties' },
  layer: { ja: 'レイヤー', en: 'Layer' },
  startTime: { ja: '開始時間', en: 'Start Time' },
  duration: { ja: 'デュレーション', en: 'Duration' },
  position: { ja: '位置', en: 'Position' },
  size: { ja: 'サイズ', en: 'Size' },
  opacity: { ja: '不透明度', en: 'Opacity' },
  zoom: { ja: '拡大率', en: 'Scale' },
  scaleX: { ja: 'X拡大率', en: 'Scale X' },
  scaleY: { ja: 'Y拡大率', en: 'Scale Y' },
  rotation: { ja: '回転', en: 'Rotation' },
  blendMode: { ja: 'ブレンドモード', en: 'Blend Mode' },
  font: { ja: 'フォント', en: 'Font' },
  color: { ja: '色', en: 'Color' },
  bgColor: { ja: '背景色', en: 'Background Color' },
  src: { ja: 'ソース', en: 'Source' },
  volume: { ja: '音量', en: 'Volume' },
  pan: { ja: 'パン', en: 'Pan' },
  shapeType: { ja: '図形の形', en: 'Shape Type' },

  // Project Settings (in PropertyPanel)
  projectSettings: { ja: 'プロジェクト設定', en: 'Project Settings' },

  // Context Menu
  addShape: { ja: '図形を追加', en: 'Add Shape' },
  addText: { ja: 'テキストを追加', en: 'Add Text' },
  addImage: { ja: '画像を追加', en: 'Add Image' },
  addVideo: { ja: '動画を追加', en: 'Add Video' },
  addAudio: { ja: '音声を追加', en: 'Add Audio' },
  addFilter: { ja: 'フィルタ追加', en: 'Add Filter' },

  // Others
  language: { ja: '言語 / Language', en: 'Language / 言語' },
} as const;

export type LocaleKey = keyof typeof locales;

export const useTranslation = (lang: 'ja' | 'en') => {
  return (key: LocaleKey) => {
    return locales[key]?.[lang] || key;
  };
};
