import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bolt, Bubble, Pill } from '../components/Chrome';
import GameView from '../components/GameView';
import PlayerBar from '../components/PlayerBar';
import ResultScreen from '../components/ResultScreen';
import Screen from '../components/Screen';
import Stage from '../components/Stage';
import { DIFFICULTIES } from '../lib/ai';
import { botName, myFaceSeed, pair } from '../lib/looks';
import { quipFor, randomQuip } from '../lib/quips';
import { useSoloGame } from '../store/useSoloGame';
import './screens.css';

/** One human against the computer. */
export default function SoloGame() {
  const navigate = useNavigate();
  const {
    board,
    turn,
    outcome,
    round,
    score,
    difficulty,
    thinking,
    setDifficulty,
    place,
    reset,
    cancel,
  } = useSoloGame();

  // Cancel any pending computer move if the player leaves mid-think.
  useEffect(() => cancel, [cancel]);

  const botSeed = useMemo(() => `bot-${difficulty}`, [difficulty]);
  const bot = botName(botSeed);
  const looks = useMemo(
    () => pair({ seed: myFaceSeed(), name: 'You' }, { seed: botSeed, name: bot }),
    [botSeed, bot],
  );

  /* A fresh taunt each time the computer starts thinking. */
  const [taunt, setTaunt] = useState<string | null>(null);
  useEffect(() => {
    if (!thinking) {
      setTaunt(null);
      return;
    }
    setTaunt(randomQuip('taunt'));
  }, [thinking]);

  const tone =
    outcome.kind === 'win'
      ? outcome.winner === 'X'
        ? 'win'
        : 'lose'
      : outcome.kind === 'draw'
        ? 'draw'
        : turn === 'X'
          ? 'p1'
          : 'p2';

  const status =
    outcome.kind === 'win'
      ? outcome.winner === 'X'
        ? 'You win'
        : `${bot} wins`
      : outcome.kind === 'draw'
        ? 'A draw'
        : thinking
          ? `${bot} is thinking`
          : 'Your turn';

  const youWon = outcome.kind === 'win' && outcome.winner === 'X';

  return (
    <>
      <Stage tone={tone} />
      <Screen>
        <GameView
          identity={
            <PlayerBar
              looks={looks}
              turn={outcome.kind === 'playing' ? turn : null}
              you="X"
              score={{ X: score.you, O: score.bot }}
            />
          }
          headline={{ left: thinking ? `${bot}'s` : 'Your', right: 'Turn!' }}
          bubble={taunt ? <Bubble side="left">{taunt}</Bubble> : undefined}
          board={board}
          outcome={outcome}
          canPlay={outcome.kind === 'playing' && turn === 'X' && !thinking}
          ghostMark={outcome.kind === 'playing' && turn === 'X' && !thinking ? 'X' : null}
          looks={looks}
          round={round}
          onPlay={place}
          status={status}
          footer={
            <>
              <div className="levels" role="radiogroup" aria-label="Difficulty">
                {DIFFICULTIES.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    role="radio"
                    aria-checked={d.id === difficulty}
                    className="level"
                    data-cursor="action"
                    title={d.blurb}
                    onClick={() => setDifficulty(d.id)}
                  >
                    {d.name}
                  </button>
                ))}
              </div>
              <Pill tone="cream" onClick={() => navigate('/')}>
                Back
              </Pill>
            </>
          }
        />

        {outcome.kind !== 'playing' && (
          <ResultScreen
            word={youWon ? 'Nice!' : outcome.kind === 'draw' ? 'Draw' : 'Nope'}
            eyebrow={
              <span className="ui toppill toppill--magenta">
                <Bolt fill="currentColor" />
                {youWon ? `Beat ${bot}` : outcome.kind === 'draw' ? `Level with ${bot}` : `Lost to ${bot}`}
              </span>
            }
            quip={quipFor(youWon ? 'win' : outcome.kind === 'draw' ? 'draw' : 'lose', `${round}${difficulty}`)}
            face={{ seed: looks.X.seed }}
            mood={youWon ? 'happy' : outcome.kind === 'draw' ? 'idle' : 'sad'}
            score={{ one: score.you, two: score.bot, draws: score.draws }}
          >
            <Pill tone="cream" onClick={reset}>
              Play again!
            </Pill>
            <Pill tone="outline" onClick={() => navigate('/')}>
              Back
            </Pill>
          </ResultScreen>
        )}
      </Screen>
    </>
  );
}
