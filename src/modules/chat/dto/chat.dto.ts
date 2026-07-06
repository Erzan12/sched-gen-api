export class ChatRequestDto {
  messages!: {
    role: 'user' | 'assistant' | 'system';
    content: string;
  }[];
}