export interface ConversationParticipantProfile {
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
}

export interface ConversationSummary {
  id: string;
  is_group: boolean;
  name: string | null;
  created_at: string;
  /** Excludes the current/viewing user — only the other people in the conversation. */
  participants: ConversationParticipantProfile[];
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
  lastReadAt: string;
}

export interface ConversationDetail {
  id: string;
  is_group: boolean;
  name: string | null;
  created_at: string;
  /** Excludes the current/viewing user — only the other people in the conversation. */
  participants: ConversationParticipantProfile[];
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string | null;
  media_url: string | null;
  created_at: string;
}
