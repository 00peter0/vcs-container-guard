export interface ImageSummary {
  id: string;
  repoTags: string[];
  size: number;
  created: string;
}

export interface ImageUpdateStatus {
  id: string;
  repoTags: string[];
  localDigest: string | null;
  remoteDigest: string | null;
  available_update: boolean;
  check_failed: boolean;
}

export interface PullEvent {
  status?: string;
  progressDetail?: Record<string, number>;
  progress?: string;
  id?: string;
  error?: string;
}

export interface PullResult {
  status: 'success' | 'error';
  image: string;
  events: PullEvent[];
  error?: string;
}
