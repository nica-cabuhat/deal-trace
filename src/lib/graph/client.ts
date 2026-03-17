import { Client } from '@microsoft/microsoft-graph-client'

// Returns an authenticated Graph client using the session access token.
// Call this server-side only — never expose the access token to the client.
export function getGraphClient(accessToken: string): Client {
  return Client.init({
    authProvider: (done) => {
      done(null, accessToken)
    },
  })
}
