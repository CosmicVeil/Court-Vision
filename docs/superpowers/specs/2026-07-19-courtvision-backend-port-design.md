# CourtVision Backend Port Collision Fix

## Problem

CourtVision and the local Atlas project can both bind port 5000 on macOS. Requests to `127.0.0.1:5000` currently reach Atlas, which returns 404 for CourtVision endpoints such as `/api/health` and `/api/ai-predictions`. The frontend converts that failed response into the message that it cannot connect to the AI server.

## Design

CourtVision will use port 5001 as its local backend port. The Flask application, Vite development proxy, Windows startup helper, debug links, and direct frontend fallbacks will all be updated together. Production deployments can continue overriding the API origin through `VITE_API_URL`.

Frontend components should use the shared API URL builder wherever practical instead of duplicating a localhost address. Relative `/api` requests will continue to flow through the Vite proxy during development.

## Error Handling

The existing user-facing connection message remains appropriate for genuine network failures. The fix removes the known routing collision rather than hiding or weakening that error state.

## Testing

Add a regression test that verifies:

- the Flask server and Vite proxy both use port 5001;
- CourtVision runtime source files contain no remaining port-5000 backend references;
- the AI Predictions component uses the shared API endpoint configuration;
- existing backend and frontend prediction tests still pass.

Finally, start the backend and frontend, verify `/api/health` and `/api/ai-predictions`, and confirm the AI Predictions panel loads in the browser.

## Out of Scope

- Stopping or modifying the Atlas project.
- Changing production hosting configuration.
- Refactoring unrelated API or authentication behavior.
