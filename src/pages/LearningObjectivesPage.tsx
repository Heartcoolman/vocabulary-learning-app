/**
 * Learning Objectives Configuration Page
 * 学习目标配置页面
 */

import React, { useState, useEffect } from 'react';
import ApiClient from '../services/ApiClient';
import { LearningObjectives, LearningObjectiveMode } from '../types/learning-objectives';

interface ModeConfig {
  label: string;
  description: string;
  icon: string;
}

const MODE_CONFIGS: Record<LearningObjectiveMode, ModeConfig> = {
  exam: {
    label: '考试模式',
    description: '提升准确率，适合备考冲刺',
    icon: '📝'
  },
  daily: {
    label: '日常模式',
    description: '平衡学习，适合长期记忆',
    icon: '📚'
  },
  travel: {
    label: '旅行模式',
    description: '快速学习，适合时间有限',
    icon: '✈️'
  },
  custom: {
    label: '自定义模式',
    description: '自定义配置，灵活调整',
    icon: '⚙️'
  }
};

export const LearningObjectivesPage: React.FC = () => {
  const [objectives, setObjectives] = useState<LearningObjectives | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    loadObjectives();
  }, []);

  const loadObjectives = async () => {
    try {
      setLoading(true);
      const response: any = await ApiClient.getLearningObjectives();
      setObjectives(response.data || response);
      setError(null);
    } catch (err: any) {
      if (err?.response?.status === 404) {
        setObjectives({
          userId: '',
          mode: 'daily',
          primaryObjective: 'accuracy',
          weightShortTerm: 0.4,
          weightLongTerm: 0.4,
          weightEfficiency: 0.2
        });
      } else {
        setError('加载配置失败');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleModeChange = async (mode: LearningObjectiveMode) => {
    try {
      setSaving(true);
      const response: any = await ApiClient.switchLearningMode(mode, 'manual');
      setObjectives(response.data || response);
      setSuccessMessage(`已切换到${MODE_CONFIGS[mode].label}`);
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setError('切换模式失败');
    } finally {
      setSaving(false);
    }
  };

  const handleWeightChange = (field: 'weightShortTerm' | 'weightLongTerm' | 'weightEfficiency', value: number) => {
    if (!objectives) return;
    setObjectives({ ...objectives, [field]: value });
  };

  const handleSaveCustom = async () => {
    if (!objectives) return;

    const total = objectives.weightShortTerm + objectives.weightLongTerm + objectives.weightEfficiency;
    if (Math.abs(total - 1.0) > 0.01) {
      setError('权重总和必须为 1.0');
      return;
    }

    try {
      setSaving(true);
      await ApiClient.updateLearningObjectives(objectives);
      setSuccessMessage('配置已保存');
      setTimeout(() => setSuccessMessage(null), 3000);
      setError(null);
    } catch (err) {
      setError('保存失败');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div style={styles.container}>加载中...</div>;
  }

  if (!objectives) {
    return <div style={styles.container}>无法加载配置</div>;
  }

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>学习目标配置</h1>

      {error && <div style={styles.error}>{error}</div>}
      {successMessage && <div style={styles.success}>{successMessage}</div>}

      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>学习模式</h2>
        <div style={styles.modeGrid}>
          {(Object.keys(MODE_CONFIGS) as LearningObjectiveMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => handleModeChange(mode)}
              disabled={saving || objectives.mode === mode}
              style={{
                ...styles.modeCard,
                ...(objectives.mode === mode ? styles.modeCardActive : {})
              }}
            >
              <div style={styles.modeIcon}>{MODE_CONFIGS[mode].icon}</div>
              <div style={styles.modeLabel}>{MODE_CONFIGS[mode].label}</div>
              <div style={styles.modeDescription}>{MODE_CONFIGS[mode].description}</div>
            </button>
          ))}
        </div>
      </section>

      {objectives.mode === 'custom' && (
        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>权重配置</h2>

          <div style={styles.sliderGroup}>
            <label style={styles.sliderLabel}>
              短期记忆: {objectives.weightShortTerm.toFixed(2)}
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={objectives.weightShortTerm}
              onChange={(e) => handleWeightChange('weightShortTerm', parseFloat(e.target.value))}
              style={styles.slider}
            />
          </div>

          <div style={styles.sliderGroup}>
            <label style={styles.sliderLabel}>
              长期记忆: {objectives.weightLongTerm.toFixed(2)}
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={objectives.weightLongTerm}
              onChange={(e) => handleWeightChange('weightLongTerm', parseFloat(e.target.value))}
              style={styles.slider}
            />
          </div>

          <div style={styles.sliderGroup}>
            <label style={styles.sliderLabel}>
              学习效率: {objectives.weightEfficiency.toFixed(2)}
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={objectives.weightEfficiency}
              onChange={(e) => handleWeightChange('weightEfficiency', parseFloat(e.target.value))}
              style={styles.slider}
            />
          </div>

          <div style={styles.weightSum}>
            权重总和: {(objectives.weightShortTerm + objectives.weightLongTerm + objectives.weightEfficiency).toFixed(2)}
          </div>

          <button
            onClick={handleSaveCustom}
            disabled={saving}
            style={styles.saveButton}
          >
            {saving ? '保存中...' : '保存配置'}
          </button>
        </section>
      )}

      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>当前配置</h2>
        <div style={styles.configDisplay}>
          <p><strong>模式:</strong> {MODE_CONFIGS[objectives.mode].label}</p>
          <p><strong>主要目标:</strong> {objectives.primaryObjective}</p>
          <p><strong>权重分布:</strong></p>
          <ul>
            <li>短期记忆: {(objectives.weightShortTerm * 100).toFixed(0)}%</li>
            <li>长期记忆: {(objectives.weightLongTerm * 100).toFixed(0)}%</li>
            <li>学习效率: {(objectives.weightEfficiency * 100).toFixed(0)}%</li>
          </ul>
        </div>
      </section>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '24px',
    fontFamily: 'Arial, sans-serif'
  },
  title: {
    fontSize: '28px',
    fontWeight: 'bold',
    marginBottom: '24px',
    color: '#333'
  },
  error: {
    padding: '12px',
    marginBottom: '16px',
    backgroundColor: '#fee',
    color: '#c33',
    borderRadius: '4px',
    border: '1px solid #fcc'
  },
  success: {
    padding: '12px',
    marginBottom: '16px',
    backgroundColor: '#efe',
    color: '#3c3',
    borderRadius: '4px',
    border: '1px solid #cfc'
  },
  section: {
    marginBottom: '32px',
    padding: '20px',
    backgroundColor: '#f9f9f9',
    borderRadius: '8px',
    border: '1px solid #e0e0e0'
  },
  sectionTitle: {
    fontSize: '20px',
    fontWeight: 'bold',
    marginBottom: '16px',
    color: '#555'
  },
  modeGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '16px'
  },
  modeCard: {
    padding: '20px',
    backgroundColor: '#fff',
    border: '2px solid #ddd',
    borderRadius: '8px',
    cursor: 'pointer',
    textAlign: 'center',
    transition: 'all 0.2s'
  },
  modeCardActive: {
    backgroundColor: '#e3f2fd',
    borderColor: '#2196f3',
    transform: 'scale(1.05)'
  },
  modeIcon: {
    fontSize: '48px',
    marginBottom: '12px'
  },
  modeLabel: {
    fontSize: '16px',
    fontWeight: 'bold',
    marginBottom: '8px',
    color: '#333'
  },
  modeDescription: {
    fontSize: '14px',
    color: '#666'
  },
  sliderGroup: {
    marginBottom: '20px'
  },
  sliderLabel: {
    display: 'block',
    marginBottom: '8px',
    fontSize: '14px',
    fontWeight: 'bold',
    color: '#555'
  },
  slider: {
    width: '100%',
    height: '6px'
  },
  weightSum: {
    fontSize: '16px',
    fontWeight: 'bold',
    marginTop: '16px',
    marginBottom: '16px',
    color: '#333'
  },
  saveButton: {
    padding: '12px 24px',
    backgroundColor: '#2196f3',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    fontSize: '16px',
    fontWeight: 'bold',
    cursor: 'pointer',
    transition: 'background-color 0.2s'
  },
  configDisplay: {
    fontSize: '14px',
    color: '#555'
  }
};

export default LearningObjectivesPage;
