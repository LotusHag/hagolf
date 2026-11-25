// The first thing the page runs. Puts the second copy of the phone's data back if browser storage was emptied,
// asks the browser to keep this origin's storage, then loads the app. Everything in store.js reads
// localStorage synchronously at import, which is why the restore has to finish before that import begins.
import { restore, persist } from "./idb.js";

const back = await restore();
if (back) console.info(`hagolf: browser storage was empty; ${back} keys restored from the second copy`);
persist();
await import("./app.js");
