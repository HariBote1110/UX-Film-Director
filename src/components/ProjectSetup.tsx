import React, { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { useTranslation } from '../i18n';
import { ProjectSettings } from '../types';
import { parseFpsInput } from './projectSetupFps';

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
  const [fpsDraft, setFpsDraft] = useState(String(settings.fps));

  const fpsValue = parseFpsInput(fpsDraft);
  const isFpsInvalid = fpsValue === null;

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
    if (fpsValue === null) {
      return;
    }
    const finalSettings: ProjectSettings = { ...settings, fps: fpsValue };
    // Save to local storage
    localStorage.setItem(STORAGE_KEY, JSON.stringify(finalSettings));
    initializeProject(finalSettings);
  };

  const handleContinue = () => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      initializeProject(parsed);
    }
  };

  return (
    <div className="setup-screen" style={{ height: 'calc(100vh - 40px)', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
      <div className="glass setup-card" style={{ width: '400px', padding: '32px', borderRadius: 'var(--radius-lg)' }}>
        <h2 style={{ marginTop: 0, marginBottom: '24px', textAlign: 'center', fontSize: '20px', fontWeight: 700, letterSpacing: '-0.5px' }}>{t('createNewProject')}</h2>

        {hasLastSettings && (
          <div style={{ marginBottom: '20px', paddingBottom: '20px', borderBottom: '1px solid var(--border-subtle)' }}>
            <button 
              className="btn-primary"
              onClick={handleContinue}
              disabled={isProjectIoBusy}
              style={{ width: '100%', height: '40px' }}
            >
              {language === 'en' ? 'Continue' : '前回の設定で続ける'}
            </button>
          </div>
        )}

        <div style={{ marginBottom: '20px', paddingBottom: '20px', borderBottom: '1px solid var(--border-subtle)' }}>
          <button
            onClick={onOpenProject}
            disabled={isProjectIoBusy}
            style={{ width: '100%', height: '40px' }}
          >
            {isProjectIoBusy ? t('loading') : t('openExistingProject')}
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
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
          <input
            type="number"
            min={1}
            max={240}
            step={1}
            list="fps-suggestions"
            value={fpsDraft}
            onChange={(e) => setFpsDraft(e.target.value)}
            aria-invalid={isFpsInvalid}
            style={{ width: '100%' }}
          />
          <datalist id="fps-suggestions">
            <option value="24" />
            <option value="30" />
            <option value="60" />
          </datalist>
          {isFpsInvalid && (
            <div style={{ marginTop: '4px', fontSize: '12px', color: '#f87171' }}>
              {t('fpsInvalidRange')}
            </div>
          )}
        </div>

        <div style={{ marginBottom: '28px' }}>
          <label className="input-label">{t('sampleRate')} (Hz)</label>
          <select 
            value={settings.sampleRate} 
            onChange={(e) => handleChange('sampleRate', parseInt(e.target.value))}
            style={{ width: '100%' }}
          >
            <option value="44100">44100 Hz</option>
            <option value="48000">48000 Hz</option>
          </select>
        </div>

        <button
          className="btn-primary"
          onClick={handleCreate}
          disabled={isFpsInvalid}
          style={{ width: '100%', height: '44px', fontWeight: 600 }}
        >
          {t('create')}
        </button>
      </div>
    </div>
  );
};

export default ProjectSetup;
