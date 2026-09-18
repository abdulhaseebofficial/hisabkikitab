// Shared by Vite, Playwright and the isolated E2E environment.
const frontendPort = Number(process.env.FRONTEND_PORT || 5173);
if (!Number.isInteger(frontendPort) || frontendPort < 1 || frontendPort > 65535) {
  throw new Error('FRONTEND_PORT must be an integer between 1 and 65535');
}
const frontendURL = `http://localhost:${frontendPort}`;
module.exports = { frontendPort, frontendURL };
