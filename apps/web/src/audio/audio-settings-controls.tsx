'use client';

import { useGameAudio } from './audio-provider';

const LEVELS = [
  ['master', 'Master'],
  ['music', 'Music'],
  ['ambience', 'Ambience'],
  ['sfx', 'Sound effects'],
] as const;

export function AudioSettingsControls() {
  const audio = useGameAudio();
  return (
    <fieldset className="audio-settings-controls">
      <legend>Audio</legend>
      <div className="audio-master-row">
        <div>
          <strong>{audio.settings.muted ? 'Sound muted' : 'Sound enabled'}</strong>
          <span>
            {audio.unlocked
              ? 'Music and effects are ready.'
              : 'Sound begins only after Begin Investigation.'}
          </span>
        </div>
        <button
          type="button"
          aria-pressed={audio.settings.muted}
          aria-label={audio.settings.muted ? 'Unmute all audio' : 'Mute all audio'}
          onClick={() => audio.setMuted(!audio.settings.muted)}
        >
          <span aria-hidden="true">{audio.settings.muted ? 'Muted' : 'On'}</span>
        </button>
      </div>
      <div className="audio-levels">
        {LEVELS.map(([key, label]) => {
          const value = audio.settings[key];
          return (
            <label key={key} htmlFor={`audio-${key}`}>
              <span>
                <strong>{label}</strong>
                <output htmlFor={`audio-${key}`}>{Math.round(value * 100)}%</output>
              </span>
              <input
                id={`audio-${key}`}
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={value}
                aria-valuetext={`${Math.round(value * 100)} percent`}
                onChange={(event) => audio.setLevel(key, Number(event.target.value))}
              />
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
