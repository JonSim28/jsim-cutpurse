# J_Sim Cutpurse

*Catch the cash before it's banked.* A Torn userscript for finding mug targets: travellers abroad and self-hospitalised players with open bazaars.

- `jsim-cutpurse.user.js` is the live script. Members' auto-updating loaders fetch it from
  `https://raw.githubusercontent.com/JonSim28/jsim-cutpurse/main/jsim-cutpurse.user.js`
  and pick up a new version within about 5 minutes.
- `loader.user.js` is the small loader each member installs once (Torn PDA or Tampermonkey).

To release an update: raise `@version` (and `SCRIPT_VERSION`) in `jsim-cutpurse.user.js` and push to `main`.

No API keys are kept in this repository. Each player's keys stay on their own device.
