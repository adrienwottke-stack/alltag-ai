import { createStore } from './store.mjs';
import { backup } from 'node:sqlite';
const store = createStore(process.env.DATA_DIR || './data',process.env.DATA_KEY);
if(process.argv[2]==='init') {
  if(store.get('SELECT count(*) n FROM users').n)throw new Error('Already initialized');
  const accounts=[store.addUser('Adrien','admin',true),store.addUser('Testperson 1'),store.addUser('Testperson 2'),store.addUser('Techniktest','tester',true)];
  console.log(JSON.stringify({url:process.env.APP_ORIGIN,accounts},null,2));
} else if(process.argv[2]==='backup') {
  store.cleanup();
  await backup(store.db,process.argv[3]);
  console.log('Backup complete');
} else throw new Error('Use init or backup');
store.db.close();
