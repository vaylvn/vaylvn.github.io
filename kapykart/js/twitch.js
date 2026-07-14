/* global tmi */

/**
 * Anonymous, read-only tmi.js connection. The site never posts to chat,
 * so no OAuth token is needed.
 */
export function connectTwitch(channel, handlers) {
  const client = new tmi.Client({ channels: [channel] });

  client.on('message', (_channel, tags, message) => {
    handlers.onMessage({
      userId: tags['user-id'] || tags.username,
      displayName: tags['display-name'] || tags.username,
      text: message,
      isBroadcaster: !!(tags.badges && tags.badges.broadcaster),
      isMod: !!tags.mod || !!(tags.badges && tags.badges.moderator),
    });
  });

  client.on('connected', () => {
    handlers.onConnected && handlers.onConnected();
  });

  client.on('disconnected', reason => {
    handlers.onDisconnected && handlers.onDisconnected(reason);
  });

  client.connect().catch(err => {
    handlers.onError && handlers.onError(err);
  });

  return client;
}
