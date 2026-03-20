export interface HudlConfig {
  email: string;
  password: string;
  teamId: string;
}

export interface SessionCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'Strict' | 'Lax' | 'None';
}

export type EndpointPurpose =
  | 'team_stats'
  | 'player_stats'
  | 'game_results'
  | 'roster'
  | 'unknown';

export interface DiscoveredEndpoint {
  url: string;
  method: string;
  purpose: EndpointPurpose;
  lastSeenAt: number;
}

export interface SessionState {
  cookies: SessionCookie[];
  discoveredEndpoints: DiscoveredEndpoint[];
  capturedAt: number;
}

export interface TeamStats {
  season: string;
  wins: number;
  losses: number;
  ties: number;
  goalsFor: number;
  goalsAgainst: number;
  games: number;
  winPercentage: number;
  raw?: Record<string, unknown>;
}

export interface PlayerStats {
  playerId: string;
  name: string;
  number: string;
  position: string;
  gamesPlayed: number;
  // Offense
  goals: number;
  assists: number;
  points: number;
  shots: number;
  shotsOnTarget: number;
  shotPct: string;
  groundBalls: number;
  extraManGoals: number;
  // Face-offs
  faceoffs: number;
  faceoffWins: number;
  faceoffLosses: number;
  faceoffPct: string;
  // Turnovers
  turnovers: number;
  forcedTurnovers: number;
  unforcedTurnovers: number;
  // Caused turnovers (defense)
  causedTurnovers: number;
  // Goalie / defense
  goalsAllowed: number;
  saves: number;
  savePct: string;
  // Penalties
  penalties: number;
  raw?: Record<string, unknown>;
}

export interface GameResult {
  gameId: string;
  date: string;
  opponent: string;
  homeAway: 'home' | 'away' | 'neutral' | 'unknown';
  teamScore: number;
  opponentScore: number;
  result: 'W' | 'L' | 'T';
  raw?: Record<string, unknown>;
}

export interface RosterPlayer {
  playerId: string;
  name: string;
  number: string;
  position: string;
  grade?: string;
  raw?: Record<string, unknown>;
}
