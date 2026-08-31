import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { other } from '@shared/game';
import { Bolt, Bubble, Pill } from '../components/Chrome';
import GameView from '../components/GameView';
import PlayerBar from '../components/PlayerBar';
import ResultScreen from '../components/ResultScreen';
import Screen from '../components/Screen';
import Stage from '../components/Stage';
import { useToast } from '../components/Toast';
import { BEAT, E, dur, gsap, prefersReducedMotion } from '../lib/motion';
import { myFaceSeed, pair } from '../lib/looks';
import { quipFor, randomQuip } from '../lib/quips';
import { useOnlineGame } from '../store/useOnlineGame';
import './screens.css';

export default function OnlineGame() {
  const { roomId = '' } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  const {
    phase,
    link,
    seat,
    room,
    error,
    pending,
    justConnected,
    notice,
    attach,
    join,
    move,
    rematch,
    leave,
    clearJustConnected,
  } = useOnlineGame();

  useEffect(() => {
    const detach = attach();
    void join(roomId);
    return detach;
  }, [attach, join, roomId]);

  const shareUrl = useMemo(() => `${window.location.origin}/play/${roomId}`, [roomId]);

  const copy = async () => {
    try {
      if (navigator.share && /Mobi|Android/i.test(navigator.userAgent)) {
        await navigator.share({ title: 'TRIO', text: 'Play me. Three in a row.', url: shareUrl });
        return;
      }
      await navigator.clipboard.writeText(shareUrl);
      toast('Link copied');
    } catch {
      try {
        await navigator.clipboard.writeText(shareUrl);
        toast('Link copied');
      } catch {
        toast('Copy failed, select the link');
      }
    }
  };

  /* Seats are X/O on the wire, but each player is drawn as a face. The room id
     seeds the opponent so both clients render the same opponent. */
  const looks = useMemo(() => {
    const mine = myFaceSeed();
    const theirs = `room-${roomId}`;
    return seat === 'O'
      ? pair({ seed: theirs, name: 'Them' }, { seed: mine, name: 'You' })
      : pair({ seed: mine, name: 'You' }, { seed: theirs, name: 'Them' });
  }, [roomId, seat]);

  if (phase === 'error' || phase === 'closed') {
    return (
      <>
        <Stage tone="alert" />
        <Screen>
          <div className="notice" role="alert">
            <h2 className="display">{phase === 'closed' ? 'Room closed' : 'No luck'}</h2>
            <p className="lead notice__lead">
              {error ?? 'The room expired or both players left.'}
            </p>
            <Pill tone="cream" onClick={() => navigate('/')}>
              Back to menu
            </Pill>
          </div>
        </Screen>
      </>
    );
  }

  if (!room || !seat) {
    return (
      <>
        <Stage tone="p1" />
        <Screen>
          <div className="notice">
            <h2 className="display">Opening {roomId}</h2>
            <p className="lead notice__lead" role="status">
              Connecting to the game server.
            </p>
            <Pill tone="cream" onClick={() => navigate('/')}>
              Back to menu
            </Pill>
          </div>
        </Screen>
      </>
    );
  }

  const opponentSeat = other(seat);
  const opponentHere = room.present[opponentSeat];
  const myTurn = room.turn === seat && room.outcome.kind === 'playing';
  const canPlay = phase === 'ready' && link === 'online' && myTurn && pending === null;
  const iWon = room.outcome.kind === 'win' && room.outcome.winner === seat;

  /**
   * `phase` drops back to 'waiting' whenever a seat is empty, which cannot tell
   * "nobody has joined yet" apart from "my opponent just dropped". `graceUntil`
   * can: it is only set while a seat is *claimed but absent*.
   */
  const opponentDropped = !opponentHere && room.graceUntil !== null;
  const neverJoined = !opponentHere && room.graceUntil === null;

  const tone =
    room.outcome.kind === 'win'
      ? iWon
        ? 'win'
        : 'lose'
      : room.outcome.kind === 'draw'
        ? 'draw'
        : !opponentHere || link !== 'online'
          ? 'alert'
          : myTurn
            ? 'p1'
            : 'p2';

  const status =
    link === 'reconnecting'
      ? 'Reconnecting'
      : !opponentHere && room.outcome.kind === 'playing'
        ? opponentDropped
          ? 'Opponent disconnected'
          : 'Waiting for a challenger'
        : room.outcome.kind === 'win'
          ? iWon
            ? 'You win'
            : 'They win'
          : room.outcome.kind === 'draw'
            ? 'A draw'
            : pending !== null
              ? 'Sending'
              : myTurn
                ? 'Your turn'
                : 'Their turn';

  const iRequestedRematch = room.rematchRequested[seat];
  const theyRequestedRematch = room.rematchRequested[opponentSeat];

  // Only nag about the empty seat while nobody has ever taken it.
  const waitingBubble =
    neverJoined && room.outcome.kind === 'playing' ? randomQuip('waiting') : null;

  const headline: { left: string; right: string } =
    link !== 'online'
      ? { left: 'Hold', right: 'On!' }
      : opponentDropped
        ? { left: 'Hang', right: 'About!' }
        : neverJoined
          ? { left: 'Waiting', right: 'On you!' }
          : myTurn
            ? { left: 'Your', right: 'Turn!' }
            : { left: 'Their', right: 'Turn!' };

  return (
    <>
      <Stage tone={tone} />
      <Screen>
        {justConnected && <ConnectFlash onDone={clearJustConnected} />}

        <GameView
          identity={
            <PlayerBar
              looks={looks}
              turn={room.outcome.kind === 'playing' ? room.turn : null}
              you={seat}
              present={room.present}
              score={{ X: room.score.X, O: room.score.O }}
            />
          }
          headline={headline}
          bubble={waitingBubble ? <Bubble side="left">{waitingBubble}</Bubble> : undefined}
          board={room.board}
          outcome={room.outcome}
          canPlay={canPlay}
          ghostMark={canPlay ? seat : null}
          pending={pending}
          looks={looks}
          round={room.round}
          onPlay={move}
          status={status}
          /* The connection state and the way out are always present, whatever
             else the footer is showing: a player must never be stranded in a
             room with no explanation and no exit. */
          footer={
            <>
              {/* Only invite someone while the second seat has never been
                  taken. Once a real opponent has dropped, the countdown is the
                  more useful thing to show in that space. */}
              {neverJoined && room.outcome.kind === 'playing' && (
                <div className="share">
                  <code className="share__link">{shareUrl}</code>
                  <Pill tone="cream" onClick={copy} bolt>
                    Copy link
                  </Pill>
                  <span className="label share__code">
                    or code <strong>{roomId}</strong>
                  </span>
                </div>
              )}

              {link === 'reconnecting' && (
                <span className="ui toppill toppill--magenta" role="status">
                  Connection lost, reconnecting
                </span>
              )}

              {notice && (
                <span className="ui toppill toppill--magenta" role="status">
                  {notice}
                </span>
              )}

              {link === 'online' && opponentDropped && room.graceUntil && (
                <span className="ui toppill toppill--magenta" role="status">
                  <Countdown until={room.graceUntil} />
                </span>
              )}

              <Pill
                tone="cream"
                onClick={() => {
                  leave();
                  navigate('/');
                }}
              >
                {opponentHere ? 'Leave' : 'New game'}
              </Pill>
            </>
          }
        />

        {room.outcome.kind !== 'playing' && (
          <ResultScreen
            word={iWon ? 'Nice!' : room.outcome.kind === 'draw' ? 'Draw' : 'Nope'}
            eyebrow={
              <span className="ui toppill toppill--magenta">
                <Bolt fill="currentColor" />
                {iWon ? 'Victory' : room.outcome.kind === 'draw' ? 'Stalemate' : 'Defeat'}
              </span>
            }
            quip={quipFor(
              iWon ? 'win' : room.outcome.kind === 'draw' ? 'draw' : 'lose',
              `${roomId}${room.round}`,
            )}
            face={{ seed: looks[seat].seed }}
            mood={iWon ? 'happy' : room.outcome.kind === 'draw' ? 'idle' : 'sad'}
            score={{ one: room.score.X, two: room.score.O, draws: room.score.draws }}
          >
            <Pill tone="cream" onClick={rematch} disabled={iRequestedRematch || !opponentHere}>
              {iRequestedRematch
                ? 'Waiting for them'
                : theyRequestedRematch
                  ? 'They want a rematch, go!'
                  : 'Play again!'}
            </Pill>
            <Pill
              tone="outline"
              onClick={() => {
                leave();
                navigate('/');
              }}
            >
              Leave
            </Pill>
          </ResultScreen>
        )}
      </Screen>
    </>
  );
}

/** A ring that snaps out once when the opponent arrives. */
function ConnectFlash({ onDone }: { onDone: () => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node || prefersReducedMotion()) {
      onDone();
      return;
    }
    const ctx = gsap.context(() => {
      gsap
        .timeline({ onComplete: onDone })
        .fromTo(
          node,
          { scale: 0.5, opacity: 0 },
          { scale: 1, opacity: 1, duration: dur(BEAT.connect), ease: E.back },
        )
        .to(node, { opacity: 0, duration: dur(0.24), ease: E.out }, '+=0.35');
    }, node);
    return () => ctx.revert();
  }, [onDone]);

  return (
    <div className="connect-flash" ref={ref} aria-hidden="true">
      <span />
    </div>
  );
}

/** Live countdown on the opponent's reconnect grace window. */
function Countdown({ until }: { until: number }) {
  const [left, setLeft] = useState(() => Math.max(0, until - Date.now()));

  useEffect(() => {
    const id = window.setInterval(() => setLeft(Math.max(0, until - Date.now())), 500);
    return () => window.clearInterval(id);
  }, [until]);

  const seconds = Math.ceil(left / 1000);
  if (seconds <= 0) return <>Opponent gone</>;
  return (
    <>
      Opponent disconnected, back in {Math.floor(seconds / 60)}:
      {String(seconds % 60).padStart(2, '0')}
    </>
  );
}
