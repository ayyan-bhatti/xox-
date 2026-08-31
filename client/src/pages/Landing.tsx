import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bolt, Bubble, Pill } from '../components/Chrome';
import Face from '../components/Face';
import Screen from '../components/Screen';
import Stage from '../components/Stage';
import { useToast } from '../components/Toast';
import { RIM, myFaceSeed, rerollMyFace } from '../lib/looks';
import { useOnlineGame } from '../store/useOnlineGame';
import './screens.css';

export default function Landing() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const create = useOnlineGame((s) => s.create);
  const [creating, setCreating] = useState(false);
  /* Persistent, not a toast: reaching this point means the player waited
     several seconds for a server that never answered, and a message that
     vanishes after a second and a half is no use to them. */
  const [connectError, setConnectError] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [seed, setSeed] = useState(myFaceSeed);

  const onCreate = async () => {
    setCreating(true);
    setConnectError(null);
    const roomId = await create();
    setCreating(false);
    if (!roomId) {
      setConnectError(
        useOnlineGame.getState().error ??
          'Could not reach the game server. Check your connection and try again.',
      );
      return;
    }
    navigate(`/play/${roomId}`);
  };

  const onJoin = (event: React.FormEvent) => {
    event.preventDefault();
    setConnectError(null);
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length < 4) {
      toast('Enter a room code');
      return;
    }
    navigate(`/play/${trimmed}`);
  };

  return (
    <>
      <Stage tone="p1" />
      <Screen>
        <div className="landing">
          <h1 className="hero landing__title">
            Trio
            {/* A drawn dot, not a typed full stop: Lilita One's period is a
                square and reads as a rendering glitch at display size. */}
            <span className="landing__dot" aria-hidden="true" />
          </h1>
          <p className="lead landing__tagline">Three in a row. Three ways to play.</p>

          <div className="landing__hero">
            <Bubble className="landing__bubble">Pick your poison</Bubble>
            <div className="landing__face">
              <Face seed={seed} rim={RIM.one} mood="smug" size="100%" />
            </div>
            <button
              type="button"
              className="label landing__reroll"
              data-cursor="action"
              onClick={() => setSeed(rerollMyFace())}
            >
              <Bolt /> New face
            </button>
          </div>

          <div className="landing__modes">
            <ModeCard
              title="Same device"
              blurb="Two of you. One screen. Pass it back and forth."
              onClick={() => navigate('/local')}
            />
            <ModeCard
              title="vs Computer"
              blurb="Play alone. Three difficulties, one of them unbeatable."
              onClick={() => navigate('/solo')}
            />
            <ModeCard
              title="Online"
              blurb="Send a link. Play live against anyone, anywhere."
              onClick={onCreate}
              busy={creating}
            />
          </div>

          {connectError && (
            <p className="landing__error" role="alert">
              <Bolt fill="currentColor" />
              {connectError}
            </p>
          )}

          <form className="landing__join" onSubmit={onJoin}>
            <label className="label" htmlFor="room-code">
              Got a code?
            </label>
            <input
              id="room-code"
              className="field"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="ABC123"
              maxLength={8}
              autoComplete="off"
              spellCheck={false}
              aria-label="Room code"
            />
            <Pill type="submit" tone="outline">
              Join
            </Pill>
          </form>
        </div>
      </Screen>
    </>
  );
}

function ModeCard({
  title,
  blurb,
  onClick,
  busy,
}: {
  title: string;
  blurb: string;
  onClick: () => void;
  busy?: boolean;
}) {
  return (
    <button type="button" className="mode" data-cursor="action" onClick={onClick} disabled={busy}>
      <Bolt className="mode__bolt" fill="var(--coral)" />
      <span className="title mode__title">{busy ? 'Opening…' : title}</span>
      <span className="mode__blurb">{blurb}</span>
    </button>
  );
}
