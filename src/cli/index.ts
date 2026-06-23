import { runGame } from './game';

runGame().catch((err) => {
  console.error(err);
  process.exit(1);
});
