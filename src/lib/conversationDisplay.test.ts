import { describe, it, expect } from 'vitest';
import { getConversationDisplayName } from './conversationDisplay';

describe('getConversationDisplayName', () => {
  it("returns the group's name when one is set", () => {
    const name = getConversationDisplayName({
      is_group: true,
      name: 'Weekend Hikers',
      participants: [{ user_id: 'u1', username: 'a', display_name: 'Alice' }],
    });
    expect(name).toBe('Weekend Hikers');
  });

  it('returns the other participant for a 1:1 conversation', () => {
    const name = getConversationDisplayName({
      is_group: false,
      name: null,
      participants: [{ user_id: 'u1', username: 'bob', display_name: 'Bob' }],
    });
    expect(name).toBe('Bob');
  });

  it('joins up to three participant names for an unnamed group', () => {
    const name = getConversationDisplayName({
      is_group: true,
      name: null,
      participants: [
        { user_id: 'u1', username: 'a', display_name: 'Alice' },
        { user_id: 'u2', username: 'b', display_name: 'Bob' },
        { user_id: 'u3', username: 'c', display_name: 'Cara' },
      ],
    });
    expect(name).toBe('Alice, Bob, Cara');
  });

  it('truncates with "+N more" past three participants', () => {
    const name = getConversationDisplayName({
      is_group: true,
      name: null,
      participants: [
        { user_id: 'u1', username: 'a', display_name: 'Alice' },
        { user_id: 'u2', username: 'b', display_name: 'Bob' },
        { user_id: 'u3', username: 'c', display_name: 'Cara' },
        { user_id: 'u4', username: 'd', display_name: 'Dale' },
        { user_id: 'u5', username: 'e', display_name: 'Eve' },
      ],
    });
    expect(name).toBe('Alice, Bob, Cara +2 more');
  });

  it('falls back to "Conversation" when there are no other participants', () => {
    const name = getConversationDisplayName({ is_group: false, name: null, participants: [] });
    expect(name).toBe('Conversation');
  });
});
