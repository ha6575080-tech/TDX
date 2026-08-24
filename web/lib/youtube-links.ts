// Server-side YouTube link pool for daily tasks.
// The system picks 5 random links per user per day.
export const YOUTUBE_LINKS: string[] = [
  "https://www.youtube.com/watch?v=rKpltaOMFdc",
  "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "https://www.youtube.com/watch?v=9bZkp7q19f0",
  "https://www.youtube.com/watch?v=kJQP7kiw5Fk",
  "https://www.youtube.com/watch?v=JGwWNGJdvx8",
  "https://www.youtube.com/watch?v=CevxZvSJLk8",
  "https://www.youtube.com/watch?v=OPf0YbXqDm0",
  "https://www.youtube.com/watch?v=YQHsXMglC9A",
  "https://www.youtube.com/watch?v=60ItHLz5WEA",
  "https://www.youtube.com/watch?v=hT_nvWreIhg",
  "https://www.youtube.com/watch?v=8UVNT4wvIGY",
  "https://www.youtube.com/watch?v=09R8_2nJtjg",
];

export function pickRandomLinks(count: number): string[] {
  const shuffled = [...YOUTUBE_LINKS].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}