export interface Channel {
  id: string;
  name: string;
  logo?: string;
  group: string;
  userAgent?: string;
  referer?: string;
  url: string;
}

export interface PlayerStats {
  resolution: string;
  latency: string;
  bufferLength: number;
  bandwidth: string;
}

export interface SportEvent {
  event: string;
  tournament: string;
  time: string;
  start: string;
  end: string;
  status: string;
  channels: Channel[];
}

export interface EventsResponse {
  success: boolean;
  categories: Record<string, SportEvent[]>;
}
