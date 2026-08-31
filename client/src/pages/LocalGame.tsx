import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bolt, Pill } from '../components/Chrome';
import GameView from '../components/GameView';
import PlayerBar from '../components/PlayerBar';
import ResultScreen from '../components/ResultScreen';
import Screen from '../components/Screen';
import Stage from '../components/Stage';
import { pair } from '../lib/looks';
import { myFaceSeed } from '../lib/looks';
import { quipFor } from '../lib/quips';
import { useLocalGame } from '../store/useLocalGame';
import './screens.css';

/** Pass-and-play: two people, one device. */
export default function LocalGame() {
  const navigate = useNavigate();
  const { board, turn, outcome, score, round, place, reset } = useLocalGame();

  const looks = useMemo(
    () => pair({ seed: myFaceSeed(), name: 'Player one' }, { seed: 'local-two', name: 'Player two' }),
    [],
  );

  // The stage colour is the loudest turn signal in the reference: pink for one
  // player, navy for the other, and a third colour once the round resolves.
  const tone =
    outcome.kind === 'win'
      ? 'win'
      : outcome.kind === 'draw'
        ? 'draw'
        : turn === 'X'
          ? 'p1'
          : 'p2';

  const who = turn === 'X' ? 'One' : 'Two';
  const status =
    outcome.kind === 'win'
      ? `${looks[outcome.winner].name} wins`
      : outcome.kind === 'draw'
        ? 'A draw'
        : `${looks[turn].name} to play`;

  return (
    <>
      <Stage tone={tone} />
      <Screen>
        <GameView
          identity={
            <PlayerBar
              looks={looks}
              turn={outcome.kind === 'playing' ? turn : null}
              score={{ X: score.X, O: score.O }}
            />
          }
          headline={{ left: `P${who === 'One' ? '1' : '2'}'s`, right: 'Turn!' }}
          board={board}
          outcome={outcome}
          canPlay={outcome.kind === 'playing'}
          ghostMark={outcome.kind === 'playing' ? turn : null}
          looks={looks}
          round={round}
          onPlay={place}
          status={status}
          footer={
            <Pill tone="cream" onClick={() => navigate('/')}>
              Back
            </Pill>
          }
        />

        {outcome.kind !== 'playing' && (
          <ResultScreen
            word={outcome.kind === 'win' ? 'Boom!' : 'Draw'}
            eyebrow={
              <span className="ui toppill toppill--magenta">
                <Bolt fill="currentColor" />
                {outcome.kind === 'win' ? `${looks[outcome.winner].name} takes it` : 'Nobody moves'}
              </span>
            }
            quip={quipFor(outcome.kind === 'win' ? 'win' : 'draw', `${round}`)}
            face={{ seed: looks[outcome.kind === 'win' ? outcome.winner : 'X'].seed }}
            mood={outcome.kind === 'win' ? 'happy' : 'idle'}
            score={{ one: score.X, two: score.O, draws: score.draws }}
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
