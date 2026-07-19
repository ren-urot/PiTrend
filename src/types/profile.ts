export interface Profile {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  city_id: string;
  reputation_score: number;
  created_at: string;
}
