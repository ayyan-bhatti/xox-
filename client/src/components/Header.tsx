import { useState } from 'react';
import { Link } from 'react-router-dom';
import { isMuted, setMuted } from '../lib/sound';

/**
 * Wordmark plus the sound toggle. The reference keeps its chrome to almost
 * nothing during play, so this stays deliberately thin.
 */
export default function Header() {
  const [muted, setLocalMuted] = useState(isMuted);

  const toggle = () => {
    const next = !muted;
    setMuted(next);
    setLocalMuted(next);
  };

  return (
    <header className="header">
      {/* Deliberately not carrying the `.ui` utility: its font-size is the same
          specificity as `.header__brand` and was winning the cascade. */}
      <Link to="/" className="header__brand" data-cursor="action" aria-label="TRIO, home">
        Trio
      </Link>

      <button
        type="button"
        className="soundbtn"
        data-cursor="action"
        onClick={toggle}
        aria-pressed={!muted}
        aria-label={muted ? 'Unmute sound' : 'Mute sound'}
        title={muted ? 'Sound off' : 'Sound on'}
      >
        {/* Three bars — the reference's own bottom-corner sound affordance. */}
        <span className="soundbtn__bars" data-on={!muted || undefined} aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      </button>
    </header>
  );
}
