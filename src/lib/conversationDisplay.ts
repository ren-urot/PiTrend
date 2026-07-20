interface DisplayableConversation {
  is_group: boolean;
  name: string | null;
  participants: { display_name: string; [key: string]: unknown }[];
}

export function getConversationDisplayName(conversation: DisplayableConversation): string {
  if (conversation.is_group && conversation.name) return conversation.name;

  const names = conversation.participants.map((participant) => participant.display_name);
  if (names.length === 0) return 'Conversation';
  if (names.length <= 3) return names.join(', ');
  return `${names.slice(0, 3).join(', ')} +${names.length - 3} more`;
}
