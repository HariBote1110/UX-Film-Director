import React from 'react';
import { useStore } from '../store/useStore';
import { shallow } from 'zustand/shallow';

/**
 * プロキシ生成中に画面右下へ出すグローバル進捗インジケーター。
 * ドロップ／挿入経由の生成（4K 等の高解像度のみ）が走っている間だけ表示する。
 */
const ProxyGenerationIndicator: React.FC = () => {
  const { proxyGenerationCount, language } = useStore((state) => ({
    proxyGenerationCount: state.proxyGenerationCount,
    language: state.language,
  }), shallow);

  if (proxyGenerationCount <= 0) return null;

  const label = language === 'en'
    ? (proxyGenerationCount > 1 ? `Generating proxies… (${proxyGenerationCount})` : 'Generating proxy…')
    : (proxyGenerationCount > 1 ? `プロキシ生成中…（${proxyGenerationCount}）` : 'プロキシ生成中…');

  return (
    <div
      data-testid="proxy-generation-indicator"
      style={{
        position: 'fixed',
        right: '16px',
        bottom: '16px',
        zIndex: 2000,
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '10px 14px',
        borderRadius: '8px',
        background: 'rgba(20, 20, 24, 0.92)',
        border: '1px solid var(--border-color, #3a3a42)',
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.45)',
        color: 'var(--text-primary, #e8e8ea)',
        fontSize: '12px',
        pointerEvents: 'none',
      }}
    >
      <span
        style={{
          width: '14px',
          height: '14px',
          borderRadius: '50%',
          border: '2px solid rgba(255, 255, 255, 0.25)',
          borderTopColor: 'var(--accent, #4da3ff)',
          animation: 'proxy-spin 0.8s linear infinite',
        }}
      />
      <span>{label}</span>
      <style>{'@keyframes proxy-spin { to { transform: rotate(360deg); } }'}</style>
    </div>
  );
};

export default ProxyGenerationIndicator;
