// History and the viral library live in Postgres (see history.js), scoped by RLS,
// so they follow the user between devices. These are just the in-memory mirror of
// what was last fetched — they start empty and are filled by loadUserData() once
// there's a signed-in user. Nothing here reads localStorage any more.
let contentCount = 0;
let contentHistory = [];
let viralLibrary = [];

function init() {
  renderHistoryViews();
  renderViralLib();
  updateOnboarding();
  initAuth();
}
