import { redirect } from 'next/navigation';

/**
 * The standalone "Atlas AI" tab is gone — the AI is ambient now: ⌘K captures
 * and asks, ⌘J chats, the daily brief lives on Home, and the API key moved to
 * Settings. Old bookmarks land Home.
 */
export default function AiPage() {
  redirect('/today');
}
