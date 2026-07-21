import { describe, it, expect } from 'vitest';
import { getConversationDisplayName, getConversationAvatarUrl } from './conversationDisplay';

// Participant fixtures carry extra fields (user_id, username) beyond what
// DisplayableConversation's participants type requires (display_name only),
// matching the shape callers actually pass (ConversationParticipantProfile).
// Assigning to a typed const first, rather than writing the literal inline
// at the call site, avoids TypeScript's excess-property check on object
// literals — this is real caller data, not a type mismatch.
const alice = { user_id: 'u1', username: 'a', display_name: 'Alice' };
const bob = { user_id: 'u2', username: 'b', display_name: 'Bob' };
const cara = { user_id: 'u3', username: 'c', display_name: 'Cara' };
const dale = { user_id: 'u4', username: 'd', display_name: 'Dale' };
const eve = { user_id: 'u5', username: 'e', display_name: 'Eve' };

describe('getConversationDisplayName', () => {
  it("returns the group's name when one is set", () => {
    const name = getConversationDisplayName({
      is_group: true,
      name: 'Weekend Hikers',
      participants: [alice],
    });
    expect(name).toBe('Weekend Hikers');
  });

  it('returns the other participant for a 1:1 conversation', () => {
    const name = getConversationDisplayName({
      is_group: false,
      name: null,
      participants: [bob],
    });
    expect(name).toBe('Bob');
  });

  it('joins up to three participant names for an unnamed group', () => {
    const name = getConversationDisplayName({
      is_group: true,
      name: null,
      participants: [alice, bob, cara],
    });
    expect(name).toBe('Alice, Bob, Cara');
  });

  it('truncates with "+N more" past three participants', () => {
    const name = getConversationDisplayName({
      is_group: true,
      name: null,
      participants: [alice, bob, cara, dale, eve],
    });
    expect(name).toBe('Alice, Bob, Cara +2 more');
  });

  it('falls back to "Conversation" when there are no other participants', () => {
    const name = getConversationDisplayName({ is_group: false, name: null, participants: [] });
    expect(name).toBe('Conversation');
  });
});

describe('getConversationAvatarUrl', () => {
  it("returns the other participant's photo for a 1:1 conversation", () => {
    const url = getConversationAvatarUrl({
      is_group: false,
      participants: [{ avatar_url: 'https://example.com/bob.jpg' }],
    });
    expect(url).toBe('https://example.com/bob.jpg');
  });

  it('returns null for a 1:1 conversation when the other participant has no photo', () => {
    const url = getConversationAvatarUrl({
      is_group: false,
      participants: [{ avatar_url: null }],
    });
    expect(url).toBeNull();
  });

  it('returns null for a group, even if a member has a photo', () => {
    const url = getConversationAvatarUrl({
      is_group: true,
      participants: [{ avatar_url: 'https://example.com/bob.jpg' }],
    });
    expect(url).toBeNull();
  });

  it('returns null when there are no other participants', () => {
    const url = getConversationAvatarUrl({ is_group: false, participants: [] });
    expect(url).toBeNull();
  });
});
