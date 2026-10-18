// Resolves the Channel JID ("...@newsletter") to publish to. CHANNEL_ID wins;
// otherwise it is looked up once from the Channel's public invite code and cached.
const createChannelIdResolver = ({ configuredId, inviteCode, getChannelByInviteCode, logger = console }) => {
  let resolved = configuredId || null;
  return async () => {
    if (resolved) return resolved;
    if (!inviteCode) return null;
    const channel = await getChannelByInviteCode(inviteCode);
    const id = channel?.id?._serialized;
    if (!id) throw new Error('Could not resolve the Channel from CHANNEL_INVITE; check the link.');
    logger.log(`[channel] Resolved Channel invite to ${id}. Set CHANNEL_ID=${id} to skip this lookup.`);
    resolved = id;
    return resolved;
  };
};

module.exports = { createChannelIdResolver };
