import React, { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { useTranslation } from '../i18n';
import { ProjectSettings } from '../types';

const STORAGE_KEY = 'ux-film-director-last-settings';

interface ProjectSetupProps {
  onOpenProject: () => void;
  isProjectIoBusy?: boolean;
}

const ProjectSetup: React.FC<ProjectSetupProps> = ({ onOpenProject, isProjectIoBusy = false }) => {
  const initializeProject = useStore((state) => state.initializeProject);
  const language = useStore((state) => state.language);
  const t = useTranslation(language);
  
  const [settings, setSettings] = useState<ProjectSettings>({
    width: 1920,
    height: 1080,
    fps: 60,
    sampleRate: 44100
  });

  const [hasLastSettings, setHasLastSettings] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      setHasLastSettings(true);
    }
  }, []);

  const handleChange = (key: keyof ProjectSettings, value: number) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const handleCreate = () => {
    // Save to local storage
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    initializeProject(settings);
  };

  const handleContinue = () => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      initializeProject(parsed);
    }
  };

  const inputStyle = {
    background: '#333',
    border: '1px solid #555',
    color: '#fff',
    padding: '8px',
    borderRadius: '4px',
    width: '100%',
    marginBottom: '16px'
  };

  const labelStyle = {
    display: 'block',
    marginBottom: '6px',
    fontSize: '12px',
    color: '#aaa'
  };

  return (
    <div className="setup-screen" style={{ height: 'calc(100vh - 48px)', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
      <div className="glass setup-card" style={{ width: '420px', padding: '40px', borderRadius: 'var(--radius-lg)' }}>
        <h2 style={{ marginTop: 0, marginBottom: '24px', textAlign: 'center', fontSize: '24px', fontWeight: 700, letterSpacing: '-0.5px' }}>{t('createNewProject')}</h2>

        {hasLastSettings && (
          <div style={{ marginBottom: '24px', paddingBottom: '24px', borderBottom: '1px solid var(--border-subtle)' }}>
            <button 
              className="btn-primary"
              onClick={handleContinue}
              disabled={isProjectIoBusy}
              style={{ width: '100%', height: '44px', fontSize: '14px' }}
            >
              {language === 'en' ? 'Continue with previous settings' : '前回の設定で続ける'}
            </button>
          </div>
        )}

        <div style={{ marginBottom: '24px', paddingBottom: '24px', borderBottom: '1px solid var(--border-subtle)' }}>
          <button
            onClick={onOpenProject}
            disabled={isProjectIoBusy}
            style={{ width: '100%', height: '44px', fontSize: '14px' }}
          >
            {isProjectIoBusy ? t('loading') : t('openExistingProject')}
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '16px' }}>
          <div className="input-group">
            <label className="input-label">{t('width')} (px)</label>
            <input 
              type="number" 
              value={settings.width} 
              onChange={(e) => handleChange('width', parseInt(e.target.value))}
            />
          </div>
          <div className="input-group">
            <label className="input-label">{t('height')} (px)</label>
            <input 
              type="number" 
              value={settings.height} 
              onChange={(e) => handleChange('height', parseInt(e.target.value))}
            />
          </div>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label className="input-label">{t('fps')}</label>
          <select 
            value={settings.fps} 
            onChange={(e) => handleChange('fps', parseInt(e.target.value))}
            style={{ width: '100%', height: '36px' }}
          >
            <option value="24">24 fps</option>
            <option value="30">30 fps</option>
            <option value="60">60 fps</option>
          </select>
        </div>

        <div style={{ marginBottom: '32px' }}>
          <label className="input-label">{t('sampleRate')} (Hz)</label>
          <select 
            value={settings.sampleRate} 
            onChange={(e) => handleChange('sampleRate', parseInt(e.target.value))}
            style={{ width: '100%', height: '36px' }}
          >
            <option value="44100">44100 Hz</option>
            <option value="48000">48000 Hz</option>
          </select>
        </div>

        <button 
          className="btn-primary"
          onClick={handleCreate}
          style={{ width: '100%', height: '48px', fontSize: '15px', fontWeight: 600 }}
        >
          {t('create')}
        </button>
      </div>
    </div>
  );
};

export default ProjectSetup;
