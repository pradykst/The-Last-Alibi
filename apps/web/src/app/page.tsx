import GameShell from '../components/game-shell';
import { buildPageRuntimeModel } from '../server/page-runtime';

export const dynamic = 'force-dynamic';

export default function HomePage() {
  const runtime = buildPageRuntimeModel();

  return (
    <GameShell
      runtimeLabel={runtime.label}
      runtimeAvailable={runtime.available}
      runtimeMode={runtime.available ? runtime.mode : null}
    />
  );
}
